use super::utils::{
    current_workspace, normalized_name, rebase_file_node, refresh_open_note_after_path_change,
    refresh_recent_files, remove_file_node,
};
use anyhow::{anyhow, Result};
use papyro_core::models::FileNodeKind;
use papyro_core::storage::NoteStorage;
use papyro_core::{close_tabs_under_path, EditorTabs, FileState, TabContentsMap};
use std::path::PathBuf;

pub(crate) fn rename_selected_path(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    new_name: &str,
) -> Result<PathBuf> {
    let workspace = current_workspace(file_state)?;
    let selected_node = file_state
        .selected_node()
        .ok_or_else(|| anyhow!("No selected note or folder"))?;
    let old_path = selected_node.path.clone();
    let name = normalized_name(new_name, &selected_node.name);
    let new_path = storage.rename_path(&workspace, &old_path, &name)?;

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

    if let Some(mut node) = remove_file_node(&mut file_state.file_tree, &old_path) {
        rebase_file_node(&mut node, &workspace.path, &old_path, &new_path);
        let parent = new_path
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| workspace.path.clone());
        if parent == workspace.path {
            file_state.file_tree.push(node);
        } else {
            super::utils::insert_file_node(&mut file_state.file_tree, &parent, node);
            file_state.expanded_paths.insert(parent);
        }
    }
    refresh_recent_files(storage, file_state)?;
    file_state.select_path(new_path.clone());

    Ok(new_path)
}
