use super::super::support::*;
use super::super::*;
use papyro_core::models::{
    AppSettings, DocumentStats, RecentFile, SaveStatus, Theme, ViewMode, Workspace,
    WorkspaceSettingsOverrides,
};
use papyro_core::storage::{OpenedNote, SavedAsNote, SavedNote, WorkspaceBootstrap};
use papyro_core::{EditorTabs, FileState, TabContentsMap};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

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
fn clean_open_tab_refresh_replaces_content_from_storage() {
    let note_path = PathBuf::from("workspace/notes/a.md");
    let opened_note = OpenedNote {
        tab: tab("tab-a", "note-a", "workspace/notes/a.md"),
        content: "# New".to_string(),
        recent_files: vec![recent_file("note-a", "notes/a.md")],
    };
    let storage = MockStorage {
        opened_notes: HashMap::from([(note_path.clone(), opened_note)]),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let mut editor_tabs = EditorTabs::default();
    editor_tabs.open_tab(tab("tab-a", "note-a", "workspace/notes/a.md"));
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "# Old".to_string(),
        DocumentStats::default(),
    );

    let snapshot = begin_clean_open_tab_refresh(&editor_tabs, &tab_contents, &note_path)
        .expect("clean tab can refresh");
    let (opened_note, stats) =
        read_clean_open_tab_refresh_from_storage(&storage, &file_state, &note_path, |content| {
            DocumentStats {
                char_count: content.len(),
                ..DocumentStats::default()
            }
        })
        .expect("refresh content loads");

    assert!(apply_clean_open_tab_refresh(
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        &snapshot,
        opened_note,
        stats,
    ));

    assert_eq!(tab_contents.content_for_tab("tab-a"), Some("# New"));
    assert_eq!(
        tab_contents
            .stats_snapshot_for_tab("tab-a")
            .map(|stats| stats.stats),
        Some(DocumentStats {
            char_count: 5,
            ..DocumentStats::default()
        })
    );
    assert_eq!(file_state.selected_path, Some(note_path));
    assert_eq!(
        file_state.recent_files,
        vec![recent_file("note-a", "notes/a.md")]
    );
    assert_eq!(
        editor_tabs
            .tab_by_id("tab-a")
            .map(|tab| (tab.is_dirty, tab.save_status.clone())),
        Some((false, SaveStatus::Saved))
    );
}

#[test]
fn clean_open_tab_refresh_does_not_overwrite_new_dirty_content() {
    let note_path = PathBuf::from("workspace/notes/a.md");
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let mut editor_tabs = EditorTabs::default();
    editor_tabs.open_tab(tab("tab-a", "note-a", "workspace/notes/a.md"));
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "# Old".to_string(),
        DocumentStats::default(),
    );
    let snapshot = begin_clean_open_tab_refresh(&editor_tabs, &tab_contents, &note_path)
        .expect("clean tab can refresh");
    tab_contents.update_tab_content("tab-a", "# User edit".to_string());
    editor_tabs.mark_tab_dirty("tab-a");
    let opened_note = OpenedNote {
        tab: tab("tab-a", "note-a", "workspace/notes/a.md"),
        content: "# External".to_string(),
        recent_files: vec![recent_file("note-a", "notes/a.md")],
    };

    assert!(!apply_clean_open_tab_refresh(
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        &snapshot,
        opened_note,
        DocumentStats::default(),
    ));

    assert_eq!(tab_contents.content_for_tab("tab-a"), Some("# User edit"));
    assert_eq!(
        editor_tabs
            .tab_by_id("tab-a")
            .map(|tab| (tab.is_dirty, tab.save_status.clone())),
        Some((true, SaveStatus::Dirty))
    );
}

