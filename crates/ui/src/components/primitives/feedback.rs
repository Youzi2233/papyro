use dioxus::prelude::*;

use super::append_class;

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
pub enum MessageTone {
    Info,
    Success,
    Attention,
    Danger,
}

pub(super) fn status_tone_class(tone: StatusTone) -> &'static str {
    match tone {
        StatusTone::Default => "mn-status-item",
        StatusTone::Saving => "mn-status-saving",
        StatusTone::Attention => "mn-status-unsaved",
    }
}

pub(super) fn inline_alert_class(tone: InlineAlertTone, class_name: &str) -> String {
    let tone_class = match tone {
        InlineAlertTone::Neutral => "mn-inline-alert neutral",
        InlineAlertTone::Attention => "mn-inline-alert attention",
        InlineAlertTone::Danger => "mn-inline-alert danger",
    };
    append_class(tone_class, class_name)
}

pub(super) fn message_class(tone: MessageTone, class_name: &str) -> String {
    let tone_class = match tone {
        MessageTone::Info => "mn-message info",
        MessageTone::Success => "mn-message success",
        MessageTone::Attention => "mn-message attention",
        MessageTone::Danger => "mn-message danger",
    };
    append_class(tone_class, class_name)
}

#[component]
pub fn StatusMessage(message: String) -> Element {
    rsx! {
        span { class: "mn-status-message", "{message}" }
    }
}

#[component]
pub fn StatusStrip(message: Option<String>, children: Element) -> Element {
    rsx! {
        footer { class: "mn-status-bar",
            div { class: "mn-status-left",
                if let Some(message) = message {
                    if !message.is_empty() {
                        StatusMessage { message }
                    }
                }
            }
            div { class: "mn-status-right", {children} }
        }
    }
}

#[component]
pub fn Message(message: String, tone: MessageTone, class_name: String) -> Element {
    let class = message_class(tone, &class_name);

    rsx! {
        div {
            class,
            role: "status",
            "aria-live": "polite",
            span { class: "mn-message-icon", "aria-hidden": "true" }
            span { class: "mn-message-text",
            "{message}"
            }
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
pub fn SkeletonRows(label: String, rows: usize, class_name: String) -> Element {
    let class = append_class("mn-skeleton-list", &class_name);
    let row_count = rows.max(1);

    rsx! {
        div {
            class,
            role: "status",
            "aria-label": "{label}",
            "aria-live": "polite",
            for row in 0..row_count {
                div {
                    key: "{row}",
                    class: "mn-skeleton-row",
                    "aria-hidden": "true",
                    span { class: "mn-skeleton-line primary" }
                    span { class: "mn-skeleton-line secondary" }
                }
            }
        }
    }
}

#[component]
pub fn ErrorState(
    title: String,
    message: String,
    detail: Option<String>,
    class_name: String,
) -> Element {
    let class = append_class("mn-error-state", &class_name);

    rsx! {
        section {
            class,
            role: "alert",
            h2 { class: "mn-error-state-title", "{title}" }
            p { class: "mn-error-state-message", "{message}" }
            if let Some(detail) = detail {
                pre { class: "mn-error-state-detail",
                    code { "{detail}" }
                }
            }
        }
    }
}

#[component]
pub fn StatusIndicator(label: String, tone: StatusTone) -> Element {
    rsx! {
        span { class: status_tone_class(tone), "{label}" }
    }
}
