use crate::db::schema::DbPool;
use anyhow::anyhow;
use anyhow::Result;
use papyro_core::models::{NoteMeta, TrashedNote};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteSyncState {
    pub relative_path: PathBuf,
    pub updated_at: i64,
}

pub fn upsert_note(pool: &DbPool, note: &NoteMeta) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO notes (id, workspace_id, relative_path, title, created_at, updated_at,
                            word_count, char_count, is_favorite, is_trashed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             updated_at = excluded.updated_at,
             word_count = excluded.word_count,
             char_count = excluded.char_count",
        rusqlite::params![
            note.id,
            note.workspace_id,
            note.relative_path.to_string_lossy(),
            note.title,
            note.created_at,
            note.updated_at,
            note.word_count,
            note.char_count,
            note.is_favorite as i32,
            note.is_trashed as i32,
        ],
    )?;
    crate::db::tags::replace_note_tags(&tx, &note.id, &note.tags)?;
    tx.commit()?;
    Ok(())
}

pub fn get_note(pool: &DbPool, id: &str) -> Result<Option<NoteMeta>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, relative_path, title, created_at, updated_at,
                word_count, char_count, is_favorite, is_trashed
         FROM notes WHERE id = ?1 AND is_trashed = 0",
    )?;
    let result = stmt.query_row(rusqlite::params![id], row_to_note_meta);
    match result {
        Ok(mut note) => {
            note.tags = crate::db::tags::list_note_tags(pool, &note.id)?;
            Ok(Some(note))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn list_notes_in_workspace(pool: &DbPool, workspace_id: &str) -> Result<Vec<NoteMeta>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, relative_path, title, created_at, updated_at,
                word_count, char_count, is_favorite, is_trashed
         FROM notes WHERE workspace_id = ?1 AND is_trashed = 0
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map(rusqlite::params![workspace_id], row_to_note_meta)?;
    let mut notes = rows.collect::<Result<Vec<_>, _>>()?;
    hydrate_note_tags(pool, &mut notes)?;
    Ok(notes)
}

pub fn list_note_sync_states(pool: &DbPool, workspace_id: &str) -> Result<Vec<NoteSyncState>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT relative_path, updated_at
         FROM notes WHERE workspace_id = ?1 AND is_trashed = 0",
    )?;
    let rows = stmt.query_map(rusqlite::params![workspace_id], |row| {
        Ok(NoteSyncState {
            relative_path: PathBuf::from(row.get::<_, String>(0)?),
            updated_at: row.get(1)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn list_trashed_notes(pool: &DbPool, workspace_id: &str) -> Result<Vec<TrashedNote>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, relative_path, title, created_at, updated_at,
                word_count, char_count, is_favorite, is_trashed, trashed_at
         FROM notes WHERE workspace_id = ?1 AND is_trashed = 1
         ORDER BY trashed_at DESC, updated_at DESC",
    )?;
    let rows = stmt.query_map(rusqlite::params![workspace_id], |row| {
        Ok(TrashedNote {
            note: NoteMeta {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                relative_path: std::path::PathBuf::from(row.get::<_, String>(2)?),
                title: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                word_count: row.get::<_, u32>(6)?,
                char_count: row.get::<_, u32>(7)?,
                is_favorite: row.get::<_, i32>(8)? != 0,
                is_trashed: row.get::<_, i32>(9)? != 0,
                tags: Vec::new(),
            },
            trashed_at: row.get(10)?,
        })
    })?;
    let mut trashed = rows.collect::<Result<Vec<_>, _>>()?;
    for item in &mut trashed {
        item.note.tags = crate::db::tags::list_note_tags(pool, &item.note.id)?;
    }
    Ok(trashed)
}

pub fn restore_note(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    let changed = conn.execute(
        "UPDATE notes SET is_trashed = 0, trashed_at = NULL WHERE id = ?1",
        rusqlite::params![id],
    )?;
    if changed == 0 {
        return Err(anyhow!("Missing trashed note {id}"));
    }
    Ok(())
}

pub fn delete_note(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

pub fn delete_trashed_notes(pool: &DbPool, workspace_id: &str) -> Result<usize> {
    let conn = pool.get()?;
    let changed = conn.execute(
        "DELETE FROM notes WHERE workspace_id = ?1 AND is_trashed = 1",
        rusqlite::params![workspace_id],
    )?;
    Ok(changed)
}

pub fn update_note_id(
    pool: &DbPool,
    old_id: &str,
    new_id: &str,
    new_relative_path: &std::path::Path,
) -> Result<()> {
    if old_id == new_id {
        return Ok(());
    }

    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    tx.execute_batch("PRAGMA defer_foreign_keys = ON;")?;
    tx.execute(
        "UPDATE notes SET id = ?2, relative_path = ?3 WHERE id = ?1",
        rusqlite::params![old_id, new_id, new_relative_path.to_string_lossy()],
    )?;
    tx.execute(
        "UPDATE recent_files SET note_id = ?2 WHERE note_id = ?1",
        rusqlite::params![old_id, new_id],
    )?;
    tx.execute(
        "UPDATE note_tags SET note_id = ?2 WHERE note_id = ?1",
        rusqlite::params![old_id, new_id],
    )?;
    tx.commit()?;
    Ok(())
}

pub fn trash_note(pool: &DbPool, id: &str, ts: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE notes SET is_trashed = 1, trashed_at = ?2 WHERE id = ?1",
        rusqlite::params![id, ts],
    )?;
    Ok(())
}

pub fn set_favorite(pool: &DbPool, id: &str, favorite: bool) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE notes SET is_favorite = ?2 WHERE id = ?1",
        rusqlite::params![id, favorite as i32],
    )?;
    Ok(())
}

fn row_to_note_meta(row: &rusqlite::Row) -> rusqlite::Result<NoteMeta> {
    Ok(NoteMeta {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        relative_path: std::path::PathBuf::from(row.get::<_, String>(2)?),
        title: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        word_count: row.get::<_, u32>(6)?,
        char_count: row.get::<_, u32>(7)?,
        is_favorite: row.get::<_, i32>(8)? != 0,
        is_trashed: row.get::<_, i32>(9)? != 0,
        tags: vec![],
    })
}

fn hydrate_note_tags(pool: &DbPool, notes: &mut [NoteMeta]) -> Result<()> {
    for note in notes {
        note.tags = crate::db::tags::list_note_tags(pool, &note.id)?;
    }

    Ok(())
}
