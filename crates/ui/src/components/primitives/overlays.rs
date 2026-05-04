use dioxus::prelude::*;

use super::{ClassBuilder, PrimitiveState};

pub(super) fn menu_item_class(danger: bool) -> String {
    ClassBuilder::new("mn-menu-item")
        .state_when(danger, PrimitiveState::Danger)
        .extend("")
}

#[component]
pub fn Menu(label: String, class_name: String, style: String, children: Element) -> Element {
    rsx! {
        div {
            class: "{class_name}",
            role: "menu",
            "aria-label": "{label}",
            style,
            onmousedown: move |event| event.stop_propagation(),
            ondoubleclick: move |event| event.stop_propagation(),
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
            onmousedown: move |event| event.stop_propagation(),
            ondoubleclick: move |event| event.stop_propagation(),
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
pub fn ModalCloseButton(label: String, on_close: EventHandler<()>) -> Element {
    rsx! {
        button {
            class: "mn-modal-close",
            "aria-label": "{label}",
            onclick: move |_| on_close.call(()),
            "x"
        }
    }
}

#[component]
pub fn ModalHeader(title: String, close_label: String, on_close: EventHandler<()>) -> Element {
    rsx! {
        div { class: "mn-modal-header",
            h2 { class: "mn-modal-title", "{title}" }
            ModalCloseButton {
                label: close_label,
                on_close,
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
