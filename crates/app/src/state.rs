use dioxus::prelude::*;
use papyro_core::{
    EditorTabs, FileState, TabContentsMap, UiState, WorkspaceBootstrap, WorkspaceSearchState,
};
use papyro_ui::commands::EditorRuntimeCommandQueue;
use std::path::PathBuf;

use crate::settings_persistence::SettingsPersistenceQueue;

#[derive(Clone, Copy)]
pub(crate) struct RuntimeState {
    pub file_state: Signal<FileState>,
    pub editor_tabs: Signal<EditorTabs>,
    pub tab_contents: Signal<TabContentsMap>,
    pub ui_state: Signal<UiState>,
    pub workspace_search: Signal<WorkspaceSearchState>,
    pub status_message: Signal<Option<String>>,
    pub workspace_watch_path: Signal<Option<PathBuf>>,
    pub pending_close_tab: Signal<Option<String>>,
    pub pending_delete_path: Signal<Option<PathBuf>>,
    pub pending_empty_trash: Signal<bool>,
    pub editor_runtime_commands: Signal<EditorRuntimeCommandQueue>,
    pub settings_persistence: Signal<SettingsPersistenceQueue>,
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
        workspace_search: use_signal(WorkspaceSearchState::default),
        status_message: use_signal(|| Some(initial_status_message)),
        workspace_watch_path: use_signal(|| initial_workspace_root),
        pending_close_tab: use_signal(|| None::<String>),
        pending_delete_path: use_signal(|| None::<PathBuf>),
        pending_empty_trash: use_signal(|| false),
        editor_runtime_commands: use_signal(EditorRuntimeCommandQueue::default),
        settings_persistence: use_signal(SettingsPersistenceQueue::default),
    }
}
