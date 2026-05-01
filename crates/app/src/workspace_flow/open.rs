use super::utils::{current_workspace, is_markdown_path, workspace_for_markdown_path};
use anyhow::{bail, Result};
use papyro_core::models::{DocumentStats, RecoveryDraft, SaveStatus, Workspace};
use papyro_core::storage::{NoteStorage, OpenedNote, WorkspaceBootstrap};
use papyro_core::{open_note, EditorTabs, FileState, TabContentsMap, UiState};
use std::path::{Path, PathBuf};

pub(crate) fn open_markdown_from_storage<S>(
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
    let (opened_note, stats) = load_opened_markdown(storage, &workspace, &path, summarize)?;
    apply_opened_markdown(file_state, editor_tabs, tab_contents, opened_note, stats);

    Ok(())
}

pub(crate) fn open_markdown_target_from_storage<S>(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    path: PathBuf,
    summarize: S,
) -> Result<OpenMarkdownOutcome>
where
    S: FnOnce(&str) -> DocumentStats,
{
    ensure_markdown_path(&path)?;
    let target_workspace = workspace_for_markdown_path(file_state, &path)?;
    let already_loaded = file_state
        .current_workspace
        .as_ref()
        .is_some_and(|workspace| workspace.path == target_workspace.path);

    let pending_bootstrap = if already_loaded {
        None
    } else {
        Some(storage.bootstrap_from_workspace(&target_workspace.path))
    };
    let open_workspace = pending_bootstrap
        .as_ref()
        .map(|bootstrap| workspace_from_bootstrap(bootstrap, &target_workspace))
        .transpose()?
        .unwrap_or_else(|| target_workspace.clone());
    let (opened_note, stats) = load_opened_markdown(storage, &open_workspace, &path, summarize)?;
    let watch_path = pending_bootstrap
        .as_ref()
        .map(|_| open_workspace.path.clone());
    let recovery_drafts = pending_bootstrap
        .as_ref()
        .map(|bootstrap| bootstrap.recovery_drafts.clone());
    let context_outcome = pending_bootstrap
        .map(|bootstrap| apply_workspace_context_bootstrap(file_state, bootstrap))
        .transpose()?;

    apply_opened_markdown(file_state, editor_tabs, tab_contents, opened_note, stats);

    Ok(OpenMarkdownOutcome {
        ui_state: context_outcome
            .as_ref()
            .and_then(|outcome| outcome.ui_state.clone()),
        watch_path,
        recovery_drafts,
    })
}

pub(crate) fn switch_workspace_context_from_storage(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    path: &Path,
) -> Result<WorkspaceContextOutcome> {
    ensure_markdown_path(path)?;
    let target_workspace = workspace_for_markdown_path(file_state, path)?;
    let already_loaded = file_state
        .current_workspace
        .as_ref()
        .is_some_and(|workspace| workspace.path == target_workspace.path);

    if already_loaded {
        file_state.select_path(path.to_path_buf());
        return Ok(WorkspaceContextOutcome {
            workspace: target_workspace,
            ui_state: None,
            watch_path: None,
            recovery_drafts: None,
        });
    }

    let bootstrap = storage.bootstrap_from_workspace(&target_workspace.path);
    let workspace = workspace_from_bootstrap(&bootstrap, &target_workspace)?;
    let mut outcome = apply_workspace_context_bootstrap(file_state, bootstrap)?;
    outcome.workspace = workspace;
    file_state.select_path(path.to_path_buf());

    Ok(outcome)
}

fn load_opened_markdown<S>(
    storage: &dyn NoteStorage,
    workspace: &Workspace,
    path: &Path,
    summarize: S,
) -> Result<(OpenedNote, DocumentStats)>
where
    S: FnOnce(&str) -> DocumentStats,
{
    let opened_note = storage.open_note(workspace, path)?;
    let stats = summarize(&opened_note.content);
    Ok((opened_note, stats))
}

