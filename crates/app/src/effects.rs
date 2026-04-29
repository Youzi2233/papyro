use crate::handlers::workspace;
use crate::perf::{perf_timer, trace_editor_input_change};
use crate::state::RuntimeState;
use crate::status_messages::{save_failure_message, SaveFailureContext};
use crate::workspace_flow::{
    apply_clean_open_tab_refresh, apply_save_error, apply_save_failure, apply_save_success,
    begin_clean_open_tab_refresh, begin_save_tab, read_clean_open_tab_refresh_from_storage,
    write_save_snapshot, SaveTabSnapshot,
};
use dioxus::prelude::*;
use papyro_core::{
    models::DocumentStats, EditorTabs, FileState, NoteStorage, RecentFile, SavedNote,
    TabContentsMap, Workspace,
};
use std::path::PathBuf;
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
    schedule_recovery_draft(
        storage.clone(),
        state,
        tab_id.clone(),
        revision,
        recovery_cache_delay(delay),
    );

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
            apply_flush_error(state, snapshot, &error);
            state.status_message.set(Some(save_failure_message(
                SaveFailureContext::Normal,
                &error,
            )));
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

#[derive(Debug, Clone, PartialEq)]
struct RecoveryDraftSnapshot {
    workspace: Workspace,
    tab: papyro_core::models::EditorTab,
    content: String,
    revision: u64,
}

fn schedule_recovery_draft(
    storage: Arc<dyn NoteStorage>,
    state: RuntimeState,
    tab_id: String,
    revision: u64,
    delay: Duration,
) {
    spawn(async move {
        tokio::time::sleep(delay).await;
        let Some(snapshot) = begin_recovery_draft_snapshot(state, &tab_id, revision) else {
            return;
        };

        let storage_for_work = storage.clone();
        let snapshot_for_work = snapshot.clone();
        let result = tokio::task::spawn_blocking(move || {
            write_recovery_draft_snapshot(storage_for_work.as_ref(), &snapshot_for_work)
        })
        .await;

        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                tracing::warn!(%error, tab_id = snapshot.tab.id, "failed to write recovery draft");
            }
            Err(error) => {
                tracing::warn!(%error, tab_id = snapshot.tab.id, "recovery draft task failed");
            }
        }
    });
}

fn recovery_cache_delay(auto_save_delay: Duration) -> Duration {
    let auto_save_ms = u64::try_from(auto_save_delay.as_millis()).unwrap_or(u64::MAX);
    if auto_save_ms == 0 {
        return Duration::ZERO;
    }

    Duration::from_millis(auto_save_ms.saturating_div(2).clamp(1, 250))
}

fn begin_recovery_draft_snapshot(
    state: RuntimeState,
    tab_id: &str,
    revision: u64,
) -> Option<RecoveryDraftSnapshot> {
    let workspace = state.file_state.read().current_workspace.clone()?;
    let tab = state.editor_tabs.read().tab_by_id(tab_id)?.clone();
    if !tab.is_dirty {
        return None;
    }

    let tab_contents = state.tab_contents.read();
    if !tab_contents.should_auto_save_revision(tab_id, revision) {
        return None;
    }
    let content = tab_contents.content_for_tab(tab_id)?.to_string();

    Some(RecoveryDraftSnapshot {
        workspace,
        tab,
        content,
        revision,
    })
}

