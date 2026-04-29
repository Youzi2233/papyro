use papyro_core::DocumentSnapshot;
use papyro_editor::parser::OutlineItem;
use papyro_editor::performance::PreviewPolicy;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

const MAX_CACHE_ENTRIES: usize = 24;

pub(super) type DocumentDerivedCache = Rc<RefCell<DocumentDerivedCacheState>>;

#[derive(Default)]
pub(super) struct DocumentDerivedCacheState {
    previews: HashMap<DocumentCacheKey, CachedPreview>,
    outlines: HashMap<DocumentCacheKey, Vec<OutlineItem>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) struct DocumentCacheKey {
    tab_id: String,
    revision: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct CachedPreview {
    pub html: String,
    pub policy: PreviewPolicy,
    pub status: CachedPreviewStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum CachedPreviewStatus {
    Pending,
    Ready,
    Failed,
}

impl DocumentDerivedCacheState {
    pub(super) fn shared() -> DocumentDerivedCache {
        Rc::new(RefCell::new(Self::default()))
    }

    pub(super) fn preview(&self, key: &DocumentCacheKey) -> Option<CachedPreview> {
        self.previews.get(key).cloned()
    }

    pub(super) fn insert_preview(&mut self, key: DocumentCacheKey, preview: CachedPreview) {
        insert_bounded(&mut self.previews, key, preview);
    }

    pub(super) fn outline(&self, key: &DocumentCacheKey) -> Option<Vec<OutlineItem>> {
        self.outlines.get(key).cloned()
    }

    pub(super) fn insert_outline(&mut self, key: DocumentCacheKey, outline: Vec<OutlineItem>) {
        insert_bounded(&mut self.outlines, key, outline);
    }
}

impl DocumentCacheKey {
    pub(super) fn from_snapshot(document: &DocumentSnapshot) -> Self {
        Self {
            tab_id: document.tab_id.clone(),
            revision: document.revision,
        }
    }
}

fn insert_bounded<T>(map: &mut HashMap<DocumentCacheKey, T>, key: DocumentCacheKey, value: T) {
    if !map.contains_key(&key) && map.len() >= MAX_CACHE_ENTRIES {
        if let Some(old_key) = map.keys().next().cloned() {
            map.remove(&old_key);
        }
    }
    map.insert(key, value);
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::{models::DocumentStats, TabContentSnapshot, TabContentsMap};
    use std::path::PathBuf;
    use std::sync::Arc;

    fn document_snapshot(snapshot: TabContentSnapshot) -> DocumentSnapshot {
        DocumentSnapshot {
            tab_id: snapshot.tab_id,
            path: PathBuf::from("a.md"),
            revision: snapshot.revision,
            content: snapshot.content,
        }
    }

    #[test]
    fn cache_key_tracks_document_revision() {
        let mut contents = TabContentsMap::default();
        contents.insert_tab("a".to_string(), "old".to_string(), DocumentStats::default());
        let first = DocumentCacheKey::from_snapshot(&document_snapshot(
            contents.snapshot_for_tab("a").unwrap(),
        ));

        contents.update_tab_content("a", "new".to_string());
        let next = DocumentCacheKey::from_snapshot(&document_snapshot(
            contents.snapshot_for_tab("a").unwrap(),
        ));

        assert_ne!(first, next);
    }

    #[test]
    fn cache_key_ignores_content_handle_when_revision_matches() {
        let first = DocumentSnapshot {
            tab_id: "a".to_string(),
            path: PathBuf::from("a.md"),
            revision: 1,
            content: Arc::from("one"),
        };
        let next = DocumentSnapshot {
            tab_id: "a".to_string(),
            path: PathBuf::from("a.md"),
            revision: 1,
            content: Arc::from("two"),
        };

        assert_eq!(
            DocumentCacheKey::from_snapshot(&first),
            DocumentCacheKey::from_snapshot(&next)
        );
    }

    #[test]
    fn cache_key_changes_when_saved_content_replace_advances_revision() {
        let mut contents = TabContentsMap::default();
        contents.insert_tab("a".to_string(), "old".to_string(), DocumentStats::default());
        let first = DocumentCacheKey::from_snapshot(&document_snapshot(
            contents.snapshot_for_tab("a").unwrap(),
        ));

        assert!(contents.replace_saved_content("a", "saved".to_string(), DocumentStats::default()));
        let next = DocumentCacheKey::from_snapshot(&document_snapshot(
            contents.snapshot_for_tab("a").unwrap(),
        ));

        assert_ne!(first, next);
    }

    #[test]
    fn cache_key_survives_tab_content_map_clones() {
        let mut contents = TabContentsMap::default();
        contents.insert_tab("a".to_string(), "old".to_string(), DocumentStats::default());

        let first = DocumentCacheKey::from_snapshot(&document_snapshot(
            contents.snapshot_for_tab("a").unwrap(),
        ));
        let cloned = contents.clone();
        let next = DocumentCacheKey::from_snapshot(&document_snapshot(
            cloned.snapshot_for_tab("a").unwrap(),
        ));

        assert_eq!(first, next);
    }
}
