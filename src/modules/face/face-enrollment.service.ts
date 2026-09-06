import { HttpStatus, Injectable } from '@nestjs/common';
import { FaceAngle, FaceProfileStatus, FaceRecognitionOutcome, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

import { MAX_FACE_UPLOAD_BYTES } from 'src/common/uploads/image-upload.constants';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { env } from 'src/core/config/env.config';
import { PrismaService } from 'src/core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  DEFAULT_FACE_ANGLE_ORDER,
  FACE_ACCEPTED_MIME_TYPES,
  FACE_ANGLE_REQUIREMENTS,
  FACE_AUDIT_ACTION,
  FACE_DUPLICATE_SEARCH_LIMIT,
  FACE_ENROLLMENT_RECOMMENDED_HEIGHT,
  FACE_ENROLLMENT_RECOMMENDED_WIDTH,
  FACE_PROFILE_ENTITY_TYPE,
} from './constants/face-enrollment.constants';
import { FACE_DRIVER_SELECT, FACE_PROFILE_INCLUDE, FACE_USER_NAME_SELECT } from './constants/face-profile.constants';
import type { CaptureFaceAngleDTO } from './dto/capture-face-angle.dto';
import type { DisableFaceProfileDTO } from './dto/disable-face-profile.dto';
import type { PreviewFaceDTO } from './dto/preview-face.dto';
import type { StartFaceEnrollmentDTO } from './dto/start-face-enrollment.dto';
import { FaceApiException } from './errors/face-api.exception';
import { FaceServiceError } from './errors/face-service.error';
import { mapFaceEnrollmentProgress, mapFaceProfile } from './face.mapper';
import { FaceServiceClient } from './face-service.client';
import { FaceEmbeddingRepository } from './repositories/face-embedding.repository';
import type {
  FaceCaptureResult,
  FaceEnrollmentMetrics,
  FaceEnrollmentProgress,
  FaceEnrollmentRejection,
  FaceEnrollmentRequirements,
  FacePreviewResult,
  FaceProfileContract,
  FaceProfilePayload,
  FaceRecognitionSummary,
} from './types/face-enrollment.types';
import type { AnalyzedFace, FaceAnalyzeResponse } from './types/face-service.types';

const FACE_RECOGNITION_SUMMARY_DAYS = 30;

@Injectable()
export class FaceEnrollmentService {
  private readonly angleOrder = this.resolveAngleOrder();

