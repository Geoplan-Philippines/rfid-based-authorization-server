import type {
  FaceEnforcementMode,
  FaceRecognitionOutcome,
  FaceReviewOutcome,
  GateEventResult,
  Prisma,
} from '@prisma/client';

import type { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import type { FACE_ATTEMPT_INCLUDE } from '../constants/face-attempt.constants';
import type { FaceServiceCameraHealth, FaceServiceHealthResponse } from './face-service.types';

export type FaceAttemptPayload = Prisma.FaceRecognitionAttemptGetPayload<{ include: typeof FACE_ATTEMPT_INCLUDE }>;

export interface FaceAttemptDriver {
  id: string;
  firstName: string;
  lastName: string;
}

export interface FaceAttemptContract {
  id: string;
  createdAt: Date;
  outcome: FaceRecognitionOutcome;
  enforcementMode: FaceEnforcementMode;
  matchedDriver: FaceAttemptDriver | null;
  gateEvent: { id: string; eventCode: string; result: GateEventResult } | null;
  assignedDriver: FaceAttemptDriver | null;
  agreesWithAssignment: boolean | null;
  similarity: number | null;
  distance: number | null;
  margin: number | null;
  livenessScore: number | null;
  isLive: boolean | null;
  qualityScore: number | null;
  framesCaptured: number;
  framesUsable: number;
  votes: number;
  cameraId: string | null;
  snapshotUrl: string | null;
  latencyMs: number | null;
  errorCode: string | null;
  reviewedOutcome: FaceReviewOutcome | null;
  reviewedAt: Date | null;
}

export interface FaceAttemptDetailContract extends FaceAttemptContract {
  topCandidates: FaceAttemptCandidate[];
}

export interface FaceAttemptCandidate {
  driverId: string;
  firstName: string;
  lastName: string;
  angle: string;
  distance: number;
  similarity: number;
}

export type FaceAttemptOutcomeCounts = Record<FaceRecognitionOutcome, number>;

export interface FaceAttemptListResponse extends PaginatedResponse<FaceAttemptContract> {
  meta: PaginatedResponse<FaceAttemptContract>['meta'] & { counts: FaceAttemptOutcomeCounts };
}

export interface FaceHealthContract {
  enabled: boolean;
  enforcementMode: FaceEnforcementMode;
  service: {
    reachable: boolean;
    status: FaceServiceHealthResponse['status'] | 'unavailable';
    version: string | null;
    latencyMs: number;
    modelsLoaded: { arcface: boolean; antispoof: boolean };
    detector: string | null;
    errorCode: string | null;
  };
  cameras: FaceServiceCameraHealth[];
  enrollment: {
    driversTotal: number;
    enrolledActive: number;
    pending: number;
    notEnrolled: number;
    coverage: number;
  };
  last24h: {
    attempts: number;
    matched: number;
    matchRate: number;
    serviceErrors: number;
    p95LatencyMs: number | null;
  };
  thresholds: {
    matchThreshold: number;
    matchMargin: number;
    minLivenessScore: number;
    minQualityScore: number;
  };
}
