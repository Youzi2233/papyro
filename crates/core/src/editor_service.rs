use crate::models::DocumentStats;
use crate::models::SaveStatus;
use crate::storage::{OpenedNote, SavedNote};
use crate::{EditorTabs, TabContentsMap};
use std::path::{Path, PathBuf};

pub fn open_note(
    tabs: &mut EditorTabs,
    contents: &mut TabContentsMap,
    opened_note: OpenedNote,
    stats: DocumentStats,
) -> PathBuf {
    let selected_path = opened_note.tab.path.clone();
    let tab_id = opened_note.tab.id.clone();

    if tabs.open_tab(opened_note.tab).is_some() {
        contents.insert_tab(tab_id, opened_note.content, stats);
    }

    selected_path
}

pub fn change_tab_content(
    tabs: &mut EditorTabs,
    contents: &mut TabContentsMap,
    tab_id: &str,
    content: String,
) -> Option<u64> {
    let revision = contents.update_tab_content(tab_id, content)?;
    if !tabs.mark_tab_dirty(tab_id) {
        return None;
    }
    Some(revision)
}

pub fn should_auto_save(
    tabs: &EditorTabs,
    contents: &TabContentsMap,
    tab_id: &str,
    revision: u64,
) -> bool {
    tabs.tab_by_id(tab_id)
        .is_some_and(|tab| tab.is_dirty && tab.save_status == SaveStatus::Dirty)
        && contents.should_auto_save_revision(tab_id, revision)
}

pub fn mark_tab_saved(tabs: &mut EditorTabs, saved_note: SavedNote) {
    tabs.mark_tab_saved(
        &saved_note.tab_id,
        saved_note.title,
        saved_note.disk_content_hash,
    );
}

pub fn begin_tab_save(
    tabs: &mut EditorTabs,
    contents: &TabContentsMap,
    tab_id: &str,
) -> Option<u64> {
    let revision = contents.revision_for_tab(tab_id)?;
    tabs.mark_tab_saving(tab_id).then_some(revision)
}

pub fn mark_tab_saved_if_current(
    tabs: &mut EditorTabs,
    contents: &TabContentsMap,
    saved_note: SavedNote,
    revision: u64,
) -> bool {
    if !contents.should_auto_save_revision(&saved_note.tab_id, revision) {
        return false;
    }

    tabs.mark_tab_saved(
        &saved_note.tab_id,
        saved_note.title,
        saved_note.disk_content_hash,
    );
    true
}

pub fn mark_tab_conflict_if_current(
    tabs: &mut EditorTabs,
    contents: &TabContentsMap,
    tab_id: &str,
    revision: u64,
) -> bool {
    if !contents.should_auto_save_revision(tab_id, revision) {
        return false;
    }

    tabs.mark_tab_conflict(tab_id)
}

pub fn mark_tab_save_failed_if_current(
    tabs: &mut EditorTabs,
    contents: &TabContentsMap,
    tab_id: &str,
    revision: u64,
) -> bool {
    if !contents.should_auto_save_revision(tab_id, revision) {
        return false;
    }

    tabs.mark_tab_save_failed(tab_id)
}

pub fn close_tab(tabs: &mut EditorTabs, contents: &mut TabContentsMap, tab_id: &str) -> bool {
    let closed = tabs.close_tab(tab_id);
    if closed {
        contents.close_tab(tab_id);
    }
    closed
}

