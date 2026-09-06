import { Injectable, Logger } from '@nestjs/common';
import { FaceEnforcementMode, FaceRecognitionOutcome } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { env } from 'src/core/config/env.config';
import { PrismaService } from 'src/core/database/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { FaceServiceError } from './errors/face-service.error';
import { FaceMatchingService } from './face-matching.service';
import { FaceServiceClient } from './face-service.client';
import type { FaceFrameMatchDecision } from './types/face-matching.types';
import type { FaceCaptureFrame, FaceCaptureResponse } from './types/face-service.types';

interface GateFaceDecision {
  outcome: FaceRecognitionOutcome;
  matchedDriverId: string | null;
  distance: number | null;
  similarity: number | null;
  margin: number | null;
  livenessScore: number | null;
  qualityScore: number | null;
  framesCaptured: number;
  framesUsable: number;
  votes: number;
  errorCode: string | null;
}

@Injectable()
export class FaceGateService {
  private readonly logger = new Logger(FaceGateService.name);
  private readonly activeGateEvents = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly faceServiceClient: FaceServiceClient,
    private readonly faceMatchingService: FaceMatchingService,
    private readonly imageUploadService: ImageUploadService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async armCapture(gateEventId: string): Promise<void> {
    if (!env.FACE_RECOGNITION_ENABLED || env.FACE_ENFORCEMENT_MODE === FaceEnforcementMode.OFF) return;
    if (this.activeGateEvents.has(gateEventId)) return;

    this.activeGateEvents.add(gateEventId);
    try {
      await this.runCapture(gateEventId);
    } catch (error) {
      const errorCode = error instanceof FaceServiceError ? error.code : 'FACE_GATE_ERROR';
      this.logger.error(`Face gate capture failed for ${gateEventId}: ${errorCode}`);
      await this.recordServiceFailure(gateEventId, errorCode);
    } finally {
      this.activeGateEvents.delete(gateEventId);
    }
  }

  private async runCapture(gateEventId: string): Promise<void> {
    const startedAt = performance.now();
    const opened = await this.faceServiceClient.openCapture({
      cameraId: env.FACE_GATE_CAMERA_ID,
      requiredFrames: env.FACE_GATE_FRAME_COUNT,
      timeoutMs: env.FACE_GATE_CAPTURE_TIMEOUT_MS,
      lookbackMs: env.FACE_GATE_LOOKBACK_MS,
      minQualityScore: env.FACE_MIN_QUALITY_SCORE,
      antiSpoofing: env.FACE_LIVENESS_ENABLED,
      returnCrops: true,
      sampleFps: env.FACE_GATE_SAMPLE_FPS,
    });
    const capture = await this.pollCapture(opened.captureId);
    const decision = await this.decideCapture(capture);
    const attemptId = randomUUID();
    const snapshotUrl = await this.saveAttemptSnapshot(attemptId, capture.frames?.[0] ?? null);
    const latencyMs = Math.round(performance.now() - startedAt);

    await this.prisma.faceRecognitionAttempt.create({
      data: {
        id: attemptId,
        outcome: decision.outcome,
        enforcementMode: env.FACE_ENFORCEMENT_MODE,
        cameraId: env.FACE_GATE_CAMERA_ID,
        distance: decision.distance,
        similarity: decision.similarity,
        margin: decision.margin,
        livenessScore: decision.livenessScore,
        qualityScore: decision.qualityScore,
        framesCaptured: decision.framesCaptured,
        framesUsable: decision.framesUsable,
        votes: decision.votes,
        snapshotUrl,
        latencyMs,
        errorCode: decision.errorCode,
        matchedDriverId: decision.matchedDriverId,
        gateEventId,
      },
    });

    await this.completeTransactionStage(gateEventId, attemptId, decision, snapshotUrl);
  }

  private async pollCapture(captureId: string): Promise<FaceCaptureResponse> {
    const deadline = Date.now() + env.FACE_GATE_CAPTURE_TIMEOUT_MS;
    let latest: FaceCaptureResponse | null = null;

    while (Date.now() <= deadline) {
      latest = await this.faceServiceClient.getCapture(captureId);
      if (latest.status !== 'PENDING') return latest;
      await this.waitForNextPoll();
    }

    if (!latest) {
      throw new FaceServiceError({
        code: 'FACE_SERVICE_TIMEOUT',
        message: 'Face capture polling timed out before the first response',
      });
    }
    return { ...latest, status: 'TIMEOUT' };
  }

