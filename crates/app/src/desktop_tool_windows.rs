use crate::runtime::AppShell;
use dioxus::desktop::tao::dpi::LogicalSize;
use dioxus::desktop::tao::event::{Event, WindowEvent};
use dioxus::desktop::tao::window::Icon;
use dioxus::desktop::{window, Config, DesktopContext, WindowBuilder};
use dioxus::prelude::*;
use papyro_core::models::{AppLanguage, Theme};
use papyro_ui::context::{AppContext, SettingsWindowLauncher};

const SETTINGS_TOOL_WINDOW_CSS: &str = concat!(
    include_str!("../../../assets/styles/modal.css"),
    "\n",
    include_str!("../../../assets/main.css")
);
const SETTINGS_TOOL_WINDOW_FAVICON: &str = "/assets/favicon.ico";
const PAPYRO_WINDOW_ICON: &[u8] = include_bytes!("../../../assets/logo.png");

#[derive(Clone, PartialEq)]
struct SettingsToolWindowProps {
    app_context: AppContext,
    on_closed: EventHandler<()>,
}

pub(crate) fn use_settings_window_launcher(
    shell: AppShell,
    app_context: AppContext,
) -> SettingsWindowLauncher {
    let settings_window = use_signal(|| None::<DesktopContext>);

    SettingsWindowLauncher {
        open: EventHandler::new(move |_| {
            if shell != AppShell::Desktop {
                return;
            }

            if let Some(existing_window) = settings_window.read().as_ref() {
                existing_window.set_visible(true);
                existing_window.set_focus();
                return;
            }

            let mut settings_window_for_close = settings_window;
            let on_closed = EventHandler::new(move |_| {
                settings_window_for_close.set(None);
            });
            let props = SettingsToolWindowProps {
                app_context: app_context.clone(),
                on_closed,
            };
            let settings = app_context.ui_state.read().settings.clone();
            let pending = window().new_window(
                VirtualDom::new_with_props(SettingsToolWindowRoot, props),
                settings_tool_window_config(&settings.theme, settings.language),
            );

            let mut settings_window_for_open = settings_window;
            spawn(async move {
                let opened_window = pending.await;
                settings_window_for_open.set(Some(opened_window));
            });
        }),
    }
}

#[allow(non_snake_case)]
fn SettingsToolWindowRoot(props: SettingsToolWindowProps) -> Element {
    let SettingsToolWindowProps {
        app_context,
        on_closed,
    } = props;
    use_context_provider(|| app_context);
    let window_id = window().id();
    let native_close = on_closed;

    dioxus::desktop::use_wry_event_handler(move |event, _| {
        if let Event::WindowEvent {
            window_id: closed_window_id,
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            if *closed_window_id == window_id {
                native_close.call(());
            }
        }
    });

    let close_button = on_closed;
    let close_settings = EventHandler::new(move |_| {
        close_button.call(());
        window().close();
    });
    let i18n = papyro_ui::i18n::use_i18n();
    let language = i18n.language();

    use_effect(move || {
        let current_window = window();
        current_window.set_visible(true);
        current_window.set_focus();
    });

    use_effect(use_reactive((&language,), move |(language,)| {
        document::eval(&settings_language_script(language));
    }));

    rsx! {
        div { class: "mn-modal mn-settings-modal mn-settings-window-shell",
            document::Title { "{settings_window_title(language)}" }
            papyro_ui::theme::ThemeDomEffect {}
            papyro_ui::components::settings::SettingsSurface {
                on_close: close_settings,
            }
        }
    }
}

fn settings_tool_window_config(theme: &Theme, language: AppLanguage) -> Config {
    let window = WindowBuilder::new()
        .with_title(settings_window_title(language))
        .with_inner_size(LogicalSize::new(980.0, 720.0))
        .with_min_inner_size(LogicalSize::new(720.0, 560.0))
        .with_visible(false)
        .with_window_icon(settings_window_icon())
        .with_always_on_top(false);

    Config::new()
        .with_menu(None)
        .with_window(window)
        .with_background_color(settings_window_background(theme))
        .with_custom_head(settings_tool_window_head(theme, language))
}

fn settings_window_title(language: AppLanguage) -> &'static str {
    match language {
        AppLanguage::English => "Papyro Settings",
        AppLanguage::Chinese => "Papyro 设置",
    }
}

