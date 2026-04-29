CREATE TABLE IF NOT EXISTS recovery_drafts (
    workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    note_id       TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    title         TEXT NOT NULL,
    content       TEXT NOT NULL,
    revision      INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, note_id)
);

CREATE INDEX IF NOT EXISTS idx_recovery_drafts_updated
ON recovery_drafts(updated_at DESC);