  private async decideCapture(capture: FaceCaptureResponse): Promise<GateFaceDecision> {
    if (capture.status === 'FAILED') {
      return this.emptyDecision(capture, FaceRecognitionOutcome.SERVICE_ERROR, 'CAPTURE_FAILED');
    }

    const frames = capture.frames ?? [];
    const livenessUnavailableFrames = frames.filter((frame) => frame.face.liveness === null).length;
    const spoofFrames = frames.filter((frame) => this.isSpoof(frame)).length;
    const qualityRejectedFrames = frames.filter((frame) => frame.face.quality.score < env.FACE_MIN_QUALITY_SCORE).length;
    const usableFrames = frames.filter((frame) => this.isUsable(frame));

    if (usableFrames.length < env.FACE_GATE_MIN_VOTES && livenessUnavailableFrames > 0 && env.FACE_LIVENESS_ENABLED) {
      return this.emptyDecision(capture, FaceRecognitionOutcome.SERVICE_ERROR, 'LIVENESS_UNAVAILABLE', {
        framesUsable: usableFrames.length,
        livenessScore: this.average(frames.flatMap((frame) => frame.face.liveness?.score ?? [])),
        qualityScore: this.average(frames.map((frame) => frame.face.quality.score)),
      });
    }
    if (usableFrames.length === 0 && spoofFrames >= env.FACE_GATE_MIN_VOTES) {
      return this.emptyDecision(capture, FaceRecognitionOutcome.SPOOF_DETECTED, null, {
        livenessScore: this.average(frames.flatMap((frame) => frame.face.liveness?.score ?? [])),
        qualityScore: this.average(frames.map((frame) => frame.face.quality.score)),
      });
    }
    if (usableFrames.length === 0) {
      const outcome = capture.framesWithFace === 0
        ? FaceRecognitionOutcome.NO_FACE_DETECTED
        : qualityRejectedFrames > 0
          ? FaceRecognitionOutcome.POOR_QUALITY
          : FaceRecognitionOutcome.NO_FACE_DETECTED;
      return this.emptyDecision(capture, outcome, null, {
        qualityScore: this.average(frames.map((frame) => frame.face.quality.score)),
      });
    }

    const frameDecisions = await Promise.all(usableFrames.map((frame) =>
      this.faceMatchingService.matchEmbedding(frame.face.embedding ?? [])));
    const vote = this.faceMatchingService.vote(frameDecisions);
    const livenessScore = this.average(usableFrames.flatMap((frame) => frame.face.liveness?.score ?? []));
    const qualityScore = this.average(usableFrames.map((frame) => frame.face.quality.score));

    if (vote.outcome === 'MATCHED' && vote.matchedDriverId) {
      const winningFrames = frameDecisions.filter((frame) => frame.matchedDriverId === vote.matchedDriverId);
      return {
        outcome: FaceRecognitionOutcome.MATCHED,
        matchedDriverId: vote.matchedDriverId,
        distance: vote.meanDistance,
        similarity: vote.similarity,
        margin: this.average(winningFrames.flatMap((frame) => frame.margin ?? [])),
        livenessScore,
        qualityScore,
        framesCaptured: capture.framesAccepted,
        framesUsable: usableFrames.length,
        votes: vote.votes,
        errorCode: null,
      };
    }

    const closest = this.closestDecision(frameDecisions);
    const hasAmbiguousFrame = frameDecisions.some((frame) => frame.outcome === 'AMBIGUOUS');
    const outcome = vote.outcome === 'AMBIGUOUS' || hasAmbiguousFrame
      ? FaceRecognitionOutcome.AMBIGUOUS
      : closest?.distance !== null
        && closest?.distance !== undefined
        && closest.distance <= env.FACE_MATCH_THRESHOLD + env.FACE_LOW_CONFIDENCE_BAND
        ? FaceRecognitionOutcome.LOW_CONFIDENCE
        : FaceRecognitionOutcome.NO_MATCH;

    return {
      outcome,
      matchedDriverId: null,
      distance: closest?.distance ?? null,
      similarity: closest?.similarity ?? null,
      margin: closest?.margin ?? null,
      livenessScore,
      qualityScore,
      framesCaptured: capture.framesAccepted,
      framesUsable: usableFrames.length,
      votes: vote.votes,
      errorCode: null,
    };
  }

