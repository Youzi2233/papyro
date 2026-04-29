use crate::commands::{AppCommands, EditorRuntimeCommandQueue};
use crate::view_model::{
    EditorPaneViewModel, EditorSurfaceViewModel, EditorViewModel, QuickOpenItemViewModel,
    SettingsWorkspaceViewModel, SidebarViewModel, WorkspaceSearchViewModel, WorkspaceViewModel,
};
use dioxus::prelude::*;
use papyro_core::{
    models::{DocumentStats, Theme},
    EditorTabs, FileState, TabContentsMap, UiState, WorkspaceSearchState,
};
use std::path::PathBuf;

#[derive(Clone, Copy)]
pub struct EditorServices {
    pub summarize_markdown: fn(&str) -> DocumentStats,
    pub render_markdown_html: fn(&str) -> String,
    pub render_markdown_html_with_highlighting: fn(&str, bool) -> String,
}

impl EditorServices {
    pub fn summarize(self, markdown: &str) -> DocumentStats {
        (self.summarize_markdown)(markdown)
    }

    pub fn render_html(self, markdown: &str) -> String {
        (self.render_markdown_html)(markdown)
    }

    pub fn render_html_with_highlighting(self, markdown: &str, highlight_code: bool) -> String {
        (self.render_markdown_html_with_highlighting)(markdown, highlight_code)
    }
}

impl PartialEq for EditorServices {
    fn eq(&self, _other: &Self) -> bool {
        true
    }
}

#[derive(Clone, PartialEq)]
pub struct AppContext {
    pub file_state: Signal<FileState>,
    pub editor_tabs: Signal<EditorTabs>,
    pub tab_contents: Signal<TabContentsMap>,
    pub ui_state: Signal<UiState>,
    pub workspace_search: Signal<WorkspaceSearchState>,
    pub status_message: Signal<Option<String>>,
    pub pending_close_tab: Signal<Option<String>>,
    pub pending_delete_path: Signal<Option<PathBuf>>,
    pub editor_runtime_commands: Signal<EditorRuntimeCommandQueue>,
    pub commands: AppCommands,
    pub editor_services: EditorServices,
    pub workspace_model: Memo<WorkspaceViewModel>,
    pub sidebar_model: Memo<SidebarViewModel>,
    pub settings_workspace_model: Memo<SettingsWorkspaceViewModel>,
    pub quick_open_items: Memo<Vec<QuickOpenItemViewModel>>,
    pub workspace_search_model: Memo<WorkspaceSearchViewModel>,
    pub editor_model: Memo<EditorViewModel>,
    pub editor_pane_model: Memo<EditorPaneViewModel>,
    pub editor_surface_model: Memo<EditorSurfaceViewModel>,
    pub status_text: Memo<Option<String>>,
    pub theme: Memo<Theme>,
    pub sidebar_collapsed: Memo<bool>,
    pub sidebar_width: Memo<u32>,
    pub outline_visible: Memo<bool>,
}

pub fn use_app_context() -> AppContext {
    use_context::<AppContext>()
}
