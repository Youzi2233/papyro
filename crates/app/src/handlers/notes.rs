use dioxus::prelude::*;
use papyro_core::models::FileNode;
use papyro_core::{EditorTabs, FileState, NoteStorage, TabContentsMap};
use papyro_editor::parser::summarize_markdown;
use papyro_ui::commands::RecentFileTarget;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use crate::workspace_flow::{
    apply_save_failure, apply_save_success, begin_save_tab, open_note_from_storage,
    open_recent_file_from_storage, write_save_snapshot,
};

pub fn open_note(
    storage: Arc<dyn NoteStorage>,
    file_state: Signal<FileState>,
    editor_tabs: Signal<EditorTabs>,
    tab_contents: Signal<TabContentsMap>,
    status_message: Signal<Option<String>>,
    node: FileNode,
) {
    open_note_path(
        storage,
        file_state,
        editor_tabs,
        tab_contents,
        status_message,
        node.path,
    );
}

pub fn open_note_path(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
    path: PathBuf,
) {
    let perf_started_at = perf_enabled().then(Instant::now);
    let perf_path = path.clone();
    let workspace = file_state.read().current_workspace.clone();
    let Some(workspace) = workspace else {
        status_message.set(Some("Open a workspace before opening notes".to_string()));
        return;
    };

    file_state.write().select_path(path.clone());

    let mut next_file_state = file_state.read().clone();
    next_file_state.current_workspace = Some(workspace);
    let mut next_editor_tabs = editor_tabs.read().clone();
    let mut next_tab_contents = tab_contents.read().clone();

    spawn(async move {
        let result: Result<
            Result<(FileState, EditorTabs, TabContentsMap), anyhow::Error>,
            tokio::task::JoinError,
        > = tokio::task::spawn_blocking(move || {
            open_note_from_storage(
                storage.as_ref(),
                &mut next_file_state,
                &mut next_editor_tabs,
                &mut next_tab_contents,
                path,
                summarize_markdown,
            )?;

            Ok::<_, anyhow::Error>((next_file_state, next_editor_tabs, next_tab_contents))
        })
        .await;

        match result {
            Ok(Ok((next_file_state, next_editor_tabs, next_tab_contents))) => {
                if let Some(started_at) = perf_started_at {
                    let active_tab_id = next_editor_tabs.active_tab_id.as_deref();
                    let bytes = next_tab_contents
                        .active_content(active_tab_id)
                        .map(str::len)
                        .unwrap_or_default();
                    tracing::info!(
                        path = %perf_path.display(),
                        bytes,
                        elapsed_ms = started_at.elapsed().as_millis(),
                        "perf editor open note"
                    );
                }
                file_state.set(next_file_state);
                editor_tabs.set(next_editor_tabs);
                tab_contents.set(next_tab_contents);
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Open note failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Open note failed: {error}")));
            }
        }
    });
}

pub async fn open_recent_file(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
    mut workspace_watch_path: Signal<Option<PathBuf>>,
    target: RecentFileTarget,
) {
    let perf_started_at = perf_enabled().then(Instant::now);
    let perf_path = target.workspace_path.join(&target.relative_path);
    let watch_path = target.workspace_path.clone();
    let mut next_file_state = file_state.read().clone();
    let mut next_editor_tabs = editor_tabs.read().clone();
    let mut next_tab_contents = tab_contents.read().clone();

    let result: Result<
        Result<(FileState, EditorTabs, TabContentsMap), anyhow::Error>,
        tokio::task::JoinError,
    > = tokio::task::spawn_blocking(move || {
        open_recent_file_from_storage(
            storage.as_ref(),
            &mut next_file_state,
            &mut next_editor_tabs,
            &mut next_tab_contents,
            target.workspace_path,
            target.relative_path,
            summarize_markdown,
        )?;

        Ok::<_, anyhow::Error>((next_file_state, next_editor_tabs, next_tab_contents))
    })
    .await;

    match result {
        Ok(Ok((next_file_state, next_editor_tabs, next_tab_contents))) => {
            if let Some(started_at) = perf_started_at {
                let active_tab_id = next_editor_tabs.active_tab_id.as_deref();
                let bytes = next_tab_contents
                    .active_content(active_tab_id)
                    .map(str::len)
                    .unwrap_or_default();
                tracing::info!(
                    path = %perf_path.display(),
                    bytes,
                    elapsed_ms = started_at.elapsed().as_millis(),
                    "perf editor open recent file"
                );
            }
            file_state.set(next_file_state);
            editor_tabs.set(next_editor_tabs);
            tab_contents.set(next_tab_contents);
            workspace_watch_path.set(Some(watch_path));
        }
        Ok(Err(error)) => {
            status_message.set(Some(format!("Open recent file failed: {error}")));
        }
        Err(error) => {
            status_message.set(Some(format!("Open recent file failed: {error}")));
        }
    }
}

fn perf_enabled() -> bool {
    std::env::var_os("PAPYRO_PERF").is_some()
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
                apply_save_failure(&mut editor_tabs, &tab_contents, &snapshot);
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
