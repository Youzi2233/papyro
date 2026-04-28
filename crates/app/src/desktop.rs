use crate::runtime::{use_app_runtime, AppShell};
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, Theme};
use papyro_core::NoteStorage;
use papyro_platform::{DesktopPlatform, PlatformApi};
use std::fmt::Display;
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopStartupChrome {
    pub background_color: (u8, u8, u8, u8),
    pub custom_head: String,
}

pub fn desktop_startup_chrome(favicon: impl Display, main_css: &str) -> DesktopStartupChrome {
    let settings = load_startup_settings();
    build_startup_chrome(&settings, &favicon.to_string(), main_css)
}

fn load_startup_settings() -> AppSettings {
    DesktopPlatform
        .get_app_data_dir()
        .ok()
        .and_then(|dir| papyro_storage::SqliteStorage::shared_in_app_data_dir(&dir).ok())
        .map(|storage| storage.load_settings())
        .unwrap_or_default()
}

fn build_startup_chrome(
    settings: &AppSettings,
    favicon: &str,
    main_css: &str,
) -> DesktopStartupChrome {
    let light_bg = (251, 246, 234, 255);
    let dark_bg = (22, 19, 14, 255);

    let (background_color, forced_theme_attr) = match settings.theme {
        Theme::Light => (light_bg, "light"),
        Theme::Dark => (dark_bg, "dark"),
        Theme::System => (dark_bg, ""),
    };

    let theme_script = if forced_theme_attr.is_empty() {
        String::new()
    } else {
        format!(
            "<script>document.documentElement.setAttribute('data-theme','{forced_theme_attr}');</script>"
        )
    };

    let custom_head = format!(
        r#"{theme_script}<link rel="icon" href="{favicon}">
<style>
html,body{{margin:0;padding:0;overflow:hidden;background:#fbf6ea;color:#25211a;
font-family:"SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",system-ui,sans-serif;}}
:root[data-theme="dark"] html,:root[data-theme="dark"] body{{background:#16130e;color:#f0e6d1;}}
@media(prefers-color-scheme:dark){{:root:not([data-theme="light"]) html,:root:not([data-theme="light"]) body{{background:#16130e;color:#f0e6d1;}}}}
</style>
<style>{main_css}</style>"#,
        favicon = favicon,
    );

    DesktopStartupChrome {
        background_color,
        custom_head,
    }
}

#[component]
pub fn DesktopApp() -> Element {
    let bootstrap = papyro_storage::bootstrap_from_env_or_current_dir();
    let storage = use_hook(|| {
        Arc::new(papyro_storage::SqliteStorage::shared().expect("default storage is initialized"))
            as Arc<dyn NoteStorage>
    });
    let platform = use_hook(|| Arc::new(DesktopPlatform) as Arc<dyn PlatformApi>);
    use_app_runtime(AppShell::Desktop, bootstrap, storage, platform);

    rsx! {
        papyro_ui::layouts::DesktopLayout {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_chrome_forces_light_theme_when_configured() {
        let settings = AppSettings {
            theme: Theme::Light,
            ..AppSettings::default()
        };

        let chrome =
            build_startup_chrome(&settings, "/favicon.ico", ".mn-shell { display: grid; }");

        assert_eq!(chrome.background_color, (251, 246, 234, 255));
        assert!(chrome.custom_head.contains("data-theme','light'"));
        assert!(chrome.custom_head.contains(r#"href="/favicon.ico""#));
        assert!(chrome.custom_head.contains(".mn-shell"));
        assert!(!chrome.custom_head.contains("papyroEditor"));
    }

    #[test]
    fn startup_chrome_defers_system_theme_to_css_media_query() {
        let settings = AppSettings {
            theme: Theme::System,
            ..AppSettings::default()
        };

        let chrome = build_startup_chrome(&settings, "/favicon.ico", "");

        assert_eq!(chrome.background_color, (22, 19, 14, 255));
        assert!(!chrome.custom_head.contains("setAttribute('data-theme'"));
        assert!(chrome.custom_head.contains("prefers-color-scheme:dark"));
    }
}
