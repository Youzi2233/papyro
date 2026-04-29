use super::utils::current_workspace;
use anyhow::{anyhow, bail, Result};
use papyro_core::models::{EditorTab, RecentFile, SaveStatus, Workspace};
use papyro_core::storage::{NoteStorage, SavedAsNote, SavedNote};
use papyro_core::{
    begin_tab_save, mark_tab_conflict_if_current, mark_tab_save_failed_if_current,
    mark_tab_saved_if_current, EditorTabs, FileState, SaveConflict, TabContentsMap,
};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SaveTabSnapshot {
    pub workspace: Workspace,
    pub tab: EditorTab,
    pub content: String,
    pub revision: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SaveAsTabSnapshot {
    pub save: SaveTabSnapshot,
    pub target_path: PathBuf,
}

impl SaveTabSnapshot {
    pub fn tab_id(&self) -> &str {
        &self.tab.id
    }
}

impl SaveAsTabSnapshot {
    pub fn tab_id(&self) -> &str {
        self.save.tab_id()
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

pub(crate) fn begin_conflict_overwrite_tab(
    file_state: &FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    tab_id: &str,
) -> Result<SaveTabSnapshot> {
    let workspace = current_workspace(file_state)?;
    let tab = editor_tabs
        .tab_by_id(tab_id)
        .ok_or_else(|| anyhow!("Tab not found: {tab_id}"))?;
    if tab.save_status != SaveStatus::Conflict {
        bail!("Tab is not in a save conflict: {tab_id}");
    }

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

pub(crate) fn begin_conflict_save_as_tab(
    file_state: &FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    tab_id: &str,
    target_path: PathBuf,
) -> Result<SaveAsTabSnapshot> {
    let workspace = current_workspace(file_state)?;
    ensure_save_as_target(&workspace, editor_tabs, tab_id, &target_path)?;
    let tab = editor_tabs
        .tab_by_id(tab_id)
        .ok_or_else(|| anyhow!("Tab not found: {tab_id}"))?;
    if tab.save_status != SaveStatus::Conflict {
        bail!("Tab is not in a save conflict: {tab_id}");
    }

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

    Ok(SaveAsTabSnapshot {
        save: SaveTabSnapshot {
            workspace,
            tab,
            content,
            revision,
        },
        target_path,
    })
}

fn ensure_save_as_target(
    workspace: &Workspace,
    editor_tabs: &EditorTabs,
    tab_id: &str,
    target_path: &Path,
) -> Result<()> {
    if !target_path.starts_with(&workspace.path) {
        bail!("Save as target must stay inside the current workspace");
    }
    if !is_markdown_path(target_path) {
        bail!("Save as target must be a Markdown file");
    }
    if editor_tabs
        .tabs
        .iter()
        .any(|tab| tab.id == tab_id && tab.path == target_path)
    {
        bail!("Save as target must be different from the current note path");
    }
    if editor_tabs
        .tabs
        .iter()
        .any(|tab| tab.id != tab_id && tab.path == target_path)
    {
        bail!("Save as target is already open in another tab");
    }

    Ok(())
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
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

pub(crate) fn write_overwrite_snapshot(
    storage: &dyn NoteStorage,
    snapshot: &SaveTabSnapshot,
) -> Result<(SavedNote, Vec<RecentFile>)> {
    let saved_note =
        storage.overwrite_note(&snapshot.workspace, &snapshot.tab, &snapshot.content)?;
    let recent_files = storage.list_recent(10)?;
    Ok((saved_note, recent_files))
}

pub(crate) fn write_save_as_snapshot(
    storage: &dyn NoteStorage,
    snapshot: &SaveAsTabSnapshot,
) -> Result<(SavedAsNote, Vec<RecentFile>)> {
    let saved_note = storage.save_note_as(
        &snapshot.save.workspace,
        &snapshot.save.tab,
        &snapshot.save.content,
        &snapshot.target_path,
    )?;
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

pub(crate) fn apply_save_as_success(
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    snapshot: &SaveAsTabSnapshot,
    saved_note: SavedAsNote,
    recent_files: Vec<RecentFile>,
) -> bool {
    if !tab_contents.should_auto_save_revision(snapshot.tab_id(), snapshot.save.revision) {
        return false;
    }

    let selected_path = saved_note.path.clone();
    let applied = editor_tabs.mark_tab_saved_as(
        &saved_note.tab_id,
        saved_note.note_id,
        saved_note.title,
        saved_note.path,
        saved_note.disk_content_hash,
    );
    if applied {
        file_state.recent_files = recent_files;
        file_state.select_path(selected_path);
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

#[cfg(test)]
pub(crate) fn overwrite_tab_to_storage(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    tab_id: &str,
) -> Result<()> {
    let snapshot = begin_conflict_overwrite_tab(file_state, editor_tabs, tab_contents, tab_id)?;

    match write_overwrite_snapshot(storage, &snapshot) {
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

#[cfg(test)]
pub(crate) fn save_as_tab_to_storage(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    tab_id: &str,
    target_path: PathBuf,
) -> Result<()> {
    let snapshot =
        begin_conflict_save_as_tab(file_state, editor_tabs, tab_contents, tab_id, target_path)?;

    match write_save_as_snapshot(storage, &snapshot) {
        Ok((saved_note, recent_files)) => {
            apply_save_as_success(
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
            apply_save_failure(editor_tabs, tab_contents, &snapshot.save);
            Err(error)
        }
    }
}
