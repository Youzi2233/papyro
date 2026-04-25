use crate::handlers::{notes, workspace};
use crate::state::RuntimeState;
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
