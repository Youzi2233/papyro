use crate::db;
use crate::DbPool;
use anyhow::{Context, Result};
use chrono::Utc;
use papyro_core::models::{EditorTab, RecoveryDraft, Workspace};
use std::path::Path;

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
