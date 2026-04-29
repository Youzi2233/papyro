use anyhow::Context;
use anyhow::Result;
use papyro_core::models::{FileNode, FileNodeKind};
use std::path::{Path, PathBuf};

/// 递归扫描目录，返回文件树
pub fn scan_workspace(root: &Path) -> Result<Vec<FileNode>> {
    let mut nodes = scan_dir(root, root)?;
    nodes.sort_by(|a, b| {
        let a_is_dir = matches!(a.kind, FileNodeKind::Directory { .. });
        let b_is_dir = matches!(b.kind, FileNodeKind::Directory { .. });
        b_is_dir
            .cmp(&a_is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(nodes)
}

fn scan_dir(root: &Path, dir: &Path) -> Result<Vec<FileNode>> {
    let mut nodes = Vec::new();
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(nodes),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // 跳过隐藏文件和 assets 目录
        if name.starts_with('.') {
            continue;
        }

        let relative_path = path.strip_prefix(root).unwrap_or(&path).to_path_buf();
        let (created_at, updated_at) = file_node_timestamps(&path);

        if path.is_dir() {
            let mut children = scan_dir(root, &path)?;
            children.sort_by(|a, b| {
                let a_is_dir = matches!(a.kind, FileNodeKind::Directory { .. });
                let b_is_dir = matches!(b.kind, FileNodeKind::Directory { .. });
                b_is_dir
                    .cmp(&a_is_dir)
                    .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            });
            nodes.push(FileNode {
                name,
                path,
                relative_path,
                created_at,
                updated_at,
                kind: FileNodeKind::Directory { children },
            });
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
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

fn file_node_timestamps(path: &Path) -> (i64, i64) {
    let Ok(metadata) = std::fs::metadata(path) else {
        return (0, 0);
    };

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

/// 获取工作空间的数据库存储路径
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
}
