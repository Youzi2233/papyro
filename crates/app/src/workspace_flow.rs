use anyhow::{anyhow, Result};
use papyro_core::models::{DocumentStats, FileNode, FileNodeKind, Workspace};
use papyro_core::storage::{NoteStorage, WorkspaceBootstrap};
use papyro_core::{
    close_tabs_under_path, mark_tab_saved, open_note, EditorTabs, FileState, TabContentsMap,
};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AppliedBootstrap {
    pub file_state: FileState,
    pub editor_tabs: EditorTabs,
    pub tab_contents: TabContentsMap,
    pub status_message: String,
}

pub(crate) fn create_note_in_storage<S>(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    name: &str,
    summarize: S,
) -> Result<PathBuf>
where
    S: FnOnce(&str) -> DocumentStats,
{
    let workspace = current_workspace(file_state)?;
    let parent = selected_directory_or_workspace(file_state, &workspace.path);
    let note_name = normalized_name(name, "Untitled");
    let path = storage.create_note(&parent, &note_name)?;

    reload_current_workspace_tree(storage, file_state)?;
    open_note_from_storage(
        storage,
        file_state,
        editor_tabs,
        tab_contents,
        path.clone(),
        summarize,
    )?;

    Ok(path)
}

pub(crate) fn create_folder_in_storage(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    name: &str,
) -> Result<PathBuf> {
    let workspace = current_workspace(file_state)?;
    let parent = selected_directory_or_workspace(file_state, &workspace.path);
    let folder_name = normalized_name(name, "New Folder");
    let path = storage.create_folder(&parent, &folder_name)?;

    reload_current_workspace_tree(storage, file_state)?;
    file_state.select_path(path.clone());

    Ok(path)
}

pub(crate) fn open_note_from_storage<S>(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    path: PathBuf,
    summarize: S,
) -> Result<()>
where
    S: FnOnce(&str) -> DocumentStats,
{
    let workspace = current_workspace(file_state)?;
    let opened_note = storage.open_note(&workspace, &path)?;
    let selected_path = opened_note.tab.path.clone();
    let stats = summarize(&opened_note.content);

    open_note(editor_tabs, tab_contents, opened_note.clone(), stats);
    file_state.recent_files = opened_note.recent_files;
    file_state.select_path(selected_path);

    Ok(())
}

pub(crate) fn save_tab_to_storage(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &TabContentsMap,
    tab_id: &str,
) -> Result<()> {
    let workspace = current_workspace(file_state)?;
    let tab = editor_tabs
        .tab_by_id(tab_id)
        .cloned()
        .ok_or_else(|| anyhow!("Tab not found: {tab_id}"))?;
    let content = tab_contents.content_for_tab(tab_id).unwrap_or_default();

    let saved_note = storage.save_note(&workspace, &tab, content)?;
    mark_tab_saved(editor_tabs, saved_note);
    file_state.recent_files = storage.list_recent(10)?;

    Ok(())
}

pub(crate) fn rename_selected_path(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    new_name: &str,
) -> Result<PathBuf> {
    let workspace = current_workspace(file_state)?;
    let selected_node = file_state
        .selected_node()
        .ok_or_else(|| anyhow!("No selected note or folder"))?;
    let old_path = selected_node.path.clone();
    let name = normalized_name(new_name, &selected_node.name);
    let new_path = storage.rename_path(&workspace, &old_path, &name)?;

    match selected_node.kind {
        FileNodeKind::Directory { .. } => {
            close_tabs_under_path(editor_tabs, tab_contents, &old_path);
        }
        FileNodeKind::Note { .. } => {
            editor_tabs.update_tab_path(&old_path, new_path.clone());
        }
    }

    reload_current_workspace_tree(storage, file_state)?;
    file_state.select_path(new_path.clone());

    Ok(new_path)
}

