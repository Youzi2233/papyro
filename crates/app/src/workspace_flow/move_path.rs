use super::reload::reload_current_workspace_tree;
use super::utils::{current_workspace, refresh_open_note_after_path_change};
use anyhow::{anyhow, bail, Result};
use papyro_core::models::{FileNode, FileNodeKind};
use papyro_core::storage::NoteStorage;
use papyro_core::{close_tabs_under_path, EditorTabs, FileState, TabContentsMap};
use std::path::{Component, Path, PathBuf};

pub(crate) fn move_selected_path(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    target_dir: &Path,
) -> Result<PathBuf> {
    let workspace = current_workspace(file_state)?;
    let selected_node = file_state
        .selected_node()
        .ok_or_else(|| anyhow!("No selected note or folder"))?;
    let old_path = selected_node.path.clone();
    let target_dir = normalize_move_target(&workspace.path, target_dir)?;

    if target_dir == old_path.parent().unwrap_or_else(|| Path::new("")) {
        bail!("Selected item is already in the target folder");
    }
    if matches!(selected_node.kind, FileNodeKind::Directory { .. })
        && target_dir.starts_with(&old_path)
    {
        bail!("Cannot move a folder into itself");
    }
    if !tree_contains_directory(&file_state.file_tree, &target_dir) && target_dir != workspace.path
    {
        bail!("Move target is not a workspace folder");
    }

    let new_path = storage.move_path(&workspace, &old_path, &target_dir)?;

    match selected_node.kind {
        FileNodeKind::Directory { .. } => {
            close_tabs_under_path(editor_tabs, tab_contents, &old_path);
        }
        FileNodeKind::Note { .. } => {
            refresh_open_note_after_path_change(
                &workspace,
                editor_tabs,
                tab_contents,
                &old_path,
                &new_path,
            )?;
            editor_tabs.update_tab_path(&old_path, new_path.clone());
        }
    }

    reload_current_workspace_tree(storage, file_state)?;
    file_state.select_path(new_path.clone());

    Ok(new_path)
}

fn normalize_move_target(workspace_root: &Path, target_dir: &Path) -> Result<PathBuf> {
    if target_dir
        .components()
        .any(|component| component == Component::ParentDir)
    {
        bail!("Move target must stay inside the current workspace");
    }

    let candidate = if target_dir.is_absolute() || target_dir.starts_with(workspace_root) {
        target_dir.to_path_buf()
    } else {
        workspace_root.join(target_dir)
    };

    ensure_workspace_target(workspace_root, &candidate)
}

fn ensure_workspace_target(workspace_root: &Path, target_dir: &Path) -> Result<PathBuf> {
    if target_dir.starts_with(workspace_root) {
        Ok(target_dir.to_path_buf())
    } else {
        bail!("Move target must stay inside the current workspace");
    }
}

fn tree_contains_directory(nodes: &[FileNode], target: &Path) -> bool {
    nodes.iter().any(|node| match &node.kind {
        FileNodeKind::Directory { children } => {
            node.path == target || tree_contains_directory(children, target)
        }
        FileNodeKind::Note { .. } => false,
    })
}
