use super::super::support::*;
use super::super::*;
use papyro_core::models::{DocumentStats, RecoveryDraft, SaveStatus};
use papyro_core::storage::OpenedNote;
use papyro_core::{EditorTabs, TabContentsMap};
use std::collections::HashMap;
use std::path::PathBuf;

fn draft(note_id: &str, relative_path: &str, title: &str, content: &str) -> RecoveryDraft {
    RecoveryDraft {
        workspace_id: "workspace-1".to_string(),
        note_id: note_id.to_string(),
        relative_path: PathBuf::from(relative_path),
        title: title.to_string(),
        content: content.to_string(),
        revision: 3,
        updated_at: 10,
    }
}

#[test]
fn compare_recovery_draft_reads_disk_content_without_restoring() {
    let note_path = PathBuf::from("workspace/notes/a.md");
    let opened_note = OpenedNote {
        tab: tab("tab-a", "note-a", "workspace/notes/a.md"),
        content: "# Disk".to_string(),
        recent_files: Vec::new(),
    };
    let storage = MockStorage {
        opened_notes: HashMap::from([(note_path, opened_note)]),
        ..MockStorage::default()
    };
    let file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let recovery_drafts = vec![draft("note-a", "notes/a.md", "A", "# Draft")];

    let comparison =
        compare_recovery_draft_in_storage(&storage, &file_state, &recovery_drafts, "note-a")
            .unwrap();

    assert_eq!(comparison.title, "A");
    assert_eq!(comparison.draft_content, "# Draft");
    assert_eq!(comparison.disk_content.as_deref(), Some("# Disk"));
    assert_eq!(comparison.disk_error, None);
}

#[test]
fn compare_recovery_draft_keeps_draft_when_disk_content_is_missing() {
    let storage = MockStorage::default();
    let file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let recovery_drafts = vec![draft("note-a", "notes/a.md", "A", "# Draft")];

    let comparison =
        compare_recovery_draft_in_storage(&storage, &file_state, &recovery_drafts, "note-a")
            .unwrap();

    assert_eq!(comparison.disk_content, None);
    assert!(comparison
        .disk_error
        .as_deref()
        .is_some_and(|error| error.contains("Missing note content")));
    assert_eq!(comparison.draft_content, "# Draft");
}

#[test]
fn restore_recovery_draft_opens_note_and_marks_tab_dirty() {
    let note_path = PathBuf::from("workspace/notes/a.md");
    let opened_note = OpenedNote {
        tab: tab("tab-a", "note-a", "workspace/notes/a.md"),
        content: "# Disk".to_string(),
        recent_files: vec![recent_file("note-a", "notes/a.md")],
    };
    let storage = MockStorage {
        opened_notes: HashMap::from([(note_path.clone(), opened_note)]),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();
    let mut recovery_drafts = vec![draft("note-a", "notes/a.md", "A", "# Draft\n\nRecovered")];

    let title = restore_recovery_draft_in_state(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        &mut recovery_drafts,
        "note-a",
    )
    .unwrap();

    assert_eq!(title, "A");
    assert!(recovery_drafts.is_empty());
    assert_eq!(file_state.selected_path, Some(note_path));
    assert_eq!(editor_tabs.active_tab_id.as_deref(), Some("tab-a"));
    assert_eq!(
        tab_contents.content_for_tab("tab-a"),
        Some("# Draft\n\nRecovered")
    );
    assert_eq!(
        editor_tabs
            .tab_by_id("tab-a")
            .map(|tab| (tab.is_dirty, tab.save_status.clone())),
        Some((true, SaveStatus::Dirty))
    );
    assert!(tab_contents.stats_snapshot_for_tab("tab-a").is_some());
}

#[test]
fn restore_recovery_draft_activates_existing_tab_before_applying_content() {
    let note_path = PathBuf::from("workspace/notes/a.md");
    let storage = MockStorage::default();
    let mut file_state = file_state_with_tree(vec![
        note_node("workspace/notes/a.md", "note-a"),
        note_node("workspace/notes/b.md", "note-b"),
    ]);
    let mut editor_tabs = EditorTabs::default();
    editor_tabs.open_tab(tab("tab-a", "note-a", "workspace/notes/a.md"));
    editor_tabs.open_tab(tab("tab-b", "note-b", "workspace/notes/b.md"));
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "# Disk A".to_string(),
        DocumentStats::default(),
    );
    tab_contents.insert_tab(
        "tab-b".to_string(),
        "# Disk B".to_string(),
        DocumentStats::default(),
    );
    let mut recovery_drafts = vec![draft("note-a", "notes/a.md", "A", "# Draft A")];

    restore_recovery_draft_in_state(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        &mut recovery_drafts,
        "note-a",
    )
    .unwrap();

    assert!(recovery_drafts.is_empty());
    assert_eq!(file_state.selected_path, Some(note_path));
    assert_eq!(editor_tabs.active_tab_id.as_deref(), Some("tab-a"));
    assert_eq!(tab_contents.content_for_tab("tab-a"), Some("# Draft A"));
    assert_eq!(tab_contents.content_for_tab("tab-b"), Some("# Disk B"));
}
