use papyro_core::models::{AppSettings, WorkspaceSettingsOverrides};
use papyro_ui::commands::{
    ChromeTrigger, ContentChange, DeleteTagRequest, FileTarget, OpenMarkdownTarget,
    PasteImageRequest, RenameTagRequest, RestoreTrashedNoteTarget, SetTagColorRequest,
    SetViewModeRequest, UpsertTagRequest,
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
    PasteImage(PasteImage),
    ActivateTab(ActivateTab),
    SaveActiveNote,
    ReloadConflictedActiveNote,
    OverwriteActiveNote,
    SaveTab(SaveTab),
    CloseTab(CloseTab),
    ToggleOutline,
    ToggleSidebar(ChromeTrigger),
    ToggleTheme,
    SetViewMode(SetViewModeRequest),
    SetSidebarWidth(SetSidebarWidth),
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
    SelectPath(SelectPath),
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
pub struct PasteImage {
    pub request: PasteImageRequest,
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
pub struct SetSidebarWidth {
    pub width: u32,
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
pub struct SelectPath {
    pub path: PathBuf,
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
    pub(crate) fn trace_name(&self) -> &'static str {
        match self {
            Self::OpenWorkspace => "open_workspace",
            Self::OpenWorkspacePath(_) => "open_workspace_path",
            Self::RefreshWorkspace => "refresh_workspace",
            Self::CreateNote(_) => "create_note",
            Self::CreateFolder(_) => "create_folder",
            Self::OpenMarkdown(_) => "open_markdown",
            Self::SearchWorkspace(_) => "search_workspace",
            Self::ContentChanged(_) => "content_changed",
            Self::PasteImage(_) => "paste_image",
            Self::ActivateTab(_) => "activate_tab",
            Self::SaveActiveNote => "save_active_note",
            Self::ReloadConflictedActiveNote => "reload_conflicted_active_note",
            Self::OverwriteActiveNote => "overwrite_active_note",
            Self::SaveTab(_) => "save_tab",
            Self::CloseTab(_) => "close_tab",
            Self::ToggleOutline => "toggle_outline",
            Self::ToggleSidebar(_) => "toggle_sidebar",
            Self::ToggleTheme => "toggle_theme",
            Self::SetViewMode(_) => "set_view_mode",
            Self::SetSidebarWidth(_) => "set_sidebar_width",
            Self::RenameSelected(_) => "rename_selected",
            Self::MoveSelectedTo(_) => "move_selected_to",
            Self::SetSelectedFavorite(_) => "set_selected_favorite",
            Self::RestoreTrashedNote(_) => "restore_trashed_note",
            Self::EmptyTrash => "empty_trash",
            Self::UpsertTag(_) => "upsert_tag",
            Self::RenameTag(_) => "rename_tag",
            Self::SetTagColor(_) => "set_tag_color",
            Self::DeleteTag(_) => "delete_tag",
            Self::DeleteSelected => "delete_selected",
            Self::SelectPath(_) => "select_path",
            Self::ToggleExpandedPath(_) => "toggle_expanded_path",
            Self::RevealInExplorer(_) => "reveal_in_explorer",
            Self::ExportHtml => "export_html",
            Self::SaveSettings(_) => "save_settings",
            Self::SaveWorkspaceSettings(_) => "save_workspace_settings",
        }
    }

    pub(crate) fn trace_interaction_path(&self) -> &'static str {
        match self {
            Self::OpenWorkspace | Self::OpenWorkspacePath(_) | Self::RefreshWorkspace => {
                "workspace.open"
            }
            Self::CreateNote(_)
            | Self::CreateFolder(_)
            | Self::RenameSelected(_)
            | Self::MoveSelectedTo(_)
            | Self::SetSelectedFavorite(_)
            | Self::RestoreTrashedNote(_)
            | Self::EmptyTrash
            | Self::DeleteSelected
            | Self::ToggleExpandedPath(_) => "workspace.file_ops",
            Self::SelectPath(_) => "workspace.selection",
            Self::OpenMarkdown(_) => "editor.open_markdown",
            Self::SearchWorkspace(_) => "workspace.search",
            Self::ContentChanged(_) => "editor.input",
            Self::PasteImage(_) => "editor.paste_image",
            Self::ActivateTab(_) => "editor.tab_switch",
            Self::SaveActiveNote
            | Self::ReloadConflictedActiveNote
            | Self::OverwriteActiveNote
            | Self::SaveTab(_) => "editor.save",
            Self::CloseTab(_) => "editor.tab_close",
            Self::ToggleOutline => "chrome.outline",
            Self::ToggleSidebar(_) | Self::SetSidebarWidth(_) => "chrome.sidebar",
            Self::ToggleTheme => "chrome.theme",
            Self::SetViewMode(_) => "editor.view_mode",
            Self::UpsertTag(_) | Self::RenameTag(_) | Self::SetTagColor(_) | Self::DeleteTag(_) => {
                "workspace.tags"
            }
            Self::RevealInExplorer(_) => "platform.reveal",
            Self::ExportHtml => "platform.export",
            Self::SaveSettings(_) | Self::SaveWorkspaceSettings(_) => "chrome.settings",
        }
    }

    pub(crate) fn trace_tab_id(&self) -> Option<&str> {
        match self {
            Self::ContentChanged(action) => Some(action.tab_id.as_str()),
            Self::PasteImage(action) => Some(action.request.tab_id.as_str()),
            Self::ActivateTab(action) => Some(action.tab_id.as_str()),
            Self::SaveTab(action) => Some(action.tab_id.as_str()),
            Self::CloseTab(action) => Some(action.tab_id.as_str()),
            _ => None,
        }
    }

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

    pub fn paste_image(request: PasteImageRequest) -> Self {
        Self::PasteImage(PasteImage { request })
    }

    pub fn save_tab(tab_id: String) -> Self {
        Self::SaveTab(SaveTab { tab_id })
    }

    pub fn close_tab(tab_id: String) -> Self {
        Self::CloseTab(CloseTab { tab_id })
    }

    pub fn toggle_sidebar(trigger: ChromeTrigger) -> Self {
        Self::ToggleSidebar(trigger)
    }

    pub fn set_view_mode(request: SetViewModeRequest) -> Self {
        Self::SetViewMode(request)
    }

    pub fn set_sidebar_width(width: u32) -> Self {
        Self::SetSidebarWidth(SetSidebarWidth { width })
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

    pub fn select_path(path: PathBuf) -> Self {
        Self::SelectPath(SelectPath { path })
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
