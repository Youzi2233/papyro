use dioxus::prelude::*;
use papyro_core::{EditorTabs, FileState, TabContentsMap, UiState, WorkspaceBootstrap};
use std::path::PathBuf;

#[derive(Clone, Copy)]
pub(crate) struct RuntimeState {
    pub file_state: Signal<FileState>,
    pub editor_tabs: Signal<EditorTabs>,
    pub tab_contents: Signal<TabContentsMap>,
    pub ui_state: Signal<UiState>,
    pub status_message: Signal<Option<String>>,
    pub workspace_watch_path: Signal<Option<PathBuf>>,
    pub pending_close_tab: Signal<Option<String>>,
}

pub(crate) fn use_runtime_state(bootstrap: WorkspaceBootstrap) -> RuntimeState {
    let initial_file_state = bootstrap.file_state;
    let initial_global_settings = bootstrap.global_settings;
    let initial_workspace_overrides = bootstrap.workspace_settings;
    let initial_status_message = bootstrap.status_message;
    let initial_workspace_root = bootstrap.workspace_root;

    RuntimeState {
        file_state: use_signal(|| initial_file_state),
        editor_tabs: use_signal(EditorTabs::default),
        tab_contents: use_signal(TabContentsMap::default),
        ui_state: use_signal(|| {
            UiState::from_settings_with_overrides(
                initial_global_settings,
                initial_workspace_overrides,
            )
        }),
        status_message: use_signal(|| Some(initial_status_message)),
        workspace_watch_path: use_signal(|| initial_workspace_root),
        pending_close_tab: use_signal(|| None::<String>),
    }
}
