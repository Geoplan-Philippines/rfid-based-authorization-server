# Database backup and restore

Run these commands from the repository root.

Create a backup:

```powershell
.\backup-db.cmd
```

The dump is saved in this directory with a timestamped filename.

Restore the newest backup:

```powershell
.\restore-db.cmd
```

Restore a specific backup:

```powershell
.\restore-db.cmd backups\eagle_cement_YYYY-MM-dd_HH-mm-ss.dump
```

Restoring deletes the current database first. Stop the development server, run
the command, and type `RESTORE` when prompted.

These scripts read the PostgreSQL connection and password from the repository
`.env`. Dump files in this directory are ignored by Git.

Database backups do not include files stored in `uploads/`.
