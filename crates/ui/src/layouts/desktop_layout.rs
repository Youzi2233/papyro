use crate::components::{
    command_palette::CommandPaletteModal, editor::EditorPane, header::AppHeader,
    quick_open::QuickOpenModal, search::SearchModal, settings::SettingsModal, sidebar::Sidebar,
    status_bar::StatusBar,
};
use crate::context::use_app_context;
use crate::perf::{perf_timer, trace_chrome_open_modal};
use crate::theme::ThemeDomEffect;
use dioxus::prelude::*;

#[component]
pub fn DesktopLayout() -> Element {
    let app = use_app_context();
    let commands = app.commands;
    let mut show_settings = use_signal(|| false);
    let mut show_quick_open = use_signal(|| false);
    let mut show_command_palette = use_signal(|| false);
    let mut show_search = use_signal(|| false);

    let sidebar_collapsed = (app.sidebar_collapsed)();

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

        let shortcut_commands = commands.clone();
        spawn(async move {
            while let Ok(message) = eval.recv::<String>().await {
                match message.as_str() {
                    "quick_open" => {
                        let started_at = perf_timer();
                        show_quick_open.set(true);
                        trace_chrome_open_modal("quick_open", "shortcut", started_at);
                    }
                    "command_palette" => {
                        let started_at = perf_timer();
                        show_command_palette.set(true);
                        trace_chrome_open_modal("command_palette", "shortcut", started_at);
                    }
                    "workspace_search" => {
                        let started_at = perf_timer();
                        show_search.set(true);
                        trace_chrome_open_modal("workspace_search", "shortcut", started_at);
                    }
                    "save_active_note" => shortcut_commands.save_active_note.call(()),
                    "toggle_sidebar" => {
                        crate::chrome::toggle_sidebar(shortcut_commands.clone(), "shortcut");
                    }
                    _ => {}
                }
            }
        });
    });

    rsx! {
        div {
            class: "mn-shell",
            ThemeDomEffect {}
            AppHeader {
                on_settings: move |_| {
                    let started_at = perf_timer();
                    show_settings.set(true);
                    trace_chrome_open_modal("settings", "header", started_at);
                },
            }
            div { class: "mn-workbench",
                if !sidebar_collapsed {
                    Sidebar {}
                }
                EditorPane {}
            }
            StatusBar {}
            DesktopModalLayer {
                show_settings,
                show_quick_open,
                show_command_palette,
                show_search,
            }
        }
    }
}

#[component]
fn DesktopModalLayer(
    mut show_settings: Signal<bool>,
    mut show_quick_open: Signal<bool>,
    mut show_command_palette: Signal<bool>,
    mut show_search: Signal<bool>,
) -> Element {
    rsx! {
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
