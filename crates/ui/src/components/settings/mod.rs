use crate::commands::{
    AppCommands, DeleteTagRequest, RenameTagRequest, SetTagColorRequest, UpsertTagRequest,
};
use crate::components::primitives::{
    Button, ButtonVariant, Dropdown, DropdownOption, SegmentedControl, SegmentedControlOption,
    Slider, Toggle,
};
use crate::context::use_app_context;
use crate::i18n::use_i18n;
use crate::view_model::{SettingsFormViewModel, TagListItem};
use dioxus::prelude::*;
use papyro_core::models::{AppLanguage, AppSettings, Theme, WorkspaceSettingsOverrides};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SettingsScope {
    Global,
    Workspace,
}

#[component]
pub fn SettingsModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands.clone();
    let settings_form_model = app.settings_form_model;
    let settings_form = settings_form_model.read().clone();
    let settings_workspace = app.settings_workspace_model.read().clone();
    let has_workspace = settings_form.has_workspace;
    let initial_scope = if has_workspace
        && settings_form.workspace_overrides != WorkspaceSettingsOverrides::default()
    {
        SettingsScope::Workspace
    } else {
        SettingsScope::Global
    };
    let settings = settings_for_scope(&settings_form, initial_scope);

    let mut save_scope = use_signal(|| initial_scope);
    let mut font_family = use_signal(|| settings.font_family.clone());
    let mut font_size = use_signal(|| settings.font_size);
    let mut line_height = use_signal(|| settings.line_height);
    let mut auto_link_paste = use_signal(|| settings.auto_link_paste);
    let mut auto_save_ms = use_signal(|| settings.auto_save_delay_ms);
    let mut theme = use_signal(|| settings.theme.clone());
    let save_commands = commands.clone();
    let save_settings_form_model = settings_form_model;
    let scope_settings_form_model = settings_form_model;
    let language_settings_form_model = settings_form_model;
    let tag_commands = commands.clone();

    let scope_options = if has_workspace {
        vec![
            SegmentedControlOption::new(i18n.text("Global", "全局"), "global"),
            SegmentedControlOption::new(i18n.text("Workspace", "工作区"), "workspace"),
        ]
    } else {
        vec![SegmentedControlOption::new(
            i18n.text("Global", "全局"),
            "global",
        )]
    };
    let theme_options = vec![
        SegmentedControlOption::new(i18n.text("System", "跟随系统"), "system"),
        SegmentedControlOption::new(i18n.text("Light", "浅色"), "light"),
        SegmentedControlOption::new(i18n.text("Dark", "深色"), "dark"),
    ];
    let language_options = vec![
        SegmentedControlOption::new("English", "english"),
        SegmentedControlOption::new("中文", "chinese"),
    ];
    let font_options = vec![
        DropdownOption::new(
            "Cascadia Code",
            "\"Cascadia Code\", \"JetBrains Mono\", monospace",
        ),
        DropdownOption::new("JetBrains Mono", "\"JetBrains Mono\", monospace"),
        DropdownOption::new("Fira Code", "\"Fira Code\", monospace"),
        DropdownOption::new("Courier New", "\"Courier New\", monospace"),
    ];

    let save = move |_| {
        let settings_form = save_settings_form_model.read();
        let base = settings_for_scope(&settings_form, save_scope());
        let new_settings = form_settings(
            &base,
            theme.read().clone(),
            font_family.read().clone(),
            *font_size.read(),
            *line_height.read(),
            *auto_link_paste.read(),
            *auto_save_ms.read(),
        );

        if save_scope() == SettingsScope::Workspace {
            let overrides = WorkspaceSettingsOverrides::from_settings_delta(
                &settings_form.global_settings,
                &new_settings,
            );
            save_commands.save_workspace_settings.call(overrides);
        } else {
            save_commands.save_settings.call(new_settings);
        }
        on_close.call(());
    };

    let save_label = if save_scope() == SettingsScope::Workspace {
        i18n.text("Save Workspace", "保存工作区设置")
    } else {
        i18n.text("Save Global", "保存全局设置")
    };

    rsx! {
        div { class: "mn-modal-overlay", onclick: move |_| on_close.call(()),
            div { class: "mn-modal mn-settings-modal", onclick: move |e| e.stop_propagation(),
                div { class: "mn-modal-header",
                    h2 { class: "mn-modal-title", {i18n.text("Settings", "设置")} }
                    button {
                        class: "mn-modal-close",
                        "aria-label": i18n.text("Close settings", "关闭设置"),
                        onclick: move |_| on_close.call(()),
                        "×"
                    }
                }
                div { class: "mn-modal-body mn-settings-body",
                    div { class: "mn-settings-layout",
                        nav {
                            class: "mn-settings-nav",
                            "aria-label": i18n.text("Settings sections", "设置分区"),
                            a { class: "mn-settings-nav-item", href: "#mn-settings-scope", {i18n.text("Scope", "范围")} }
                            a { class: "mn-settings-nav-item", href: "#mn-settings-appearance", {i18n.text("Appearance", "外观")} }
                            a { class: "mn-settings-nav-item", href: "#mn-settings-editor", {i18n.text("Editor", "编辑器")} }
                            a { class: "mn-settings-nav-item", href: "#mn-settings-saving", {i18n.text("Saving", "保存")} }
                            a { class: "mn-settings-nav-item", href: "#mn-settings-tags", {i18n.text("Tags", "标签")} }
                        }
                        div { class: "mn-settings-content",
                            SettingSection {
                                section_id: "mn-settings-scope",
                                label: i18n.text("Scope", "范围").to_string(),
                                SettingRow {
                                    label: i18n.text("Save target", "保存目标").to_string(),
                                    SegmentedControl {
                                        label: i18n.text("Settings save target", "设置保存目标").to_string(),
                                        options: scope_options,
                                        selected: settings_scope_value(save_scope()).to_string(),
                                        class_name: String::new(),
                                        on_change: move |value: String| {
                                            if let Some(next_scope) = settings_scope_from_value(&value) {
                                                if next_scope == SettingsScope::Workspace && !has_workspace {
                                                    return;
                                                }

                                                let settings_form = scope_settings_form_model.read();
                                                let next_settings = settings_for_scope(&settings_form, next_scope);
                                                set_form_values(
                                                    &next_settings,
                                                    font_family,
                                                    font_size,
                                                    line_height,
                                                    auto_link_paste,
                                                    auto_save_ms,
                                                    theme,
                                                );
                                                save_scope.set(next_scope);
                                            }
                                        },
                                    }
                                }
                            }
                            SettingSection {
                                section_id: "mn-settings-appearance",
                                label: i18n.text("Appearance", "外观").to_string(),
                                SettingRow {
                                    label: i18n.text("Language", "语言").to_string(),
                                    SegmentedControl {
                                        label: i18n.text("App language", "应用语言").to_string(),
                                        options: language_options,
                                        selected: language_value((app.language)()).to_string(),
                                        class_name: String::new(),
                                        on_change: move |value: String| {
                                            if let Some(next_language) = language_from_value(&value) {
                                                let mut settings = language_settings_form_model.read().global_settings.clone();
                                                if settings.language != next_language {
                                                    settings.language = next_language;
                                                    save_commands.save_settings.call(settings);
                                                }
                                            }
                                        },
                                    }
                                }
                                SettingRow {
                                    label: i18n.text("Theme", "主题").to_string(),
                                    SegmentedControl {
                                        label: i18n.text("Theme", "主题").to_string(),
                                        options: theme_options,
                                        selected: theme_value(&theme()).to_string(),
                                        class_name: String::new(),
                                        on_change: move |value: String| {
                                            if let Some(next_theme) = theme_from_value(&value) {
                                                theme.set(next_theme);
                                            }
                                        },
                                    }
                                }
                            }
                            SettingSection {
                                section_id: "mn-settings-editor",
                                label: i18n.text("Editor", "编辑器").to_string(),
                                SettingRow {
                                    label: i18n.text("Font family", "字体").to_string(),
                                    Dropdown {
                                        label: i18n.text("Font family", "字体").to_string(),
                                        options: font_options,
                                        selected: font_family(),
                                        on_change: move |value: String| font_family.set(value),
                                    }
                                }
                                SettingRow {
                                    label: format!("{} ({font_size}px)", i18n.text("Font size", "字号")),
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
                                SettingRow {
                                    label: format!("{} ({line_height:.1})", i18n.text("Line height", "行高")),
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
                                SettingRow {
                                    label: i18n.text("Paste URL as link", "粘贴 URL 时转为链接").to_string(),
                                    Toggle {
                                        label: i18n.text("Paste URL as link", "粘贴 URL 时转为链接").to_string(),
                                        checked: auto_link_paste(),
                                        on_change: move |checked| auto_link_paste.set(checked),
                                    }
                                }
                            }
                            SettingSection {
                                section_id: "mn-settings-saving",
                                label: i18n.text("Saving", "保存").to_string(),
                                SettingRow {
                                    label: format!(
                                        "{} ({auto_save_ms}ms)",
                                        i18n.text("Auto-save delay", "自动保存延迟")
                                    ),
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
                }
                div { class: "mn-modal-footer",
                    Button {
                        label: i18n.text("Cancel", "取消").to_string(),
                        variant: ButtonVariant::Default,
                        disabled: false,
                        on_click: move |_| on_close.call(()),
                    }
                    Button {
                        label: save_label.to_string(),
                        variant: ButtonVariant::Primary,
                        disabled: false,
                        on_click: save,
                    }
                }
            }
        }
    }
}

#[component]
fn SettingSection(section_id: &'static str, label: String, children: Element) -> Element {
    rsx! {
        div { id: "{section_id}", class: "mn-setting-section",
            h3 { class: "mn-setting-section-label", "{label}" }
            {children}
        }
    }
}

#[component]
fn SettingRow(label: String, children: Element) -> Element {
    rsx! {
        div { class: "mn-setting-row",
            label { class: "mn-setting-label", "{label}" }
            div { class: "mn-setting-control", {children} }
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
            section_id: "mn-settings-tags",
            label: i18n.text("Tags", "标签").to_string(),
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
                div { class: "mn-tag-empty", {i18n.text("Open a workspace to manage tags", "打开工作区后即可管理标签")} }
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

const DEFAULT_TAG_COLOR: &str = "#6B7280";

fn settings_for_scope(model: &SettingsFormViewModel, scope: SettingsScope) -> AppSettings {
    match scope {
        SettingsScope::Global => model.global_settings.clone(),
        SettingsScope::Workspace => model.workspace_settings.clone(),
    }
}

fn settings_scope_value(scope: SettingsScope) -> &'static str {
    match scope {
        SettingsScope::Global => "global",
        SettingsScope::Workspace => "workspace",
    }
}

fn settings_scope_from_value(value: &str) -> Option<SettingsScope> {
    match value {
        "global" => Some(SettingsScope::Global),
        "workspace" => Some(SettingsScope::Workspace),
        _ => None,
    }
}

fn theme_value(theme: &Theme) -> &'static str {
    match theme {
        Theme::System => "system",
        Theme::Light => "light",
        Theme::Dark => "dark",
    }
}

fn theme_from_value(value: &str) -> Option<Theme> {
    match value {
        "system" => Some(Theme::System),
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    }
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

fn form_settings(
    base: &AppSettings,
    theme: Theme,
    font_family: String,
    font_size: u8,
    line_height: f32,
    auto_link_paste: bool,
    auto_save_delay_ms: u64,
) -> AppSettings {
    AppSettings {
        theme,
        language: base.language,
        font_family,
        font_size,
        line_height,
        auto_link_paste,
        auto_save_delay_ms,
        show_word_count: base.show_word_count,
        sidebar_width: base.sidebar_width,
        sidebar_collapsed: base.sidebar_collapsed,
        note_open_mode: base.note_open_mode.clone(),
        view_mode: base.view_mode.clone(),
    }
}

fn set_form_values(
    settings: &AppSettings,
    mut font_family: Signal<String>,
    mut font_size: Signal<u8>,
    mut line_height: Signal<f32>,
    mut auto_link_paste: Signal<bool>,
    mut auto_save_ms: Signal<u64>,
    mut theme: Signal<Theme>,
) {
    font_family.set(settings.font_family.clone());
    font_size.set(settings.font_size);
    line_height.set(settings.line_height);
    auto_link_paste.set(settings.auto_link_paste);
    auto_save_ms.set(settings.auto_save_delay_ms);
    theme.set(settings.theme.clone());
}

fn cleaned_tag_name(value: &str) -> String {
    value.trim().trim_start_matches('#').trim().to_string()
}

fn normalized_tag_color(value: &str) -> String {
    value.trim().to_ascii_uppercase()
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
        assert_eq!(settings_scope_value(SettingsScope::Global), "global");
        assert_eq!(
            settings_scope_from_value("workspace"),
            Some(SettingsScope::Workspace)
        );
        assert_eq!(settings_scope_from_value("missing"), None);
        assert_eq!(theme_value(&Theme::Dark), "dark");
        assert_eq!(theme_from_value("system"), Some(Theme::System));
        assert_eq!(theme_from_value("missing"), None);
        assert_eq!(language_value(AppLanguage::Chinese), "chinese");
        assert_eq!(language_from_value("english"), Some(AppLanguage::English));
        assert_eq!(language_from_value("missing"), None);
    }
}
