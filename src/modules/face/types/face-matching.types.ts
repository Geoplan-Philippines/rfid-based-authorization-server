import type { FaceAngle } from '@prisma/client';

export type FaceFrameMatchOutcome = 'MATCHED' | 'NO_MATCH' | 'AMBIGUOUS';

export interface FaceMatchCandidate {
  embeddingId: string;
  angle: FaceAngle;
  driverId: string;
  distance: number;
}

export interface FaceFrameMatchDecision {
  outcome: FaceFrameMatchOutcome;
  matchedDriverId: string | null;
  winner: FaceMatchCandidate | null;
  distance: number | null;
  similarity: number | null;
  runnerUpDistance: number | null;
  margin: number | null;
}

export interface FaceVoteDecision {
  outcome: FaceFrameMatchOutcome;
  matchedDriverId: string | null;
  votes: number;
  meanDistance: number | null;
  similarity: number | null;
}
