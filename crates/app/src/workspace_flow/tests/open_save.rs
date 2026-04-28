use super::super::support::*;
use super::super::*;
use papyro_core::models::{
    AppSettings, DocumentStats, RecentFile, SaveStatus, Theme, ViewMode, Workspace,
    WorkspaceSettingsOverrides,
};
use papyro_core::storage::{OpenedNote, SavedNote, WorkspaceBootstrap};
use papyro_core::{EditorTabs, FileState, TabContentsMap};
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
fn open_markdown_flow_uses_path_target_and_updates_state() {
    let note_path = PathBuf::from("workspace/notes/path-target.md");
    let opened_note = OpenedNote {
        tab: tab("tab-path", "note-path", "workspace/notes/path-target.md"),
        content: "# Path Target".to_string(),
        recent_files: vec![recent_file("note-path", "notes/path-target.md")],
    };
    let storage = MockStorage {
        opened_notes: HashMap::from([(note_path.clone(), opened_note)]),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node(
        "workspace/notes/path-target.md",
        "note-path",
    )]);
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    open_markdown_from_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        note_path.clone(),
        |content| DocumentStats {
            word_count: content.split_whitespace().count(),
            ..DocumentStats::default()
        },
    )
    .unwrap();

    assert_eq!(file_state.selected_path, Some(note_path));
    assert_eq!(editor_tabs.active_tab_id.as_deref(), Some("tab-path"));
    assert_eq!(
        tab_contents.content_for_tab("tab-path"),
        Some("# Path Target")
    );
    assert_eq!(
        tab_contents.active_stats(editor_tabs.active_tab_id.as_deref()),
        DocumentStats {
            word_count: 3,
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
fn open_markdown_target_flow_bootstraps_target_workspace_before_opening_note() {
    let archive_workspace = Workspace {
        id: "archive".to_string(),
        name: "Archive".to_string(),
        path: PathBuf::from("archive"),
        created_at: 0,
        last_opened: Some(1),
        sort_order: 0,
    };
    let note_path = PathBuf::from("archive/notes/a.md");
    let opened_note = OpenedNote {
        tab: tab("tab-a", "note-a", "archive/notes/a.md"),
        content: "# Archive".to_string(),
        recent_files: vec![RecentFile {
            note_id: "note-a".to_string(),
            title: "Archive".to_string(),
            relative_path: PathBuf::from("notes/a.md"),
            workspace_id: archive_workspace.id.clone(),
            workspace_name: archive_workspace.name.clone(),
            workspace_path: archive_workspace.path.clone(),
            opened_at: 1,
        }],
    };
    let storage = MockStorage {
        opened_notes: HashMap::from([(note_path.clone(), opened_note)]),
        bootstrap_result: Some(WorkspaceBootstrap {
            file_state: FileState {
                workspaces: vec![workspace(), archive_workspace.clone()],
                current_workspace: Some(archive_workspace.clone()),
                ..FileState::default()
            },
            status_message: "Loaded workspace".to_string(),
            global_settings: AppSettings {
                theme: Theme::Light,
                font_size: 16,
                view_mode: ViewMode::Hybrid,
                ..AppSettings::default()
            },
            workspace_settings: WorkspaceSettingsOverrides {
                theme: Some(Theme::Dark),
                font_size: Some(19),
                view_mode: Some(ViewMode::Preview),
                ..WorkspaceSettingsOverrides::default()
            },
            ..WorkspaceBootstrap::default()
        }),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(Vec::new());
    file_state.recent_files = vec![RecentFile {
        note_id: "note-a".to_string(),
        title: "Archive".to_string(),
        relative_path: PathBuf::from("notes/a.md"),
        workspace_id: archive_workspace.id.clone(),
        workspace_name: archive_workspace.name.clone(),
        workspace_path: archive_workspace.path.clone(),
        opened_at: 1,
    }];
    let mut editor_tabs = EditorTabs::default();
    editor_tabs.open_tab(tab("old-tab", "old-note", "workspace/old.md"));
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "old-tab".to_string(),
        "old".to_string(),
        DocumentStats::default(),
    );

    let outcome = open_markdown_target_from_storage(
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
    let ui_state = outcome
        .ui_state
        .expect("cross-workspace open applies settings");

    assert_eq!(
        file_state
            .current_workspace
            .as_ref()
            .map(|workspace| workspace.path.clone()),
        Some(PathBuf::from("archive"))
    );
    assert_eq!(file_state.selected_path, Some(note_path));
    assert_eq!(editor_tabs.tabs.len(), 1);
    assert_eq!(editor_tabs.active_tab_id.as_deref(), Some("tab-a"));
    assert_eq!(tab_contents.content_for_tab("tab-a"), Some("# Archive"));
    assert_eq!(tab_contents.content_for_tab("old-tab"), None);
    assert_eq!(outcome.watch_path, Some(PathBuf::from("archive")));
    assert_eq!(ui_state.settings.theme, Theme::Dark);
    assert_eq!(ui_state.settings.font_size, 19);
    assert_eq!(ui_state.view_mode, ViewMode::Preview);
}

#[test]
fn open_markdown_target_flow_bootstraps_external_file_parent_workspace() {
    let note_path = PathBuf::from("external/loose.md");
    let external_workspace = Workspace {
        id: "external-workspace".to_string(),
        name: "external".to_string(),
        path: PathBuf::from("external"),
        created_at: 0,
        last_opened: Some(1),
        sort_order: 0,
    };
    let opened_note = OpenedNote {
        tab: tab("tab-loose", "note-loose", "external/loose.md"),
        content: "# Loose".to_string(),
        recent_files: vec![RecentFile {
            note_id: "note-loose".to_string(),
            title: "Loose".to_string(),
            relative_path: PathBuf::from("loose.md"),
            workspace_id: external_workspace.id.clone(),
            workspace_name: external_workspace.name.clone(),
            workspace_path: external_workspace.path.clone(),
            opened_at: 1,
        }],
    };
    let storage = MockStorage {
        opened_notes: HashMap::from([(note_path.clone(), opened_note)]),
        bootstrap_result: Some(WorkspaceBootstrap {
            file_state: FileState {
                workspaces: vec![workspace(), external_workspace.clone()],
                current_workspace: Some(external_workspace.clone()),
                ..FileState::default()
            },
            status_message: "Loaded external workspace".to_string(),
            ..WorkspaceBootstrap::default()
        }),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(Vec::new());
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    let outcome = open_markdown_target_from_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        note_path.clone(),
        |_| DocumentStats::default(),
    )
    .unwrap();

    assert_eq!(
        file_state
            .current_workspace
            .as_ref()
            .map(|workspace| workspace.path.clone()),
        Some(PathBuf::from("external"))
    );
    assert_eq!(file_state.selected_path, Some(note_path));
    assert_eq!(editor_tabs.active_tab_id.as_deref(), Some("tab-loose"));
    assert_eq!(tab_contents.content_for_tab("tab-loose"), Some("# Loose"));
    assert_eq!(outcome.watch_path, Some(PathBuf::from("external")));
}

#[test]
fn open_markdown_target_flow_rejects_non_markdown_paths() {
    let storage = MockStorage::default();
    let mut file_state = file_state_with_tree(Vec::new());
    let mut editor_tabs = EditorTabs::default();
    let mut tab_contents = TabContentsMap::default();

    let error = open_markdown_target_from_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        PathBuf::from("workspace/image.png"),
        |_| DocumentStats::default(),
    )
    .unwrap_err();

    assert!(error.to_string().contains("Only Markdown files"));
    assert!(editor_tabs.tabs.is_empty());
    assert_eq!(file_state.selected_path, None);
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
