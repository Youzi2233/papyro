use crate::handlers::{notes, workspace};
use crate::state::RuntimeState;
use crate::workspace_flow::{
    apply_save_failure, apply_save_success, begin_save_tab, write_save_snapshot, SaveTabSnapshot,
};
use dioxus::prelude::*;
use papyro_core::NoteStorage;
use std::sync::Arc;
use std::time::Duration;

pub(crate) fn record_content_change(
    storage: Arc<dyn NoteStorage>,
    mut state: RuntimeState,
    tab_id: String,
    content: String,
) {
    let revision = papyro_core::change_tab_content(
        &mut state.editor_tabs.write(),
        &mut state.tab_contents.write(),
        &tab_id,
        content,
    );

    let Some(revision) = revision else {
        return;
    };

    let delay = Duration::from_millis(state.ui_state.read().settings.auto_save_delay_ms);

    spawn(async move {
        tokio::time::sleep(delay).await;
        if !papyro_core::should_auto_save(
            &state.editor_tabs.read(),
            &state.tab_contents.read(),
            &tab_id,
            revision,
        ) {
            return;
        }

        let content = state
            .tab_contents
            .read()
            .content_for_tab(&tab_id)
            .unwrap_or_default()
            .to_string();
        let stats = papyro_editor::parser::summarize_markdown(&content);
        state.tab_contents.write().refresh_stats(&tab_id, stats);

        notes::save_tab_by_id(
            storage,
            state.file_state,
            state.editor_tabs,
            state.tab_contents,
            state.status_message,
            &tab_id,
        );
    });
}

pub(crate) async fn flush_dirty_tabs(
    storage: Arc<dyn NoteStorage>,
    mut state: RuntimeState,
) -> bool {
    let dirty_tab_ids = dirty_tab_ids(state);

    for tab_id in dirty_tab_ids {
        let Some(snapshot) = begin_flush_save(state, &tab_id) else {
            continue;
        };

        let snapshot_for_io = snapshot.clone();
        let storage_for_io = storage.clone();
        let result: Result<
            Result<(papyro_core::SavedNote, Vec<papyro_core::RecentFile>), anyhow::Error>,
            tokio::task::JoinError,
        > = tokio::task::spawn_blocking(move || {
            write_save_snapshot(storage_for_io.as_ref(), &snapshot_for_io)
        })
        .await;

        match result {
            Ok(Ok((saved_note, recent_files))) => {
                apply_flush_success(state, &snapshot, saved_note, recent_files);
            }
            Ok(Err(error)) => {
                apply_flush_failure(state, &snapshot);
                state.status_message.set(Some(format!(
                    "Save failed before switching workspace: {error}"
                )));
            }
            Err(error) => {
                apply_flush_failure(state, &snapshot);
                state.status_message.set(Some(format!(
                    "Save failed before switching workspace: {error}"
                )));
            }
        }
    }

    !has_dirty_tabs(state)
}

pub(crate) fn flush_dirty_tabs_blocking(
    storage: &dyn NoteStorage,
    mut state: RuntimeState,
) -> bool {
    let dirty_tab_ids = dirty_tab_ids(state);

    for tab_id in dirty_tab_ids {
        let Some(snapshot) = begin_flush_save(state, &tab_id) else {
            continue;
        };

        match write_save_snapshot(storage, &snapshot) {
            Ok((saved_note, recent_files)) => {
                apply_flush_success(state, &snapshot, saved_note, recent_files);
            }
            Err(error) => {
                apply_flush_failure(state, &snapshot);
                state
                    .status_message
                    .set(Some(format!("Save failed before shutdown: {error}")));
            }
        }
    }

    !has_dirty_tabs(state)
}

pub(crate) fn use_flush_on_drop(state: RuntimeState, storage: Arc<dyn NoteStorage>) {
    use_drop(move || {
        flush_dirty_tabs_blocking(storage.as_ref(), state);
    });
}

fn dirty_tab_ids(state: RuntimeState) -> Vec<String> {
    state
        .editor_tabs
        .read()
        .tabs
        .iter()
        .filter(|tab| tab.is_dirty)
        .map(|tab| tab.id.clone())
        .collect()
}

fn has_dirty_tabs(state: RuntimeState) -> bool {
    state.editor_tabs.read().tabs.iter().any(|tab| tab.is_dirty)
}

fn begin_flush_save(mut state: RuntimeState, tab_id: &str) -> Option<SaveTabSnapshot> {
    let file_state = state.file_state.read().clone();
    let tab_contents = state.tab_contents.read();
    let mut editor_tabs = state.editor_tabs.write();
    begin_save_tab(&file_state, &mut editor_tabs, &tab_contents, tab_id).ok()
}

fn apply_flush_success(
    mut state: RuntimeState,
    snapshot: &SaveTabSnapshot,
    saved_note: papyro_core::SavedNote,
    recent_files: Vec<papyro_core::RecentFile>,
) -> bool {
    let tab_contents = state.tab_contents.read();
    let mut file_state = state.file_state.write();
    let mut editor_tabs = state.editor_tabs.write();
    apply_save_success(
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        snapshot,
        saved_note,
        recent_files,
    )
}

fn apply_flush_failure(mut state: RuntimeState, snapshot: &SaveTabSnapshot) -> bool {
    let tab_contents = state.tab_contents.read();
    let mut editor_tabs = state.editor_tabs.write();
    apply_save_failure(&mut editor_tabs, &tab_contents, snapshot)
}

pub(crate) fn use_workspace_watcher(state: RuntimeState, storage: Arc<dyn NoteStorage>) {
    let mut file_state = state.file_state;
    let mut status_message = state.status_message;
    let workspace_watch_path = state.workspace_watch_path;

    let _watch_workspace = use_resource(move || {
        let storage = storage.clone();
        async move {
            let path = workspace_watch_path();
            let Some(path) = path else { return };

            let (tx, rx) = flume::unbounded();
            let Ok(_watcher) = papyro_storage::fs::start_watching(&path, tx) else {
                status_message.set(Some(format!(
                    "Workspace watcher failed to start for {}",
                    path.display()
                )));
                return;
            };

            while let Ok(event) = rx.recv_async().await {
                if !workspace::should_refresh_for_event(&event, &path) {
                    continue;
                }
                while rx.try_recv().is_ok() {}
                workspace::reload_workspace_tree_async(
                    &mut file_state,
                    &mut status_message,
                    &path,
                    storage.clone(),
                )
                .await;
            }
        }
    });
}
