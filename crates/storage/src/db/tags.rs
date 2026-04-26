use crate::db::schema::DbPool;
use anyhow::Result;
use papyro_core::models::Tag;

pub(crate) fn replace_note_tags(
    tx: &rusqlite::Transaction<'_>,
    note_id: &str,
    tags: &[Tag],
) -> Result<()> {
    tx.execute(
        "DELETE FROM note_tags WHERE note_id = ?1",
        rusqlite::params![note_id],
    )?;

    for tag in tags {
        tx.execute(
            "INSERT INTO tags (id, name, color)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name",
            rusqlite::params![tag.id, tag.name, tag.color],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![note_id, tag.id],
        )?;
    }

    Ok(())
}

pub fn list_note_tags(pool: &DbPool, note_id: &str) -> Result<Vec<Tag>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color
         FROM tags t
         INNER JOIN note_tags nt ON nt.tag_id = t.id
         WHERE nt.note_id = ?1
         ORDER BY lower(t.name), t.name",
    )?;
    let rows = stmt.query_map(rusqlite::params![note_id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}
