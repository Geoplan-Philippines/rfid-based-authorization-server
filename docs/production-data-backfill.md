# Production Data Backfill

This release preserves existing truck and driver records.

- Ban state defaults to `is_permanently_banned = false` and `banned_until = NULL`.
- Existing drivers receive sequential IDs such as `DRV-00001`, ordered by `created_at` and database ID.
- The driver ID backfill and constraints run in one transaction.

## Run in production

1. Pause application writes.
2. Create and verify a backup:

```powershell
.\backup-db.cmd
```

3. Check and apply migrations:

```powershell
bunx prisma migrate status
bunx prisma migrate deploy
```

4. Deploy the updated application.
5. Export the assigned IDs and synchronize them with the face-recognition system:

```sql
SELECT driver_id, first_name, last_name, license_number
FROM drivers
ORDER BY driver_id;
```

Never run `prisma migrate reset`, `prisma migrate dev`, or production seeds against the production database.

If the face-recognition system already has authoritative `DRV-*` IDs, replace the generated mapping before running the migration.
