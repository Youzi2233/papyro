#[cfg(test)]
use super::document_cache::DocumentDerivedCacheState;
use super::document_cache::{DocumentCacheKey, DocumentDerivedCache};
use crate::i18n::use_i18n;
use crate::perf::{perf_timer, trace_outline_extract};
use dioxus::prelude::*;
use papyro_core::models::ViewMode;
use papyro_core::DocumentSnapshot;
use papyro_editor::parser::{extract_outline, OutlineItem};
use papyro_editor::performance::should_extract_outline;
use std::sync::Arc;

#[component]
pub(super) fn OutlinePane(
    active_document: Option<DocumentSnapshot>,
    view_mode: ViewMode,
) -> Element {
    let i18n = use_i18n();
    let document_cache = use_context::<DocumentDerivedCache>();
    let mut outline_state = use_signal(|| None::<OutlineRenderState>);
    let effect_cache = document_cache.clone();

    use_effect(use_reactive((&active_document,), move |(document,)| {
        let Some(document) = document else {
            outline_state.set(None);
            return;
        };
        let key = DocumentCacheKey::from_snapshot(&document);
        if let Some(outline) = effect_cache.borrow().outline(&key) {
            outline_state.set(Some(OutlineRenderState {
                key: Some(key),
                outline,
            }));
            return;
        }

        let input = OutlineDerivationInput::from_document(key.clone(), &document);
        outline_state.set(Some(OutlineRenderState {
            key: Some(key.clone()),
            outline: Vec::new(),
        }));

        let mut outline_state = outline_state;
        let effect_cache = effect_cache.clone();
        spawn(async move {
            let result = derive_outline_async(input).await;
            if !outline_result_matches_current(outline_state.peek().as_ref(), &key) {
                return;
            }

            effect_cache
                .borrow_mut()
                .insert_outline(key.clone(), result.outline.clone());
            outline_state.set(Some(result));
        });
    }));

    let key = active_document
        .as_ref()
        .map(DocumentCacheKey::from_snapshot);
    let outline = resolve_outline(&document_cache, key.as_ref(), outline_state.read().as_ref());
    let tab_id = active_document
        .as_ref()
        .map(|document| document.tab_id.clone())
        .unwrap_or_default();
    let outline_items = outline.clone();

    use_effect(use_reactive(
        (&tab_id, &view_mode, &outline_items),
        move |(tab_id, view_mode, _outline_items)| {
            if tab_id.is_empty() {
                return;
            }

            document::eval(&sync_outline_script(tab_id.as_str(), &view_mode));
        },
    ));

    if outline.is_empty() {
        return rsx! {};
    }

    rsx! {
        aside {
            class: "mn-outline",
            "data-tab-id": "{tab_id}",
            "data-view-mode": "{view_mode:?}",
            "aria-label": i18n.text("Document outline", "文档大纲"),
            div { class: "mn-outline-title", {i18n.text("Outline", "大纲")} }
            nav { class: "mn-outline-list",
                for (heading_index, item) in outline.iter().enumerate() {
                    button {
                        key: "{item.line_number}",
                        r#type: "button",
                        class: "mn-outline-item level-{item.level}",
                        "data-tab-id": "{tab_id}",
                        "data-line-number": "{item.line_number}",
                        "data-heading-index": "{heading_index}",
                        title: format!("{} {}", i18n.text("Line", "第"), item.line_number),
                        onclick: {
                            let script = navigate_outline_script(
                                &tab_id,
                                item.line_number,
                                heading_index,
                                &view_mode,
                            );
                            move |_| {
                                document::eval(&script);
                            }
                        },
                        "{item.title}"
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
struct OutlineRenderState {
    key: Option<DocumentCacheKey>,
    outline: Vec<OutlineItem>,
}

struct OutlineDerivationInput {
    key: DocumentCacheKey,
    tab_id: String,
    revision: u64,
    content: Arc<str>,
}

impl OutlineDerivationInput {
    fn from_document(key: DocumentCacheKey, document: &DocumentSnapshot) -> Self {
        Self {
            key,
            tab_id: document.tab_id.clone(),
            revision: document.revision,
            content: document.content.clone(),
        }
    }
}

fn resolve_outline(
    document_cache: &DocumentDerivedCache,
    key: Option<&DocumentCacheKey>,
    state: Option<&OutlineRenderState>,
) -> Vec<OutlineItem> {
    if let Some(outline) = key.and_then(|key| document_cache.borrow().outline(key)) {
        return outline;
    }

    if let Some(state) = state.filter(|state| state.key.as_ref() == key) {
        return state.outline.clone();
    }

    Vec::new()
}

async fn derive_outline_async(input: OutlineDerivationInput) -> OutlineRenderState {
    let key = input.key.clone();
    let result = tokio::task::spawn_blocking(move || {
        derive_outline_for_content(
            Some(input.tab_id.as_str()),
            Some(input.revision),
            input.content.as_ref(),
        )
    })
    .await;

    let outline = match result {
        Ok(outline) => outline,
        Err(error) => {
            tracing::warn!(error = %error, "outline derivation failed");
            Vec::new()
        }
    };

    OutlineRenderState {
        key: Some(key),
        outline,
    }
}

fn derive_outline_for_content(
    tab_id: Option<&str>,
    revision: Option<u64>,
    content: &str,
) -> Vec<OutlineItem> {
    let started_at = perf_timer();
    let should_extract = should_extract_outline(content.len());
    let outline = if should_extract {
        extract_outline(content)
    } else {
        Vec::new()
    };
    trace_outline_extract(
        tab_id,
        revision,
        content.len(),
        outline.len(),
        !should_extract,
        started_at,
    );
    outline
}

fn outline_result_matches_current(
    state: Option<&OutlineRenderState>,
    key: &DocumentCacheKey,
) -> bool {
    state.and_then(|state| state.key.as_ref()) == Some(key)
}

fn sync_outline_script(tab_id: &str, view_mode: &ViewMode) -> String {
    let tab_id_json = serde_json::to_string(tab_id).unwrap_or_else(|_| "\"\"".to_string());
    let view_mode_json =
        serde_json::to_string(view_mode).unwrap_or_else(|_| "\"Hybrid\"".to_string());

    format!(
        r#"
        window.papyroEditor?.syncOutline?.(
            {tab_id_json},
            {view_mode_json},
        );
        "#,
    )
}

fn navigate_outline_script(
    tab_id: &str,
    line_number: usize,
    heading_index: usize,
    view_mode: &ViewMode,
) -> String {
    let tab_id_json = serde_json::to_string(tab_id).unwrap_or_else(|_| "\"\"".to_string());
    let line_number_json = serde_json::to_string(&line_number).unwrap_or_else(|_| "1".to_string());
    let heading_index_json =
        serde_json::to_string(&heading_index).unwrap_or_else(|_| "0".to_string());
    let view_mode_json =
        serde_json::to_string(view_mode).unwrap_or_else(|_| "\"Hybrid\"".to_string());

    format!(
        r#"
        window.papyroEditor?.navigateOutline?.(
            {tab_id_json},
            {view_mode_json},
            {line_number_json},
            {heading_index_json},
        );
        "#,
    )
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
    fn resolve_outline_ignores_stale_render_state() {
        let document_cache = DocumentDerivedCacheState::shared();
        let document = snapshot("a", 1, "# Current");
        let stale_document = snapshot("a", 0, "# Old");
        let key = DocumentCacheKey::from_snapshot(&document);
        let stale_key = DocumentCacheKey::from_snapshot(&stale_document);
        let state = OutlineRenderState {
            key: Some(stale_key),
            outline: vec![OutlineItem {
                level: 1,
                title: "Old".to_string(),
                line_number: 1,
            }],
        };

        let outline = resolve_outline(&document_cache, Some(&key), Some(&state));

        assert!(outline.is_empty());
    }

    #[test]
    fn resolve_outline_prefers_cached_document_match() {
        let document_cache = DocumentDerivedCacheState::shared();
        let document = snapshot("a", 1, "# Current");
        let key = DocumentCacheKey::from_snapshot(&document);
        document_cache.borrow_mut().insert_outline(
            key.clone(),
            vec![OutlineItem {
                level: 1,
                title: "Current".to_string(),
                line_number: 1,
            }],
        );

        let outline = resolve_outline(&document_cache, Some(&key), None);

        assert_eq!(outline[0].title, "Current");
    }

    #[test]
    fn outline_result_matching_rejects_stale_completed_work() {
        let current_document = snapshot("a", 2, "# Current");
        let stale_document = snapshot("a", 1, "# Old");
        let current_key = DocumentCacheKey::from_snapshot(&current_document);
        let stale_key = DocumentCacheKey::from_snapshot(&stale_document);
        let state = OutlineRenderState {
            key: Some(current_key.clone()),
            outline: Vec::new(),
        };

        assert!(outline_result_matches_current(Some(&state), &current_key));
        assert!(!outline_result_matches_current(Some(&state), &stale_key));
    }

    #[test]
    fn derive_outline_for_content_extracts_headings() {
        let outline = derive_outline_for_content(Some("a"), Some(1), "# Current\n\n## Next");

        assert_eq!(
            outline,
            vec![
                OutlineItem {
                    level: 1,
                    title: "Current".to_string(),
                    line_number: 1,
                },
                OutlineItem {
                    level: 2,
                    title: "Next".to_string(),
                    line_number: 3,
                },
            ]
        );
    }

    #[test]
    fn sync_outline_script_targets_runtime_sync_hook() {
        let script = sync_outline_script("tab-a", &ViewMode::Preview);

        assert!(script.contains("syncOutline"));
        assert!(script.contains("\"tab-a\""));
        assert!(script.contains("\"Preview\""));
    }

    #[test]
    fn navigate_outline_script_targets_navigation_hook() {
        let script = navigate_outline_script("tab-a", 12, 3, &ViewMode::Hybrid);

        assert!(script.contains("navigateOutline"));
        assert!(script.contains("\"tab-a\""));
        assert!(script.contains("\"Hybrid\""));
        assert!(script.contains("12"));
        assert!(script.contains("3"));
    }
}
