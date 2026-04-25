use dioxus::prelude::*;
use papyro_core::models::{AppSettings, FileNode};
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

#[derive(Clone, PartialEq)]
pub struct AppCommands {
    pub open_workspace: EventHandler<()>,
    pub refresh_workspace: EventHandler<()>,
    pub create_note: EventHandler<String>,
    pub create_folder: EventHandler<String>,
    pub open_note: EventHandler<FileNode>,
    pub content_changed: EventHandler<ContentChange>,
    pub save_active_note: EventHandler<()>,
    pub save_tab: EventHandler<String>,
    pub close_tab: EventHandler<String>,
    pub rename_selected: EventHandler<String>,
    pub delete_selected: EventHandler<()>,
    pub reveal_in_explorer: EventHandler<FileTarget>,
    pub export_html: EventHandler<()>,
    pub save_settings: EventHandler<AppSettings>,
}
