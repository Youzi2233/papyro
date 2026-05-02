use crate::components::{
    command_palette::CommandPaletteModal,
    editor::EditorPane,
    primitives::{AppShell, MainColumn, Workbench},
    quick_open::QuickOpenModal,
    recovery::{RecoveryDraftCompareModal, RecoveryDraftsModal},
    search::SearchModal,
    settings::SettingsModal,
    sidebar::Sidebar,
    status_bar::StatusBar,
    trash::TrashModal,
};
use crate::context::{use_app_context, SettingsWindowLauncher};
use crate::perf::{perf_timer, trace_chrome_open_modal};
use crate::theme::ThemeDomEffect;
use dioxus::prelude::*;
use papyro_core::models::ViewMode;

#[component]
pub fn DesktopLayout() -> Element {
    let app = use_app_context();
    let commands = app.commands;
    let mut show_settings = use_signal(|| false);
    let mut show_quick_open = use_signal(|| false);
    let mut show_command_palette = use_signal(|| false);
    let mut show_search = use_signal(|| false);
    let show_trash = use_signal(|| false);
    let settings_window_launcher = try_use_context::<SettingsWindowLauncher>();
    let sidebar_settings_launcher = settings_window_launcher.clone();
    let editor_settings_launcher = settings_window_launcher.clone();

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
                if (mod && e.altKey && !e.shiftKey && e.code === 'Digit1') {
                    e.preventDefault();
                    e.stopPropagation();
                    dioxus.send("view_mode_source");
                    return;
                }
                if (mod && e.altKey && !e.shiftKey && e.code === 'Digit2') {
                    e.preventDefault();
                    e.stopPropagation();
                    dioxus.send("view_mode_hybrid");
                    return;
                }
                if (mod && e.altKey && !e.shiftKey && e.code === 'Digit3') {
                    e.preventDefault();
                    e.stopPropagation();
                    dioxus.send("view_mode_preview");
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
                let Some(action) = desktop_shortcut_action(&message) else {
                    continue;
                };
                match action {
                    DesktopShortcutAction::QuickOpen => {
                        let started_at = perf_timer();
                        show_quick_open.set(true);
                        trace_chrome_open_modal("quick_open", "shortcut", started_at);
                    }
                    DesktopShortcutAction::CommandPalette => {
                        let started_at = perf_timer();
                        show_command_palette.set(true);
                        trace_chrome_open_modal("command_palette", "shortcut", started_at);
                    }
                    DesktopShortcutAction::WorkspaceSearch => {
                        let started_at = perf_timer();
                        show_search.set(true);
                        trace_chrome_open_modal("workspace_search", "shortcut", started_at);
                    }
                    DesktopShortcutAction::SaveActiveNote => {
                        shortcut_commands.save_active_note.call(())
                    }
                    DesktopShortcutAction::ToggleSidebar => {
                        crate::chrome::toggle_sidebar(shortcut_commands.clone(), "shortcut");
                    }
                    DesktopShortcutAction::SetViewMode(mode) => {
                        crate::chrome::set_view_mode(shortcut_commands.clone(), mode, "shortcut");
                    }
                }
            }
        });
    });

    rsx! {
        AppShell {
            ThemeDomEffect {}
            Workbench { class_name: String::new(),
                if !sidebar_collapsed {
                    Sidebar {
                        on_search: move |_| {
                            let started_at = perf_timer();
                            show_search.set(true);
                            trace_chrome_open_modal("workspace_search", "sidebar", started_at);
                        },
                        on_settings: move |_| {
                            let started_at = perf_timer();
                            if let Some(launcher) = sidebar_settings_launcher.clone() {
                                launcher.open.call(());
                            } else {
                                show_settings.set(true);
                            }
                            trace_chrome_open_modal("settings", "sidebar", started_at);
                        },
                    }
                }
                MainColumn {
                    EditorPane {
                        on_settings: move |_| {
                            let started_at = perf_timer();
                            if let Some(launcher) = editor_settings_launcher.clone() {
                                launcher.open.call(());
                            } else {
                                show_settings.set(true);
                            }
                            trace_chrome_open_modal("settings", "editor", started_at);
                        },
                        on_quick_open: move |_| {
                            let started_at = perf_timer();
                            show_quick_open.set(true);
                            trace_chrome_open_modal("quick_open", "editor", started_at);
                        },
                        on_command_palette: move |_| {
                            let started_at = perf_timer();
                            show_command_palette.set(true);
                            trace_chrome_open_modal("command_palette", "editor", started_at);
                        },
                    }
                    StatusBar {}
                }
            }
            DesktopModalLayer {
                show_settings,
                show_quick_open,
                show_command_palette,
                show_search,
                show_trash,
                settings_window_launcher,
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DesktopShortcutAction {
    QuickOpen,
    CommandPalette,
    WorkspaceSearch,
    SaveActiveNote,
    ToggleSidebar,
    SetViewMode(ViewMode),
}

fn desktop_shortcut_action(message: &str) -> Option<DesktopShortcutAction> {
    match message {
        "quick_open" => Some(DesktopShortcutAction::QuickOpen),
        "command_palette" => Some(DesktopShortcutAction::CommandPalette),
        "workspace_search" => Some(DesktopShortcutAction::WorkspaceSearch),
        "save_active_note" => Some(DesktopShortcutAction::SaveActiveNote),
        "toggle_sidebar" => Some(DesktopShortcutAction::ToggleSidebar),
        "view_mode_source" => Some(DesktopShortcutAction::SetViewMode(ViewMode::Source)),
        "view_mode_hybrid" => Some(DesktopShortcutAction::SetViewMode(ViewMode::Hybrid)),
        "view_mode_preview" => Some(DesktopShortcutAction::SetViewMode(ViewMode::Preview)),
        _ => None,
    }
}

#[component]
fn DesktopModalLayer(
    mut show_settings: Signal<bool>,
    mut show_quick_open: Signal<bool>,
    mut show_command_palette: Signal<bool>,
    mut show_search: Signal<bool>,
    mut show_trash: Signal<bool>,
    settings_window_launcher: Option<SettingsWindowLauncher>,
) -> Element {
    let app = use_app_context();
    let recovery_model = app.recovery_model.read().clone();
    let has_recovery_comparison = app.recovery_comparison.read().is_some();
    let mut show_recovery = use_signal(|| true);
    let reset_recovery_model = app.recovery_model;
    use_effect(move || {
        if !reset_recovery_model.read().has_drafts() {
            show_recovery.set(true);
        }
    });

    rsx! {
        if show_recovery() && recovery_model.has_drafts() {
            RecoveryDraftsModal { on_close: move |_| show_recovery.set(false) }
        }
        if has_recovery_comparison {
            RecoveryDraftCompareModal {}
        }
        if *show_settings.read() {
            SettingsModal { on_close: move |_| show_settings.set(false) }
        }
        if *show_quick_open.read() {
            QuickOpenModal { on_close: move |_| show_quick_open.set(false) }
        }
        if *show_command_palette.read() {
            CommandPaletteModal {
                on_close: move |_| show_command_palette.set(false),
                on_settings: move |_| {
                    if let Some(launcher) = settings_window_launcher.clone() {
                        launcher.open.call(());
                    } else {
                        show_settings.set(true);
                    }
                },
                on_trash: move |_| show_trash.set(true),
            }
        }
        if *show_search.read() {
            SearchModal { on_close: move |_| show_search.set(false) }
        }
        if *show_trash.read() {
            TrashModal { on_close: move |_| show_trash.set(false) }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_shortcut_messages_route_to_ui_actions() {
        assert_eq!(
            desktop_shortcut_action("quick_open"),
            Some(DesktopShortcutAction::QuickOpen)
        );
        assert_eq!(
            desktop_shortcut_action("command_palette"),
            Some(DesktopShortcutAction::CommandPalette)
        );
        assert_eq!(
            desktop_shortcut_action("workspace_search"),
            Some(DesktopShortcutAction::WorkspaceSearch)
        );
        assert_eq!(
            desktop_shortcut_action("save_active_note"),
            Some(DesktopShortcutAction::SaveActiveNote)
        );
        assert_eq!(
            desktop_shortcut_action("toggle_sidebar"),
            Some(DesktopShortcutAction::ToggleSidebar)
        );
        assert_eq!(
            desktop_shortcut_action("view_mode_source"),
            Some(DesktopShortcutAction::SetViewMode(ViewMode::Source))
        );
        assert_eq!(
            desktop_shortcut_action("view_mode_hybrid"),
            Some(DesktopShortcutAction::SetViewMode(ViewMode::Hybrid))
        );
        assert_eq!(
            desktop_shortcut_action("view_mode_preview"),
            Some(DesktopShortcutAction::SetViewMode(ViewMode::Preview))
        );
        assert_eq!(desktop_shortcut_action("unknown"), None);
    }
}
