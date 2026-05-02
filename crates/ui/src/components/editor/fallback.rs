use crate::components::primitives::ErrorState;
use dioxus::prelude::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum EditorRuntimeState {
    Loading,
    Ready,
    Error(String),
}

#[component]
pub(super) fn FallbackEditor(tab_id: String, state: EditorRuntimeState) -> Element {
    let _ = tab_id;
    let (status, error_message) = match state {
        EditorRuntimeState::Loading => (Some("Starting editor runtime...".to_string()), None),
        EditorRuntimeState::Ready => (None, None),
        EditorRuntimeState::Error(message) => (None, Some(message)),
    };

    rsx! {
        div { class: "mn-editor-fallback",
            if let Some(status) = status {
                div { class: "mn-editor-fallback-status", "{status}" }
            }
            if let Some(message) = error_message {
                ErrorState {
                    title: "Editor runtime failed".to_string(),
                    message: "The editor could not start. Your note content is still on disk; check the details below before retrying.".to_string(),
                    detail: Some(message),
                    class_name: "mn-editor-error-state".to_string(),
                }
            }
        }
    }
}
