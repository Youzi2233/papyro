use crate::handlers::{file_ops, notes, workspace};
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, FileNode};
use papyro_core::{EditorTabs, NoteStorage, TabContentsMap, UiState, WorkspaceBootstrap};
use papyro_platform::PlatformApi;
use papyro_ui::commands::{AppCommands, FileTarget};
use papyro_ui::context::AppContext;
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
    let mut file_state = use_signal(|| bootstrap.file_state.clone());
    let mut editor_tabs = use_signal(EditorTabs::default);
    let mut tab_contents = use_signal(TabContentsMap::default);
    let ui_state = use_signal(|| {
        let mut state = UiState::default();
        state.settings = bootstrap.settings.clone();
        state
    });
    let mut status_message = use_signal(|| Some(bootstrap.status_message.clone()));
    let workspace_watch_path = use_signal(|| bootstrap.workspace_root.clone());
    let mut pending_close_tab = use_signal(|| None::<String>);

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
    });

    let _watch_workspace = use_resource(move || {
        let storage = watch_storage.clone();
        async move {
            let path = workspace_watch_path();
            let Some(path) = path else { return };

            let (tx, rx) = flume::unbounded();
            let Ok(_watcher) = papyro_storage::fs::start_watching(&path, tx) else {
                status_message.set(Some(format!(
                    "Workspace watcher failed to start for {}",
                    path.display()
                )));
                return;
            };

            while let Ok(event) = rx.recv_async().await {
                if !workspace::should_refresh_for_event(&event, &path) {
                    continue;
                }
                while rx.try_recv().is_ok() {}
                workspace::reload_workspace_tree_async(
                    &mut file_state,
                    &mut status_message,
                    &path,
                    storage.clone(),
                )
                .await;
            }
        }
    });

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

#[cfg(feature = "desktop-shell")]
async fn export_active_note_html(
    editor_tabs: Signal<EditorTabs>,
    tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
) {
    use papyro_editor::renderer::render_markdown_html;

    let (title, content) = {
        let tabs = editor_tabs.read();
        let title = tabs
            .active_tab()
            .map(|t| t.title.clone())
            .unwrap_or_else(|| "note".to_string());
        let content = tab_contents
            .read()
            .active_content(tabs.active_tab_id.as_deref())
            .unwrap_or_default()
            .to_string();
        (title, content)
    };

    if content.is_empty() {
        status_message.set(Some("Nothing to export".to_string()));
        return;
    }

    let html_body = render_markdown_html(&content);
    let html = build_html_document(&title, &html_body);

    let file = rfd::AsyncFileDialog::new()
        .set_title("Export as HTML")
        .set_file_name(format!("{title}.html"))
        .add_filter("HTML", &["html"])
        .save_file()
        .await;

    let Some(file) = file else { return };

    match tokio::fs::write(file.path(), html.as_bytes()).await {
        Ok(_) => status_message.set(Some(format!("Exported {title}.html"))),
        Err(error) => status_message.set(Some(format!("Export failed: {error}"))),
    }
}

#[cfg(feature = "desktop-shell")]
fn build_html_document(title: &str, body: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: "Inter", "Segoe UI", system-ui, sans-serif;
    font-size: 16px;
    line-height: 1.75;
    color: #25211a;
    background: #fffaf2;
    padding: 48px clamp(16px, 8vw, 120px);
  }}
  .content {{ max-width: 760px; margin: 0 auto; }}
  h1 {{ font-size: 2em; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 .5em; }}
  h2 {{ font-size: 1.5em; font-weight: 700; margin: 1.5em 0 .5em; }}
  h3 {{ font-size: 1.25em; font-weight: 600; margin: 1.25em 0 .4em; }}
  h4, h5, h6 {{ font-size: 1em; font-weight: 600; margin: 1em 0 .3em; }}
  p {{ margin: 0 0 1em; }}
  ul, ol {{ margin: 0 0 1em 1.5em; }}
  li {{ margin: .25em 0; }}
  blockquote {{
    border-left: 3px solid #c0533a;
    padding: .5em 1em;
    margin: 0 0 1em;
    color: #5c5347;
    background: rgba(192, 83, 58, 0.08);
    border-radius: 0 8px 8px 0;
  }}
  code {{
    font-family: "Cascadia Code", "JetBrains Mono", monospace;
    font-size: .875em;
    background: rgba(192, 83, 58, 0.1);
    border: 1px solid #e0d4c0;
    border-radius: 4px;
    padding: .1em .4em;
    color: #c0533a;
  }}
  pre {{ border-radius: 10px; margin: 0 0 1em; overflow-x: auto; }}
  pre code {{ background: none; border: none; padding: 0; color: inherit; }}
  table {{ width: 100%; border-collapse: collapse; margin: 0 0 1em; font-size: .9em; }}
  th {{ background: rgba(192,83,58,.1); font-weight: 600; text-align: left; padding: 8px 12px; border: 1px solid #e0d4c0; }}
  td {{ padding: 7px 12px; border: 1px solid #e0d4c0; }}
  a {{ color: #c0533a; text-decoration: underline; text-underline-offset: 3px; }}
  img {{ max-width: 100%; border-radius: 8px; }}
  hr {{ border: none; border-top: 1px solid #e0d4c0; margin: 1.5em 0; }}
</style>
</head>
<body>
<div class="content">
{body}
</div>
</body>
</html>"#
    )
}
