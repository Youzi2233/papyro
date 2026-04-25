use anyhow::{anyhow, Result};
use papyro_core::models::{FileNode, FileNodeKind, Workspace};
use papyro_core::FileState;
use std::path::{Path, PathBuf};

pub(crate) fn normalized_name(input: &str, fallback: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

pub(super) fn selected_directory_or_workspace(
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

pub(super) fn current_workspace(file_state: &FileState) -> Result<Workspace> {
    file_state
        .current_workspace
        .clone()
        .ok_or_else(|| anyhow!("No workspace is currently open"))
}

pub(super) fn tree_contains_path(nodes: &[FileNode], target: &Path) -> bool {
    nodes.iter().any(|node| {
        node.path == target
            || matches!(
                &node.kind,
                FileNodeKind::Directory { children } if tree_contains_path(children, target)
            )
    })
}
