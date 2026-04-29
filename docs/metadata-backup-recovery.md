# Metadata Backup and Recovery Strategy

This document defines the backup and recovery strategy for Papyro metadata.
Markdown files remain the source of truth for note content. The SQLite database
stores metadata that improves the app experience: workspaces, note metadata,
tags, favorites, trash state, recent files, recent workspaces, settings, and
workspace tree state.

## Goals

- Protect user metadata from migration mistakes, partial writes, and corrupted
  `meta.db` files.
- Keep backup and restore local, predictable, and understandable.
- Avoid silently replacing user data.
- Prefer recovery paths that preserve Markdown files and let the app rebuild
  derived metadata when needed.

## Storage Scope

The primary metadata database is `meta.db` in the app data directory resolved by
the platform layer. On desktop this is the directory returned by
`dirs::data_local_dir()` plus `papyro/`.

The backup scope is:

- `meta.db`
- `meta.db-wal`, when it exists
- `meta.db-shm`, when it exists
- a small manifest file that records app version, backup time, database path,
  migration version, and reason

The backup must not include workspace Markdown files or `assets/` content.
Those live in the user's workspace and follow normal filesystem backup tools.

## Backup Timing

Create a metadata backup before any operation that can change schema shape or
large metadata sets:

- before running a new SQLite migration
- before explicit restore
- before a future metadata compaction or repair command

Routine note saves should not create full metadata backups. They already update
small metadata rows frequently and must stay cheap.

## Backup Format

Preferred implementation:

1. Open a short-lived SQLite connection to the active database path.
2. Run a checkpoint so WAL contents are folded into the database where possible.
3. Use SQLite backup or `VACUUM INTO` to write a consistent database copy.
4. Write the manifest next to the backup database.

Backup directory layout:

```text
<app-data>/backups/
  2026-04-30T12-30-00Z-before-migration/
    meta.db
    manifest.json
```

The manifest should include:

```json
{
  "kind": "metadata-backup",
  "created_at": "2026-04-30T12:30:00Z",
  "reason": "before-migration",
  "database_path": ".../papyro/meta.db",
  "schema_version": 1,
  "app_version": "0.1.0"
}
```

## Recovery Flow

Recovery must be explicit. Papyro should never silently replace `meta.db`.

The restore flow is:

1. Detect that metadata initialization failed, or let the user choose a backup
   from a future maintenance UI.
2. Show the failure reason and backup timestamp.
3. Before replacing the active database, copy the current broken database into
   a `failed-restore-source` backup folder if it exists.
4. Replace `meta.db` with the selected backup copy.
5. Re-run migrations.
6. Re-scan the current workspace to rebuild derived note metadata.

If restore fails, keep the original broken database backup and start with an
empty metadata database only after explicit user confirmation.

## Rebuild Policy

Some metadata can be rebuilt from Markdown files:

- note title
- word and character counts
- front matter tags
- workspace file tree

Some metadata cannot be safely rebuilt and should be preserved by backup:

- app settings
- workspace settings
- favorites
- trash metadata
- recent files and recent workspaces
- manually managed tag colors

This means backup is still valuable even though Markdown content is plain files.

## Implementation Steps

1. Add a storage-layer `MetadataBackupService` that owns backup directory
   discovery, manifest writes, and database copy.
2. Call the service before migrations when the target database already exists.
3. Add validation that restored backups can open, migrate, and satisfy the
   schema contract.
4. Expose restore choices through a small app-level recovery flow after startup
   initialization failure.
5. Add retention policy: keep the latest 10 automatic backups and never delete
   user-created backups automatically.

## Validation

Minimum automated coverage:

- backup manifest records reason, timestamp, schema version, and database path
- backup copy can be opened and migrated
- migration creates a backup before modifying an existing database
- restore refuses missing or invalid backup manifests
- restore preserves the failed active database before replacing it
- retention deletes only old automatic backups
