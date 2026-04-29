use crate::models::{DocumentStats, EditorTab, SaveStatus};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct EditorTabs {
    pub tabs: Vec<EditorTab>,
    pub active_tab_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct TabContentsMap {
    /// tab_id -> markdown content
    pub tab_contents: HashMap<String, Arc<str>>,
    /// tab_id -> monotonic document revision for autosave staleness and derived caches
    pub tab_revisions: HashMap<String, u64>,
    /// tab_id -> cached document stats for a specific content revision
    pub tab_stats: HashMap<String, DocumentStatsSnapshot>,
}

#[derive(Debug, Clone)]
pub struct TabContentSnapshot {
    pub tab_id: String,
    pub revision: u64,
    pub content: Arc<str>,
}

#[derive(Debug, Clone)]
pub struct DocumentSnapshot {
    pub tab_id: String,
    pub path: PathBuf,
    pub revision: u64,
    pub content: Arc<str>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentStatsSnapshot {
    pub tab_id: String,
    pub revision: u64,
    pub stats: DocumentStats,
}

impl PartialEq for TabContentSnapshot {
    fn eq(&self, other: &Self) -> bool {
        self.tab_id == other.tab_id
            && self.revision == other.revision
            && Arc::ptr_eq(&self.content, &other.content)
    }
}

impl Eq for TabContentSnapshot {}

impl PartialEq for DocumentSnapshot {
    fn eq(&self, other: &Self) -> bool {
        self.tab_id == other.tab_id
            && self.path == other.path
            && self.revision == other.revision
            && Arc::ptr_eq(&self.content, &other.content)
    }
}

impl Eq for DocumentSnapshot {}

impl EditorTabs {
    pub fn active_tab(&self) -> Option<&EditorTab> {
        self.active_tab_id
            .as_ref()
            .and_then(|id| self.tabs.iter().find(|t| &t.id == id))
    }

    pub fn tab_by_id(&self, tab_id: &str) -> Option<&EditorTab> {
        self.tabs.iter().find(|tab| tab.id == tab_id)
    }

    pub fn open_tab(&mut self, tab: EditorTab) -> Option<String> {
        if !self.tabs.iter().any(|t| t.note_id == tab.note_id) {
            let tab_id = tab.id.clone();
            self.active_tab_id = Some(tab.id.clone());
            self.tabs.push(tab);
            Some(tab_id)
        } else if let Some(existing) = self.tabs.iter().find(|t| t.note_id == tab.note_id) {
            self.active_tab_id = Some(existing.id.clone());
            None
        } else {
            None
        }
    }

    pub fn close_tab(&mut self, tab_id: &str) -> bool {
        let was_open = self.tabs.iter().any(|tab| tab.id == tab_id);
        self.tabs.retain(|t| t.id != tab_id);
        if self.active_tab_id.as_deref() == Some(tab_id) {
            self.active_tab_id = self.tabs.last().map(|t| t.id.clone());
        }
        was_open
    }

    pub fn set_active_tab(&mut self, tab_id: &str) {
        if self.tabs.iter().any(|tab| tab.id == tab_id) {
            self.active_tab_id = Some(tab_id.to_string());
        }
    }

    pub fn mark_tab_dirty(&mut self, tab_id: &str) -> bool {
        if let Some(tab) = self.tabs.iter_mut().find(|tab| tab.id == tab_id) {
            tab.is_dirty = true;
            if tab.save_status != SaveStatus::Conflict {
                tab.save_status = SaveStatus::Dirty;
            }
            true
        } else {
            false
        }
    }

    pub fn mark_tab_saving(&mut self, tab_id: &str) -> bool {
        if let Some(tab) = self.tabs.iter_mut().find(|tab| tab.id == tab_id) {
            tab.save_status = SaveStatus::Saving;
            true
        } else {
            false
        }
    }

    pub fn mark_tab_saved(&mut self, tab_id: &str, title: String, disk_content_hash: Option<u64>) {
        if let Some(tab) = self.tabs.iter_mut().find(|tab| tab.id == tab_id) {
            tab.is_dirty = false;
            tab.save_status = SaveStatus::Saved;
            tab.title = title;
            tab.disk_content_hash = disk_content_hash;
        }
    }

    pub fn mark_tab_saved_as(
        &mut self,
        tab_id: &str,
        note_id: String,
        title: String,
        path: PathBuf,
        disk_content_hash: Option<u64>,
    ) -> bool {
        if let Some(tab) = self.tabs.iter_mut().find(|tab| tab.id == tab_id) {
            tab.note_id = note_id;
            tab.path = path;
            tab.is_dirty = false;
            tab.save_status = SaveStatus::Saved;
            tab.title = title;
            tab.disk_content_hash = disk_content_hash;
            true
        } else {
            false
        }
    }

    pub fn mark_tab_save_failed(&mut self, tab_id: &str) -> bool {
        if let Some(tab) = self.tabs.iter_mut().find(|tab| tab.id == tab_id) {
            tab.is_dirty = true;
            tab.save_status = SaveStatus::Failed;
            true
        } else {
            false
        }
    }

    pub fn mark_tab_conflict(&mut self, tab_id: &str) -> bool {
        if let Some(tab) = self.tabs.iter_mut().find(|tab| tab.id == tab_id) {
            tab.is_dirty = true;
            tab.save_status = SaveStatus::Conflict;
            true
        } else {
            false
        }
    }

    pub fn update_tab_path(&mut self, old_path: &std::path::Path, new_path: std::path::PathBuf) {
        let new_title = new_path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("Untitled")
            .to_string();

        for tab in &mut self.tabs {
            if tab.path == old_path {
                tab.path = new_path.clone();
                tab.title = new_title.clone();
            }
        }
    }

    pub fn close_tabs_under_path(&mut self, target: &std::path::Path) -> Vec<String> {
        let closed_ids: Vec<String> = self
            .tabs
            .iter()
            .filter(|tab| tab.path.starts_with(target))
            .map(|tab| tab.id.clone())
            .collect();

        self.tabs.retain(|tab| !tab.path.starts_with(target));

        if let Some(active_tab_id) = &self.active_tab_id {
            if closed_ids.iter().any(|id| id == active_tab_id) {
                self.active_tab_id = self.tabs.last().map(|tab| tab.id.clone());
            }
        }

        closed_ids
    }
}

impl TabContentsMap {
    pub fn active_content(&self, active_tab_id: Option<&str>) -> Option<&str> {
        active_tab_id.and_then(|id| self.tab_contents.get(id).map(|s| s.as_ref()))
    }

    pub fn content_for_tab(&self, tab_id: &str) -> Option<&str> {
        self.tab_contents
            .get(tab_id)
            .map(|content| content.as_ref())
    }

    pub fn snapshot_for_tab(&self, tab_id: &str) -> Option<TabContentSnapshot> {
        let content = self.tab_contents.get(tab_id)?.clone();
        Some(TabContentSnapshot {
            tab_id: tab_id.to_string(),
            revision: self.revision_for_tab(tab_id).unwrap_or_default(),
            content,
        })
    }

    pub fn active_stats(&self, active_tab_id: Option<&str>) -> DocumentStats {
        self.active_stats_snapshot(active_tab_id)
            .map(|snapshot| snapshot.stats)
            .unwrap_or_default()
    }

    pub fn active_stats_snapshot(
        &self,
        active_tab_id: Option<&str>,
    ) -> Option<DocumentStatsSnapshot> {
        active_tab_id.and_then(|id| self.stats_snapshot_for_tab(id))
    }

    pub fn insert_tab(&mut self, tab_id: String, content: String, stats: DocumentStats) {
        self.tab_stats.insert(
            tab_id.clone(),
            DocumentStatsSnapshot {
                tab_id: tab_id.clone(),
                revision: 0,
                stats,
            },
        );
        self.tab_contents.insert(tab_id.clone(), Arc::from(content));
        self.tab_revisions.insert(tab_id, 0);
    }

    pub fn close_tab(&mut self, tab_id: &str) {
        self.tab_contents.remove(tab_id);
        self.tab_revisions.remove(tab_id);
        self.tab_stats.remove(tab_id);
    }

    pub fn close_tabs(&mut self, tab_ids: &[String]) {
        for id in tab_ids {
            self.close_tab(id);
        }
    }

    pub fn update_tab_content(&mut self, tab_id: &str, content: String) -> Option<u64> {
        if self
            .tab_contents
            .get(tab_id)
            .is_some_and(|existing| existing.as_ref() == content)
        {
            return None;
        }

        if !self.tab_contents.contains_key(tab_id) {
            return None;
        }

        let current_revision = self.bump_revision(tab_id);
        self.tab_contents
            .insert(tab_id.to_string(), Arc::from(content));
        Some(current_revision)
    }

    pub fn refresh_stats(&mut self, tab_id: &str, revision: u64, stats: DocumentStats) -> bool {
        if self.should_auto_save_revision(tab_id, revision) {
            self.tab_stats.insert(
                tab_id.to_string(),
                DocumentStatsSnapshot {
                    tab_id: tab_id.to_string(),
                    revision,
                    stats,
                },
            );
            true
        } else {
            false
        }
    }

    pub fn replace_saved_content(
        &mut self,
        tab_id: &str,
        content: String,
        stats: DocumentStats,
    ) -> bool {
        if !self.tab_contents.contains_key(tab_id) {
            return false;
        }

        let content_changed = self
            .tab_contents
            .get(tab_id)
            .is_some_and(|existing| existing.as_ref() != content);
        if content_changed {
            self.tab_contents
                .insert(tab_id.to_string(), Arc::from(content));
            self.bump_revision(tab_id);
        }
        let revision = self.revision_for_tab(tab_id).unwrap_or_default();
        self.tab_stats.insert(
            tab_id.to_string(),
            DocumentStatsSnapshot {
                tab_id: tab_id.to_string(),
                revision,
                stats,
            },
        );
        true
    }

    pub fn revision_for_tab(&self, tab_id: &str) -> Option<u64> {
        self.tab_revisions.get(tab_id).copied()
    }

    pub fn stats_snapshot_for_tab(&self, tab_id: &str) -> Option<DocumentStatsSnapshot> {
        self.tab_stats.get(tab_id).and_then(|snapshot| {
            (self.revision_for_tab(tab_id) == Some(snapshot.revision)).then(|| snapshot.clone())
        })
    }

    pub fn should_auto_save_revision(&self, tab_id: &str, revision: u64) -> bool {
        self.tab_revisions.get(tab_id).copied() == Some(revision)
    }

    fn bump_revision(&mut self, tab_id: &str) -> u64 {
        let revision = self.tab_revisions.entry(tab_id.to_string()).or_insert(0);
        *revision += 1;
        *revision
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DocumentStats;
    use std::path::PathBuf;

    fn tab(id: &str) -> EditorTab {
        EditorTab {
            id: id.to_string(),
            note_id: format!("note-{id}"),
            title: format!("Note {id}"),
            path: PathBuf::from(format!("{id}.md")),
            is_dirty: false,
            save_status: SaveStatus::Saved,
            disk_content_hash: None,
        }
    }

    #[test]
    fn open_tab_uses_caller_supplied_stats() {
        let mut tabs = EditorTabs::default();
        let mut contents = TabContentsMap::default();
        let tab = tab("a");
        let tab_id = tab.id.clone();
        let stats = DocumentStats {
            line_count: 3,
            word_count: 5,
            char_count: 42,
            heading_count: 1,
        };

        let inserted = tabs.open_tab(tab);
        assert_eq!(inserted.as_deref(), Some(tab_id.as_str()));
        contents.insert_tab(tab_id, "# Title".to_string(), stats.clone());

        assert_eq!(tabs.active_tab_id.as_deref(), Some("a"));
        assert_eq!(
            contents.active_content(tabs.active_tab_id.as_deref()),
            Some("# Title")
        );
        assert_eq!(contents.active_stats(tabs.active_tab_id.as_deref()), stats);
    }

    #[test]
    fn open_tab_activates_existing_note_without_duplicate() {
        let mut tabs = EditorTabs::default();
        let first = tab("a");
        let duplicate = EditorTab {
            id: "b".to_string(),
            title: "Duplicate".to_string(),
            path: PathBuf::from("duplicate.md"),
            ..first.clone()
        };

        assert_eq!(tabs.open_tab(first).as_deref(), Some("a"));
        assert_eq!(tabs.open_tab(duplicate), None);

        assert_eq!(tabs.tabs.len(), 1);
        assert_eq!(tabs.active_tab_id.as_deref(), Some("a"));
    }

    #[test]
    fn content_revision_tracks_dirty_autosave_state() {
        let mut tabs = EditorTabs::default();
        let mut contents = TabContentsMap::default();
        let tab = tab("a");
        let tab_id = tab.id.clone();
        tabs.open_tab(tab);
        contents.insert_tab(tab_id.clone(), "old".to_string(), DocumentStats::default());

        let revision = contents.update_tab_content(&tab_id, "new".to_string());
        tabs.mark_tab_dirty(&tab_id);

        assert_eq!(revision, Some(1));
        assert!(tabs.tab_by_id(&tab_id).is_some_and(|tab| tab.is_dirty));
        assert_eq!(
            tabs.tab_by_id(&tab_id).map(|tab| tab.save_status.clone()),
            Some(SaveStatus::Dirty)
        );
        assert!(contents.should_auto_save_revision(&tab_id, 1));
        assert!(!contents.should_auto_save_revision(&tab_id, 0));
        tabs.mark_tab_saving(&tab_id);
        assert_eq!(
            tabs.tab_by_id(&tab_id).map(|tab| tab.save_status.clone()),
            Some(SaveStatus::Saving)
        );
        tabs.mark_tab_saved(&tab_id, "Saved".to_string(), Some(7));
        assert!(!tabs.tab_by_id(&tab_id).is_some_and(|tab| tab.is_dirty));
        assert_eq!(
            tabs.tab_by_id(&tab_id).map(|tab| tab.save_status.clone()),
            Some(SaveStatus::Saved)
        );
        assert_eq!(
            tabs.tab_by_id(&tab_id)
                .and_then(|tab| tab.disk_content_hash),
            Some(7)
        );
    }

    #[test]
    fn split_tabs_and_contents_coordinate_without_sharing_state() {
        let mut tabs = EditorTabs::default();
        let mut contents = TabContentsMap::default();
        let tab = tab("a");
        let tab_id = tab.id.clone();

        let inserted = tabs.open_tab(tab);
        assert_eq!(inserted.as_deref(), Some(tab_id.as_str()));
        contents.insert_tab(tab_id.clone(), "old".to_string(), DocumentStats::default());

        let revision = contents.update_tab_content(&tab_id, "new".to_string());
        assert_eq!(revision, Some(1));
        assert!(!tabs.active_tab().unwrap().is_dirty);

        assert!(tabs.mark_tab_dirty(&tab_id));
        assert!(tabs.active_tab().unwrap().is_dirty);
        assert!(contents.should_auto_save_revision(&tab_id, 1));

        assert!(tabs.close_tab(&tab_id));
        contents.close_tab(&tab_id);
        assert!(tabs.active_tab().is_none());
        assert!(contents.content_for_tab(&tab_id).is_none());
    }

    #[test]
    fn replace_saved_content_refreshes_content_stats_and_advances_revision() {
        let mut contents = TabContentsMap::default();
        contents.insert_tab("a".to_string(), "old".to_string(), DocumentStats::default());
        contents.update_tab_content("a", "dirty".to_string());

        assert!(contents.replace_saved_content(
            "a",
            "saved".to_string(),
            DocumentStats {
                char_count: 5,
                ..DocumentStats::default()
            },
        ));

        assert_eq!(contents.content_for_tab("a"), Some("saved"));
        assert_eq!(contents.revision_for_tab("a"), Some(2));
        assert!(!contents.should_auto_save_revision("a", 1));
        assert_eq!(
            contents
                .stats_snapshot_for_tab("a")
                .map(|snapshot| (snapshot.revision, snapshot.stats.char_count)),
            Some((2, 5))
        );
    }

    #[test]
    fn refresh_stats_rejects_stale_revision() {
        let mut contents = TabContentsMap::default();
        contents.insert_tab("a".to_string(), "old".to_string(), DocumentStats::default());
        contents.update_tab_content("a", "new".to_string());
        contents.update_tab_content("a", "newer".to_string());

        assert!(!contents.refresh_stats(
            "a",
            1,
            DocumentStats {
                char_count: 3,
                ..DocumentStats::default()
            },
        ));
        assert!(contents.active_stats_snapshot(Some("a")).is_none());

        assert!(contents.refresh_stats(
            "a",
            2,
            DocumentStats {
                char_count: 5,
                ..DocumentStats::default()
            },
        ));
        assert_eq!(
            contents
                .active_stats_snapshot(Some("a"))
                .map(|snapshot| (snapshot.revision, snapshot.stats.char_count)),
            Some((2, 5))
        );
    }

    #[test]
    fn active_stats_hides_stale_snapshot_after_content_change() {
        let mut contents = TabContentsMap::default();
        contents.insert_tab(
            "a".to_string(),
            "old".to_string(),
            DocumentStats {
                char_count: 3,
                ..DocumentStats::default()
            },
        );

        assert_eq!(contents.active_stats(Some("a")).char_count, 3);

        contents.update_tab_content("a", "new".to_string());

        assert!(contents.active_stats_snapshot(Some("a")).is_none());
        assert_eq!(contents.active_stats(Some("a")), DocumentStats::default());
    }

    #[test]
    fn replace_saved_content_keeps_revision_for_unchanged_content() {
        let mut contents = TabContentsMap::default();
        contents.insert_tab("a".to_string(), "old".to_string(), DocumentStats::default());
        let snapshot = contents.snapshot_for_tab("a").unwrap();

        assert!(contents.replace_saved_content(
            "a",
            "old".to_string(),
            DocumentStats {
                char_count: 3,
                ..DocumentStats::default()
            },
        ));

        assert_eq!(contents.revision_for_tab("a"), Some(0));
        assert_eq!(snapshot, contents.snapshot_for_tab("a").unwrap());
        assert_eq!(
            contents
                .stats_snapshot_for_tab("a")
                .map(|snapshot| (snapshot.revision, snapshot.stats.char_count)),
            Some((0, 3))
        );
    }

    #[test]
    fn content_snapshot_tracks_revision_and_shared_content_handle() {
        let mut contents = TabContentsMap::default();
        contents.insert_tab("a".to_string(), "old".to_string(), DocumentStats::default());

        let first = contents.snapshot_for_tab("a").unwrap();
        let cloned = contents.clone();
        assert_eq!(first, cloned.snapshot_for_tab("a").unwrap());

        assert!(contents.refresh_stats(
            "a",
            0,
            DocumentStats {
                word_count: 1,
                ..DocumentStats::default()
            },
        ));
        assert_eq!(first, contents.snapshot_for_tab("a").unwrap());

        contents.update_tab_content("a", "new".to_string());
        assert_ne!(first, contents.snapshot_for_tab("a").unwrap());
    }
    #[test]
    fn close_tabs_under_path_returns_closed_ids_and_updates_active_tab() {
        let mut tabs = EditorTabs::default();
        let mut first = tab("a");
        first.path = PathBuf::from("folder/a.md");
        let mut second = tab("b");
        second.path = PathBuf::from("folder/nested/b.md");
        let mut third = tab("c");
        third.path = PathBuf::from("other/c.md");

        tabs.open_tab(first);
        tabs.open_tab(second);
        tabs.open_tab(third);
        tabs.set_active_tab("b");

        let mut closed = tabs.close_tabs_under_path(std::path::Path::new("folder"));
        closed.sort();

        assert_eq!(closed, vec!["a".to_string(), "b".to_string()]);
        assert_eq!(tabs.tabs.len(), 1);
        assert_eq!(tabs.tabs[0].id, "c");
        assert_eq!(tabs.active_tab_id.as_deref(), Some("c"));
    }
}
