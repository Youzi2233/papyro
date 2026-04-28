use crate::components::primitives::IconButton;
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::Theme;

#[component]
pub fn AppHeader(on_settings: EventHandler<()>) -> Element {
    let app = use_app_context();
    let ui_state = app.ui_state;
    let commands = app.commands;
    let sidebar_commands = commands.clone();
    let theme_commands = commands.clone();

    let theme = (app.theme)();
    let sidebar_collapsed = (app.sidebar_collapsed)();
    let theme_icon = theme_icon(&theme);
    let sidebar_icon = sidebar_icon(sidebar_collapsed);

    rsx! {
        header { class: "mn-header",
            IconButton {
                label: "Toggle sidebar (Ctrl+\\)",
                icon: sidebar_icon,
                on_click: move |_| {
                    crate::chrome::toggle_sidebar(ui_state, sidebar_commands.clone(), "header");
                },
            }
            span { class: "mn-brand-title", "Papyro" }
            div { class: "mn-header-spacer" }
            div { class: "mn-header-actions",
                IconButton {
                    label: "Toggle theme",
                    icon: theme_icon,
                    on_click: move |_| {
                        crate::chrome::toggle_theme(ui_state, theme_commands.clone());
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

fn theme_icon(theme: &Theme) -> &'static str {
    match theme {
        Theme::Dark => "\u{2600}",
        Theme::Light | Theme::System => "\u{263E}",
    }
}

fn sidebar_icon(collapsed: bool) -> &'static str {
    if collapsed {
        "\u{2630}"
    } else {
        "\u{25E7}"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_icon_reflects_visible_toggle_target() {
        assert_eq!(theme_icon(&Theme::Dark), "\u{2600}");
        assert_eq!(theme_icon(&Theme::Light), "\u{263E}");
        assert_eq!(theme_icon(&Theme::System), "\u{263E}");
    }

    #[test]
    fn sidebar_icon_reflects_collapsed_state() {
        assert_eq!(sidebar_icon(true), "\u{2630}");
        assert_eq!(sidebar_icon(false), "\u{25E7}");
    }
}
