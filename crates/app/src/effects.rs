use crate::handlers::workspace;
use crate::perf::{perf_timer, trace_editor_input_change};
use crate::state::RuntimeState;
use crate::workspace_flow::{
    apply_save_failure, apply_save_success, begin_save_tab, write_save_snapshot, SaveTabSnapshot,
};
use dioxus::prelude::*;
use papyro_core::{models::DocumentStats, NoteStorage, RecentFile, SavedNote};
use std::sync::Arc;
use std::time::Duration;

pub(crate) fn record_content_change(
    storage: Arc<dyn NoteStorage>,
    mut state: RuntimeState,
    tab_id: String,
    content: String,
) {
    let perf_started_at = perf_timer();
    let byte_len = content.len();
    let revision = papyro_core::change_tab_content(
        &mut state.editor_tabs.write(),
        &mut state.tab_contents.write(),
        &tab_id,
        content,
    );
    let view_mode = state.ui_state.read().view_mode.clone();

    let Some(revision) = revision else {
        trace_editor_input_change(&tab_id, None, &view_mode, byte_len, false, perf_started_at);
        return;
    };

    trace_editor_input_change(
        &tab_id,
        Some(revision),
        &view_mode,
        byte_len,
        true,
        perf_started_at,
    );

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

        let Some(snapshot) = begin_autosave_snapshot(state, &tab_id) else {
            return;
        };

        let snapshot_for_work = snapshot.clone();
        let storage_for_work = storage.clone();
        let result = tokio::task::spawn_blocking(move || {
            let stats = papyro_editor::parser::summarize_markdown(&snapshot_for_work.content);
            let save = write_save_snapshot(storage_for_work.as_ref(), &snapshot_for_work);
            AutoSaveWorkResult { stats, save }
        })
        .await;

        match result {
            Ok(result) => apply_autosave_work_result(state, &snapshot, result),
            Err(error) => {
                apply_flush_failure(state, &snapshot);
                state
                    .status_message
                    .set(Some(format!("Save failed: {error}")));
            }
        }
    });
}

struct AutoSaveWorkResult {
    stats: DocumentStats,
    save: anyhow::Result<(SavedNote, Vec<RecentFile>)>,
}

fn begin_autosave_snapshot(mut state: RuntimeState, tab_id: &str) -> Option<SaveTabSnapshot> {
    let file_state = state.file_state.read().clone();
    let tab_contents = state.tab_contents.read();
    let mut editor_tabs = state.editor_tabs.write();
    begin_save_tab(&file_state, &mut editor_tabs, &tab_contents, tab_id).ok()
}

fn apply_autosave_work_result(
    mut state: RuntimeState,
    snapshot: &SaveTabSnapshot,
    result: AutoSaveWorkResult,
) {
    refresh_stats_if_current(state, snapshot, result.stats);

    match result.save {
        Ok((saved_note, recent_files)) => {
            apply_flush_success(state, snapshot, saved_note, recent_files);
        }
        Err(error) => {
            apply_flush_failure(state, snapshot);
            state
                .status_message
                .set(Some(format!("Save failed: {error}")));
        }
    }
}

fn refresh_stats_if_current(
    mut state: RuntimeState,
    snapshot: &SaveTabSnapshot,
    stats: DocumentStats,
) {
    if state
        .tab_contents
        .read()
        .should_auto_save_revision(snapshot.tab_id(), snapshot.revision)
    {
        state
            .tab_contents
            .write()
            .refresh_stats(snapshot.tab_id(), snapshot.revision, stats);
    }
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
    let editor_tabs = state.editor_tabs;
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

            while let Ok(first_event) = rx.recv_async().await {
                let mut events = vec![first_event];
                while let Ok(event) = rx.try_recv() {
                    events.push(event);
                }

                let editor_tabs_snapshot = editor_tabs.read().clone();
                let summary =
                    workspace::summarize_watch_events(&events, &path, &editor_tabs_snapshot);
                if !summary.should_refresh && summary.external_message.is_none() {
                    continue;
                }

                if summary.should_refresh {
                    workspace::reload_workspace_tree_async(
                        &mut file_state,
                        &mut status_message,
                        &path,
                        storage.clone(),
                    )
                    .await;
                }
                if let Some(message) = summary.external_message {
                    status_message.set(Some(message));
                }
            }
        }
    });
}
