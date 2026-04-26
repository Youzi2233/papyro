pub mod db;
pub mod fs;
pub mod index;

pub use db::{create_pool, DbPool};
pub use papyro_core::{
    DeletePreview, OpenedNote, SavedNote, WorkspaceBootstrap, WorkspaceSnapshot,
};

use anyhow::Result;
use chrono::Utc;
use papyro_core::models::{
    AppSettings, EditorTab, FileNode, FileNodeKind, NoteMeta, RecentFile, TrashedNote, Workspace,
    WorkspaceSettingsOverrides, WorkspaceTreeState,
};
use papyro_core::{
    local_markdown_image_targets, rewrite_moved_note_image_links, workspace_assets_dir, FileState,
    NoteStorage, SearchResult, WorkspaceSearchQuery,
};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const APP_SETTINGS_KEY: &str = "app_settings";
const WORKSPACE_SETTINGS_PREFIX: &str = "workspace_settings:";
const WORKSPACE_TREE_STATE_PREFIX: &str = "workspace_tree_state:";
const WORKSPACE_TRASH_DIR_NAME: &str = ".papyro-trash";

#[derive(Debug, Clone)]
pub struct SqliteStorage {
    pool: DbPool,
    db_path: PathBuf,
}

impl SqliteStorage {
    pub fn new() -> Result<Self> {
        let db_path = fs::get_db_path()?;
        Self::from_db_path(db_path)
    }

    pub fn new_in_app_data_dir(app_data_dir: &Path) -> Result<Self> {
        let db_path = fs::get_db_path_in_app_data_dir(app_data_dir)?;
        Self::from_db_path(db_path)
    }

    pub fn from_db_path(db_path: PathBuf) -> Result<Self> {
        let pool = create_pool(&db_path)?;
        Ok(Self { pool, db_path })
    }

    pub fn from_pool(pool: DbPool, db_path: PathBuf) -> Self {
        Self { pool, db_path }
    }

    pub fn shared() -> Result<Self> {
        if let Some(storage) = DEFAULT_STORAGE.get() {
            return Ok(storage.clone());
        }
        let storage = Self::new()?;
        let _ = DEFAULT_STORAGE.set(storage);
        Ok(DEFAULT_STORAGE
            .get()
            .expect("storage initialized above")
            .clone())
    }

    pub fn shared_in_app_data_dir(app_data_dir: &Path) -> Result<Self> {
        if let Some(storage) = DEFAULT_STORAGE.get() {
            return Ok(storage.clone());
        }
        let storage = Self::new_in_app_data_dir(app_data_dir)?;
        let _ = DEFAULT_STORAGE.set(storage);
        Ok(DEFAULT_STORAGE
            .get()
            .expect("storage initialized above")
            .clone())
    }

    pub fn pool(&self) -> DbPool {
        self.pool.clone()
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }
}

// Process-wide SQLite backend. The previous implementation called
// `create_pool(&db_path)` from every `open_note` / `save_note` /
// `initialize_workspace` invocation — each call opened four connections,
// set WAL mode on each, and re-ran all migrations. On a warm SSD that's
// 10-30ms per click; on a cold one, much more. The r2d2 pool is already
// an Arc internally, so a process-wide OnceLock is the right shape —
// build it once, clone the handle (cheap) on every request.
static DEFAULT_STORAGE: OnceLock<SqliteStorage> = OnceLock::new();

pub(crate) fn shared_pool() -> Result<DbPool> {
    Ok(SqliteStorage::shared()?.pool())
}

impl SqliteStorage {
    pub fn load_settings(&self) -> AppSettings {
        db::settings::get(&self.pool, APP_SETTINGS_KEY)
            .ok()
            .flatten()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default()
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        let json = serde_json::to_string(settings)?;
        db::settings::set(&self.pool, APP_SETTINGS_KEY, &json)?;
        Ok(())
    }

    pub fn load_workspace_settings(&self, workspace: &Workspace) -> WorkspaceSettingsOverrides {
        db::settings::get(&self.pool, &workspace_settings_key(&workspace.id))
            .ok()
            .flatten()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default()
    }

    pub fn save_workspace_settings(
        &self,
        workspace: &Workspace,
        overrides: &WorkspaceSettingsOverrides,
    ) -> Result<()> {
        let json = serde_json::to_string(overrides)?;
        db::settings::set(&self.pool, &workspace_settings_key(&workspace.id), &json)?;
        Ok(())
    }

    pub fn load_workspace_tree_state(&self, workspace: &Workspace) -> WorkspaceTreeState {
        db::settings::get(&self.pool, &workspace_tree_state_key(&workspace.id))
            .ok()
            .flatten()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default()
    }

    pub fn save_workspace_tree_state(
        &self,
        workspace: &Workspace,
        state: &WorkspaceTreeState,
    ) -> Result<()> {
        let json = serde_json::to_string(state)?;
        db::settings::set(&self.pool, &workspace_tree_state_key(&workspace.id), &json)?;
        Ok(())
    }

    pub fn bootstrap_from_env_or_current_dir(&self) -> WorkspaceBootstrap {
        let settings = self.load_settings();
        let workspace_root = std::env::var_os("PAPYRO_WORKSPACE")
            .map(PathBuf::from)
            .or_else(|| std::env::current_dir().ok());

        let Some(workspace_root) = workspace_root else {
            return WorkspaceBootstrap {
                status_message: "No workspace selected".to_string(),
                error_message: Some(
                    "Unable to resolve PAPYRO_WORKSPACE or current directory".to_string(),
                ),
                settings: settings.clone(),
                global_settings: settings,
                ..WorkspaceBootstrap::default()
            };
        };

        let mut bootstrap = self.bootstrap_from_workspace(&workspace_root);
        bootstrap.settings = settings.clone();
        bootstrap.global_settings = settings;
        bootstrap
    }

    pub fn bootstrap_from_workspace(&self, root: &Path) -> WorkspaceBootstrap {
        match self.initialize_workspace(root) {
            Ok(snapshot) => {
                let mut file_state = FileState::default();
                file_state.set_workspace(
                    snapshot.workspace.clone(),
                    snapshot.file_tree.clone(),
                    snapshot.recent_files.clone(),
                    snapshot.trashed_notes.clone(),
                );
                file_state.workspaces = self.recent_workspaces_with_current(&snapshot.workspace);
                file_state.expanded_paths = self
                    .load_workspace_tree_state(&snapshot.workspace)
                    .expanded_path_set();
                let global_settings = self.load_settings();
                let workspace_settings = self.load_workspace_settings(&snapshot.workspace);
                let settings = global_settings.with_workspace_overrides(&workspace_settings);

                WorkspaceBootstrap {
                    file_state,
                    workspace_root: Some(snapshot.workspace.path.clone()),
                    db_path: Some(snapshot.db_path),
                    status_message: format!(
                        "Loaded {} notes from {}",
                        note_count(&snapshot.file_tree),
                        snapshot.workspace.path.display()
                    ),
                    error_message: None,
                    settings,
                    global_settings,
                    workspace_settings,
                }
            }
            Err(error) => WorkspaceBootstrap {
                workspace_root: Some(root.to_path_buf()),
                db_path: None,
                status_message: format!("Failed to load workspace: {}", root.display()),
                error_message: Some(error.to_string()),
                ..WorkspaceBootstrap::default()
            },
        }
    }

