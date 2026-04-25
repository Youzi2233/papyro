use super::utils::{current_workspace, tree_contains_path};
use anyhow::Result;
use papyro_core::storage::{NoteStorage, WorkspaceBootstrap};
use papyro_core::{EditorTabs, FileState, TabContentsMap, UiState};
use std::path::Path;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AppliedBootstrap {
    pub file_state: FileState,
    pub editor_tabs: EditorTabs,
    pub tab_contents: TabContentsMap,
    pub ui_state: UiState,
    pub status_message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct WorkspaceReloadOutcome {
    pub file_state: FileState,
    pub status_message: Option<String>,
}

pub(super) fn reload_current_workspace_tree(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
) -> Result<()> {
    let workspace = current_workspace(file_state)?;
    let previous_selected = file_state.selected_path.clone();
    let (file_tree, recent_files) = storage.reload_workspace_tree(&workspace)?;

    file_state.file_tree = file_tree;
    file_state.recent_files = recent_files;

    if let Some(selected_path) = previous_selected {
        file_state.selected_path =
            tree_contains_path(&file_state.file_tree, &selected_path).then_some(selected_path);
    }

    Ok(())
}

pub(crate) fn apply_workspace_bootstrap(bootstrap: WorkspaceBootstrap) -> AppliedBootstrap {
    let detail = bootstrap
        .error_message
        .as_ref()
        .map(|error| format!("{} ({error})", bootstrap.status_message))
        .unwrap_or(bootstrap.status_message);

    AppliedBootstrap {
        file_state: bootstrap.file_state,
        editor_tabs: EditorTabs::default(),
        tab_contents: TabContentsMap::default(),
        ui_state: UiState::from_settings_with_overrides(
            bootstrap.global_settings,
            bootstrap.workspace_settings,
        ),
        status_message: detail,
    }
}

pub(crate) fn merge_bootstrap_file_state(previous: &FileState, mut next: FileState) -> FileState {
    next.expanded_paths = previous.expanded_paths.clone();

    if let Some(selected_path) = previous.selected_path.clone() {
        if tree_contains_path(&next.file_tree, &selected_path) {
            next.selected_path = Some(selected_path);
        }
    }

    next
}

pub(crate) fn reload_workspace_or_bootstrap(
    storage: &dyn NoteStorage,
    previous: &FileState,
    workspace_path: &Path,
) -> Result<WorkspaceReloadOutcome> {
    let already_loaded = previous
        .current_workspace
        .as_ref()
        .map(|workspace| workspace.path == workspace_path)
        .unwrap_or(false);

    if already_loaded {
        let workspace = previous
            .current_workspace
            .clone()
            .expect("already_loaded implies Some");

        if let Ok((file_tree, recent_files)) = storage.reload_workspace_tree(&workspace) {
            let mut next_state = previous.clone();
            next_state.file_tree = file_tree;
            next_state.recent_files = recent_files;

            if let Some(selected_path) = previous.selected_path.clone() {
                next_state.selected_path =
                    tree_contains_path(&next_state.file_tree, &selected_path)
                        .then_some(selected_path);
            }

            return Ok(WorkspaceReloadOutcome {
                file_state: next_state,
                status_message: None,
            });
        }
    }

    let bootstrap = storage.bootstrap_from_workspace(workspace_path);
    let detail = bootstrap
        .error_message
        .as_ref()
        .map(|error| format!("{} ({error})", bootstrap.status_message))
        .unwrap_or_else(|| bootstrap.status_message.clone());

    let file_state = if bootstrap.error_message.is_none() {
        merge_bootstrap_file_state(previous, bootstrap.file_state)
    } else {
        previous.clone()
    };

    Ok(WorkspaceReloadOutcome {
        file_state,
        status_message: Some(detail),
    })
}
