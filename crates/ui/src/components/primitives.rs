use dioxus::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ButtonVariant {
    Default,
    Primary,
    Danger,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ButtonState {
    Enabled,
    Disabled,
    Loading,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusTone {
    Default,
    Saving,
    Attention,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InlineAlertTone {
    Neutral,
    Attention,
    Danger,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResultRowKind {
    Default,
    Search,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SegmentedControlOption {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DropdownOption {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TabOption {
    pub label: String,
    pub value: String,
}

impl SegmentedControlOption {
    pub fn new(label: &str, value: &str) -> Self {
        Self {
            label: label.to_string(),
            value: value.to_string(),
        }
    }
}

impl DropdownOption {
    pub fn new(label: &str, value: &str) -> Self {
        Self {
            label: label.to_string(),
            value: value.to_string(),
        }
    }
}

impl TabOption {
    pub fn new(label: &str, value: &str) -> Self {
        Self {
            label: label.to_string(),
            value: value.to_string(),
        }
    }
}

impl ButtonVariant {
    fn class(self) -> &'static str {
        match self {
            Self::Default => "mn-button",
            Self::Primary => "mn-button primary",
            Self::Danger => "mn-button danger",
        }
    }
}

impl ButtonState {
    fn is_disabled(self) -> bool {
        matches!(self, Self::Disabled | Self::Loading)
    }
}

fn segmented_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-segmented-option active"
    } else {
        "mn-segmented-option"
    }
}

fn tab_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-tabs-option active"
    } else {
        "mn-tabs-option"
    }
}

fn dropdown_class(is_open: bool) -> &'static str {
    if is_open {
        "mn-select open"
    } else {
        "mn-select"
    }
}

fn dropdown_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-select-option active"
    } else {
        "mn-select-option"
    }
}

fn dropdown_selected_label(options: &[DropdownOption], selected: &str) -> String {
    options
        .iter()
        .find(|option| option.value == selected)
        .map(|option| option.label.clone())
        .unwrap_or_else(|| selected.to_string())
}

fn dropdown_id_suffix(value: &str) -> String {
    let suffix = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if suffix.is_empty() {
        "value".to_string()
    } else {
        suffix
    }
}

fn dropdown_list_id(label: &str, selected: &str) -> String {
    format!(
        "mn-select-{}-{}",
        dropdown_id_suffix(label),
        dropdown_id_suffix(selected)
    )
}

fn menu_item_class(danger: bool) -> &'static str {
    if danger {
        "mn-menu-item danger"
    } else {
        "mn-menu-item"
    }
}

fn status_tone_class(tone: StatusTone) -> &'static str {
    match tone {
        StatusTone::Default => "mn-status-item",
        StatusTone::Saving => "mn-status-saving",
        StatusTone::Attention => "mn-status-unsaved",
    }
}

fn form_field_class(class_name: &str) -> String {
    let trimmed = class_name.trim();
    if trimmed.is_empty() {
        "mn-form-field mn-setting-row".to_string()
    } else {
        format!("mn-form-field mn-setting-row {trimmed}")
    }
}

fn result_row_class(kind: ResultRowKind, is_active: bool) -> &'static str {
    match (kind, is_active) {
        (ResultRowKind::Default, false) => "mn-command-row",
        (ResultRowKind::Default, true) => "mn-command-row active",
        (ResultRowKind::Search, false) => "mn-command-row mn-search-row",
        (ResultRowKind::Search, true) => "mn-command-row mn-search-row active",
    }
}

fn inline_alert_class(tone: InlineAlertTone, class_name: &str) -> String {
    let tone_class = match tone {
        InlineAlertTone::Neutral => "mn-inline-alert neutral",
        InlineAlertTone::Attention => "mn-inline-alert attention",
        InlineAlertTone::Danger => "mn-inline-alert danger",
    };
    let trimmed = class_name.trim();
    if trimmed.is_empty() {
        tone_class.to_string()
    } else {
        format!("{tone_class} {trimmed}")
    }
}

fn action_button_class(variant: ButtonVariant, class_name: &str) -> String {
    let base = variant.class();
    let trimmed = class_name.trim();
    if trimmed.is_empty() {
        base.to_string()
    } else {
        format!("{base} {trimmed}")
    }
}

#[component]
pub fn Button(
    label: String,
    variant: ButtonVariant,
    disabled: bool,
    on_click: EventHandler<()>,
) -> Element {
    let class = variant.class();

    rsx! {
        button {
            class,
            disabled,
            onclick: move |_| on_click.call(()),
            "{label}"
        }
    }
}

