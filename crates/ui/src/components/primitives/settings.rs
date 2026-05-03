use dioxus::prelude::*;

use super::append_class;
use super::forms::form_field_class;
use super::layout::ScrollContainer;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsInlineRowKind {
    Create,
    Edit,
}

pub(super) fn settings_nav_button_class(active: bool, class_name: &str) -> String {
    let base = if active {
        "mn-settings-nav-button active"
    } else {
        "mn-settings-nav-button"
    };
    append_class(base, class_name)
}

pub(super) fn settings_inline_row_class(kind: SettingsInlineRowKind, class_name: &str) -> String {
    let base = match kind {
        SettingsInlineRowKind::Create => "mn-setting-inline-row create",
        SettingsInlineRowKind::Edit => "mn-setting-inline-row edit",
    };
    append_class(base, class_name)
}

#[component]
pub fn SettingsLayout(children: Element) -> Element {
    rsx! {
        div { class: "mn-settings-layout", {children} }
    }
}

#[component]
pub fn SettingsNav(label: String, children: Element) -> Element {
    rsx! {
        nav {
            class: "mn-settings-nav",
            "aria-label": "{label}",
            div { class: "mn-settings-nav-list", {children} }
        }
    }
}

#[component]
pub fn SettingsNavItem(
    label: String,
    active: bool,
    class_name: String,
    on_click: EventHandler<MouseEvent>,
) -> Element {
    let class = settings_nav_button_class(active, &class_name);

    rsx! {
        button {
            r#type: "button",
            class,
            "aria-pressed": if active { "true" } else { "false" },
            onclick: move |event| on_click.call(event),
            span { class: "mn-settings-nav-button-title", "{label}" }
        }
    }
}

#[component]
pub fn SettingsContent(children: Element) -> Element {
    rsx! {
        ScrollContainer { class_name: "mn-settings-content".to_string(), {children} }
    }
}

#[component]
pub fn SettingsPanel(children: Element) -> Element {
    rsx! {
        div { class: "mn-settings-panel", {children} }
    }
}

#[component]
pub fn DialogSection(label: String, class_name: String, children: Element) -> Element {
    let class = append_class("mn-setting-section", &class_name);

    rsx! {
        section { class,
            h3 { class: "mn-setting-section-label", "{label}" }
            {children}
        }
    }
}

#[component]
pub fn SettingsRow(
    label: String,
    description: Option<String>,
    class_name: String,
    children: Element,
) -> Element {
    let class = form_field_class(&class_name);

    rsx! {
        div { class,
            div { class: "mn-setting-label",
                span { "{label}" }
                if let Some(description) = description {
                    span { class: "mn-setting-description", "{description}" }
                }
            }
            div { class: "mn-form-control mn-setting-control", {children} }
        }
    }
}

#[component]
pub fn SettingsInlineRow(
    kind: SettingsInlineRowKind,
    class_name: String,
    children: Element,
) -> Element {
    let class = settings_inline_row_class(kind, &class_name);

    rsx! {
        div { class, {children} }
    }
}
