BEGIN;

-- Add the column as nullable so databases with existing drivers can migrate.
ALTER TABLE "drivers" ADD COLUMN "driver_id" TEXT;

-- The public id format has 99,999 usable values.
DO $$
DECLARE
  "existing_driver_count" BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO "existing_driver_count"
  FROM "drivers";

  IF "existing_driver_count" > 99999 THEN
    RAISE EXCEPTION 'Cannot backfill driver ids: % existing drivers exceeds the 99,999 id limit',
      "existing_driver_count";
  END IF;
END;
$$;

-- Assign stable ids to existing drivers using their creation order.
WITH "ranked_drivers" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS "driver_number"
  FROM "drivers"
)
UPDATE "drivers" AS "driver"
SET "driver_id" = 'DRV-' || LPAD("ranked_driver"."driver_number"::TEXT, 5, '0')
FROM "ranked_drivers" AS "ranked_driver"
WHERE "driver"."id" = "ranked_driver"."id";

-- Enforce the final schema only after every existing row has a value.
ALTER TABLE "drivers" ALTER COLUMN "driver_id" SET NOT NULL;

CREATE UNIQUE INDEX "drivers_driver_id_key" ON "drivers"("driver_id");

ALTER TABLE "drivers"
ADD CONSTRAINT "drivers_driver_id_format_check"
CHECK ("driver_id" ~ '^DRV-[0-9]{5}$' AND "driver_id" <> 'DRV-00000');

COMMIT;
