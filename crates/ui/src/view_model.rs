use papyro_core::models::{
    DocumentStats, EditorTab, FileNode, FileNodeKind, SaveStatus, Theme, ViewMode, Workspace,
};
use papyro_core::{EditorTabs, FileState, TabContentSnapshot, TabContentsMap, UiState};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const WARM_EDITOR_HOST_LIMIT: usize = 2;

#[derive(Debug, Clone, PartialEq)]
pub struct AppViewModel {
    pub workspace: WorkspaceViewModel,
    pub editor: EditorViewModel,
    pub settings: SettingsViewModel,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct WorkspaceViewModel {
    pub name: Option<String>,
    pub path: Option<PathBuf>,
    pub recent_workspaces: Vec<WorkspaceListItem>,
    pub recent_files: Vec<RecentFileListItem>,
    pub trashed_notes: Vec<TrashedNoteListItem>,
    pub tags: Vec<TagListItem>,
    pub selected_name: Option<String>,
    pub selected_path: Option<PathBuf>,
    pub has_selection: bool,
    pub selected_is_directory: bool,
    pub selected_delete_pending: bool,
    pub note_count: usize,
    pub recent_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecentFileListItem {
    pub title: String,
    pub relative_path: PathBuf,
    pub workspace_name: String,
    pub workspace_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrashedNoteListItem {
    pub note_id: String,
    pub title: String,
    pub relative_path: PathBuf,
    pub trashed_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TagListItem {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceListItem {
    pub name: String,
    pub path: PathBuf,
    pub is_current: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EditorViewModel {
    pub active_tab_id: Option<String>,
    pub active_title: Option<String>,
    pub has_active_tab: bool,
    pub tab_count: usize,
    pub active_is_dirty: bool,
    pub active_save_status: SaveStatus,
    pub active_stats: DocumentStats,
    pub view_mode: ViewMode,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EditorSurfaceViewModel {
    pub view_mode: ViewMode,
    pub font_family: String,
    pub font_size: u8,
    pub line_height: f32,
    pub auto_link_paste: bool,
    pub outline_visible: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EditorPaneViewModel {
    pub active_tab_id: Option<String>,
    pub has_active_tab: bool,
    pub active_document: Option<TabContentSnapshot>,
    pub tab_items: Vec<EditorTabItemViewModel>,
    pub open_tab_ids: Vec<String>,
    pub host_items: Vec<EditorHostItemViewModel>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EditorTabItemViewModel {
    pub id: String,
    pub title: String,
    pub is_dirty: bool,
    pub is_active: bool,
    pub next_active_tab_id: String,
    pub should_retire_host_on_close: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EditorHostItemViewModel {
    pub tab_id: String,
    pub is_active: bool,
    pub initial_content: EditorHostInitialContent,
    pub paste_context: Option<EditorHostPasteContext>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EditorHostPasteContext {
    pub workspace: Workspace,
    pub note_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct EditorHostInitialContent {
    pub content: Arc<str>,
}

impl Default for EditorHostInitialContent {
    fn default() -> Self {
        Self {
            content: Arc::from(""),
        }
    }
}

impl PartialEq for EditorHostInitialContent {
    fn eq(&self, _other: &Self) -> bool {
        // The content is a non-reactive host startup seed. Live edits flow
        // from editor runtime events, so content changes must not invalidate
        // the mounted host.
        true
    }
}

impl Eq for EditorHostInitialContent {}

impl EditorHostInitialContent {
    fn from_snapshot(snapshot: Option<TabContentSnapshot>) -> Self {
        snapshot
            .map(|snapshot| Self {
                content: snapshot.content,
            })
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SettingsViewModel {
    pub theme: Theme,
    pub sidebar_collapsed: bool,
    pub sidebar_width: u32,
}

impl AppViewModel {
    pub fn from_state(
        file_state: &FileState,
        editor_tabs: &EditorTabs,
        tab_contents: &TabContentsMap,
        ui_state: &UiState,
        pending_delete_path: Option<&Path>,
    ) -> Self {
        Self {
            workspace: WorkspaceViewModel::from_file_state(file_state, pending_delete_path),
            editor: EditorViewModel::from_editor_state(editor_tabs, tab_contents, ui_state),
            settings: SettingsViewModel::from_ui_state(ui_state),
        }
    }
}

impl WorkspaceViewModel {
    pub fn from_file_state(file_state: &FileState, pending_delete_path: Option<&Path>) -> Self {
        let selected_node = file_state.selected_node();
        let selected_path = selected_node.as_ref().map(|node| node.path.as_path());
        let current_path = file_state
            .current_workspace
            .as_ref()
            .map(|workspace| workspace.path.clone());

        Self {
            name: file_state
                .current_workspace
                .as_ref()
                .map(|workspace| workspace.name.clone()),
            path: file_state
                .current_workspace
                .as_ref()
                .map(|workspace| workspace.path.clone()),
            recent_workspaces: file_state
                .workspaces
                .iter()
                .map(|workspace| WorkspaceListItem {
                    name: workspace.name.clone(),
                    path: workspace.path.clone(),
                    is_current: current_path
                        .as_ref()
                        .is_some_and(|path| path == &workspace.path),
                })
                .collect(),
            recent_files: file_state
                .recent_files
                .iter()
                .map(|recent| RecentFileListItem {
                    title: recent.title.clone(),
                    relative_path: recent.relative_path.clone(),
                    workspace_name: recent.workspace_name.clone(),
                    workspace_path: recent.workspace_path.clone(),
                })
                .collect(),
            trashed_notes: file_state
                .trashed_notes
                .iter()
                .map(|trashed| TrashedNoteListItem {
                    note_id: trashed.note.id.clone(),
                    title: trashed.note.title.clone(),
                    relative_path: trashed.note.relative_path.clone(),
                    trashed_at: trashed.trashed_at,
                })
                .collect(),
            tags: file_state
                .tags
                .iter()
                .map(|tag| TagListItem {
                    id: tag.id.clone(),
                    name: tag.name.clone(),
                    color: tag.color.clone(),
                })
                .collect(),
            selected_name: selected_node.as_ref().map(|node| node.name.clone()),
            selected_path: selected_node.as_ref().map(|node| node.path.clone()),
            has_selection: selected_node.is_some(),
            selected_is_directory: selected_node
                .as_ref()
                .is_some_and(|node| matches!(node.kind, FileNodeKind::Directory { .. })),
            selected_delete_pending: selected_path
                .is_some_and(|path| Some(path) == pending_delete_path),
            note_count: count_notes(&file_state.file_tree),
            recent_count: file_state.recent_files.len(),
        }
    }
}

impl EditorViewModel {
    pub fn from_editor_state(
        editor_tabs: &EditorTabs,
        tab_contents: &TabContentsMap,
        ui_state: &UiState,
    ) -> Self {
        let active_tab = editor_tabs.active_tab();
        let active_tab_id = editor_tabs.active_tab_id.clone();

        Self {
            active_tab_id: active_tab_id.clone(),
            active_title: active_tab.map(|tab| tab.title.clone()),
            has_active_tab: active_tab.is_some(),
            tab_count: editor_tabs.tabs.len(),
            active_is_dirty: active_tab.is_some_and(|tab| tab.is_dirty),
            active_save_status: active_tab
                .map(|tab| tab.save_status.clone())
                .unwrap_or_default(),
            active_stats: tab_contents.active_stats(active_tab_id.as_deref()),
            view_mode: ui_state.view_mode.clone(),
        }
    }
}

impl SettingsViewModel {
    pub fn from_ui_state(ui_state: &UiState) -> Self {
        Self {
            theme: ui_state.theme().clone(),
            sidebar_collapsed: ui_state.sidebar_collapsed(),
            sidebar_width: ui_state.settings.sidebar_width,
        }
    }
}

impl EditorSurfaceViewModel {
    pub fn from_ui_state(ui_state: &UiState) -> Self {
        Self {
            view_mode: ui_state.view_mode.clone(),
            font_family: ui_state.settings.font_family.clone(),
            font_size: ui_state.settings.font_size,
            line_height: ui_state.settings.line_height,
            auto_link_paste: ui_state.settings.auto_link_paste,
            outline_visible: ui_state.outline_visible(),
        }
    }
}

impl EditorPaneViewModel {
    pub fn from_editor_state(
        file_state: &FileState,
        editor_tabs: &EditorTabs,
        tab_contents: &TabContentsMap,
        pending_close_tab: Option<&str>,
    ) -> Self {
        let active_tab_id = editor_tabs.active_tab_id.clone();
        let has_active_tab = editor_tabs.active_tab().is_some();
        let open_tab_ids: Vec<String> = editor_tabs.tabs.iter().map(|tab| tab.id.clone()).collect();
        let tracked_host_ids = bounded_host_ids(&open_tab_ids, active_tab_id.as_deref());

        let active_document = active_tab_id
            .as_deref()
            .and_then(|id| tab_contents.snapshot_for_tab(id));
        let host_items = tracked_host_ids
            .into_iter()
            .map(|tab_id| EditorHostItemViewModel {
                initial_content: EditorHostInitialContent::from_snapshot(
                    tab_contents.snapshot_for_tab(&tab_id),
                ),
                is_active: Some(&tab_id) == active_tab_id.as_ref(),
                paste_context: editor_tabs
                    .tab_by_id(&tab_id)
                    .and_then(|tab| editor_host_paste_context(file_state, tab)),
                tab_id,
            })
            .collect();
        let tab_items = editor_tabs
            .tabs
            .iter()
            .map(|tab| {
                let is_active = Some(tab.id.as_str()) == active_tab_id.as_deref();
                EditorTabItemViewModel {
                    id: tab.id.clone(),
                    title: tab.title.clone(),
                    is_dirty: tab.is_dirty,
                    is_active,
                    next_active_tab_id: next_active_tab_id_after_close(
                        &editor_tabs.tabs,
                        active_tab_id.as_deref(),
                        &tab.id,
                    ),
                    should_retire_host_on_close: !tab.is_dirty
                        || pending_close_tab == Some(tab.id.as_str()),
                }
            })
            .collect();

        Self {
            active_tab_id,
            has_active_tab,
            active_document,
            tab_items,
            open_tab_ids,
            host_items,
        }
    }
}

fn editor_host_paste_context(
    file_state: &FileState,
    tab: &EditorTab,
) -> Option<EditorHostPasteContext> {
    let workspace = file_state.current_workspace.clone()?;
    tab.path
        .starts_with(&workspace.path)
        .then_some(EditorHostPasteContext {
            workspace,
            note_path: tab.path.clone(),
        })
}

fn next_active_tab_id_after_close(
    tabs: &[EditorTab],
    active_tab_id: Option<&str>,
    closing_tab_id: &str,
) -> String {
    if active_tab_id == Some(closing_tab_id) {
        return tabs
            .iter()
            .rfind(|candidate| candidate.id != closing_tab_id)
            .map(|candidate| candidate.id.clone())
            .unwrap_or_default();
    }

    active_tab_id.unwrap_or_default().to_string()
}

fn bounded_host_ids(open_tab_ids: &[String], active_tab_id: Option<&str>) -> Vec<String> {
    let mut ids = Vec::new();
    if let Some(active_tab_id) = active_tab_id {
        if open_tab_ids.iter().any(|id| id == active_tab_id) {
            ids.push(active_tab_id.to_string());
        }
    }

    for tab_id in open_tab_ids.iter().rev() {
        if Some(tab_id.as_str()) == active_tab_id || ids.iter().any(|id| id == tab_id) {
            continue;
        }
        ids.push(tab_id.clone());
        if ids.len() >= WARM_EDITOR_HOST_LIMIT + usize::from(active_tab_id.is_some()) {
            break;
        }
    }

    ids
}

fn count_notes(nodes: &[FileNode]) -> usize {
    nodes
        .iter()
        .map(|node| match &node.kind {
            FileNodeKind::Note { .. } => 1,
            FileNodeKind::Directory { children } => count_notes(children),
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::{AppSettings, NoteMeta, RecentFile, Tag, TrashedNote, Workspace};

    fn note(path: &str) -> FileNode {
        FileNode {
            name: path.to_string(),
            path: PathBuf::from(path),
            relative_path: PathBuf::from(path),
            created_at: 0,
            updated_at: 0,
            kind: FileNodeKind::Note { note_id: None },
        }
    }

    fn editor_tab(id: &str) -> EditorTab {
        EditorTab {
            id: id.to_string(),
            note_id: format!("note-{id}"),
            title: format!("Note {id}"),
            path: PathBuf::from(format!("workspace/{id}.md")),
            is_dirty: false,
            save_status: SaveStatus::Saved,
        }
    }

    struct ViewModelFixture {
        file_state: FileState,
        editor_tabs: EditorTabs,
        tab_contents: TabContentsMap,
        ui_state: UiState,
    }

    fn view_model_fixture() -> ViewModelFixture {
        let current_workspace = Workspace {
            id: "w".to_string(),
            name: "Workspace".to_string(),
            path: PathBuf::from("workspace"),
            created_at: 0,
            last_opened: None,
            sort_order: 0,
        };
        let archive_workspace = Workspace {
            id: "archive".to_string(),
            name: "Archive".to_string(),
            path: PathBuf::from("archive"),
            created_at: 0,
            last_opened: Some(1),
            sort_order: 0,
        };

        let mut file_state = FileState {
            workspaces: vec![current_workspace.clone(), archive_workspace],
            current_workspace: Some(current_workspace),
            file_tree: vec![FileNode {
                name: "notes".to_string(),
                path: PathBuf::from("notes"),
                relative_path: PathBuf::from("notes"),
                created_at: 0,
                updated_at: 0,
                kind: FileNodeKind::Directory {
                    children: vec![note("a.md"), note("b.md")],
                },
            }],
            recent_files: vec![RecentFile {
                note_id: "a".to_string(),
                title: "A".to_string(),
                relative_path: PathBuf::from("a.md"),
                workspace_id: "w".to_string(),
                workspace_name: "Workspace".to_string(),
                workspace_path: PathBuf::from("workspace"),
                opened_at: 0,
            }],
            trashed_notes: vec![TrashedNote {
                note: NoteMeta {
                    id: "deleted".to_string(),
                    workspace_id: "w".to_string(),
                    relative_path: PathBuf::from("deleted.md"),
                    title: "Deleted".to_string(),
                    created_at: 0,
                    updated_at: 0,
                    word_count: 0,
                    char_count: 0,
                    is_favorite: false,
                    is_trashed: true,
                    tags: Vec::new(),
                },
                trashed_at: 1,
            }],
            tags: vec![
                Tag {
                    id: "rust".to_string(),
                    name: "Rust".to_string(),
                    color: "#DEA584".to_string(),
                },
                Tag {
                    id: "search".to_string(),
                    name: "Search".to_string(),
                    color: "#2563EB".to_string(),
                },
            ],
            ..Default::default()
        };
        file_state.select_path(PathBuf::from("notes"));

        let mut editor_tabs = EditorTabs::default();
        editor_tabs.open_tab(EditorTab {
            id: "tab-a".to_string(),
            note_id: "a".to_string(),
            title: "A".to_string(),
            path: PathBuf::from("workspace/a.md"),
            is_dirty: true,
            save_status: SaveStatus::Dirty,
        });

        let mut tab_contents = TabContentsMap::default();
        tab_contents.insert_tab(
            "tab-a".to_string(),
            "hello".to_string(),
            DocumentStats {
                word_count: 1,
                char_count: 5,
                ..Default::default()
            },
        );

        let settings = AppSettings {
            theme: Theme::Dark,
            sidebar_width: 320,
            sidebar_collapsed: true,
            view_mode: ViewMode::Source,
            ..Default::default()
        };
        let ui_state = UiState {
            view_mode: ViewMode::Source,
            settings: settings.clone(),
            global_settings: settings,
            workspace_overrides: Default::default(),
            outline_visible: false,
        };

        ViewModelFixture {
            file_state,
            editor_tabs,
            tab_contents,
            ui_state,
        }
    }

    #[test]
    fn view_model_derives_workspace_editor_and_settings() {
        let fixture = view_model_fixture();

        let view_model = AppViewModel::from_state(
            &fixture.file_state,
            &fixture.editor_tabs,
            &fixture.tab_contents,
            &fixture.ui_state,
            Some(Path::new("notes")),
        );

        assert_eq!(view_model.workspace.name.as_deref(), Some("Workspace"));
        assert_eq!(
            view_model.workspace.recent_workspaces,
            vec![
                WorkspaceListItem {
                    name: "Workspace".to_string(),
                    path: PathBuf::from("workspace"),
                    is_current: true,
                },
                WorkspaceListItem {
                    name: "Archive".to_string(),
                    path: PathBuf::from("archive"),
                    is_current: false,
                },
            ]
        );
        assert_eq!(
            view_model.workspace.recent_files,
            vec![RecentFileListItem {
                title: "A".to_string(),
                relative_path: PathBuf::from("a.md"),
                workspace_name: "Workspace".to_string(),
                workspace_path: PathBuf::from("workspace"),
            }]
        );
        assert_eq!(
            view_model.workspace.trashed_notes,
            vec![TrashedNoteListItem {
                note_id: "deleted".to_string(),
                title: "Deleted".to_string(),
                relative_path: PathBuf::from("deleted.md"),
                trashed_at: 1,
            }]
        );
        assert_eq!(
            view_model.workspace.tags,
            vec![
                TagListItem {
                    id: "rust".to_string(),
                    name: "Rust".to_string(),
                    color: "#DEA584".to_string(),
                },
                TagListItem {
                    id: "search".to_string(),
                    name: "Search".to_string(),
                    color: "#2563EB".to_string(),
                },
            ]
        );
        assert_eq!(view_model.workspace.note_count, 2);
        assert_eq!(view_model.workspace.recent_count, 1);
        assert_eq!(
            view_model.workspace.selected_path,
            Some(PathBuf::from("notes"))
        );
        assert!(view_model.workspace.selected_is_directory);
        assert!(view_model.workspace.selected_delete_pending);
        assert_eq!(view_model.editor.active_title.as_deref(), Some("A"));
        assert!(view_model.editor.active_is_dirty);
        assert_eq!(view_model.editor.active_save_status, SaveStatus::Dirty);
        assert_eq!(view_model.editor.active_stats.char_count, 5);
        assert_eq!(view_model.editor.view_mode, ViewMode::Source);
        assert_eq!(view_model.settings.theme, Theme::Dark);
        assert!(view_model.settings.sidebar_collapsed);
        assert_eq!(view_model.settings.sidebar_width, 320);
    }

    #[test]
    fn workspace_view_model_ignores_editor_and_settings_changes() {
        let mut fixture = view_model_fixture();
        let before = WorkspaceViewModel::from_file_state(&fixture.file_state, None);

        fixture
            .editor_tabs
            .mark_tab_saved("tab-a", "Saved".to_string());
        fixture
            .tab_contents
            .update_tab_content("tab-a", "changed".to_string());
        fixture.ui_state.settings.sidebar_width = 360;
        fixture.ui_state.settings.view_mode = ViewMode::Preview;
        fixture.ui_state.view_mode = ViewMode::Preview;

        assert_eq!(
            before,
            WorkspaceViewModel::from_file_state(&fixture.file_state, None)
        );
    }

    #[test]
    fn editor_view_model_ignores_workspace_and_chrome_only_changes() {
        let mut fixture = view_model_fixture();
        let before = EditorViewModel::from_editor_state(
            &fixture.editor_tabs,
            &fixture.tab_contents,
            &fixture.ui_state,
        );

        fixture.file_state.recent_files.clear();
        fixture.file_state.tags.clear();
        fixture.ui_state.settings.sidebar_collapsed = false;
        fixture.ui_state.settings.sidebar_width = 360;

        assert_eq!(
            before,
            EditorViewModel::from_editor_state(
                &fixture.editor_tabs,
                &fixture.tab_contents,
                &fixture.ui_state,
            )
        );
    }

    #[test]
    fn editor_surface_view_model_ignores_theme_and_sidebar_changes() {
        let mut fixture = view_model_fixture();
        let before = EditorSurfaceViewModel::from_ui_state(&fixture.ui_state);

        fixture.ui_state.settings.theme = Theme::Light;
        fixture.ui_state.settings.sidebar_collapsed = false;
        fixture.ui_state.settings.sidebar_width = 360;

        assert_eq!(
            before,
            EditorSurfaceViewModel::from_ui_state(&fixture.ui_state)
        );
    }

    #[test]
    fn editor_surface_view_model_tracks_editor_preferences() {
        let mut fixture = view_model_fixture();
        let before = EditorSurfaceViewModel::from_ui_state(&fixture.ui_state);

        fixture.ui_state.view_mode = ViewMode::Preview;
        fixture.ui_state.settings.view_mode = ViewMode::Preview;
        fixture.ui_state.settings.font_size = 18;
        fixture.ui_state.settings.line_height = 1.8;
        fixture.ui_state.settings.auto_link_paste = !before.auto_link_paste;
        fixture.ui_state.toggle_outline();

        let after = EditorSurfaceViewModel::from_ui_state(&fixture.ui_state);
        assert_ne!(before, after);
        assert_eq!(after.view_mode, ViewMode::Preview);
        assert_eq!(after.font_size, 18);
        assert_eq!(after.line_height, 1.8);
        assert_eq!(after.auto_link_paste, !before.auto_link_paste);
        assert!(after.outline_visible);
    }

    #[test]
    fn settings_view_model_ignores_workspace_and_editor_changes() {
        let mut fixture = view_model_fixture();
        let before = SettingsViewModel::from_ui_state(&fixture.ui_state);

        fixture.file_state.recent_files.clear();
        fixture
            .editor_tabs
            .mark_tab_saved("tab-a", "Saved".to_string());
        fixture
            .tab_contents
            .update_tab_content("tab-a", "changed".to_string());
        fixture.ui_state.settings.font_size = 20;
        fixture.ui_state.settings.line_height = 1.8;
        fixture.ui_state.settings.auto_link_paste = false;

        assert_eq!(before, SettingsViewModel::from_ui_state(&fixture.ui_state));
    }

    #[test]
    fn settings_view_model_tracks_only_chrome_settings() {
        let mut fixture = view_model_fixture();
        let before = SettingsViewModel::from_ui_state(&fixture.ui_state);

        fixture.ui_state.settings.theme = Theme::Light;
        fixture.ui_state.settings.sidebar_collapsed = false;
        fixture.ui_state.settings.sidebar_width = 360;

        let after = SettingsViewModel::from_ui_state(&fixture.ui_state);
        assert_ne!(before, after);
        assert_eq!(after.theme, Theme::Light);
        assert!(!after.sidebar_collapsed);
        assert_eq!(after.sidebar_width, 360);
    }

    #[test]
    fn editor_pane_view_model_tracks_active_document_and_bounded_hosts() {
        let mut editor_tabs = EditorTabs::default();
        editor_tabs.open_tab(editor_tab("a"));
        editor_tabs.open_tab(editor_tab("b"));
        editor_tabs.set_active_tab("a");

        let mut tab_contents = TabContentsMap::default();
        tab_contents.insert_tab("a".to_string(), "# A".to_string(), DocumentStats::default());
        tab_contents.insert_tab("b".to_string(), "# B".to_string(), DocumentStats::default());

        let model = EditorPaneViewModel::from_editor_state(
            &FileState::default(),
            &editor_tabs,
            &tab_contents,
            None,
        );

        assert_eq!(model.active_tab_id.as_deref(), Some("a"));
        assert!(model.has_active_tab);
        assert_eq!(
            model.tab_items,
            vec![
                EditorTabItemViewModel {
                    id: "a".to_string(),
                    title: "Note a".to_string(),
                    is_dirty: false,
                    is_active: true,
                    next_active_tab_id: "b".to_string(),
                    should_retire_host_on_close: true,
                },
                EditorTabItemViewModel {
                    id: "b".to_string(),
                    title: "Note b".to_string(),
                    is_dirty: false,
                    is_active: false,
                    next_active_tab_id: "a".to_string(),
                    should_retire_host_on_close: true,
                },
            ]
        );
        assert_eq!(
            model.active_document.as_ref().map(|document| {
                (
                    document.tab_id.as_str(),
                    document.revision,
                    document.content.as_ref(),
                )
            }),
            Some(("a", 0, "# A"))
        );
        assert_eq!(
            model.host_items,
            vec![
                EditorHostItemViewModel {
                    tab_id: "a".to_string(),
                    is_active: true,
                    initial_content: EditorHostInitialContent {
                        content: Arc::from("# A"),
                    },
                    paste_context: None,
                },
                EditorHostItemViewModel {
                    tab_id: "b".to_string(),
                    is_active: false,
                    initial_content: EditorHostInitialContent {
                        content: Arc::from("# B"),
                    },
                    paste_context: None,
                },
            ]
        );
    }

    #[test]
    fn editor_pane_view_model_bounds_live_hosts_independent_of_open_tab_count() {
        let mut editor_tabs = EditorTabs::default();
        let mut tab_contents = TabContentsMap::default();
        for id in ["a", "b", "c", "d", "e"] {
            editor_tabs.open_tab(editor_tab(id));
            tab_contents.insert_tab(id.to_string(), format!("# {id}"), DocumentStats::default());
        }
        editor_tabs.set_active_tab("b");

        let model = EditorPaneViewModel::from_editor_state(
            &FileState::default(),
            &editor_tabs,
            &tab_contents,
            None,
        );

        assert_eq!(
            model.open_tab_ids,
            vec![
                "a".to_string(),
                "b".to_string(),
                "c".to_string(),
                "d".to_string(),
                "e".to_string(),
            ]
        );
        assert_eq!(
            model.host_items,
            vec![
                EditorHostItemViewModel {
                    tab_id: "b".to_string(),
                    is_active: true,
                    initial_content: EditorHostInitialContent {
                        content: Arc::from("# b"),
                    },
                    paste_context: None,
                },
                EditorHostItemViewModel {
                    tab_id: "e".to_string(),
                    is_active: false,
                    initial_content: EditorHostInitialContent {
                        content: Arc::from("# e"),
                    },
                    paste_context: None,
                },
                EditorHostItemViewModel {
                    tab_id: "d".to_string(),
                    is_active: false,
                    initial_content: EditorHostInitialContent {
                        content: Arc::from("# d"),
                    },
                    paste_context: None,
                },
            ]
        );
    }

    #[test]
    fn editor_pane_view_model_ignores_settings_changes() {
        let mut fixture = view_model_fixture();
        let before = EditorPaneViewModel::from_editor_state(
            &fixture.file_state,
            &fixture.editor_tabs,
            &fixture.tab_contents,
            None,
        );

        fixture.ui_state.settings.sidebar_width = 360;
        fixture.ui_state.settings.view_mode = ViewMode::Preview;
        fixture.ui_state.view_mode = ViewMode::Preview;

        assert_eq!(
            before,
            EditorPaneViewModel::from_editor_state(
                &fixture.file_state,
                &fixture.editor_tabs,
                &fixture.tab_contents,
                None
            )
        );
    }

    #[test]
    fn editor_pane_view_model_marks_pending_dirty_close_as_immediate() {
        let mut editor_tabs = EditorTabs::default();
        let mut dirty_tab = editor_tab("a");
        dirty_tab.is_dirty = true;
        dirty_tab.save_status = SaveStatus::Dirty;
        editor_tabs.open_tab(dirty_tab);

        let mut tab_contents = TabContentsMap::default();
        tab_contents.insert_tab("a".to_string(), "# A".to_string(), DocumentStats::default());

        let before = EditorPaneViewModel::from_editor_state(
            &FileState::default(),
            &editor_tabs,
            &tab_contents,
            None,
        );
        let after = EditorPaneViewModel::from_editor_state(
            &FileState::default(),
            &editor_tabs,
            &tab_contents,
            Some("a"),
        );

        assert!(!before.tab_items[0].should_retire_host_on_close);
        assert!(after.tab_items[0].should_retire_host_on_close);
    }

    #[test]
    fn editor_host_initial_content_does_not_invalidate_host_item_identity() {
        let mut editor_tabs = EditorTabs::default();
        editor_tabs.open_tab(editor_tab("a"));

        let mut before_contents = TabContentsMap::default();
        before_contents.insert_tab("a".to_string(), "# A".to_string(), DocumentStats::default());
        let before = EditorPaneViewModel::from_editor_state(
            &FileState::default(),
            &editor_tabs,
            &before_contents,
            None,
        );

        let mut after_contents = before_contents.clone();
        after_contents.update_tab_content("a", "# A changed".to_string());
        let after = EditorPaneViewModel::from_editor_state(
            &FileState::default(),
            &editor_tabs,
            &after_contents,
            None,
        );

        assert_eq!(before.host_items, after.host_items);
        assert_ne!(
            before.host_items[0].initial_content.content.as_ref(),
            after.host_items[0].initial_content.content.as_ref()
        );
    }

    #[test]
    fn editor_pane_view_model_derives_host_paste_context_for_workspace_tabs() {
        let fixture = view_model_fixture();

        let model = EditorPaneViewModel::from_editor_state(
            &fixture.file_state,
            &fixture.editor_tabs,
            &fixture.tab_contents,
            None,
        );

        assert_eq!(
            model.host_items[0].paste_context,
            Some(EditorHostPasteContext {
                workspace: fixture.file_state.current_workspace.clone().unwrap(),
                note_path: PathBuf::from("workspace/a.md"),
            })
        );
    }

    #[test]
    fn editor_pane_view_model_omits_paste_context_for_outside_tabs() {
        let mut fixture = view_model_fixture();
        fixture.editor_tabs.tabs[0].path = PathBuf::from("outside/a.md");

        let model = EditorPaneViewModel::from_editor_state(
            &fixture.file_state,
            &fixture.editor_tabs,
            &fixture.tab_contents,
            None,
        );

        assert_eq!(model.host_items[0].paste_context, None);
    }
}
