use crate::commands::{AppCommands, EditorRuntimeCommand, EditorRuntimeCommandQueue};
use crate::view_model::{
    EditorPaneViewModel, EditorSurfaceViewModel, EditorViewModel, FileTreeViewModel,
    QuickOpenItemViewModel, SettingsFormViewModel, SettingsWorkspaceViewModel, SidebarViewModel,
    WorkspaceSearchViewModel, WorkspaceViewModel,
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

#[derive(Clone, Copy)]
pub struct EditorRuntimeCommandPort {
    queue: Signal<EditorRuntimeCommandQueue>,
}

impl EditorRuntimeCommandPort {
    pub fn new(queue: Signal<EditorRuntimeCommandQueue>) -> Self {
        Self { queue }
    }

    pub fn revision(self) -> u64 {
        self.queue.read().revision()
    }

    pub fn has_pending_for_tab(self, tab_id: &str) -> bool {
        self.queue.peek().has_pending_for_tab(tab_id)
    }

    pub fn drain_for_tab(mut self, tab_id: &str) -> Vec<EditorRuntimeCommand> {
        self.queue.with_mut(|queue| queue.drain_for_tab(tab_id))
    }
}

impl PartialEq for EditorRuntimeCommandPort {
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
    pub editor_runtime_command_port: EditorRuntimeCommandPort,
    pub commands: AppCommands,
    pub editor_services: EditorServices,
    pub workspace_model: Memo<WorkspaceViewModel>,
    pub sidebar_model: Memo<SidebarViewModel>,
    pub settings_workspace_model: Memo<SettingsWorkspaceViewModel>,
    pub settings_form_model: Memo<SettingsFormViewModel>,
    pub file_tree_model: Memo<FileTreeViewModel>,
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
