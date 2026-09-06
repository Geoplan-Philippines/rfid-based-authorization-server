import { env } from 'src/core/config/env.config';
import type { FaceAttemptContract, FaceAttemptPayload } from './types/face-attempt.types';

export function mapFaceAttempt(attempt: FaceAttemptPayload): FaceAttemptContract {
  const assignments = attempt.gateEvent?.truck?.driverAssignments ?? [];
  const assignedDriver = assignments[0]?.driver ?? null;
  const agreesWithAssignment = attempt.matchedDriverId === null
    ? null
    : assignments.some((assignment) => assignment.driverId === attempt.matchedDriverId);

  return {
    id: attempt.id,
    createdAt: attempt.createdAt,
    outcome: attempt.outcome,
    enforcementMode: attempt.enforcementMode,
    matchedDriver: attempt.matchedDriver,
    gateEvent: attempt.gateEvent
      ? {
        id: attempt.gateEvent.id,
        eventCode: attempt.gateEvent.eventCode,
        result: attempt.gateEvent.result,
      }
      : null,
    assignedDriver,
    agreesWithAssignment,
    similarity: attempt.similarity,
    distance: attempt.distance,
    margin: attempt.margin,
    livenessScore: attempt.livenessScore,
    isLive: attempt.livenessScore === null ? null : attempt.livenessScore >= env.FACE_MIN_LIVENESS_SCORE,
    qualityScore: attempt.qualityScore,
    framesCaptured: attempt.framesCaptured,
    framesUsable: attempt.framesUsable,
    votes: attempt.votes,
    cameraId: attempt.cameraId,
    snapshotUrl: attempt.snapshotUrl,
    latencyMs: attempt.latencyMs,
    errorCode: attempt.errorCode,
    reviewedOutcome: attempt.reviewedOutcome,
    reviewedAt: attempt.reviewedAt,
  };
}
