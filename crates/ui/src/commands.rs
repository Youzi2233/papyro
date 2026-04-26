use dioxus::prelude::*;
use papyro_core::models::{AppSettings, FileNode, WorkspaceSettingsOverrides};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentChange {
    pub tab_id: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FileTarget {
    pub path: PathBuf,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecentFileTarget {
    pub workspace_path: PathBuf,
    pub relative_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoreTrashedNoteTarget {
    pub note_id: String,
}

#[derive(Clone, PartialEq)]
pub struct AppCommands {
    pub open_workspace: EventHandler<()>,
    pub open_workspace_path: EventHandler<PathBuf>,
    pub refresh_workspace: EventHandler<()>,
    pub create_note: EventHandler<String>,
    pub create_folder: EventHandler<String>,
    pub open_note: EventHandler<FileNode>,
    pub open_recent_file: EventHandler<RecentFileTarget>,
    pub search_workspace: EventHandler<String>,
    pub content_changed: EventHandler<ContentChange>,
    pub save_active_note: EventHandler<()>,
    pub save_tab: EventHandler<String>,
    pub close_tab: EventHandler<String>,
    pub rename_selected: EventHandler<String>,
    pub move_selected_to: EventHandler<PathBuf>,
    pub set_selected_favorite: EventHandler<bool>,
    pub restore_trashed_note: EventHandler<RestoreTrashedNoteTarget>,
    pub delete_selected: EventHandler<()>,
    pub toggle_expanded_path: EventHandler<PathBuf>,
    pub reveal_in_explorer: EventHandler<FileTarget>,
    pub export_html: EventHandler<()>,
    pub save_settings: EventHandler<AppSettings>,
    pub save_workspace_settings: EventHandler<WorkspaceSettingsOverrides>,
}
