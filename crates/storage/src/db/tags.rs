use crate::db::schema::DbPool;
use anyhow::{anyhow, Result};
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

pub fn list_tags(pool: &DbPool) -> Result<Vec<Tag>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, color
         FROM tags
         ORDER BY lower(name), name",
    )?;
    let rows = stmt.query_map([], row_to_tag)?;

    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get_tag(pool: &DbPool, id: &str) -> Result<Option<Tag>> {
    let conn = pool.get()?;
    let result = conn.query_row(
        "SELECT id, name, color FROM tags WHERE id = ?1",
        rusqlite::params![id],
        row_to_tag,
    );
    match result {
        Ok(tag) => Ok(Some(tag)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn upsert_tag(pool: &DbPool, tag: &Tag) -> Result<Tag> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO tags (id, name, color)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             color = excluded.color",
        rusqlite::params![tag.id, tag.name, tag.color],
    )?;
    Ok(tag.clone())
}

pub fn rename_tag(pool: &DbPool, old_id: &str, tag: &Tag) -> Result<Tag> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let existing = tx.query_row(
        "SELECT id, name, color FROM tags WHERE id = ?1",
        rusqlite::params![old_id],
        row_to_tag,
    );
    if matches!(existing, Err(rusqlite::Error::QueryReturnedNoRows)) {
        return Err(anyhow!("Missing tag {old_id}"));
    }
    existing?;

    if old_id == tag.id {
        tx.execute(
            "UPDATE tags SET name = ?2, color = ?3 WHERE id = ?1",
            rusqlite::params![old_id, tag.name, tag.color],
        )?;
        tx.commit()?;
        return Ok(tag.clone());
    }

    tx.execute(
        "INSERT INTO tags (id, name, color)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             color = excluded.color",
        rusqlite::params![tag.id, tag.name, tag.color],
    )?;
    tx.execute(
        "INSERT OR IGNORE INTO note_tags (note_id, tag_id)
         SELECT note_id, ?2 FROM note_tags WHERE tag_id = ?1",
        rusqlite::params![old_id, tag.id],
    )?;
    tx.execute("DELETE FROM tags WHERE id = ?1", rusqlite::params![old_id])?;
    tx.commit()?;
    Ok(tag.clone())
}

pub fn delete_tag(pool: &DbPool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    let changed = conn.execute("DELETE FROM tags WHERE id = ?1", rusqlite::params![id])?;
    if changed == 0 {
        return Err(anyhow!("Missing tag {id}"));
    }
    Ok(())
}

fn row_to_tag(row: &rusqlite::Row) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
    })
}