fn apply_opened_markdown(
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    opened_note: OpenedNote,
    stats: DocumentStats,
) {
    let recent_files = opened_note.recent_files.clone();
    let selected_path = open_note(editor_tabs, tab_contents, opened_note, stats);
    file_state.recent_files = recent_files;
    file_state.select_path(selected_path);
}

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
    open_markdown_from_storage(
        storage,
        file_state,
        editor_tabs,
        tab_contents,
        path,
        summarize,
    )
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CleanOpenTabRefreshSnapshot {
    pub tab_id: String,
    pub path: PathBuf,
    pub revision: u64,
}

pub(crate) fn begin_clean_open_tab_refresh(
    editor_tabs: &EditorTabs,
    tab_contents: &TabContentsMap,
    path: &Path,
) -> Option<CleanOpenTabRefreshSnapshot> {
    let tab = editor_tabs.tabs.iter().find(|tab| tab.path == path)?;
    if tab.is_dirty || tab.save_status != SaveStatus::Saved {
        return None;
    }

    Some(CleanOpenTabRefreshSnapshot {
        tab_id: tab.id.clone(),
        path: tab.path.clone(),
        revision: tab_contents.revision_for_tab(&tab.id)?,
    })
}

pub(crate) fn read_clean_open_tab_refresh_from_storage<S>(
    storage: &dyn NoteStorage,
    file_state: &FileState,
    path: &Path,
    summarize: S,
) -> Result<(OpenedNote, DocumentStats)>
where
    S: FnOnce(&str) -> DocumentStats,
{
    let workspace = workspace_for_markdown_path(file_state, path)?;
    load_opened_markdown(storage, &workspace, path, summarize)
}

