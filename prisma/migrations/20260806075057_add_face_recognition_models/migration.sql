-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "FaceProfileStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'NEEDS_REENROLLMENT');

-- CreateEnum
CREATE TYPE "FaceAngle" AS ENUM ('FRONT', 'DOWN', 'LEFT', 'RIGHT');

-- CreateEnum
CREATE TYPE "FaceEmbeddingProvider" AS ENUM ('DEEPFACE', 'INSIGHTFACE');

-- CreateEnum
CREATE TYPE "FaceEmbeddingModel" AS ENUM ('ARCFACE', 'FACENET512', 'SFACE');

-- CreateEnum
CREATE TYPE "FaceEnforcementMode" AS ENUM ('OFF', 'SHADOW', 'ACTIVE');

-- CreateEnum
CREATE TYPE "FaceRecognitionOutcome" AS ENUM ('MATCHED', 'NO_MATCH', 'LOW_CONFIDENCE', 'AMBIGUOUS', 'NO_FACE_DETECTED', 'POOR_QUALITY', 'SPOOF_DETECTED', 'SERVICE_ERROR');

-- CreateEnum
CREATE TYPE "FaceReviewOutcome" AS ENUM ('CONFIRMED_CORRECT', 'CONFIRMED_WRONG', 'UNCLEAR');

-- DropIndex
DROP INDEX "drivers_first_name_last_name_key";

-- CreateTable
CREATE TABLE "face_profiles" (
    "id" TEXT NOT NULL,
    "status" "FaceProfileStatus" NOT NULL DEFAULT 'PENDING',
    "consent_given_at" TIMESTAMP(3),
    "consent_reference" TEXT,
    "enrolled_at" TIMESTAMP(3),
    "enrolled_by_id" TEXT,
    "disabled_at" TIMESTAMP(3),
    "disabled_reason" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "driver_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "face_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_embeddings" (
    "id" TEXT NOT NULL,
    "angle" "FaceAngle" NOT NULL,
    "provider" "FaceEmbeddingProvider" NOT NULL DEFAULT 'DEEPFACE',
    "model" "FaceEmbeddingModel" NOT NULL DEFAULT 'ARCFACE',
    "embedding" vector(512) NOT NULL,
    "image_url" TEXT NOT NULL,
    "quality_score" DOUBLE PRECISION,
    "liveness_score" DOUBLE PRECISION,
    "yaw" DOUBLE PRECISION,
    "pitch" DOUBLE PRECISION,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "face_profile_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "face_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_recognition_attempts" (
    "id" TEXT NOT NULL,
    "outcome" "FaceRecognitionOutcome" NOT NULL,
    "enforcement_mode" "FaceEnforcementMode" NOT NULL,
    "camera_id" TEXT,
    "distance" DOUBLE PRECISION,
    "similarity" DOUBLE PRECISION,
    "margin" DOUBLE PRECISION,
    "liveness_score" DOUBLE PRECISION,
    "quality_score" DOUBLE PRECISION,
    "frames_captured" INTEGER NOT NULL DEFAULT 0,
    "frames_usable" INTEGER NOT NULL DEFAULT 0,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "snapshot_url" TEXT,
    "latency_ms" INTEGER,
    "error_code" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_outcome" "FaceReviewOutcome",
    "reviewed_at" TIMESTAMP(3),
    "matched_driver_id" TEXT,
    "gate_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "face_recognition_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "face_profiles_driver_id_key" ON "face_profiles"("driver_id");

-- CreateIndex
CREATE INDEX "face_profiles_status_idx" ON "face_profiles"("status");

-- CreateIndex
CREATE INDEX "face_profiles_is_archived_idx" ON "face_profiles"("is_archived");

-- CreateIndex
CREATE INDEX "face_embeddings_face_profile_id_idx" ON "face_embeddings"("face_profile_id");

-- CreateIndex
CREATE INDEX "face_embeddings_provider_model_idx" ON "face_embeddings"("provider", "model");

-- CreateIndex
CREATE INDEX "face_embeddings_is_archived_idx" ON "face_embeddings"("is_archived");

-- CreateIndex
CREATE INDEX "face_recognition_attempts_gate_event_id_idx" ON "face_recognition_attempts"("gate_event_id");

-- CreateIndex
CREATE INDEX "face_recognition_attempts_matched_driver_id_idx" ON "face_recognition_attempts"("matched_driver_id");

-- CreateIndex
CREATE INDEX "face_recognition_attempts_outcome_idx" ON "face_recognition_attempts"("outcome");

-- CreateIndex
CREATE INDEX "face_recognition_attempts_created_at_idx" ON "face_recognition_attempts"("created_at");

-- AddForeignKey
ALTER TABLE "face_profiles" ADD CONSTRAINT "face_profiles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_embeddings" ADD CONSTRAINT "face_embeddings_face_profile_id_fkey" FOREIGN KEY ("face_profile_id") REFERENCES "face_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_recognition_attempts" ADD CONSTRAINT "face_recognition_attempts_matched_driver_id_fkey" FOREIGN KEY ("matched_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_recognition_attempts" ADD CONSTRAINT "face_recognition_attempts_gate_event_id_fkey" FOREIGN KEY ("gate_event_id") REFERENCES "gate_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active embedding per (profile, angle). A retake archives the old row (is_archived = true)
-- before inserting the replacement, inside one transaction, so the constraint always holds.
-- Prisma cannot express a partial unique index, so it is added here by hand.
CREATE UNIQUE INDEX "face_embeddings_profile_angle_active_key"
  ON "face_embeddings" ("face_profile_id", "angle")
  WHERE "is_archived" = false;

-- Deliberately NO HNSW index on face_embeddings.embedding. Exact sequential scan costs ~5-10ms at
-- the confirmed 2 000-driver / 8 000-embedding scale, with 100% recall. HNSW is approximate and
-- can flip a true match into a false non-match, which matters more than the milliseconds saved at
-- a security gate. Do not add one reflexively in review; revisit only around ~12 000 drivers
-- (docs/face/plan/04-data-model.md §4.3).
