use crate::dispatcher::AppDispatcher;
use crate::state::use_runtime_state;
use dioxus::prelude::*;
use papyro_core::{NoteStorage, WorkspaceBootstrap};
use papyro_platform::PlatformApi;
use papyro_ui::context::{AppContext, EditorServices};
use papyro_ui::view_model::AppViewModel;
use std::sync::Arc;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AppShell {
    Desktop,
    Mobile,
}

impl AppShell {
    pub(crate) fn close_confirmation(self, title: &str) -> String {
        match self {
            Self::Desktop => format!("{title} has unsaved changes. Click close again to discard."),
            Self::Mobile => format!("{title} has unsaved changes. Tap close again to discard."),
        }
    }

    pub(crate) fn export_unavailable_message(self) -> Option<&'static str> {
        match self {
            Self::Desktop => None,
            Self::Mobile => Some("Export is not available on mobile yet"),
        }
    }
}

pub fn use_app_runtime(
    shell: AppShell,
    bootstrap: WorkspaceBootstrap,
    storage: Arc<dyn NoteStorage>,
    platform: Arc<dyn PlatformApi>,
) -> Signal<Option<String>> {
    let state = use_runtime_state(bootstrap);
    let watch_storage = storage.clone();
    let dispatcher = AppDispatcher::new(shell, state, storage, platform);
    let commands = dispatcher.commands();
    let view_model = use_memo(move || {
        AppViewModel::from_state(
            &state.file_state.read(),
            &state.editor_tabs.read(),
            &state.tab_contents.read(),
            &state.ui_state.read(),
        )
    });

    use_context_provider(|| AppContext {
        file_state: state.file_state,
        editor_tabs: state.editor_tabs,
        tab_contents: state.tab_contents,
        ui_state: state.ui_state,
        pending_close_tab: state.pending_close_tab,
        commands,
        editor_services: EditorServices {
            summarize_markdown: papyro_editor::parser::summarize_markdown,
            render_markdown_html: papyro_editor::renderer::render_markdown_html,
        },
        view_model,
    });

    crate::effects::use_workspace_watcher(state, watch_storage);

    state.status_message
}
