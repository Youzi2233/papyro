use crate::dispatcher::AppDispatcher;
use crate::state::use_runtime_state;
use dioxus::prelude::*;
use papyro_core::{NoteStorage, WorkspaceBootstrap};
use papyro_platform::PlatformApi;
use papyro_ui::context::{AppContext, EditorServices};
use papyro_ui::view_model::{
    EditorPaneViewModel, EditorSurfaceViewModel, EditorViewModel, WorkspaceViewModel,
};
use std::path::PathBuf;
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

    pub(crate) fn delete_confirmation(self, title: &str, _orphan_asset_count: usize) -> String {
        match self {
            Self::Desktop => {
                format!("{title} will be moved to trash. Click Delete again to confirm.")
            }
            Self::Mobile => {
                format!("{title} will be moved to trash. Tap Delete again to confirm.")
            }
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
    startup_markdown_paths: Vec<PathBuf>,
) -> Signal<Option<String>> {
    let state = use_runtime_state(bootstrap);
    let watch_storage = storage.clone();
    let flush_storage = storage.clone();
    let dispatcher = AppDispatcher::new(shell, state, storage, platform);
    use_startup_markdown_paths(dispatcher.clone(), startup_markdown_paths);
    let commands = dispatcher.commands();
    let workspace_model = use_memo(move || {
        WorkspaceViewModel::from_file_state(
            &state.file_state.read(),
            state.pending_delete_path.read().as_deref(),
        )
    });
    let editor_model = use_memo(move || {
        EditorViewModel::from_editor_state(
            &state.editor_tabs.read(),
            &state.tab_contents.read(),
            &state.ui_state.read(),
        )
    });
    let editor_pane_model = use_memo(move || {
        EditorPaneViewModel::from_editor_state(
            &state.editor_tabs.read(),
            &state.tab_contents.read(),
            state.pending_close_tab.read().as_deref(),
        )
    });
    let editor_surface_model =
        use_memo(move || EditorSurfaceViewModel::from_ui_state(&state.ui_state.read()));
    let theme = use_memo(move || state.ui_state.read().theme().clone());
    let sidebar_collapsed = use_memo(move || state.ui_state.read().sidebar_collapsed());
    let sidebar_width = use_memo(move || state.ui_state.read().settings.sidebar_width);
    use_context_provider(|| AppContext {
        file_state: state.file_state,
        editor_tabs: state.editor_tabs,
        tab_contents: state.tab_contents,
        ui_state: state.ui_state,
        workspace_search: state.workspace_search,
        status_message: state.status_message,
        pending_close_tab: state.pending_close_tab,
        pending_delete_path: state.pending_delete_path,
        commands,
        editor_services: EditorServices {
            summarize_markdown: papyro_editor::parser::summarize_markdown,
            render_markdown_html: papyro_editor::renderer::render_markdown_html,
            render_markdown_html_with_highlighting:
                papyro_editor::renderer::render_markdown_html_with_highlighting,
        },
        workspace_model,
        editor_model,
        editor_pane_model,
        editor_surface_model,
        theme,
        sidebar_collapsed,
        sidebar_width,
    });

    crate::effects::use_workspace_watcher(state, watch_storage);
    crate::effects::use_flush_on_drop(state, flush_storage);

    state.status_message
}

fn use_startup_markdown_paths(dispatcher: AppDispatcher, startup_markdown_paths: Vec<PathBuf>) {
    let startup_markdown_paths = use_hook(|| startup_markdown_paths);
    use_effect(move || {
        dispatcher.dispatch_startup_markdown_paths(startup_markdown_paths.clone());
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_confirmation_mentions_trash() {
        assert_eq!(
            AppShell::Desktop.delete_confirmation("Draft", 2),
            "Draft will be moved to trash. Click Delete again to confirm."
        );
        assert_eq!(
            AppShell::Mobile.delete_confirmation("Draft", 0),
            "Draft will be moved to trash. Tap Delete again to confirm."
        );
    }
}
