use super::utils::current_workspace;
use anyhow::{anyhow, Result};
use papyro_core::storage::NoteStorage;
use papyro_core::{mark_tab_saved, EditorTabs, FileState, TabContentsMap};

pub(crate) fn save_tab_to_storage(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    tab_id: &str,
) -> Result<()> {
    let workspace = current_workspace(file_state)?;
    let tab = editor_tabs
        .tab_by_id(tab_id)
        .cloned()
        .ok_or_else(|| anyhow!("Tab not found: {tab_id}"))?;
    let content = tab_contents.content_for_tab(tab_id).unwrap_or_default();

    let saved_note = storage.save_note(&workspace, &tab, content)?;
    mark_tab_saved(editor_tabs, saved_note);
    file_state.recent_files = storage.list_recent(10)?;

    Ok(())
}
