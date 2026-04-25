use papyro_core::models::{
    AppSettings, DocumentStats, FileNode, FileNodeKind, SaveStatus, Theme, ViewMode,
};
use papyro_core::{EditorTabs, FileState, TabContentsMap, UiState};
use std::path::PathBuf;

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
    pub selected_name: Option<String>,
    pub has_selection: bool,
    pub selected_is_directory: bool,
    pub note_count: usize,
    pub recent_count: usize,
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
pub struct SettingsViewModel {
    pub settings: AppSettings,
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
    ) -> Self {
        Self {
            workspace: WorkspaceViewModel::from_file_state(file_state),
            editor: EditorViewModel::from_editor_state(editor_tabs, tab_contents, ui_state),
            settings: SettingsViewModel::from_ui_state(ui_state),
        }
    }
}

impl WorkspaceViewModel {
    fn from_file_state(file_state: &FileState) -> Self {
        let selected_node = file_state.selected_node();

        Self {
            name: file_state
                .current_workspace
                .as_ref()
                .map(|workspace| workspace.name.clone()),
            path: file_state
                .current_workspace
                .as_ref()
                .map(|workspace| workspace.path.clone()),
            selected_name: selected_node.as_ref().map(|node| node.name.clone()),
            has_selection: selected_node.is_some(),
            selected_is_directory: selected_node
                .as_ref()
                .is_some_and(|node| matches!(node.kind, FileNodeKind::Directory { .. })),
            note_count: count_notes(&file_state.file_tree),
            recent_count: file_state.recent_files.len(),
        }
    }
}

impl EditorViewModel {
    fn from_editor_state(
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
    fn from_ui_state(ui_state: &UiState) -> Self {
        Self {
            settings: ui_state.settings.clone(),
            theme: ui_state.theme().clone(),
            sidebar_collapsed: ui_state.sidebar_collapsed(),
            sidebar_width: ui_state.settings.sidebar_width,
        }
    }
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
    use papyro_core::models::{EditorTab, RecentFile, Workspace};

    fn note(path: &str) -> FileNode {
        FileNode {
            name: path.to_string(),
            path: PathBuf::from(path),
            relative_path: PathBuf::from(path),
            kind: FileNodeKind::Note { note_id: None },
        }
    }

    #[test]
    fn view_model_derives_workspace_editor_and_settings() {
        let mut file_state = FileState {
            current_workspace: Some(Workspace {
                id: "w".to_string(),
                name: "Workspace".to_string(),
                path: PathBuf::from("workspace"),
                created_at: 0,
                last_opened: None,
                sort_order: 0,
            }),
            file_tree: vec![FileNode {
                name: "notes".to_string(),
                path: PathBuf::from("notes"),
                relative_path: PathBuf::from("notes"),
                kind: FileNodeKind::Directory {
                    children: vec![note("a.md"), note("b.md")],
                },
            }],
            recent_files: vec![RecentFile {
                note_id: "a".to_string(),
                title: "A".to_string(),
                relative_path: PathBuf::from("a.md"),
                workspace_name: "Workspace".to_string(),
                opened_at: 0,
            }],
            ..Default::default()
        };
        file_state.select_path(PathBuf::from("notes"));

        let mut editor_tabs = EditorTabs::default();
        editor_tabs.open_tab(EditorTab {
            id: "tab-a".to_string(),
            note_id: "a".to_string(),
            title: "A".to_string(),
            path: PathBuf::from("a.md"),
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

        let ui_state = UiState {
            settings: AppSettings {
                theme: Theme::Dark,
                sidebar_width: 320,
                sidebar_collapsed: true,
                ..Default::default()
            },
            ..Default::default()
        };

        let view_model =
            AppViewModel::from_state(&file_state, &editor_tabs, &tab_contents, &ui_state);

        assert_eq!(view_model.workspace.name.as_deref(), Some("Workspace"));
        assert_eq!(view_model.workspace.note_count, 2);
        assert_eq!(view_model.workspace.recent_count, 1);
        assert!(view_model.workspace.selected_is_directory);
        assert_eq!(view_model.editor.active_title.as_deref(), Some("A"));
        assert!(view_model.editor.active_is_dirty);
        assert_eq!(view_model.editor.active_save_status, SaveStatus::Dirty);
        assert_eq!(view_model.editor.active_stats.char_count, 5);
        assert_eq!(view_model.editor.view_mode, ViewMode::Hybrid);
        assert_eq!(view_model.settings.theme, Theme::Dark);
        assert!(view_model.settings.sidebar_collapsed);
        assert_eq!(view_model.settings.sidebar_width, 320);
    }
}
