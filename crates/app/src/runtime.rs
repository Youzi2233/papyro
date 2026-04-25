#[cfg(feature = "desktop-shell")]
use crate::export::export_active_note_html;
use crate::handlers::{file_ops, notes, workspace};
use crate::state::use_runtime_state;
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, FileNode};
use papyro_core::{NoteStorage, UiState, WorkspaceBootstrap};
use papyro_platform::PlatformApi;
use papyro_ui::commands::{AppCommands, FileTarget};
use papyro_ui::context::{AppContext, EditorServices};
use std::sync::Arc;

fn perf_enabled() -> bool {
    std::env::var_os("PAPYRO_PERF").is_some()
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AppShell {
    Desktop,
    Mobile,
}

impl AppShell {
    fn close_confirmation(self, title: &str) -> String {
        match self {
            Self::Desktop => format!("{title} has unsaved changes. Click close again to discard."),
            Self::Mobile => format!("{title} has unsaved changes. Tap close again to discard."),
        }
    }

    fn export_unavailable_message(self) -> Option<&'static str> {
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
    let file_state = state.file_state;
    let mut editor_tabs = state.editor_tabs;
    let mut tab_contents = state.tab_contents;
    let ui_state = state.ui_state;
    let mut status_message = state.status_message;
    let workspace_watch_path = state.workspace_watch_path;
    let mut pending_close_tab = state.pending_close_tab;

    let open_workspace_platform = platform.clone();
    let open_workspace_storage = storage.clone();
    let refresh_workspace_storage = storage.clone();
    let create_note_storage = storage.clone();
    let create_folder_storage = storage.clone();
    let open_note_storage = storage.clone();
    let save_active_note_storage = storage.clone();
    let save_tab_storage = storage.clone();
    let rename_selected_storage = storage.clone();
    let delete_selected_storage = storage.clone();
    let reveal_platform = platform.clone();
    let save_settings_storage = storage.clone();
    let watch_storage = storage.clone();

    let commands = AppCommands {
        open_workspace: EventHandler::new(move |_| {
            let platform = open_workspace_platform.clone();
            let storage = open_workspace_storage.clone();
            spawn(async move {
                workspace::open_workspace(
                    platform,
                    storage,
                    file_state,
                    editor_tabs,
                    tab_contents,
                    status_message,
                    workspace_watch_path,
                )
                .await;
            });
        }),

        refresh_workspace: EventHandler::new(move |_| {
            workspace::refresh_workspace(
                refresh_workspace_storage.clone(),
                file_state,
                status_message,
            );
        }),

        create_note: EventHandler::new(move |name: String| {
            file_ops::create_note(
                create_note_storage.clone(),
                file_state,
                editor_tabs,
                tab_contents,
                status_message,
                name,
            );
        }),

        create_folder: EventHandler::new(move |name: String| {
            file_ops::create_folder(
                create_folder_storage.clone(),
                file_state,
                status_message,
                name,
            );
        }),

        open_note: EventHandler::new(move |node: FileNode| {
            notes::open_note(
                open_note_storage.clone(),
                file_state,
                editor_tabs,
                tab_contents,
                status_message,
                node,
            );
        }),

        save_active_note: EventHandler::new(move |_| {
            notes::save_active_note(
                save_active_note_storage.clone(),
                file_state,
                editor_tabs,
                tab_contents,
                status_message,
            );
            pending_close_tab.set(None);
        }),

        save_tab: EventHandler::new(move |tab_id: String| {
            notes::save_tab_by_id(
                save_tab_storage.clone(),
                file_state,
                editor_tabs,
                tab_contents,
                status_message,
                &tab_id,
            );
        }),

        close_tab: EventHandler::new(move |tab_id: String| {
            let perf_started_at = perf_enabled().then(std::time::Instant::now);

            let tab = editor_tabs
                .read()
                .tabs
                .iter()
                .find(|t| t.id == tab_id)
                .cloned();
            let Some(tab) = tab else { return };

            if tab.is_dirty && pending_close_tab.read().as_deref() != Some(&tab_id) {
                pending_close_tab.set(Some(tab_id));
                status_message.set(Some(shell.close_confirmation(&tab.title)));
                return;
            }

            let closed = editor_tabs.write().close_tab(&tab.id);
            if !closed {
                return;
            }

            tab_contents.write().close_tab(&tab.id);
            pending_close_tab.set(None);

            let closed_title = tab.title;
            status_message.set(Some(format!("Closed {closed_title}")));

            if let Some(started_at) = perf_started_at {
                tracing::info!(
                    tab_id = %tab.id,
                    elapsed_ms = started_at.elapsed().as_millis(),
                    "perf runtime close_tab handler"
                );
            }
        }),

        rename_selected: EventHandler::new(move |new_name: String| {
            file_ops::rename_selected(
                rename_selected_storage.clone(),
                file_state,
                editor_tabs,
                tab_contents,
                status_message,
                new_name,
            );
        }),

        delete_selected: EventHandler::new(move |_| {
            file_ops::delete_selected(
                delete_selected_storage.clone(),
                file_state,
                editor_tabs,
                tab_contents,
                status_message,
            );
        }),

        reveal_in_explorer: EventHandler::new(move |target: FileTarget| {
            file_ops::reveal_in_explorer(reveal_platform.clone(), status_message, target);
        }),

        export_html: EventHandler::new(move |_| {
            if let Some(message) = shell.export_unavailable_message() {
                status_message.set(Some(message.to_string()));
                return;
            }

            #[cfg(feature = "desktop-shell")]
            spawn(async move {
                export_active_note_html(editor_tabs, tab_contents, status_message).await;
            });

            #[cfg(not(feature = "desktop-shell"))]
            status_message.set(Some("Export is not available in this build".to_string()));
        }),

        save_settings: EventHandler::new(move |settings: AppSettings| {
            apply_settings(save_settings_storage.clone(), ui_state, settings);
        }),
    };

    use_context_provider(|| AppContext {
        file_state,
        editor_tabs,
        tab_contents,
        ui_state,
        pending_close_tab,
        commands,
        editor_services: EditorServices {
            summarize_markdown: papyro_editor::parser::summarize_markdown,
            render_markdown_html: papyro_editor::renderer::render_markdown_html,
        },
    });

    crate::effects::use_workspace_watcher(state, watch_storage);

    status_message
}

fn apply_settings(
    storage: Arc<dyn NoteStorage>,
    mut ui_state: Signal<UiState>,
    settings: AppSettings,
) {
    let mut state = ui_state.write();
    state.settings = settings.clone();
    drop(state);
    if let Err(error) = storage.save_settings(&settings) {
        tracing::warn!("Failed to save settings: {error}");
    }
}