#[test]
fn conflict_reload_replaces_local_content_from_storage() {
    let note_path = PathBuf::from("workspace/notes/a.md");
    let opened_note = OpenedNote {
        tab: tab("tab-a", "note-a", "workspace/notes/a.md"),
        content: "# Disk\n\nexternal".to_string(),
        recent_files: vec![recent_file("note-a", "notes/a.md")],
    };
    let storage = MockStorage {
        opened_notes: HashMap::from([(note_path.clone(), opened_note)]),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let mut editor_tabs = EditorTabs::default();
    let mut local_tab = tab("tab-a", "note-a", "workspace/notes/a.md");
    local_tab.is_dirty = true;
    local_tab.save_status = SaveStatus::Conflict;
    local_tab.disk_content_hash = Some(7);
    editor_tabs.open_tab(local_tab);
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "# Local\n\nmine".to_string(),
        DocumentStats::default(),
    );
    tab_contents.update_tab_content("tab-a", "# Local\n\nedited".to_string());

    let snapshot =
        begin_conflict_reload_tab(&editor_tabs, &tab_contents, "tab-a").expect("can reload");
    let (opened_note, stats) =
        read_conflict_reload_from_storage(&storage, &file_state, &note_path, |content| {
            DocumentStats {
                char_count: content.len(),
                ..DocumentStats::default()
            }
        })
        .expect("reload loads");

    assert!(apply_conflict_reload(
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        &snapshot,
        opened_note,
        stats,
    ));

    assert_eq!(
        tab_contents.content_for_tab("tab-a"),
        Some("# Disk\n\nexternal")
    );
    assert_eq!(
        tab_contents
            .stats_snapshot_for_tab("tab-a")
            .map(|stats| stats.stats.char_count),
        Some("# Disk\n\nexternal".len())
    );
    assert_eq!(
        editor_tabs.tab_by_id("tab-a").map(|tab| (
            tab.is_dirty,
            tab.save_status.clone(),
            tab.title.clone()
        )),
        Some((false, SaveStatus::Saved, "tab-a".to_string()))
    );
    assert_eq!(file_state.selected_path, Some(note_path));
    assert_eq!(
        file_state.recent_files,
        vec![recent_file("note-a", "notes/a.md")]
    );
}

#[test]
fn conflict_reload_does_not_overwrite_newer_local_input() {
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let mut editor_tabs = EditorTabs::default();
    let mut local_tab = tab("tab-a", "note-a", "workspace/notes/a.md");
    local_tab.is_dirty = true;
    local_tab.save_status = SaveStatus::Conflict;
    editor_tabs.open_tab(local_tab);
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "# Local".to_string(),
        DocumentStats::default(),
    );
    let snapshot =
        begin_conflict_reload_tab(&editor_tabs, &tab_contents, "tab-a").expect("can reload");
    tab_contents.update_tab_content("tab-a", "# Local newer".to_string());
    let opened_note = OpenedNote {
        tab: tab("tab-a", "note-a", "workspace/notes/a.md"),
        content: "# Disk".to_string(),
        recent_files: vec![recent_file("note-a", "notes/a.md")],
    };

    assert!(!apply_conflict_reload(
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        &snapshot,
        opened_note,
        DocumentStats::default(),
    ));

    assert_eq!(tab_contents.content_for_tab("tab-a"), Some("# Local newer"));
    assert_eq!(
        editor_tabs
            .tab_by_id("tab-a")
            .map(|tab| (tab.is_dirty, tab.save_status.clone())),
        Some((true, SaveStatus::Conflict))
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
    assert_eq!(editor_tabs.tabs.len(), 2);
    assert!(editor_tabs.tab_by_id("old-tab").is_some());
    assert_eq!(editor_tabs.active_tab_id.as_deref(), Some("tab-a"));
    assert_eq!(tab_contents.content_for_tab("tab-a"), Some("# Archive"));
    assert_eq!(tab_contents.content_for_tab("old-tab"), Some("old"));
    assert_eq!(outcome.watch_path, Some(PathBuf::from("archive")));
    assert_eq!(ui_state.settings.theme, Theme::Dark);
    assert_eq!(ui_state.settings.font_size, 19);
    assert_eq!(ui_state.view_mode, ViewMode::Preview);
}

