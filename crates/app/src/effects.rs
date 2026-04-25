use crate::handlers::workspace;
use crate::state::RuntimeState;
use dioxus::prelude::*;
use papyro_core::NoteStorage;
use std::sync::Arc;

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
