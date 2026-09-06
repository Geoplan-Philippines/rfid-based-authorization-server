import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import {
  FaceProfileStatus,
  FaceRecognitionOutcome,
  Prisma,
} from '@prisma/client';

import { env } from 'src/core/config/env.config';
import { PrismaService } from 'src/core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FACE_ATTEMPT_INCLUDE } from './constants/face-attempt.constants';
import { FACE_ATTEMPT_ENTITY_TYPE, FACE_AUDIT_ACTION } from './constants/face-enrollment.constants';
import type { GetFaceAttemptsQueryDTO } from './dto/get-face-attempts-query.dto';
import type { ReviewFaceAttemptDTO } from './dto/review-face-attempt.dto';
import { FaceApiException } from './errors/face-api.exception';
import { FaceServiceError } from './errors/face-service.error';
import { mapFaceAttempt } from './face-attempt.mapper';
import { FaceServiceClient } from './face-service.client';
import type {
  FaceAttemptDetailContract,
  FaceAttemptListResponse,
  FaceAttemptOutcomeCounts,
  FaceHealthContract,
} from './types/face-attempt.types';

const LAST_24_HOURS_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FaceOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly faceServiceClient: FaceServiceClient,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getFaceAttempts(query: GetFaceAttemptsQueryDTO): Promise<FaceAttemptListResponse> {
    this.validateAttemptRange(query);
    const { page, limit } = query;
    const where = this.buildAttemptWhere(query);
    const countsWhere = this.buildAttemptWhere(query, { includeOutcome: false });
    const [attempts, total, groupedCounts] = await Promise.all([
      this.prisma.faceRecognitionAttempt.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: FACE_ATTEMPT_INCLUDE,
      }),
      this.prisma.faceRecognitionAttempt.count({ where }),
      this.prisma.faceRecognitionAttempt.groupBy({
        by: ['outcome'],
        where: countsWhere,
        _count: { _all: true },
      }),
    ]);

    return {
      data: attempts.map(mapFaceAttempt),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
        counts: this.mapOutcomeCounts(groupedCounts),
      },
    };
  }

  async getFaceAttemptById(id: string): Promise<FaceAttemptDetailContract> {
    const attempt = await this.prisma.faceRecognitionAttempt.findUnique({
      where: { id },
      include: FACE_ATTEMPT_INCLUDE,
    });
    if (!attempt) throw new FaceApiException(HttpStatus.NOT_FOUND, 'ATTEMPT_NOT_FOUND', 'Face recognition attempt not found');

    return { ...mapFaceAttempt(attempt), topCandidates: [] };
  }

  async reviewFaceAttempt(
    id: string,
    body: ReviewFaceAttemptDTO,
    actorId: string,
  ): Promise<FaceAttemptDetailContract> {
    const existing = await this.prisma.faceRecognitionAttempt.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new FaceApiException(HttpStatus.NOT_FOUND, 'ATTEMPT_NOT_FOUND', 'Face recognition attempt not found');

    if (body.actualDriverId) {
      const driver = await this.prisma.driver.findUnique({ where: { id: body.actualDriverId }, select: { id: true } });
      if (!driver) throw new FaceApiException(HttpStatus.NOT_FOUND, 'DRIVER_NOT_FOUND', 'Actual driver not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.faceRecognitionAttempt.update({
        where: { id },
        data: {
          reviewedById: actorId,
          reviewedOutcome: body.reviewedOutcome,
          reviewedAt: new Date(),
        },
      });
      await this.auditLogsService.recordAuditLog({
        actorId,
        action: FACE_AUDIT_ACTION.reviewAttempt,
        entityType: FACE_ATTEMPT_ENTITY_TYPE,
        entityId: id,
        metadata: {
          reviewedOutcome: body.reviewedOutcome,
          actualDriverId: body.actualDriverId ?? null,
          note: body.note?.trim() ?? null,
        },
      }, tx);
    });

    return this.getFaceAttemptById(id);
  }

  async getFaceHealth(): Promise<FaceHealthContract> {
    const since = new Date(Date.now() - LAST_24_HOURS_MS);
    const serviceStartedAt = performance.now();
    let upstreamHealth: Awaited<ReturnType<FaceServiceClient['health']>> | null = null;
    let serviceErrorCode: string | null = null;

    try {
      upstreamHealth = await this.faceServiceClient.health();
    } catch (error) {
      serviceErrorCode = error instanceof FaceServiceError ? error.code : 'FACE_SERVICE_UNAVAILABLE';
    }
    const serviceLatencyMs = Math.round(performance.now() - serviceStartedAt);

    const [driversTotal, enrolledActive, pending, notEnrolled, outcomeGroups, latencyRows] = await Promise.all([
      this.prisma.driver.count({ where: { isArchived: false } }),
      this.prisma.faceProfile.count({ where: { isArchived: false, status: FaceProfileStatus.ACTIVE } }),
      this.prisma.faceProfile.count({
        where: {
          isArchived: false,
          status: { in: [FaceProfileStatus.PENDING, FaceProfileStatus.NEEDS_REENROLLMENT] },
        },
      }),
      this.prisma.driver.count({ where: { isArchived: false, faceProfile: { is: null } } }),
      this.prisma.faceRecognitionAttempt.groupBy({
        by: ['outcome'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.faceRecognitionAttempt.findMany({
        where: { createdAt: { gte: since }, latencyMs: { not: null } },
        select: { latencyMs: true },
      }),
    ]);

    const outcomeCounts = this.mapOutcomeCounts(outcomeGroups);
    const attempts = Object.values(outcomeCounts).reduce((sum, count) => sum + count, 0);
    const matched = outcomeCounts[FaceRecognitionOutcome.MATCHED];

    return {
      enabled: env.FACE_RECOGNITION_ENABLED,
      enforcementMode: env.FACE_ENFORCEMENT_MODE,
      service: upstreamHealth
        ? {
          reachable: true,
          status: upstreamHealth.status,
          version: upstreamHealth.version,
          latencyMs: serviceLatencyMs,
          modelsLoaded: {
            arcface: upstreamHealth.modelsLoaded.arcface,
            antispoof: upstreamHealth.modelsLoaded.antispoof,
          },
          detector: upstreamHealth.modelsLoaded.detector,
          errorCode: null,
        }
        : {
          reachable: false,
          status: 'unavailable',
          version: null,
          latencyMs: serviceLatencyMs,
          modelsLoaded: { arcface: false, antispoof: false },
          detector: null,
          errorCode: serviceErrorCode,
        },
      cameras: upstreamHealth?.cameras ?? [],
      enrollment: {
        driversTotal,
        enrolledActive,
        pending,
        notEnrolled,
        coverage: driversTotal === 0 ? 0 : enrolledActive / driversTotal,
      },
      last24h: {
        attempts,
        matched,
        matchRate: attempts === 0 ? 0 : matched / attempts,
        serviceErrors: outcomeCounts[FaceRecognitionOutcome.SERVICE_ERROR],
        p95LatencyMs: this.percentile95(latencyRows.flatMap((row) => row.latencyMs ?? [])),
      },
      thresholds: {
        matchThreshold: env.FACE_MATCH_THRESHOLD,
        matchMargin: env.FACE_MATCH_MARGIN,
        minLivenessScore: env.FACE_MIN_LIVENESS_SCORE,
        minQualityScore: env.FACE_MIN_QUALITY_SCORE,
      },
    };
  }

  private buildAttemptWhere(
    query: GetFaceAttemptsQueryDTO,
    options: { includeOutcome?: boolean } = {},
  ): Prisma.FaceRecognitionAttemptWhereInput {
    const filters: Prisma.FaceRecognitionAttemptWhereInput[] = [];
    const search = query.search?.trim();

    if ((options.includeOutcome ?? true) && query.outcome) filters.push({ outcome: query.outcome });
    if (query.driverId) filters.push({ matchedDriverId: query.driverId });
    if (query.cameraId) filters.push({ cameraId: { equals: query.cameraId.trim(), mode: 'insensitive' } });
    if (query.from || query.to) {
      filters.push({
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      });
    }
    if (query.minSimilarity !== undefined || query.maxSimilarity !== undefined) {
      filters.push({
        similarity: {
          ...(query.minSimilarity !== undefined ? { gte: query.minSimilarity } : {}),
          ...(query.maxSimilarity !== undefined ? { lte: query.maxSimilarity } : {}),
        },
      });
    }
    if (query.reviewed !== undefined) filters.push({ reviewedOutcome: query.reviewed ? { not: null } : null });
    if (search) {
      filters.push({
        OR: [
          { gateEvent: { is: { eventCode: { contains: search, mode: 'insensitive' } } } },
          { matchedDriver: { is: { firstName: { contains: search, mode: 'insensitive' } } } },
          { matchedDriver: { is: { lastName: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    return filters.length > 0 ? { AND: filters } : {};
  }

  private mapOutcomeCounts(
    groups: Array<{ outcome: FaceRecognitionOutcome; _count: { _all: number } }>,
  ): FaceAttemptOutcomeCounts {
    const counts = Object.values(FaceRecognitionOutcome).reduce((result, outcome) => {
      result[outcome] = 0;
      return result;
    }, {} as FaceAttemptOutcomeCounts);
    for (const group of groups) counts[group.outcome] = group._count._all;
    return counts;
  }

  private validateAttemptRange(query: GetFaceAttemptsQueryDTO): void {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException('Attempt range start must not be after its end');
    }
    if (query.minSimilarity !== undefined
      && query.maxSimilarity !== undefined
      && query.minSimilarity > query.maxSimilarity) {
      throw new BadRequestException('Minimum similarity must not exceed maximum similarity');
    }
  }

  private percentile95(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.ceil(sorted.length * 0.95) - 1];
  }
}