    pub fn open_note(&self, workspace: &Workspace, path: &Path) -> Result<OpenedNote> {
        let content = fs::read_note(path)?;
        let note_meta = upsert_note_meta_for_path(&self.pool, workspace, path, &content)?;
        let opened_at = Utc::now().timestamp_millis();
        db::recent::record_open(&self.pool, &note_meta.id, opened_at)?;
        let recent_files = db::recent::list_recent(&self.pool, 10)?;

        Ok(OpenedNote {
            tab: EditorTab {
                id: format!("tab-{}", note_meta.id),
                note_id: note_meta.id,
                title: note_meta.title,
                path: path.to_path_buf(),
                is_dirty: false,
                save_status: papyro_core::models::SaveStatus::Saved,
            },
            content,
            recent_files,
        })
    }

    pub fn save_note(
        &self,
        workspace: &Workspace,
        tab: &EditorTab,
        content: &str,
    ) -> Result<SavedNote> {
        fs::write_note(&tab.path, content)?;
        let note_meta = upsert_note_meta_for_path(&self.pool, workspace, &tab.path, content)?;

        Ok(SavedNote {
            tab_id: tab.id.clone(),
            title: note_meta.title,
        })
    }

    pub fn rename_path(
        &self,
        workspace: &Workspace,
        path: &Path,
        new_name: &str,
    ) -> Result<PathBuf> {
        let was_dir = path.is_dir();
        let old_path = path.to_path_buf();
        let new_path = if was_dir {
            fs::rename_folder(path, new_name)?
        } else {
            fs::rename_note(path, new_name)?
        };

        for (old_id, new_id, new_relative_path) in
            renamed_note_ids(workspace, &old_path, &new_path)?
        {
            db::notes::update_note_id(&self.pool, &old_id, &new_id, &new_relative_path)?;
        }

        rewrite_moved_image_links(&self.pool, workspace, &old_path, &new_path)?;

        Ok(new_path)
    }

    pub fn move_path(
        &self,
        workspace: &Workspace,
        path: &Path,
        target_dir: &Path,
    ) -> Result<PathBuf> {
        let was_dir = path.is_dir();
        let old_path = path.to_path_buf();
        let new_path = if was_dir {
            fs::move_folder(path, target_dir)?
        } else {
            fs::move_note(path, target_dir)?
        };

        for (old_id, new_id, new_relative_path) in
            renamed_note_ids(workspace, &old_path, &new_path)?
        {
            db::notes::update_note_id(&self.pool, &old_id, &new_id, &new_relative_path)?;
        }

        rewrite_moved_image_links(&self.pool, workspace, &old_path, &new_path)?;

        Ok(new_path)
    }

    pub fn preview_delete_path(&self, workspace: &Workspace, path: &Path) -> Result<DeletePreview> {
        Ok(DeletePreview {
            orphaned_assets: orphaned_assets_after_delete(workspace, path)?,
        })
    }

    pub fn trash_path(&self, workspace: &Workspace, path: &Path) -> Result<PathBuf> {
        let mut trashed_at = Utc::now().timestamp_millis();
        let trash_root = workspace.path.join(WORKSPACE_TRASH_DIR_NAME);
        let relative_path = path.strip_prefix(&workspace.path).unwrap_or(path);
        let mut trash_batch_dir = trash_root.join(trashed_at.to_string());
        while trash_batch_dir.exists() {
            trashed_at += 1;
            trash_batch_dir = trash_root.join(trashed_at.to_string());
        }
        let trash_path = trash_batch_dir.join(relative_path);

        if let Some(parent) = trash_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::rename(path, &trash_path)?;

        for note_path in markdown_files_under(&trash_path) {
            let relative = note_path
                .strip_prefix(&trash_path)
                .unwrap_or(&note_path)
                .to_path_buf();
            let original_note_path = path.join(relative);
            let original_relative = original_note_path
                .strip_prefix(&workspace.path)
                .unwrap_or(&original_note_path);
            let note_id = stable_note_id(workspace, original_relative);
            db::notes::trash_note(&self.pool, &note_id, trashed_at)?;
        }

        Ok(trash_path)
    }

    pub fn list_trashed_notes(&self, workspace: &Workspace) -> Result<Vec<TrashedNote>> {
        db::notes::list_trashed_notes(&self.pool, &workspace.id)
    }

    pub fn restore_trashed_note(&self, workspace: &Workspace, note_id: &str) -> Result<PathBuf> {
        let trashed = self
            .list_trashed_notes(workspace)?
            .into_iter()
            .find(|item| item.note.id == note_id)
            .ok_or_else(|| anyhow::anyhow!("Missing trashed note {note_id}"))?;
        let trash_path = workspace
            .path
            .join(WORKSPACE_TRASH_DIR_NAME)
            .join(trashed.trashed_at.to_string())
            .join(&trashed.note.relative_path);
        let restore_path = unique_restore_path(&workspace.path.join(&trashed.note.relative_path));

        if let Some(parent) = restore_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::rename(&trash_path, &restore_path)?;

        let restored_relative = restore_path
            .strip_prefix(&workspace.path)
            .unwrap_or(&restore_path)
            .to_path_buf();
        if restored_relative != trashed.note.relative_path {
            let new_id = stable_note_id(workspace, &restored_relative);
            db::notes::update_note_id(&self.pool, note_id, &new_id, &restored_relative)?;
            db::notes::restore_note(&self.pool, &new_id)?;
        } else {
            db::notes::restore_note(&self.pool, note_id)?;
        }

        Ok(restore_path)
    }

    pub fn initialize_workspace(&self, root: &Path) -> Result<WorkspaceSnapshot> {
        let workspace = ensure_workspace(&self.pool, root)?;
        let mut file_tree = fs::scan_workspace(root)?;

        sync_workspace_notes(&self.pool, &workspace, root, &file_tree)?;
        attach_note_ids(&mut file_tree, &workspace);
        prune_missing_recent_files(&self.pool, &workspace, &file_tree)?;

        let now = Utc::now().timestamp_millis();
        db::workspaces::update_last_opened(&self.pool, &workspace.id, now)?;
        let recent_files = db::recent::list_recent(&self.pool, 10)?;
        let trashed_notes = self.list_trashed_notes(&workspace)?;

        Ok(WorkspaceSnapshot {
            workspace: Workspace {
                last_opened: Some(now),
                ..workspace
            },
            file_tree,
            recent_files,
            trashed_notes,
            db_path: self.db_path.clone(),
        })
    }

    pub fn reload_workspace_tree(
        &self,
        workspace: &Workspace,
    ) -> Result<(Vec<FileNode>, Vec<RecentFile>)> {
        let mut file_tree = fs::scan_workspace(&workspace.path)?;
        attach_note_ids(&mut file_tree, workspace);
        prune_missing_recent_files(&self.pool, workspace, &file_tree)?;
        let recent_files = db::recent::list_recent(&self.pool, 10)?;
        Ok((file_tree, recent_files))
    }

