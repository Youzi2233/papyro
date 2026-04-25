use std::path::Path;

use crate::db::schema::DbPool;
use anyhow::Result;
use papyro_core::models::Workspace;
use rusqlite::Row;

pub fn insert_workspace(pool: &DbPool, ws: &Workspace) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO workspaces (id, name, path, created_at, last_opened, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            ws.id,
            ws.name,
            ws.path.to_string_lossy(),
            ws.created_at,
            ws.last_opened,
            ws.sort_order,
        ],
    )?;
    Ok(())
}

pub fn list_workspaces(pool: &DbPool) -> Result<Vec<Workspace>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, path, created_at, last_opened, sort_order
         FROM workspaces ORDER BY sort_order ASC, last_opened DESC",
    )?;
    let rows = stmt.query_map([], workspace_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn list_recent_workspaces(pool: &DbPool, limit: usize) -> Result<Vec<Workspace>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, path, created_at, last_opened, sort_order
         FROM workspaces
         ORDER BY COALESCE(last_opened, created_at) DESC, sort_order ASC, name COLLATE NOCASE ASC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(rusqlite::params![limit as i64], workspace_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn find_workspace_by_path(pool: &DbPool, path: &Path) -> Result<Option<Workspace>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, path, created_at, last_opened, sort_order
         FROM workspaces WHERE path = ?1 LIMIT 1",
    )?;
    let result = stmt.query_row(
        rusqlite::params![path.to_string_lossy()],
        workspace_from_row,
    );

    match result {
        Ok(workspace) => Ok(Some(workspace)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn update_last_opened(pool: &DbPool, id: &str, ts: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE workspaces SET last_opened = ?2 WHERE id = ?1",
        rusqlite::params![id, ts],
    )?;
    Ok(())
}

pub fn delete_workspace(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM workspaces WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}

fn workspace_from_row(row: &Row<'_>) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get(0)?,
        name: row.get(1)?,
        path: std::path::PathBuf::from(row.get::<_, String>(2)?),
        created_at: row.get(3)?,
        last_opened: row.get(4)?,
        sort_order: row.get(5)?,
    })
}
