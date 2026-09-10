-- AlterEnum
ALTER TYPE "GateEventResult" ADD VALUE 'BANNED';
ALTER TYPE "TimelineEventType" ADD VALUE 'BANNED_ENTITY_DETECTED';

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "is_permanently_banned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "drivers" ADD COLUMN "banned_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trucks" ADD COLUMN "is_permanently_banned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "trucks" ADD COLUMN "banned_until" TIMESTAMP(3);
