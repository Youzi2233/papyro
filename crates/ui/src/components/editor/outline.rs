#[cfg(test)]
use super::document_cache::DocumentDerivedCacheState;
use super::document_cache::{DocumentCacheKey, DocumentDerivedCache};
use dioxus::prelude::*;
use papyro_core::TabContentSnapshot;
use papyro_editor::parser::{extract_outline, OutlineItem};
use papyro_editor::performance::should_extract_outline;

use crate::perf::{perf_timer, trace_outline_extract};

#[component]
pub(super) fn OutlinePane(active_document: Option<TabContentSnapshot>) -> Element {
    let document_cache = use_context::<DocumentDerivedCache>();
    let mut outline_state = use_signal(|| None::<OutlineRenderState>);
    let effect_cache = document_cache.clone();

    use_effect(use_reactive((&active_document,), move |(document,)| {
        let key = document.as_ref().map(DocumentCacheKey::from_snapshot);
        if let Some(outline) = key
            .as_ref()
            .and_then(|key| effect_cache.borrow().outline(key))
        {
            outline_state.set(Some(OutlineRenderState { key, outline }));
            return;
        }

        let outline = derive_outline(document.as_ref());
        if let Some(key) = key.as_ref() {
            effect_cache
                .borrow_mut()
                .insert_outline(key.clone(), outline.clone());
        }
        outline_state.set(Some(OutlineRenderState { key, outline }));
    }));

    let key = active_document
        .as_ref()
        .map(DocumentCacheKey::from_snapshot);
    let outline = resolve_outline(&document_cache, key.as_ref(), outline_state.read().as_ref());

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

#[derive(Debug, Clone, PartialEq)]
struct OutlineRenderState {
    key: Option<DocumentCacheKey>,
    outline: Vec<OutlineItem>,
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

fn derive_outline(document: Option<&TabContentSnapshot>) -> Vec<OutlineItem> {
    let tab_id = document.map(|document| document.tab_id.as_str());
    let content = document
        .map(|document| document.content.as_ref())
        .unwrap_or_default();

    let started_at = perf_timer();
    let should_extract = should_extract_outline(content.len());
    let outline = if should_extract {
        extract_outline(content)
    } else {
        Vec::new()
    };
    trace_outline_extract(
        tab_id,
        content.len(),
        outline.len(),
        !should_extract,
        started_at,
    );
    outline
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
}
