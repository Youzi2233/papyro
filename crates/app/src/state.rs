use dioxus::prelude::*;
use papyro_core::{
    models::{RecoveryDraft, RecoveryDraftComparison},
    EditorTabs, FileState, ProcessRuntimeSession, TabContentsMap, UiState, WindowSessionId,
    WorkspaceBootstrap, WorkspaceSearchState,
};
use papyro_ui::commands::EditorRuntimeCommandQueue;
use std::path::PathBuf;

use crate::settings_persistence::SettingsPersistenceQueue;

#[derive(Clone, Copy)]
pub(crate) struct RuntimeState {
    pub file_state: Signal<FileState>,
    pub process_runtime: Signal<ProcessRuntimeSession>,
    pub editor_tabs: Signal<EditorTabs>,
    pub tab_contents: Signal<TabContentsMap>,
    pub ui_state: Signal<UiState>,
    pub workspace_search: Signal<WorkspaceSearchState>,
    pub recovery_drafts: Signal<Vec<RecoveryDraft>>,
    pub recovery_comparison: Signal<Option<RecoveryDraftComparison>>,
    pub status_message: Signal<Option<String>>,
    pub workspace_watch_path: Signal<Option<PathBuf>>,
    pub pending_close_tab: Signal<Option<String>>,
    pub pending_delete_path: Signal<Option<PathBuf>>,
    pub pending_empty_trash: Signal<bool>,
    pub editor_runtime_commands: Signal<EditorRuntimeCommandQueue>,
    pub document_window_requests: Signal<DocumentWindowRequestQueue>,
    pub settings_persistence: Signal<SettingsPersistenceQueue>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DocumentWindowRequest {
    pub window_id: WindowSessionId,
    pub path: PathBuf,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct DocumentWindowRequestQueue {
    revision: u64,
    pending: Vec<DocumentWindowRequest>,
}

impl DocumentWindowRequestQueue {
    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn push(&mut self, window_id: WindowSessionId, path: PathBuf) {
        self.revision = self.revision.saturating_add(1);
        self.pending.push(DocumentWindowRequest { window_id, path });
    }

    pub fn drain(&mut self) -> Vec<DocumentWindowRequest> {
        self.pending.drain(..).collect()
    }
}

pub(crate) fn use_runtime_state(
    bootstrap: WorkspaceBootstrap,
    multi_window_available: bool,
) -> RuntimeState {
    let initial_file_state = bootstrap.file_state;
    let initial_global_settings = bootstrap.global_settings;
    let initial_workspace_overrides = bootstrap.workspace_settings;
    let initial_process_runtime = if multi_window_available {
        ProcessRuntimeSession::with_multi_window_available(&initial_global_settings)
    } else {
        ProcessRuntimeSession::tabs_only(&initial_global_settings)
    };
    let initial_status_message = bootstrap.status_message;
    let initial_workspace_root = bootstrap.workspace_root;
    let initial_recovery_drafts = bootstrap.recovery_drafts;

    RuntimeState {
        file_state: use_signal(|| initial_file_state),
        process_runtime: use_signal(|| initial_process_runtime),
        editor_tabs: use_signal(EditorTabs::default),
        tab_contents: use_signal(TabContentsMap::default),
        ui_state: use_signal(|| {
            UiState::from_settings_with_overrides(
                initial_global_settings,
                initial_workspace_overrides,
            )
        }),
        workspace_search: use_signal(WorkspaceSearchState::default),
        recovery_drafts: use_signal(|| initial_recovery_drafts),
        recovery_comparison: use_signal(|| None::<RecoveryDraftComparison>),
        status_message: use_signal(|| Some(initial_status_message)),
        workspace_watch_path: use_signal(|| initial_workspace_root),
        pending_close_tab: use_signal(|| None::<String>),
        pending_delete_path: use_signal(|| None::<PathBuf>),
        pending_empty_trash: use_signal(|| false),
        editor_runtime_commands: use_signal(EditorRuntimeCommandQueue::default),
        document_window_requests: use_signal(DocumentWindowRequestQueue::default),
        settings_persistence: use_signal(SettingsPersistenceQueue::default),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn document_window_request_queue_tracks_revision_and_drains_pending_requests() {
        let mut queue = DocumentWindowRequestQueue::default();

        assert_eq!(queue.revision(), 0);
        assert!(queue.drain().is_empty());

        queue.push(
            WindowSessionId::from("document-1"),
            PathBuf::from("notes/a.md"),
        );
        queue.push(
            WindowSessionId::from("document-2"),
            PathBuf::from("notes/b.md"),
        );

        assert_eq!(queue.revision(), 2);
        assert_eq!(
            queue.drain(),
            vec![
                DocumentWindowRequest {
                    window_id: WindowSessionId::from("document-1"),
                    path: PathBuf::from("notes/a.md"),
                },
                DocumentWindowRequest {
                    window_id: WindowSessionId::from("document-2"),
                    path: PathBuf::from("notes/b.md"),
                },
            ]
        );
        assert!(queue.drain().is_empty());
        assert_eq!(queue.revision(), 2);
    }
}