pub(crate) fn delete_selected_path(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
) -> Result<PathBuf> {
    let _workspace = current_workspace(file_state)?;
    let selected_node = file_state
        .selected_node()
        .ok_or_else(|| anyhow!("No selected note or folder"))?;
    let target = selected_node.path.clone();

    storage.delete_path(&target)?;
    close_tabs_under_path(editor_tabs, tab_contents, &target);
    reload_current_workspace_tree(storage, file_state)?;
    file_state.selected_path = target.parent().map(Path::to_path_buf);

    Ok(target)
}

pub(crate) fn reload_current_workspace_tree(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
) -> Result<()> {
    let workspace = current_workspace(file_state)?;
    let previous_selected = file_state.selected_path.clone();
    let (file_tree, recent_files) = storage.reload_workspace_tree(&workspace)?;

    file_state.file_tree = file_tree;
    file_state.recent_files = recent_files;

    if let Some(selected_path) = previous_selected {
        file_state.selected_path =
            tree_contains_path(&file_state.file_tree, &selected_path).then_some(selected_path);
    }

    Ok(())
}

pub(crate) fn apply_workspace_bootstrap(bootstrap: WorkspaceBootstrap) -> AppliedBootstrap {
    let detail = bootstrap
        .error_message
        .as_ref()
        .map(|error| format!("{} ({error})", bootstrap.status_message))
        .unwrap_or(bootstrap.status_message);

    AppliedBootstrap {
        file_state: bootstrap.file_state,
        editor_tabs: EditorTabs::default(),
        tab_contents: TabContentsMap::default(),
        status_message: detail,
    }
}

pub(crate) fn merge_bootstrap_file_state(previous: &FileState, mut next: FileState) -> FileState {
    next.expanded_paths = previous.expanded_paths.clone();

    if let Some(selected_path) = previous.selected_path.clone() {
        if tree_contains_path(&next.file_tree, &selected_path) {
            next.selected_path = Some(selected_path);
        }
    }

    next
}

pub(crate) fn reload_workspace_or_bootstrap(
    storage: &dyn NoteStorage,
    previous: &FileState,
    workspace_path: &Path,
) -> Result<WorkspaceReloadOutcome> {
    let already_loaded = previous
        .current_workspace
        .as_ref()
        .map(|workspace| workspace.path == workspace_path)
        .unwrap_or(false);

    if already_loaded {
        let workspace = previous
            .current_workspace
            .clone()
            .expect("already_loaded implies Some");

        if let Ok((file_tree, recent_files)) = storage.reload_workspace_tree(&workspace) {
            let mut next_state = previous.clone();
            next_state.file_tree = file_tree;
            next_state.recent_files = recent_files;

            if let Some(selected_path) = previous.selected_path.clone() {
                next_state.selected_path =
                    tree_contains_path(&next_state.file_tree, &selected_path)
                        .then_some(selected_path);
            }

            return Ok(WorkspaceReloadOutcome {
                file_state: next_state,
                status_message: None,
            });
        }
    }

    let bootstrap = storage.bootstrap_from_workspace(workspace_path);
    let detail = bootstrap
        .error_message
        .as_ref()
        .map(|error| format!("{} ({error})", bootstrap.status_message))
        .unwrap_or_else(|| bootstrap.status_message.clone());

    let file_state = if bootstrap.error_message.is_none() {
        merge_bootstrap_file_state(previous, bootstrap.file_state)
    } else {
        previous.clone()
    };

    Ok(WorkspaceReloadOutcome {
        file_state,
        status_message: Some(detail),
    })
}

pub(crate) fn normalized_name(input: &str, fallback: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

pub(crate) fn selected_directory_or_workspace(
    file_state: &FileState,
    workspace_root: &Path,
) -> PathBuf {
    match file_state.selected_node() {
        Some(node) => match node.kind {
            FileNodeKind::Directory { .. } => node.path,
            FileNodeKind::Note { .. } => node
                .path
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| workspace_root.to_path_buf()),
        },
        None => workspace_root.to_path_buf(),
    }
}

