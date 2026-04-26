use crate::components::primitives::IconButton;
use crate::context::use_app_context;
use crate::perf::{perf_timer, trace_sidebar_toggle};
use dioxus::prelude::*;
use papyro_core::models::Theme;

#[component]
pub fn AppHeader(on_settings: EventHandler<()>) -> Element {
    let app = use_app_context();
    let mut ui_state = app.ui_state;
    let commands = app.commands;
    let settings = ui_state.read().settings.clone();

    let theme = ui_state.read().theme().clone();
    let collapsed = settings.sidebar_collapsed;

    let theme_icon = match theme {
        Theme::Dark => "\u{2600}",
        _ => "\u{263E}",
    };

    let sidebar_icon = if collapsed { "\u{2630}" } else { "\u{25E7}" };

    rsx! {
        header { class: "mn-header",
            IconButton {
                label: "Toggle sidebar (Ctrl+\\)",
                icon: sidebar_icon,
                on_click: move |_| {
                    let started_at = perf_timer();
                    ui_state.write().toggle_sidebar();
                    let settings = ui_state.read().settings.clone();
                    trace_sidebar_toggle(
                        "header",
                        settings.sidebar_collapsed,
                        started_at,
                    );
                    commands.save_settings.call(settings);
                },
            }
            span { class: "mn-brand-title", "Papyro" }
            div { class: "mn-header-spacer" }
            div { class: "mn-header-actions",
                IconButton {
                    label: "Toggle theme",
                    icon: theme_icon,
                    on_click: move |_| {
                        let mut settings = ui_state.read().settings.clone();
                        settings.theme = match ui_state.read().theme() {
                            Theme::Light | Theme::System => Theme::Dark,
                            Theme::Dark => Theme::Light,
                        };
                        commands.save_settings.call(settings);
                    },
                }
                IconButton {
                    label: "Settings",
                    icon: "\u{2699}",
                    on_click: move |_| on_settings.call(()),
                }
            }
        }
    }
}
