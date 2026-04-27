use super::bridge::perf_enabled;
#[cfg(test)]
use super::document_cache::DocumentDerivedCacheState;
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
    let mut preview_state = use_signal(|| None::<PreviewRenderState>);
    let effect_cache = document_cache.clone();
    let services = editor_services;

    use_effect(use_reactive((&active_document,), move |(document,)| {
        let key = document.as_ref().map(DocumentCacheKey::from_snapshot);
        if let Some(preview) = key
            .as_ref()
            .and_then(|key| effect_cache.borrow().preview(key))
        {
            preview_state.set(Some(PreviewRenderState { key, preview }));
            return;
        }

        let preview = render_preview(document.as_ref(), services);
        if let Some(key) = key.as_ref() {
            effect_cache
                .borrow_mut()
                .insert_preview(key.clone(), preview.clone());
        }
        preview_state.set(Some(PreviewRenderState { key, preview }));
    }));

    let key = active_document
        .as_ref()
        .map(DocumentCacheKey::from_snapshot);
    let rendered_preview = resolve_preview(
        &document_cache,
        key.as_ref(),
        preview_state.read().as_ref(),
        active_document.as_ref(),
    );

    let notice = preview_notice(rendered_preview.policy);

    rsx! {
        div { class: "mn-preview-shell",
            if let Some(message) = notice {
                div { class: "mn-preview-notice", "{message}" }
            }
            if rendered_preview.policy.live_preview_enabled {
                div { class: "mn-preview-scroll",
                    article {
                        class: "mn-preview",
                        dangerous_inner_html: "{rendered_preview.html}",
                    }
                }
            } else {
                div { class: "mn-preview-scroll mn-preview-paused",
                    "Live preview is paused for this large document."
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
struct PreviewRenderState {
    key: Option<DocumentCacheKey>,
    preview: CachedPreview,
}

fn resolve_preview(
    document_cache: &DocumentDerivedCache,
    key: Option<&DocumentCacheKey>,
    state: Option<&PreviewRenderState>,
    document: Option<&TabContentSnapshot>,
) -> CachedPreview {
    if let Some(preview) = key.and_then(|key| document_cache.borrow().preview(key)) {
        return preview;
    }

    if let Some(state) = state.filter(|state| state.key.as_ref() == key) {
        return state.preview.clone();
    }

    preview_placeholder(document)
}

fn render_preview(
    document: Option<&TabContentSnapshot>,
    editor_services: EditorServices,
) -> CachedPreview {
    let started_at = perf_enabled().then(Instant::now);
    let content = document
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

    CachedPreview { html, policy }
}

fn preview_placeholder(document: Option<&TabContentSnapshot>) -> CachedPreview {
    let byte_len = document
        .map(|document| document.content.len())
        .unwrap_or_default();
    CachedPreview {
        html: String::new(),
        policy: PreviewPolicy::for_len(byte_len),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn snapshot(tab_id: &str, revision: u64, content: &str) -> TabContentSnapshot {
        TabContentSnapshot {
            tab_id: tab_id.to_string(),
            revision,
            content: Arc::from(content),
        }
    }

    #[test]
    fn resolve_preview_ignores_stale_render_state() {
        let document_cache = DocumentDerivedCacheState::shared();
        let document = snapshot("a", 1, "# Current");
        let stale_document = snapshot("a", 0, "# Old");
        let key = DocumentCacheKey::from_snapshot(&document);
        let stale_key = DocumentCacheKey::from_snapshot(&stale_document);
        let state = PreviewRenderState {
            key: Some(stale_key),
            preview: CachedPreview {
                html: "<h1>Old</h1>".to_string(),
                policy: PreviewPolicy::for_len(stale_document.content.len()),
            },
        };

        let preview = resolve_preview(&document_cache, Some(&key), Some(&state), Some(&document));

        assert_eq!(preview.html, "");
        assert_eq!(preview.policy.byte_len, document.content.len());
    }

    #[test]
    fn resolve_preview_prefers_cached_document_match() {
        let document_cache = DocumentDerivedCacheState::shared();
        let document = snapshot("a", 1, "# Current");
        let key = DocumentCacheKey::from_snapshot(&document);
        document_cache.borrow_mut().insert_preview(
            key.clone(),
            CachedPreview {
                html: "<h1>Current</h1>".to_string(),
                policy: PreviewPolicy::for_len(document.content.len()),
            },
        );

        let preview = resolve_preview(&document_cache, Some(&key), None, Some(&document));

        assert_eq!(preview.html, "<h1>Current</h1>");
    }
}
