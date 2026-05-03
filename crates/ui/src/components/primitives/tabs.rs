use dioxus::prelude::*;

use super::append_class;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TabOption {
    pub label: String,
    pub value: String,
}

impl TabOption {
    pub fn new(label: &str, value: &str) -> Self {
        Self {
            label: label.to_string(),
            value: value.to_string(),
        }
    }
}

pub(super) fn tab_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-tabs-option active"
    } else {
        "mn-tabs-option"
    }
}

pub(super) fn document_tab_class(is_active: bool, class_name: &str) -> String {
    let base = if is_active { "mn-tab active" } else { "mn-tab" };
    append_class(base, class_name)
}

#[component]
pub fn DocumentTab(
    id: String,
    save_status: String,
    active: bool,
    title: String,
    open_label: String,
    has_status_indicator: bool,
    status_class: String,
    status_label: String,
    status_marker: String,
    close_label: String,
    next_active_tab_id: String,
    immediate_close: bool,
    class_name: String,
    on_activate: EventHandler<()>,
    on_close_click: EventHandler<()>,
    on_close_keyboard: EventHandler<()>,
) -> Element {
    let class = document_tab_class(active, &class_name);

    rsx! {
        div {
            class,
            "data-tab-id": "{id}",
            "data-save-status": "{save_status}",
            button {
                class: "mn-tab-title",
                "aria-label": "{open_label}",
                onclick: move |_| on_activate.call(()),
                "{title}"
                if has_status_indicator {
                    span {
                        class: "mn-tab-save-status {status_class}",
                        title: "{status_label}",
                        "aria-label": "{status_label}",
                        "{status_marker}"
                    }
                }
            }
            button {
                class: "mn-tab-close",
                title: "{close_label}",
                "aria-label": "{close_label}",
                "data-close-tab-id": "{id}",
                "data-next-active-tab-id": "{next_active_tab_id}",
                "data-immediate-close": if immediate_close { "true" } else { "false" },
                onclick: move |event| {
                    event.prevent_default();
                    event.stop_propagation();
                    on_close_click.call(());
                },
                onkeydown: move |event| {
                    let key = event.key();
                    let is_space = matches!(key, Key::Character(ref value) if value == " ");
                    if key != Key::Enter && !is_space {
                        return;
                    }
                    event.prevent_default();
                    event.stop_propagation();
                    on_close_keyboard.call(());
                },
                "x"
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
