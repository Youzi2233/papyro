use crate::components::primitives::IconButton;
use crate::context::use_app_context;
use crate::i18n::use_i18n;
use dioxus::prelude::*;
use papyro_core::models::Theme;

#[component]
pub fn AppHeader(on_settings: EventHandler<()>) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands;
    let brand_logo_src =
        try_use_context::<String>().unwrap_or_else(|| "/assets/logo.png".to_string());
    let sidebar_commands = commands.clone();
    let theme_commands = commands.clone();

    let theme = (app.theme)();
    let sidebar_collapsed = (app.sidebar_collapsed)();
    let theme_icon = theme_icon(&theme);
    let sidebar_icon = sidebar_icon(sidebar_collapsed);

    rsx! {
        header { class: "mn-header",
            IconButton {
                label: i18n.text("Toggle sidebar (Ctrl+\\)", "切换侧边栏 (Ctrl+\\)").to_string(),
                icon: sidebar_icon,
                icon_class: None::<String>,
                class_name: String::new(),
                disabled: false,
                selected: false,
                danger: false,
                on_click: move |_| {
                    crate::chrome::toggle_sidebar(sidebar_commands.clone(), "header");
                },
            }
            div { class: "mn-brand",
                img {
                    class: "mn-brand-logo",
                    src: brand_logo_src,
                    alt: "Papyro logo",
                }
                span { class: "mn-brand-title", "Papyro" }
            }
            div { class: "mn-header-spacer" }
            div { class: "mn-header-actions",
                IconButton {
                    label: i18n.text("Toggle theme", "切换主题").to_string(),
                    icon: theme_icon,
                    icon_class: None::<String>,
                    class_name: String::new(),
                    disabled: false,
                    selected: false,
                    danger: false,
                    on_click: move |_| {
                        crate::chrome::toggle_theme(theme_commands.clone());
                    },
                }
                IconButton {
                    label: i18n.text("Settings", "设置").to_string(),
                    icon: "\u{2699}",
                    icon_class: None::<String>,
                    class_name: String::new(),
                    disabled: false,
                    selected: false,
                    danger: false,
                    on_click: move |_| on_settings.call(()),
                }
            }
        }
    }
}

fn theme_icon(theme: &Theme) -> &'static str {
    if theme.is_dark() {
        "\u{2600}"
    } else {
        "\u{263E}"
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
        assert_eq!(theme_icon(&Theme::GitHubDark), "\u{2600}");
        assert_eq!(theme_icon(&Theme::WarmReading), "\u{263E}");
    }

    #[test]
    fn sidebar_icon_reflects_collapsed_state() {
        assert_eq!(sidebar_icon(true), "\u{2630}");
        assert_eq!(sidebar_icon(false), "\u{25E7}");
    }
}
