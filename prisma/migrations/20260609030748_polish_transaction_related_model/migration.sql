-- AlterEnum
ALTER TYPE "GateEventResult" ADD VALUE 'ERROR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TimelineEventType" ADD VALUE 'PLATE_MATCHED';
ALTER TYPE "TimelineEventType" ADD VALUE 'MANUAL_OVERRIDE';

-- DropIndex
DROP INDEX "gate_events_event_code_idx";

-- AlterTable
ALTER TABLE "event_verifications" ALTER COLUMN "verified_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "gate_events" ALTER COLUMN "occurred_at" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "gate_snapshots_gate_event_id_idx" ON "gate_snapshots"("gate_event_id");

-- CreateIndex
CREATE INDEX "gate_snapshots_type_idx" ON "gate_snapshots"("type");

-- CreateIndex
CREATE INDEX "gate_timeline_events_type_idx" ON "gate_timeline_events"("type");
