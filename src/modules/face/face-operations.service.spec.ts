import {
  FaceEnforcementMode,
  FaceRecognitionOutcome,
  FaceReviewOutcome,
  GateEventResult,
} from '@prisma/client';

import { env } from 'src/core/config/env.config';
import { PrismaService } from 'src/core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FACE_ATTEMPT_ENTITY_TYPE, FACE_AUDIT_ACTION } from './constants/face-enrollment.constants';
import { FaceOperationsService } from './face-operations.service';
import { FaceServiceClient } from './face-service.client';
import type { FaceAttemptPayload } from './types/face-attempt.types';

describe('FaceOperationsService', () => {
  const transactionClient = { faceRecognitionAttempt: { update: jest.fn() } };
  const prisma = {
    $transaction: jest.fn(),
    faceRecognitionAttempt: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    faceProfile: { count: jest.fn() },
    driver: { count: jest.fn(), findUnique: jest.fn() },
  };
  const faceServiceClient = { health: jest.fn() };
  const auditLogsService = { recordAuditLog: jest.fn() };
  const service = new FaceOperationsService(
    prisma as unknown as PrismaService,
    faceServiceClient as unknown as FaceServiceClient,
    auditLogsService as unknown as AuditLogsService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient));
  });

  it('maps nested gate and driver context in the paginated attempt log', async () => {
    prisma.faceRecognitionAttempt.findMany.mockResolvedValue([attemptPayload()]);
    prisma.faceRecognitionAttempt.count.mockResolvedValue(1);
    prisma.faceRecognitionAttempt.groupBy.mockResolvedValue([
      { outcome: FaceRecognitionOutcome.MATCHED, _count: { _all: 1 } },
    ]);

    const result = await service.getFaceAttempts({ page: 1, limit: 20 });

    expect(result.data[0]).toMatchObject({
      matchedDriver: { id: 'driver-1', firstName: 'Juan', lastName: 'Cruz' },
      assignedDriver: { id: 'driver-1', firstName: 'Juan', lastName: 'Cruz' },
      agreesWithAssignment: true,
      gateEvent: { id: 'event-1', eventCode: 'GATE-1', result: GateEventResult.VERIFIED },
      similarity: 0.7,
      isLive: true,
    });
    expect(result.meta.counts[FaceRecognitionOutcome.MATCHED]).toBe(1);
    expect(result.meta.counts[FaceRecognitionOutcome.SERVICE_ERROR]).toBe(0);
  });

  it('normalizes review notes and writes audit data in the update transaction', async () => {
    prisma.faceRecognitionAttempt.findUnique
      .mockResolvedValueOnce({ id: 'attempt-1' })
      .mockResolvedValueOnce({
        ...attemptPayload(),
        reviewedOutcome: FaceReviewOutcome.CONFIRMED_CORRECT,
        reviewedAt: new Date(),
      });

    await service.reviewFaceAttempt('attempt-1', {
      reviewedOutcome: FaceReviewOutcome.CONFIRMED_CORRECT,
      note: '  Correct assignment  ',
    }, 'actor-1');

    expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
      actorId: 'actor-1',
      action: FACE_AUDIT_ACTION.reviewAttempt,
      entityType: FACE_ATTEMPT_ENTITY_TYPE,
      entityId: 'attempt-1',
      metadata: {
        reviewedOutcome: FaceReviewOutcome.CONFIRMED_CORRECT,
        actualDriverId: null,
        note: 'Correct assignment',
      },
    }, transactionClient);
  });

  it('surfaces degraded service and black-frame camera state without failing health', async () => {
    faceServiceClient.health.mockResolvedValue({
      status: 'degraded',
      modelsLoaded: { arcface: true, detector: 'yunet', antispoof: true },
      cameras: [{
        cameraId: env.FACE_GATE_CAMERA_ID,
        connected: true,
        lastFrameAgoMs: 50,
        lastFrameMeanLuma: 0,
        deliveringBlackFrames: true,
        bufferedFrames: 45,
        reconnects: 0,
        source: 'DEVICE',
      }],
      activeCaptureSessions: 0,
      uptimeSeconds: 100,
      version: '1.0.0',
    });
    prisma.driver.count.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
    prisma.faceProfile.count.mockResolvedValueOnce(7).mockResolvedValueOnce(1);
    prisma.faceRecognitionAttempt.groupBy.mockResolvedValue([
      { outcome: FaceRecognitionOutcome.MATCHED, _count: { _all: 4 } },
      { outcome: FaceRecognitionOutcome.SERVICE_ERROR, _count: { _all: 1 } },
    ]);
    prisma.faceRecognitionAttempt.findMany.mockResolvedValue([{ latencyMs: 800 }, { latencyMs: 1200 }]);

    const result = await service.getFaceHealth();

    expect(result.service).toMatchObject({ reachable: true, status: 'degraded' });
    expect(result.cameras[0]).toMatchObject({ connected: true, deliveringBlackFrames: true });
    expect(result.enrollment).toMatchObject({ driversTotal: 10, enrolledActive: 7, pending: 1, notEnrolled: 2 });
    expect(result.last24h).toMatchObject({ attempts: 5, matched: 4, serviceErrors: 1, p95LatencyMs: 1200 });
  });
});

function attemptPayload(): FaceAttemptPayload {
  return {
    id: 'attempt-1',
    outcome: FaceRecognitionOutcome.MATCHED,
    enforcementMode: FaceEnforcementMode.SHADOW,
    cameraId: 'GATE-IN-FACE',
    distance: 0.3,
    similarity: 0.7,
    margin: 0.15,
    livenessScore: env.FACE_MIN_LIVENESS_SCORE + 0.1,
    qualityScore: 0.8,
    framesCaptured: 5,
    framesUsable: 5,
    votes: 4,
    snapshotUrl: '/uploads/faces/attempts/attempt-1.jpg',
    latencyMs: 800,
    errorCode: null,
    reviewedById: null,
    reviewedOutcome: null,
    reviewedAt: null,
    matchedDriverId: 'driver-1',
    gateEventId: 'event-1',
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    matchedDriver: { id: 'driver-1', firstName: 'Juan', lastName: 'Cruz' },
    gateEvent: {
      id: 'event-1',
      eventCode: 'GATE-1',
      result: GateEventResult.VERIFIED,
      truck: {
        driverAssignments: [{
          driverId: 'driver-1',
          driver: { id: 'driver-1', firstName: 'Juan', lastName: 'Cruz' },
        }],
      },
    },
  };
}
