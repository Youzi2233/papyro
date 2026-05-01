use crate::commands::{
    AppCommands, DeleteTagRequest, RenameTagRequest, SetTagColorRequest, UpsertTagRequest,
};
use crate::components::primitives::{
    Button, ButtonVariant, Dropdown, DropdownOption, FormField, Modal, Slider, Toggle,
};
use crate::context::use_app_context;
use crate::i18n::{use_i18n, UiText};
use crate::view_model::TagListItem;
use dioxus::prelude::*;
use papyro_core::models::{
    AppLanguage, AppSettings, Theme, WorkspaceSettingsOverrides, FONT_PRESET_CJK_SANS,
    FONT_PRESET_MONO_CODE, FONT_PRESET_READING_SERIF, FONT_PRESET_SYSTEM_SERIF,
    FONT_PRESET_UI_SANS,
};

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_TAG_COLOR: &str = "#6B7280";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SettingsPanel {
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

#[component]
pub fn SettingsModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands.clone();
    let settings_form_model = app.settings_form_model;
    let settings_workspace = app.settings_workspace_model.read().clone();
    let settings_form = settings_form_model.read().clone();
    let effective_settings = settings_form.workspace_settings.clone();
    let workspace_overrides = settings_form.workspace_overrides.clone();
    let has_workspace = settings_form.has_workspace;

    let mut active_panel = use_signal(|| SettingsPanel::General);
    let mut language = use_signal(|| effective_settings.language);
    let mut theme = use_signal(|| effective_settings.theme.clone());
    let mut font_family = use_signal(|| effective_settings.font_family.clone());
    let mut font_size = use_signal(|| effective_settings.font_size);
    let mut line_height = use_signal(|| effective_settings.line_height);
    let mut auto_link_paste = use_signal(|| effective_settings.auto_link_paste);
    let mut auto_save_ms = use_signal(|| effective_settings.auto_save_delay_ms);
    let font_preview_style = font_preview_style(&font_family(), font_size(), line_height());

    let save_commands = commands.clone();
    let save_settings_form_model = settings_form_model;
    let tag_commands = commands.clone();

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
    Modal {
        label: i18n.text("Settings", "设置").to_string(),
        class_name: "mn-modal mn-settings-modal".to_string(),
        on_close,
        div { class: "mn-modal-header",
                h2 { class: "mn-modal-title", {i18n.text("Settings", "设置")} }
                button {
                    class: "mn-modal-close",
                    "aria-label": i18n.text("Close settings", "关闭设置"),
                    onclick: move |_| on_close.call(()),
                    "x"
                }
            }
            div { class: "mn-modal-body mn-settings-body",
                div { class: "mn-settings-layout",
                    nav {
                        class: "mn-settings-nav",
                        "aria-label": i18n.text("Settings navigation", "设置导航"),
                        div { class: "mn-settings-nav-list",
                            SettingsNavButton {
                                label: i18n.text("General", "通用设置").to_string(),
                                active: active_panel() == SettingsPanel::General,
                                on_click: move |_| active_panel.set(SettingsPanel::General),
                            }
                            SettingsNavButton {
                                label: i18n.text("About Papyro", "关于 Papyro").to_string(),
                                active: active_panel() == SettingsPanel::About,
                                on_click: move |_| active_panel.set(SettingsPanel::About),
                            }
                        }
                    }
                    div { class: "mn-settings-content",
                        if active_panel() == SettingsPanel::General {
                            div { class: "mn-settings-panel",
                                div { class: "mn-settings-panel-body mn-settings-grid",
                                    SettingSection {
                                        label: i18n.text("Interface", "界面").to_string(),
                                        class_name: "mn-setting-section-card".to_string(),
                                        FormField {
                                            label: i18n.text("Language", "语言").to_string(),
                                            class_name: String::new(),
                                            Dropdown {
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
                                        FormField {
                                            label: i18n.text("Theme", "主题").to_string(),
                                            class_name: String::new(),
                                            Dropdown {
                                                label: i18n.text("Theme", "主题").to_string(),
                                                options: theme_options,
                                                selected: theme_value(&theme()).to_string(),
                                                on_change: move |value: String| {
                                                    if let Some(next_theme) = theme_from_value(&value) {
                                                        theme.set(next_theme);
                                                    }
                                                },
                                            }
                                        }
                                    }
                                    SettingSection {
                                        label: i18n.text("Editor", "编辑器").to_string(),
                                        class_name: "mn-setting-section-card".to_string(),
                                        FormField {
                                            label: i18n.text("Font family", "字体").to_string(),
                                            class_name: String::new(),
                                            Dropdown {
                                                label: i18n.text("Font family", "字体").to_string(),
                                                options: font_options,
                                                selected: font_family(),
                                                on_change: move |value: String| font_family.set(value),
                                            }
                                        }
                                        FormField {
                                            label: format!(
                                                "{} ({}px)",
                                                i18n.text("Font size", "字号"),
                                                font_size()
                                            ),
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
                                        FormField {
                                            label: format!(
                                                "{} ({:.1})",
                                                i18n.text("Line height", "行高"),
                                                line_height()
                                            ),
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
                                            class: "mn-font-preview",
                                            style: "{font_preview_style}",
                                            p { class: "mn-font-preview-title", {i18n.text("A clear note starts with readable type.", "清晰的笔记，从易读的字体开始。")} }
                                            p { class: "mn-font-preview-body", {i18n.text("Headings, body text, numbers 123, and 中文内容 should all feel calm and balanced.", "标题、正文、数字 123 和中文内容都应该清楚、平衡。")} }
                                            code { class: "mn-font-preview-code", "inline_code = true" }
                                        }
                                        FormField {
                                            label: i18n.text("Paste URL as link", "粘贴 URL 时转成链接").to_string(),
                                            class_name: String::new(),
                                            Toggle {
                                                label: i18n.text("Paste URL as link", "粘贴 URL 时转成链接").to_string(),
                                                checked: auto_link_paste(),
                                                on_change: move |checked| auto_link_paste.set(checked),
                                            }
                                        }
                                    }
                                    SettingSection {
                                        label: i18n.text("Saving", "保存").to_string(),
                                        class_name: "mn-setting-section-card".to_string(),
                                        FormField {
                                            label: format!(
                                                "{} ({}ms)",
                                                i18n.text("Auto-save delay", "自动保存延迟"),
                                                auto_save_ms()
                                            ),
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
                                    TagManagementSection {
                                        tags: settings_workspace.tags.clone(),
                                        has_workspace,
                                        commands: tag_commands,
                                    }
                                }
                            }
                        } else {
                            div { class: "mn-settings-panel",
                                div { class: "mn-about-card",
                                    div { class: "mn-about-hero",
                                        div { class: "mn-about-brand",
                                            div { class: "mn-about-app", "Papyro" }
                                            p { class: "mn-about-summary",
                                                {i18n.text(
                                                    "Built for people who want their notes to stay readable, portable, and pleasant to work in every day.",
                                                    "为那些希望笔记始终可读、可迁移、并且每天都用得顺手的人而设计。",
                                                )}
                                            }
                                        }
                                        div { class: "mn-about-version-badge", "v{APP_VERSION}" }
                                    }
                                    div { class: "mn-about-grid",
                                        AboutMetaItem {
                                            label: i18n.text("Editor", "编辑器").to_string(),
                                            value: i18n.text(
                                                "Markdown editing with source, hybrid, and preview workflows",
                                                "支持源码、混合与预览工作流的 Markdown 编辑体验",
                                            ).to_string(),
                                        }
                                        AboutMetaItem {
                                            label: i18n.text("Storage", "存储").to_string(),
                                            value: i18n.text(
                                                "Local-first files and workspace organization",
                                                "本地优先的文件存储与工作区组织方式",
                                            ).to_string(),
                                        }
                                        AboutMetaItem {
                                            label: i18n.text("Runtime", "运行时").to_string(),
                                            value: i18n.text(
                                                "Rust application shell with a Dioxus-based interface",
                                                "基于 Rust 应用壳与 Dioxus 界面层构建",
                                            ).to_string(),
                                        }
                                        AboutMetaItem {
                                            label: i18n.text("Focus", "定位").to_string(),
                                            value: i18n.text(
                                                "Calm note-taking, quick navigation, and durable Markdown output",
                                                "强调沉浸式记录、快速导航与稳定的 Markdown 产出",
                                            ).to_string(),
                                        }
                                    }
                                    div { class: "mn-about-note",
                                        {i18n.text(
                                            "Papyro keeps the content format open, so your notes stay usable outside the app as plain Markdown files.",
                                            "Papyro 保持内容格式开放，你的笔记始终可以作为普通 Markdown 文件在应用之外继续使用。",
                                        )}
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
}

#[component]
fn SettingsNavButton(label: String, active: bool, on_click: EventHandler<MouseEvent>) -> Element {
    let class_name = if active {
        "mn-settings-nav-button active"
    } else {
        "mn-settings-nav-button"
    };

    rsx! {
        button {
            r#type: "button",
            class: "{class_name}",
            "aria-pressed": if active { "true" } else { "false" },
            onclick: move |event| on_click.call(event),
            span { class: "mn-settings-nav-button-title", "{label}" }
        }
    }
}

#[component]
fn AboutMetaItem(label: String, value: String) -> Element {
    rsx! {
        div { class: "mn-about-item",
            div { class: "mn-about-label", "{label}" }
            div { class: "mn-about-value", "{value}" }
        }
    }
}

#[component]
fn SettingSection(label: String, class_name: String, children: Element) -> Element {
    let class = if class_name.trim().is_empty() {
        "mn-setting-section".to_string()
    } else {
        format!("mn-setting-section {class_name}")
    };

    rsx! {
        div { class: "{class}",
            h3 { class: "mn-setting-section-label", "{label}" }
            {children}
        }
    }
}

#[component]
fn TagManagementSection(
    tags: Vec<TagListItem>,
    has_workspace: bool,
    commands: AppCommands,
) -> Element {
    let i18n = use_i18n();
    let mut new_name = use_signal(String::new);
    let mut new_color = use_signal(|| DEFAULT_TAG_COLOR.to_string());
    let new_name_value = new_name();
    let new_color_value = new_color();
    let can_create = has_workspace && !cleaned_tag_name(&new_name_value).is_empty();

    rsx! {
        SettingSection {
            label: i18n.text("Tags", "标签").to_string(),
            class_name: "mn-setting-section-card mn-setting-section-wide".to_string(),
            if has_workspace {
                div { class: "mn-tag-manager",
                    div { class: "mn-tag-create-row",
                        input {
                            class: "mn-input mn-tag-name-input",
                            placeholder: i18n.text("New tag", "新标签"),
                            value: "{new_name_value}",
                            oninput: move |event| new_name.set(event.value()),
                            onkeydown: {
                                let commands = commands.clone();
                                move |event| {
                                    if event.key() == Key::Enter {
                                        let name = cleaned_tag_name(&new_name());
                                        if !name.is_empty() {
                                            commands.upsert_tag.call(UpsertTagRequest {
                                                name,
                                                color: normalized_tag_color(&new_color()),
                                            });
                                            new_name.set(String::new());
                                        }
                                    }
                                }
                            },
                        }
                        input {
                            class: "mn-tag-color-input",
                            r#type: "color",
                            title: i18n.text("Tag color", "标签颜色"),
                            "aria-label": i18n.text("New tag color", "新标签颜色"),
                            value: "{new_color_value}",
                            oninput: move |event| new_color.set(event.value()),
                        }
                        Button {
                            label: i18n.text("Add", "添加").to_string(),
                            variant: ButtonVariant::Primary,
                            disabled: !can_create,
                            on_click: {
                                let commands = commands.clone();
                                move |_| {
                                    let name = cleaned_tag_name(&new_name());
                                    if !name.is_empty() {
                                        commands.upsert_tag.call(UpsertTagRequest {
                                            name,
                                            color: normalized_tag_color(&new_color()),
                                        });
                                        new_name.set(String::new());
                                    }
                                }
                            },
                        }
                    }
                    if tags.is_empty() {
                        div { class: "mn-tag-empty", {i18n.text("No tags", "暂无标签")} }
                    } else {
                        div { class: "mn-tag-list",
                            for tag in tags {
                                TagEditorRow {
                                    key: "{tag.id}",
                                    tag,
                                    has_workspace,
                                    commands: commands.clone(),
                                }
                            }
                        }
                    }
                }
            } else {
                div { class: "mn-tag-empty",
                    {i18n.text("Open a workspace to manage tags", "打开工作区后即可管理标签")}
                }
            }
        }
    }
}

#[component]
fn TagEditorRow(tag: TagListItem, has_workspace: bool, commands: AppCommands) -> Element {
    let i18n = use_i18n();
    let mut name = use_signal(|| tag.name.clone());
    let mut color = use_signal(|| tag.color.clone());
    let mut confirm_delete = use_signal(|| false);
    let name_value = name();
    let color_value = color();
    let cleaned_name = cleaned_tag_name(&name_value);
    let color_hex = normalized_tag_color(&color_value);
    let can_rename = has_workspace && !cleaned_name.is_empty() && cleaned_name != tag.name;
    let can_recolor =
        has_workspace && !color_hex.eq_ignore_ascii_case(&tag.color) && is_tag_color(&color_hex);
    let delete_label = if confirm_delete() {
        i18n.text("Confirm", "确认")
    } else {
        i18n.text("Delete", "删除")
    };

    rsx! {
        div { class: "mn-tag-row",
            input {
                class: "mn-input mn-tag-name-input",
                value: "{name_value}",
                oninput: move |event| {
                    name.set(event.value());
                    confirm_delete.set(false);
                },
                onkeydown: {
                    let commands = commands.clone();
                    let tag_id = tag.id.clone();
                    let original_name = tag.name.clone();
                    move |event| {
                        if event.key() == Key::Enter {
                            let next_name = cleaned_tag_name(&name());
                            if !next_name.is_empty() && next_name != original_name {
                                commands.rename_tag.call(RenameTagRequest {
                                    id: tag_id.clone(),
                                    name: next_name,
                                });
                            }
                        }
                    }
                },
            }
            input {
                class: "mn-tag-color-input",
                r#type: "color",
                title: i18n.text("Tag color", "标签颜色"),
                "aria-label": format!("{} {}", i18n.text("Tag color for", "标签颜色"), tag.name),
                value: "{color_value}",
                oninput: move |event| {
                    color.set(event.value());
                    confirm_delete.set(false);
                },
            }
            Button {
                label: i18n.text("Rename", "重命名").to_string(),
                variant: ButtonVariant::Default,
                disabled: !can_rename,
                on_click: {
                    let commands = commands.clone();
                    let tag_id = tag.id.clone();
                    move |_| {
                        let next_name = cleaned_tag_name(&name());
                        if !next_name.is_empty() {
                            commands.rename_tag.call(RenameTagRequest {
                                id: tag_id.clone(),
                                name: next_name,
                            });
                        }
                    }
                },
            }
            Button {
                label: i18n.text("Color", "颜色").to_string(),
                variant: ButtonVariant::Default,
                disabled: !can_recolor,
                on_click: {
                    let commands = commands.clone();
                    let tag_id = tag.id.clone();
                    move |_| {
                        let next_color = normalized_tag_color(&color());
                        if is_tag_color(&next_color) {
                            commands.set_tag_color.call(SetTagColorRequest {
                                id: tag_id.clone(),
                                color: next_color,
                            });
                        }
                    }
                },
            }
            button {
                class: if confirm_delete() { "mn-button danger active" } else { "mn-button danger" },
                disabled: !has_workspace,
                onclick: {
                    let commands = commands.clone();
                    let tag_id = tag.id.clone();
                    move |_| {
                        if confirm_delete() {
                            commands.delete_tag.call(DeleteTagRequest { id: tag_id.clone() });
                            confirm_delete.set(false);
                        } else {
                            confirm_delete.set(true);
                        }
                    }
                },
                "{delete_label}"
            }
        }
    }
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
    format!("font-family: {font_family}; font-size: {font_size}px; line-height: {line_height:.1};")
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

fn cleaned_tag_name(value: &str) -> String {
    value.trim().trim_start_matches('#').trim().to_string()
}

fn normalized_tag_color(value: &str) -> String {
    value.trim().to_ascii_uppercase()
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

fn is_tag_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value.chars().skip(1).all(|ch| ch.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_form_helpers_normalize_inputs() {
        assert_eq!(cleaned_tag_name("  #Planning  "), "Planning");
        assert_eq!(normalized_tag_color(" #abcdef "), "#ABCDEF");
        assert!(is_tag_color("#ABCDEF"));
        assert!(!is_tag_color("ABCDEF"));
        assert!(!is_tag_color("#ABCDEG"));
    }

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
            "font-family: system-ui; font-size: 17px; line-height: 1.7;"
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
