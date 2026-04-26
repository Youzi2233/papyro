use super::super::support::*;
use super::super::*;
use papyro_core::models::DocumentStats;
use papyro_core::{EditorTabs, TabContentsMap};
use std::path::{Path, PathBuf};

#[test]
fn rename_selected_note_updates_tree_selection_and_tab_path() {
    let old_path = PathBuf::from("workspace/notes/a.md");
    let new_path = PathBuf::from("workspace/notes/renamed.md");
    let storage = MockStorage {
        rename_result: Some(new_path.clone()),
        reload_result: Some((
            vec![directory_node(
                "workspace/notes",
                vec![note_node("workspace/notes/renamed.md", "note-a")],
            )],
            vec![recent_file("note-a", "notes/renamed.md")],
        )),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![directory_node(
        "workspace/notes",
        vec![note_node("workspace/notes/a.md", "note-a")],
    )]);
    file_state.select_path(old_path.clone());
    let mut editor_tabs = EditorTabs::default();
    editor_tabs.open_tab(tab("tab-a", "note-a", "workspace/notes/a.md"));
    editor_tabs.mark_tab_dirty("tab-a");
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "body".to_string(),
        DocumentStats::default(),
    );

    let renamed = rename_selected_path(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        "renamed.md",
    )
    .unwrap();

    assert_eq!(renamed, new_path.clone());
    assert_eq!(file_state.selected_path, Some(new_path.clone()));
    assert_eq!(
        file_state.recent_files,
        vec![recent_file("note-a", "notes/renamed.md")]
    );
    assert_eq!(
        editor_tabs
            .tab_by_id("tab-a")
            .map(|tab| (tab.path.clone(), tab.title.clone())),
        Some((new_path, "renamed".to_string()))
    );
}

#[test]
fn rename_selected_path_fails_without_selection() {
    let storage = MockStorage::default();
    let mut file_state = file_state_with_tree(Vec::new());
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    let error = rename_selected_path(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        "renamed.md",
    )
    .unwrap_err();

    assert!(error.to_string().contains("No selected note or folder"));
}

#[test]
fn move_selected_note_updates_tree_selection_and_tab_path() {
    let old_path = PathBuf::from("workspace/notes/daily/a.md");
    let target_dir = PathBuf::from("workspace/archive");
    let new_path = PathBuf::from("workspace/archive/a.md");
    let storage = MockStorage {
        move_result: Some(new_path.clone()),
        reload_result: Some((
            vec![directory_node(
                "workspace/archive",
                vec![note_node("workspace/archive/a.md", "note-a")],
            )],
            vec![recent_file("note-a", "archive/a.md")],
        )),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![
        directory_node(
            "workspace/notes",
            vec![directory_node(
                "workspace/notes/daily",
                vec![note_node("workspace/notes/daily/a.md", "note-a")],
            )],
        ),
        directory_node("workspace/archive", Vec::new()),
    ]);
    file_state.select_path(old_path.clone());
    let mut editor_tabs = EditorTabs::default();
    editor_tabs.open_tab(tab("tab-a", "note-a", "workspace/notes/daily/a.md"));
    editor_tabs.mark_tab_dirty("tab-a");
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "![logo](../../assets/logo.png)".to_string(),
        DocumentStats::default(),
    );

    let moved = move_selected_path(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        &target_dir,
    )
    .unwrap();

    assert_eq!(moved, new_path.clone());
    assert_eq!(
        storage.moved_paths.lock().unwrap().clone(),
        vec![(old_path.clone(), target_dir)]
    );
    assert_eq!(file_state.selected_path, Some(new_path.clone()));
    assert_eq!(
        file_state.recent_files,
        vec![recent_file("note-a", "archive/a.md")]
    );
    assert_eq!(
        editor_tabs
            .tab_by_id("tab-a")
            .map(|tab| (tab.path.clone(), tab.title.clone())),
        Some((new_path, "a".to_string()))
    );
    assert_eq!(
        tab_contents.content_for_tab("tab-a"),
        Some("![logo](../assets/logo.png)")
    );
}