fn write_recovery_draft_snapshot(
    storage: &dyn NoteStorage,
    snapshot: &RecoveryDraftSnapshot,
) -> anyhow::Result<()> {
    storage.upsert_recovery_draft(
        &snapshot.workspace,
        &snapshot.tab,
        &snapshot.content,
        snapshot.revision,
    )
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
                apply_flush_error(state, &snapshot, &error);
                state.status_message.set(Some(save_failure_message(
                    SaveFailureContext::WorkspaceSwitch,
                    &error,
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
                apply_flush_error(state, &snapshot, &error);
                state.status_message.set(Some(save_failure_message(
                    SaveFailureContext::Shutdown,
                    &error,
                )));
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

#[cfg(feature = "desktop-shell")]
pub(crate) fn use_desktop_close_flush(state: RuntimeState, storage: Arc<dyn NoteStorage>) {
    use dioxus::desktop::tao::event::{Event, WindowEvent};

    dioxus::desktop::use_wry_event_handler(move |event, _| {
        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            flush_dirty_tabs_blocking(storage.as_ref(), state);
        }
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

fn apply_flush_error(
    mut state: RuntimeState,
    snapshot: &SaveTabSnapshot,
    error: &anyhow::Error,
) -> bool {
    let tab_contents = state.tab_contents.read();
    let mut editor_tabs = state.editor_tabs.write();
    apply_save_error(&mut editor_tabs, &tab_contents, snapshot, error)
}

pub(crate) fn use_workspace_watcher(state: RuntimeState, storage: Arc<dyn NoteStorage>) {
    let mut file_state = state.file_state;
    let mut editor_tabs = state.editor_tabs;
    let mut tab_contents = state.tab_contents;
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
                let clean_refresh_paths =
                    workspace::clean_modified_open_tab_paths(&events, &path, &editor_tabs_snapshot);
                let dirty_conflict_tab_ids =
                    workspace::dirty_modified_open_tab_ids(&events, &path, &editor_tabs_snapshot);
                if !summary.should_refresh
                    && summary.external_message.is_none()
                    && clean_refresh_paths.is_empty()
                    && dirty_conflict_tab_ids.is_empty()
                {
                    continue;
                }

                if !dirty_conflict_tab_ids.is_empty() {
                    let mut editor_tabs = editor_tabs.write();
                    for tab_id in dirty_conflict_tab_ids {
                        editor_tabs.mark_tab_conflict(&tab_id);
                    }
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
                refresh_clean_modified_tabs(
                    storage.clone(),
                    &mut file_state,
                    &mut editor_tabs,
                    &mut tab_contents,
                    &mut status_message,
                    clean_refresh_paths,
                )
                .await;
                if let Some(message) = summary.external_message {
                    status_message.set(Some(message));
                }
            }
        }
    });
}

async fn refresh_clean_modified_tabs(
    storage: Arc<dyn NoteStorage>,
    file_state: &mut Signal<FileState>,
    editor_tabs: &mut Signal<EditorTabs>,
    tab_contents: &mut Signal<TabContentsMap>,
    status_message: &mut Signal<Option<String>>,
    paths: Vec<PathBuf>,
) {
    for path in paths {
        let snapshot = {
            let editor_tabs = editor_tabs.read();
            let tab_contents = tab_contents.read();
            begin_clean_open_tab_refresh(&editor_tabs, &tab_contents, &path)
        };
        let Some(snapshot) = snapshot else {
            continue;
        };

        let file_state_snapshot = file_state.read().clone();
        let storage = storage.clone();
        let path_for_io = path.clone();
        let result = tokio::task::spawn_blocking(move || {
            read_clean_open_tab_refresh_from_storage(
                storage.as_ref(),
                &file_state_snapshot,
                &path_for_io,
                papyro_editor::parser::summarize_markdown,
            )
        })
        .await;

        match result {
            Ok(Ok((opened_note, stats))) => {
                let mut file_state = file_state.write();
                let mut editor_tabs = editor_tabs.write();
                let mut tab_contents = tab_contents.write();
                if apply_clean_open_tab_refresh(
                    &mut file_state,
                    &mut editor_tabs,
                    &mut tab_contents,
                    &snapshot,
                    opened_note,
                    stats,
                ) {
                    status_message.set(Some(format!("Refreshed {} from disk", path.display())));
                }
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Refresh changed file failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Refresh changed file failed: {error}")));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_cache_delay_runs_before_autosave_for_typical_delays() {
        assert_eq!(
            recovery_cache_delay(Duration::from_millis(500)),
            Duration::from_millis(250)
        );
        assert_eq!(
            recovery_cache_delay(Duration::from_millis(100)),
            Duration::from_millis(50)
        );
        assert_eq!(recovery_cache_delay(Duration::ZERO), Duration::ZERO);
    }
}
