import { FaceAngle, FaceProfileStatus } from '@prisma/client';

import { MAX_FACE_UPLOAD_BYTES } from 'src/common/uploads/image-upload.constants';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { env } from 'src/core/config/env.config';
import { PrismaService } from 'src/core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FACE_AUDIT_ACTION, FACE_PROFILE_ENTITY_TYPE } from './constants/face-enrollment.constants';
import { FaceEnrollmentService } from './face-enrollment.service';
import { FaceServiceClient } from './face-service.client';
import { FaceEmbeddingRepository, type InsertFaceEmbeddingInput } from './repositories/face-embedding.repository';
import type { FaceProfilePayload } from './types/face-enrollment.types';
import type { FaceAnalyzeResponse } from './types/face-service.types';

describe('FaceEnrollmentService', () => {
  const transactionClient = {
    faceProfile: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
    driver: { findUnique: jest.fn() },
    faceProfile: { findUnique: jest.fn() },
    faceRecognitionAttempt: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  const faceServiceClient = { analyze: jest.fn() };
  const faceEmbeddingRepository = {
    insert: jest.fn(),
    archiveByProfileAndAngle: jest.fn(),
    searchNearestExcludingProfile: jest.fn(),
    getPairwiseDistances: jest.fn(),
  };
  const imageUploadService = { saveFaceImage: jest.fn() };
  const auditLogsService = { recordAuditLog: jest.fn() };
  const service = new FaceEnrollmentService(
    prisma as unknown as PrismaService,
    faceServiceClient as unknown as FaceServiceClient,
    faceEmbeddingRepository as unknown as FaceEmbeddingRepository,
    imageUploadService as unknown as ImageUploadService,
    auditLogsService as unknown as AuditLogsService,
  );
  const image = {
    buffer: Buffer.from('complete-full-frame-image'),
    mimetype: 'image/jpeg',
    originalname: 'capture.jpg',
  } as Express.Multer.File;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient));
    prisma.driver.findUnique.mockResolvedValue(driver());
    prisma.faceRecognitionAttempt.count.mockResolvedValue(0);
    prisma.faceRecognitionAttempt.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    faceEmbeddingRepository.archiveByProfileAndAngle.mockResolvedValue(undefined);
    faceEmbeddingRepository.insert.mockResolvedValue(undefined);
    faceEmbeddingRepository.searchNearestExcludingProfile.mockResolvedValue([]);
    auditLogsService.recordAuditLog.mockResolvedValue(undefined);
  });

  it('reports the same upload limit that multer enforces', () => {
    expect(service.getEnrollmentRequirements().image.maxBytes).toBe(MAX_FACE_UPLOAD_BYTES);
  });

  it('forwards the full frame, accepts unavailable enrollment liveness, and audits persistence', async () => {
    const pendingProfile = profile([]);
    let inserted: InsertFaceEmbeddingInput | null = null;
    faceEmbeddingRepository.insert.mockImplementation((_tx: unknown, input: InsertFaceEmbeddingInput) => {
      inserted = input;
    });
    prisma.faceProfile.findUnique.mockImplementation(() => {
      if (!inserted) return pendingProfile;
      return profile([capture(inserted.id, FaceAngle.FRONT, null)]);
    });
    faceServiceClient.analyze.mockResolvedValue(validAnalysis({ liveness: null }));
    imageUploadService.saveFaceImage.mockResolvedValue('/uploads/faces/enrollment/driver-1/front.jpg');

    const result = await service.captureFaceAngle('driver-1', { angle: FaceAngle.FRONT }, image, 'actor-1');

    expect(result.accepted).toBe(true);
    expect(result.capture?.livenessScore).toBeNull();
    expect(faceServiceClient.analyze).toHaveBeenCalledWith({
      buffer: image.buffer,
      mimeType: image.mimetype,
      fileName: image.originalname,
    }, expect.objectContaining({ includeEmbedding: true, returnAlignedCrop: false }));
    expect(inserted).toMatchObject({
      livenessScore: null,
      faceProfileId: pendingProfile.id,
    });
    expect(inserted?.embedding).toHaveLength(env.FACE_EMBEDDING_DIMENSIONS);
    expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
      actorId: 'actor-1',
      action: FACE_AUDIT_ACTION.captureAngle,
      entityType: FACE_PROFILE_ENTITY_TYPE,
      entityId: pendingProfile.id,
      metadata: { driverId: 'driver-1', angle: FaceAngle.FRONT, livenessVerified: false },
    }, transactionClient);
  });

  it('returns a soft rejection without persisting a blurry capture', async () => {
    prisma.faceProfile.findUnique.mockResolvedValue(profile([]));
    faceServiceClient.analyze.mockResolvedValue(validAnalysis({ sharpness: env.FACE_ENROLLMENT_MIN_SHARPNESS - 1 }));

    const result = await service.captureFaceAngle('driver-1', { angle: FaceAngle.FRONT }, image, 'actor-1');

    expect(result.accepted).toBe(false);
    expect(result.rejections.map((rejection) => rejection.code)).toContain('IMAGE_BLURRY');
    expect(faceEmbeddingRepository.insert).not.toHaveBeenCalled();
    expect(imageUploadService.saveFaceImage).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('normalizes a disable reason and writes the audit log in the same transaction', async () => {
    let disabled = false;
    let updatedStatus: FaceProfileStatus | null = null;
    let updatedReason: string | null = null;
    const activeProfile = profile(allCaptures(), FaceProfileStatus.ACTIVE);
    prisma.faceProfile.findUnique.mockImplementation(() => disabled
      ? { ...activeProfile, status: FaceProfileStatus.DISABLED, disabledReason: 'Driver resigned' }
      : activeProfile);
    transactionClient.faceProfile.update.mockImplementation((input: {
      data: { status: FaceProfileStatus; disabledReason: string | null };
    }) => {
      updatedStatus = input.data.status;
      updatedReason = input.data.disabledReason;
      disabled = true;
    });

    await service.disableFaceProfile('driver-1', { reason: '  Driver resigned  ' }, 'actor-1');

    expect(updatedStatus).toBe(FaceProfileStatus.DISABLED);
    expect(updatedReason).toBe('Driver resigned');
    expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
      actorId: 'actor-1',
      action: FACE_AUDIT_ACTION.disableProfile,
      entityType: FACE_PROFILE_ENTITY_TYPE,
      entityId: activeProfile.id,
      metadata: { driverId: 'driver-1', reason: 'Driver resigned' },
    }, transactionClient);
  });

  it('activates coherent angles and records whether liveness was verified', async () => {
    let activated = false;
    const pendingProfile = {
      ...profile(allCaptures({ livenessScore: null })),
      consentGivenAt: new Date('2026-08-08T00:00:00.000Z'),
    };
    prisma.faceProfile.findUnique.mockImplementation(() => activated
      ? { ...pendingProfile, status: FaceProfileStatus.ACTIVE, enrolledById: 'actor-1', enrolledAt: new Date() }
      : pendingProfile);
    transactionClient.faceProfile.update.mockImplementation(() => {
      activated = true;
    });
    faceEmbeddingRepository.getPairwiseDistances.mockResolvedValue(pairwiseDistances());
    prisma.user.findUnique.mockResolvedValue({ id: 'actor-1', firstName: 'Maria', lastName: 'Santos' });

    const result = await service.activateFaceProfile('driver-1', 'actor-1');

    expect(result.status).toBe(FaceProfileStatus.ACTIVE);
    expect(result.livenessVerified).toBe(false);
    expect(faceEmbeddingRepository.getPairwiseDistances).toHaveBeenCalledWith(pendingProfile.id, {
      provider: env.FACE_EMBEDDING_PROVIDER,
      model: env.FACE_EMBEDDING_MODEL,
    });
    expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
      actorId: 'actor-1',
      action: FACE_AUDIT_ACTION.activateProfile,
      entityType: FACE_PROFILE_ENTITY_TYPE,
      entityId: pendingProfile.id,
      metadata: { driverId: 'driver-1', livenessVerified: false },
    }, transactionClient);
  });
});

