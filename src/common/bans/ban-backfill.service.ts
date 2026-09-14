import type { PrismaClient } from '@prisma/client';

export interface BackfillBansResult {
  trucksBackfilled: number;
  driversBackfilled: number;
}

/**
 * Backfills existing timed bans that only have a banned_until date with a banned_from date.
 * Prefers the ban created-at from audit_logs when present, falling back to the entity's created_at,
 * and finally current timestamp.
 * Existing permanent bans (where banned_until is null) remain untouched.
 */
export async function backfillExistingTimedBans(prisma: {
  $executeRawUnsafe: (query: string) => Promise<number>;
}): Promise<BackfillBansResult> {
  const trucksBackfilled = await prisma.$executeRawUnsafe(`
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
  `);

  const driversBackfilled = await prisma.$executeRawUnsafe(`
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
  `);

  return {
    trucksBackfilled: Number(trucksBackfilled) || 0,
    driversBackfilled: Number(driversBackfilled) || 0,
  };
}