fn current_workspace(file_state: &FileState) -> Result<Workspace> {
    file_state
        .current_workspace
        .clone()
        .ok_or_else(|| anyhow!("No workspace is currently open"))
}

fn tree_contains_path(nodes: &[FileNode], target: &Path) -> bool {
    nodes.iter().any(|node| {
        node.path == target
            || matches!(
                &node.kind,
                FileNodeKind::Directory { children } if tree_contains_path(children, target)
            )
    })
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct WorkspaceReloadOutcome {
    pub file_state: FileState,
    pub status_message: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::{AppSettings, EditorTab, RecentFile};
    use papyro_core::storage::{OpenedNote, SavedNote, WorkspaceSnapshot};
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MockStorage {
        opened_notes: HashMap<PathBuf, OpenedNote>,
        save_result: Option<SavedNote>,
        recent_files: Vec<RecentFile>,
        rename_result: Option<PathBuf>,
        reload_result: Option<(Vec<FileNode>, Vec<RecentFile>)>,
        create_note_result: Option<PathBuf>,
        create_folder_result: Option<PathBuf>,
        bootstrap_result: Option<WorkspaceBootstrap>,
        deleted_paths: Mutex<Vec<PathBuf>>,
        saved_payloads: Mutex<Vec<(String, String)>>,
        created_note_requests: Mutex<Vec<(PathBuf, String)>>,
        created_folder_requests: Mutex<Vec<(PathBuf, String)>>,
    }

    impl NoteStorage for MockStorage {
        fn open_note(&self, _workspace: &Workspace, path: &Path) -> Result<OpenedNote> {
            self.opened_notes
                .get(path)
                .cloned()
                .ok_or_else(|| anyhow!("Missing opened note for {}", path.display()))
        }

        fn save_note(
            &self,
            _workspace: &Workspace,
            tab: &EditorTab,
            content: &str,
        ) -> Result<SavedNote> {
            self.saved_payloads
                .lock()
                .unwrap()
                .push((tab.id.clone(), content.to_string()));
            self.save_result
                .clone()
                .ok_or_else(|| anyhow!("Missing save result"))
        }

        fn create_note(&self, parent: &Path, name: &str) -> Result<PathBuf> {
            self.created_note_requests
                .lock()
                .unwrap()
                .push((parent.to_path_buf(), name.to_string()));
            self.create_note_result
                .clone()
                .ok_or_else(|| anyhow!("Missing create note result"))
        }

        fn create_folder(&self, parent: &Path, name: &str) -> Result<PathBuf> {
            self.created_folder_requests
                .lock()
                .unwrap()
                .push((parent.to_path_buf(), name.to_string()));
            self.create_folder_result
                .clone()
                .ok_or_else(|| anyhow!("Missing create folder result"))
        }

        fn delete_path(&self, path: &Path) -> Result<()> {
            self.deleted_paths.lock().unwrap().push(path.to_path_buf());
            Ok(())
        }

        fn rename_path(
            &self,
            _workspace: &Workspace,
            _path: &Path,
            _new_name: &str,
        ) -> Result<PathBuf> {
            self.rename_result
                .clone()
                .ok_or_else(|| anyhow!("Missing rename result"))
        }

        fn bootstrap_from_workspace(&self, _root: &Path) -> WorkspaceBootstrap {
            self.bootstrap_result.clone().unwrap_or_default()
        }

        fn initialize_workspace(&self, _root: &Path) -> Result<WorkspaceSnapshot> {
            unimplemented!()
        }

        fn reload_workspace_tree(
            &self,
            _workspace: &Workspace,
        ) -> Result<(Vec<FileNode>, Vec<RecentFile>)> {
            self.reload_result
                .clone()
                .ok_or_else(|| anyhow!("Missing reload result"))
        }

        fn list_recent(&self, _limit: usize) -> Result<Vec<RecentFile>> {
            Ok(self.recent_files.clone())
        }

        fn load_settings(&self) -> AppSettings {
            AppSettings::default()
        }

        fn save_settings(&self, _settings: &AppSettings) -> Result<()> {
            Ok(())
        }
    }

    fn workspace() -> Workspace {
        Workspace {
            id: "workspace-1".to_string(),
            name: "Workspace".to_string(),
            path: PathBuf::from("workspace"),
            created_at: 0,
            last_opened: None,
            sort_order: 0,
        }
    }

    fn note_node(path: &str, note_id: &str) -> FileNode {
        FileNode {
            name: Path::new(path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap()
                .to_string(),
            path: PathBuf::from(path),
            relative_path: PathBuf::from(path.trim_start_matches("workspace/")),
            kind: FileNodeKind::Note {
                note_id: Some(note_id.to_string()),
            },
        }
    }

    fn directory_node(path: &str, children: Vec<FileNode>) -> FileNode {
        FileNode {
            name: Path::new(path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap()
                .to_string(),
            path: PathBuf::from(path),
            relative_path: PathBuf::from(path.trim_start_matches("workspace/")),
            kind: FileNodeKind::Directory { children },
        }
    }

    fn recent_file(note_id: &str, relative_path: &str) -> RecentFile {
        RecentFile {
            note_id: note_id.to_string(),
            title: note_id.to_string(),
            relative_path: PathBuf::from(relative_path),
            workspace_name: "Workspace".to_string(),
            opened_at: 0,
        }
    }

    fn tab(id: &str, note_id: &str, path: &str) -> EditorTab {
        EditorTab {
            id: id.to_string(),
            note_id: note_id.to_string(),
            title: id.to_string(),
            path: PathBuf::from(path),
            is_dirty: false,
        }
    }

    fn file_state_with_tree(file_tree: Vec<FileNode>) -> FileState {
        FileState {
            current_workspace: Some(workspace()),
            file_tree,
            ..FileState::default()
        }
    }

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
    fn save_tab_flow_marks_tab_clean_and_refreshes_recent_files() {
        let storage = MockStorage {
            save_result: Some(SavedNote {
                tab_id: "tab-a".to_string(),
                title: "Saved Title".to_string(),
            }),
            recent_files: vec![recent_file("note-a", "notes/a.md")],
            ..MockStorage::default()
        };
        let mut file_state =
            file_state_with_tree(vec![note_node("workspace/notes/a.md", "note-a")]);
        let mut editor_tabs = EditorTabs::default();
        let mut tab = tab("tab-a", "note-a", "workspace/notes/a.md");
        tab.is_dirty = true;
        editor_tabs.open_tab(tab);
        let mut tab_contents = TabContentsMap::default();
        tab_contents.insert_tab(
            "tab-a".to_string(),
            "body".to_string(),
            DocumentStats::default(),
        );

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
            vec![("tab-a".to_string(), "body".to_string())]
        );
        assert_eq!(
            file_state.recent_files,
            vec![recent_file("note-a", "notes/a.md")]
        );
        assert_eq!(
            editor_tabs
                .tab_by_id("tab-a")
                .map(|tab| (tab.is_dirty, tab.title.clone())),
            Some((false, "Saved Title".to_string()))
        );
    }

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
    fn apply_workspace_bootstrap_resets_editor_state_and_formats_status() {
        let mut file_state = FileState::default();
        file_state.select_path(PathBuf::from("workspace/notes/a.md"));

        let applied = apply_workspace_bootstrap(WorkspaceBootstrap {
            file_state: file_state.clone(),
            status_message: "Loaded workspace".to_string(),
            error_message: Some("warning".to_string()),
            ..WorkspaceBootstrap::default()
        });

        assert_eq!(applied.file_state, file_state);
        assert_eq!(applied.editor_tabs, EditorTabs::default());
        assert_eq!(applied.tab_contents, TabContentsMap::default());
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

        let merged = merge_bootstrap_file_state(
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
        )
        .unwrap();

        assert_eq!(deleted, target.clone());
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
}
