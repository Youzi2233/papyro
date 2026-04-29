use super::utils::current_workspace;
use anyhow::{bail, Result};
use papyro_core::models::{DocumentStats, RecentFile, SaveStatus, Workspace};
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
    let target_workspace = workspace_for_path(file_state, &path)?;
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
    let ui_state = pending_bootstrap
        .map(|bootstrap| {
            apply_recent_workspace_bootstrap(file_state, editor_tabs, tab_contents, bootstrap)
        })
        .transpose()?;

    apply_opened_markdown(file_state, editor_tabs, tab_contents, opened_note, stats);

    Ok(OpenMarkdownOutcome {
        ui_state,
        watch_path,
    })
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
    let workspace = current_workspace(file_state)?;
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
    let selected_path = opened_note.tab.path.clone();
    let recent_files = opened_note.recent_files.clone();
    let content = opened_note.content;

    if !tab_contents.replace_saved_content(&snapshot.tab_id, content, stats) {
        return false;
    }

    editor_tabs.mark_tab_saved(&snapshot.tab_id, title);
    file_state.recent_files = recent_files;
    file_state.select_path(selected_path);
    true
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct OpenMarkdownOutcome {
    pub ui_state: Option<UiState>,
    pub watch_path: Option<PathBuf>,
}

fn workspace_for_path(file_state: &FileState, path: &Path) -> Result<Workspace> {
    let mut candidates = file_state.workspaces.clone();
    candidates.extend(file_state.recent_files.iter().map(workspace_from_recent));

    candidates
        .into_iter()
        .filter(|workspace| path.starts_with(&workspace.path))
        .max_by_key(|workspace| workspace.path.components().count())
        .or_else(|| {
            file_state
                .current_workspace
                .clone()
                .filter(|workspace| path.starts_with(&workspace.path))
        })
        .or_else(|| workspace_from_external_markdown_path(path))
        .ok_or_else(|| anyhow::anyhow!("No workspace contains {}", path.display()))
}

fn workspace_from_recent(recent: &RecentFile) -> Workspace {
    Workspace {
        id: recent.workspace_id.clone(),
        name: recent.workspace_name.clone(),
        path: recent.workspace_path.clone(),
        created_at: 0,
        last_opened: None,
        sort_order: 0,
    }
}

fn workspace_from_external_markdown_path(path: &Path) -> Option<Workspace> {
    if !is_markdown_path(path) {
        return None;
    }

    let workspace_path = path.parent()?.to_path_buf();
    Some(Workspace {
        id: format!("external:{}", workspace_path.display()),
        name: workspace_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Workspace")
            .to_string(),
        path: workspace_path,
        created_at: 0,
        last_opened: None,
        sort_order: 0,
    })
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn ensure_markdown_path(path: &Path) -> Result<()> {
    if is_markdown_path(path) {
        Ok(())
    } else {
        bail!("Only Markdown files can be opened: {}", path.display())
    }
}

fn apply_recent_workspace_bootstrap(
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    bootstrap: WorkspaceBootstrap,
) -> Result<UiState> {
    if let Some(error) = bootstrap.error_message {
        bail!("{} ({error})", bootstrap.status_message);
    }

    let ui_state = UiState::from_settings_with_overrides(
        bootstrap.global_settings,
        bootstrap.workspace_settings,
    );
    *file_state = bootstrap.file_state;
    *editor_tabs = EditorTabs::default();
    *tab_contents = TabContentsMap::default();

    Ok(ui_state)
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
