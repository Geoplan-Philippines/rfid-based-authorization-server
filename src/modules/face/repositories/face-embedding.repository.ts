import { Injectable } from '@nestjs/common';
import { FaceAngle, FaceEmbeddingModel, FaceEmbeddingProvider, Prisma } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';

// FaceEmbedding.embedding is a Prisma `Unsupported("vector(512)")` column: Prisma Client cannot
// create or read it (prisma.faceEmbedding.create() does not exist; findMany() silently omits it).
// Every insert and every similarity search therefore goes through this repository as raw SQL, so
// the rest of the codebase never has to deal with pgvector directly.
//
// Deliberately NO HNSW index — see the migration comment on face_embeddings and
// docs/face/plan/04-data-model.md §4.3. Exact sequential scan is exact; do not "optimise" this
// with an approximate index without re-reading why.

export interface FaceMatchRow {
  embeddingId: string;
  angle: FaceAngle;
  driverId: string;
  distance: number; // pgvector cosine distance, range [0, 2]; 0 = identical
}

export interface InsertFaceEmbeddingInput {
  id: string;
  angle: FaceAngle;
  provider: FaceEmbeddingProvider;
  model: FaceEmbeddingModel;
  embedding: number[]; // length must match the pinned FACE_EMBEDDING_DIMENSIONS (512)
  imageUrl: string;
  qualityScore: number | null;
  livenessScore: number | null;
  yaw: number | null;
  pitch: number | null;
  faceProfileId: string;
}

export interface FaceMatchSearchOptions {
  // Pinned model identity. Never omit this filter — it is what stops an embedding produced by
  // one provider/model from ever being compared against another's after a model change.
  provider: FaceEmbeddingProvider;
  model: FaceEmbeddingModel;
  limit: number;
}

export interface FacePairwiseDistanceRow {
  firstAngle: FaceAngle;
  secondAngle: FaceAngle;
  distance: number;
}

@Injectable()
export class FaceEmbeddingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Accepts a transaction client so callers (enrollment, retakes) can compose this insert with
  // other writes (e.g. archiving the previous embedding) inside one transaction.
  async insert(tx: Prisma.TransactionClient, input: InsertFaceEmbeddingInput): Promise<void> {
    const vectorLiteral = toVectorLiteral(input.embedding);

    await tx.$executeRaw`
      INSERT INTO face_embeddings
        (id, angle, provider, model, embedding, image_url, quality_score,
         liveness_score, yaw, pitch, is_archived, face_profile_id, created_at, updated_at)
      VALUES
        (${input.id}, ${input.angle}::"FaceAngle", ${input.provider}::"FaceEmbeddingProvider",
         ${input.model}::"FaceEmbeddingModel", ${vectorLiteral}::vector, ${input.imageUrl},
         ${input.qualityScore}, ${input.livenessScore}, ${input.yaw}, ${input.pitch}, false,
         ${input.faceProfileId}, now(), now())
    `;
  }

  // Gate matching: nearest ACTIVE, non-archived embeddings across every enrolled driver.
  async searchNearest(embedding: number[], options: FaceMatchSearchOptions): Promise<FaceMatchRow[]> {
    const vectorLiteral = toVectorLiteral(embedding);

    return this.prisma.$queryRaw<FaceMatchRow[]>`
      SELECT fe.id            AS "embeddingId",
             fe.angle         AS "angle",
             fp.driver_id     AS "driverId",
             (fe.embedding <=> ${vectorLiteral}::vector) AS "distance"
      FROM face_embeddings fe
      JOIN face_profiles fp ON fp.id = fe.face_profile_id
      WHERE fe.is_archived = false
        AND fp.is_archived = false
        AND fp.status = 'ACTIVE'
        AND fe.provider = ${options.provider}::"FaceEmbeddingProvider"
        AND fe.model    = ${options.model}::"FaceEmbeddingModel"
      ORDER BY fe.embedding <=> ${vectorLiteral}::vector
      LIMIT ${options.limit}
    `;
  }

  // Enrollment duplicate check (Phase 3): identical search, excluding the profile being enrolled
  // so a driver's own captures never register as a collision with themselves.
  async searchNearestExcludingProfile(
    embedding: number[],
    excludeProfileId: string,
    options: FaceMatchSearchOptions,
  ): Promise<FaceMatchRow[]> {
    const vectorLiteral = toVectorLiteral(embedding);

    return this.prisma.$queryRaw<FaceMatchRow[]>`
      SELECT fe.id            AS "embeddingId",
             fe.angle         AS "angle",
             fp.driver_id     AS "driverId",
             (fe.embedding <=> ${vectorLiteral}::vector) AS "distance"
      FROM face_embeddings fe
      JOIN face_profiles fp ON fp.id = fe.face_profile_id
      WHERE fe.is_archived = false
        AND fp.is_archived = false
        AND fp.status = 'ACTIVE'
        AND fp.id != ${excludeProfileId}
        AND fe.provider = ${options.provider}::"FaceEmbeddingProvider"
        AND fe.model    = ${options.model}::"FaceEmbeddingModel"
      ORDER BY fe.embedding <=> ${vectorLiteral}::vector
      LIMIT ${options.limit}
    `;
  }

  // Retakes archive the previous embedding for this (profile, angle) so the partial unique index
  // (face_embeddings_profile_angle_active_key) allows the replacement row to be inserted.
  async archiveByProfileAndAngle(tx: Prisma.TransactionClient, faceProfileId: string, angle: FaceAngle): Promise<void> {
    await tx.$executeRaw`
      UPDATE face_embeddings
      SET is_archived = true, updated_at = now()
      WHERE face_profile_id = ${faceProfileId}
        AND angle = ${angle}::"FaceAngle"
        AND is_archived = false
    `;
  }

  // Activation coherence check: compare every active angle pair inside Postgres. Only distances
  // leave pgvector; raw biometric vectors never enter Prisma or an API response.
  async getPairwiseDistances(
    faceProfileId: string,
    options: Pick<FaceMatchSearchOptions, 'provider' | 'model'>,
  ): Promise<FacePairwiseDistanceRow[]> {
    return this.prisma.$queryRaw<FacePairwiseDistanceRow[]>`
      SELECT first.angle AS "firstAngle",
             second.angle AS "secondAngle",
             (first.embedding <=> second.embedding) AS "distance"
      FROM face_embeddings first
      JOIN face_embeddings second
        ON second.face_profile_id = first.face_profile_id
       AND second.id > first.id
      WHERE first.face_profile_id = ${faceProfileId}
        AND first.is_archived = false
        AND second.is_archived = false
        AND first.provider = ${options.provider}::"FaceEmbeddingProvider"
        AND second.provider = ${options.provider}::"FaceEmbeddingProvider"
        AND first.model = ${options.model}::"FaceEmbeddingModel"
        AND second.model = ${options.model}::"FaceEmbeddingModel"
      ORDER BY first.angle, second.angle
    `;
  }
}

// pgvector literal syntax: square brackets, comma-separated, no spaces — cast with ::vector at
// the call site, never concatenated into the SQL string itself.
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
