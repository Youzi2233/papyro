use super::reload::reload_current_workspace_tree;
use super::utils::{current_workspace, normalized_name, refresh_open_note_after_path_change};
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

    reload_current_workspace_tree(storage, file_state)?;
    file_state.select_path(new_path.clone());

    Ok(new_path)
}
