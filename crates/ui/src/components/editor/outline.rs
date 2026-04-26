use dioxus::prelude::*;
use papyro_core::TabContentSnapshot;
use papyro_editor::parser::extract_outline;

use crate::perf::{perf_timer, trace_outline_extract};

#[component]
pub(super) fn OutlinePane(active_document: Option<TabContentSnapshot>) -> Element {
    let outline = use_memo(use_reactive((&active_document,), move |(document,)| {
        let tab_id = document.as_ref().map(|document| document.tab_id.as_str());
        let content = document
            .as_ref()
            .map(|document| document.content.as_ref())
            .unwrap_or_default();

        let started_at = perf_timer();
        let outline = extract_outline(content);
        trace_outline_extract(tab_id, content.len(), outline.len(), started_at);
        outline
    }))();

    if outline.is_empty() {
        return rsx! {};
    }

    rsx! {
        aside { class: "mn-outline", "aria-label": "Document outline",
            div { class: "mn-outline-title", "Outline" }
            nav { class: "mn-outline-list",
                for item in outline.iter() {
                    div {
                        key: "{item.line_number}",
                        class: "mn-outline-item level-{item.level}",
                        title: "Line {item.line_number}",
                        "{item.title}"
                    }
                }
            }
        }
    }
}