#[test]
fn switch_workspace_context_from_storage_follows_active_tab_workspace() {
    let archive_workspace = workspace_at("archive", "Archive", "archive");
    let note_path = PathBuf::from("workspace/notes/a.md");
    let storage = MockStorage {
        bootstrap_result: Some(WorkspaceBootstrap {
            file_state: FileState {
                workspaces: vec![workspace()],
                current_workspace: Some(workspace()),
                file_tree: vec![note_node("workspace/notes/a.md", "note-a")],
                ..FileState::default()
            },
            workspace_root: Some(PathBuf::from("workspace")),
            status_message: "Loaded workspace".to_string(),
            global_settings: AppSettings {
                theme: Theme::Light,
                font_size: 16,
                view_mode: ViewMode::Hybrid,
                ..AppSettings::default()
            },
            workspace_settings: WorkspaceSettingsOverrides {
                theme: Some(Theme::GitHubDark),
                view_mode: Some(ViewMode::Preview),
                ..WorkspaceSettingsOverrides::default()
            },
            ..WorkspaceBootstrap::default()
        }),
        ..MockStorage::default()
    };
    let mut file_state = FileState {
        workspaces: vec![archive_workspace.clone(), workspace()],
        current_workspace: Some(archive_workspace.clone()),
        file_tree: vec![note_node("archive/old.md", "old-note")],
        ..FileState::default()
    };

    let outcome =
        switch_workspace_context_from_storage(&storage, &mut file_state, &note_path).unwrap();

    assert_eq!(
        file_state
            .current_workspace
            .as_ref()
            .map(|workspace| workspace.path.clone()),
        Some(PathBuf::from("workspace"))
    );
    assert_eq!(file_state.selected_path, Some(note_path));
    assert!(file_state
        .node_for_path(PathBuf::from("workspace/notes/a.md").as_path())
        .is_some());
    assert!(file_state
        .workspaces
        .iter()
        .any(|workspace| workspace.path == archive_workspace.path));
    assert_eq!(outcome.watch_path, Some(PathBuf::from("workspace")));
    let ui_state = outcome.ui_state.expect("workspace settings are applied");
    assert_eq!(ui_state.settings.theme, Theme::GitHubDark);
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
    assert_eq!(file_state.recent_files.len(), 1);
    assert_eq!(file_state.recent_files[0].note_id, "note-loose");
    assert_eq!(
        file_state.recent_files[0].relative_path,
        PathBuf::from("loose.md")
    );
    assert_eq!(
        file_state.recent_files[0].workspace_path,
        PathBuf::from("external")
    );
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
fn open_markdown_target_failure_preserves_existing_tabs() {
    let archive_workspace = Workspace {
        id: "archive".to_string(),
        name: "Archive".to_string(),
        path: PathBuf::from("archive"),
        created_at: 0,
        last_opened: Some(1),
        sort_order: 0,
    };
    let note_path = PathBuf::from("archive/notes/missing.md");
    let storage = MockStorage {
        bootstrap_result: Some(WorkspaceBootstrap {
            file_state: FileState {
                workspaces: vec![workspace(), archive_workspace.clone()],
                current_workspace: Some(archive_workspace.clone()),
                ..FileState::default()
            },
            status_message: "Loaded archive".to_string(),
            ..WorkspaceBootstrap::default()
        }),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/old.md", "old-note")]);
    file_state.workspaces = vec![workspace(), archive_workspace.clone()];
    file_state.select_path(PathBuf::from("workspace/old.md"));
    file_state.recent_files = vec![recent_file("old-note", "old.md")];
    let mut editor_tabs = EditorTabs::default();
    editor_tabs.open_tab(tab("old-tab", "old-note", "workspace/old.md"));
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "old-tab".to_string(),
        "old content".to_string(),
        DocumentStats::default(),
    );

    let error = open_markdown_target_from_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &mut tab_contents,
        note_path,
        |_| DocumentStats::default(),
    )
    .unwrap_err();

    assert!(error.to_string().contains("Missing opened note"));
    assert_eq!(
        file_state
            .current_workspace
            .as_ref()
            .map(|workspace| workspace.path.clone()),
        Some(PathBuf::from("workspace"))
    );
    assert_eq!(
        file_state.selected_path,
        Some(PathBuf::from("workspace/old.md"))
    );
    assert_eq!(
        file_state.recent_files,
        vec![recent_file("old-note", "old.md")]
    );
    assert_eq!(editor_tabs.active_tab_id.as_deref(), Some("old-tab"));
    assert_eq!(editor_tabs.tabs.len(), 1);
    assert_eq!(tab_contents.content_for_tab("old-tab"), Some("old content"));
}

