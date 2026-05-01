use anyhow::Context;
use anyhow::Result;
use papyro_core::models::{FileNode, FileNodeKind};
use papyro_core::WORKSPACE_ASSETS_DIR_NAME;
use std::path::{Path, PathBuf};

const IGNORED_DIRECTORY_NAMES: &[&str] = &["target", "node_modules"];

pub fn scan_workspace(root: &Path) -> Result<Vec<FileNode>> {
    let mut nodes = scan_dir(root, root)?;
    sort_nodes(&mut nodes);
    Ok(nodes)
}

fn scan_dir(root: &Path, dir: &Path) -> Result<Vec<FileNode>> {
    let mut nodes = Vec::new();
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(nodes),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if should_skip_entry(&name, file_type.is_dir()) {
            continue;
        }

        let relative_path = path.strip_prefix(root).unwrap_or(&path).to_path_buf();
        let (created_at, updated_at) = entry
            .metadata()
            .map(|metadata| file_node_timestamps(&metadata))
            .unwrap_or((0, 0));

        if file_type.is_dir() {
            let mut children = scan_dir(root, &path)?;
            sort_nodes(&mut children);
            nodes.push(FileNode {
                name,
                path,
                relative_path,
                created_at,
                updated_at,
                kind: FileNodeKind::Directory { children },
            });
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
            nodes.push(FileNode {
                name,
                path,
                relative_path,
                created_at,
                updated_at,
                kind: FileNodeKind::Note { note_id: None },
            });
        }
    }

    Ok(nodes)
}

fn should_skip_entry(name: &str, is_dir: bool) -> bool {
    name.starts_with('.')
        || (is_dir
            && (name.eq_ignore_ascii_case(WORKSPACE_ASSETS_DIR_NAME)
                || IGNORED_DIRECTORY_NAMES
                    .iter()
                    .any(|ignored| name.eq_ignore_ascii_case(ignored))))
}

fn sort_nodes(nodes: &mut [FileNode]) {
    nodes.sort_by(|a, b| {
        let a_is_dir = matches!(a.kind, FileNodeKind::Directory { .. });
        let b_is_dir = matches!(b.kind, FileNodeKind::Directory { .. });
        b_is_dir
            .cmp(&a_is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
}

fn file_node_timestamps(metadata: &std::fs::Metadata) -> (i64, i64) {
    let created_at = metadata
        .created()
        .ok()
        .and_then(system_time_to_millis)
        .unwrap_or(0);
    let updated_at = metadata
        .modified()
        .ok()
        .and_then(system_time_to_millis)
        .unwrap_or(created_at);

    (created_at, updated_at)
}

fn system_time_to_millis(time: std::time::SystemTime) -> Option<i64> {
    time.duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as i64)
}

pub fn get_db_path() -> Result<PathBuf> {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("papyro");
    get_db_path_in_app_data_dir(&data_dir)
}

pub fn get_db_path_in_app_data_dir(data_dir: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(data_dir)
        .with_context(|| format!("create app data directory {}", data_dir.display()))?;
    Ok(data_dir.join("meta.db"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_db_path_reports_app_data_directory_context() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let blocker = temp.path().join("not-a-directory");
        std::fs::write(&blocker, "blocks child paths")?;

        let error = get_db_path_in_app_data_dir(&blocker.join("papyro"))
            .expect_err("file parent should block app data directory creation");

        let message = error.to_string();
        assert!(message.contains("create app data directory"));
        assert!(message.contains("not-a-directory"));

        Ok(())
    }

    #[test]
    fn scan_workspace_skips_assets_and_build_directories() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let root = temp.path();
        std::fs::create_dir_all(root.join("notes"))?;
        std::fs::create_dir_all(root.join("assets"))?;
        std::fs::create_dir_all(root.join("target"))?;
        std::fs::create_dir_all(root.join("node_modules"))?;
        std::fs::write(root.join("notes").join("keep.md"), "# keep")?;
        std::fs::write(root.join("assets").join("ignore.md"), "# ignore")?;
        std::fs::write(root.join("target").join("ignore.md"), "# ignore")?;
        std::fs::write(root.join("node_modules").join("ignore.md"), "# ignore")?;

        let tree = scan_workspace(root)?;

        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].name, "notes");
        let FileNodeKind::Directory { children } = &tree[0].kind else {
            panic!("notes should be a directory");
        };
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].name, "keep.md");

        Ok(())
    }
}
