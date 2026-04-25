use super::open::open_note_from_storage;
use super::reload::reload_current_workspace_tree;
use super::utils::{current_workspace, normalized_name, selected_directory_or_workspace};
use anyhow::Result;
use papyro_core::models::DocumentStats;
use papyro_core::storage::NoteStorage;
use papyro_core::{EditorTabs, FileState, TabContentsMap};
use std::path::PathBuf;

pub(crate) fn create_note_in_storage<S>(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    name: &str,
    summarize: S,
) -> Result<PathBuf>
where
    S: FnOnce(&str) -> DocumentStats,
{
    let workspace = current_workspace(file_state)?;
    let parent = selected_directory_or_workspace(file_state, &workspace.path);
    let note_name = normalized_name(name, "Untitled");
    let path = storage.create_note(&parent, &note_name)?;

    reload_current_workspace_tree(storage, file_state)?;
    open_note_from_storage(
        storage,
        file_state,
        editor_tabs,
        tab_contents,
        path.clone(),
        summarize,
    )?;

    Ok(path)
}

pub(crate) fn create_folder_in_storage(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    name: &str,
) -> Result<PathBuf> {
    let workspace = current_workspace(file_state)?;
    let parent = selected_directory_or_workspace(file_state, &workspace.path);
    let folder_name = normalized_name(name, "New Folder");
    let path = storage.create_folder(&parent, &folder_name)?;

    reload_current_workspace_tree(storage, file_state)?;
    file_state.select_path(path.clone());

    Ok(path)
}
