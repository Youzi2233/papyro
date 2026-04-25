use super::super::support::*;
use super::super::*;
use papyro_core::models::{DocumentStats, SaveStatus};
use papyro_core::storage::{OpenedNote, SavedNote};
use papyro_core::{EditorTabs, TabContentsMap};
use std::collections::HashMap;
use std::path::PathBuf;

#[test]
fn open_note_flow_uses_storage_and_updates_state() {
    let note_path = PathBuf::from("workspace/notes/a.md");
    let opened_note = OpenedNote {
        tab: tab("tab-a", "note-a", "workspace/notes/a.md"),
        content: "# Heading".to_string(),
        recent_files: vec![recent_file("note-a", "notes/a.md")],
    };
    let storage = MockStorage {
        opened_notes: HashMap::from([(note_path.clone(), opened_note)]),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![directory_node(
        "workspace/notes",
        vec![note_node("workspace/notes/a.md", "note-a")],
    )]);
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    open_note_from_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        note_path.clone(),
        |content| DocumentStats {
            char_count: content.len(),
            ..DocumentStats::default()
        },
    )
    .unwrap();

    assert_eq!(file_state.selected_path, Some(note_path));
    assert_eq!(
        file_state.recent_files,
        vec![recent_file("note-a", "notes/a.md")]
    );
    assert_eq!(editor_tabs.active_tab_id.as_deref(), Some("tab-a"));
    assert_eq!(tab_contents.content_for_tab("tab-a"), Some("# Heading"));
    assert_eq!(
        tab_contents.active_stats(editor_tabs.active_tab_id.as_deref()),
        DocumentStats {
            char_count: 9,
            ..DocumentStats::default()
        }
    );
}

#[test]
fn open_note_flow_reports_storage_failure() {
    let storage = MockStorage::default();
    let mut file_state = file_state_with_tree(Vec::new());
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    let error = open_note_from_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        PathBuf::from("workspace/missing.md"),
        |_| DocumentStats::default(),
    )
    .unwrap_err();

    assert!(error.to_string().contains("Missing opened note"));
}

#[test]
fn save_tab_flow_marks_tab_clean_and_refreshes_recent_files() {
    let storage = MockStorage {
        save_result: Some(SavedNote {
            tab_id: "tab-a".to_string(),
            title: "Saved Title".to_string(),
        }),
        recent_files: vec![recent_file("note-a", "notes/a.md")],
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let mut editor_tabs = EditorTabs::default();
    let mut tab = tab("tab-a", "note-a", "workspace/notes/a.md");
    tab.is_dirty = true;
    tab.save_status = SaveStatus::Dirty;
    editor_tabs.open_tab(tab);
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "body".to_string(),
        DocumentStats::default(),
    );
    tab_contents.update_tab_content("tab-a", "body updated".to_string());

    save_tab_to_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        "tab-a",
    )
    .unwrap();

    assert_eq!(
        storage.saved_payloads.lock().unwrap().clone(),
        vec![("tab-a".to_string(), "body updated".to_string())]
    );
    assert_eq!(
        file_state.recent_files,
        vec![recent_file("note-a", "notes/a.md")]
    );
    assert_eq!(
        editor_tabs.tab_by_id("tab-a").map(|tab| (
            tab.is_dirty,
            tab.save_status.clone(),
            tab.title.clone()
        )),
        Some((false, SaveStatus::Saved, "Saved Title".to_string()))
    );
}

#[test]
fn save_tab_flow_keeps_dirty_state_when_storage_fails() {
    let storage = MockStorage::default();
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let mut editor_tabs = EditorTabs::default();
    let mut tab = tab("tab-a", "note-a", "workspace/notes/a.md");
    tab.is_dirty = true;
    tab.save_status = SaveStatus::Dirty;
    editor_tabs.open_tab(tab);
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "body".to_string(),
        DocumentStats::default(),
    );
    tab_contents.update_tab_content("tab-a", "body updated".to_string());

    let error = save_tab_to_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        "tab-a",
    )
    .unwrap_err();

    assert!(error.to_string().contains("Missing save result"));
    assert_eq!(
        editor_tabs
            .tab_by_id("tab-a")
            .map(|tab| (tab.is_dirty, tab.save_status.clone())),
        Some((true, SaveStatus::Failed))
    );
    assert_eq!(tab_contents.content_for_tab("tab-a"), Some("body updated"));
}

#[test]
fn save_tab_flow_fails_when_tab_is_missing() {
    let storage = MockStorage::default();
    let mut file_state = file_state_with_tree(Vec::new());
    let mut editor_tabs = EditorTabs::default();
    let tab_contents = TabContentsMap::default();

    let error = save_tab_to_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        "missing",
    )
    .unwrap_err();

    assert!(error.to_string().contains("Tab not found"));
}
