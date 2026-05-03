use super::buttons::{action_button_class, icon_button_class};
use super::empty::empty_state_card_class;
use super::feedback::{inline_alert_class, status_tone_class};
use super::forms::{
    dropdown_class, dropdown_id_suffix, dropdown_list_id, dropdown_option_class,
    dropdown_selected_label, form_field_class, segmented_option_class,
};
use super::layout::{
    app_shell_class, editor_tool_button_class, scroll_container_class, toolbar_zone_class,
    workbench_class,
};
use super::navigation::{tree_caret_class, tree_icon_class, tree_item_class};
use super::overlays::menu_item_class;
use super::results::result_row_class;
use super::settings::{settings_inline_row_class, settings_nav_button_class};
use super::*;

#[test]
fn button_variant_maps_to_existing_classes() {
    assert_eq!(ButtonVariant::Default.class(), "mn-button");
    assert_eq!(ButtonVariant::Primary.class(), "mn-button primary");
    assert_eq!(ButtonVariant::Danger.class(), "mn-button danger");
}

#[test]
fn button_state_disables_blocking_states() {
    assert!(!ButtonState::Enabled.is_disabled());
    assert!(ButtonState::Disabled.is_disabled());
    assert!(ButtonState::Loading.is_disabled());
}

#[test]
fn action_button_class_extends_variant_class() {
    assert_eq!(
        action_button_class(ButtonVariant::Primary, "wide"),
        "mn-button primary wide"
    );
    assert_eq!(action_button_class(ButtonVariant::Default, ""), "mn-button");
}

#[test]
fn icon_button_class_reflects_state_and_extension() {
    assert_eq!(icon_button_class(false, false, ""), "mn-icon-btn");
    assert_eq!(
        icon_button_class(true, true, "compact"),
        "mn-icon-btn active danger compact"
    );
}

#[test]
fn layout_helpers_extend_base_classes() {
    assert_eq!(app_shell_class(""), "mn-shell");
    assert_eq!(
        app_shell_class("mn-shell-mobile"),
        "mn-shell mn-shell-mobile"
    );
    assert_eq!(workbench_class(""), "mn-workbench");
    assert_eq!(
        workbench_class("mn-workbench-mobile"),
        "mn-workbench mn-workbench-mobile"
    );
    assert_eq!(
        toolbar_zone_class(ToolbarZoneKind::Flexible, "extra"),
        "mn-editor-tabs-row extra"
    );
    assert_eq!(
        toolbar_zone_class(ToolbarZoneKind::Fixed, ""),
        "mn-editor-tools"
    );
    assert_eq!(
        editor_tool_button_class(false, ""),
        "mn-editor-tool icon-only"
    );
    assert_eq!(
        editor_tool_button_class(true, "mn-editor-outline-toggle"),
        "mn-editor-tool icon-only active mn-editor-outline-toggle"
    );
    assert_eq!(scroll_container_class(""), "mn-scroll-container");
    assert_eq!(
        scroll_container_class("mn-settings-content"),
        "mn-scroll-container mn-settings-content"
    );
    assert_eq!(empty_state_card_class(false, ""), "mn-empty-card");
    assert_eq!(
        empty_state_card_class(true, "wide"),
        "mn-empty-card onboarding wide"
    );
    assert_eq!(
        settings_nav_button_class(true, "compact"),
        "mn-settings-nav-button active compact"
    );
    assert_eq!(
        settings_nav_button_class(false, ""),
        "mn-settings-nav-button"
    );
    assert_eq!(
        settings_inline_row_class(SettingsInlineRowKind::Create, "compact"),
        "mn-setting-inline-row create compact"
    );
    assert_eq!(
        settings_inline_row_class(SettingsInlineRowKind::Edit, ""),
        "mn-setting-inline-row edit"
    );
}