fn settings_tool_window_head(theme: &Theme, language: AppLanguage) -> String {
    let theme_script = match theme {
        Theme::System => String::new(),
        _ => format!(
            "<script>document.documentElement.setAttribute('data-theme','{}');</script>",
            theme.as_str()
        ),
    };
    let lang = settings_window_lang(language);

    format!(
        r#"{theme_script}<script>document.documentElement.lang='{lang}';</script>
<link rel="icon" href="{SETTINGS_TOOL_WINDOW_FAVICON}">
<style>
html,body{{margin:0;padding:0;overflow:hidden;background:#f3f5f8;color:#111827;font-family:"SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",system-ui,sans-serif;}}
:root[data-theme="dark"] html,:root[data-theme="dark"] body{{background:#0f1117;color:#f3f4f6;}}
:root[data-theme="github_light"] html,:root[data-theme="github_light"] body{{background:#f6f8fa;color:#24292f;}}
:root[data-theme="github_dark"] html,:root[data-theme="github_dark"] body{{background:#0d1117;color:#e6edf3;}}
:root[data-theme="high_contrast"] html,:root[data-theme="high_contrast"] body{{background:#000000;color:#ffffff;}}
:root[data-theme="warm_reading"] html,:root[data-theme="warm_reading"] body{{background:#f4f1e8;color:#202124;}}
@media(prefers-color-scheme:dark){{:root:not([data-theme]) html,:root:not([data-theme]) body{{background:#0f1117;color:#f3f4f6;}}}}
</style>
<style>{SETTINGS_TOOL_WINDOW_CSS}</style>"#
    )
}

fn settings_window_lang(language: AppLanguage) -> &'static str {
    match language {
        AppLanguage::English => "en",
        AppLanguage::Chinese => "zh-CN",
    }
}

fn settings_language_script(language: AppLanguage) -> String {
    format!(
        "document.documentElement.lang='{}';",
        settings_window_lang(language)
    )
}

fn settings_window_background(theme: &Theme) -> (u8, u8, u8, u8) {
    match theme {
        Theme::Dark | Theme::GitHubDark | Theme::HighContrast => (15, 17, 23, 255),
        Theme::System | Theme::Light | Theme::GitHubLight | Theme::WarmReading => {
            (243, 245, 248, 255)
        }
    }
}

fn settings_window_icon() -> Option<Icon> {
    let image = image::load_from_memory(PAPYRO_WINDOW_ICON)
        .ok()?
        .into_rgba8();
    let (width, height) = image.dimensions();
    Icon::from_rgba(image.into_raw(), width, height).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_tool_window_head_seeds_non_system_theme() {
        let head = settings_tool_window_head(&Theme::GitHubDark, AppLanguage::English);

        assert!(head.contains("data-theme','github_dark'"));
        assert!(head.contains(".mn-settings-window-shell"));
    }

    #[test]
    fn settings_tool_window_head_seeds_language_and_icon() {
        let head = settings_tool_window_head(&Theme::Light, AppLanguage::Chinese);

        assert!(head.contains("document.documentElement.lang='zh-CN'"));
        assert!(head.contains(r#"<link rel="icon" href="/assets/favicon.ico">"#));
    }

    #[test]
    fn settings_tool_window_background_uses_dark_color_for_dark_themes() {
        assert_eq!(settings_window_background(&Theme::Dark), (15, 17, 23, 255));
        assert_eq!(
            settings_window_background(&Theme::GitHubLight),
            (243, 245, 248, 255)
        );
    }

    #[test]
    fn settings_tool_window_title_is_localized() {
        assert_eq!(
            settings_window_title(AppLanguage::English),
            "Papyro Settings"
        );
        assert_eq!(settings_window_title(AppLanguage::Chinese), "Papyro 设置");
    }

    #[test]
    fn settings_window_language_script_tracks_i18n() {
        assert_eq!(settings_window_lang(AppLanguage::English), "en");
        assert_eq!(settings_window_lang(AppLanguage::Chinese), "zh-CN");
        assert_eq!(
            settings_language_script(AppLanguage::Chinese),
            "document.documentElement.lang='zh-CN';"
        );
    }

    #[test]
    fn settings_tool_window_icon_loads_papyro_asset() {
        assert!(settings_window_icon().is_some());
    }
}
