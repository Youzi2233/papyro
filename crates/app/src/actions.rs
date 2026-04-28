use papyro_core::models::{AppSettings, WorkspaceSettingsOverrides};
use papyro_ui::commands::{
    ContentChange, DeleteTagRequest, FileTarget, OpenMarkdownTarget, RenameTagRequest,
    RestoreTrashedNoteTarget, SetTagColorRequest, UpsertTagRequest,
};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq)]
pub enum AppAction {
    OpenWorkspace,
    OpenWorkspacePath(OpenWorkspacePath),
    RefreshWorkspace,
    CreateNote(CreateNote),
    CreateFolder(CreateFolder),
    OpenMarkdown(OpenMarkdown),
    SearchWorkspace(SearchWorkspace),
    ContentChanged(ContentChange),
    ActivateTab(ActivateTab),
    SaveActiveNote,
    SaveTab(SaveTab),
    CloseTab(CloseTab),
    RenameSelected(RenameSelected),
    MoveSelectedTo(MoveSelectedTo),
    SetSelectedFavorite(SetSelectedFavorite),
    RestoreTrashedNote(RestoreTrashedNote),
    EmptyTrash,
    UpsertTag(UpsertTag),
    RenameTag(RenameTag),
    SetTagColor(SetTagColor),
    DeleteTag(DeleteTag),
    DeleteSelected,
    ToggleExpandedPath(ToggleExpandedPath),
    RevealInExplorer(RevealInExplorer),
    ExportHtml,
    SaveSettings(SaveSettings),
    SaveWorkspaceSettings(SaveWorkspaceSettings),
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenMarkdown {
    pub target: OpenMarkdownTarget,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchWorkspace {
    pub query: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivateTab {
    pub tab_id: String,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MoveSelectedTo {
    pub target_dir: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetSelectedFavorite {
    pub favorite: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoreTrashedNote {
    pub target: RestoreTrashedNoteTarget,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpsertTag {
    pub request: UpsertTagRequest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenameTag {
    pub request: RenameTagRequest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetTagColor {
    pub request: SetTagColorRequest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteTag {
    pub request: DeleteTagRequest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToggleExpandedPath {
    pub path: PathBuf,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RevealInExplorer {
    pub target: FileTarget,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SaveSettings {
    pub settings: AppSettings,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SaveWorkspaceSettings {
    pub overrides: WorkspaceSettingsOverrides,
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

    pub fn open_markdown(target: OpenMarkdownTarget) -> Self {
        Self::OpenMarkdown(OpenMarkdown { target })
    }

    pub fn search_workspace(query: String) -> Self {
        Self::SearchWorkspace(SearchWorkspace { query })
    }

    pub fn content_changed(tab_id: String, content: String) -> Self {
        Self::ContentChanged(ContentChange { tab_id, content })
    }

    pub fn activate_tab(tab_id: String) -> Self {
        Self::ActivateTab(ActivateTab { tab_id })
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

    pub fn move_selected_to(target_dir: PathBuf) -> Self {
        Self::MoveSelectedTo(MoveSelectedTo { target_dir })
    }

    pub fn set_selected_favorite(favorite: bool) -> Self {
        Self::SetSelectedFavorite(SetSelectedFavorite { favorite })
    }

    pub fn restore_trashed_note(target: RestoreTrashedNoteTarget) -> Self {
        Self::RestoreTrashedNote(RestoreTrashedNote { target })
    }

    pub fn empty_trash() -> Self {
        Self::EmptyTrash
    }

    pub fn upsert_tag(request: UpsertTagRequest) -> Self {
        Self::UpsertTag(UpsertTag { request })
    }

    pub fn rename_tag(request: RenameTagRequest) -> Self {
        Self::RenameTag(RenameTag { request })
    }

    pub fn set_tag_color(request: SetTagColorRequest) -> Self {
        Self::SetTagColor(SetTagColor { request })
    }

    pub fn delete_tag(request: DeleteTagRequest) -> Self {
        Self::DeleteTag(DeleteTag { request })
    }

    pub fn toggle_expanded_path(path: PathBuf) -> Self {
        Self::ToggleExpandedPath(ToggleExpandedPath { path })
    }

    pub fn reveal_in_explorer(target: FileTarget) -> Self {
        Self::RevealInExplorer(RevealInExplorer { target })
    }

    pub fn save_settings(settings: AppSettings) -> Self {
        Self::SaveSettings(SaveSettings { settings })
    }

    pub fn save_workspace_settings(overrides: WorkspaceSettingsOverrides) -> Self {
        Self::SaveWorkspaceSettings(SaveWorkspaceSettings { overrides })
    }
}