  private async recordServiceFailure(gateEventId: string, errorCode: string): Promise<void> {
    const attemptId = randomUUID();
    try {
      await this.prisma.faceRecognitionAttempt.create({
        data: {
          id: attemptId,
          outcome: FaceRecognitionOutcome.SERVICE_ERROR,
          enforcementMode: env.FACE_ENFORCEMENT_MODE,
          cameraId: env.FACE_GATE_CAMERA_ID,
          framesCaptured: 0,
          framesUsable: 0,
          votes: 0,
          errorCode,
          gateEventId,
        },
      });
    } catch (error) {
      this.logger.error(`Could not persist face service failure for ${gateEventId}`, error instanceof Error ? error.stack : String(error));
    }

    try {
      await this.transactionsService.completeFaceStageForEvent(gateEventId, {
        attemptId,
        outcome: FaceRecognitionOutcome.SERVICE_ERROR,
      });
    } catch (error) {
      this.logger.error(`Could not complete transaction ${gateEventId} after face failure`, error instanceof Error ? error.stack : String(error));
    }
  }

  private async completeTransactionStage(
    gateEventId: string,
    attemptId: string,
    decision: GateFaceDecision,
    snapshotUrl: string | null,
  ): Promise<void> {
    if (env.FACE_ENFORCEMENT_MODE === FaceEnforcementMode.ACTIVE
      && decision.outcome !== FaceRecognitionOutcome.SERVICE_ERROR) {
      await this.transactionsService.recordFaceReadForEvent(gateEventId, {
        attemptId,
        ...(decision.matchedDriverId ? { driverId: decision.matchedDriverId } : {}),
        ...(decision.similarity !== null ? { faceConfidence: decision.similarity } : {}),
        ...(snapshotUrl ? { snapshotUrl } : {}),
      });
      return;
    }

    await this.transactionsService.completeFaceStageForEvent(gateEventId, {
      attemptId,
      outcome: decision.outcome,
      ...(snapshotUrl ? { snapshotUrl } : {}),
    });
  }

  private emptyDecision(
    capture: FaceCaptureResponse,
    outcome: FaceRecognitionOutcome,
    errorCode: string | null,
    values: Partial<Pick<GateFaceDecision, 'framesUsable' | 'livenessScore' | 'qualityScore'>> = {},
  ): GateFaceDecision {
    return {
      outcome,
      matchedDriverId: null,
      distance: null,
      similarity: null,
      margin: null,
      livenessScore: values.livenessScore ?? null,
      qualityScore: values.qualityScore ?? null,
      framesCaptured: capture.framesAccepted,
      framesUsable: values.framesUsable ?? 0,
      votes: 0,
      errorCode,
    };
  }

  private isSpoof(frame: FaceCaptureFrame): boolean {
    return frame.face.liveness !== null
      && (!frame.face.liveness.isReal || frame.face.liveness.score < env.FACE_MIN_LIVENESS_SCORE);
  }

  private isUsable(frame: FaceCaptureFrame): boolean {
    if (frame.face.quality.score < env.FACE_MIN_QUALITY_SCORE) return false;
    if (!env.FACE_LIVENESS_ENABLED) return true;
    return frame.face.liveness !== null
      && frame.face.liveness.isReal
      && frame.face.liveness.score >= env.FACE_MIN_LIVENESS_SCORE;
  }

  private closestDecision(decisions: FaceFrameMatchDecision[]): FaceFrameMatchDecision | null {
    return decisions
      .filter((decision) => decision.distance !== null)
      .sort((left, right) => (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY))[0]
      ?? null;
  }

  private async saveAttemptSnapshot(attemptId: string, frame: FaceCaptureFrame | null): Promise<string | null> {
    // Prefer the head-and-shoulders crop. `cropBase64` is the 112x112 aligned
    // model input — it answers the embedder's question, not the reviewer's, and
    // it is what made stored attempts unreadable. Falling back to it keeps this
    // working against a face service that predates snapshotBase64.
    const image = frame?.snapshotBase64 ?? frame?.cropBase64;
    if (!image) return null;
    const parsed = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(image);
    if (!parsed) return null;

    const mimeType = parsed[1];
    const buffer = Buffer.from(parsed[2], 'base64');
    if (buffer.length === 0) return null;

    return this.imageUploadService.saveFaceImage({
      buffer,
      mimetype: mimeType,
      originalname: `${attemptId}.${mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'}`,
    } as Express.Multer.File, { kind: 'attempt', attemptId });
  }

  private average(values: number[]): number | null {
    return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private waitForNextPoll(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, env.FACE_GATE_POLL_INTERVAL_MS));
  }
}
