use dioxus::prelude::*;

use super::{append_class, ClassBuilder, PrimitiveState};

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

pub(super) fn segmented_option_class(
    is_selected: bool,
    disabled: bool,
    class_name: &str,
) -> String {
    ClassBuilder::new("mn-segmented-option")
        .state_when(is_selected, PrimitiveState::Active)
        .extend_when(class_name, disabled, PrimitiveState::Disabled.class())
}

pub(super) fn dropdown_selected_label(options: &[DropdownOption], selected: &str) -> String {
    options
        .iter()
        .find(|option| option.value == selected)
        .map(|option| option.label.clone())
        .unwrap_or_else(|| selected.to_string())
}

pub(super) fn dropdown_class(is_open: bool) -> String {
    ClassBuilder::new("mn-select")
        .state_when(is_open, PrimitiveState::Open)
        .extend("")
}

pub(super) fn dropdown_option_class(is_selected: bool) -> String {
    ClassBuilder::new("mn-select-option")
        .state_when(is_selected, PrimitiveState::Active)
        .extend("")
}

pub(super) fn form_field_class(class_name: &str) -> String {
    append_class("mn-form-field mn-setting-row", class_name)
}

pub(super) fn color_input_class(class_name: &str) -> String {
    append_class("mn-tag-color-input", class_name)
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
    option_class_name: String,
    disabled: bool,
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
            onmousedown: move |event| event.stop_propagation(),
            ondoubleclick: move |event| event.stop_propagation(),
            for option in options {
                button {
                    class: segmented_option_class(
                        option.value == selected,
                        disabled,
                        &option_class_name,
                    ),
                    r#type: "button",
                    role: "radio",
                    disabled,
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
    let selected_label = dropdown_selected_label(&options, &selected);
    let mut is_open = use_signal(|| false);

    rsx! {
        div {
            class: dropdown_class(is_open()),
            tabindex: "0",
            role: "combobox",
            "aria-label": "{label}",
            "aria-expanded": if is_open() { "true" } else { "false" },
            onmousedown: move |event| event.stop_propagation(),
            ondoubleclick: move |event| event.stop_propagation(),
            onblur: move |_| is_open.set(false),
            onkeydown: move |event| match event.key() {
                Key::Escape => is_open.set(false),
                Key::Enter => {
                    event.prevent_default();
                    is_open.toggle();
                }
                Key::Character(ref value) if value == " " => {
                    event.prevent_default();
                    is_open.toggle();
                }
                _ => {}
            },
            button {
                class: "mn-select-trigger",
                r#type: "button",
                onclick: move |event| {
                    event.stop_propagation();
                    is_open.toggle();
                },
                span { class: "mn-select-value", "{selected_label}" }
                span { class: "mn-select-caret" }
            }
            if is_open() {
                button {
                    class: "mn-select-dismiss-layer",
                    r#type: "button",
                    tabindex: "-1",
                    "aria-label": "Close select menu",
                    onclick: move |event| {
                        event.stop_propagation();
                        is_open.set(false);
                    },
                }
                div {
                    class: "mn-select-menu",
                    role: "listbox",
                    for option in options {
                        button {
                            class: dropdown_option_class(option.value == selected),
                            r#type: "button",
                            role: "option",
                            "aria-selected": if option.value == selected { "true" } else { "false" },
                            onclick: {
                                let value = option.value.clone();
                                move |event| {
                                    event.stop_propagation();
                                    on_change.call(value.clone());
                                    is_open.set(false);
                                }
                            },
                            span { class: "mn-select-option-label", "{option.label}" }
                            if option.value == selected {
                                span { class: "mn-select-option-check", "aria-hidden": "true" }
                            }
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
pub fn ColorInput(
    label: String,
    title: String,
    value: String,
    class_name: String,
    on_input: EventHandler<String>,
) -> Element {
    let class = color_input_class(&class_name);

    rsx! {
        input {
            class,
            r#type: "color",
            title,
            "aria-label": "{label}",
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
            onmousedown: move |event| event.stop_propagation(),
            ondoubleclick: move |event| event.stop_propagation(),
            oninput: move |event| on_input.call(event.value()),
            onkeydown: move |event| on_keydown.call(event),
        }
    }
}
