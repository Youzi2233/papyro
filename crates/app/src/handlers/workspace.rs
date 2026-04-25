use dioxus::prelude::*;
use papyro_core::{EditorTabs, FileState, NoteStorage, TabContentsMap};
use papyro_platform::PlatformApi;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::workspace_flow::{
    apply_workspace_bootstrap, reload_workspace_or_bootstrap, WorkspaceReloadOutcome,
};

pub async fn open_workspace(
    platform: Arc<dyn PlatformApi>,
    storage: Arc<dyn NoteStorage>,
    file_state: Signal<FileState>,
    editor_tabs: Signal<EditorTabs>,
    tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
    workspace_watch_path: Signal<Option<PathBuf>>,
) {
    match platform.pick_folder().await {
        Ok(Some(path)) => {
            open_workspace_path(
                storage,
                file_state,
                editor_tabs,
                tab_contents,
                status_message,
                workspace_watch_path,
                path,
            )
            .await;
        }
        Ok(None) => {
            status_message.set(Some("Workspace selection cancelled".to_string()));
        }
        Err(error) => {
            status_message.set(Some(format!("Open workspace failed: {error}")));
        }
    }
}

pub async fn open_workspace_path(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
    mut workspace_watch_path: Signal<Option<PathBuf>>,
    path: PathBuf,
) {
    let result = {
        let p = path.clone();
        let storage = storage.clone();
        tokio::task::spawn_blocking(move || storage.bootstrap_from_workspace(&p)).await
    };

    match result {
        Ok(bootstrap) => {
            let applied = apply_workspace_bootstrap(bootstrap);
            file_state.set(applied.file_state);
            editor_tabs.set(applied.editor_tabs);
            tab_contents.set(applied.tab_contents);
            status_message.set(Some(applied.status_message));
            workspace_watch_path.set(Some(path));
        }
        Err(error) => {
            status_message.set(Some(format!("Open workspace failed: {error}")));
        }
    }
}

pub fn refresh_workspace(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut status_message: Signal<Option<String>>,
) {
    let workspace_path = file_state
        .read()
        .current_workspace
        .as_ref()
        .map(|w| w.path.clone());

    let Some(workspace_path) = workspace_path else {
        status_message.set(Some("No workspace to refresh".to_string()));
        return;
    };

    spawn(async move {
        reload_workspace_tree_async(
            &mut file_state,
            &mut status_message,
            &workspace_path,
            storage,
        )
        .await;
    });
}

pub async fn reload_workspace_tree_async(
    file_state: &mut Signal<FileState>,
    status_message: &mut Signal<Option<String>>,
    workspace_path: &Path,
    storage: Arc<dyn NoteStorage>,
) {
    let previous_state = file_state.read().clone();
    let workspace_path = workspace_path.to_path_buf();
    let result: Result<Result<WorkspaceReloadOutcome, anyhow::Error>, tokio::task::JoinError> =
        tokio::task::spawn_blocking(move || {
            reload_workspace_or_bootstrap(storage.as_ref(), &previous_state, &workspace_path)
        })
        .await;

    match result {
        Ok(Ok(outcome)) => {
            file_state.set(outcome.file_state);
            if let Some(message) = outcome.status_message {
                status_message.set(Some(message));
            }
        }
        Ok(Err(error)) => {
            status_message.set(Some(format!("Workspace reload failed: {error}")));
        }
        Err(error) => {
            status_message.set(Some(format!("Workspace reload failed: {error}")));
        }
    }
}

pub fn should_refresh_for_event(
    event: &papyro_storage::fs::WatchEvent,
    workspace_path: &Path,
) -> bool {
    match event {
        papyro_storage::fs::WatchEvent::Created(path)
        | papyro_storage::fs::WatchEvent::Modified(path)
        | papyro_storage::fs::WatchEvent::Deleted(path) => path.starts_with(workspace_path),
        papyro_storage::fs::WatchEvent::Renamed { from, to } => {
            from.starts_with(workspace_path) || to.starts_with(workspace_path)
        }
    }
}
