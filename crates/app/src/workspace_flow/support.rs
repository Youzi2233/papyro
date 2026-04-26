use anyhow::{anyhow, Result};
use papyro_core::models::{
    AppSettings, EditorTab, FileNode, FileNodeKind, RecentFile, SaveStatus, Workspace,
    WorkspaceSettingsOverrides, WorkspaceTreeState,
};
use papyro_core::storage::{
    DeletePreview, NoteStorage, OpenedNote, SavedNote, WorkspaceBootstrap, WorkspaceSnapshot,
};
use papyro_core::FileState;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Default)]
pub(super) struct MockStorage {
    pub opened_notes: HashMap<PathBuf, OpenedNote>,
    pub save_result: Option<SavedNote>,
    pub recent_files: Vec<RecentFile>,
    pub rename_result: Option<PathBuf>,
    pub move_result: Option<PathBuf>,
    pub reload_result: Option<(Vec<FileNode>, Vec<RecentFile>)>,
    pub create_note_result: Option<PathBuf>,
    pub create_folder_result: Option<PathBuf>,
    pub bootstrap_result: Option<WorkspaceBootstrap>,
    pub delete_preview: DeletePreview,
    pub deleted_paths: Mutex<Vec<PathBuf>>,
    pub deleted_extra_paths: Mutex<Vec<PathBuf>>,
    pub saved_payloads: Mutex<Vec<(String, String)>>,
    pub saved_tree_states: Mutex<Vec<(String, WorkspaceTreeState)>>,
    pub created_note_requests: Mutex<Vec<(PathBuf, String)>>,
    pub created_folder_requests: Mutex<Vec<(PathBuf, String)>>,
    pub moved_paths: Mutex<Vec<(PathBuf, PathBuf)>>,
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

    fn preview_delete_path(&self, _workspace: &Workspace, _path: &Path) -> Result<DeletePreview> {
        Ok(self.delete_preview.clone())
    }

    fn delete_paths(&self, paths: &[PathBuf]) -> Result<()> {
        self.deleted_extra_paths
            .lock()
            .unwrap()
            .extend(paths.iter().cloned());
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

    fn move_path(&self, _workspace: &Workspace, path: &Path, target_dir: &Path) -> Result<PathBuf> {
        self.moved_paths
            .lock()
            .unwrap()
            .push((path.to_path_buf(), target_dir.to_path_buf()));
        self.move_result
            .clone()
            .ok_or_else(|| anyhow!("Missing move result"))
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

    fn list_recent_workspaces(&self, _limit: usize) -> Result<Vec<Workspace>> {
        Ok(Vec::new())
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

    fn load_workspace_settings(&self, _workspace: &Workspace) -> WorkspaceSettingsOverrides {
        WorkspaceSettingsOverrides::default()
    }

    fn save_workspace_settings(
        &self,
        _workspace: &Workspace,
        _overrides: &WorkspaceSettingsOverrides,
    ) -> Result<()> {
        Ok(())
    }

    fn load_workspace_tree_state(&self, _workspace: &Workspace) -> WorkspaceTreeState {
        WorkspaceTreeState::default()
    }

    fn save_workspace_tree_state(
        &self,
        workspace: &Workspace,
        state: &WorkspaceTreeState,
    ) -> Result<()> {
        self.saved_tree_states
            .lock()
            .unwrap()
            .push((workspace.id.clone(), state.clone()));
        Ok(())
    }
}

pub(super) fn workspace() -> Workspace {
    Workspace {
        id: "workspace-1".to_string(),
        name: "Workspace".to_string(),
        path: PathBuf::from("workspace"),
        created_at: 0,
        last_opened: None,
        sort_order: 0,
    }
}

pub(super) fn note_node(path: &str, note_id: &str) -> FileNode {
    FileNode {
        name: Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap()
            .to_string(),
        path: PathBuf::from(path),
        relative_path: PathBuf::from(path.trim_start_matches("workspace/")),
        created_at: 0,
        updated_at: 0,
        kind: FileNodeKind::Note {
            note_id: Some(note_id.to_string()),
        },
    }
}

pub(super) fn directory_node(path: &str, children: Vec<FileNode>) -> FileNode {
    FileNode {
        name: Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap()
            .to_string(),
        path: PathBuf::from(path),
        relative_path: PathBuf::from(path.trim_start_matches("workspace/")),
        created_at: 0,
        updated_at: 0,
        kind: FileNodeKind::Directory { children },
    }
}

pub(super) fn recent_file(note_id: &str, relative_path: &str) -> RecentFile {
    RecentFile {
        note_id: note_id.to_string(),
        title: note_id.to_string(),
        relative_path: PathBuf::from(relative_path),
        workspace_id: "workspace-1".to_string(),
        workspace_name: "Workspace".to_string(),
        workspace_path: PathBuf::from("workspace"),
        opened_at: 0,
    }
}

pub(super) fn tab(id: &str, note_id: &str, path: &str) -> EditorTab {
    EditorTab {
        id: id.to_string(),
        note_id: note_id.to_string(),
        title: id.to_string(),
        path: PathBuf::from(path),
        is_dirty: false,
        save_status: SaveStatus::Saved,
    }
}

pub(super) fn file_state_with_tree(file_tree: Vec<FileNode>) -> FileState {
    FileState {
        current_workspace: Some(workspace()),
        file_tree,
        ..FileState::default()
    }
}
