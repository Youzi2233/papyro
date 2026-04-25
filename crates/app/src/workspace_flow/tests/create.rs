use super::super::support::*;
use super::super::*;
use papyro_core::models::DocumentStats;
use papyro_core::storage::OpenedNote;
use papyro_core::{EditorTabs, TabContentsMap};
use std::collections::HashMap;
use std::path::PathBuf;

#[test]
fn create_note_flow_uses_selected_directory_reloads_tree_and_opens_tab() {
    let created_path = PathBuf::from("workspace/notes/new.md");
    let storage = MockStorage {
        create_note_result: Some(created_path.clone()),
        reload_result: Some((
            vec![directory_node(
                "workspace/notes",
                vec![note_node("workspace/notes/new.md", "note-new")],
            )],
            vec![recent_file("note-new", "notes/new.md")],
        )),
        opened_notes: HashMap::from([(
            created_path.clone(),
            OpenedNote {
                tab: tab("tab-new", "note-new", "workspace/notes/new.md"),
                content: "# New".to_string(),
                recent_files: vec![recent_file("note-new", "notes/new.md")],
            },
        )]),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![directory_node(
        "workspace/notes",
        vec![note_node("workspace/notes/old.md", "note-old")],
    )]);
    file_state.select_path(PathBuf::from("workspace/notes"));
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    let created = create_note_in_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        " new.md ",
        |content| DocumentStats {
            char_count: content.len(),
            ..DocumentStats::default()
        },
    )
    .unwrap();

    assert_eq!(created, created_path.clone());
    assert_eq!(
        storage.created_note_requests.lock().unwrap().clone(),
        vec![(PathBuf::from("workspace/notes"), "new.md".to_string())]
    );
    assert_eq!(file_state.selected_path, Some(created_path));
    assert_eq!(editor_tabs.active_tab_id.as_deref(), Some("tab-new"));
    assert_eq!(tab_contents.content_for_tab("tab-new"), Some("# New"));
}

#[test]
fn create_folder_flow_uses_note_parent_and_selects_new_folder() {
    let created_path = PathBuf::from("workspace/notes/folder");
    let storage = MockStorage {
        create_folder_result: Some(created_path.clone()),
        reload_result: Some((
            vec![directory_node(
                "workspace/notes",
                vec![
                    note_node("workspace/notes/old.md", "note-old"),
                    directory_node("workspace/notes/folder", Vec::new()),
                ],
            )],
            Vec::new(),
        )),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![directory_node(
        "workspace/notes",
        vec![note_node("workspace/notes/old.md", "note-old")],
    )]);
    file_state.select_path(PathBuf::from("workspace/notes/old.md"));

    let created = create_folder_in_storage(&storage, &mut file_state, "  ").unwrap();

    assert_eq!(created, created_path.clone());
    assert_eq!(
        storage.created_folder_requests.lock().unwrap().clone(),
        vec![(PathBuf::from("workspace/notes"), "New Folder".to_string())]
    );
    assert_eq!(file_state.selected_path, Some(created_path));
}

#[test]
fn create_note_flow_fails_without_workspace() {
    let storage = MockStorage::default();
    let mut file_state = papyro_core::FileState::default();
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    let error = create_note_in_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        "draft.md",
        |_| DocumentStats::default(),
    )
    .unwrap_err();

    assert!(error.to_string().contains("No workspace"));
}