#[test]
fn save_tab_flow_marks_tab_clean_and_refreshes_recent_files() {
    let storage = MockStorage {
        save_result: Some(SavedNote {
            tab_id: "tab-a".to_string(),
            title: "Saved Title".to_string(),
            disk_content_hash: Some(42),
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
fn save_tab_flow_marks_conflict_when_storage_reports_conflict() {
    let storage = MockStorage {
        save_conflict: true,
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let mut editor_tabs = EditorTabs::default();
    let mut tab = tab("tab-a", "note-a", "workspace/notes/a.md");
    tab.is_dirty = true;
    tab.save_status = SaveStatus::Dirty;
    tab.disk_content_hash = Some(7);
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

    assert!(error.to_string().contains("Save conflict"));
    assert_eq!(
        editor_tabs
            .tab_by_id("tab-a")
            .map(|tab| (tab.is_dirty, tab.save_status.clone())),
        Some((true, SaveStatus::Conflict))
    );
    assert_eq!(tab_contents.content_for_tab("tab-a"), Some("body updated"));
}

#[test]
fn save_conflict_across_document_windows_keeps_states_isolated() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let workspace_root = temp.path().join("workspace");
    std::fs::create_dir_all(&workspace_root)?;
    let note_path = workspace_root.join("shared.md");
    std::fs::write(&note_path, "# Shared\n\nold")?;
    let storage = papyro_storage::SqliteStorage::from_db_path(temp.path().join("papyro.db"))?;
    let workspace = storage.initialize_workspace(&workspace_root)?.workspace;

    let (mut first_file_state, mut first_tabs, mut first_contents) =
        open_storage_backed_window(&storage, &workspace, &note_path)?;
    let (mut second_file_state, mut second_tabs, mut second_contents) =
        open_storage_backed_window(&storage, &workspace, &note_path)?;
    let first_tab_id = first_tabs.active_tab_id.clone().expect("first tab");
    let second_tab_id = second_tabs.active_tab_id.clone().expect("second tab");
    let first_opened_hash = first_tabs
        .tab_by_id(&first_tab_id)
        .and_then(|tab| tab.disk_content_hash);

    first_contents.update_tab_content(&first_tab_id, "# First\n\nsaved".to_string());
    first_tabs.mark_tab_dirty(&first_tab_id);
    save_tab_to_storage(
        &storage,
        &mut first_file_state,
        &mut first_tabs,
        &first_contents,
        &first_tab_id,
    )?;

    second_contents.update_tab_content(&second_tab_id, "# Second\n\nlocal".to_string());
    second_tabs.mark_tab_dirty(&second_tab_id);
    let error = save_tab_to_storage(
        &storage,
        &mut second_file_state,
        &mut second_tabs,
        &second_contents,
        &second_tab_id,
    )
    .unwrap_err();

    assert!(error.downcast_ref::<papyro_core::SaveConflict>().is_some());
    assert_eq!(std::fs::read_to_string(&note_path)?, "# First\n\nsaved");
    assert_eq!(
        first_tabs.tab_by_id(&first_tab_id).map(|tab| (
            tab.is_dirty,
            tab.save_status.clone(),
            tab.title.clone()
        )),
        Some((false, SaveStatus::Saved, "First".to_string()))
    );
    assert_ne!(
        first_tabs
            .tab_by_id(&first_tab_id)
            .and_then(|tab| tab.disk_content_hash),
        first_opened_hash
    );
    assert_eq!(
        first_contents.content_for_tab(&first_tab_id),
        Some("# First\n\nsaved")
    );
    assert_eq!(
        second_tabs
            .tab_by_id(&second_tab_id)
            .map(|tab| (tab.is_dirty, tab.save_status.clone())),
        Some((true, SaveStatus::Conflict))
    );
    assert_eq!(
        second_contents.content_for_tab(&second_tab_id),
        Some("# Second\n\nlocal")
    );

    Ok(())
}

#[test]
fn save_tab_flow_uses_tab_workspace_after_external_workspace_switch() {
    let storage = MockStorage {
        save_result: Some(SavedNote {
            tab_id: "tab-a".to_string(),
            title: "Saved".to_string(),
            disk_content_hash: Some(99),
        }),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    file_state.workspaces = vec![workspace()];
    file_state.current_workspace = Some(workspace_at("external", "External", "external"));
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
        storage.save_workspace_paths.lock().unwrap().clone(),
        vec![PathBuf::from("workspace")]
    );
    assert_eq!(
        editor_tabs.tab_by_id("tab-a").map(|tab| (
            tab.is_dirty,
            tab.save_status.clone(),
            tab.disk_content_hash
        )),
        Some((false, SaveStatus::Saved, Some(99)))
    );
}

fn open_storage_backed_window(
    storage: &papyro_storage::SqliteStorage,
    workspace: &Workspace,
    note_path: &Path,
) -> anyhow::Result<(FileState, EditorTabs, TabContentsMap)> {
    let opened = storage.open_note(workspace, note_path)?;
    let mut editor_tabs = EditorTabs::default();
    let tab_id = opened.tab.id.clone();
    editor_tabs.open_tab(opened.tab);
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(tab_id, opened.content, DocumentStats::default());
    let file_state = FileState {
        current_workspace: Some(workspace.clone()),
        workspaces: vec![workspace.clone()],
        ..FileState::default()
    };

    Ok((file_state, editor_tabs, tab_contents))
}

#[test]
fn overwrite_tab_flow_saves_conflicted_content_explicitly() {
    let storage = MockStorage {
        save_result: Some(SavedNote {
            tab_id: "tab-a".to_string(),
            title: "Local Title".to_string(),
            disk_content_hash: Some(99),
        }),
        recent_files: vec![recent_file("note-a", "notes/a.md")],
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let mut editor_tabs = EditorTabs::default();
    let mut tab = tab("tab-a", "note-a", "workspace/notes/a.md");
    tab.is_dirty = true;
    tab.save_status = SaveStatus::Conflict;
    tab.disk_content_hash = Some(7);
    editor_tabs.open_tab(tab);
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "body".to_string(),
        DocumentStats::default(),
    );
    tab_contents.update_tab_content("tab-a", "# Local Title\n\nbody".to_string());

    overwrite_tab_to_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        "tab-a",
    )
    .unwrap();

    assert_eq!(
        storage.overwritten_payloads.lock().unwrap().clone(),
        vec![("tab-a".to_string(), "# Local Title\n\nbody".to_string())]
    );
    assert!(storage.saved_payloads.lock().unwrap().is_empty());
    assert_eq!(
        editor_tabs.tab_by_id("tab-a").map(|tab| (
            tab.is_dirty,
            tab.save_status.clone(),
            tab.title.clone(),
            tab.disk_content_hash,
        )),
        Some((
            false,
            SaveStatus::Saved,
            "Local Title".to_string(),
            Some(99)
        ))
    );
    assert_eq!(
        file_state.recent_files,
        vec![recent_file("note-a", "notes/a.md")]
    );
}

#[test]
fn overwrite_tab_flow_uses_tab_workspace_after_external_workspace_switch() {
    let storage = MockStorage {
        save_result: Some(SavedNote {
            tab_id: "tab-a".to_string(),
            title: "Saved".to_string(),
            disk_content_hash: Some(99),
        }),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    file_state.workspaces = vec![workspace()];
    file_state.current_workspace = Some(workspace_at("external", "External", "external"));
    let mut editor_tabs = EditorTabs::default();
    let mut tab = tab("tab-a", "note-a", "workspace/notes/a.md");
    tab.is_dirty = true;
    tab.save_status = SaveStatus::Conflict;
    editor_tabs.open_tab(tab);
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "body".to_string(),
        DocumentStats::default(),
    );
    tab_contents.update_tab_content("tab-a", "body updated".to_string());

    overwrite_tab_to_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        "tab-a",
    )
    .unwrap();

    assert_eq!(
        storage.overwrite_workspace_paths.lock().unwrap().clone(),
        vec![PathBuf::from("workspace")]
    );
}

#[test]
fn overwrite_tab_flow_requires_conflict_state() {
    let storage = MockStorage {
        save_result: Some(SavedNote {
            tab_id: "tab-a".to_string(),
            title: "Saved".to_string(),
            disk_content_hash: Some(99),
        }),
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

    let error = overwrite_tab_to_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        "tab-a",
    )
    .unwrap_err();

    assert!(error.to_string().contains("not in a save conflict"));
    assert!(storage.overwritten_payloads.lock().unwrap().is_empty());
    assert_eq!(
        editor_tabs
            .tab_by_id("tab-a")
            .map(|tab| (tab.is_dirty, tab.save_status.clone())),
        Some((true, SaveStatus::Dirty))
    );
}

#[test]
fn conflict_reload_reads_from_tab_workspace_after_external_workspace_switch() {
    let note_path = PathBuf::from("workspace/notes/a.md");
    let storage = MockStorage {
        opened_notes: HashMap::from([(
            note_path.clone(),
            OpenedNote {
                tab: tab("tab-a", "note-a", "workspace/notes/a.md"),
                content: "# Disk".to_string(),
                recent_files: vec![recent_file("note-a", "notes/a.md")],
            },
        )]),
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    file_state.workspaces = vec![workspace()];
    file_state.current_workspace = Some(workspace_at("external", "External", "external"));

    let (_opened_note, stats) =
        read_conflict_reload_from_storage(&storage, &file_state, &note_path, |content| {
            DocumentStats {
                char_count: content.len(),
                ..DocumentStats::default()
            }
        })
        .unwrap();

    assert_eq!(stats.char_count, "# Disk".len());
    assert_eq!(
        storage.opened_workspace_paths.lock().unwrap().clone(),
        vec![PathBuf::from("workspace")]
    );
}

#[test]
fn save_as_tab_flow_rebinds_conflicted_tab_to_target_path() {
    let target_path = PathBuf::from("workspace/notes/copy.md");
    let storage = MockStorage {
        save_as_result: Some(SavedAsNote {
            tab_id: "tab-a".to_string(),
            note_id: "note-copy".to_string(),
            title: "Copy".to_string(),
            path: target_path.clone(),
            disk_content_hash: Some(101),
        }),
        recent_files: vec![recent_file("note-copy", "notes/copy.md")],
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let mut editor_tabs = EditorTabs::default();
    let mut tab = tab("tab-a", "note-a", "workspace/notes/a.md");
    tab.is_dirty = true;
    tab.save_status = SaveStatus::Conflict;
    tab.disk_content_hash = Some(7);
    editor_tabs.open_tab(tab);
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "# Copy\n\nbody".to_string(),
        DocumentStats::default(),
    );
    tab_contents.update_tab_content("tab-a", "# Copy\n\nlocal".to_string());

    save_as_tab_to_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        "tab-a",
        target_path.clone(),
    )
    .unwrap();

    assert_eq!(
        storage.saved_as_payloads.lock().unwrap().clone(),
        vec![(
            "tab-a".to_string(),
            target_path.clone(),
            "# Copy\n\nlocal".to_string()
        )]
    );
    assert_eq!(
        editor_tabs.tab_by_id("tab-a").map(|tab| (
            tab.note_id.clone(),
            tab.path.clone(),
            tab.is_dirty,
            tab.save_status.clone(),
            tab.title.clone(),
            tab.disk_content_hash,
        )),
        Some((
            "note-copy".to_string(),
            target_path.clone(),
            false,
            SaveStatus::Saved,
            "Copy".to_string(),
            Some(101)
        ))
    );
    assert_eq!(file_state.selected_path, Some(target_path));
    assert_eq!(
        file_state.recent_files,
        vec![recent_file("note-copy", "notes/copy.md")]
    );
}

#[test]
fn save_as_tab_flow_uses_tab_workspace_after_external_workspace_switch() {
    let target_path = PathBuf::from("workspace/notes/copy.md");
    let storage = MockStorage {
        save_as_result: Some(SavedAsNote {
            tab_id: "tab-a".to_string(),
            note_id: "note-copy".to_string(),
            title: "Copy".to_string(),
            path: target_path.clone(),
            disk_content_hash: Some(101),
        }),
        recent_files: vec![recent_file("note-copy", "notes/copy.md")],
        ..MockStorage::default()
    };
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    file_state.workspaces = vec![workspace()];
    file_state.current_workspace = Some(workspace_at("external", "External", "external"));
    let mut editor_tabs = EditorTabs::default();
    let mut tab = tab("tab-a", "note-a", "workspace/notes/a.md");
    tab.is_dirty = true;
    tab.save_status = SaveStatus::Conflict;
    editor_tabs.open_tab(tab);
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "# Copy".to_string(),
        DocumentStats::default(),
    );
    tab_contents.update_tab_content("tab-a", "# Copy\n\nlocal".to_string());

    save_as_tab_to_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        "tab-a",
        target_path.clone(),
    )
    .unwrap();

    assert_eq!(
        storage.save_as_workspace_paths.lock().unwrap().clone(),
        vec![PathBuf::from("workspace")]
    );
    assert_eq!(file_state.selected_path, Some(target_path));
}

