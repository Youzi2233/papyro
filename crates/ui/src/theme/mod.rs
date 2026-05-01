use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::Theme;

pub const LIGHT_THEME_CLASS: &str = "theme-light";
pub const DARK_THEME_CLASS: &str = "theme-dark";

#[component]
pub fn ThemeDomEffect() -> Element {
    let app = use_app_context();
    let theme = (app.theme)();

    use_effect(use_reactive((&theme,), move |(theme,)| {
        let script = match theme {
            Theme::System => "document.documentElement.removeAttribute('data-theme');".to_string(),
            _ => format!(
                "document.documentElement.setAttribute('data-theme','{}');",
                theme.as_str()
            ),
        };
        document::eval(&script);
    }));

    rsx! {}
}
