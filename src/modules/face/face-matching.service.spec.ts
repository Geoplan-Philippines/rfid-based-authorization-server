import { FaceAngle } from '@prisma/client';

import { env } from 'src/core/config/env.config';
import { FaceMatchingService } from './face-matching.service';
import { FaceEmbeddingRepository, type FaceMatchRow } from './repositories/face-embedding.repository';
import type { FaceFrameMatchDecision } from './types/face-matching.types';

describe('FaceMatchingService', () => {
  const faceEmbeddingRepository = {
    searchNearest: jest.fn(),
  };

  const service = new FaceMatchingService(faceEmbeddingRepository as unknown as FaceEmbeddingRepository);
  const embedding = Array.from({ length: env.FACE_EMBEDDING_DIMENSIONS }, () => 0);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns a clear match using the closest angle per driver', async () => {
    const bestDistance = env.FACE_MATCH_THRESHOLD - 0.1;
    const runnerUpDistance = bestDistance + env.FACE_MATCH_MARGIN + 0.02;
    faceEmbeddingRepository.searchNearest.mockResolvedValue([
      row('embedding-a-front', 'driver-a', bestDistance, FaceAngle.FRONT),
      row('embedding-a-left', 'driver-a', bestDistance + 0.01, FaceAngle.LEFT),
      row('embedding-b-front', 'driver-b', runnerUpDistance, FaceAngle.FRONT),
    ]);

    const result = await service.matchEmbedding(embedding);

    expect(result).toEqual({
      outcome: 'MATCHED',
      matchedDriverId: 'driver-a',
      winner: row('embedding-a-front', 'driver-a', bestDistance, FaceAngle.FRONT),
      distance: bestDistance,
      similarity: 1 - bestDistance,
      runnerUpDistance,
      margin: runnerUpDistance - bestDistance,
    });
    expect(faceEmbeddingRepository.searchNearest).toHaveBeenCalledWith(embedding, {
      provider: env.FACE_EMBEDDING_PROVIDER,
      model: env.FACE_EMBEDDING_MODEL,
      limit: 5,
    });
  });

  it('returns no match when the closest driver is above the distance threshold', async () => {
    const distance = env.FACE_MATCH_THRESHOLD + 0.01;
    faceEmbeddingRepository.searchNearest.mockResolvedValue([
      row('embedding-a', 'driver-a', distance, FaceAngle.FRONT),
    ]);

    const result = await service.matchEmbedding(embedding);

    expect(result.outcome).toBe('NO_MATCH');
    expect(result.matchedDriverId).toBeNull();
    expect(result.distance).toBe(distance);
  });

  it('returns ambiguous when the winner is below threshold but inside the impostor margin', async () => {
    const bestDistance = env.FACE_MATCH_THRESHOLD - 0.05;
    const runnerUpDistance = bestDistance + env.FACE_MATCH_MARGIN / 2;
    faceEmbeddingRepository.searchNearest.mockResolvedValue([
      row('embedding-a', 'driver-a', bestDistance, FaceAngle.FRONT),
      row('embedding-b', 'driver-b', runnerUpDistance, FaceAngle.FRONT),
    ]);

    const result = await service.matchEmbedding(embedding);

    expect(result.outcome).toBe('AMBIGUOUS');
    expect(result.matchedDriverId).toBeNull();
    expect(result.runnerUpDistance).toBe(runnerUpDistance);
    expect(result.margin).toBeCloseTo(env.FACE_MATCH_MARGIN / 2);
  });

  it('returns ambiguous for tied nearest drivers', async () => {
    const distance = env.FACE_MATCH_THRESHOLD - 0.05;
    faceEmbeddingRepository.searchNearest.mockResolvedValue([
      row('embedding-a', 'driver-a', distance, FaceAngle.FRONT),
      row('embedding-b', 'driver-b', distance, FaceAngle.FRONT),
    ]);

    const result = await service.matchEmbedding(embedding);

    expect(result.outcome).toBe('AMBIGUOUS');
    expect(result.margin).toBe(0);
  });

  it('returns no match for an empty gallery', async () => {
    faceEmbeddingRepository.searchNearest.mockResolvedValue([]);

    await expect(service.matchEmbedding(embedding)).resolves.toEqual({
      outcome: 'NO_MATCH',
      matchedDriverId: null,
      winner: null,
      distance: null,
      similarity: null,
      runnerUpDistance: null,
      margin: null,
    });
  });

  it('requires the configured number of agreeing frame votes', () => {
    const decisions = Array.from(
      { length: env.FACE_GATE_MIN_VOTES },
      (_, index) => matchedDecision('driver-a', 0.3 + index * 0.01),
    );

    const result = service.vote(decisions);

    expect(result.outcome).toBe('MATCHED');
    expect(result.matchedDriverId).toBe('driver-a');
    expect(result.votes).toBe(env.FACE_GATE_MIN_VOTES);
    expect(result.meanDistance).toBeCloseTo(
      decisions.reduce((sum, decision) => sum + (decision.distance ?? 0), 0) / decisions.length,
    );
  });

  it('returns ambiguous when frame votes tie', () => {
    const decisions = [
      ...Array.from({ length: env.FACE_GATE_MIN_VOTES }, () => matchedDecision('driver-a', 0.3)),
      ...Array.from({ length: env.FACE_GATE_MIN_VOTES }, () => matchedDecision('driver-b', 0.31)),
    ];

    const result = service.vote(decisions);

    expect(result).toEqual({
      outcome: 'AMBIGUOUS',
      matchedDriverId: null,
      votes: env.FACE_GATE_MIN_VOTES,
      meanDistance: null,
      similarity: null,
    });
  });
});

function row(embeddingId: string, driverId: string, distance: number, angle: FaceAngle): FaceMatchRow {
  return { embeddingId, driverId, distance, angle };
}

function matchedDecision(driverId: string, distance: number): FaceFrameMatchDecision {
  const winner = row(`${driverId}-embedding`, driverId, distance, FaceAngle.FRONT);
  return {
    outcome: 'MATCHED',
    matchedDriverId: driverId,
    winner,
    distance,
    similarity: 1 - distance,
    runnerUpDistance: null,
    margin: null,
  };
}
