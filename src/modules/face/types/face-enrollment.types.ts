import type { FaceAngle, FaceProfileStatus, FaceRecognitionOutcome, Prisma } from '@prisma/client';

import type { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import type { FACE_PROFILE_INCLUDE } from '../constants/face-profile.constants';
import type { FaceAngleRequirement } from '../constants/face-enrollment.constants';
import type { FaceBoundingBox, FaceLiveness, FacePose } from './face-service.types';

export type FaceProfilePayload = Prisma.FaceProfileGetPayload<{ include: typeof FACE_PROFILE_INCLUDE }>;

export type FaceEnrollmentRejectionCode =
  | 'NO_FACE_DETECTED'
  | 'MULTIPLE_FACES'
  | 'FACE_TOO_SMALL'
  | 'IMAGE_BLURRY'
  | 'POOR_LIGHTING'
  | 'WRONG_POSE'
  | 'FACE_OCCLUDED'
  | 'SPOOF_SUSPECTED'
  | 'LOW_QUALITY'
  | 'ALREADY_ENROLLED_AS_OTHER_DRIVER'
  | 'OUT_OF_ORDER'
  | 'STEP_TIMEOUT';

export interface FaceEnrollmentRejection {
  code: FaceEnrollmentRejectionCode;
  message: string;
  hint: string;
  expected?: Record<string, number | string>;
  actual?: Record<string, number | string | boolean | null>;
  conflictingDriver?: { id: string; firstName: string; lastName: string };
}

export interface FaceEnrollmentMetrics {
  interPupillaryDistancePx: number | null;
  sharpness: number | null;
  brightness: number | null;
  faceCount: number;
  pose: FacePose | null;
  liveness: FaceLiveness | null;
}

export interface FaceEnrollmentProgress {
  capturedAngles: FaceAngle[];
  missingAngles: FaceAngle[];
  nextAngle: FaceAngle | null;
  isComplete: boolean;
  canActivate: boolean;
}

export interface FaceCaptureContract {
  id: string;
  angle: FaceAngle;
  imageUrl: string;
  qualityScore: number | null;
  livenessScore: number | null;
  yaw: number | null;
  pitch: number | null;
  capturedAt: Date;
}

export interface FaceRecognitionSummary {
  attempts30d: number;
  matches30d: number;
  matchRate30d: number;
  lastAttemptAt: Date | null;
  lastOutcome: FaceRecognitionOutcome | null;
}

export interface FaceProfileContract extends FaceEnrollmentProgress {
  id: string | null;
  driverId: string;
  status: FaceProfileStatus | null;
  consentGivenAt: Date | null;
  consentReference: string | null;
  enrolledAt: Date | null;
  enrolledBy: { id: string; firstName: string | null; lastName: string | null } | null;
  disabledAt: Date | null;
  disabledReason: string | null;
  captures: FaceCaptureContract[];
  recognition: FaceRecognitionSummary | null;
  livenessVerified: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface FaceCaptureResult {
  accepted: boolean;
  capture: FaceCaptureContract | null;
  rejections: FaceEnrollmentRejection[];
  metrics: FaceEnrollmentMetrics;
  progress: FaceEnrollmentProgress;
}

export interface FacePreviewResult {
  faceDetected: boolean;
  faceCount: number;
  wouldBeAccepted: boolean;
  rejections: FaceEnrollmentRejection[];
  metrics: FaceEnrollmentMetrics;
  boundingBox: FaceBoundingBox | null;
  frameSize: { width: number; height: number } | null;
}

export interface FaceEnrollmentRequirements {
  angles: FaceAngleRequirement[];
  captureOrderEnforced: boolean;
  randomizeOrder: boolean;
  stepTimeoutMs: number;
  consentRequired: boolean;
  image: {
    maxBytes: number;
    acceptedMimeTypes: readonly string[];
    recommendedWidth: number;
    recommendedHeight: number;
  };
  quality: {
    minInterPupillaryDistancePx: number;
    minSharpness: number;
    minBrightness: number;
    maxBrightness: number;
    maxClippedPixelRatio: number;
    minLivenessScore: number;
    minQualityScore: number;
  };
}

export type FaceAttemptListResponse<T> = PaginatedResponse<T>;
