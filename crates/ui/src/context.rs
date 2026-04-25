use crate::commands::AppCommands;
use dioxus::prelude::*;
use papyro_core::{EditorTabs, FileState, TabContentsMap, UiState};

#[derive(Clone, PartialEq)]
pub struct AppContext {
    pub file_state: Signal<FileState>,
    pub editor_tabs: Signal<EditorTabs>,
    pub tab_contents: Signal<TabContentsMap>,
    pub ui_state: Signal<UiState>,
    pub pending_close_tab: Signal<Option<String>>,
    pub commands: AppCommands,
}

pub fn use_app_context() -> AppContext {
    use_context::<AppContext>()
}
