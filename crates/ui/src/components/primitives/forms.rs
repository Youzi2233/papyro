use dioxus::prelude::*;

use super::append_class;

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

pub(super) fn segmented_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-segmented-option active"
    } else {
        "mn-segmented-option"
    }
}

pub(super) fn dropdown_class(is_open: bool) -> &'static str {
    if is_open {
        "mn-select open"
    } else {
        "mn-select"
    }
}

pub(super) fn dropdown_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-select-option active"
    } else {
        "mn-select-option"
    }
}

pub(super) fn dropdown_selected_label(options: &[DropdownOption], selected: &str) -> String {
    options
        .iter()
        .find(|option| option.value == selected)
        .map(|option| option.label.clone())
        .unwrap_or_else(|| selected.to_string())
}

pub(super) fn dropdown_id_suffix(value: &str) -> String {
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

pub(super) fn dropdown_list_id(label: &str, selected: &str) -> String {
    format!(
        "mn-select-{}-{}",
        dropdown_id_suffix(label),
        dropdown_id_suffix(selected)
    )
}

pub(super) fn form_field_class(class_name: &str) -> String {
    append_class("mn-form-field mn-setting-row", class_name)
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
pub fn Switch(label: String, checked: bool, on_change: EventHandler<bool>) -> Element {
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
pub fn Toggle(label: String, checked: bool, on_change: EventHandler<bool>) -> Element {
    rsx! {
        Switch {
            label,
            checked,
            on_change,
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