#[component]
pub fn ActionButton(
    label: String,
    variant: ButtonVariant,
    state: ButtonState,
    icon_class: Option<String>,
    class_name: String,
    on_click: EventHandler<()>,
) -> Element {
    let class = action_button_class(variant, &class_name);
    let is_loading = state == ButtonState::Loading;

    rsx! {
        button {
            class,
            disabled: state.is_disabled(),
            "aria-busy": if is_loading { "true" } else { "false" },
            onclick: move |_| on_click.call(()),
            if let Some(icon_class) = icon_class {
                span { class: "{icon_class}", "aria-hidden": "true" }
            }
            span { "{label}" }
        }
    }
}

#[component]
pub fn StatusMessage(message: String) -> Element {
    rsx! {
        span { class: "mn-status-message", "{message}" }
    }
}

#[component]
pub fn Message(message: String, tone: StatusTone) -> Element {
    rsx! {
        div {
            class: status_tone_class(tone),
            role: "status",
            "{message}"
        }
    }
}

#[component]
pub fn InlineAlert(message: String, tone: InlineAlertTone, class_name: String) -> Element {
    let class = inline_alert_class(tone, &class_name);

    rsx! {
        div {
            class,
            role: "status",
            "{message}"
        }
    }
}

#[component]
pub fn StatusIndicator(label: String, tone: StatusTone) -> Element {
    rsx! {
        span { class: status_tone_class(tone), "{label}" }
    }
}

#[component]
pub fn FormField(label: String, class_name: String, children: Element) -> Element {
    let class = form_field_class(&class_name);

    rsx! {
        div { class,
            label { class: "mn-form-label mn-setting-label", "{label}" }
            div { class: "mn-form-control mn-setting-control", {children} }
        }
    }
}

#[component]
pub fn SegmentedControl(
    label: String,
    options: Vec<SegmentedControlOption>,
    selected: String,
    class_name: String,
    on_change: EventHandler<String>,
) -> Element {
    let class = if class_name.trim().is_empty() {
        "mn-segmented-control".to_string()
    } else {
        class_name
    };

    rsx! {
        div {
            class: "{class}",
            role: "radiogroup",
            "aria-label": "{label}",
            for option in options {
                button {
                    class: segmented_option_class(option.value == selected),
                    r#type: "button",
                    role: "radio",
                    "aria-checked": if option.value == selected { "true" } else { "false" },
                    onclick: {
                        let value = option.value.clone();
                        move |_| on_change.call(value.clone())
                    },
                    "{option.label}"
                }
            }
        }
    }
}

#[component]
pub fn Dropdown(
    label: String,
    options: Vec<DropdownOption>,
    selected: String,
    on_change: EventHandler<String>,
) -> Element {
    let mut is_open = use_signal(|| false);
    let selected_label = dropdown_selected_label(&options, &selected);
    let list_id = dropdown_list_id(&label, &selected);

    rsx! {
        div {
            class: dropdown_class(is_open()),
            button {
                class: "mn-select-trigger",
                r#type: "button",
                "aria-label": "{label}",
                "aria-haspopup": "listbox",
                "aria-expanded": if is_open() { "true" } else { "false" },
                "aria-controls": "{list_id}",
                onclick: move |_| is_open.set(!is_open()),
                span { class: "mn-select-value", "{selected_label}" }
                span { class: "mn-select-caret", "aria-hidden": "true" }
            }
            if is_open() {
                div {
                    id: "{list_id}",
                    class: "mn-select-list",
                    role: "listbox",
                    "aria-label": "{label}",
                    for option in options {
                        button {
                            class: dropdown_option_class(option.value == selected),
                            r#type: "button",
                            role: "option",
                            "aria-selected": if option.value == selected { "true" } else { "false" },
                            onclick: {
                                let value = option.value.clone();
                                move |_| {
                                    on_change.call(value.clone());
                                    is_open.set(false);
                                }
                            },
                            "{option.label}"
                        }
                    }
                }
            }
        }
    }
}

#[component]
pub fn Select(
    label: String,
    options: Vec<DropdownOption>,
    selected: String,
    on_change: EventHandler<String>,
) -> Element {
    rsx! {
        Dropdown {
            label,
            options,
            selected,
            on_change,
        }
    }
}

#[component]
pub fn Menu(label: String, class_name: String, style: String, children: Element) -> Element {
    rsx! {
        div {
            class: "{class_name}",
            role: "menu",
            "aria-label": "{label}",
            style,
            onclick: move |event| event.stop_propagation(),
            oncontextmenu: move |event| {
                event.prevent_default();
                event.stop_propagation();
            },
            {children}
        }
    }
}

