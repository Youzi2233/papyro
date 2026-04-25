use crate::components::{
    editor::EditorPane, header::AppHeader, settings::SettingsModal, sidebar::Sidebar,
    status_bar::StatusBar,
};
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::Theme;

#[component]
pub fn DesktopLayout(status_message: Option<String>) -> Element {
    let app = use_app_context();
    let mut ui_state = app.ui_state;
    let commands = app.commands;
    let mut show_settings = use_signal(|| false);
    let settings = app.view_model.read().settings.clone();

    let theme = settings.theme;
    let sidebar_collapsed = settings.sidebar_collapsed;

    use_effect(use_reactive((&theme,), move |(theme,)| {
        let script = match theme {
            Theme::Dark => "document.documentElement.setAttribute('data-theme','dark');",
            Theme::Light => "document.documentElement.setAttribute('data-theme','light');",
            Theme::System => "document.documentElement.removeAttribute('data-theme');",
        };
        document::eval(script);
    }));

    // Global keyboard shortcut: Ctrl+\ to toggle sidebar.
    // Registered via JS to ensure it fires even when CodeMirror has focus.
    use_effect(move || {
        let mut eval = document::eval(
            r#"
            const handler = (e) => {
                if (e.ctrlKey && e.key === '\\' && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    dioxus.send("toggle_sidebar");
                }
            };
            document.addEventListener('keydown', handler, true);
            // Keep the eval alive — never resolves, never removes the listener.
            await new Promise(() => {});
        "#,
        );

        spawn(async move {
            while eval.recv::<String>().await.is_ok() {
                ui_state.write().toggle_sidebar();
                let settings = ui_state.read().settings.clone();
                commands.save_settings.call(settings);
            }
        });
    });

    rsx! {
        div {
            class: "mn-shell",
            AppHeader {
                on_settings: move |_| show_settings.set(true),
            }
            div { class: "mn-workbench",
                if !sidebar_collapsed {
                    Sidebar {}
                }
                EditorPane {}
            }
            StatusBar { status_message }
            if *show_settings.read() {
                SettingsModal { on_close: move |_| show_settings.set(false) }
            }
        }
    }
}
