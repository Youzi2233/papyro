use super::utils::current_workspace;
use anyhow::{anyhow, Result};
use papyro_core::models::{EditorTab, RecentFile, Workspace};
use papyro_core::storage::{NoteStorage, SavedNote};
use papyro_core::{
    begin_tab_save, mark_tab_conflict_if_current, mark_tab_save_failed_if_current,
    mark_tab_saved_if_current, EditorTabs, FileState, SaveConflict, TabContentsMap,
};

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SaveTabSnapshot {
    pub workspace: Workspace,
    pub tab: EditorTab,
    pub content: String,
    pub revision: u64,
}

impl SaveTabSnapshot {
    pub fn tab_id(&self) -> &str {
        &self.tab.id
    }
}

pub(crate) fn begin_save_tab(
    file_state: &FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    tab_id: &str,
) -> Result<SaveTabSnapshot> {
    let workspace = current_workspace(file_state)?;
    let revision = begin_tab_save(editor_tabs, tab_contents, tab_id)
        .ok_or_else(|| anyhow!("Tab not found: {tab_id}"))?;
    let tab = editor_tabs
        .tab_by_id(tab_id)
        .cloned()
        .ok_or_else(|| anyhow!("Tab not found: {tab_id}"))?;
    let content = tab_contents
        .content_for_tab(tab_id)
        .unwrap_or_default()
        .to_string();

    Ok(SaveTabSnapshot {
        workspace,
        tab,
        content,
        revision,
    })
}

pub(crate) fn write_save_snapshot(
    storage: &dyn NoteStorage,
    snapshot: &SaveTabSnapshot,
) -> Result<(SavedNote, Vec<RecentFile>)> {
    let saved_note = storage.save_note(&snapshot.workspace, &snapshot.tab, &snapshot.content)?;
    let recent_files = storage.list_recent(10)?;
    Ok((saved_note, recent_files))
}

pub(crate) fn apply_save_success(
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    snapshot: &SaveTabSnapshot,
    saved_note: SavedNote,
    recent_files: Vec<RecentFile>,
) -> bool {
    let applied =
        mark_tab_saved_if_current(editor_tabs, tab_contents, saved_note, snapshot.revision);
    if applied {
        file_state.recent_files = recent_files;
    }
    applied
}

pub(crate) fn apply_save_failure(
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    snapshot: &SaveTabSnapshot,
) -> bool {
    mark_tab_save_failed_if_current(
        editor_tabs,
        tab_contents,
        snapshot.tab_id(),
        snapshot.revision,
    )
}

pub(crate) fn apply_save_error(
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    snapshot: &SaveTabSnapshot,
    error: &anyhow::Error,
) -> bool {
    if error.downcast_ref::<SaveConflict>().is_some() {
        return mark_tab_conflict_if_current(
            editor_tabs,
            tab_contents,
            snapshot.tab_id(),
            snapshot.revision,
        );
    }

    apply_save_failure(editor_tabs, tab_contents, snapshot)
}

#[cfg(test)]
pub(crate) fn save_tab_to_storage(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    tab_id: &str,
) -> Result<()> {
    let snapshot = begin_save_tab(file_state, editor_tabs, tab_contents, tab_id)?;

    match write_save_snapshot(storage, &snapshot) {
        Ok((saved_note, recent_files)) => {
            apply_save_success(
                file_state,
                editor_tabs,
                tab_contents,
                &snapshot,
                saved_note,
                recent_files,
            );
            Ok(())
        }
        Err(error) => {
            apply_save_error(editor_tabs, tab_contents, &snapshot, &error);
            Err(error)
        }
    }
}