#[component]
pub fn ContextMenu(label: String, class_name: String, style: String, children: Element) -> Element {
    rsx! {
        Menu {
            label,
            class_name,
            style,
            {children}
        }
    }
}

#[component]
pub fn MenuItem(label: String, danger: bool, on_select: EventHandler<()>) -> Element {
    rsx! {
        button {
            class: menu_item_class(danger),
            r#type: "button",
            role: "menuitem",
            onclick: move |_| on_select.call(()),
            "{label}"
        }
    }
}

#[component]
pub fn MenuSeparator() -> Element {
    rsx! {
        div { class: "mn-menu-separator" }
    }
}

#[component]
pub fn IconButton(label: String, icon: String, on_click: EventHandler<()>) -> Element {
    rsx! {
        Tooltip { label: label.clone(),
            button {
                class: "mn-icon-btn",
                "aria-label": "{label}",
                onclick: move |_| on_click.call(()),
                "{icon}"
            }
        }
    }
}

#[component]
pub fn Tabs(
    label: String,
    options: Vec<TabOption>,
    selected: String,
    class_name: String,
    on_change: EventHandler<String>,
) -> Element {
    let class = if class_name.trim().is_empty() {
        "mn-tabs".to_string()
    } else {
        class_name
    };

    rsx! {
        div {
            class: "{class}",
            role: "tablist",
            "aria-label": "{label}",
            for option in options {
                button {
                    class: tab_option_class(option.value == selected),
                    r#type: "button",
                    role: "tab",
                    "aria-selected": if option.value == selected { "true" } else { "false" },
                    onclick: {
                        let value = option.value.clone();
                        move |_| on_change.call(value.clone())
                    },
                    "{option.label}"
                }
            }
        }
    }
}

#[component]
pub fn Toggle(label: String, checked: bool, on_change: EventHandler<bool>) -> Element {
    rsx! {
        label {
            class: "mn-setting-switch",
            title: "{label}",
            input {
                r#type: "checkbox",
                checked,
                "aria-label": "{label}",
                onchange: move |event| on_change.call(event.checked()),
            }
            span { class: "mn-setting-switch-track",
                span { class: "mn-setting-switch-thumb" }
            }
        }
    }
}

#[component]
pub fn Slider(
    label: String,
    value: String,
    min: String,
    max: String,
    step: String,
    on_input: EventHandler<String>,
) -> Element {
    rsx! {
        input {
            class: "mn-range",
            r#type: "range",
            "aria-label": "{label}",
            min: "{min}",
            max: "{max}",
            step: "{step}",
            value: "{value}",
            oninput: move |event| on_input.call(event.value()),
        }
    }
}

#[component]
pub fn Modal(
    label: String,
    class_name: String,
    on_close: EventHandler<()>,
    children: Element,
) -> Element {
    rsx! {
        div {
            class: "mn-modal-overlay",
            onclick: move |_| on_close.call(()),
            div {
                class: "{class_name}",
                role: "dialog",
                "aria-modal": "true",
                "aria-label": "{label}",
                onclick: move |event| event.stop_propagation(),
                {children}
            }
        }
    }
}

#[component]
pub fn TextInput(
    class_name: String,
    placeholder: String,
    value: String,
    autofocus: bool,
    on_input: EventHandler<String>,
    on_keydown: EventHandler<KeyboardEvent>,
) -> Element {
    rsx! {
        input {
            class: "{class_name}",
            r#type: "text",
            "aria-label": "{placeholder}",
            autofocus,
            placeholder: "{placeholder}",
            value: "{value}",
            oninput: move |event| on_input.call(event.value()),
            onkeydown: move |event| on_keydown.call(event),
        }
    }
}

#[component]
pub fn ResultRow(
    label: String,
    metadata: String,
    is_active: bool,
    kind: ResultRowKind,
    on_select: EventHandler<()>,
    children: Element,
) -> Element {
    rsx! {
        button {
            class: result_row_class(kind, is_active),
            "aria-label": "{label}",
            onclick: move |_| on_select.call(()),
            span { class: "mn-command-row-main", {children} }
            span { class: "mn-command-kind", "{metadata}" }
        }
    }
}

#[component]
pub fn EmptyState(title: String, description: String) -> Element {
    rsx! {
        section { class: "mn-empty",
            div { class: "mn-empty-card",
                h1 { "{title}" }
                p { "{description}" }
            }
        }
    }
}

#[component]
pub fn Tooltip(label: String, children: Element) -> Element {
    rsx! {
        span {
            class: "mn-tooltip",
            "data-tooltip": "{label}",
            {children}
        }
    }
}

#[cfg(test)]
mod tests {
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
}
