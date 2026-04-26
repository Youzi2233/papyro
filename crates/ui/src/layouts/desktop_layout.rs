use crate::components::{
    command_palette::CommandPaletteModal, editor::EditorPane, header::AppHeader,
    quick_open::QuickOpenModal, search::SearchModal, settings::SettingsModal, sidebar::Sidebar,
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
    let mut show_quick_open = use_signal(|| false);
    let mut show_command_palette = use_signal(|| false);
    let mut show_search = use_signal(|| false);
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

    // Global keyboard shortcuts that must work while CodeMirror has focus.
    // Registered via JS to ensure it fires even when CodeMirror has focus.
    use_effect(move || {
        let mut eval = document::eval(
            r#"
            const handler = (e) => {
                const mod = e.ctrlKey || e.metaKey;
                const key = String(e.key || '').toLowerCase();
                if (mod && key === 'p' && e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    dioxus.send("command_palette");
                    return;
                }
                if (mod && key === 'f' && e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    dioxus.send("workspace_search");
                    return;
                }
                if (mod && key === 'p' && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    dioxus.send("quick_open");
                    return;
                }
                if (mod && key === 's' && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    dioxus.send("save_active_note");
                    return;
                }
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
            while let Ok(message) = eval.recv::<String>().await {
                match message.as_str() {
                    "quick_open" => show_quick_open.set(true),
                    "command_palette" => show_command_palette.set(true),
                    "workspace_search" => show_search.set(true),
                    "save_active_note" => commands.save_active_note.call(()),
                    "toggle_sidebar" => {
                        ui_state.write().toggle_sidebar();
                        let settings = ui_state.read().settings.clone();
                        commands.save_settings.call(settings);
                    }
                    _ => {}
                }
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
            if *show_quick_open.read() {
                QuickOpenModal { on_close: move |_| show_quick_open.set(false) }
            }
            if *show_command_palette.read() {
                CommandPaletteModal {
                    on_close: move |_| show_command_palette.set(false),
                    on_settings: move |_| show_settings.set(true),
                }
            }
            if *show_search.read() {
                SearchModal { on_close: move |_| show_search.set(false) }
            }
        }
    }
}
