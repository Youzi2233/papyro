use dioxus::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ButtonVariant {
    Default,
    Primary,
    Danger,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusTone {
    Default,
    Saving,
    Attention,
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

impl ButtonVariant {
    fn class(self) -> &'static str {
        match self {
            Self::Default => "mn-button",
            Self::Primary => "mn-button primary",
            Self::Danger => "mn-button danger",
        }
    }
}

fn segmented_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-segmented-option active"
    } else {
        "mn-segmented-option"
    }
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
pub fn StatusMessage(message: String) -> Element {
    rsx! {
        span { class: "mn-status-message", "{message}" }
    }
}

#[component]
pub fn StatusIndicator(label: String, tone: StatusTone) -> Element {
    rsx! {
        span { class: status_tone_class(tone), "{label}" }
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
    rsx! {
        select {
            class: "mn-input",
            "aria-label": "{label}",
            value: "{selected}",
            onchange: move |event| on_change.call(event.value()),
            for option in options {
                option {
                    value: "{option.value}",
                    "{option.label}"
                }
            }
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
                title: "{label}",
                "aria-label": "{label}",
                onclick: move |_| on_click.call(()),
                "{icon}"
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
            autofocus,
            placeholder: "{placeholder}",
            value: "{value}",
            oninput: move |event| on_input.call(event.value()),
            onkeydown: move |event| on_keydown.call(event),
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
    fn segmented_option_class_marks_active_option() {
        assert_eq!(segmented_option_class(false), "mn-segmented-option");
        assert_eq!(segmented_option_class(true), "mn-segmented-option active");
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
}
