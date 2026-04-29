use dioxus::prelude::*;
use papyro_core::{EditorTabs, FileState, NoteStorage};
use papyro_platform::PlatformApi;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::state::RuntimeState;
use crate::workspace_flow::{
    apply_workspace_bootstrap, reload_workspace_or_bootstrap, WorkspaceReloadOutcome,
};

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WatchEventBatchSummary {
    pub should_refresh: bool,
    pub external_message: Option<String>,
}

pub async fn open_workspace(
    platform: Arc<dyn PlatformApi>,
    storage: Arc<dyn NoteStorage>,
    mut state: RuntimeState,
) {
    match platform.pick_folder().await {
        Ok(Some(path)) => {
            open_workspace_path(storage, state, path).await;
        }
        Ok(None) => {
            state
                .status_message
                .set(Some("Workspace selection cancelled".to_string()));
        }
        Err(error) => {
            state
                .status_message
                .set(Some(format!("Open workspace failed: {error}")));
        }
    }
}

pub async fn open_workspace_path(
    storage: Arc<dyn NoteStorage>,
    mut state: RuntimeState,
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
            state.file_state.set(applied.file_state);
            state.editor_tabs.set(applied.editor_tabs);
            state.tab_contents.set(applied.tab_contents);
            state.ui_state.set(applied.ui_state);
            state.workspace_search.write().clear();
            state.recovery_drafts.set(applied.recovery_drafts);
            state.status_message.set(Some(applied.status_message));
            state.workspace_watch_path.set(Some(path));
        }
        Err(error) => {
            state
                .status_message
                .set(Some(format!("Open workspace failed: {error}")));
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

pub fn external_tab_event_message(
    event: &papyro_storage::fs::WatchEvent,
    editor_tabs: &EditorTabs,
) -> Option<String> {
    let tab = editor_tabs.tabs.iter().find(|tab| match event {
        papyro_storage::fs::WatchEvent::Deleted(path) => tab.path.starts_with(path),
        papyro_storage::fs::WatchEvent::Modified(path) => tab.path == *path && tab.is_dirty,
        papyro_storage::fs::WatchEvent::Renamed { from, .. } => tab.path.starts_with(from),
        papyro_storage::fs::WatchEvent::Created(_) => false,
    })?;

    match event {
        papyro_storage::fs::WatchEvent::Deleted(_) => Some(format!(
            "{} was removed outside Papyro. The open tab was kept so you can review or save it.",
            tab.title
        )),
        papyro_storage::fs::WatchEvent::Modified(_) => Some(format!(
            "{} changed outside Papyro while it has unsaved edits. Manual save may overwrite the external version.",
            tab.title
        )),
        papyro_storage::fs::WatchEvent::Renamed { to, .. } => Some(format!(
            "{} was moved outside Papyro to {}. Reopen it from the file tree to continue tracking the new path.",
            tab.title,
            to.display()
        )),
        papyro_storage::fs::WatchEvent::Created(_) => None,
    }
}

pub fn summarize_watch_events(
    events: &[papyro_storage::fs::WatchEvent],
    workspace_path: &Path,
    editor_tabs: &EditorTabs,
) -> WatchEventBatchSummary {
    let mut summary = WatchEventBatchSummary::default();

    for event in events {
        if summary.external_message.is_none() {
            summary.external_message = external_tab_event_message(event, editor_tabs);
        }

        if should_refresh_for_event(event, workspace_path) {
            summary.should_refresh = true;
        }
    }

    summary
}

pub fn clean_modified_open_tab_paths(
    events: &[papyro_storage::fs::WatchEvent],
    workspace_path: &Path,
    editor_tabs: &EditorTabs,
) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    for event in events {
        let papyro_storage::fs::WatchEvent::Modified(path) = event else {
            continue;
        };
        if !path.starts_with(workspace_path)
            || !editor_tabs.tabs.iter().any(|tab| {
                tab.path == *path
                    && !tab.is_dirty
                    && tab.save_status == papyro_core::models::SaveStatus::Saved
            })
            || paths.contains(path)
        {
            continue;
        }

        paths.push(path.clone());
    }

    paths
}

pub fn dirty_modified_open_tab_ids(
    events: &[papyro_storage::fs::WatchEvent],
    workspace_path: &Path,
    editor_tabs: &EditorTabs,
) -> Vec<String> {
    let mut tab_ids = Vec::new();

    for event in events {
        let papyro_storage::fs::WatchEvent::Modified(path) = event else {
            continue;
        };
        if !path.starts_with(workspace_path) {
            continue;
        }

        for tab in &editor_tabs.tabs {
            if tab.path == *path && tab.is_dirty && !tab_ids.contains(&tab.id) {
                tab_ids.push(tab.id.clone());
            }
        }
    }

    tab_ids
}

