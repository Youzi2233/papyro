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
    let status = match state {
        EditorRuntimeState::Loading => "Starting editor runtime...".to_string(),
        EditorRuntimeState::Ready => String::new(),
        EditorRuntimeState::Error(message) => format!("Editor runtime failed: {message}"),
    };

    rsx! {
        div { class: "mn-editor-fallback",
            div { class: "mn-editor-fallback-status", "{status}" }
        }
    }
}
