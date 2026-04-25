pub mod db;
pub mod fs;
pub mod index;

pub use db::{create_pool, DbPool};
pub use papyro_core::{OpenedNote, SavedNote, WorkspaceBootstrap, WorkspaceSnapshot};

use anyhow::Result;
use chrono::Utc;
use papyro_core::models::{
    AppSettings, EditorTab, FileNode, FileNodeKind, NoteMeta, RecentFile, Workspace,
};
use papyro_core::{FileState, NoteStorage};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const APP_SETTINGS_KEY: &str = "app_settings";

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
                );
                file_state.workspaces = self.recent_workspaces_with_current(&snapshot.workspace);

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
                    settings: AppSettings::default(),
                    global_settings: AppSettings::default(),
                    workspace_settings: Default::default(),
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

        Ok(new_path)
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

        Ok(WorkspaceSnapshot {
            workspace: Workspace {
                last_opened: Some(now),
                ..workspace
            },
            file_tree,
            recent_files,
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

    fn rename_path(&self, workspace: &Workspace, path: &Path, new_name: &str) -> Result<PathBuf> {
        SqliteStorage::rename_path(self, workspace, path, new_name)
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
}

pub fn load_app_settings() -> AppSettings {
    SqliteStorage::shared()
        .map(|storage| storage.load_settings())
        .unwrap_or_default()
}

pub fn save_app_settings(settings: &AppSettings) -> Result<()> {
    SqliteStorage::shared()?.save_settings(settings)
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
        tags: Vec::new(),
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
