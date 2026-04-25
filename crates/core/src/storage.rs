use crate::models::{AppSettings, EditorTab, FileNode, RecentFile, Workspace};
use crate::FileState;
use anyhow::Result;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct WorkspaceSnapshot {
    pub workspace: Workspace,
    pub file_tree: Vec<FileNode>,
    pub recent_files: Vec<RecentFile>,
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
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct WorkspaceBootstrap {
    pub file_state: FileState,
    pub workspace_root: Option<PathBuf>,
    pub db_path: Option<PathBuf>,
    pub status_message: String,
    pub error_message: Option<String>,
    pub settings: AppSettings,
}

pub trait NoteStorage: Send + Sync {
    fn open_note(&self, workspace: &Workspace, path: &Path) -> Result<OpenedNote>;
    fn save_note(&self, workspace: &Workspace, tab: &EditorTab, content: &str)
        -> Result<SavedNote>;
    fn create_note(&self, parent: &Path, name: &str) -> Result<PathBuf>;
    fn create_folder(&self, parent: &Path, name: &str) -> Result<PathBuf>;
    fn delete_path(&self, path: &Path) -> Result<()>;
    fn rename_path(&self, workspace: &Workspace, path: &Path, new_name: &str) -> Result<PathBuf>;
    fn bootstrap_from_workspace(&self, root: &Path) -> WorkspaceBootstrap;
    fn initialize_workspace(&self, root: &Path) -> Result<WorkspaceSnapshot>;
    fn reload_workspace_tree(
        &self,
        workspace: &Workspace,
    ) -> Result<(Vec<FileNode>, Vec<RecentFile>)>;
    fn list_recent_workspaces(&self, limit: usize) -> Result<Vec<Workspace>>;
    fn list_recent(&self, limit: usize) -> Result<Vec<RecentFile>>;
    fn load_settings(&self) -> AppSettings;
    fn save_settings(&self, settings: &AppSettings) -> Result<()>;
}
