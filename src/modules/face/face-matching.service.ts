import { BadRequestException, Injectable } from '@nestjs/common';

import { env } from 'src/core/config/env.config';
import { FACE_MATCH_CANDIDATE_LIMIT } from './constants/face-matching.constants';
import { FaceEmbeddingRepository, type FaceMatchRow } from './repositories/face-embedding.repository';
import type { FaceFrameMatchDecision, FaceMatchCandidate, FaceVoteDecision } from './types/face-matching.types';

@Injectable()
export class FaceMatchingService {
  constructor(private readonly faceEmbeddingRepository: FaceEmbeddingRepository) {}

  async matchEmbedding(embedding: number[]): Promise<FaceFrameMatchDecision> {
    this.ensureEmbeddingDimensions(embedding);

    const rows = await this.faceEmbeddingRepository.searchNearest(embedding, {
      provider: env.FACE_EMBEDDING_PROVIDER,
      model: env.FACE_EMBEDDING_MODEL,
      limit: FACE_MATCH_CANDIDATE_LIMIT,
    });
    const candidates = this.collapseToDriverCandidates(rows);
    const winner = candidates[0] ?? null;
    const runnerUp = candidates[1] ?? null;

    if (!winner) return this.emptyGalleryDecision();

    const margin = runnerUp ? runnerUp.distance - winner.distance : null;
    const withinThreshold = winner.distance <= env.FACE_MATCH_THRESHOLD;
    const hasRequiredMargin = margin === null || margin >= env.FACE_MATCH_MARGIN;
    const outcome = !withinThreshold ? 'NO_MATCH' : hasRequiredMargin ? 'MATCHED' : 'AMBIGUOUS';

    return {
      outcome,
      matchedDriverId: outcome === 'MATCHED' ? winner.driverId : null,
      winner,
      distance: winner.distance,
      similarity: this.toSimilarity(winner.distance),
      runnerUpDistance: runnerUp?.distance ?? null,
      margin,
    };
  }

  vote(frameDecisions: FaceFrameMatchDecision[]): FaceVoteDecision {
    const matchingFrames = frameDecisions.filter(
      (decision): decision is FaceFrameMatchDecision & { matchedDriverId: string; distance: number } =>
        decision.outcome === 'MATCHED' && decision.matchedDriverId !== null && decision.distance !== null,
    );

    if (matchingFrames.length === 0) return this.emptyVoteDecision('NO_MATCH');

    const grouped = new Map<string, Array<FaceFrameMatchDecision & { matchedDriverId: string; distance: number }>>();
    for (const decision of matchingFrames) {
      const votes = grouped.get(decision.matchedDriverId) ?? [];
      votes.push(decision);
      grouped.set(decision.matchedDriverId, votes);
    }

    const ranked = [...grouped.entries()].sort((left, right) => right[1].length - left[1].length);
    const [winningDriverId, winningFrames] = ranked[0];
    const winningVotes = winningFrames.length;
    const tied = ranked[1]?.[1].length === winningVotes;

    if (tied || winningVotes < env.FACE_GATE_MIN_VOTES) {
      return {
        outcome: 'AMBIGUOUS',
        matchedDriverId: null,
        votes: winningVotes,
        meanDistance: null,
        similarity: null,
      };
    }

    const meanDistance = winningFrames.reduce((sum, frame) => sum + frame.distance, 0) / winningVotes;
    return {
      outcome: 'MATCHED',
      matchedDriverId: winningDriverId,
      votes: winningVotes,
      meanDistance,
      similarity: this.toSimilarity(meanDistance),
    };
  }

  private collapseToDriverCandidates(rows: FaceMatchRow[]): FaceMatchCandidate[] {
    const closestByDriver = new Map<string, FaceMatchCandidate>();

    for (const row of rows) {
      const current = closestByDriver.get(row.driverId);
      if (!current || row.distance < current.distance) closestByDriver.set(row.driverId, row);
    }

    return [...closestByDriver.values()].sort((left, right) => left.distance - right.distance);
  }

  private emptyGalleryDecision(): FaceFrameMatchDecision {
    return {
      outcome: 'NO_MATCH',
      matchedDriverId: null,
      winner: null,
      distance: null,
      similarity: null,
      runnerUpDistance: null,
      margin: null,
    };
  }

  private emptyVoteDecision(outcome: 'NO_MATCH' | 'AMBIGUOUS'): FaceVoteDecision {
    return {
      outcome,
      matchedDriverId: null,
      votes: 0,
      meanDistance: null,
      similarity: null,
    };
  }

  private ensureEmbeddingDimensions(embedding: number[]): void {
    if (embedding.length !== env.FACE_EMBEDDING_DIMENSIONS || !embedding.every(Number.isFinite)) {
      throw new BadRequestException(`Face embedding must contain ${env.FACE_EMBEDDING_DIMENSIONS} finite values`);
    }
  }

  private toSimilarity(distance: number): number {
    return Math.min(1, Math.max(0, 1 - distance));
  }
}