pub fn should_refresh_for_event(
    event: &papyro_storage::fs::WatchEvent,
    workspace_path: &Path,
) -> bool {
    match event {
        papyro_storage::fs::WatchEvent::Created(path)
        | papyro_storage::fs::WatchEvent::Deleted(path) => path.starts_with(workspace_path),
        papyro_storage::fs::WatchEvent::Modified(_) => false,
        papyro_storage::fs::WatchEvent::Renamed { from, to } => {
            from.starts_with(workspace_path) || to.starts_with(workspace_path)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::{EditorTab, SaveStatus};

    fn tab(title: &str, path: &str) -> EditorTab {
        EditorTab {
            id: title.to_lowercase(),
            note_id: format!("note-{title}"),
            title: title.to_string(),
            path: PathBuf::from(path),
            is_dirty: false,
            save_status: SaveStatus::Saved,
            disk_content_hash: None,
        }
    }

    #[test]
    fn external_tab_event_message_reports_deleted_open_file() {
        let editor_tabs = EditorTabs {
            tabs: vec![tab("Draft", "workspace/notes/draft.md")],
            active_tab_id: Some("draft".to_string()),
        };

        let message = external_tab_event_message(
            &papyro_storage::fs::WatchEvent::Deleted(PathBuf::from("workspace/notes/draft.md")),
            &editor_tabs,
        )
        .unwrap();

        assert!(message.contains("Draft was removed outside Papyro"));
        assert!(message.contains("open tab was kept"));
    }

    #[test]
    fn external_tab_event_message_reports_renamed_open_file() {
        let editor_tabs = EditorTabs {
            tabs: vec![tab("Draft", "workspace/notes/draft.md")],
            active_tab_id: Some("draft".to_string()),
        };

        let message = external_tab_event_message(
            &papyro_storage::fs::WatchEvent::Renamed {
                from: PathBuf::from("workspace/notes/draft.md"),
                to: PathBuf::from("workspace/archive/draft.md"),
            },
            &editor_tabs,
        )
        .unwrap();

        assert!(message.contains("Draft was moved outside Papyro"));
        assert!(message.contains("workspace/archive/draft.md"));
    }

    #[test]
    fn external_tab_event_message_reports_dirty_modified_open_file() {
        let mut dirty_tab = tab("Draft", "workspace/notes/draft.md");
        dirty_tab.is_dirty = true;
        dirty_tab.save_status = SaveStatus::Dirty;
        let editor_tabs = EditorTabs {
            tabs: vec![dirty_tab],
            active_tab_id: Some("draft".to_string()),
        };

        let message = external_tab_event_message(
            &papyro_storage::fs::WatchEvent::Modified(PathBuf::from("workspace/notes/draft.md")),
            &editor_tabs,
        )
        .unwrap();

        assert!(message.contains("Draft changed outside Papyro"));
        assert!(message.contains("unsaved edits"));
    }

    #[test]
    fn external_tab_event_message_ignores_clean_modified_open_file() {
        let editor_tabs = EditorTabs {
            tabs: vec![tab("Draft", "workspace/notes/draft.md")],
            active_tab_id: Some("draft".to_string()),
        };

        assert_eq!(
            external_tab_event_message(
                &papyro_storage::fs::WatchEvent::Modified(PathBuf::from(
                    "workspace/notes/draft.md"
                )),
                &editor_tabs,
            ),
            None
        );
    }

    #[test]
    fn external_tab_event_message_ignores_unopened_changes() {
        let editor_tabs = EditorTabs {
            tabs: vec![tab("Draft", "workspace/notes/draft.md")],
            active_tab_id: Some("draft".to_string()),
        };

        assert_eq!(
            external_tab_event_message(
                &papyro_storage::fs::WatchEvent::Deleted(PathBuf::from("workspace/other.md")),
                &editor_tabs,
            ),
            None
        );
    }

    #[test]
    fn workspace_refresh_ignores_content_only_modified_events() {
        let workspace_path = Path::new("workspace");

        assert!(!should_refresh_for_event(
            &papyro_storage::fs::WatchEvent::Modified(PathBuf::from("workspace/notes/a.md")),
            workspace_path,
        ));
        assert!(should_refresh_for_event(
            &papyro_storage::fs::WatchEvent::Created(PathBuf::from("workspace/notes/a.md")),
            workspace_path,
        ));
        assert!(should_refresh_for_event(
            &papyro_storage::fs::WatchEvent::Deleted(PathBuf::from("workspace/notes/a.md")),
            workspace_path,
        ));
    }

    #[test]
    fn summarize_watch_events_merges_refresh_and_open_tab_messages() {
        let editor_tabs = EditorTabs {
            tabs: vec![tab("Draft", "workspace/notes/draft.md")],
            active_tab_id: Some("draft".to_string()),
        };
        let events = vec![
            papyro_storage::fs::WatchEvent::Modified(PathBuf::from("workspace/notes/draft.md")),
            papyro_storage::fs::WatchEvent::Created(PathBuf::from("workspace/notes/new.md")),
            papyro_storage::fs::WatchEvent::Deleted(PathBuf::from("workspace/notes/draft.md")),
        ];

        let summary = summarize_watch_events(&events, Path::new("workspace"), &editor_tabs);

        assert!(summary.should_refresh);
        assert_eq!(
            summary.external_message.as_deref(),
            Some("Draft was removed outside Papyro. The open tab was kept so you can review or save it.")
        );
    }

    #[test]
    fn summarize_watch_events_ignores_non_refresh_batches() {
        let editor_tabs = EditorTabs {
            tabs: vec![tab("Draft", "workspace/notes/draft.md")],
            active_tab_id: Some("draft".to_string()),
        };
        let events = vec![
            papyro_storage::fs::WatchEvent::Modified(PathBuf::from("workspace/notes/draft.md")),
            papyro_storage::fs::WatchEvent::Created(PathBuf::from("other/new.md")),
        ];

        let summary = summarize_watch_events(&events, Path::new("workspace"), &editor_tabs);

        assert_eq!(summary, WatchEventBatchSummary::default());
    }

    #[test]
    fn summarize_watch_events_reports_dirty_modified_without_refresh() {
        let mut dirty_tab = tab("Draft", "workspace/notes/draft.md");
        dirty_tab.is_dirty = true;
        dirty_tab.save_status = SaveStatus::Dirty;
        let editor_tabs = EditorTabs {
            tabs: vec![dirty_tab],
            active_tab_id: Some("draft".to_string()),
        };
        let events = vec![papyro_storage::fs::WatchEvent::Modified(PathBuf::from(
            "workspace/notes/draft.md",
        ))];

        let summary = summarize_watch_events(&events, Path::new("workspace"), &editor_tabs);

        assert!(!summary.should_refresh);
        assert_eq!(
            summary.external_message.as_deref(),
            Some("Draft changed outside Papyro while it has unsaved edits. Manual save may overwrite the external version.")
        );
    }

    #[test]
    fn clean_modified_open_tab_paths_collects_unique_clean_tabs() {
        let editor_tabs = EditorTabs {
            tabs: vec![
                tab("Draft", "workspace/notes/draft.md"),
                tab("Other", "workspace/notes/other.md"),
            ],
            active_tab_id: Some("draft".to_string()),
        };
        let events = vec![
            papyro_storage::fs::WatchEvent::Modified(PathBuf::from("workspace/notes/draft.md")),
            papyro_storage::fs::WatchEvent::Modified(PathBuf::from("workspace/notes/draft.md")),
            papyro_storage::fs::WatchEvent::Modified(PathBuf::from("outside.md")),
            papyro_storage::fs::WatchEvent::Deleted(PathBuf::from("workspace/notes/other.md")),
        ];

        assert_eq!(
            clean_modified_open_tab_paths(&events, Path::new("workspace"), &editor_tabs),
            vec![PathBuf::from("workspace/notes/draft.md")]
        );
    }

    #[test]
    fn clean_modified_open_tab_paths_skips_dirty_tabs() {
        let mut dirty_tab = tab("Draft", "workspace/notes/draft.md");
        dirty_tab.is_dirty = true;
        dirty_tab.save_status = SaveStatus::Dirty;
        let editor_tabs = EditorTabs {
            tabs: vec![dirty_tab],
            active_tab_id: Some("draft".to_string()),
        };
        let events = vec![papyro_storage::fs::WatchEvent::Modified(PathBuf::from(
            "workspace/notes/draft.md",
        ))];

        assert!(
            clean_modified_open_tab_paths(&events, Path::new("workspace"), &editor_tabs).is_empty()
        );
    }

    #[test]
    fn dirty_modified_open_tab_ids_collects_dirty_tabs() {
        let mut dirty_tab = tab("Draft", "workspace/notes/draft.md");
        dirty_tab.is_dirty = true;
        dirty_tab.save_status = SaveStatus::Dirty;
        let editor_tabs = EditorTabs {
            tabs: vec![dirty_tab, tab("Clean", "workspace/notes/clean.md")],
            active_tab_id: Some("draft".to_string()),
        };
        let events = vec![
            papyro_storage::fs::WatchEvent::Modified(PathBuf::from("workspace/notes/draft.md")),
            papyro_storage::fs::WatchEvent::Modified(PathBuf::from("workspace/notes/draft.md")),
            papyro_storage::fs::WatchEvent::Modified(PathBuf::from("workspace/notes/clean.md")),
        ];

        assert_eq!(
            dirty_modified_open_tab_ids(&events, Path::new("workspace"), &editor_tabs),
            vec!["draft".to_string()]
        );
    }
}
