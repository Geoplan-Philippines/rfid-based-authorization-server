-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "banned_from" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trucks" ADD COLUMN     "banned_from" TIMESTAMP(3);

-- Backfill existing timed bans that only have an until date
UPDATE "trucks" t
SET "banned_from" = COALESCE(
  (
    SELECT a."created_at"
    FROM "audit_logs" a
    WHERE a."entity_type" = 'Truck'
      AND a."entity_id" = t."id"
      AND a."action" = 'BAN_TRUCK'
    ORDER BY a."created_at" DESC
    LIMIT 1
  ),
  t."created_at",
  CURRENT_TIMESTAMP
)
WHERE t."banned_until" IS NOT NULL AND t."banned_from" IS NULL;

UPDATE "drivers" d
SET "banned_from" = COALESCE(
  (
    SELECT a."created_at"
    FROM "audit_logs" a
    WHERE a."entity_type" = 'Driver'
      AND a."entity_id" = d."id"
      AND a."action" = 'BAN_DRIVER'
    ORDER BY a."created_at" DESC
    LIMIT 1
  ),
  d."created_at",
  CURRENT_TIMESTAMP
)
WHERE d."banned_until" IS NOT NULL AND d."banned_from" IS NULL;