#[test]
fn tree_item_helpers_reflect_visual_state() {
    assert_eq!(
        tree_item_class(TreeItemKind::Directory, true, false, true, true),
        "mn-tree-row directory active dragging drop-target"
    );
    assert_eq!(
        tree_item_class(TreeItemKind::Note, false, true, false, false),
        "mn-tree-row note editing"
    );
    assert_eq!(tree_caret_class(false), "mn-tree-caret");
    assert_eq!(tree_caret_class(true), "mn-tree-caret expanded");
    assert_eq!(
        tree_icon_class(TreeItemIconKind::FolderOpen),
        "mn-tree-icon folder-open"
    );
    assert_eq!(
        tree_icon_class(TreeItemIconKind::Markdown),
        "mn-tree-icon markdown"
    );
}

#[test]
fn result_row_class_preserves_existing_row_classes() {
    assert_eq!(
        result_row_class(ResultRowKind::Default, false),
        "mn-command-row"
    );
    assert_eq!(
        result_row_class(ResultRowKind::Default, true),
        "mn-command-row active"
    );
    assert_eq!(
        result_row_class(ResultRowKind::Search, false),
        "mn-command-row mn-search-row"
    );
    assert_eq!(
        result_row_class(ResultRowKind::Search, true),
        "mn-command-row mn-search-row active"
    );
}

#[test]
fn inline_alert_class_includes_tone_and_extension_class() {
    assert_eq!(
        inline_alert_class(InlineAlertTone::Neutral, ""),
        "mn-inline-alert neutral"
    );
    assert_eq!(
        inline_alert_class(InlineAlertTone::Danger, "compact"),
        "mn-inline-alert danger compact"
    );
}

#[test]
fn segmented_option_class_marks_active_option() {
    assert_eq!(segmented_option_class(false), "mn-segmented-option");
    assert_eq!(segmented_option_class(true), "mn-segmented-option active");
}

#[test]
fn tab_option_class_marks_active_option() {
    assert_eq!(tab_option_class(false), "mn-tabs-option");
    assert_eq!(tab_option_class(true), "mn-tabs-option active");
}

#[test]
fn dropdown_helpers_track_open_and_selected_state() {
    assert_eq!(dropdown_class(false), "mn-select");
    assert_eq!(dropdown_class(true), "mn-select open");
    assert_eq!(dropdown_option_class(false), "mn-select-option");
    assert_eq!(dropdown_option_class(true), "mn-select-option active");
}

#[test]
fn dropdown_selected_label_uses_matching_option_label() {
    let options = vec![
        DropdownOption::new("English", "english"),
        DropdownOption::new("Chinese", "chinese"),
    ];

    assert_eq!(
        dropdown_selected_label(&options, "chinese"),
        "Chinese".to_string()
    );
    assert_eq!(
        dropdown_selected_label(&options, "missing"),
        "missing".to_string()
    );
}

#[test]
fn dropdown_id_suffix_normalizes_arbitrary_values() {
    assert_eq!(
        dropdown_id_suffix("\"Cascadia Code\", monospace"),
        "cascadia-code---monospace"
    );
    assert_eq!(dropdown_id_suffix(""), "value");
}

#[test]
fn dropdown_list_id_combines_label_and_value() {
    assert_eq!(
        dropdown_list_id("Font family", "\"Cascadia Code\", monospace"),
        "mn-select-font-family-cascadia-code---monospace"
    );
}

#[test]
fn menu_item_class_marks_danger_option() {
    assert_eq!(menu_item_class(false), "mn-menu-item");
    assert_eq!(menu_item_class(true), "mn-menu-item danger");
}

#[test]
fn status_tone_class_maps_status_styles() {
    assert_eq!(status_tone_class(StatusTone::Default), "mn-status-item");
    assert_eq!(status_tone_class(StatusTone::Saving), "mn-status-saving");
    assert_eq!(
        status_tone_class(StatusTone::Attention),
        "mn-status-unsaved"
    );
}

#[test]
fn form_field_class_adds_optional_extension_class() {
    assert_eq!(form_field_class(""), "mn-form-field mn-setting-row");
    assert_eq!(
        form_field_class("wide"),
        "mn-form-field mn-setting-row wide"
    );
}
