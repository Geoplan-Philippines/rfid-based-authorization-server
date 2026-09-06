import { FaceAngle, FaceProfileStatus } from '@prisma/client';

import type {
  FaceCaptureContract,
  FaceEnrollmentProgress,
  FaceProfileContract,
  FaceProfilePayload,
  FaceRecognitionSummary,
} from './types/face-enrollment.types';

interface FaceProfileMappingContext {
  driverId: string;
  profile: FaceProfilePayload | null;
  angleOrder: FaceAngle[];
  enrolledBy: { id: string; firstName: string | null; lastName: string | null } | null;
  recognition: FaceRecognitionSummary | null;
}

export function mapFaceProfile(context: FaceProfileMappingContext): FaceProfileContract {
  const captures = context.profile
    ? [...context.profile.faceEmbeddings]
      .sort((left, right) => context.angleOrder.indexOf(left.angle) - context.angleOrder.indexOf(right.angle))
      .map(mapFaceCapture)
    : [];
  const progress = mapFaceEnrollmentProgress(
    captures.map((capture) => capture.angle),
    context.angleOrder,
    context.profile?.status ?? null,
  );

  if (!context.profile) {
    return {
      id: null,
      driverId: context.driverId,
      status: null,
      consentGivenAt: null,
      consentReference: null,
      enrolledAt: null,
      enrolledBy: null,
      disabledAt: null,
      disabledReason: null,
      captures,
      recognition: null,
      livenessVerified: null,
      createdAt: null,
      updatedAt: null,
      ...progress,
    };
  }

  return {
    id: context.profile.id,
    driverId: context.profile.driverId,
    status: context.profile.status,
    consentGivenAt: context.profile.consentGivenAt,
    consentReference: context.profile.consentReference,
    enrolledAt: context.profile.enrolledAt,
    enrolledBy: context.enrolledBy,
    disabledAt: context.profile.disabledAt,
    disabledReason: context.profile.disabledReason,
    captures,
    recognition: context.recognition,
    livenessVerified: captures.length > 0 && captures.every((capture) => capture.livenessScore !== null),
    createdAt: context.profile.createdAt,
    updatedAt: context.profile.updatedAt,
    ...progress,
  };
}

export function mapFaceEnrollmentProgress(
  capturedAngles: FaceAngle[],
  angleOrder: FaceAngle[],
  status: FaceProfileStatus | null,
): FaceEnrollmentProgress {
  const captured = new Set(capturedAngles);
  const orderedCapturedAngles = angleOrder.filter((angle) => captured.has(angle));
  const missingAngles = angleOrder.filter((angle) => !captured.has(angle));
  const isComplete = missingAngles.length === 0;

  return {
    capturedAngles: orderedCapturedAngles,
    missingAngles,
    nextAngle: missingAngles[0] ?? null,
    isComplete,
    canActivate: status === FaceProfileStatus.PENDING && isComplete,
  };
}

export function mapFaceCapture(capture: FaceProfilePayload['faceEmbeddings'][number]): FaceCaptureContract {
  return {
    id: capture.id,
    angle: capture.angle,
    imageUrl: capture.imageUrl,
    qualityScore: capture.qualityScore,
    livenessScore: capture.livenessScore,
    yaw: capture.yaw,
    pitch: capture.pitch,
    capturedAt: capture.createdAt,
  };
}
