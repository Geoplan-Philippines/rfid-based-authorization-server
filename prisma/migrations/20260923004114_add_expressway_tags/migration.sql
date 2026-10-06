-- CreateEnum
CREATE TYPE "ExpresswayTagStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- AlterEnum
ALTER TYPE "SnapshotType" ADD VALUE 'EXPRESSWAY';

-- AlterEnum
ALTER TYPE "TimelineEventType" ADD VALUE 'SNAPSHOT_CAPTURED';

-- CreateTable
CREATE TABLE "expressway_tags" (
    "id" TEXT NOT NULL,
    "epc_id" TEXT NOT NULL,
    "label" TEXT,
    "status" "ExpresswayTagStatus" NOT NULL DEFAULT 'ACTIVE',
    "truck_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expressway_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expressway_tag_status_history" (
    "id" TEXT NOT NULL,
    "from_status" "ExpresswayTagStatus",
    "to_status" "ExpresswayTagStatus" NOT NULL,
    "reason" TEXT,
    "changed_by_id" TEXT,
    "expressway_tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expressway_tag_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expressway_tags_epc_id_key" ON "expressway_tags"("epc_id");

-- CreateIndex
CREATE INDEX "expressway_tags_truck_id_idx" ON "expressway_tags"("truck_id");

-- CreateIndex
CREATE INDEX "expressway_tag_status_history_expressway_tag_id_idx" ON "expressway_tag_status_history"("expressway_tag_id");

-- AddForeignKey
ALTER TABLE "expressway_tags" ADD CONSTRAINT "expressway_tags_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expressway_tag_status_history" ADD CONSTRAINT "expressway_tag_status_history_expressway_tag_id_fkey" FOREIGN KEY ("expressway_tag_id") REFERENCES "expressway_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
