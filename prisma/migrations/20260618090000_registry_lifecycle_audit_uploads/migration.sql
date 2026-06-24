-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('PRIMARY', 'RELIEF');

-- AlterEnum
ALTER TYPE "RFIDTagStatus" ADD VALUE 'RETIRED';

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "license_number" TEXT;
ALTER TABLE "drivers" ADD COLUMN "photo_url" TEXT;
ALTER TABLE "drivers" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

UPDATE "drivers"
SET "license_number" = 'MIGRATED-' || "id"
WHERE "license_number" IS NULL;

ALTER TABLE "drivers" ALTER COLUMN "license_number" SET NOT NULL;

-- AlterTable
ALTER TABLE "trucks" ADD COLUMN "photo_url" TEXT;

-- AlterTable
ALTER TABLE "truck_driver_assignments" ADD COLUMN "role" "AssignmentRole" NOT NULL DEFAULT 'RELIEF';

-- CreateTable
CREATE TABLE "rfid_tag_status_history" (
    "id" TEXT NOT NULL,
    "from_status" "RFIDTagStatus",
    "to_status" "RFIDTagStatus" NOT NULL,
    "reason" TEXT,
    "changed_by_id" TEXT,
    "rfid_tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfid_tag_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drivers_license_number_key" ON "drivers"("license_number");

-- CreateIndex
CREATE INDEX "rfid_tag_status_history_rfid_tag_id_idx" ON "rfid_tag_status_history"("rfid_tag_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "rfid_tag_status_history" ADD CONSTRAINT "rfid_tag_status_history_rfid_tag_id_fkey" FOREIGN KEY ("rfid_tag_id") REFERENCES "rfid_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
