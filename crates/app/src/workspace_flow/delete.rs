use super::reload::reload_current_workspace_tree;
use super::utils::current_workspace;
use anyhow::{anyhow, Result};
use papyro_core::storage::NoteStorage;
use papyro_core::{close_tabs_under_path, EditorTabs, FileState, TabContentsMap};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DeleteOutcome {
    pub deleted_path: PathBuf,
    pub orphaned_asset_count: usize,
}

pub(crate) fn delete_selected_path(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    _cleanup_orphaned_assets: bool,
) -> Result<DeleteOutcome> {
    let workspace = current_workspace(file_state)?;
    let selected_node = file_state
        .selected_node()
        .ok_or_else(|| anyhow!("No selected note or folder"))?;
    let target = selected_node.path.clone();

    storage.trash_path(&workspace, &target)?;
    close_tabs_under_path(editor_tabs, tab_contents, &target);
    reload_current_workspace_tree(storage, file_state)?;
    file_state.selected_path = target.parent().map(Path::to_path_buf);

    Ok(DeleteOutcome {
        deleted_path: target,
        orphaned_asset_count: 0,
    })
}
