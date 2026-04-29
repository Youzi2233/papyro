use crate::models::{
    AppSettings, EditorTab, FileNode, RecentFile, Tag, TrashedNote, Workspace,
    WorkspaceSettingsOverrides, WorkspaceTreeState,
};
use crate::FileState;
use crate::{SearchResult, WorkspaceSearchQuery};
use anyhow::Result;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct WorkspaceSnapshot {
    pub workspace: Workspace,
    pub file_tree: Vec<FileNode>,
    pub recent_files: Vec<RecentFile>,
    pub trashed_notes: Vec<TrashedNote>,
    pub tags: Vec<Tag>,
    pub db_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OpenedNote {
    pub tab: EditorTab,
    pub content: String,
    pub recent_files: Vec<RecentFile>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SavedNote {
    pub tab_id: String,
    pub title: String,
    pub disk_content_hash: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SavedAsNote {
    pub tab_id: String,
    pub note_id: String,
    pub title: String,
    pub path: PathBuf,
    pub disk_content_hash: Option<u64>,
}

#[derive(Debug, thiserror::Error)]
#[error("Save conflict: {path} changed on disk since it was opened")]
pub struct SaveConflict {
    pub path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DeletePreview {
    pub orphaned_assets: Vec<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct EmptyTrashOutcome {
    pub deleted_note_count: usize,
    pub deleted_asset_count: usize,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct WorkspaceBootstrap {
    pub file_state: FileState,
    pub workspace_root: Option<PathBuf>,
    pub db_path: Option<PathBuf>,
    pub status_message: String,
    pub error_message: Option<String>,
    pub settings: AppSettings,
    pub global_settings: AppSettings,
    pub workspace_settings: WorkspaceSettingsOverrides,
}

pub trait NoteStorage: Send + Sync {
    fn open_note(&self, workspace: &Workspace, path: &Path) -> Result<OpenedNote>;
    fn save_note(&self, workspace: &Workspace, tab: &EditorTab, content: &str)
        -> Result<SavedNote>;
    fn overwrite_note(
        &self,
        workspace: &Workspace,
        tab: &EditorTab,
        content: &str,
    ) -> Result<SavedNote>;
    fn save_note_as(
        &self,
        workspace: &Workspace,
        tab: &EditorTab,
        content: &str,
        target_path: &Path,
    ) -> Result<SavedAsNote>;
    fn create_note(&self, parent: &Path, name: &str) -> Result<PathBuf>;
    fn create_folder(&self, parent: &Path, name: &str) -> Result<PathBuf>;
    fn delete_path(&self, path: &Path) -> Result<()>;
    fn trash_path(&self, workspace: &Workspace, path: &Path) -> Result<PathBuf>;
    fn list_trashed_notes(&self, workspace: &Workspace) -> Result<Vec<crate::models::TrashedNote>>;
    fn restore_trashed_note(&self, workspace: &Workspace, note_id: &str) -> Result<PathBuf>;
    fn empty_trash(&self, workspace: &Workspace) -> Result<EmptyTrashOutcome>;
    fn preview_delete_path(&self, workspace: &Workspace, path: &Path) -> Result<DeletePreview>;
    fn delete_paths(&self, paths: &[PathBuf]) -> Result<()>;
    fn rename_path(&self, workspace: &Workspace, path: &Path, new_name: &str) -> Result<PathBuf>;
    fn move_path(&self, workspace: &Workspace, path: &Path, target_dir: &Path) -> Result<PathBuf>;
    fn bootstrap_from_workspace(&self, root: &Path) -> WorkspaceBootstrap;
    fn initialize_workspace(&self, root: &Path) -> Result<WorkspaceSnapshot>;
    fn reload_workspace_tree(
        &self,
        workspace: &Workspace,
    ) -> Result<(Vec<FileNode>, Vec<RecentFile>, Vec<Tag>)>;
    fn search_workspace(
        &self,
        workspace: &Workspace,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchResult>>;
    fn search_workspace_with_query(
        &self,
        workspace: &Workspace,
        query: &WorkspaceSearchQuery,
    ) -> Result<Vec<SearchResult>> {
        self.search_workspace(workspace, &query.text, query.limit)
    }
    fn set_note_favorite(&self, workspace: &Workspace, path: &Path, favorite: bool) -> Result<()>;
    fn list_tags(&self) -> Result<Vec<Tag>>;
    fn upsert_tag(&self, name: &str, color: &str) -> Result<Tag>;
    fn rename_tag(&self, old_id: &str, name: &str) -> Result<Tag>;
    fn set_tag_color(&self, id: &str, color: &str) -> Result<Tag>;
    fn delete_tag(&self, id: &str) -> Result<()>;
    fn list_recent_workspaces(&self, limit: usize) -> Result<Vec<Workspace>>;
    fn list_recent(&self, limit: usize) -> Result<Vec<RecentFile>>;
    fn load_settings(&self) -> AppSettings;
    fn save_settings(&self, settings: &AppSettings) -> Result<()>;
    fn load_workspace_settings(&self, workspace: &Workspace) -> WorkspaceSettingsOverrides;
    fn save_workspace_settings(
        &self,
        workspace: &Workspace,
        overrides: &WorkspaceSettingsOverrides,
    ) -> Result<()>;
    fn load_workspace_tree_state(&self, workspace: &Workspace) -> WorkspaceTreeState;
    fn save_workspace_tree_state(
        &self,
        workspace: &Workspace,
        state: &WorkspaceTreeState,
    ) -> Result<()>;
}
