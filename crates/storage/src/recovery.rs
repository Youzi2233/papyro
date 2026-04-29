use crate::db;
use crate::DbPool;
use anyhow::{Context, Result};
use chrono::Utc;
use papyro_core::models::{EditorTab, RecoveryDraft, Workspace};
use std::path::Path;

const RECOVERY_DRAFT_RETENTION_DAYS: i64 = 30;
const MILLIS_PER_DAY: i64 = 24 * 60 * 60 * 1000;
const RECOVERY_DRAFT_RETENTION_MS: i64 = RECOVERY_DRAFT_RETENTION_DAYS * MILLIS_PER_DAY;

pub(crate) fn upsert_draft(
    pool: &DbPool,
    workspace: &Workspace,
    tab: &EditorTab,
    content: &str,
    revision: u64,
) -> Result<()> {
    let relative_path = tab
        .path
        .strip_prefix(&workspace.path)
        .with_context(|| {
            format!(
                "record recovery draft for {} outside workspace {}",
                tab.path.display(),
                workspace.path.display()
            )
        })?
        .to_path_buf();
    let draft = RecoveryDraft {
        workspace_id: workspace.id.clone(),
        note_id: tab.note_id.clone(),
        relative_path,
        title: tab.title.clone(),
        content: content.to_string(),
        revision,
        updated_at: Utc::now().timestamp_millis(),
    };
    db::recovery::upsert(pool, &draft)
}

pub(crate) fn clear_draft(pool: &DbPool, workspace: &Workspace, note_id: &str) -> Result<()> {
    db::recovery::clear(pool, &workspace.id, note_id)
}

pub(crate) fn list_drafts(pool: &DbPool, workspace: &Workspace) -> Result<Vec<RecoveryDraft>> {
    db::recovery::list_for_workspace(pool, &workspace.id)
}

pub(crate) fn prune_stale_drafts(pool: &DbPool, now_ms: i64) -> Result<usize> {
    db::recovery::prune_older_than(pool, stale_cutoff_ms(now_ms))
}

pub(crate) fn prune_stale_drafts_best_effort(pool: &DbPool, now_ms: i64) {
    match prune_stale_drafts(pool, now_ms) {
        Ok(deleted) if deleted > 0 => {
            tracing::info!(deleted, "pruned stale recovery drafts");
        }
        Ok(_) => {}
        Err(error) => {
            tracing::warn!(%error, "failed to prune stale recovery drafts");
        }
    }
}

pub(crate) fn stale_cutoff_ms(now_ms: i64) -> i64 {
    now_ms.saturating_sub(RECOVERY_DRAFT_RETENTION_MS)
}

pub(crate) fn clear_draft_best_effort(pool: &DbPool, workspace: &Workspace, note_id: &str) {
    if let Err(error) = clear_draft(pool, workspace, note_id) {
        tracing::warn!(%error, %note_id, "failed to clear recovery draft after save");
    }
}

pub(crate) fn loaded_workspace_status(
    note_count: usize,
    workspace_path: &Path,
    recovery_count: usize,
) -> String {
    let mut status = format!(
        "Loaded {note_count} notes from {}",
        workspace_path.display()
    );
    if recovery_count > 0 {
        status.push_str(&format!("; {recovery_count} recovery drafts need review"));
    }
    status
}
