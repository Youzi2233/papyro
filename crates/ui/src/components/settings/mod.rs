use crate::components::primitives::{
    Button, ButtonVariant, DialogSection, DropdownOption, Message, MessageTone, Modal, RawButton,
    Select, SettingsContent, SettingsLayout, SettingsNav, SettingsNavItem, SettingsPanel,
    SettingsRow, Slider, Switch,
};
use crate::context::use_app_context;
use crate::i18n::{use_i18n, UiText};
use dioxus::prelude::*;
use papyro_core::models::{
    AppLanguage, AppSettings, Theme, WorkspaceSettingsOverrides, FONT_PRESET_CJK_SANS,
    FONT_PRESET_MONO_CODE, FONT_PRESET_READING_SERIF, FONT_PRESET_SYSTEM_SERIF,
    FONT_PRESET_UI_SANS,
};
use std::time::Duration;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SettingsPanelKind {
    General,
    About,
}

#[derive(Debug, Clone)]
struct SettingsDraft {
    language: AppLanguage,
    theme: Theme,
    font_family: String,
    font_size: u8,
    line_height: f32,
    auto_link_paste: bool,
    auto_save_delay_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SettingsMessage {
    id: u64,
    text: String,
}

#[component]
pub fn SettingsModal(on_close: EventHandler<()>) -> Element {
    let i18n = use_i18n();

    rsx! {
        Modal {
            label: i18n.text("Settings", "设置").to_string(),
            class_name: "mn-modal mn-settings-modal".to_string(),
            on_close,
            SettingsSurface {
                on_close,
                window_chrome: false,
            }
        }
    }
}

#[component]
pub fn SettingsSurface(on_close: EventHandler<()>, window_chrome: bool) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands.clone();
    let settings_form_model = app.settings_form_model;
    let settings_form = settings_form_model.read().clone();
    let effective_settings = settings_form.workspace_settings.clone();
    let workspace_overrides = settings_form.workspace_overrides.clone();
    let has_workspace = settings_form.has_workspace;

    let mut active_panel = use_signal(|| SettingsPanelKind::General);
    let mut language = use_signal(|| effective_settings.language);
    let mut theme = use_signal(|| effective_settings.theme.clone());
    let mut font_family = use_signal(|| effective_settings.font_family.clone());
    let mut font_size = use_signal(|| effective_settings.font_size);
    let mut line_height = use_signal(|| effective_settings.line_height);
    let mut auto_link_paste = use_signal(|| effective_settings.auto_link_paste);
    let mut auto_save_ms = use_signal(|| effective_settings.auto_save_delay_ms);
    let settings_message = use_signal(|| None::<SettingsMessage>);
    let settings_message_revision = use_signal(|| 0_u64);
    let font_preview_style = font_preview_style(&font_family(), font_size(), line_height());

    let save_commands = commands.clone();
    let save_settings_form_model = settings_form_model;
    let feature_unavailable_message = i18n
        .text("Feature not implemented yet", "功能暂未实现")
        .to_string();

    let theme_options = theme_options(i18n);
    let language_options = vec![
        DropdownOption::new("English", "english"),
        DropdownOption::new("中文", "chinese"),
    ];
    let font_options = font_family_options(i18n);

    let save = move |_| {
        let base = save_settings_form_model.read().global_settings.clone();
        let draft = SettingsDraft {
            language: language(),
            theme: theme(),
            font_family: font_family(),
            font_size: font_size(),
            line_height: line_height(),
            auto_link_paste: auto_link_paste(),
            auto_save_delay_ms: auto_save_ms(),
        };
        let new_settings = form_settings(&base, &draft);

        save_commands.save_settings.call(new_settings);
        if has_workspace {
            let next_overrides = clear_global_managed_workspace_overrides(&workspace_overrides);
            if next_overrides != workspace_overrides {
                save_commands.save_workspace_settings.call(next_overrides);
            }
        }
        on_close.call(());
    };