    pub fn search_workspace(
        &self,
        workspace: &Workspace,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchResult>> {
        index::search_workspace(workspace, query, limit)
    }

    pub fn search_workspace_with_query(
        &self,
        workspace: &Workspace,
        query: &WorkspaceSearchQuery,
    ) -> Result<Vec<SearchResult>> {
        index::search_workspace_with_query(workspace, query)
    }

    pub fn set_note_favorite(
        &self,
        workspace: &Workspace,
        path: &Path,
        favorite: bool,
    ) -> Result<()> {
        let relative_path = path.strip_prefix(&workspace.path).unwrap_or(path);
        let note_id = stable_note_id(workspace, relative_path);
        db::notes::set_favorite(&self.pool, &note_id, favorite)
    }

    pub fn list_recent_workspaces(&self, limit: usize) -> Result<Vec<Workspace>> {
        db::workspaces::list_recent_workspaces(&self.pool, limit)
    }

    fn recent_workspaces_with_current(&self, current: &Workspace) -> Vec<Workspace> {
        let mut workspaces = self.list_recent_workspaces(10).unwrap_or_else(|error| {
            tracing::warn!("Failed to load recent workspaces: {error}");
            Vec::new()
        });

        if !workspaces
            .iter()
            .any(|workspace| workspace.id == current.id)
        {
            workspaces.insert(0, current.clone());
        }

        workspaces
    }
}

impl NoteStorage for SqliteStorage {
    fn open_note(&self, workspace: &Workspace, path: &Path) -> Result<OpenedNote> {
        SqliteStorage::open_note(self, workspace, path)
    }

    fn save_note(
        &self,
        workspace: &Workspace,
        tab: &EditorTab,
        content: &str,
    ) -> Result<SavedNote> {
        SqliteStorage::save_note(self, workspace, tab, content)
    }

    fn create_note(&self, parent: &Path, name: &str) -> Result<PathBuf> {
        fs::create_note(parent, name)
    }

    fn create_folder(&self, parent: &Path, name: &str) -> Result<PathBuf> {
        fs::create_folder(parent, name)
    }

    fn delete_path(&self, path: &Path) -> Result<()> {
        if path.is_dir() {
            fs::delete_folder(path)
        } else {
            fs::delete_note(path)
        }
    }

    fn trash_path(&self, workspace: &Workspace, path: &Path) -> Result<PathBuf> {
        SqliteStorage::trash_path(self, workspace, path)
    }

    fn list_trashed_notes(&self, workspace: &Workspace) -> Result<Vec<TrashedNote>> {
        SqliteStorage::list_trashed_notes(self, workspace)
    }

    fn restore_trashed_note(&self, workspace: &Workspace, note_id: &str) -> Result<PathBuf> {
        SqliteStorage::restore_trashed_note(self, workspace, note_id)
    }

    fn preview_delete_path(&self, workspace: &Workspace, path: &Path) -> Result<DeletePreview> {
        SqliteStorage::preview_delete_path(self, workspace, path)
    }

    fn delete_paths(&self, paths: &[PathBuf]) -> Result<()> {
        for path in paths {
            if path.is_dir() {
                fs::delete_folder(path)?;
            } else if path.exists() {
                fs::delete_note(path)?;
            }
        }

        Ok(())
    }

    fn rename_path(&self, workspace: &Workspace, path: &Path, new_name: &str) -> Result<PathBuf> {
        SqliteStorage::rename_path(self, workspace, path, new_name)
    }

    fn move_path(&self, workspace: &Workspace, path: &Path, target_dir: &Path) -> Result<PathBuf> {
        SqliteStorage::move_path(self, workspace, path, target_dir)
    }

    fn bootstrap_from_workspace(&self, root: &Path) -> WorkspaceBootstrap {
        SqliteStorage::bootstrap_from_workspace(self, root)
    }

    fn initialize_workspace(&self, root: &Path) -> Result<WorkspaceSnapshot> {
        SqliteStorage::initialize_workspace(self, root)
    }

    fn reload_workspace_tree(
        &self,
        workspace: &Workspace,
    ) -> Result<(Vec<FileNode>, Vec<RecentFile>)> {
        SqliteStorage::reload_workspace_tree(self, workspace)
    }

    fn search_workspace(
        &self,
        workspace: &Workspace,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchResult>> {
        SqliteStorage::search_workspace(self, workspace, query, limit)
    }

    fn search_workspace_with_query(
        &self,
        workspace: &Workspace,
        query: &WorkspaceSearchQuery,
    ) -> Result<Vec<SearchResult>> {
        SqliteStorage::search_workspace_with_query(self, workspace, query)
    }

    fn set_note_favorite(&self, workspace: &Workspace, path: &Path, favorite: bool) -> Result<()> {
        SqliteStorage::set_note_favorite(self, workspace, path, favorite)
    }

    fn list_recent_workspaces(&self, limit: usize) -> Result<Vec<Workspace>> {
        SqliteStorage::list_recent_workspaces(self, limit)
    }

    fn list_recent(&self, limit: usize) -> Result<Vec<RecentFile>> {
        db::recent::list_recent(&self.pool, limit)
    }

    fn load_settings(&self) -> AppSettings {
        SqliteStorage::load_settings(self)
    }

    fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        SqliteStorage::save_settings(self, settings)
    }

    fn load_workspace_settings(&self, workspace: &Workspace) -> WorkspaceSettingsOverrides {
        SqliteStorage::load_workspace_settings(self, workspace)
    }

    fn save_workspace_settings(
        &self,
        workspace: &Workspace,
        overrides: &WorkspaceSettingsOverrides,
    ) -> Result<()> {
        SqliteStorage::save_workspace_settings(self, workspace, overrides)
    }

    fn load_workspace_tree_state(&self, workspace: &Workspace) -> WorkspaceTreeState {
        SqliteStorage::load_workspace_tree_state(self, workspace)
    }