  constructor(
    private readonly prisma: PrismaService,
    private readonly faceServiceClient: FaceServiceClient,
    private readonly faceEmbeddingRepository: FaceEmbeddingRepository,
    private readonly imageUploadService: ImageUploadService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  getEnrollmentRequirements(): FaceEnrollmentRequirements {
    return {
      angles: this.angleOrder.map((angle, index) => ({
        ...FACE_ANGLE_REQUIREMENTS[angle],
        order: index + 1,
      })),
      captureOrderEnforced: env.FACE_ENROLLMENT_ENFORCE_ORDER && !env.FACE_ENROLLMENT_RANDOMIZE_ORDER,
      randomizeOrder: env.FACE_ENROLLMENT_RANDOMIZE_ORDER,
      stepTimeoutMs: env.FACE_ENROLLMENT_STEP_TIMEOUT_MS,
      consentRequired: env.FACE_ENROLLMENT_CONSENT_REQUIRED,
      image: {
        maxBytes: MAX_FACE_UPLOAD_BYTES,
        acceptedMimeTypes: FACE_ACCEPTED_MIME_TYPES,
        recommendedWidth: FACE_ENROLLMENT_RECOMMENDED_WIDTH,
        recommendedHeight: FACE_ENROLLMENT_RECOMMENDED_HEIGHT,
      },
      quality: {
        minInterPupillaryDistancePx: env.FACE_ENROLLMENT_MIN_IPD_PX,
        minSharpness: env.FACE_ENROLLMENT_MIN_SHARPNESS,
        minBrightness: env.FACE_ENROLLMENT_MIN_BRIGHTNESS,
        maxBrightness: env.FACE_ENROLLMENT_MAX_BRIGHTNESS,
        maxClippedPixelRatio: env.FACE_ENROLLMENT_MAX_CLIPPED_PIXEL_RATIO,
        minLivenessScore: env.FACE_ENROLLMENT_MIN_LIVENESS_SCORE,
        minQualityScore: env.FACE_ENROLLMENT_MIN_QUALITY_SCORE,
      },
    };
  }

  async getDriverFaceProfile(driverId: string): Promise<FaceProfileContract> {
    await this.ensureDriverExists(driverId);
    return this.loadFaceProfileContract(driverId);
  }

  async startFaceEnrollment(
    driverId: string,
    body: StartFaceEnrollmentDTO,
    actorId: string,
  ): Promise<FaceProfileContract> {
    const driver = await this.ensureDriverExists(driverId);
    if (driver.isArchived) {
      throw new FaceApiException(HttpStatus.CONFLICT, 'DRIVER_ARCHIVED', 'Cannot enroll an archived driver');
    }

    const existing = await this.findFaceProfile(driverId);
    if (existing?.status === FaceProfileStatus.ACTIVE && !body.reset) {
      throw new FaceApiException(HttpStatus.CONFLICT, 'PROFILE_ALREADY_ACTIVE', 'Face profile is already active');
    }

    const hasConsent = body.consentGiven === true || existing?.consentGivenAt !== null && existing?.consentGivenAt !== undefined;
    if (env.FACE_ENROLLMENT_CONSENT_REQUIRED && !hasConsent) {
      throw new FaceApiException(HttpStatus.BAD_REQUEST, 'CONSENT_REQUIRED', 'Enrollment consent is required');
    }

    await this.prisma.$transaction(async (tx) => {
      const consentGivenAt = body.consentGiven === true ? new Date() : existing?.consentGivenAt;
      const consentReference = body.consentReference?.trim() ?? existing?.consentReference;

      if (!existing) {
        const profile = await tx.faceProfile.create({
          data: {
            driverId,
            status: FaceProfileStatus.PENDING,
            consentGivenAt,
            consentReference,
          },
        });
        await this.recordFaceProfileAuditLog(tx, actorId, FACE_AUDIT_ACTION.startEnrollment, profile.id, {
          driverId,
          consentRecorded: consentGivenAt !== null && consentGivenAt !== undefined,
        });
        return;
      }

      if (body.reset) {
        for (const angle of this.angleOrder) {
          await this.faceEmbeddingRepository.archiveByProfileAndAngle(tx, existing.id, angle);
        }
      }

      const hasCompleteCaptures = this.getProgress(existing).isComplete;
      const status = body.reset
        ? FaceProfileStatus.PENDING
        : existing.status === FaceProfileStatus.DISABLED && hasCompleteCaptures
          ? FaceProfileStatus.ACTIVE
          : FaceProfileStatus.PENDING;

      await tx.faceProfile.update({
        where: { id: existing.id },
        data: {
          status,
          consentGivenAt,
          consentReference,
          disabledAt: null,
          disabledReason: null,
          ...(body.reset ? { enrolledAt: null, enrolledById: null } : {}),
        },
      });
      await this.recordFaceProfileAuditLog(
        tx,
        actorId,
        body.reset ? FACE_AUDIT_ACTION.resetEnrollment : FACE_AUDIT_ACTION.startEnrollment,
        existing.id,
        { driverId, reset: body.reset, resultingStatus: status },
      );
    });

    return this.loadFaceProfileContract(driverId);
  }

  async captureFaceAngle(
    driverId: string,
    body: CaptureFaceAngleDTO,
    file: Express.Multer.File | undefined,
    actorId: string,
  ): Promise<FaceCaptureResult> {
    this.ensureRecognitionEnabled();
    this.ensureValidImage(file);
    await this.ensureDriverExists(driverId);

    const profile = await this.findFaceProfile(driverId);
    if (!profile) {
      throw new FaceApiException(HttpStatus.BAD_REQUEST, 'PROFILE_NOT_STARTED', 'Start face enrollment before capturing an angle');
    }
    this.ensureProfileCanBeModified(profile.status);

    const progress = this.getProgress(profile);
    const stateRejections = this.evaluateCaptureState(profile, body.angle, progress);
    if (stateRejections.length > 0) {
      return this.rejectedCapture(stateRejections, this.emptyMetrics(), progress);
    }

    const analysis = await this.analyzeEnrollmentImage(file);
    if (!analysis.face) {
      return this.rejectedCapture([this.detectionRejection(analysis.faceCount)], this.metricsFromAnalysis(analysis), progress);
    }

    const face = analysis.face;
    const metrics = this.metricsFromAnalysis(analysis);
    const rejections = this.evaluateAnalyzedFace(face, body.angle);
    if (rejections.length === 0 && face.embedding) {
      const duplicate = await this.findDuplicateEnrollment(face.embedding, profile.id);
      if (duplicate) rejections.push(duplicate);
    }
    if (rejections.length > 0) return this.rejectedCapture(rejections, metrics, progress);

    const embedding = face.embedding;
    if (!embedding) {
      throw new FaceApiException(HttpStatus.SERVICE_UNAVAILABLE, 'FACE_SERVICE_UNAVAILABLE', 'Face service did not return an embedding');
    }

    const imageUrl = await this.saveEnrollmentImage(file, driverId, body.angle);
    const embeddingId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await this.faceEmbeddingRepository.archiveByProfileAndAngle(tx, profile.id, body.angle);
      await this.faceEmbeddingRepository.insert(tx, {
        id: embeddingId,
        angle: body.angle,
        provider: env.FACE_EMBEDDING_PROVIDER,
        model: env.FACE_EMBEDDING_MODEL,
        embedding,
        imageUrl,
        qualityScore: face.quality.score,
        livenessScore: face.liveness?.score ?? null,
        yaw: face.pose.yaw,
        pitch: face.pose.pitch,
        faceProfileId: profile.id,
      });
      await tx.faceProfile.update({ where: { id: profile.id }, data: { status: FaceProfileStatus.PENDING } });
      await this.recordFaceProfileAuditLog(tx, actorId, FACE_AUDIT_ACTION.captureAngle, profile.id, {
        driverId,
        angle: body.angle,
        livenessVerified: face.liveness !== null,
      });
    });

