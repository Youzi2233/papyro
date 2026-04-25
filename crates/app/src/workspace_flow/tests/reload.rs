use super::super::support::*;
use super::super::*;
use papyro_core::models::{AppSettings, Theme, ViewMode, WorkspaceSettingsOverrides};
use papyro_core::storage::WorkspaceBootstrap;
use papyro_core::{EditorTabs, FileState, TabContentsMap};
use std::path::{Path, PathBuf};

#[test]
fn apply_workspace_bootstrap_resets_editor_state_and_formats_status() {
    let mut file_state = FileState::default();
    file_state.select_path(PathBuf::from("workspace/notes/a.md"));

    let applied = apply_workspace_bootstrap(WorkspaceBootstrap {
        file_state: file_state.clone(),
        status_message: "Loaded workspace".to_string(),
        error_message: Some("warning".to_string()),
        global_settings: AppSettings {
            theme: Theme::Light,
            font_size: 16,
            view_mode: ViewMode::Hybrid,
            ..AppSettings::default()
        },
        workspace_settings: WorkspaceSettingsOverrides {
            theme: Some(Theme::Dark),
            font_size: Some(18),
            view_mode: Some(ViewMode::Source),
            ..WorkspaceSettingsOverrides::default()
        },
        ..WorkspaceBootstrap::default()
    });

    assert_eq!(applied.file_state, file_state);
    assert_eq!(applied.editor_tabs, EditorTabs::default());
    assert_eq!(applied.tab_contents, TabContentsMap::default());
    assert_eq!(applied.ui_state.settings.theme, Theme::Dark);
    assert_eq!(applied.ui_state.settings.font_size, 18);
    assert_eq!(applied.ui_state.view_mode, ViewMode::Source);
    assert_eq!(applied.status_message, "Loaded workspace (warning)");
}

#[test]
fn merge_bootstrap_file_state_keeps_expanded_and_valid_selection() {
    let mut previous = file_state_with_tree(vec![directory_node(
        "workspace/notes",
        vec![note_node("workspace/notes/a.md", "note-a")],
    )]);
    previous
        .expanded_paths
        .insert(PathBuf::from("workspace/notes"));
    previous.select_path(PathBuf::from("workspace/notes/a.md"));

    let merged = super::super::reload::merge_bootstrap_file_state(
        &previous,
        FileState {
            current_workspace: Some(workspace()),
            file_tree: vec![directory_node(
                "workspace/notes",
                vec![note_node("workspace/notes/a.md", "note-a")],
            )],
            ..FileState::default()
        },
    );

    assert!(merged.expanded_paths.contains(Path::new("workspace/notes")));
    assert_eq!(
        merged.selected_path,
        Some(PathBuf::from("workspace/notes/a.md"))
    );
}

#[test]
fn reload_workspace_or_bootstrap_prefers_fast_reload_when_available() {
    let mut previous = file_state_with_tree(vec![directory_node(
        "workspace/notes",
        vec![note_node("workspace/notes/old.md", "note-old")],
    )]);
    previous.select_path(PathBuf::from("workspace/notes/old.md"));
    let storage = MockStorage {
        reload_result: Some((
            vec![directory_node(
                "workspace/notes",
                vec![note_node("workspace/notes/old.md", "note-old")],
            )],
            vec![recent_file("note-old", "notes/old.md")],
        )),
        ..MockStorage::default()
    };

    let outcome =
        reload_workspace_or_bootstrap(&storage, &previous, Path::new("workspace")).unwrap();

    assert_eq!(outcome.status_message, None);
    assert_eq!(
        outcome.file_state.selected_path,
        Some(PathBuf::from("workspace/notes/old.md"))
    );
    assert_eq!(
        outcome.file_state.recent_files,
        vec![recent_file("note-old", "notes/old.md")]
    );
}

#[test]
fn reload_workspace_or_bootstrap_falls_back_to_bootstrap_when_reload_is_missing() {
    let mut previous = file_state_with_tree(vec![directory_node(
        "workspace/notes",
        vec![note_node("workspace/notes/old.md", "note-old")],
    )]);
    previous
        .expanded_paths
        .insert(PathBuf::from("workspace/notes"));

    let storage = MockStorage {
        bootstrap_result: Some(WorkspaceBootstrap {
            file_state: FileState {
                current_workspace: Some(workspace()),
                file_tree: vec![directory_node(
                    "workspace/archive",
                    vec![note_node("workspace/archive/a.md", "note-a")],
                )],
                ..FileState::default()
            },
            status_message: "Reloaded workspace".to_string(),
            ..WorkspaceBootstrap::default()
        }),
        ..MockStorage::default()
    };

    let outcome =
        reload_workspace_or_bootstrap(&storage, &previous, Path::new("workspace")).unwrap();

    assert_eq!(
        outcome.status_message,
        Some("Reloaded workspace".to_string())
    );
    assert!(outcome
        .file_state
        .expanded_paths
        .contains(Path::new("workspace/notes")));
    assert_eq!(outcome.file_state.file_tree.len(), 1);
}
