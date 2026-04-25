use super::bridge::{EditorBridgeMap, EditorCommand, EditorFormat};
use dioxus::prelude::*;

#[component]
pub(super) fn EditorToolbar(active_tab_id: String) -> Element {
    rsx! {
        div { class: "mn-toolbar",
            ToolbarButton { label: "B", title: "Bold (Ctrl+B)", kind: EditorFormat::Bold, tab_id: active_tab_id.clone() }
            ToolbarButton { label: "I", title: "Italic (Ctrl+I)", kind: EditorFormat::Italic, tab_id: active_tab_id.clone() }
            ToolbarButton { label: "Link", title: "Insert link (Ctrl+K)", kind: EditorFormat::Link, tab_id: active_tab_id.clone() }
            ToolbarButton { label: "Code", title: "Insert code block", kind: EditorFormat::CodeBlock, tab_id: active_tab_id.clone() }
            ToolbarButton { label: "H1", title: "Heading 1", kind: EditorFormat::Heading1, tab_id: active_tab_id.clone() }
            ToolbarButton { label: "H2", title: "Heading 2", kind: EditorFormat::Heading2, tab_id: active_tab_id.clone() }
            ToolbarButton { label: "\"", title: "Blockquote", kind: EditorFormat::Quote, tab_id: active_tab_id.clone() }
        }
    }
}

#[component]
fn ToolbarButton(
    label: &'static str,
    title: &'static str,
    kind: EditorFormat,
    tab_id: String,
) -> Element {
    let bridges = use_context::<EditorBridgeMap>();

    rsx! {
        button {
            class: "mn-toolbar-button",
            title: "{title}",
            onclick: move |_| {
                if let Some(eval) = bridges.read().get(&tab_id) {
                    let _ = eval.send(EditorCommand::ApplyFormat { kind });
                }
            },
            "{label}"
        }
    }
}
