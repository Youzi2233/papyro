use crate::commands::{
    AppCommands, DeleteTagRequest, RenameTagRequest, SetTagColorRequest, UpsertTagRequest,
};
use crate::components::primitives::{
    Button, ButtonVariant, SegmentedControl, SegmentedControlOption, Toggle,
};
use crate::context::use_app_context;
use crate::view_model::TagListItem;
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, Theme, WorkspaceSettingsOverrides};
use papyro_core::UiState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SettingsScope {
    Global,
    Workspace,
}

#[component]
pub fn SettingsModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let ui_state = app.ui_state;
    let commands = app.commands.clone();
    let view_model = app.view_model.read().clone();
    let has_workspace = view_model.workspace.name.is_some();
    let ui_snapshot = ui_state.read().clone();
    let initial_scope = if has_workspace
        && ui_snapshot.workspace_overrides != WorkspaceSettingsOverrides::default()
    {
        SettingsScope::Workspace
    } else {
        SettingsScope::Global
    };
    let settings = settings_for_scope(&ui_snapshot, initial_scope);

    let mut save_scope = use_signal(|| initial_scope);
    let mut font_family = use_signal(|| settings.font_family.clone());
    let mut font_size = use_signal(|| settings.font_size);
    let mut line_height = use_signal(|| settings.line_height);
    let mut auto_link_paste = use_signal(|| settings.auto_link_paste);
    let mut auto_save_ms = use_signal(|| settings.auto_save_delay_ms);
    let mut theme = use_signal(|| settings.theme.clone());
    let save_commands = commands.clone();
    let tag_commands = commands.clone();
    let scope_options = if has_workspace {
        vec![
            SegmentedControlOption::new("Global", "global"),
            SegmentedControlOption::new("Workspace", "workspace"),
        ]
    } else {
        vec![SegmentedControlOption::new("Global", "global")]
    };
    let theme_options = vec![
        SegmentedControlOption::new("System", "system"),
        SegmentedControlOption::new("Light", "light"),
        SegmentedControlOption::new("Dark", "dark"),
    ];

    let save = move |_| {
        let state = ui_state.read();
        let base = settings_for_scope(&state, save_scope());
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
                &state.global_settings,
                &new_settings,
            );
            save_commands.save_workspace_settings.call(overrides);
        } else {
            save_commands.save_settings.call(new_settings);
        }
        on_close.call(());
    };
    let save_label = if save_scope() == SettingsScope::Workspace {
        "Save Workspace"
    } else {
        "Save Global"
    };

    rsx! {
        div { class: "mn-modal-overlay", onclick: move |_| on_close.call(()),
            div { class: "mn-modal mn-settings-modal", onclick: move |e| e.stop_propagation(),
                div { class: "mn-modal-header",
                    h2 { class: "mn-modal-title", "Settings" }
                    button {
                        class: "mn-modal-close",
                        onclick: move |_| on_close.call(()),
                        "×"
                    }
                }
                div { class: "mn-modal-body",
                    SettingSection { label: "Scope",
                        SettingRow { label: "Save target",
                            SegmentedControl {
                                label: "Settings save target",
                                options: scope_options,
                                selected: settings_scope_value(save_scope()).to_string(),
                                class_name: String::new(),
                                on_change: move |value: String| {
                                    if let Some(next_scope) = settings_scope_from_value(&value) {
                                        if next_scope == SettingsScope::Workspace && !has_workspace {
                                            return;
                                        }

                                        let state = ui_state.read();
                                        let next_settings = settings_for_scope(&state, next_scope);
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
                    SettingSection { label: "Appearance",
                        SettingRow { label: "Theme",
                            SegmentedControl {
                                label: "Theme",
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
                    SettingSection { label: "Editor",
                        SettingRow { label: "Font family",
                            select {
                                class: "mn-input",
                                value: "{font_family}",
                                onchange: move |e| font_family.set(e.value().clone()),
                                option { value: "\"Cascadia Code\", \"JetBrains Mono\", monospace",
                                    "Cascadia Code"
                                }
                                option { value: "\"JetBrains Mono\", monospace", "JetBrains Mono" }
                                option { value: "\"Fira Code\", monospace", "Fira Code" }
                                option { value: "\"Courier New\", monospace", "Courier New" }
                            }
                        }
                        SettingRow { label: "Font size ({font_size}px)",
                            input {
                                class: "mn-range",
                                r#type: "range",
                                min: "12",
                                max: "24",
                                step: "1",
                                value: "{font_size}",
                                oninput: move |e| {
                                    if let Ok(v) = e.value().parse::<u8>() {
                                        font_size.set(v);
                                    }
                                },
                            }
                        }
                        SettingRow { label: "Line height ({line_height:.1})",
                            input {
                                class: "mn-range",
                                r#type: "range",
                                min: "1.2",
                                max: "2.4",
                                step: "0.1",
                                value: "{line_height}",
                                oninput: move |e| {
                                    if let Ok(v) = e.value().parse::<f32>() {
                                        line_height.set(v);
                                    }
                                },
                            }
                        }
                        SettingRow { label: "Paste URL as link",
                            Toggle {
                                label: "Paste URL as link",
                                checked: auto_link_paste(),
                                on_change: move |checked| auto_link_paste.set(checked),
                            }
                        }
                    }
                    SettingSection { label: "Saving",
                        SettingRow { label: "Auto-save delay ({auto_save_ms}ms)",
                            input {
                                class: "mn-range",
                                r#type: "range",
                                min: "200",
                                max: "3000",
                                step: "100",
                                value: "{auto_save_ms}",
                                oninput: move |e| {
                                    if let Ok(v) = e.value().parse::<u64>() {
                                        auto_save_ms.set(v);
                                    }
                                },
                            }
                        }
                    }
                    TagManagementSection {
                        tags: view_model.workspace.tags.clone(),
                        has_workspace,
                        commands: tag_commands,
                    }
                }
                div { class: "mn-modal-footer",
                    Button {
                        label: "Cancel",
                        variant: ButtonVariant::Default,
                        disabled: false,
                        on_click: move |_| on_close.call(()),
                    }
                    Button {
                        label: save_label,
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
fn SettingSection(label: &'static str, children: Element) -> Element {
    rsx! {
        div { class: "mn-setting-section",
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
    let mut new_name = use_signal(String::new);
    let mut new_color = use_signal(|| DEFAULT_TAG_COLOR.to_string());
    let new_name_value = new_name();
    let new_color_value = new_color();
    let can_create = has_workspace && !cleaned_tag_name(&new_name_value).is_empty();

    rsx! {
        SettingSection { label: "Tags",
            if has_workspace {
                div { class: "mn-tag-manager",
                    div { class: "mn-tag-create-row",
                        input {
                            class: "mn-input mn-tag-name-input",
                            placeholder: "New tag",
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
                            title: "Tag color",
                            "aria-label": "New tag color",
                            value: "{new_color_value}",
                            oninput: move |event| new_color.set(event.value()),
                        }
                        Button {
                            label: "Add",
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
                        div { class: "mn-tag-empty", "No tags" }
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
                div { class: "mn-tag-empty", "Open a workspace to manage tags" }
            }
        }
    }
}

#[component]
fn TagEditorRow(tag: TagListItem, has_workspace: bool, commands: AppCommands) -> Element {
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
        "Confirm"
    } else {
        "Delete"
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
                title: "Tag color",
                "aria-label": "Tag color for {tag.name}",
                value: "{color_value}",
                oninput: move |event| {
                    color.set(event.value());
                    confirm_delete.set(false);
                },
            }
            Button {
                label: "Rename",
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
                label: "Color",
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

fn settings_for_scope(ui_state: &UiState, scope: SettingsScope) -> AppSettings {
    match scope {
        SettingsScope::Global => ui_state.global_settings.clone(),
        SettingsScope::Workspace => ui_state.settings.clone(),
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
        font_family,
        font_size,
        line_height,
        auto_link_paste,
        auto_save_delay_ms,
        show_word_count: base.show_word_count,
        sidebar_width: base.sidebar_width,
        sidebar_collapsed: base.sidebar_collapsed,
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
    }
}