    const updated = await this.loadFaceProfileContract(driverId);
    const capture = updated.captures.find((item) => item.id === embeddingId) ?? null;
    return {
      accepted: true,
      capture,
      rejections: [],
      metrics,
      progress: this.profileToProgress(updated),
    };
  }

  async deleteFaceCapture(driverId: string, angle: FaceAngle, actorId: string): Promise<FaceProfileContract> {
    await this.ensureDriverExists(driverId);
    const profile = await this.findFaceProfile(driverId);
    if (!profile) {
      throw new FaceApiException(HttpStatus.NOT_FOUND, 'CAPTURE_NOT_FOUND', 'Face capture not found');
    }
    if (profile.status === FaceProfileStatus.ACTIVE) {
      throw new FaceApiException(HttpStatus.CONFLICT, 'PROFILE_ACTIVE_CANNOT_MODIFY', 'Reset an active profile before changing captures');
    }

    const capture = profile.faceEmbeddings.find((embedding) => embedding.angle === angle);
    if (!capture) {
      throw new FaceApiException(HttpStatus.NOT_FOUND, 'CAPTURE_NOT_FOUND', 'Face capture not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.faceEmbeddingRepository.archiveByProfileAndAngle(tx, profile.id, angle);
      await this.recordFaceProfileAuditLog(tx, actorId, FACE_AUDIT_ACTION.deleteCapture, profile.id, {
        driverId,
        angle,
        captureId: capture.id,
      });
    });

    return this.loadFaceProfileContract(driverId);
  }

  async activateFaceProfile(driverId: string, actorId: string): Promise<FaceProfileContract> {
    await this.ensureDriverExists(driverId);
    const profile = await this.findFaceProfile(driverId);
    if (!profile) {
      throw new FaceApiException(HttpStatus.BAD_REQUEST, 'PROFILE_NOT_STARTED', 'Face profile has not been started');
    }
    if (profile.status === FaceProfileStatus.ACTIVE) {
      throw new FaceApiException(HttpStatus.CONFLICT, 'PROFILE_ALREADY_ACTIVE', 'Face profile is already active');
    }

    const progress = this.getProgress(profile);
    if (!progress.isComplete) {
      throw new FaceApiException(HttpStatus.BAD_REQUEST, 'INCOMPLETE_ENROLLMENT', 'All required angles must be captured', {
        missingAngles: progress.missingAngles,
      });
    }
    if (env.FACE_ENROLLMENT_CONSENT_REQUIRED && !profile.consentGivenAt) {
      throw new FaceApiException(HttpStatus.BAD_REQUEST, 'CONSENT_REQUIRED', 'Enrollment consent is required');
    }

    const pairwiseDistances = await this.faceEmbeddingRepository.getPairwiseDistances(profile.id, {
      provider: env.FACE_EMBEDDING_PROVIDER,
      model: env.FACE_EMBEDDING_MODEL,
    });
    const expectedPairs = this.angleOrder.length * (this.angleOrder.length - 1) / 2;
    const incoherent = pairwiseDistances.filter((pair) => pair.distance > env.FACE_ENROLLMENT_COHERENCE_THRESHOLD);
    if (pairwiseDistances.length !== expectedPairs || incoherent.length > 0) {
      throw new FaceApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'INCOHERENT_ANGLES', 'Enrollment captures do not appear to be the same person', {
        pairwiseDistances,
      });
    }

    const livenessVerified = profile.faceEmbeddings.every((capture) => capture.livenessScore !== null);
    await this.prisma.$transaction(async (tx) => {
      await tx.faceProfile.update({
        where: { id: profile.id },
        data: {
          status: FaceProfileStatus.ACTIVE,
          enrolledAt: new Date(),
          enrolledById: actorId,
          disabledAt: null,
          disabledReason: null,
        },
      });
      // The driver's photo is the enrolled FRONT capture, not a separate
      // upload. It is the same face the gate matches against, it went through
      // the same quality and liveness checks, and it is covered by the same
      // consent — so it cannot drift away from what recognition actually uses
      // the way a hand-picked file could.
      const frontCapture = profile.faceEmbeddings.find((capture) => capture.angle === FaceAngle.FRONT);
      if (frontCapture?.imageUrl) {
        await tx.driver.update({ where: { id: driverId }, data: { photoUrl: frontCapture.imageUrl } });
      }

      await this.recordFaceProfileAuditLog(tx, actorId, FACE_AUDIT_ACTION.activateProfile, profile.id, {
        driverId,
        livenessVerified,
      });
    });

    return this.loadFaceProfileContract(driverId);
  }

  async disableFaceProfile(
    driverId: string,
    body: DisableFaceProfileDTO,
    actorId: string,
  ): Promise<FaceProfileContract> {
    await this.ensureDriverExists(driverId);
    const profile = await this.findFaceProfile(driverId);
    if (!profile) {
      throw new FaceApiException(HttpStatus.BAD_REQUEST, 'PROFILE_NOT_STARTED', 'Face profile has not been started');
    }

    const reason = body.reason?.trim() ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.faceProfile.update({
        where: { id: profile.id },
        data: {
          status: FaceProfileStatus.DISABLED,
          disabledAt: new Date(),
          disabledReason: reason,
        },
      });
      await this.recordFaceProfileAuditLog(tx, actorId, FACE_AUDIT_ACTION.disableProfile, profile.id, {
        driverId,
        reason,
      });
    });

    return this.loadFaceProfileContract(driverId);
  }

  async previewFace(file: Express.Multer.File | undefined, body: PreviewFaceDTO): Promise<FacePreviewResult> {
    this.ensureRecognitionEnabled();
    this.ensureValidImage(file);
    const frameSize = await this.readFrameSize(file);
    const analysis = await this.analyzePreviewImage(file);
    const metrics = this.metricsFromAnalysis(analysis);

    if (!analysis.face) {
      return {
        faceDetected: false,
        faceCount: analysis.faceCount,
        wouldBeAccepted: false,
        rejections: [this.detectionRejection(analysis.faceCount)],
        metrics,
        boundingBox: null,
        frameSize,
      };
    }

    const rejections = this.evaluateAnalyzedFace(analysis.face, body.angle);
    return {
      faceDetected: true,
      faceCount: analysis.faceCount,
      wouldBeAccepted: rejections.length === 0,
      rejections,
      metrics,
      boundingBox: analysis.face.boundingBox,
      frameSize,
    };
  }

  /**
   * Applies EXIF orientation before analysis. Camera captures arrive from a canvas with no EXIF,
   * but uploaded phone photos carry an orientation tag, and the stored copy is rotated by
   * `saveFaceImage` while the raw buffer is not. Sending the raw buffer would have the face
   * service analyse a sideways image whose stored thumbnail looks upright — either a baffling
   * NO_FACE_DETECTED on a photo that plainly contains a face, or a correctly-detected face with
   * landmarks and pose computed in a rotated frame, which stores a corrupted embedding silently.
   */
  private async normalizeOrientation(file: Express.Multer.File): Promise<Buffer> {
    try {
      return await sharp(file.buffer).rotate().toBuffer();
    } catch {
      return file.buffer;
    }
  }

  private async analyzeEnrollmentImage(file: Express.Multer.File): Promise<FaceAnalyzeResponse> {
    try {
      return await this.faceServiceClient.analyze({
        buffer: await this.normalizeOrientation(file),
        mimeType: file.mimetype,
        fileName: file.originalname,
      }, {
        includeEmbedding: true,
        rejectMultiple: true,
        antiSpoofing: env.FACE_LIVENESS_ENABLED,
        returnAlignedCrop: false,
      });
    } catch (error) {
      return this.handleAnalyzeError(error);
    }
  }

  private async analyzePreviewImage(file: Express.Multer.File): Promise<FaceAnalyzeResponse> {
    try {
      return await this.faceServiceClient.analyze({
        buffer: await this.normalizeOrientation(file),
        mimeType: file.mimetype,
        fileName: file.originalname,
      }, {
        includeEmbedding: false,
        rejectMultiple: true,
        antiSpoofing: env.FACE_LIVENESS_ENABLED,
        returnAlignedCrop: false,
      });
    } catch (error) {
      return this.handleAnalyzeError(error);
    }
  }

  private handleAnalyzeError(error: unknown): FaceAnalyzeResponse {
    if (error instanceof FaceServiceError && ['NO_FACE_DETECTED', 'MULTIPLE_FACES'].includes(error.code)) {
      const faceCount = this.readFaceCount(error.details, error.code === 'MULTIPLE_FACES' ? 2 : 0);
      return {
        requestId: error.requestId ?? '',
        faceCount,
        face: null,
        timings: { detectMs: 0, livenessMs: 0, embedMs: 0, totalMs: 0 },
      };
    }

    if (error instanceof FaceServiceError) {
      if (error.code === 'INVALID_IMAGE' || error.code === 'INVALID_REQUEST') {
        throw new FaceApiException(HttpStatus.BAD_REQUEST, 'INVALID_IMAGE', 'Uploaded file is not a valid image');
      }
      if (error.code === 'IMAGE_TOO_LARGE') {
        throw new FaceApiException(HttpStatus.PAYLOAD_TOO_LARGE, 'IMAGE_TOO_LARGE', 'Uploaded image exceeds the configured size limit');
      }
      if (error.code === 'UNSUPPORTED_MEDIA_TYPE') {
        throw new FaceApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, and WebP images are supported');
      }
    }

    throw new FaceApiException(HttpStatus.SERVICE_UNAVAILABLE, 'FACE_SERVICE_UNAVAILABLE', 'Face recognition service is unavailable');
  }

  private evaluateCaptureState(
    profile: FaceProfilePayload,
    requestedAngle: FaceAngle,
    progress: FaceEnrollmentProgress,
  ): FaceEnrollmentRejection[] {
    const alreadyCaptured = progress.capturedAngles.includes(requestedAngle);
    if (env.FACE_ENROLLMENT_ENFORCE_ORDER
      && !env.FACE_ENROLLMENT_RANDOMIZE_ORDER
      && !alreadyCaptured
      && requestedAngle !== progress.nextAngle) {
      return [{
        code: 'OUT_OF_ORDER',
        message: `Capture the ${progress.nextAngle ?? 'required'} angle first.`,
        hint: `Continue with ${progress.nextAngle ?? 'the next required angle'}.`,
        expected: { nextAngle: progress.nextAngle ?? 'NONE' },
        actual: { requestedAngle },
      }];
    }

    const latestCaptureAt = profile.faceEmbeddings.reduce<Date | null>(
      (latest, capture) => !latest || capture.createdAt > latest ? capture.createdAt : latest,
      null,
    );
    const stepTimedOut = !alreadyCaptured
      && !progress.isComplete
      && latestCaptureAt !== null
      && Date.now() - latestCaptureAt.getTime() > env.FACE_ENROLLMENT_STEP_TIMEOUT_MS;

    return stepTimedOut
      ? [{
        code: 'STEP_TIMEOUT',
        message: 'The enrollment session timed out.',
        hint: 'Restart the enrollment session and capture all angles again.',
        expected: { maxElapsedMs: env.FACE_ENROLLMENT_STEP_TIMEOUT_MS },
        actual: { elapsedMs: Date.now() - latestCaptureAt.getTime() },
      }]
      : [];
  }

  private evaluateAnalyzedFace(face: AnalyzedFace, angle?: FaceAngle): FaceEnrollmentRejection[] {
    const rejections: FaceEnrollmentRejection[] = [];

    if (face.interPupillaryDistancePx < env.FACE_ENROLLMENT_MIN_IPD_PX) {
      rejections.push({
        code: 'FACE_TOO_SMALL',
        message: 'The face is too small in the image.',
        hint: 'Move closer to the camera.',
        expected: { minInterPupillaryDistancePx: env.FACE_ENROLLMENT_MIN_IPD_PX },
        actual: { interPupillaryDistancePx: face.interPupillaryDistancePx },
      });
    }
    if (face.quality.sharpness < env.FACE_ENROLLMENT_MIN_SHARPNESS) {
      rejections.push({
        code: 'IMAGE_BLURRY',
        message: 'The image is too blurry.',
        hint: 'Hold still and make sure the camera is in focus.',
        expected: { minSharpness: env.FACE_ENROLLMENT_MIN_SHARPNESS },
        actual: { sharpness: face.quality.sharpness },
      });
    }

    const poorLighting = face.quality.brightness < env.FACE_ENROLLMENT_MIN_BRIGHTNESS
      || face.quality.brightness > env.FACE_ENROLLMENT_MAX_BRIGHTNESS
      || face.quality.clippedPixelRatio > env.FACE_ENROLLMENT_MAX_CLIPPED_PIXEL_RATIO;
    if (poorLighting) {
      rejections.push({
        code: 'POOR_LIGHTING',
        message: 'The lighting is too dark, too bright, or clipped.',
        hint: 'Move to even lighting and keep strong light sources out of the frame.',
        expected: {
          minBrightness: env.FACE_ENROLLMENT_MIN_BRIGHTNESS,
          maxBrightness: env.FACE_ENROLLMENT_MAX_BRIGHTNESS,
          maxClippedPixelRatio: env.FACE_ENROLLMENT_MAX_CLIPPED_PIXEL_RATIO,
        },
        actual: {
          brightness: face.quality.brightness,
          clippedPixelRatio: face.quality.clippedPixelRatio,
        },
      });
    }
    if (angle && !this.poseMatchesAngle(face, angle)) {
      const requirement = FACE_ANGLE_REQUIREMENTS[angle];
      rejections.push({
        code: 'WRONG_POSE',
        message: `Head pose does not match the ${angle} capture.`,
        hint: requirement.instruction,
        expected: {
          yawMin: requirement.yawRange.min,
          yawMax: requirement.yawRange.max,
          pitchMin: requirement.pitchRange.min,
          pitchMax: requirement.pitchRange.max,
        },
        actual: { yaw: face.pose.yaw, pitch: face.pose.pitch },
      });
    }
    if (face.quality.occluded) {
      rejections.push({
        code: 'FACE_OCCLUDED',
        message: 'The face appears to be occluded.',
        hint: 'Remove sunglasses, mask, or cap and keep hair away from the eyes.',
        actual: { occluded: true },
      });
    }
    if (face.liveness && (!face.liveness.isReal || face.liveness.score < env.FACE_ENROLLMENT_MIN_LIVENESS_SCORE)) {
      rejections.push({
        code: 'SPOOF_SUSPECTED',
        message: 'The liveness check did not pass.',
        hint: 'Face the camera directly and do not use a photo or screen.',
        expected: { minLivenessScore: env.FACE_ENROLLMENT_MIN_LIVENESS_SCORE },
        actual: { isReal: face.liveness.isReal, livenessScore: face.liveness.score },
      });
    }
    if (face.quality.score < env.FACE_ENROLLMENT_MIN_QUALITY_SCORE) {
      rejections.push({
        code: 'LOW_QUALITY',
        message: 'The overall image quality is too low.',
        hint: 'Improve lighting, focus, and face position, then try again.',
        expected: { minQualityScore: env.FACE_ENROLLMENT_MIN_QUALITY_SCORE },
        actual: { qualityScore: face.quality.score },
      });
    }

    return rejections;
  }

  private async findDuplicateEnrollment(
    embedding: number[],
    profileId: string,
  ): Promise<FaceEnrollmentRejection | null> {
    const [match] = await this.faceEmbeddingRepository.searchNearestExcludingProfile(embedding, profileId, {
      provider: env.FACE_EMBEDDING_PROVIDER,
      model: env.FACE_EMBEDDING_MODEL,
      limit: FACE_DUPLICATE_SEARCH_LIMIT,
    });
    if (!match || match.distance >= env.FACE_ENROLLMENT_DUPLICATE_THRESHOLD) return null;

    const driver = await this.prisma.driver.findUnique({ where: { id: match.driverId }, select: FACE_DRIVER_SELECT });
    if (!driver) return null;

    return {
      code: 'ALREADY_ENROLLED_AS_OTHER_DRIVER',
      message: `This face is already enrolled as ${driver.firstName} ${driver.lastName}.`,
      hint: 'Confirm the selected driver record before continuing.',
      expected: { minDistance: env.FACE_ENROLLMENT_DUPLICATE_THRESHOLD },
      actual: { distance: match.distance },
      conflictingDriver: {
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
      },
    };
  }

  private async loadFaceProfileContract(driverId: string): Promise<FaceProfileContract> {
    const profile = await this.findFaceProfile(driverId);
    if (!profile) {
      return mapFaceProfile({
        driverId,
        profile: null,
        angleOrder: this.angleOrder,
        enrolledBy: null,
        recognition: null,
      });
    }

    const [enrolledBy, recognition] = await Promise.all([
      profile.enrolledById
        ? this.prisma.user.findUnique({ where: { id: profile.enrolledById }, select: FACE_USER_NAME_SELECT })
        : Promise.resolve(null),
      this.getRecognitionSummary(driverId),
    ]);

    return mapFaceProfile({
      driverId,
      profile,
      angleOrder: this.angleOrder,
      enrolledBy,
      recognition,
    });
  }

  private async getRecognitionSummary(driverId: string): Promise<FaceRecognitionSummary> {
    const since = new Date(Date.now() - FACE_RECOGNITION_SUMMARY_DAYS * 24 * 60 * 60 * 1000);
    const where = { matchedDriverId: driverId, createdAt: { gte: since } } satisfies Prisma.FaceRecognitionAttemptWhereInput;
    const [attempts30d, matches30d, latest] = await Promise.all([
      this.prisma.faceRecognitionAttempt.count({ where }),
      this.prisma.faceRecognitionAttempt.count({ where: { ...where, outcome: FaceRecognitionOutcome.MATCHED } }),
      this.prisma.faceRecognitionAttempt.findFirst({
        where: { matchedDriverId: driverId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, outcome: true },
      }),
    ]);

    return {
      attempts30d,
      matches30d,
      matchRate30d: attempts30d === 0 ? 0 : matches30d / attempts30d,
      lastAttemptAt: latest?.createdAt ?? null,
      lastOutcome: latest?.outcome ?? null,
    };
  }

  private async findFaceProfile(driverId: string): Promise<FaceProfilePayload | null> {
    return this.prisma.faceProfile.findUnique({
      where: { driverId },
      include: FACE_PROFILE_INCLUDE,
    });
  }

  private async ensureDriverExists(driverId: string): Promise<Prisma.DriverGetPayload<{ select: typeof FACE_DRIVER_SELECT }>> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: FACE_DRIVER_SELECT });
    if (!driver) throw new FaceApiException(HttpStatus.NOT_FOUND, 'DRIVER_NOT_FOUND', 'Driver not found');
    return driver;
  }

  private ensureProfileCanBeModified(status: FaceProfileStatus): void {
    if (status === FaceProfileStatus.DISABLED) {
      throw new FaceApiException(HttpStatus.CONFLICT, 'PROFILE_DISABLED', 'Start enrollment again before capturing a disabled profile');
    }
    if (status === FaceProfileStatus.ACTIVE) {
      throw new FaceApiException(HttpStatus.CONFLICT, 'PROFILE_ACTIVE_CANNOT_MODIFY', 'Reset an active profile before changing captures');
    }
  }

  private ensureRecognitionEnabled(): void {
    if (!env.FACE_RECOGNITION_ENABLED) {
      throw new FaceApiException(HttpStatus.CONFLICT, 'FACE_RECOGNITION_DISABLED', 'Face recognition is disabled');
    }
  }

  private ensureValidImage(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
    if (!file || file.buffer.length === 0) {
      throw new FaceApiException(HttpStatus.BAD_REQUEST, 'INVALID_IMAGE', 'An image file is required');
    }
    if (file.buffer.length > MAX_FACE_UPLOAD_BYTES) {
      throw new FaceApiException(HttpStatus.PAYLOAD_TOO_LARGE, 'IMAGE_TOO_LARGE', 'Uploaded image exceeds the configured size limit');
    }
    if (!FACE_ACCEPTED_MIME_TYPES.includes(file.mimetype as (typeof FACE_ACCEPTED_MIME_TYPES)[number])) {
      throw new FaceApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, and WebP images are supported');
    }
  }

  private async saveEnrollmentImage(file: Express.Multer.File, driverId: string, angle: FaceAngle): Promise<string> {
    try {
      return await this.imageUploadService.saveFaceImage(file, { kind: 'enrollment', driverId, angle });
    } catch {
      throw new FaceApiException(HttpStatus.BAD_REQUEST, 'INVALID_IMAGE', 'Uploaded file is not a valid image');
    }
  }

  private async readFrameSize(file: Express.Multer.File): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(file.buffer).metadata();
      if (!metadata.width || !metadata.height) throw new Error('Image dimensions unavailable');
      return { width: metadata.width, height: metadata.height };
    } catch {
      throw new FaceApiException(HttpStatus.BAD_REQUEST, 'INVALID_IMAGE', 'Uploaded file is not a valid image');
    }
  }

  private metricsFromAnalysis(analysis: FaceAnalyzeResponse): FaceEnrollmentMetrics {
    return analysis.face
      ? {
        interPupillaryDistancePx: analysis.face.interPupillaryDistancePx,
        sharpness: analysis.face.quality.sharpness,
        brightness: analysis.face.quality.brightness,
        faceCount: analysis.faceCount,
        pose: analysis.face.pose,
        liveness: analysis.face.liveness,
      }
      : { ...this.emptyMetrics(), faceCount: analysis.faceCount };
  }

  private emptyMetrics(): FaceEnrollmentMetrics {
    return {
      interPupillaryDistancePx: null,
      sharpness: null,
      brightness: null,
      faceCount: 0,
      pose: null,
      liveness: null,
    };
  }

  private rejectedCapture(
    rejections: FaceEnrollmentRejection[],
    metrics: FaceEnrollmentMetrics,
    progress: FaceEnrollmentProgress,
  ): FaceCaptureResult {
    return { accepted: false, capture: null, rejections, metrics, progress };
  }

  private detectionRejection(faceCount: number): FaceEnrollmentRejection {
    if (faceCount > 1) {
      return {
        code: 'MULTIPLE_FACES',
        message: 'More than one face was detected in the image.',
        hint: 'Only the driver should be visible in the frame.',
        expected: { faceCount: 1 },
        actual: { faceCount },
      };
    }

    return {
      code: 'NO_FACE_DETECTED',
      message: 'No face was detected in the image.',
      hint: 'Move into the frame and look toward the camera.',
    };
  }

  private poseMatchesAngle(face: AnalyzedFace, angle: FaceAngle): boolean {
    const requirement = FACE_ANGLE_REQUIREMENTS[angle];
    return face.pose.yaw >= requirement.yawRange.min
      && face.pose.yaw <= requirement.yawRange.max
      && face.pose.pitch >= requirement.pitchRange.min
      && face.pose.pitch <= requirement.pitchRange.max;
  }

  private getProgress(profile: FaceProfilePayload): FaceEnrollmentProgress {
    return mapFaceEnrollmentProgress(
      profile.faceEmbeddings.map((capture) => capture.angle),
      this.angleOrder,
      profile.status,
    );
  }

  private profileToProgress(profile: FaceProfileContract): FaceEnrollmentProgress {
    return {
      capturedAngles: profile.capturedAngles,
      missingAngles: profile.missingAngles,
      nextAngle: profile.nextAngle,
      isComplete: profile.isComplete,
      canActivate: profile.canActivate,
    };
  }

  private readFaceCount(details: unknown, fallback: number): number {
    if (typeof details !== 'object' || details === null || !('faceCount' in details)) return fallback;
    const faceCount = (details as { faceCount?: unknown }).faceCount;
    return typeof faceCount === 'number' ? faceCount : fallback;
  }

  private resolveAngleOrder(): FaceAngle[] {
    const configured = env.FACE_ENROLLMENT_ANGLES.filter(
      (value): value is FaceAngle => DEFAULT_FACE_ANGLE_ORDER.includes(value as FaceAngle),
    );
    return configured.length === DEFAULT_FACE_ANGLE_ORDER.length ? configured : DEFAULT_FACE_ANGLE_ORDER;
  }

  private async recordFaceProfileAuditLog(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    profileId: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.auditLogsService.recordAuditLog({
      actorId,
      action,
      entityType: FACE_PROFILE_ENTITY_TYPE,
      entityId: profileId,
      metadata,
    }, tx);
  }
}
