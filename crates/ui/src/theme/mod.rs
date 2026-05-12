use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::Theme;

pub const LIGHT_THEME_CLASS: &str = "theme-light";
pub const DARK_THEME_CLASS: &str = "theme-dark";

pub fn theme_dom_script(theme: &Theme) -> String {
    let theme_attr = match theme {
        Theme::System => "null".to_string(),
        _ => format!(r#""{}""#, theme.as_str()),
    };
    let explicit_dark = if theme.is_dark() { "true" } else { "false" };

    format!(
        r#"(function() {{
  var root = document.documentElement;
  var theme = {theme_attr};
  var query = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function applyPapyroTheme() {{
    var dark = theme ? {explicit_dark} : !!(query && query.matches);
    if (theme) {{
      root.setAttribute("data-theme", theme);
    }} else {{
      root.removeAttribute("data-theme");
    }}
    root.classList.toggle("dark", dark);
    root.classList.toggle("{DARK_THEME_CLASS}", dark);
    root.classList.toggle("{LIGHT_THEME_CLASS}", !dark);
  }}
  applyPapyroTheme();
  if (
    window.__papyroThemeMediaQuery &&
    window.__papyroThemeMediaListener &&
    window.__papyroThemeMediaQuery.removeEventListener
  ) {{
    window.__papyroThemeMediaQuery.removeEventListener(
      "change",
      window.__papyroThemeMediaListener
    );
  }}
  if (!theme && query && query.addEventListener) {{
    window.__papyroThemeMediaQuery = query;
    window.__papyroThemeMediaListener = applyPapyroTheme;
    query.addEventListener("change", applyPapyroTheme);
  }} else {{
    window.__papyroThemeMediaQuery = null;
    window.__papyroThemeMediaListener = null;
  }}
}})();"#
    )
}

#[component]
pub fn ThemeDomEffect() -> Element {
    let app = use_app_context();
    let theme = (app.theme)();

    use_effect(use_reactive((&theme,), move |(theme,)| {
        document::eval(&theme_dom_script(&theme));
    }));

    rsx! {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_script_sets_official_dark_class_for_dark_themes() {
        let script = theme_dom_script(&Theme::GitHubDark);

        assert!(script.contains(r#"var theme = "github_dark";"#));
        assert!(script.contains(r#"var dark = theme ? true"#));
        assert!(script.contains(r#"root.classList.toggle("dark", dark)"#));
        assert!(script.contains(DARK_THEME_CLASS));
    }

    #[test]
    fn theme_script_tracks_system_theme_without_forcing_data_theme() {
        let script = theme_dom_script(&Theme::System);

        assert!(script.contains("var theme = null;"));
        assert!(script.contains("prefers-color-scheme: dark"));
        assert!(script.contains(r#"root.removeAttribute("data-theme")"#));
        assert!(script.contains(LIGHT_THEME_CLASS));
    }
}