    fn save_workspace_tree_state(
        &self,
        workspace: &Workspace,
        state: &WorkspaceTreeState,
    ) -> Result<()> {
        SqliteStorage::save_workspace_tree_state(self, workspace, state)
    }
}

pub fn load_app_settings() -> AppSettings {
    SqliteStorage::shared()
        .map(|storage| storage.load_settings())
        .unwrap_or_default()
}

pub fn save_app_settings(settings: &AppSettings) -> Result<()> {
    SqliteStorage::shared()?.save_settings(settings)
}

pub fn load_workspace_settings(workspace: &Workspace) -> Result<WorkspaceSettingsOverrides> {
    Ok(SqliteStorage::shared()?.load_workspace_settings(workspace))
}

pub fn save_workspace_settings(
    workspace: &Workspace,
    overrides: &WorkspaceSettingsOverrides,
) -> Result<()> {
    SqliteStorage::shared()?.save_workspace_settings(workspace, overrides)
}

pub fn load_workspace_tree_state(workspace: &Workspace) -> Result<WorkspaceTreeState> {
    Ok(SqliteStorage::shared()?.load_workspace_tree_state(workspace))
}

pub fn save_workspace_tree_state(workspace: &Workspace, state: &WorkspaceTreeState) -> Result<()> {
    SqliteStorage::shared()?.save_workspace_tree_state(workspace, state)
}

pub fn bootstrap_from_env_or_current_dir() -> WorkspaceBootstrap {
    SqliteStorage::shared()
        .map(|storage| storage.bootstrap_from_env_or_current_dir())
        .unwrap_or_else(|error| WorkspaceBootstrap {
            status_message: "Failed to initialize storage".to_string(),
            error_message: Some(error.to_string()),
            settings: AppSettings::default(),
            global_settings: AppSettings::default(),
            ..WorkspaceBootstrap::default()
        })
}

pub fn bootstrap_from_workspace(root: &Path) -> WorkspaceBootstrap {
    SqliteStorage::shared()
        .map(|storage| storage.bootstrap_from_workspace(root))
        .unwrap_or_else(|error| WorkspaceBootstrap {
            workspace_root: Some(root.to_path_buf()),
            status_message: "Failed to initialize storage".to_string(),
            error_message: Some(error.to_string()),
            ..WorkspaceBootstrap::default()
        })
}

pub fn create_note_in_workspace(workspace: &Workspace, suggested_name: &str) -> Result<PathBuf> {
    fs::create_note(&workspace.path, suggested_name)
}

pub fn create_folder_in_workspace(workspace: &Workspace, suggested_name: &str) -> Result<PathBuf> {
    fs::create_folder(&workspace.path, suggested_name)
}

pub fn create_note_in_directory(directory: &Path, suggested_name: &str) -> Result<PathBuf> {
    fs::create_note(directory, suggested_name)
}

pub fn create_folder_in_directory(directory: &Path, suggested_name: &str) -> Result<PathBuf> {
    fs::create_folder(directory, suggested_name)
}

pub fn rename_path(workspace: &Workspace, path: &Path, new_name: &str) -> Result<PathBuf> {
    SqliteStorage::shared()?.rename_path(workspace, path, new_name)
}

pub fn move_path(workspace: &Workspace, path: &Path, target_dir: &Path) -> Result<PathBuf> {
    SqliteStorage::shared()?.move_path(workspace, path, target_dir)
}

pub fn delete_path(path: &Path) -> Result<()> {
    let storage = SqliteStorage::shared()?;
    NoteStorage::delete_path(&storage, path)
}

pub fn open_note(workspace: &Workspace, path: &Path) -> Result<OpenedNote> {
    SqliteStorage::shared()?.open_note(workspace, path)
}

pub fn save_note(workspace: &Workspace, tab: &EditorTab, content: &str) -> Result<SavedNote> {
    SqliteStorage::shared()?.save_note(workspace, tab, content)
}

pub fn initialize_workspace(root: &Path) -> Result<WorkspaceSnapshot> {
    SqliteStorage::shared()?.initialize_workspace(root)
}

/// Cheap re-scan for an already-known workspace.
///
/// The full `initialize_workspace` path iterates every markdown file in the
/// tree, reads its content, hashes metadata, and upserts a DB row. That made
/// sense at first-workspace-open time, but it was also being triggered from
/// `reload_workspace_preserving_tree` after every save, rename, create,
/// delete, and from the file-watcher — so a 100-note workspace paid 100 disk
/// reads + 100 DB writes per mutation, all on the UI thread. Meanwhile
/// `open_note` / `save_note` / `rename_path` each already upsert the single
/// note they touch, which makes the full resync entirely redundant for our
/// own operations.
///
/// This variant does only what a post-mutation reload actually needs: walk
/// the directory, re-attach deterministic note IDs (no DB query), and fetch
/// the recent list. Cost is effectively a directory stat, not O(N) file IO.
pub fn reload_workspace_tree(workspace: &Workspace) -> Result<(Vec<FileNode>, Vec<RecentFile>)> {
    SqliteStorage::shared()?.reload_workspace_tree(workspace)
}

pub fn list_recent_workspaces(limit: usize) -> Result<Vec<Workspace>> {
    SqliteStorage::shared()?.list_recent_workspaces(limit)
}

fn ensure_workspace(pool: &DbPool, root: &Path) -> Result<Workspace> {
    if let Some(existing) = db::workspaces::find_workspace_by_path(pool, root)? {
        return Ok(existing);
    }

    let now = Utc::now().timestamp_millis();
    let workspace = Workspace {
        id: uuid::Uuid::new_v4().to_string(),
        name: root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Workspace")
            .to_string(),
        path: root.to_path_buf(),
        created_at: now,
        last_opened: Some(now),
        sort_order: 0,
    };

    db::workspaces::insert_workspace(pool, &workspace)?;
    Ok(workspace)
}

fn workspace_settings_key(workspace_id: &str) -> String {
    format!("{WORKSPACE_SETTINGS_PREFIX}{workspace_id}")
}

fn workspace_tree_state_key(workspace_id: &str) -> String {
    format!("{WORKSPACE_TREE_STATE_PREFIX}{workspace_id}")
}

fn sync_workspace_notes(
    pool: &DbPool,
    workspace: &Workspace,
    root: &Path,
    nodes: &[FileNode],
) -> Result<()> {
    for note in flatten_notes(nodes) {
        let content = fs::read_note(&note.path)?;
        let note_meta = build_note_meta(workspace, root, &note.path, &content)?;
        db::notes::upsert_note(pool, &note_meta)?;
    }

    Ok(())
}

fn flatten_notes(nodes: &[FileNode]) -> Vec<&FileNode> {
    let mut output = Vec::new();
    for node in nodes {
        match &node.kind {
            FileNodeKind::Directory { children, .. } => output.extend(flatten_notes(children)),
            FileNodeKind::Note { .. } => output.push(node),
        }
    }
    output
}

fn attach_note_ids(nodes: &mut [FileNode], workspace: &Workspace) {
    for node in nodes {
        match &mut node.kind {
            FileNodeKind::Directory { children, .. } => attach_note_ids(children, workspace),
            FileNodeKind::Note { note_id } => {
                *note_id = Some(stable_note_id(workspace, &node.relative_path));
            }
        }
    }
}

fn prune_missing_recent_files(
    pool: &DbPool,
    workspace: &Workspace,
    nodes: &[FileNode],
) -> Result<()> {
    let existing_note_ids = flatten_notes(nodes)
        .into_iter()
        .map(|note| stable_note_id(workspace, &note.relative_path))
        .collect::<Vec<_>>();

    db::recent::remove_missing_files(pool, &workspace.id, &existing_note_ids)
}

fn upsert_note_meta_for_path(
    pool: &DbPool,
    workspace: &Workspace,
    path: &Path,
    content: &str,
) -> Result<NoteMeta> {
    let note_meta = build_note_meta(workspace, &workspace.path, path, content)?;
    db::notes::upsert_note(pool, &note_meta)?;
    Ok(note_meta)
}

fn build_note_meta(
    workspace: &Workspace,
    root: &Path,
    path: &Path,
    content: &str,
) -> Result<NoteMeta> {
    let metadata = std::fs::metadata(path)?;
    let relative_path = path.strip_prefix(root).unwrap_or(path).to_path_buf();
    let created_at = metadata
        .created()
        .ok()
        .and_then(system_time_to_millis)
        .unwrap_or(workspace.created_at);
    let updated_at = metadata
        .modified()
        .ok()
        .and_then(system_time_to_millis)
        .unwrap_or(created_at);

    Ok(NoteMeta {
        id: stable_note_id(workspace, &relative_path),
        workspace_id: workspace.id.clone(),
        relative_path,
        title: fs::extract_title(path, content),
        created_at,
        updated_at,
        word_count: fs::count_words(content),
        char_count: content.chars().count() as u32,
        is_favorite: false,
        is_trashed: false,
        tags: fs::extract_front_matter_tags(content)
            .into_iter()
            .map(|name| papyro_core::models::Tag {
                id: tag_id(&name),
                name,
                color: "#6B7280".to_string(),
            })
            .collect(),
    })
}

fn note_count(nodes: &[FileNode]) -> usize {
    nodes
        .iter()
        .map(|node| match &node.kind {
            FileNodeKind::Directory { children, .. } => note_count(children),
            FileNodeKind::Note { .. } => 1,
        })
        .sum()
}

fn stable_note_id(workspace: &Workspace, relative_path: &Path) -> String {
    format!("{}::{}", workspace.id, relative_path.to_string_lossy())
}

fn unique_restore_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }

    let parent = path.parent().unwrap_or(Path::new(""));
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("restored");
    let extension = path.extension().and_then(|extension| extension.to_str());

    for index in 1..=999 {
        let file_name = match extension {
            Some(extension) => format!("{stem} ({index}).{extension}"),
            None => format!("{stem} ({index})"),
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    path.to_path_buf()
}

fn tag_id(name: &str) -> String {
    name.trim().to_lowercase()
}

fn renamed_note_ids(
    workspace: &Workspace,
    old_path: &Path,
    new_path: &Path,
) -> Result<Vec<(String, String, PathBuf)>> {
    let mut updates = Vec::new();

    if new_path.is_dir() {
        for entry in walkdir::WalkDir::new(new_path)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file() && is_markdown(entry.path()))
        {
            let new_note_path = entry.path();
            let suffix = new_note_path
                .strip_prefix(new_path)
                .unwrap_or(new_note_path);
            let old_note_path = old_path.join(suffix);
            push_note_id_update(workspace, &old_note_path, new_note_path, &mut updates);
        }
    } else if is_markdown(new_path) {
        push_note_id_update(workspace, old_path, new_path, &mut updates);
    }

    Ok(updates)
}