function driver() {
  return { id: 'driver-1', firstName: 'Juan', lastName: 'Cruz', isArchived: false };
}

function profile(
  faceEmbeddings: FaceProfilePayload['faceEmbeddings'],
  status: FaceProfileStatus = FaceProfileStatus.PENDING,
): FaceProfilePayload {
  return {
    id: 'profile-1',
    status,
    consentGivenAt: null,
    consentReference: null,
    enrolledAt: null,
    enrolledById: null,
    disabledAt: null,
    disabledReason: null,
    isArchived: false,
    driverId: 'driver-1',
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    faceEmbeddings,
  };
}

function capture(id: string, angle: FaceAngle, livenessScore: number | null = 0.9) {
  return {
    id,
    angle,
    imageUrl: `/uploads/${angle.toLowerCase()}.jpg`,
    qualityScore: 0.9,
    livenessScore,
    yaw: 0,
    pitch: 0,
    createdAt: new Date(),
  };
}

function allCaptures(options: { livenessScore?: number | null } = {}) {
  return [FaceAngle.FRONT, FaceAngle.DOWN, FaceAngle.LEFT, FaceAngle.RIGHT]
    .map((angle) => capture(`capture-${angle}`, angle, options.livenessScore === undefined ? 0.9 : options.livenessScore));
}