pub(crate) fn apply_clean_open_tab_refresh(
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    snapshot: &CleanOpenTabRefreshSnapshot,
    opened_note: OpenedNote,
    stats: DocumentStats,
) -> bool {
    let Some(tab) = editor_tabs.tab_by_id(&snapshot.tab_id) else {
        return false;
    };
    if tab.path != snapshot.path
        || tab.is_dirty
        || tab.save_status != SaveStatus::Saved
        || tab_contents.revision_for_tab(&snapshot.tab_id) != Some(snapshot.revision)
        || tab_contents.content_for_tab(&snapshot.tab_id) == Some(opened_note.content.as_str())
    {
        return false;
    }

    let title = opened_note.tab.title.clone();
    let disk_content_hash = opened_note.tab.disk_content_hash;
    let selected_path = opened_note.tab.path.clone();
    let recent_files = opened_note.recent_files.clone();
    let content = opened_note.content;

    if !tab_contents.replace_saved_content(&snapshot.tab_id, content, stats) {
        return false;
    }

    editor_tabs.mark_tab_saved(&snapshot.tab_id, title, disk_content_hash);
    file_state.recent_files = recent_files;
    file_state.select_path(selected_path);
    true
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ConflictReloadSnapshot {
    pub tab_id: String,
    pub path: PathBuf,
    pub revision: u64,
}

pub(crate) fn begin_conflict_reload_tab(
    editor_tabs: &EditorTabs,
    tab_contents: &TabContentsMap,
    tab_id: &str,
) -> Option<ConflictReloadSnapshot> {
    let tab = editor_tabs.tab_by_id(tab_id)?;
    if tab.save_status != SaveStatus::Conflict {
        return None;
    }

    Some(ConflictReloadSnapshot {
        tab_id: tab.id.clone(),
        path: tab.path.clone(),
        revision: tab_contents.revision_for_tab(&tab.id)?,
    })
}

pub(crate) fn read_conflict_reload_from_storage<S>(
    storage: &dyn NoteStorage,
    file_state: &FileState,
    path: &Path,
    summarize: S,
) -> Result<(OpenedNote, DocumentStats)>
where
    S: FnOnce(&str) -> DocumentStats,
{
    let workspace = workspace_for_markdown_path(file_state, path)?;
    load_opened_markdown(storage, &workspace, path, summarize)
}

pub(crate) fn apply_conflict_reload(
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    snapshot: &ConflictReloadSnapshot,
    opened_note: OpenedNote,
    stats: DocumentStats,
) -> bool {
    let Some(tab) = editor_tabs.tab_by_id(&snapshot.tab_id) else {
        return false;
    };
    if tab.path != snapshot.path
        || tab.save_status != SaveStatus::Conflict
        || opened_note.tab.path != snapshot.path
        || tab_contents.revision_for_tab(&snapshot.tab_id) != Some(snapshot.revision)
    {
        return false;
    }

    let title = opened_note.tab.title.clone();
    let disk_content_hash = opened_note.tab.disk_content_hash;
    let selected_path = opened_note.tab.path.clone();
    let recent_files = opened_note.recent_files.clone();
    let content = opened_note.content;

    if !tab_contents.replace_saved_content(&snapshot.tab_id, content, stats) {
        return false;
    }

    editor_tabs.mark_tab_saved(&snapshot.tab_id, title, disk_content_hash);
    file_state.recent_files = recent_files;
    file_state.select_path(selected_path);
    true
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct OpenMarkdownOutcome {
    pub ui_state: Option<UiState>,
    pub watch_path: Option<PathBuf>,
    pub recovery_drafts: Option<Vec<RecoveryDraft>>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct WorkspaceContextOutcome {
    pub workspace: Workspace,
    pub ui_state: Option<UiState>,
    pub watch_path: Option<PathBuf>,
    pub recovery_drafts: Option<Vec<RecoveryDraft>>,
}

fn ensure_markdown_path(path: &Path) -> Result<()> {
    if is_markdown_path(path) {
        Ok(())
    } else {
        bail!("Only Markdown files can be opened: {}", path.display())
    }
}

fn apply_workspace_context_bootstrap(
    file_state: &mut FileState,
    bootstrap: WorkspaceBootstrap,
) -> Result<WorkspaceContextOutcome> {
    if let Some(error) = bootstrap.error_message {
        bail!("{} ({error})", bootstrap.status_message);
    }

    let previous_file_state = file_state.clone();
    let ui_state = UiState::from_settings_with_overrides(
        bootstrap.global_settings.clone(),
        bootstrap.workspace_settings.clone(),
    );
    let workspace = bootstrap
        .file_state
        .current_workspace
        .clone()
        .ok_or_else(|| anyhow::anyhow!("Workspace bootstrap did not include a workspace"))?;
    let watch_path = bootstrap
        .workspace_root
        .clone()
        .or_else(|| Some(workspace.path.clone()));
    let recovery_drafts = bootstrap.recovery_drafts.clone();
    let mut next_file_state = bootstrap.file_state;
    next_file_state.workspaces = merged_workspaces(&previous_file_state, &next_file_state);

    *file_state = next_file_state;

    Ok(WorkspaceContextOutcome {
        workspace,
        ui_state: Some(ui_state),
        watch_path,
        recovery_drafts: Some(recovery_drafts),
    })
}

fn workspace_from_bootstrap(
    bootstrap: &WorkspaceBootstrap,
    fallback: &Workspace,
) -> Result<Workspace> {
    if let Some(error) = &bootstrap.error_message {
        bail!("{} ({error})", bootstrap.status_message);
    }

    Ok(bootstrap
        .file_state
        .current_workspace
        .clone()
        .unwrap_or_else(|| fallback.clone()))
}

fn merged_workspaces(previous: &FileState, next: &FileState) -> Vec<Workspace> {
    let mut workspaces = next.workspaces.clone();
    for workspace in previous
        .workspaces
        .iter()
        .chain(previous.current_workspace.iter())
    {
        if !workspaces
            .iter()
            .any(|item| item.id == workspace.id || item.path == workspace.path)
        {
            workspaces.push(workspace.clone());
        }
    }

    workspaces
}
