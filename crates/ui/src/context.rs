use crate::commands::AppCommands;
use crate::view_model::{EditorViewModel, SettingsViewModel, WorkspaceViewModel};
use dioxus::prelude::*;
use papyro_core::{
    models::DocumentStats, EditorTabs, FileState, TabContentsMap, UiState, WorkspaceSearchState,
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
    pub commands: AppCommands,
    pub editor_services: EditorServices,
    pub workspace_model: Memo<WorkspaceViewModel>,
    pub editor_model: Memo<EditorViewModel>,
    pub settings_model: Memo<SettingsViewModel>,
}

pub fn use_app_context() -> AppContext {
    use_context::<AppContext>()
}