    rsx! {
        SettingsTitleBar {
            title: i18n.text("Settings", "设置").to_string(),
            close_label: i18n.text("Close settings", "关闭设置").to_string(),
            minimize_label: i18n.text("Minimize settings", "最小化设置").to_string(),
            maximize_label: i18n.text("Maximize settings", "最大化设置").to_string(),
            window_chrome,
            on_close,
        }
        div { class: "mn-modal-body mn-settings-body",
            if let Some(message) = settings_message() {
                Message {
                    key: "{message.id}",
                    message: message.text,
                    tone: MessageTone::Info,
                    class_name: "mn-settings-message".to_string(),
                }
            }
            SettingsLayout {
                SettingsNav { label: i18n.text("Settings navigation", "设置导航").to_string(),
                    SettingsNavItem {
                            label: i18n.text("General", "通用设置").to_string(),
                            active: active_panel() == SettingsPanelKind::General,
                            class_name: "general".to_string(),
                            on_click: move |_| active_panel.set(SettingsPanelKind::General),
                        }
                    SettingsNavItem {
                            label: i18n.text("About Papyro", "关于 Papyro").to_string(),
                            active: active_panel() == SettingsPanelKind::About,
                            class_name: "about".to_string(),
                            on_click: move |_| active_panel.set(SettingsPanelKind::About),
                        }
                }
                SettingsContent {
                    if active_panel() == SettingsPanelKind::General {
                        SettingsPanel {
                            div { class: "mn-settings-panel-body mn-settings-grid",
                                div { class: "mn-settings-page-heading",
                                    h3 { {i18n.text("General", "通用设置")} }
                                }
                                DialogSection {
                                    label: i18n.text("Interface", "界面").to_string(),
                                    class_name: "mn-setting-section-card interface".to_string(),
                                    SettingsRow {
                                        label: i18n.text("Language", "语言").to_string(),
                                        description: None::<String>,
                                        class_name: "select-language".to_string(),
                                        Select {
                                            label: i18n.text("App language", "应用语言").to_string(),
                                            options: language_options,
                                            selected: language_value(language()).to_string(),
                                            on_change: move |value: String| {
                                                if let Some(next_language) = language_from_value(&value) {
                                                    language.set(next_language);
                                                }
                                            },
                                        }
                                    }
                                    SettingsRow {
                                        label: i18n.text("Theme", "主题").to_string(),
                                        description: None::<String>,
                                        class_name: "select-theme".to_string(),
                                        Select {
                                            label: i18n.text("Theme", "主题").to_string(),
                                            options: theme_options,
                                            selected: theme_value(&theme()).to_string(),
                                            on_change: move |value: String| {
                                                if let Some(next_theme) = theme_from_value(&value) {
                                                    theme.set(next_theme);
                                                }
                                            }
                                        }
                                    }
                                }
                                DialogSection {
                                    label: i18n.text("Editor", "编辑器").to_string(),
                                    class_name: "mn-setting-section-card editor".to_string(),
                                    SettingsRow {
                                        label: i18n.text("Font family", "字体").to_string(),
                                        description: None::<String>,
                                        class_name: "select-font".to_string(),
                                        Select {
                                            label: i18n.text("Font family", "字体").to_string(),
                                            options: font_options,
                                            selected: font_family(),
                                            on_change: move |value: String| font_family.set(value),
                                        }
                                    }
                                    SettingsRow {
                                        label: format!(
                                            "{} ({}px)",
                                            i18n.text("Font size", "字号"),
                                            font_size()
                                        ),
                                        description: None::<String>,
                                        class_name: String::new(),
                                        Slider {
                                            label: i18n.text("Font size", "字号").to_string(),
                                            value: font_size().to_string(),
                                            min: "12".to_string(),
                                            max: "24".to_string(),
                                            step: "1".to_string(),
                                            on_input: move |value: String| {
                                                if let Ok(v) = value.parse::<u8>() {
                                                    font_size.set(v);
                                                }
                                            },
                                        }
                                    }
                                    SettingsRow {
                                        label: format!(
                                            "{} ({:.1})",
                                            i18n.text("Line height", "行高"),
                                            line_height()
                                        ),
                                        description: None::<String>,
                                        class_name: String::new(),
                                        Slider {
                                            label: i18n.text("Line height", "行高").to_string(),
                                            value: format!("{:.1}", line_height()),
                                            min: "1.2".to_string(),
                                            max: "2.4".to_string(),
                                            step: "0.1".to_string(),
                                            on_input: move |value: String| {
                                                if let Ok(v) = value.parse::<f32>() {
                                                    line_height.set(v);
                                                }
                                            },
                                        }
                                    }
                                    div {
                                        class: "mn-font-preview mn-preview",
                                        style: "{font_preview_style}",
                                        h1 { {i18n.text("Heading 1", "一级标题")} }
                                        h2 { {i18n.text("Heading 2", "二级标题")} }
                                        p {
                                            {i18n.text("Body text shows line height, numbers 123, Chinese text, and ", "正文展示行高、数字 123、中文内容，以及 ")}
                                            code { "inline_code" }
                                            {i18n.text(".", "。")}
                                        }
                                    }
                                    SettingsRow {
                                        label: i18n.text("Paste URL as link", "粘贴 URL 时转成链接").to_string(),
                                        description: None::<String>,
                                        class_name: String::new(),
                                        Switch {
                                            label: i18n.text("Paste URL as link", "粘贴 URL 时转成链接").to_string(),
                                            checked: auto_link_paste(),
                                            on_change: move |checked| auto_link_paste.set(checked),
                                        }
                                    }
                                }
                                DialogSection {
                                    label: i18n.text("Saving", "保存").to_string(),
                                    class_name: "mn-setting-section-card saving".to_string(),
                                    SettingsRow {
                                        label: format!(
                                            "{} ({}ms)",
                                            i18n.text("Auto-save delay", "自动保存延迟"),
                                            auto_save_ms()
                                        ),
                                        description: None::<String>,
                                        class_name: String::new(),
                                        Slider {
                                            label: i18n.text("Auto-save delay", "自动保存延迟").to_string(),
                                            value: auto_save_ms().to_string(),
                                            min: "200".to_string(),
                                            max: "3000".to_string(),
                                            step: "100".to_string(),
                                            on_input: move |value: String| {
                                                if let Ok(v) = value.parse::<u64>() {
                                                    auto_save_ms.set(v);
                                                }
                                            },
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        SettingsPanel {
                            div { class: "mn-about-card",
                                div { class: "mn-about-heading",
                                    div { class: "mn-about-heading-copy",
                                        h3 { {i18n.text("About Papyro", "关于 Papyro")} }
                                    }
                                    span { class: "mn-about-status-badge",
                                        {i18n.text("Up to date", "当前已是最新版本")}
                                    }
                                }
                                section { class: "mn-about-product-card",
                                    div { class: "mn-about-logo-tile",
                                        img {
                                            class: "mn-about-logo",
                                            src: "/assets/logo.png",
                                            alt: "Papyro logo",
                                        }
                                    }
                                    div { class: "mn-about-product-copy",
                                        div { class: "mn-about-title-row",
                                            h4 { class: "mn-about-app", "Papyro" }
                                            span { class: "mn-about-version-badge", "v{APP_VERSION}" }
                                        }
                                        p { class: "mn-about-summary",
                                            {i18n.text(
                                                "Built for people who want their notes to stay readable, portable, and pleasant to work in every day.",
                                                "为那些希望笔记始终可读、可迁移、并且每天都用得顺手的人而设计。",
                                            )}
                                        }
                                    }
                                    div { class: "mn-about-actions",
                                        RawButton {
                                            class_name: "mn-about-action primary".to_string(),
                                            label: None::<String>,
                                            title: None::<String>,
                                            disabled: false,
                                            pressed: None::<bool>,
                                            checked: None::<bool>,
                                            role: None::<String>,
                                            stop_events: false,
                                            on_click: {
                                                let message = feature_unavailable_message.clone();
                                                move |_| {
                                                    show_settings_message(
                                                        settings_message,
                                                        settings_message_revision,
                                                        message.clone(),
                                                    );
                                                }
                                            },
                                            on_context_menu: None::<EventHandler<MouseEvent>>,
                                            {i18n.text("Check for updates", "检查更新")}
                                        }
                                        RawButton {
                                            class_name: "mn-about-action external".to_string(),
                                            label: None::<String>,
                                            title: None::<String>,
                                            disabled: false,
                                            pressed: None::<bool>,
                                            checked: None::<bool>,
                                            role: None::<String>,
                                            stop_events: false,
                                            on_click: {
                                                let message = feature_unavailable_message.clone();
                                                move |_| {
                                                    show_settings_message(
                                                        settings_message,
                                                        settings_message_revision,
                                                        message.clone(),
                                                    );
                                                }
                                            },
                                            on_context_menu: None::<EventHandler<MouseEvent>>,
                                            span { {i18n.text("Release notes", "查看发行说明")} }
                                            span { class: "mn-about-action-external", "aria-hidden": "true" }
                                        }
                                    }
                                }
                                section { class: "mn-about-section mn-about-features",
                                    h4 { {i18n.text("Core features", "核心特性")} }
                                    div { class: "mn-about-feature-list",
                                        AboutFeatureRow {
                                            class_name: "editor".to_string(),
                                            label: i18n.text("Markdown editor", "Markdown 编辑器").to_string(),
                                            value: i18n.text(
                                                "Switch between source, hybrid, and preview workflows.",
                                                "在源码、混合与预览工作流之间切换。",
                                            ).to_string(),
                                        }
                                        AboutFeatureRow {
                                            class_name: "workspace".to_string(),
                                            label: i18n.text("Workspace files", "工作区文件").to_string(),
                                            value: i18n.text(
                                                "Keep notes as readable local Markdown files.",
                                                "以可读的本地 Markdown 文件保存笔记。",
                                            ).to_string(),
                                        }
                                        AboutFeatureRow {
                                            class_name: "navigation".to_string(),
                                            label: i18n.text("Fast navigation", "快速导航").to_string(),
                                            value: i18n.text(
                                                "Use tabs, outline, and search to move through larger note sets.",
                                                "通过标签页、大纲与搜索管理更大的笔记集合。",
                                            ).to_string(),
                                        }
                                    }
                                }
                                section { class: "mn-about-section mn-about-resources",
                                    h4 { {i18n.text("Resources and support", "资源与支持")} }
                                    a {
                                        class: "mn-about-resource-link",
                                        href: "https://github.com/youzi2233/papyro",
                                        target: "_blank",
                                        rel: "noreferrer",
                                        span { class: "mn-about-resource-icon", "aria-hidden": "true" }
                                        span { class: "mn-about-resource-copy",
                                            span { class: "mn-about-resource-title",
                                                {i18n.text("GitHub repository", "GitHub 仓库")}
                                            }
                                        }
                                        span { class: "mn-about-resource-external", "aria-hidden": "true" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        div { class: "mn-modal-footer",
            Button {
                label: i18n.text("Cancel", "取消").to_string(),
                variant: ButtonVariant::Default,
                disabled: false,
                on_click: move |_| on_close.call(()),
            }
            Button {
                label: i18n.text("Save settings", "保存设置").to_string(),
                variant: ButtonVariant::Primary,
                disabled: false,
                on_click: save,
            }
        }
    }
}

#[component]
fn SettingsTitleBar(
    title: String,
    close_label: String,
    minimize_label: String,
    maximize_label: String,
    window_chrome: bool,
    on_close: EventHandler<()>,
) -> Element {
    rsx! {
        div {
            class: if window_chrome { "mn-modal-header mn-settings-titlebar window" } else { "mn-modal-header mn-settings-titlebar" },
            onmousedown: move |_| {
                if window_chrome {
                    drag_settings_window();
                }
            },
            ondoubleclick: move |_| {
                if window_chrome {
                    toggle_settings_window_maximized();
                }
            },
            h2 { class: "mn-modal-title", "{title}" }
            if window_chrome {
                div {
                    class: "mn-window-controls mn-settings-window-controls",
                    onmousedown: move |event| event.stop_propagation(),
                    ondoubleclick: move |event| event.stop_propagation(),
                    RawButton {
                        class_name: "mn-window-control minimize".to_string(),
                        label: Some(minimize_label),
                        title: None::<String>,
                        disabled: false,
                        pressed: None::<bool>,
                        checked: None::<bool>,
                        role: None::<String>,
                        stop_events: false,
                        on_click: move |event: MouseEvent| {
                            event.stop_propagation();
                            minimize_settings_window();
                        },
                        on_context_menu: None::<EventHandler<MouseEvent>>,
                        span { "aria-hidden": "true" }
                    }
                    RawButton {
                        class_name: "mn-window-control maximize".to_string(),
                        label: Some(maximize_label),
                        title: None::<String>,
                        disabled: false,
                        pressed: None::<bool>,
                        checked: None::<bool>,
                        role: None::<String>,
                        stop_events: false,
                        on_click: move |event: MouseEvent| {
                            event.stop_propagation();
                            toggle_settings_window_maximized();
                        },
                        on_context_menu: None::<EventHandler<MouseEvent>>,
                        span { "aria-hidden": "true" }
                    }
                    RawButton {
                        class_name: "mn-window-control close".to_string(),
                        label: Some(close_label.clone()),
                        title: None::<String>,
                        disabled: false,
                        pressed: None::<bool>,
                        checked: None::<bool>,
                        role: None::<String>,
                        stop_events: false,
                        on_click: move |event: MouseEvent| {
                            event.stop_propagation();
                            on_close.call(());
                        },
                        on_context_menu: None::<EventHandler<MouseEvent>>,
                        span { "aria-hidden": "true" }
                    }
                }
            } else {
                RawButton {
                    class_name: "mn-modal-close".to_string(),
                    label: Some(close_label),
                    title: None::<String>,
                    disabled: false,
                    pressed: None::<bool>,
                    checked: None::<bool>,
                    role: None::<String>,
                    stop_events: false,
                    on_click: move |_| on_close.call(()),
                    on_context_menu: None::<EventHandler<MouseEvent>>,
                    "x"
                }
            }
        }
    }
}

fn drag_settings_window() {
    #[cfg(feature = "desktop-shell")]
    {
        dioxus::desktop::window().drag();
    }
}

fn minimize_settings_window() {
    #[cfg(feature = "desktop-shell")]
    {
        dioxus::desktop::window().set_minimized(true);
    }
}

fn toggle_settings_window_maximized() {
    #[cfg(feature = "desktop-shell")]
    {
        dioxus::desktop::window().toggle_maximized();
    }
}

#[component]
fn AboutFeatureRow(class_name: String, label: String, value: String) -> Element {
    let class = format!("mn-about-feature {}", class_name);

    rsx! {
        div { class,
            span { class: "mn-about-feature-icon", "aria-hidden": "true" }
            span { class: "mn-about-feature-copy",
                span { class: "mn-about-feature-title", "{label}" }
                span { class: "mn-about-feature-desc", "{value}" }
            }
        }
    }
}

fn show_settings_message(
    mut settings_message: Signal<Option<SettingsMessage>>,
    mut settings_message_revision: Signal<u64>,
    text: String,
) {
    let id = settings_message_revision().saturating_add(1);
    settings_message_revision.set(id);
    settings_message.set(Some(SettingsMessage { id, text }));

    let mut clear_settings_message = settings_message;
    spawn(async move {
        tokio::time::sleep(Duration::from_millis(2200)).await;
        let should_clear = clear_settings_message
            .read()
            .as_ref()
            .is_some_and(|message| message.id == id);
        if should_clear {
            clear_settings_message.set(None);
        }
    });
}

fn theme_value(theme: &Theme) -> &'static str {
    theme.as_str()
}

fn theme_from_value(value: &str) -> Option<Theme> {
    match value {
        "system" => Some(Theme::System),
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        "github_light" => Some(Theme::GitHubLight),
        "github_dark" => Some(Theme::GitHubDark),
        "high_contrast" => Some(Theme::HighContrast),
        "warm_reading" => Some(Theme::WarmReading),
        _ => None,
    }
}

fn theme_options(i18n: UiText) -> Vec<DropdownOption> {
    vec![
        DropdownOption::new(i18n.text("System", "跟随系统"), Theme::System.as_str()),
        DropdownOption::new(i18n.text("Light", "浅色"), Theme::Light.as_str()),
        DropdownOption::new(i18n.text("Dark", "深色"), Theme::Dark.as_str()),
        DropdownOption::new(
            i18n.text("GitHub Light", "GitHub 浅色"),
            Theme::GitHubLight.as_str(),
        ),
        DropdownOption::new(
            i18n.text("GitHub Dark", "GitHub 深色"),
            Theme::GitHubDark.as_str(),
        ),
        DropdownOption::new(
            i18n.text("High Contrast", "高对比度"),
            Theme::HighContrast.as_str(),
        ),
        DropdownOption::new(
            i18n.text("Warm Reading", "暖色阅读"),
            Theme::WarmReading.as_str(),
        ),
    ]
}

fn font_family_options(i18n: UiText) -> Vec<DropdownOption> {
    vec![
        DropdownOption::new(i18n.text("UI Sans", "界面无衬线"), FONT_PRESET_UI_SANS),
        DropdownOption::new(
            i18n.text("System Serif", "系统衬线"),
            FONT_PRESET_SYSTEM_SERIF,
        ),
        DropdownOption::new(
            i18n.text("Reading Serif", "阅读衬线"),
            FONT_PRESET_READING_SERIF,
        ),
        DropdownOption::new(i18n.text("Mono Code", "代码等宽"), FONT_PRESET_MONO_CODE),
        DropdownOption::new(i18n.text("CJK Sans", "中日韩无衬线"), FONT_PRESET_CJK_SANS),
    ]
}

fn font_preview_style(font_family: &str, font_size: u8, line_height: f32) -> String {
    format!(
        "--mn-editor-font: {font_family}; --mn-editor-font-size: {font_size}px; --mn-editor-line-height: {line_height:.1}; --mn-markdown-body-size: {font_size}px; --mn-markdown-line-height: {line_height:.1};"
    )
}

fn language_value(language: AppLanguage) -> &'static str {
    language.as_str()
}

fn language_from_value(value: &str) -> Option<AppLanguage> {
    match value {
        "english" => Some(AppLanguage::English),
        "chinese" => Some(AppLanguage::Chinese),
        _ => None,
    }
}

fn form_settings(base: &AppSettings, draft: &SettingsDraft) -> AppSettings {
    AppSettings {
        theme: draft.theme.clone(),
        language: draft.language,
        font_family: draft.font_family.clone(),
        font_size: draft.font_size,
        line_height: draft.line_height,
        auto_link_paste: draft.auto_link_paste,
        auto_save_delay_ms: draft.auto_save_delay_ms,
        show_word_count: base.show_word_count,
        sidebar_width: base.sidebar_width,
        sidebar_collapsed: base.sidebar_collapsed,
        note_open_mode: base.note_open_mode.clone(),
        view_mode: base.view_mode.clone(),
    }
}

fn clear_global_managed_workspace_overrides(
    overrides: &WorkspaceSettingsOverrides,
) -> WorkspaceSettingsOverrides {
    let mut next = overrides.clone();
    next.theme = None;
    next.font_family = None;
    next.font_size = None;
    next.line_height = None;
    next.auto_link_paste = None;
    next.auto_save_delay_ms = None;
    next
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segmented_setting_values_round_trip() {
        assert_eq!(theme_value(&Theme::Dark), "dark");
        assert_eq!(theme_value(&Theme::GitHubLight), "github_light");
        assert_eq!(theme_from_value("system"), Some(Theme::System));
        assert_eq!(theme_from_value("warm_reading"), Some(Theme::WarmReading));
        assert_eq!(theme_from_value("missing"), None);
        assert_eq!(language_value(AppLanguage::Chinese), "chinese");
        assert_eq!(language_from_value("english"), Some(AppLanguage::English));
        assert_eq!(language_from_value("missing"), None);
    }

    #[test]
    fn theme_options_include_curated_themes() {
        let options = theme_options(UiText::new(AppLanguage::English));
        let values = options
            .iter()
            .map(|option| option.value.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            values,
            vec![
                "system",
                "light",
                "dark",
                "github_light",
                "github_dark",
                "high_contrast",
                "warm_reading"
            ]
        );
    }

    #[test]
    fn font_family_options_are_system_first_markdown_presets() {
        let options = font_family_options(UiText::new(AppLanguage::English));
        let labels = options
            .iter()
            .map(|option| option.label.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            labels,
            vec![
                "UI Sans",
                "System Serif",
                "Reading Serif",
                "Mono Code",
                "CJK Sans"
            ]
        );
        assert!(options
            .iter()
            .any(|option| option.value == FONT_PRESET_UI_SANS));
        assert!(options
            .iter()
            .any(|option| option.value == FONT_PRESET_MONO_CODE));
    }

    #[test]
    fn font_preview_style_reflects_current_typography() {
        assert_eq!(
            font_preview_style("system-ui", 17, 1.7),
            "--mn-editor-font: system-ui; --mn-editor-font-size: 17px; --mn-editor-line-height: 1.7; --mn-markdown-body-size: 17px; --mn-markdown-line-height: 1.7;"
        );
    }

    #[test]
    fn clearing_global_managed_workspace_overrides_preserves_unrelated_fields() {
        let overrides = WorkspaceSettingsOverrides {
            theme: Some(Theme::Dark),
            font_family: Some("Fira Code".to_string()),
            font_size: Some(18),
            line_height: Some(1.8),
            auto_link_paste: Some(false),
            auto_save_delay_ms: Some(900),
            sidebar_width: Some(320),
            sidebar_collapsed: Some(true),
            view_mode: Some(papyro_core::models::ViewMode::Preview),
            ..WorkspaceSettingsOverrides::default()
        };

        let cleared = clear_global_managed_workspace_overrides(&overrides);
        assert_eq!(cleared.theme, None);
        assert_eq!(cleared.font_family, None);
        assert_eq!(cleared.font_size, None);
        assert_eq!(cleared.line_height, None);
        assert_eq!(cleared.auto_link_paste, None);
        assert_eq!(cleared.auto_save_delay_ms, None);
        assert_eq!(cleared.sidebar_width, Some(320));
        assert_eq!(cleared.sidebar_collapsed, Some(true));
        assert_eq!(
            cleared.view_mode,
            Some(papyro_core::models::ViewMode::Preview)
        );
    }
}