#[test]
fn move_selected_path_rejects_invalid_targets() {
    let storage = MockStorage::default();
    let mut file_state = file_state_with_tree(vec![
        directory_node(
            "workspace/notes",
            vec![note_node("workspace/notes/a.md", "note-a")],
        ),
        note_node("workspace/root.md", "root"),
    ]);
    file_state.select_path(PathBuf::from("workspace/notes"));
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    let nested_error = move_selected_path(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        Path::new("notes/child"),
    )
    .unwrap_err();
    assert!(nested_error.to_string().contains("itself"));

    let note_target_error = move_selected_path(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        Path::new("root.md"),
    )
    .unwrap_err();
    assert!(note_target_error.to_string().contains("workspace folder"));

    let outside_error = move_selected_path(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        Path::new("../outside"),
    )
    .unwrap_err();
    assert!(outside_error.to_string().contains("current workspace"));
}

#[test]
fn delete_selected_directory_closes_nested_tabs_and_selects_parent() {
    let target = PathBuf::from("workspace/notes");
    let outside_tab = tab("tab-b", "note-b", "workspace/archive/b.md");
    let storage = MockStorage {
        reload_result: Some((
            vec![directory_node(
                "workspace/archive",
                vec![note_node("workspace/archive/b.md", "note-b")],
            )],
            vec![recent_file("note-b", "archive/b.md")],
        )),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![
        directory_node(
            "workspace/notes",
            vec![note_node("workspace/notes/a.md", "note-a")],
        ),
        directory_node(
            "workspace/archive",
            vec![note_node("workspace/archive/b.md", "note-b")],
        ),
    ]);
    file_state.select_path(target.clone());
    let mut editor_tabs = EditorTabs::default();
    editor_tabs.open_tab(tab("tab-a", "note-a", "workspace/notes/a.md"));
    editor_tabs.open_tab(outside_tab.clone());
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "body".to_string(),
        DocumentStats::default(),
    );
    tab_contents.insert_tab(
        outside_tab.id.clone(),
        "archive".to_string(),
        DocumentStats::default(),
    );

    let deleted = delete_selected_path(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        false,
    )
    .unwrap();

    assert_eq!(deleted.deleted_path, target.clone());
    assert_eq!(deleted.orphaned_asset_count, 0);
    assert_eq!(
        storage.deleted_paths.lock().unwrap().clone(),
        vec![target.clone()]
    );
    assert!(editor_tabs.tab_by_id("tab-a").is_none());
    assert!(tab_contents.content_for_tab("tab-a").is_none());
    assert!(editor_tabs.tab_by_id("tab-b").is_some());
    assert_eq!(file_state.selected_path, Some(PathBuf::from("workspace")));
    assert_eq!(
        file_state.recent_files,
        vec![recent_file("note-b", "archive/b.md")]
    );
}

#[test]
fn delete_selected_path_keeps_orphan_assets_for_trash() {
    let target = PathBuf::from("workspace/notes/a.md");
    let orphan = PathBuf::from("workspace/assets/a.png");
    let storage = MockStorage {
        delete_preview: papyro_core::DeletePreview {
            orphaned_assets: vec![orphan.clone()],
        },
        reload_result: Some((Vec::new(), Vec::new())),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![directory_node(
        "workspace/notes",
        vec![note_node("workspace/notes/a.md", "note-a")],
    )]);
    file_state.select_path(target.clone());
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    let deleted = delete_selected_path(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        true,
    )
    .unwrap();

    assert_eq!(deleted.deleted_path, target.clone());
    assert_eq!(deleted.orphaned_asset_count, 0);
    assert_eq!(storage.deleted_paths.lock().unwrap().clone(), vec![target]);
    assert!(storage.deleted_extra_paths.lock().unwrap().is_empty());
}

#[test]
fn delete_selected_path_fails_without_selection() {
    let storage = MockStorage::default();
    let mut file_state = file_state_with_tree(Vec::new());
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    let error = delete_selected_path(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        false,
    )
    .unwrap_err();

    assert!(error.to_string().contains("No selected note or folder"));
}
