use dioxus::prelude::*;
use papyro_core::models::{AppSettings, WorkspaceSettingsOverrides};
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
pub struct OpenMarkdownTarget {
    pub path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoreTrashedNoteTarget {
    pub note_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpsertTagRequest {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenameTagRequest {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetTagColorRequest {
    pub id: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteTagRequest {
    pub id: String,
}

#[derive(Clone, PartialEq)]
pub struct AppCommands {
    pub open_workspace: EventHandler<()>,
    pub open_workspace_path: EventHandler<PathBuf>,
    pub refresh_workspace: EventHandler<()>,
    pub create_note: EventHandler<String>,
    pub create_folder: EventHandler<String>,
    pub open_markdown: EventHandler<OpenMarkdownTarget>,
    pub search_workspace: EventHandler<String>,
    pub content_changed: EventHandler<ContentChange>,
    pub activate_tab: EventHandler<String>,
    pub save_active_note: EventHandler<()>,
    pub save_tab: EventHandler<String>,
    pub close_tab: EventHandler<String>,
    pub rename_selected: EventHandler<String>,
    pub move_selected_to: EventHandler<PathBuf>,
    pub set_selected_favorite: EventHandler<bool>,
    pub restore_trashed_note: EventHandler<RestoreTrashedNoteTarget>,
    pub empty_trash: EventHandler<()>,
    pub upsert_tag: EventHandler<UpsertTagRequest>,
    pub rename_tag: EventHandler<RenameTagRequest>,
    pub set_tag_color: EventHandler<SetTagColorRequest>,
    pub delete_tag: EventHandler<DeleteTagRequest>,
    pub delete_selected: EventHandler<()>,
    pub toggle_expanded_path: EventHandler<PathBuf>,
    pub reveal_in_explorer: EventHandler<FileTarget>,
    pub export_html: EventHandler<()>,
    pub save_settings: EventHandler<AppSettings>,
    pub save_workspace_settings: EventHandler<WorkspaceSettingsOverrides>,
}
