use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::Theme;

#[component]
pub fn AppHeader(on_settings: EventHandler<()>) -> Element {
    let app = use_app_context();
    let mut ui_state = app.ui_state;
    let commands = app.commands;

    let theme = ui_state.read().theme().clone();
    let collapsed = ui_state.read().sidebar_collapsed();

    let theme_icon = match theme {
        Theme::Dark => "\u{2600}",
        _ => "\u{263E}",
    };

    let sidebar_icon = if collapsed { "\u{2630}" } else { "\u{25E7}" };

    rsx! {
        header { class: "mn-header",
            button {
                class: "mn-icon-btn",
                title: "Toggle sidebar (Ctrl+\\)",
                onclick: move |_| {
                    ui_state.write().toggle_sidebar();
                    let settings = ui_state.read().settings.clone();
                    commands.save_settings.call(settings);
                },
                "{sidebar_icon}"
            }
            span { class: "mn-brand-title", "Papyro" }
            div { class: "mn-header-spacer" }
            div { class: "mn-header-actions",
                button {
                    class: "mn-icon-btn",
                    title: "Toggle theme",
                    onclick: move |_| {
                        let mut settings = ui_state.read().settings.clone();
                        settings.theme = match ui_state.read().theme() {
                            Theme::Light | Theme::System => Theme::Dark,
                            Theme::Dark => Theme::Light,
                        };
                        commands.save_settings.call(settings);
                    },
                    "{theme_icon}"
                }
                button {
                    class: "mn-icon-btn",
                    title: "Settings",
                    onclick: move |_| on_settings.call(()),
                    "\u{2699}"
                }
            }
        }
    }
}
