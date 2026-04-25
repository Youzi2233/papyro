use super::utils::current_workspace;
use anyhow::{bail, Result};
use papyro_core::models::DocumentStats;
use papyro_core::storage::{NoteStorage, WorkspaceBootstrap};
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

pub(crate) fn open_recent_file_from_storage<S>(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    workspace_path: PathBuf,
    relative_path: PathBuf,
    summarize: S,
) -> Result<()>
where
    S: FnOnce(&str) -> DocumentStats,
{
    let already_loaded = file_state
        .current_workspace
        .as_ref()
        .is_some_and(|workspace| workspace.path == workspace_path);

    if !already_loaded {
        apply_recent_workspace_bootstrap(
            file_state,
            editor_tabs,
            tab_contents,
            storage.bootstrap_from_workspace(&workspace_path),
        )?;
    }

    open_note_from_storage(
        storage,
        file_state,
        editor_tabs,
        tab_contents,
        workspace_path.join(relative_path),
        summarize,
    )
}

fn apply_recent_workspace_bootstrap(
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    bootstrap: WorkspaceBootstrap,
) -> Result<()> {
    if let Some(error) = bootstrap.error_message {
        bail!("{} ({error})", bootstrap.status_message);
    }

    *file_state = bootstrap.file_state;
    *editor_tabs = EditorTabs::default();
    *tab_contents = TabContentsMap::default();

    Ok(())
}
