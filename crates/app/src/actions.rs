use papyro_core::models::{AppSettings, FileNode};
use papyro_ui::commands::{ContentChange, FileTarget};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq)]
pub enum AppAction {
    OpenWorkspace,
    OpenWorkspacePath(OpenWorkspacePath),
    RefreshWorkspace,
    CreateNote(CreateNote),
    CreateFolder(CreateFolder),
    OpenNote(OpenNote),
    ContentChanged(ContentChange),
    SaveActiveNote,
    SaveTab(SaveTab),
    CloseTab(CloseTab),
    RenameSelected(RenameSelected),
    DeleteSelected,
    RevealInExplorer(RevealInExplorer),
    ExportHtml,
    SaveSettings(SaveSettings),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateNote {
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateFolder {
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenWorkspacePath {
    pub path: PathBuf,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OpenNote {
    pub node: FileNode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaveTab {
    pub tab_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloseTab {
    pub tab_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenameSelected {
    pub name: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RevealInExplorer {
    pub target: FileTarget,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SaveSettings {
    pub settings: AppSettings,
}

impl AppAction {
    pub fn create_note(name: String) -> Self {
        Self::CreateNote(CreateNote { name })
    }

    pub fn create_folder(name: String) -> Self {
        Self::CreateFolder(CreateFolder { name })
    }

    pub fn open_workspace_path(path: PathBuf) -> Self {
        Self::OpenWorkspacePath(OpenWorkspacePath { path })
    }

    pub fn open_note(node: FileNode) -> Self {
        Self::OpenNote(OpenNote { node })
    }

    pub fn content_changed(tab_id: String, content: String) -> Self {
        Self::ContentChanged(ContentChange { tab_id, content })
    }

    pub fn save_tab(tab_id: String) -> Self {
        Self::SaveTab(SaveTab { tab_id })
    }

    pub fn close_tab(tab_id: String) -> Self {
        Self::CloseTab(CloseTab { tab_id })
    }

    pub fn rename_selected(name: String) -> Self {
        Self::RenameSelected(RenameSelected { name })
    }

    pub fn reveal_in_explorer(target: FileTarget) -> Self {
        Self::RevealInExplorer(RevealInExplorer { target })
    }

    pub fn save_settings(settings: AppSettings) -> Self {
        Self::SaveSettings(SaveSettings { settings })
    }
}