fn push_note_id_update(
    workspace: &Workspace,
    old_note_path: &Path,
    new_note_path: &Path,
    updates: &mut Vec<(String, String, PathBuf)>,
) {
    let old_relative = old_note_path
        .strip_prefix(&workspace.path)
        .unwrap_or(old_note_path)
        .to_path_buf();
    let new_relative = new_note_path
        .strip_prefix(&workspace.path)
        .unwrap_or(new_note_path)
        .to_path_buf();
    updates.push((
        stable_note_id(workspace, &old_relative),
        stable_note_id(workspace, &new_relative),
        new_relative,
    ));
}

fn rewrite_moved_image_links(
    pool: &DbPool,
    workspace: &Workspace,
    old_path: &Path,
    new_path: &Path,
) -> Result<()> {
    let moved_root = new_path.is_dir().then_some((old_path, new_path));

    if new_path.is_dir() {
        for entry in walkdir::WalkDir::new(new_path)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file() && is_markdown(entry.path()))
        {
            let new_note_path = entry.path();
            let suffix = new_note_path
                .strip_prefix(new_path)
                .unwrap_or(new_note_path);
            let old_note_path = old_path.join(suffix);
            rewrite_note_image_links(pool, workspace, &old_note_path, new_note_path, moved_root)?;
        }
    } else if is_markdown(new_path) {
        rewrite_note_image_links(pool, workspace, old_path, new_path, moved_root)?;
    }

    Ok(())
}

fn rewrite_note_image_links(
    pool: &DbPool,
    workspace: &Workspace,
    old_note_path: &Path,
    new_note_path: &Path,
    moved_root: Option<(&Path, &Path)>,
) -> Result<()> {
    let content = fs::read_note(new_note_path)?;
    let rewritten = rewrite_moved_note_image_links(
        &content,
        &workspace.path,
        old_note_path,
        new_note_path,
        moved_root,
    );

    if rewritten != content {
        fs::write_note(new_note_path, &rewritten)?;
        upsert_note_meta_for_path(pool, workspace, new_note_path, &rewritten)?;
    }

    Ok(())
}

fn orphaned_assets_after_delete(workspace: &Workspace, delete_path: &Path) -> Result<Vec<PathBuf>> {
    let assets_dir = workspace_assets_dir(workspace);
    let deleting_notes = markdown_files_under(delete_path);
    if deleting_notes.is_empty() {
        return Ok(Vec::new());
    }

    let mut deleting_assets = Vec::new();
    for note_path in &deleting_notes {
        let content = fs::read_note(note_path)?;
        collect_existing_assets(
            workspace,
            &assets_dir,
            note_path,
            &content,
            &mut deleting_assets,
        );
    }

    if deleting_assets.is_empty() {
        return Ok(Vec::new());
    }

    let remaining_notes = remaining_workspace_notes(workspace, delete_path);
    let mut retained_assets = Vec::new();
    for note_path in remaining_notes {
        let content = fs::read_note(&note_path)?;
        collect_existing_assets(
            workspace,
            &assets_dir,
            &note_path,
            &content,
            &mut retained_assets,
        );
    }

    deleting_assets.retain(|asset| !retained_assets.contains(asset));
    deleting_assets.sort();
    deleting_assets.dedup();
    Ok(deleting_assets)
}

fn collect_existing_assets(
    workspace: &Workspace,
    assets_dir: &Path,
    note_path: &Path,
    content: &str,
    output: &mut Vec<PathBuf>,
) {
    for target in local_markdown_image_targets(content, &workspace.path, note_path) {
        if target.starts_with(assets_dir) && target.is_file() && !output.contains(&target) {
            output.push(target);
        }
    }
}

fn markdown_files_under(path: &Path) -> Vec<PathBuf> {
    if path.is_file() && is_markdown(path) {
        return vec![path.to_path_buf()];
    }
    if !path.is_dir() {
        return Vec::new();
    }

    walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && is_markdown(entry.path()))
        .map(|entry| entry.path().to_path_buf())
        .collect()
}

fn remaining_workspace_notes(workspace: &Workspace, delete_path: &Path) -> Vec<PathBuf> {
    walkdir::WalkDir::new(&workspace.path)
        .into_iter()
        .filter_entry(|entry| entry.path() != delete_path)
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && is_markdown(entry.path()))
        .map(|entry| entry.path().to_path_buf())
        .collect()
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
}

