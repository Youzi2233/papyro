use super::utils::current_workspace;
use anyhow::Result;
use papyro_core::models::DocumentStats;
use papyro_core::storage::NoteStorage;
use papyro_core::{open_note, EditorTabs, FileState, TabContentsMap};
use std::path::PathBuf;

pub(crate) fn open_note_from_storage<S>(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    path: PathBuf,
    summarize: S,
) -> Result<()>
where
    S: FnOnce(&str) -> DocumentStats,
{
    let workspace = current_workspace(file_state)?;
    let opened_note = storage.open_note(&workspace, &path)?;
    let selected_path = opened_note.tab.path.clone();
    let stats = summarize(&opened_note.content);

    open_note(editor_tabs, tab_contents, opened_note.clone(), stats);
    file_state.recent_files = opened_note.recent_files;
    file_state.select_path(selected_path);

    Ok(())
}
