use dioxus::prelude::*;

use super::{append_class, ClassBuilder, PrimitiveState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResultRowKind {
    Default,
    Search,
}

pub(super) fn result_row_class(kind: ResultRowKind, is_active: bool) -> String {
    let builder = match kind {
        ResultRowKind::Default => ClassBuilder::new("mn-command-row"),
        ResultRowKind::Search => ClassBuilder::new("mn-command-row").push("mn-search-row"),
    }
    .state_when(is_active, PrimitiveState::Active);

    builder.extend("")
}

#[component]
pub fn ResultRow(
    label: String,
    metadata: String,
    is_active: bool,
    kind: ResultRowKind,
    data_search_active_index: Option<String>,
    on_select: EventHandler<()>,
    children: Element,
) -> Element {
    let metadata = metadata.trim().to_string();
    let has_metadata = !metadata.is_empty();

    rsx! {
        button {
            class: result_row_class(kind, is_active),
            "aria-label": "{label}",
            "data-search-active-index": data_search_active_index,
            onclick: move |_| on_select.call(()),
            span { class: "mn-command-row-main", {children} }
            if has_metadata {
                span { class: "mn-command-kind", "{metadata}" }
            }
        }
    }
}

#[component]
pub fn ResultList(label: String, class_name: String, children: Element) -> Element {
    let class = append_class("mn-command-list", &class_name);

    rsx! {
        div {
            class,
            role: "list",
            "aria-label": "{label}",
            {children}
        }
    }
}

#[component]
pub fn RowActions(class_name: String, children: Element) -> Element {
    let class = append_class("mn-row-actions", &class_name);

    rsx! {
        span { class, {children} }
    }
}

#[component]
pub fn ModalFooterMeta(label: String, class_name: String) -> Element {
    let class = append_class("mn-modal-footer-meta", &class_name);

    rsx! {
        span { class, "{label}" }
    }
}

#[component]
pub fn ComparePanel(
    title: String,
    metadata: String,
    content: String,
    error: Option<String>,
    class_name: String,
) -> Element {
    let class = append_class("mn-compare-panel", &class_name);

    rsx! {
        section { class,
            div { class: "mn-compare-panel-header",
                h3 { "{title}" }
                span { "{metadata}" }
            }
            if let Some(error) = error {
                p { class: "mn-compare-panel-error", "{error}" }
            }
            pre { class: "mn-compare-panel-content",
                code { "{content}" }
            }
        }
    }
}