fn system_time_to_millis(time: std::time::SystemTime) -> Option<i64> {
    time.duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_storage(temp: &tempfile::TempDir) -> Result<SqliteStorage> {
        let db_path = temp.path().join("meta.db");
        Ok(SqliteStorage::from_pool(create_pool(&db_path)?, db_path))
    }

    fn create_workspace(temp: &tempfile::TempDir) -> Result<PathBuf> {
        let workspace_root = temp.path().join("workspace");
        std::fs::create_dir_all(&workspace_root)?;
        Ok(workspace_root)
    }

    #[test]
    fn build_note_meta_extracts_front_matter_tags() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let note_path = workspace_root.join("tagged.md");
        let content = "---\ntags:\n  - Rust\n  - search\n---\n# Tagged";
        std::fs::write(&note_path, content)?;
        let workspace = Workspace {
            id: "workspace".to_string(),
            name: "Workspace".to_string(),
            path: workspace_root.clone(),
            created_at: 1,
            last_opened: None,
            sort_order: 0,
        };

        let meta = build_note_meta(&workspace, &workspace_root, &note_path, content)?;

        assert_eq!(
            meta.tags
                .iter()
                .map(|tag| (tag.id.as_str(), tag.name.as_str(), tag.color.as_str()))
                .collect::<Vec<_>>(),
            vec![("rust", "Rust", "#6B7280"), ("search", "search", "#6B7280")]
        );

        Ok(())
    }

    #[test]
    fn note_metadata_persists_front_matter_tags() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let note_path = workspace_root.join("tagged.md");
        std::fs::write(
            &note_path,
            "---\ntags: [Rust, search]\n---\n# Tagged\n\nhello",
        )?;
        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;

        let notes = db::notes::list_notes_in_workspace(&storage.pool, &workspace.id)?;
        assert_eq!(notes.len(), 1);
        assert_eq!(
            notes[0]
                .tags
                .iter()
                .map(|tag| tag.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Rust", "search"]
        );

        let opened = storage.open_note(&workspace, &note_path)?;
        storage.save_note(
            &workspace,
            &opened.tab,
            "---\ntags:\n  - archive\n---\n# Tagged\n\nupdated",
        )?;
        let meta =
            db::notes::get_note(&storage.pool, &opened.tab.note_id)?.expect("note metadata exists");

        assert_eq!(
            meta.tags
                .iter()
                .map(|tag| tag.name.as_str())
                .collect::<Vec<_>>(),
            vec!["archive"]
        );

        Ok(())
    }

    #[test]
    fn note_metadata_upsert_preserves_favorite_state() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let note_path = workspace_root.join("favorite.md");
        std::fs::write(&note_path, "# Favorite\n\nold")?;
        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;
        let opened = storage.open_note(&workspace, &note_path)?;

        db::notes::set_favorite(&storage.pool, &opened.tab.note_id, true)?;
        storage.save_note(&workspace, &opened.tab, "# Favorite\n\nnew")?;

        let meta =
            db::notes::get_note(&storage.pool, &opened.tab.note_id)?.expect("note metadata exists");
        assert!(meta.is_favorite);

        Ok(())
    }

    #[test]
    fn set_note_favorite_updates_note_metadata() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let note_path = workspace_root.join("favorite.md");
        std::fs::write(&note_path, "# Favorite")?;
        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;

        storage.set_note_favorite(&workspace, &note_path, true)?;
        let note_id = stable_note_id(&workspace, Path::new("favorite.md"));
        let meta = db::notes::get_note(&storage.pool, &note_id)?.expect("note metadata exists");
        assert!(meta.is_favorite);

        storage.set_note_favorite(&workspace, &note_path, false)?;
        let meta = db::notes::get_note(&storage.pool, &note_id)?.expect("note metadata exists");
        assert!(!meta.is_favorite);

        Ok(())
    }

    #[test]
    fn trash_path_moves_note_and_marks_metadata_trashed() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let note_path = workspace_root.join("notes").join("old.md");
        std::fs::create_dir_all(note_path.parent().unwrap())?;
        std::fs::write(&note_path, "# Old")?;
        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;
        let note_id = stable_note_id(&workspace, Path::new("notes").join("old.md").as_path());

        let trashed_path = storage.trash_path(&workspace, &note_path)?;

        assert!(!note_path.exists());
        assert!(trashed_path.ends_with(Path::new("notes").join("old.md")));
        assert!(trashed_path.exists());
        assert!(trashed_path.starts_with(workspace_root.join(WORKSPACE_TRASH_DIR_NAME)));
        assert!(db::notes::get_note(&storage.pool, &note_id)?.is_none());

        let conn = storage.pool.get()?;
        let is_trashed: i32 = conn.query_row(
            "SELECT is_trashed FROM notes WHERE id = ?1",
            rusqlite::params![note_id],
            |row| row.get(0),
        )?;
        assert_eq!(is_trashed, 1);

        Ok(())
    }

    #[test]
    fn restore_trashed_note_moves_file_back_and_untrashes_metadata() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let note_path = workspace_root.join("notes").join("old.md");
        std::fs::create_dir_all(note_path.parent().unwrap())?;
        std::fs::write(&note_path, "# Old")?;
        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;
        let note_id = stable_note_id(&workspace, Path::new("notes").join("old.md").as_path());

        let trashed_path = storage.trash_path(&workspace, &note_path)?;
        let trashed_notes = storage.list_trashed_notes(&workspace)?;

        assert_eq!(trashed_notes.len(), 1);
        assert_eq!(trashed_notes[0].note.id, note_id);

        let restored_path = storage.restore_trashed_note(&workspace, &note_id)?;

        assert_eq!(restored_path, note_path);
        assert!(note_path.exists());
        assert!(!trashed_path.exists());
        assert!(storage.list_trashed_notes(&workspace)?.is_empty());
        let restored =
            db::notes::get_note(&storage.pool, &note_id)?.expect("restored note metadata exists");
        assert_eq!(
            restored.relative_path,
            PathBuf::from("notes").join("old.md")
        );
        assert!(!restored.is_trashed);

        Ok(())
    }

    #[test]
    fn restore_trashed_note_renames_when_original_path_exists() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let note_path = workspace_root.join("notes").join("old.md");
        std::fs::create_dir_all(note_path.parent().unwrap())?;
        std::fs::write(&note_path, "# Old")?;
        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;
        let note_id = stable_note_id(&workspace, Path::new("notes").join("old.md").as_path());

        storage.trash_path(&workspace, &note_path)?;
        std::fs::write(&note_path, "# Replacement")?;

        let restored_path = storage.restore_trashed_note(&workspace, &note_id)?;
        let restored_relative = PathBuf::from("notes").join("old (1).md");
        let restored_id = stable_note_id(&workspace, &restored_relative);

        assert_eq!(restored_path, workspace_root.join(&restored_relative));
        assert_eq!(std::fs::read_to_string(&note_path)?, "# Replacement");
        assert_eq!(std::fs::read_to_string(&restored_path)?, "# Old");
        assert!(db::notes::get_note(&storage.pool, &note_id)?.is_none());
        let restored = db::notes::get_note(&storage.pool, &restored_id)?
            .expect("restored note metadata exists");
        assert_eq!(restored.relative_path, restored_relative);
        assert!(!restored.is_trashed);

        Ok(())
    }

    #[test]
    fn rename_note_updates_note_id_and_recent_files() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let old_path = workspace_root.join("old.md");
        std::fs::write(&old_path, "# Old\n\nBody")?;

        let storage = test_storage(&temp)?;
        let snapshot = storage.initialize_workspace(&workspace_root)?;
        let workspace = snapshot.workspace;
        let old_id = stable_note_id(&workspace, Path::new("old.md"));
        let new_id = stable_note_id(&workspace, Path::new("new.md"));

        storage.open_note(&workspace, &old_path)?;
        let new_path = storage.rename_path(&workspace, &old_path, "new")?;

        assert_eq!(
            new_path.file_name().and_then(|name| name.to_str()),
            Some("new.md")
        );
        assert!(db::notes::get_note(&storage.pool, &old_id)?.is_none());
        let renamed = db::notes::get_note(&storage.pool, &new_id)?.expect("renamed note exists");
        assert_eq!(renamed.relative_path, PathBuf::from("new.md"));

        let recent = storage.list_recent(10)?;
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].note_id, new_id);
        assert_eq!(recent[0].relative_path, PathBuf::from("new.md"));

        Ok(())
    }

    #[test]
    fn rename_note_rewrites_relative_workspace_asset_links() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let notes_dir = workspace_root.join("notes").join("daily");
        let assets_dir = workspace_root.join("assets");
        std::fs::create_dir_all(&notes_dir)?;
        std::fs::create_dir_all(&assets_dir)?;
        std::fs::write(assets_dir.join("logo.png"), b"png")?;
        let old_path = notes_dir.join("old.md");
        std::fs::write(&old_path, "![logo](../../assets/logo.png)")?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;

        let renamed_path = storage.rename_path(&workspace, &old_path, "renamed")?;

        assert_eq!(
            std::fs::read_to_string(renamed_path)?,
            "![logo](../../assets/logo.png)"
        );

        Ok(())
    }

    #[test]
    fn move_note_updates_note_id_and_recent_files() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let target_dir = workspace_root.join("archive");
        std::fs::create_dir_all(&target_dir)?;
        let old_path = workspace_root.join("old.md");
        std::fs::write(&old_path, "# Old\n\nBody")?;

        let storage = test_storage(&temp)?;
        let snapshot = storage.initialize_workspace(&workspace_root)?;
        let workspace = snapshot.workspace;
        let old_id = stable_note_id(&workspace, Path::new("old.md"));

        storage.open_note(&workspace, &old_path)?;
        let new_path = storage.move_path(&workspace, &old_path, &target_dir)?;
        let new_relative = new_path
            .strip_prefix(&workspace_root)
            .unwrap_or(&new_path)
            .to_path_buf();
        let new_id = stable_note_id(&workspace, &new_relative);

        assert_eq!(new_path, target_dir.join("old.md"));
        assert!(!old_path.exists());
        assert!(new_path.exists());
        assert!(db::notes::get_note(&storage.pool, &old_id)?.is_none());
        let moved = db::notes::get_note(&storage.pool, &new_id)?.expect("moved note exists");
        assert_eq!(moved.relative_path, new_relative);

        let recent = storage.list_recent(10)?;
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].note_id, new_id);
        assert_eq!(recent[0].relative_path, new_relative);

        Ok(())
    }

    #[test]
    fn move_note_rewrites_relative_workspace_asset_links() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let notes_dir = workspace_root.join("notes").join("daily");
        let archive_dir = workspace_root.join("archive");
        let assets_dir = workspace_root.join("assets");
        std::fs::create_dir_all(&notes_dir)?;
        std::fs::create_dir_all(&archive_dir)?;
        std::fs::create_dir_all(&assets_dir)?;
        std::fs::write(assets_dir.join("logo.png"), b"png")?;
        let note_path = notes_dir.join("note.md");
        std::fs::write(&note_path, "![logo](../../assets/logo.png)")?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;

        let moved_path = storage.move_path(&workspace, &note_path, &archive_dir)?;

        assert_eq!(
            std::fs::read_to_string(&moved_path)?,
            "![logo](../assets/logo.png)"
        );
        let moved_relative = moved_path
            .strip_prefix(&workspace_root)
            .unwrap_or(&moved_path)
            .to_path_buf();
        let moved_id = stable_note_id(&workspace, &moved_relative);
        let moved_meta = db::notes::get_note(&storage.pool, &moved_id)?.expect("moved note");
        assert_eq!(
            moved_meta.char_count,
            "![logo](../assets/logo.png)".chars().count() as u32
        );

        Ok(())
    }

    #[test]
    fn move_folder_preserves_links_to_assets_moved_with_folder() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let notes_dir = workspace_root.join("notes");
        let day_dir = notes_dir.join("day");
        let archive_dir = workspace_root.join("archive");
        std::fs::create_dir_all(day_dir.join("images"))?;
        std::fs::create_dir_all(&archive_dir)?;
        std::fs::write(day_dir.join("images").join("photo.png"), b"png")?;
        let note_path = day_dir.join("note.md");
        std::fs::write(&note_path, "![photo](images/photo.png)")?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;

        let moved_dir = storage.move_path(&workspace, &day_dir, &archive_dir)?;
        let moved_note = moved_dir.join("note.md");

        assert_eq!(
            std::fs::read_to_string(moved_note)?,
            "![photo](images/photo.png)"
        );

        Ok(())
    }

    #[test]
    fn open_note_reads_content_upserts_metadata_and_records_recent() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let note_path = workspace_root.join("note.md");
        std::fs::write(&note_path, "# Note Title\n\nhello world")?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;

        let opened = storage.open_note(&workspace, &note_path)?;

        assert_eq!(opened.content, "# Note Title\n\nhello world");
        assert_eq!(opened.tab.title, "Note Title");
        assert_eq!(opened.recent_files.len(), 1);
        assert_eq!(opened.recent_files[0].title, "Note Title");
        assert_eq!(opened.recent_files[0].workspace_id, workspace.id);
        assert_eq!(opened.recent_files[0].workspace_path, workspace.path);

        let meta =
            db::notes::get_note(&storage.pool, &opened.tab.note_id)?.expect("note metadata exists");
        assert_eq!(meta.relative_path, PathBuf::from("note.md"));
        assert_eq!(meta.word_count, 5);

        Ok(())
    }

    #[test]
    fn save_note_writes_file_and_updates_title_metadata() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let note_path = workspace_root.join("draft.md");
        std::fs::write(&note_path, "# Draft\n\nold")?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;
        let opened = storage.open_note(&workspace, &note_path)?;
        let saved = storage.save_note(&workspace, &opened.tab, "# Final\n\nnew body")?;

        assert_eq!(saved.tab_id, opened.tab.id);
        assert_eq!(saved.title, "Final");
        assert_eq!(std::fs::read_to_string(&note_path)?, "# Final\n\nnew body");

        let meta = db::notes::get_note(&storage.pool, &opened.tab.note_id)?
            .expect("saved note metadata exists");
        assert_eq!(meta.title, "Final");
        assert_eq!(meta.word_count, 4);

        Ok(())
    }

    #[test]
    fn delete_path_removes_note_from_workspace_tree() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let keep_path = workspace_root.join("keep.md");
        let delete_path = workspace_root.join("delete.md");
        std::fs::write(&keep_path, "# Keep")?;
        std::fs::write(&delete_path, "# Delete")?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;

        NoteStorage::delete_path(&storage, &delete_path)?;
        let (tree, _recent) = storage.reload_workspace_tree(&workspace)?;

        assert!(!delete_path.exists());
        assert_eq!(note_count(&tree), 1);
        assert!(tree.iter().any(|node| node.path == keep_path));
        assert!(!tree.iter().any(|node| node.path == delete_path));

        Ok(())
    }

    #[test]
    fn preview_delete_path_lists_only_unreferenced_workspace_assets() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let assets_dir = workspace_root.join("assets");
        std::fs::create_dir_all(&assets_dir)?;
        std::fs::write(assets_dir.join("orphan.png"), b"orphan")?;
        std::fs::write(assets_dir.join("shared.png"), b"shared")?;
        let delete_path = workspace_root.join("delete.md");
        let keep_path = workspace_root.join("keep.md");
        std::fs::write(
            &delete_path,
            "![orphan](assets/orphan.png)\n![shared](assets/shared.png)",
        )?;
        std::fs::write(&keep_path, "![shared](assets/shared.png)")?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;

        let preview = storage.preview_delete_path(&workspace, &delete_path)?;

        assert_eq!(preview.orphaned_assets, vec![assets_dir.join("orphan.png")]);
        assert!(assets_dir.join("orphan.png").exists());
        assert!(delete_path.exists());

        Ok(())
    }

    #[test]
    fn preview_delete_path_finds_orphans_for_deleted_folder() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let assets_dir = workspace_root.join("assets");
        let notes_dir = workspace_root.join("notes");
        std::fs::create_dir_all(&assets_dir)?;
        std::fs::create_dir_all(&notes_dir)?;
        std::fs::write(assets_dir.join("folder-only.png"), b"image")?;
        std::fs::write(
            notes_dir.join("delete.md"),
            "![only](../assets/folder-only.png)",
        )?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;

        let preview = storage.preview_delete_path(&workspace, &notes_dir)?;

        assert_eq!(
            preview.orphaned_assets,
            vec![assets_dir.join("folder-only.png")]
        );

        Ok(())
    }

    #[test]
    fn reload_workspace_tree_prunes_recent_for_missing_files() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let note_path = workspace_root.join("gone.md");
        std::fs::write(&note_path, "# Gone")?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;
        let opened = storage.open_note(&workspace, &note_path)?;
        assert_eq!(opened.recent_files.len(), 1);

        std::fs::remove_file(&note_path)?;
        let (_tree, recent) = storage.reload_workspace_tree(&workspace)?;

        assert!(recent.is_empty());
        assert!(storage.list_recent(10)?.is_empty());

        Ok(())
    }

    #[test]
    fn list_recent_workspaces_orders_by_last_opened_and_respects_limit() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_a = temp.path().join("workspace-a");
        let workspace_b = temp.path().join("workspace-b");
        std::fs::create_dir_all(&workspace_a)?;
        std::fs::create_dir_all(&workspace_b)?;

        let storage = test_storage(&temp)?;
        let snapshot_a = storage.initialize_workspace(&workspace_a)?;
        let snapshot_b = storage.initialize_workspace(&workspace_b)?;
        db::workspaces::update_last_opened(&storage.pool, &snapshot_a.workspace.id, 100)?;
        db::workspaces::update_last_opened(&storage.pool, &snapshot_b.workspace.id, 200)?;

        let recent = storage.list_recent_workspaces(1)?;

        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].id, snapshot_b.workspace.id);
        assert_eq!(recent[0].path, workspace_b);

        Ok(())
    }

    #[test]
    fn bootstrap_from_workspace_includes_recent_workspaces() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_a = temp.path().join("workspace-a");
        let workspace_b = temp.path().join("workspace-b");
        std::fs::create_dir_all(&workspace_a)?;
        std::fs::create_dir_all(&workspace_b)?;

        let storage = test_storage(&temp)?;
        let snapshot_a = storage.initialize_workspace(&workspace_a)?;
        let snapshot_b = storage.initialize_workspace(&workspace_b)?;
        db::workspaces::update_last_opened(&storage.pool, &snapshot_a.workspace.id, 100)?;
        db::workspaces::update_last_opened(&storage.pool, &snapshot_b.workspace.id, 200)?;

        let bootstrap = storage.bootstrap_from_workspace(&workspace_a);
        let workspace_paths = bootstrap
            .file_state
            .workspaces
            .iter()
            .map(|workspace| workspace.path.clone())
            .collect::<Vec<_>>();

        assert_eq!(
            bootstrap
                .file_state
                .current_workspace
                .as_ref()
                .map(|workspace| workspace.path.clone()),
            Some(workspace_a.clone())
        );
        assert_eq!(workspace_paths.first(), Some(&workspace_a));
        assert!(workspace_paths.contains(&workspace_b));

        Ok(())
    }

    #[test]
    fn bootstrap_from_workspace_applies_workspace_settings() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;
        let global_settings = AppSettings {
            theme: papyro_core::models::Theme::Light,
            font_size: 16,
            auto_save_delay_ms: 500,
            view_mode: papyro_core::models::ViewMode::Hybrid,
            ..AppSettings::default()
        };
        let workspace_settings = WorkspaceSettingsOverrides {
            theme: Some(papyro_core::models::Theme::Dark),
            font_size: Some(19),
            view_mode: Some(papyro_core::models::ViewMode::Source),
            ..WorkspaceSettingsOverrides::default()
        };

        storage.save_settings(&global_settings)?;
        storage.save_workspace_settings(&workspace, &workspace_settings)?;

        let bootstrap = storage.bootstrap_from_workspace(&workspace_root);

        assert_eq!(bootstrap.global_settings, global_settings);
        assert_eq!(bootstrap.workspace_settings, workspace_settings);
        assert_eq!(bootstrap.settings.theme, papyro_core::models::Theme::Dark);
        assert_eq!(bootstrap.settings.font_size, 19);
        assert_eq!(
            bootstrap.settings.view_mode,
            papyro_core::models::ViewMode::Source
        );
        assert_eq!(bootstrap.settings.auto_save_delay_ms, 500);

        Ok(())
    }

    #[test]
    fn bootstrap_from_workspace_restores_tree_state() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let notes_dir = workspace_root.join("notes");
        std::fs::create_dir_all(&notes_dir)?;
        std::fs::write(notes_dir.join("a.md"), "# A")?;

        let storage = test_storage(&temp)?;
        let workspace = storage.initialize_workspace(&workspace_root)?.workspace;
        storage.save_workspace_tree_state(
            &workspace,
            &WorkspaceTreeState {
                expanded_paths: vec![notes_dir.clone()],
            },
        )?;

        let bootstrap = storage.bootstrap_from_workspace(&workspace_root);

        assert!(bootstrap.file_state.expanded_paths.contains(&notes_dir));
        assert_eq!(bootstrap.file_state.expanded_paths.len(), 1);

        Ok(())
    }

    #[test]
    fn initialize_workspace_scans_nested_markdown_files() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let workspace_root = create_workspace(&temp)?;
        let nested = workspace_root.join("nested");
        std::fs::create_dir_all(&nested)?;
        std::fs::write(workspace_root.join("root.md"), "# Root")?;
        std::fs::write(nested.join("child.md"), "# Child")?;
        std::fs::write(nested.join("ignored.txt"), "not markdown")?;

        let storage = test_storage(&temp)?;
        let snapshot = storage.initialize_workspace(&workspace_root)?;

        assert_eq!(note_count(&snapshot.file_tree), 2);
        let notes = db::notes::list_notes_in_workspace(&storage.pool, &snapshot.workspace.id)?;
        assert_eq!(notes.len(), 2);
        assert!(notes
            .iter()
            .any(|note| note.relative_path == Path::new("root.md")));
        assert!(notes
            .iter()
            .any(|note| note.relative_path == Path::new("nested").join("child.md")));

        Ok(())
    }
}
