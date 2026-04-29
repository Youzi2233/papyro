use dioxus::prelude::*;
use papyro_core::{EditorTabs, FileState, NoteStorage, TabContentsMap};
use papyro_editor::parser::summarize_markdown;
use papyro_ui::commands::OpenMarkdownTarget;
use std::path::PathBuf;
use std::sync::Arc;

use crate::perf::{perf_timer, trace_editor_open_markdown};
use crate::state::RuntimeState;
use crate::workspace_flow::{
    apply_save_error, apply_save_failure, apply_save_success, begin_save_tab,
    open_markdown_target_from_storage, write_save_snapshot,
};

pub async fn open_markdown(
    storage: Arc<dyn NoteStorage>,
    mut state: RuntimeState,
    target: OpenMarkdownTarget,
) {
    let perf_started_at = perf_timer();
    let perf_path = target.path.clone();
    let mut next_file_state = state.file_state.read().clone();
    let mut next_editor_tabs = state.editor_tabs.read().clone();
    let mut next_tab_contents = state.tab_contents.read().clone();

    let result = tokio::task::spawn_blocking(move || {
        let outcome = open_markdown_target_from_storage(
            storage.as_ref(),
            &mut next_file_state,
            &mut next_editor_tabs,
            &mut next_tab_contents,
            target.path,
            summarize_markdown,
        )?;

        Ok::<_, anyhow::Error>(OpenMarkdownStateUpdate {
            file_state: next_file_state,
            editor_tabs: next_editor_tabs,
            tab_contents: next_tab_contents,
            ui_state: outcome.ui_state,
            watch_path: outcome.watch_path,
        })
    })
    .await;

    match result {
        Ok(Ok(next_state)) => {
            let active_tab_id = next_state.editor_tabs.active_tab_id.as_deref();
            let revision =
                active_tab_id.and_then(|tab_id| next_state.tab_contents.revision_for_tab(tab_id));
            let content_bytes = active_tab_id
                .and_then(|tab_id| next_state.tab_contents.content_for_tab(tab_id))
                .map(str::len);
            let view_mode = next_state
                .ui_state
                .as_ref()
                .map(|ui_state| ui_state.view_mode.clone())
                .unwrap_or_else(|| state.ui_state.read().view_mode.clone());
            trace_editor_open_markdown(
                perf_path.as_path(),
                active_tab_id,
                revision,
                &view_mode,
                content_bytes,
                perf_started_at,
            );
            state.file_state.set(next_state.file_state);
            state.editor_tabs.set(next_state.editor_tabs);
            state.tab_contents.set(next_state.tab_contents);
            if let Some(next_ui_state) = next_state.ui_state {
                state.ui_state.set(next_ui_state);
            }
            if let Some(watch_path) = next_state.watch_path {
                state.workspace_watch_path.set(Some(watch_path));
            }
        }
        Ok(Err(error)) => {
            state
                .status_message
                .set(Some(format!("Open Markdown failed: {error}")));
        }
        Err(error) => {
            state
                .status_message
                .set(Some(format!("Open Markdown failed: {error}")));
        }
    }
}

struct OpenMarkdownStateUpdate {
    file_state: FileState,
    editor_tabs: papyro_core::EditorTabs,
    tab_contents: papyro_core::TabContentsMap,
    ui_state: Option<papyro_core::UiState>,
    watch_path: Option<PathBuf>,
}

pub fn save_active_note(
    storage: Arc<dyn NoteStorage>,
    file_state: Signal<FileState>,
    editor_tabs: Signal<EditorTabs>,
    tab_contents: Signal<TabContentsMap>,
    status_message: Signal<Option<String>>,
) {
    let active_tab_id = editor_tabs.read().active_tab_id.clone();
    let Some(active_tab_id) = active_tab_id else {
        return;
    };

    save_tab_by_id(
        storage,
        file_state,
        editor_tabs,
        tab_contents,
        status_message,
        &active_tab_id,
    );
}

pub fn save_tab_by_id(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut editor_tabs: Signal<EditorTabs>,
    tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
    tab_id: &str,
) {
    let workspace = file_state.read().current_workspace.clone();
    let Some(workspace) = workspace else {
        return;
    };

    if editor_tabs.read().tab_by_id(tab_id).is_none() {
        return;
    }

    let snapshot = {
        let mut next_file_state = file_state.read().clone();
        next_file_state.current_workspace = Some(workspace);
        let mut editor_tabs = editor_tabs.write();
        let tab_contents = tab_contents.read();
        begin_save_tab(&next_file_state, &mut editor_tabs, &tab_contents, tab_id)
    };

    let Ok(snapshot) = snapshot else {
        return;
    };
    spawn(async move {
        let snapshot_for_io = snapshot.clone();
        let result: Result<
            Result<(papyro_core::SavedNote, Vec<papyro_core::RecentFile>), anyhow::Error>,
            tokio::task::JoinError,
        > = tokio::task::spawn_blocking(move || {
            write_save_snapshot(storage.as_ref(), &snapshot_for_io)
        })
        .await;

        match result {
            Ok(Ok((saved_note, recent_files))) => {
                let tab_contents = tab_contents.read();
                let mut file_state = file_state.write();
                let mut editor_tabs = editor_tabs.write();
                apply_save_success(
                    &mut file_state,
                    &mut editor_tabs,
                    &tab_contents,
                    &snapshot,
                    saved_note,
                    recent_files,
                );
            }
            Ok(Err(error)) => {
                let tab_contents = tab_contents.read();
                let mut editor_tabs = editor_tabs.write();
                apply_save_error(&mut editor_tabs, &tab_contents, &snapshot, &error);
                status_message.set(Some(format!("Save failed: {error}")));
            }
            Err(error) => {
                let tab_contents = tab_contents.read();
                let mut editor_tabs = editor_tabs.write();
                apply_save_failure(&mut editor_tabs, &tab_contents, &snapshot);
                status_message.set(Some(format!("Save failed: {error}")));
            }
        }
    });
}
