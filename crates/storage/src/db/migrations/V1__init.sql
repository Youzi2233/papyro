CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL,
    last_opened INTEGER,
    sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notes (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    relative_path   TEXT NOT NULL,
    title           TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    word_count      INTEGER DEFAULT 0,
    char_count      INTEGER DEFAULT 0,
    is_favorite     INTEGER DEFAULT 0,
    is_trashed      INTEGER DEFAULT 0,
    trashed_at      INTEGER,
    front_matter    TEXT,
    UNIQUE(workspace_id, relative_path)
);

CREATE TABLE IF NOT EXISTS tags (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE,
    color   TEXT DEFAULT '#6B7280'
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS recent_files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    opened_at   INTEGER NOT NULL,
    cursor_pos  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated   ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_favorite  ON notes(is_favorite) WHERE is_favorite = 1;
CREATE INDEX IF NOT EXISTS idx_note_tags_note  ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag   ON note_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_recent_opened   ON recent_files(opened_at DESC);
