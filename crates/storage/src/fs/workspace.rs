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
                kind: FileNodeKind::Directory { children },
            });
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            nodes.push(FileNode {
                name,
                path,
                relative_path,
                kind: FileNodeKind::Note { note_id: None },
            });
        }
    }
    Ok(nodes)
}

/// 获取工作空间的数据库存储路径
pub fn get_db_path() -> Result<PathBuf> {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("papyro");
    get_db_path_in_app_data_dir(&data_dir)
}

pub fn get_db_path_in_app_data_dir(data_dir: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(&data_dir)?;
    Ok(data_dir.join("meta.db"))
}
