use super::bridge::perf_enabled;
use crate::context::EditorServices;
use dioxus::prelude::*;
use papyro_core::TabContentsMap;
use papyro_editor::performance::PreviewPolicy;
use std::time::Instant;

#[derive(Clone, PartialEq)]
struct RenderedPreview {
    html: String,
    policy: PreviewPolicy,
}

#[component]
pub(super) fn PreviewPane(
    active_tab_id: Option<String>,
    tab_contents: Signal<TabContentsMap>,
    editor_services: EditorServices,
) -> Element {
    let rendered_preview = use_memo(use_reactive((&active_tab_id,), move |(active_tab_id,)| {
        let started_at = perf_enabled().then(Instant::now);
        let content = active_tab_id
            .as_deref()
            .and_then(|id| tab_contents.read().content_for_tab(id).map(str::to_string))
            .unwrap_or_default();
        let policy = PreviewPolicy::for_len(content.len());
        let html = if policy.live_preview_enabled {
            editor_services
                .render_html_with_highlighting(&content, policy.code_highlighting_enabled)
        } else {
            String::new()
        };

        if let Some(started_at) = started_at {
            tracing::info!(
                bytes = policy.byte_len,
                code_highlighting = policy.code_highlighting_enabled,
                live_preview = policy.live_preview_enabled,
                elapsed_ms = started_at.elapsed().as_millis(),
                "perf editor preview render"
            );
        }

        RenderedPreview { html, policy }
    }))();

    let notice = preview_notice(rendered_preview.policy);

    rsx! {
        div { class: "mn-preview-shell",
            if let Some(message) = notice {
                div { class: "mn-preview-notice", "{message}" }
            }
            if rendered_preview.policy.live_preview_enabled {
                div {
                    class: "mn-preview",
                    dangerous_inner_html: "{rendered_preview.html}",
                }
            } else {
                div { class: "mn-preview mn-preview-paused",
                    "Live preview is paused for this large document."
                }
            }
        }
    }
}

fn preview_notice(policy: PreviewPolicy) -> Option<&'static str> {
    if !policy.live_preview_enabled {
        Some("Large document mode keeps editing responsive by pausing live preview.")
    } else if !policy.code_highlighting_enabled {
        Some("Large document mode keeps editing responsive by disabling code highlighting.")
    } else {
        None
    }
}
