use crate::context::EditorServices;
use dioxus::prelude::*;

#[component]
pub(super) fn PreviewPane(content: String, editor_services: EditorServices) -> Element {
    let html = editor_services.render_html(&content);

    rsx! {
        div {
            class: "mn-preview",
            dangerous_inner_html: "{html}",
        }
    }
}
