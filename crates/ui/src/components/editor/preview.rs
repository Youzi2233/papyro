use super::bridge::perf_enabled;
use super::document_cache::{CachedPreview, DocumentCacheKey, DocumentDerivedCache};
use crate::context::EditorServices;
use dioxus::prelude::*;
use papyro_core::TabContentSnapshot;
use papyro_editor::performance::PreviewPolicy;
use std::time::Instant;

#[component]
pub(super) fn PreviewPane(
    active_document: Option<TabContentSnapshot>,
    editor_services: EditorServices,
) -> Element {
    let document_cache = use_context::<DocumentDerivedCache>();
    let rendered_preview = use_memo(use_reactive((&active_document,), move |(document,)| {
        let started_at = perf_enabled().then(Instant::now);
        let key = document.as_ref().map(DocumentCacheKey::from_snapshot);
        if let Some(preview) = key
            .as_ref()
            .and_then(|key| document_cache.borrow().preview(key))
        {
            return preview;
        }

        let content = document
            .as_ref()
            .map(|document| document.content.as_ref())
            .unwrap_or_default();
        let policy = PreviewPolicy::for_len(content.len());
        let html = if policy.live_preview_enabled {
            editor_services.render_html_with_highlighting(content, policy.code_highlighting_enabled)
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

        let preview = CachedPreview { html, policy };
        if let Some(key) = key {
            document_cache
                .borrow_mut()
                .insert_preview(key, preview.clone());
        }
        preview
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
