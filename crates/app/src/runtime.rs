use crate::dispatcher::AppDispatcher;
use crate::open_requests::MarkdownOpenRequestReceiver;
use crate::process_settings::{shared_process_settings_hub, ProcessSettingsHub};
use crate::state::use_runtime_state;
use dioxus::prelude::*;
use papyro_core::{NoteStorage, WorkspaceBootstrap};
use papyro_platform::PlatformApi;
use papyro_ui::context::{AppContext, EditorRuntimeCommandPort, EditorServices};
use papyro_ui::view_model::{
    EditorPaneViewModel, EditorSurfaceViewModel, EditorViewModel, FileTreeViewModel,
    QuickOpenItemViewModel, RecoveryDraftsViewModel, SettingsFormViewModel,
    SettingsWorkspaceViewModel, SidebarViewModel, WorkspaceSearchViewModel, WorkspaceViewModel,
};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AppShell {
    Desktop,
    Mobile,
}

impl AppShell {
    pub(crate) fn supports_multi_window(self) -> bool {
        matches!(self, Self::Desktop)
    }

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
    external_open_requests: Option<MarkdownOpenRequestReceiver>,
) -> Signal<Option<String>> {
    use_app_runtime_with_options(
        RuntimeOptions {
            shell,
            multi_window_available: shell.supports_multi_window(),
        },
        bootstrap,
        storage,
        platform,
        startup_markdown_paths,
        external_open_requests,
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct RuntimeOptions {
    pub shell: AppShell,
    pub multi_window_available: bool,
}

#[derive(Clone, PartialEq)]
pub struct RuntimeSharedServices {
    pub(crate) process_settings: ProcessSettingsHub,
}

impl Default for RuntimeSharedServices {
    fn default() -> Self {
        Self {
            process_settings: shared_process_settings_hub(),
        }
    }
}

pub fn use_app_runtime_with_options(
    options: RuntimeOptions,
    bootstrap: WorkspaceBootstrap,
    storage: Arc<dyn NoteStorage>,
    platform: Arc<dyn PlatformApi>,
    startup_markdown_paths: Vec<PathBuf>,
    external_open_requests: Option<MarkdownOpenRequestReceiver>,
) -> Signal<Option<String>> {
    use_app_runtime_with_shared_services(
        options,
        bootstrap,
        storage,
        platform,
        startup_markdown_paths,
        external_open_requests,
        RuntimeSharedServices::default(),
    )
}

pub fn use_app_runtime_with_shared_services(
    options: RuntimeOptions,
    bootstrap: WorkspaceBootstrap,
    storage: Arc<dyn NoteStorage>,
    platform: Arc<dyn PlatformApi>,
    startup_markdown_paths: Vec<PathBuf>,
    external_open_requests: Option<MarkdownOpenRequestReceiver>,
    shared_services: RuntimeSharedServices,
) -> Signal<Option<String>> {
    let shell = options.shell;
    let process_settings = shared_services.process_settings.clone();
    let bootstrap = process_settings.prepare_bootstrap(bootstrap);
    let state = use_runtime_state(bootstrap, options.multi_window_available);
    let watch_storage = storage.clone();
    let flush_storage = storage.clone();
    #[cfg(feature = "desktop-shell")]
    let close_flush_storage = storage.clone();
    #[cfg(feature = "desktop-shell")]
    let document_window_storage = storage.clone();
    #[cfg(feature = "desktop-shell")]
    let document_window_platform = platform.clone();
    let dispatcher = AppDispatcher::new(shell, state, storage, platform, process_settings.clone());
    use_startup_markdown_paths(dispatcher.clone(), startup_markdown_paths);
    use_external_markdown_open_requests(dispatcher.clone(), external_open_requests);
    let commands = dispatcher.commands();
    let workspace_model = use_memo(move || {
        WorkspaceViewModel::from_file_state(
            &state.file_state.read(),
            state.pending_delete_path.read().as_deref(),
        )
    });
    let sidebar_model = use_memo(move || {
        SidebarViewModel::from_file_state(
            &state.file_state.read(),
            state.pending_delete_path.read().as_deref(),
        )
    });
    let settings_workspace_model =
        use_memo(move || SettingsWorkspaceViewModel::from_file_state(&state.file_state.read()));
    let settings_form_model = use_memo(move || {
        SettingsFormViewModel::from_ui_state(
            &state.ui_state.read(),
            state.file_state.read().current_workspace.is_some(),
        )
    });
    let file_tree_model =
        use_memo(move || FileTreeViewModel::from_file_state(&state.file_state.read()));
    let quick_open_items =
        use_memo(move || QuickOpenItemViewModel::from_file_state(&state.file_state.read()));
    let workspace_search_model = use_memo(move || {
        WorkspaceSearchViewModel::from_search_state(&state.workspace_search.read())
    });
    let recovery_model =
        use_memo(move || RecoveryDraftsViewModel::from_drafts(&state.recovery_drafts.read()));
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
    let status_text = use_memo(move || state.status_message.read().clone());
    let language = use_memo(move || state.ui_state.read().settings.language);
    let theme = use_memo(move || state.ui_state.read().theme().clone());
    let sidebar_collapsed = use_memo(move || state.ui_state.read().sidebar_collapsed());
    let sidebar_width = use_memo(move || state.ui_state.read().settings.sidebar_width);
    let outline_visible = use_memo(move || state.ui_state.read().outline_visible());
    let app_context = AppContext {
        file_state: state.file_state,
        editor_tabs: state.editor_tabs,
        tab_contents: state.tab_contents,
        ui_state: state.ui_state,
        workspace_search: state.workspace_search,
        recovery_drafts: state.recovery_drafts,
        recovery_comparison: state.recovery_comparison,
        status_message: state.status_message,
        pending_close_tab: state.pending_close_tab,
        pending_delete_path: state.pending_delete_path,
        editor_runtime_command_port: EditorRuntimeCommandPort::new(state.editor_runtime_commands),
        commands,
        editor_services: EditorServices {
            summarize_markdown: papyro_editor::parser::summarize_markdown,
            render_markdown_html: papyro_editor::renderer::render_markdown_html,
            render_markdown_html_with_highlighting:
                papyro_editor::renderer::render_markdown_html_with_highlighting,
            render_markdown_html_with_highlight_theme:
                papyro_editor::renderer::render_markdown_html_with_highlight_theme,
        },
        workspace_model,
        sidebar_model,
        settings_workspace_model,
        settings_form_model,
        file_tree_model,
        quick_open_items,
        workspace_search_model,
        recovery_model,
        editor_model,
        editor_pane_model,
        editor_surface_model,
        status_text,
        language,
        theme,
        sidebar_collapsed,
        sidebar_width,
        outline_visible,
    };
    #[cfg(feature = "desktop-shell")]
    let settings_window_launcher =
        crate::desktop_tool_windows::use_settings_window_launcher(shell, app_context.clone());
    use_context_provider(|| app_context);
    #[cfg(feature = "desktop-shell")]
    use_context_provider(|| settings_window_launcher);

    #[cfg(feature = "desktop-shell")]
    crate::desktop_tool_windows::use_document_window_requests(
        shell,
        state,
        document_window_storage,
        document_window_platform,
        shared_services,
    );
    crate::process_settings::use_process_settings_sync(state, process_settings);
    crate::effects::use_workspace_watcher(state, watch_storage);
    #[cfg(feature = "desktop-shell")]
    crate::effects::use_desktop_close_flush(state, close_flush_storage);
    crate::effects::use_flush_on_drop(state, flush_storage);

    state.status_message
}

fn use_startup_markdown_paths(dispatcher: AppDispatcher, startup_markdown_paths: Vec<PathBuf>) {
    let startup_markdown_paths = use_hook(|| startup_markdown_paths);
    use_effect(move || {
        dispatcher.dispatch_startup_markdown_paths(startup_markdown_paths.clone());
    });
}

fn use_external_markdown_open_requests(
    dispatcher: AppDispatcher,
    external_open_requests: Option<MarkdownOpenRequestReceiver>,
) {
    let external_open_requests = use_hook(|| external_open_requests);
    use_effect(move || {
        let Some(external_open_requests) = external_open_requests.clone() else {
            return;
        };
        let dispatcher = dispatcher.clone();
        spawn(async move {
            while let Ok(request) = external_open_requests.recv().await {
                dispatcher.dispatch_external_markdown_request(request);
            }
        });
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

    #[test]
    fn only_desktop_shell_enables_multi_window_routing() {
        assert!(AppShell::Desktop.supports_multi_window());
        assert!(!AppShell::Mobile.supports_multi_window());
    }
}