pub fn close_tabs_under_path(
    tabs: &mut EditorTabs,
    contents: &mut TabContentsMap,
    target: &Path,
) -> Vec<String> {
    let closed_ids = tabs.close_tabs_under_path(target);
    contents.close_tabs(&closed_ids);
    closed_ids
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::EditorTab;

    fn tab(id: &str, path: &str) -> EditorTab {
        EditorTab {
            id: id.to_string(),
            note_id: format!("note-{id}"),
            title: format!("Note {id}"),
            path: PathBuf::from(path),
            is_dirty: false,
            save_status: crate::models::SaveStatus::Saved,
            disk_content_hash: None,
        }
    }

    #[test]
    fn open_change_save_and_close_note_flow() {
        let mut tabs = EditorTabs::default();
        let mut contents = TabContentsMap::default();
        let opened = OpenedNote {
            tab: tab("a", "notes/a.md"),
            content: "# A".to_string(),
            recent_files: Vec::new(),
        };

        let selected_path = open_note(&mut tabs, &mut contents, opened, DocumentStats::default());
        assert_eq!(selected_path, PathBuf::from("notes/a.md"));
        assert_eq!(tabs.active_tab_id.as_deref(), Some("a"));
        assert_eq!(contents.content_for_tab("a"), Some("# A"));

        let revision = change_tab_content(&mut tabs, &mut contents, "a", "# A\n\nBody".to_string());
        assert_eq!(revision, Some(1));
        assert!(should_auto_save(&tabs, &contents, "a", 1));
        assert_eq!(begin_tab_save(&mut tabs, &contents, "a"), Some(1));

        assert!(mark_tab_saved_if_current(
            &mut tabs,
            &contents,
            SavedNote {
                tab_id: "a".to_string(),
                title: "A".to_string(),
                disk_content_hash: Some(1),
            },
            1,
        ));
        assert!(!should_auto_save(&tabs, &contents, "a", 1));

        let stale_save = SavedNote {
            tab_id: "a".to_string(),
            title: "Old".to_string(),
            disk_content_hash: Some(2),
        };
        let revision = change_tab_content(&mut tabs, &mut contents, "a", "# A\n\nNew".to_string());
        assert_eq!(revision, Some(2));
        assert!(!mark_tab_saved_if_current(
            &mut tabs, &contents, stale_save, 1,
        ));
        assert!(tabs.tab_by_id("a").is_some_and(|tab| tab.is_dirty));

        assert!(close_tab(&mut tabs, &mut contents, "a"));
        assert!(tabs.active_tab().is_none());
        assert!(contents.content_for_tab("a").is_none());
    }

    #[test]
    fn close_tabs_under_path_removes_matching_contents() {
        let mut tabs = EditorTabs::default();
        let mut contents = TabContentsMap::default();
        for item in [
            tab("a", "folder/a.md"),
            tab("b", "folder/deep/b.md"),
            tab("c", "other/c.md"),
        ] {
            let tab_id = item.id.clone();
            tabs.open_tab(item);
            contents.insert_tab(tab_id, String::new(), DocumentStats::default());
        }

        let mut closed = close_tabs_under_path(&mut tabs, &mut contents, Path::new("folder"));
        closed.sort();

        assert_eq!(closed, vec!["a".to_string(), "b".to_string()]);
        assert!(contents.content_for_tab("a").is_none());
        assert!(contents.content_for_tab("b").is_none());
        assert!(contents.content_for_tab("c").is_some());
    }

    #[test]
    fn conflicted_tab_is_dirty_but_not_auto_saved() {
        let mut tabs = EditorTabs::default();
        let mut contents = TabContentsMap::default();
        tabs.open_tab(tab("a", "notes/a.md"));
        contents.insert_tab("a".to_string(), "# A".to_string(), DocumentStats::default());

        let revision = change_tab_content(&mut tabs, &mut contents, "a", "# Local".to_string())
            .expect("content changes");
        assert!(should_auto_save(&tabs, &contents, "a", revision));

        assert!(tabs.mark_tab_conflict("a"));
        assert!(!should_auto_save(&tabs, &contents, "a", revision));

        let next_revision =
            change_tab_content(&mut tabs, &mut contents, "a", "# Local edit".to_string())
                .expect("content changes again");

        assert_eq!(
            tabs.tab_by_id("a").map(|tab| tab.save_status.clone()),
            Some(SaveStatus::Conflict)
        );
        assert!(!should_auto_save(&tabs, &contents, "a", next_revision));
    }
}