function validAnalysis(overrides: { sharpness?: number; liveness?: null } = {}): FaceAnalyzeResponse {
  return {
    requestId: 'request-1',
    faceCount: 1,
    face: {
      boundingBox: { x: 10, y: 10, width: 200, height: 240 },
      landmarks: {
        leftEye: [60, 70],
        rightEye: [160, 70],
        nose: [110, 120],
        mouthLeft: [75, 170],
        mouthRight: [145, 170],
      },
      interPupillaryDistancePx: env.FACE_ENROLLMENT_MIN_IPD_PX + 20,
      pose: { yaw: 0, pitch: 0, roll: 0 },
      quality: {
        score: env.FACE_ENROLLMENT_MIN_QUALITY_SCORE + 0.2,
        sharpness: overrides.sharpness ?? env.FACE_ENROLLMENT_MIN_SHARPNESS + 20,
        brightness: (env.FACE_ENROLLMENT_MIN_BRIGHTNESS + env.FACE_ENROLLMENT_MAX_BRIGHTNESS) / 2,
        contrast: 50,
        clippedPixelRatio: 0,
        occluded: false,
      },
      liveness: overrides.liveness === null
        ? null
        : { isReal: true, score: env.FACE_ENROLLMENT_MIN_LIVENESS_SCORE + 0.1, model: 'MiniFASNet' },
      embedding: Array.from({ length: env.FACE_EMBEDDING_DIMENSIONS }, () => 0.01),
      provider: env.FACE_EMBEDDING_PROVIDER,
      model: env.FACE_EMBEDDING_MODEL,
      dimensions: env.FACE_EMBEDDING_DIMENSIONS,
      alignedCropBase64: null,
    },
    timings: { detectMs: 10, livenessMs: 10, embedMs: 10, totalMs: 30 },
  };
}

function pairwiseDistances() {
  const angles = [FaceAngle.FRONT, FaceAngle.DOWN, FaceAngle.LEFT, FaceAngle.RIGHT];
  return angles.flatMap((firstAngle, firstIndex) => angles.slice(firstIndex + 1).map((secondAngle) => ({
    firstAngle,
    secondAngle,
    distance: env.FACE_ENROLLMENT_COHERENCE_THRESHOLD - 0.1,
  })));
}
