#[cfg(test)]
use super::document_cache::DocumentDerivedCacheState;
use super::document_cache::{
    CachedPreview, CachedPreviewStatus, DocumentCacheKey, DocumentDerivedCache,
};
use crate::context::EditorServices;
use crate::perf::{perf_timer, trace_preview_render};
use dioxus::prelude::*;
use papyro_core::DocumentSnapshot;
use papyro_editor::performance::PreviewPolicy;
use std::sync::Arc;
use std::time::Duration;

const PREVIEW_RENDER_TIMEOUT: Duration = Duration::from_secs(2);

#[component]
pub(super) fn PreviewPane(
    active_document: Option<DocumentSnapshot>,
    editor_services: EditorServices,
) -> Element {
    let document_cache = use_context::<DocumentDerivedCache>();
    let mut preview_state = use_signal(|| None::<PreviewRenderState>);
    let effect_cache = document_cache.clone();
    let services = editor_services;

    use_effect(use_reactive((&active_document,), move |(document,)| {
        let Some(document) = document else {
            preview_state.set(None);
            return;
        };
        let key = DocumentCacheKey::from_snapshot(&document);

        if let Some(preview) = effect_cache.borrow().preview(&key) {
            preview_state.set(Some(PreviewRenderState {
                key: Some(key),
                preview,
            }));
            return;
        }

        let input = PreviewRenderInput::from_document(key.clone(), &document, services);
        preview_state.set(Some(PreviewRenderState {
            key: Some(key.clone()),
            preview: preview_pending(&document),
        }));

        let mut preview_state = preview_state;
        let effect_cache = effect_cache.clone();
        spawn(async move {
            let result = render_preview_async(input).await;
            if !preview_result_matches_current(preview_state.peek().as_ref(), &key) {
                return;
            }

            if result.preview.status == CachedPreviewStatus::Ready {
                effect_cache
                    .borrow_mut()
                    .insert_preview(key.clone(), result.preview.clone());
            }
            preview_state.set(Some(result));
        });
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

    let notice = preview_notice(&rendered_preview);

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

struct PreviewRenderInput {
    key: DocumentCacheKey,
    tab_id: String,
    revision: u64,
    content: Arc<str>,
    render_html_with_highlighting: fn(&str, bool) -> String,
}

impl PreviewRenderInput {
    fn from_document(
        key: DocumentCacheKey,
        document: &DocumentSnapshot,
        editor_services: EditorServices,
    ) -> Self {
        Self {
            key,
            tab_id: document.tab_id.clone(),
            revision: document.revision,
            content: document.content.clone(),
            render_html_with_highlighting: editor_services.render_markdown_html_with_highlighting,
        }
    }
}

async fn render_preview_async(input: PreviewRenderInput) -> PreviewRenderState {
    let key = input.key.clone();
    let byte_len = input.content.len();
    let result = tokio::time::timeout(
        PREVIEW_RENDER_TIMEOUT,
        tokio::task::spawn_blocking(move || {
            render_preview_for_content(
                input.tab_id.as_str(),
                input.revision,
                input.content.as_ref(),
                input.render_html_with_highlighting,
            )
        }),
    )
    .await;

    let preview = match result {
        Ok(Ok(preview)) => preview,
        Ok(Err(error)) => {
            tracing::warn!(error = %error, "preview render failed");
            preview_failed(byte_len)
        }
        Err(_) => {
            tracing::warn!(
                bytes = byte_len,
                timeout_ms = PREVIEW_RENDER_TIMEOUT.as_millis(),
                "preview render timed out"
            );
            preview_failed(byte_len)
        }
    };

    PreviewRenderState {
        key: Some(key),
        preview,
    }
}

fn resolve_preview(
    document_cache: &DocumentDerivedCache,
    key: Option<&DocumentCacheKey>,
    state: Option<&PreviewRenderState>,
    document: Option<&DocumentSnapshot>,
) -> CachedPreview {
    if let Some(preview) = key.and_then(|key| document_cache.borrow().preview(key)) {
        return preview;
    }

    if let Some(state) = state.filter(|state| state.key.as_ref() == key) {
        return state.preview.clone();
    }

    preview_placeholder(document)
}

fn render_preview_for_content(
    tab_id: &str,
    revision: u64,
    content: &str,
    render_html_with_highlighting: fn(&str, bool) -> String,
) -> CachedPreview {
    let started_at = perf_timer();
    let policy = PreviewPolicy::for_len(content.len());
    let html = if policy.live_preview_enabled {
        render_html_with_highlighting(content, policy.code_highlighting_enabled)
    } else {
        String::new()
    };

    trace_preview_render(
        tab_id,
        revision,
        policy.byte_len,
        policy.code_highlighting_enabled,
        policy.live_preview_enabled,
        started_at,
    );

    CachedPreview {
        html,
        policy,
        status: CachedPreviewStatus::Ready,
    }
}

fn preview_placeholder(document: Option<&DocumentSnapshot>) -> CachedPreview {
    let byte_len = document
        .map(|document| document.content.len())
        .unwrap_or_default();
    CachedPreview {
        html: String::new(),
        policy: PreviewPolicy::for_len(byte_len),
        status: CachedPreviewStatus::Pending,
    }
}

fn preview_pending(document: &DocumentSnapshot) -> CachedPreview {
    preview_placeholder(Some(document))
}

fn preview_failed(byte_len: usize) -> CachedPreview {
    CachedPreview {
        html: String::new(),
        policy: PreviewPolicy::for_len(byte_len),
        status: CachedPreviewStatus::Failed,
    }
}

fn preview_notice(preview: &CachedPreview) -> Option<&'static str> {
    match preview.status {
        CachedPreviewStatus::Pending => Some("Rendering preview..."),
        CachedPreviewStatus::Failed => Some("Preview could not be rendered."),
        CachedPreviewStatus::Ready if !preview.policy.live_preview_enabled => {
            Some("Large document mode keeps editing responsive by pausing live preview.")
        }
        CachedPreviewStatus::Ready if !preview.policy.code_highlighting_enabled => {
            Some("Large document mode keeps editing responsive by disabling code highlighting.")
        }
        CachedPreviewStatus::Ready => None,
    }
}

fn preview_result_matches_current(
    state: Option<&PreviewRenderState>,
    key: &DocumentCacheKey,
) -> bool {
    state.and_then(|state| state.key.as_ref()) == Some(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn snapshot(tab_id: &str, revision: u64, content: &str) -> DocumentSnapshot {
        DocumentSnapshot {
            tab_id: tab_id.to_string(),
            path: std::path::PathBuf::from(format!("{tab_id}.md")),
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
                status: CachedPreviewStatus::Ready,
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
                status: CachedPreviewStatus::Ready,
            },
        );

        let preview = resolve_preview(&document_cache, Some(&key), None, Some(&document));

        assert_eq!(preview.html, "<h1>Current</h1>");
    }

    #[test]
    fn preview_result_matching_rejects_stale_completed_work() {
        let current_document = snapshot("a", 2, "# Current");
        let stale_document = snapshot("a", 1, "# Old");
        let current_key = DocumentCacheKey::from_snapshot(&current_document);
        let stale_key = DocumentCacheKey::from_snapshot(&stale_document);
        let state = PreviewRenderState {
            key: Some(current_key.clone()),
            preview: preview_pending(&current_document),
        };

        assert!(preview_result_matches_current(Some(&state), &current_key));
        assert!(!preview_result_matches_current(Some(&state), &stale_key));
    }

    #[test]
    fn render_preview_for_content_renders_html() {
        fn render(markdown: &str, highlight_code: bool) -> String {
            format!("<p>{markdown}:{highlight_code}</p>")
        }

        let preview = render_preview_for_content("a", 1, "hello", render);

        assert_eq!(preview.html, "<p>hello:true</p>");
        assert_eq!(preview.status, CachedPreviewStatus::Ready);
    }

    #[test]
    fn preview_notice_reports_pending_and_failed_render() {
        let document = snapshot("a", 1, "# Current");
        let pending = preview_pending(&document);
        let failed = preview_failed(document.content.len());

        assert_eq!(preview_notice(&pending), Some("Rendering preview..."));
        assert_eq!(
            preview_notice(&failed),
            Some("Preview could not be rendered.")
        );
        assert_eq!(failed.policy.byte_len, document.content.len());
    }
}
