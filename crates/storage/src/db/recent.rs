use crate::db::schema::DbPool;
use anyhow::Result;
use papyro_core::models::RecentFile;

pub fn record_open(pool: &DbPool, note_id: &str, ts: i64) -> Result<()> {
    let conn = pool.get()?;
    // 删除同一笔记的旧记录，保持唯一性
    conn.execute(
        "DELETE FROM recent_files WHERE note_id = ?1",
        rusqlite::params![note_id],
    )?;
    conn.execute(
        "INSERT INTO recent_files (note_id, opened_at) VALUES (?1, ?2)",
        rusqlite::params![note_id, ts],
    )?;
    Ok(())
}

pub fn list_recent(pool: &DbPool, limit: usize) -> Result<Vec<RecentFile>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT r.note_id, n.title, n.relative_path, w.name, r.opened_at
         FROM recent_files r
         JOIN notes n ON r.note_id = n.id
         JOIN workspaces w ON n.workspace_id = w.id
         WHERE n.is_trashed = 0
         ORDER BY r.opened_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(rusqlite::params![limit as i64], |row| {
        Ok(RecentFile {
            note_id: row.get(0)?,
            title: row.get(1)?,
            relative_path: std::path::PathBuf::from(row.get::<_, String>(2)?),
            workspace_name: row.get(3)?,
            opened_at: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn remove_missing_files(
    pool: &DbPool,
    workspace_id: &str,
    existing_note_ids: &[String],
) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;

    let mut stmt = tx.prepare("SELECT id FROM notes WHERE workspace_id = ?1 AND is_trashed = 0")?;
    let rows = stmt.query_map(rusqlite::params![workspace_id], |row| {
        row.get::<_, String>(0)
    })?;
    let known_note_ids = rows.collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    for note_id in known_note_ids {
        if existing_note_ids
            .iter()
            .any(|existing| existing == &note_id)
        {
            continue;
        }

        tx.execute(
            "DELETE FROM recent_files WHERE note_id = ?1",
            rusqlite::params![note_id],
        )?;
        tx.execute(
            "UPDATE notes SET is_trashed = 1, trashed_at = strftime('%s','now') * 1000 WHERE id = ?1",
            rusqlite::params![note_id],
        )?;
    }

    tx.commit()?;
    Ok(())
}

pub fn list_recent_from_shared(limit: usize) -> Result<Vec<RecentFile>> {
    let pool = crate::shared_pool()?;
    list_recent(&pool, limit)
}

pub fn clear_recent(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM recent_files", [])?;
    Ok(())
}