#[test]
fn save_as_tab_flow_rejects_non_conflict_and_invalid_targets() {
    let mut file_state = file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
    let storage = MockStorage {
        save_as_result: Some(SavedAsNote {
            tab_id: "tab-a".to_string(),
            note_id: "note-copy".to_string(),
            title: "Copy".to_string(),
            path: PathBuf::from("workspace/notes/copy.md"),
            disk_content_hash: Some(101),
        }),
        ..MockStorage::default()
    };
    let mut editor_tabs = EditorTabs::default();
    let mut tab = tab("tab-a", "note-a", "workspace/notes/a.md");
    tab.is_dirty = true;
    tab.save_status = SaveStatus::Dirty;
    editor_tabs.open_tab(tab);
    let mut tab_contents = TabContentsMap::default();
    tab_contents.insert_tab(
        "tab-a".to_string(),
        "# Copy".to_string(),
        DocumentStats::default(),
    );

    let error = save_as_tab_to_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        "tab-a",
        PathBuf::from("workspace/notes/copy.md"),
    )
    .unwrap_err();
    assert!(error.to_string().contains("not in a save conflict"));

    editor_tabs.mark_tab_conflict("tab-a");
    let error = save_as_tab_to_storage(
        &storage,
        &mut file_state,
        &mut editor_tabs,
        &tab_contents,
        "tab-a",
        PathBuf::from("outside/copy.md"),
    )
    .unwrap_err();
    assert!(error.to_string().contains("inside the note's workspace"));
    assert!(storage.saved_as_payloads.lock().unwrap().is_empty());
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
