use crate::db::schema::DbPool;
use anyhow::{Context, Result};
use papyro_core::models::RecoveryDraft;
use rusqlite::params;
use std::path::PathBuf;

pub fn upsert(pool: &DbPool, draft: &RecoveryDraft) -> Result<()> {
    let conn = pool.get()?;
    let relative_path = draft.relative_path.to_string_lossy();
    conn.execute(
        "INSERT INTO recovery_drafts
            (workspace_id, note_id, relative_path, title, content, revision, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(workspace_id, note_id) DO UPDATE SET
            relative_path = excluded.relative_path,
            title = excluded.title,
            content = excluded.content,
            revision = excluded.revision,
            updated_at = excluded.updated_at",
        params![
            &draft.workspace_id,
            &draft.note_id,
            relative_path.as_ref(),
            &draft.title,
            &draft.content,
            i64::try_from(draft.revision).context("recovery draft revision exceeds i64")?,
            draft.updated_at,
        ],
    )?;
    Ok(())
}

pub fn list_for_workspace(pool: &DbPool, workspace_id: &str) -> Result<Vec<RecoveryDraft>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT workspace_id, note_id, relative_path, title, content, revision, updated_at
         FROM recovery_drafts
         WHERE workspace_id = ?1
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([workspace_id], |row| {
        let revision: i64 = row.get(5)?;
        Ok(RecoveryDraft {
            workspace_id: row.get(0)?,
            note_id: row.get(1)?,
            relative_path: PathBuf::from(row.get::<_, String>(2)?),
            title: row.get(3)?,
            content: row.get(4)?,
            revision: revision.max(0) as u64,
            updated_at: row.get(6)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn clear(pool: &DbPool, workspace_id: &str, note_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM recovery_drafts WHERE workspace_id = ?1 AND note_id = ?2",
        params![workspace_id, note_id],
    )?;
    Ok(())
}

pub fn prune_older_than(pool: &DbPool, cutoff_ms: i64) -> Result<usize> {
    let conn = pool.get()?;
    let deleted = conn.execute(
        "DELETE FROM recovery_drafts WHERE updated_at < ?1",
        [cutoff_ms],
    )?;
    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::create_pool;

    #[test]
    fn recovery_draft_upsert_lists_latest_snapshot() -> Result<()> {
        let db = recovery_test_db()?;
        let mut draft = draft("note-a", "notes/a.md", "# A", 1, 10);

        upsert(&db.pool, &draft)?;
        draft.content = "# A changed".to_string();
        draft.revision = 2;
        draft.updated_at = 20;
        upsert(&db.pool, &draft)?;

        let drafts = list_for_workspace(&db.pool, "workspace-a")?;
        assert_eq!(drafts, vec![draft]);

        Ok(())
    }

    #[test]
    fn recovery_draft_clear_is_scoped_to_workspace_and_note() -> Result<()> {
        let db = recovery_test_db()?;
        upsert(&db.pool, &draft("note-a", "notes/a.md", "# A", 1, 10))?;
        upsert(&db.pool, &draft("note-b", "notes/b.md", "# B", 1, 11))?;

        clear(&db.pool, "workspace-a", "note-a")?;

        let drafts = list_for_workspace(&db.pool, "workspace-a")?;
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].note_id, "note-b");

        Ok(())
    }

    #[test]
    fn recovery_draft_prune_removes_old_rows() -> Result<()> {
        let db = recovery_test_db()?;
        upsert(&db.pool, &draft("note-a", "notes/a.md", "# A", 1, 10))?;
        upsert(&db.pool, &draft("note-b", "notes/b.md", "# B", 1, 30))?;

        assert_eq!(prune_older_than(&db.pool, 20)?, 1);

        let drafts = list_for_workspace(&db.pool, "workspace-a")?;
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].note_id, "note-b");

        Ok(())
    }

    struct RecoveryTestDb {
        _temp: tempfile::TempDir,
        pool: DbPool,
    }

    fn recovery_test_db() -> Result<RecoveryTestDb> {
        let temp = tempfile::tempdir()?;
        let pool = create_pool(&temp.path().join("meta.db"))?;
        {
            let conn = pool.get()?;
            conn.execute(
                "INSERT INTO workspaces (id, name, path, created_at)
                 VALUES ('workspace-a', 'Workspace', '/workspace', 1)",
                [],
            )?;
            for note_id in ["note-a", "note-b"] {
                conn.execute(
                    "INSERT INTO notes
                        (id, workspace_id, relative_path, title, created_at, updated_at)
                     VALUES (?1, 'workspace-a', ?2, ?3, 1, 1)",
                    params![note_id, format!("notes/{}.md", &note_id[5..]), note_id],
                )?;
            }
        }
        Ok(RecoveryTestDb { _temp: temp, pool })
    }

    fn draft(
        note_id: &str,
        relative_path: &str,
        content: &str,
        revision: u64,
        updated_at: i64,
    ) -> RecoveryDraft {
        RecoveryDraft {
            workspace_id: "workspace-a".to_string(),
            note_id: note_id.to_string(),
            relative_path: PathBuf::from(relative_path),
            title: note_id.to_string(),
            content: content.to_string(),
            revision,
            updated_at,
        }
    }
}
