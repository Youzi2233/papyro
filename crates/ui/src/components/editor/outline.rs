use dioxus::prelude::*;
use papyro_core::TabContentsMap;
use papyro_editor::parser::extract_outline;

use crate::perf::{perf_timer, trace_outline_extract};

#[component]
pub(super) fn OutlinePane(
    active_tab_id: Option<String>,
    tab_contents: Signal<TabContentsMap>,
) -> Element {
    let outline = use_memo(use_reactive((&active_tab_id,), move |(active_tab_id,)| {
        let tab_id = active_tab_id.clone();
        let content = active_tab_id
            .as_deref()
            .and_then(|id| tab_contents.read().content_for_tab(id).map(str::to_string))
            .unwrap_or_default();

        let started_at = perf_timer();
        let outline = extract_outline(&content);
        trace_outline_extract(tab_id.as_deref(), content.len(), outline.len(), started_at);
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
