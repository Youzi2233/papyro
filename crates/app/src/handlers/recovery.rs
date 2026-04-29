use dioxus::prelude::*;
use papyro_core::models::RecoveryDraft;
use papyro_core::{EditorTabs, FileState, NoteStorage, TabContentsMap};
use std::sync::Arc;

use crate::workspace_flow::restore_recovery_draft_in_state;

type BlockingResult<T> = Result<Result<T, anyhow::Error>, tokio::task::JoinError>;

pub fn restore_recovery_draft(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    mut recovery_drafts: Signal<Vec<RecoveryDraft>>,
    mut status_message: Signal<Option<String>>,
    note_id: String,
) {
    let mut next_file_state = file_state.read().clone();
    let mut next_editor_tabs = editor_tabs.read().clone();
    let mut next_tab_contents = tab_contents.read().clone();
    let mut next_recovery_drafts = recovery_drafts.read().clone();

    spawn(async move {
        let result: BlockingResult<(
            String,
            FileState,
            EditorTabs,
            TabContentsMap,
            Vec<RecoveryDraft>,
        )> = tokio::task::spawn_blocking(move || {
            let title = restore_recovery_draft_in_state(
                storage.as_ref(),
                &mut next_file_state,
                &mut next_editor_tabs,
                &mut next_tab_contents,
                &mut next_recovery_drafts,
                &note_id,
            )?;

            Ok::<_, anyhow::Error>((
                title,
                next_file_state,
                next_editor_tabs,
                next_tab_contents,
                next_recovery_drafts,
            ))
        })
        .await;

        match result {
            Ok(Ok((
                title,
                next_file_state,
                next_editor_tabs,
                next_tab_contents,
                next_recovery_drafts,
            ))) => {
                file_state.set(next_file_state);
                editor_tabs.set(next_editor_tabs);
                tab_contents.set(next_tab_contents);
                recovery_drafts.set(next_recovery_drafts);
                status_message.set(Some(format!(
                    "Restored recovery draft for {title}. Save to keep it."
                )));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Restore recovery draft failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Restore recovery draft failed: {error}")));
            }
        }
    });
}

pub fn discard_recovery_draft(
    storage: Arc<dyn NoteStorage>,
    file_state: Signal<FileState>,
    mut recovery_drafts: Signal<Vec<RecoveryDraft>>,
    mut status_message: Signal<Option<String>>,
    note_id: String,
) {
    let workspace = file_state.read().current_workspace.clone();
    let draft_title = recovery_drafts
        .read()
        .iter()
        .find(|draft| draft.note_id == note_id)
        .map(|draft| draft.title.clone())
        .unwrap_or_else(|| "draft".to_string());

    let Some(workspace) = workspace else {
        status_message.set(Some(
            "Open a workspace before discarding recovery drafts".to_string(),
        ));
        return;
    };

    spawn(async move {
        let note_id_for_io = note_id.clone();
        let workspace_for_io = workspace.clone();
        let result = tokio::task::spawn_blocking(move || {
            storage.clear_recovery_draft(&workspace_for_io, &note_id_for_io)
        })
        .await;

        match result {
            Ok(Ok(())) => {
                recovery_drafts
                    .write()
                    .retain(|draft| draft.note_id != note_id);
                status_message.set(Some(format!("Discarded recovery draft for {draft_title}")));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Discard recovery draft failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Discard recovery draft failed: {error}")));
            }
        }
    });
}
