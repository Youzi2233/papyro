use anyhow::{anyhow, Result};
use papyro_core::models::{FileNode, FileNodeKind, RecentFile, Workspace};
use papyro_core::storage::NoteStorage;
use papyro_core::{rewrite_moved_note_image_links, EditorTabs, FileState, TabContentsMap};
use papyro_editor::parser::summarize_markdown;
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

pub(super) fn workspace_for_markdown_path(
    file_state: &FileState,
    path: &Path,
) -> Result<Workspace> {
    let mut candidates = file_state.workspaces.clone();
    if let Some(workspace) = &file_state.current_workspace {
        candidates.push(workspace.clone());
    }
    candidates.extend(file_state.recent_files.iter().map(workspace_from_recent));

    candidates
        .into_iter()
        .filter(|workspace| path.starts_with(&workspace.path))
        .max_by_key(|workspace| workspace.path.components().count())
        .or_else(|| workspace_from_external_markdown_path(path))
        .ok_or_else(|| anyhow!("No workspace contains {}", path.display()))
}

pub(super) fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn workspace_from_recent(recent: &RecentFile) -> Workspace {
    Workspace {
        id: recent.workspace_id.clone(),
        name: recent.workspace_name.clone(),
        path: recent.workspace_path.clone(),
        created_at: 0,
        last_opened: None,
        sort_order: 0,
    }
}

fn workspace_from_external_markdown_path(path: &Path) -> Option<Workspace> {
    if !is_markdown_path(path) {
        return None;
    }

    let workspace_path = path.parent()?.to_path_buf();
    Some(Workspace {
        id: format!("external:{}", workspace_path.display()),
        name: workspace_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Workspace")
            .to_string(),
        path: workspace_path,
        created_at: 0,
        last_opened: None,
        sort_order: 0,
    })
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

pub(super) fn refresh_open_note_after_path_change(
    workspace: &Workspace,
    editor_tabs: &EditorTabs,
    tab_contents: &mut TabContentsMap,
    old_path: &Path,
    new_path: &Path,
) -> Result<()> {
    for tab in &editor_tabs.tabs {
        if tab.path == old_path && tab_contents.content_for_tab(&tab.id).is_some() {
            if tab.is_dirty {
                if let Some(content) = tab_contents.content_for_tab(&tab.id).map(str::to_string) {
                    let rewritten = rewrite_moved_note_image_links(
                        &content,
                        &workspace.path,
                        old_path,
                        new_path,
                        None,
                    );
                    if rewritten != content {
                        let stats = summarize_markdown(&rewritten);
                        if let Some(revision) = tab_contents.update_tab_content(&tab.id, rewritten)
                        {
                            tab_contents.refresh_stats(&tab.id, revision, stats);
                        }
                    }
                }
            } else {
                let content = std::fs::read_to_string(new_path)?;
                let stats = summarize_markdown(&content);
                tab_contents.replace_saved_content(&tab.id, content, stats);
            }
            break;
        }
    }

    Ok(())
}

pub(super) fn file_node_from_path(workspace_root: &Path, path: &Path) -> FileNode {
    let metadata = std::fs::metadata(path).ok();
    let created_at = metadata
        .as_ref()
        .and_then(|metadata| metadata.created().ok())
        .and_then(system_time_to_millis)
        .unwrap_or(0);
    let updated_at = metadata
        .as_ref()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(system_time_to_millis)
        .unwrap_or(created_at);
    let relative_path = path
        .strip_prefix(workspace_root)
        .unwrap_or(path)
        .to_path_buf();
    let kind = if path.is_dir() {
        FileNodeKind::Directory {
            children: Vec::new(),
        }
    } else {
        FileNodeKind::Note { note_id: None }
    };

    FileNode {
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string(),
        path: path.to_path_buf(),
        relative_path,
        created_at,
        updated_at,
        kind,
    }
}

pub(super) fn insert_file_node(nodes: &mut Vec<FileNode>, parent: &Path, node: FileNode) -> bool {
    for current in nodes {
        if current.path == parent {
            if let FileNodeKind::Directory { children } = &mut current.kind {
                children.push(node);
                return true;
            }
            return false;
        }

        if let FileNodeKind::Directory { children } = &mut current.kind {
            if insert_file_node(children, parent, node.clone()) {
                return true;
            }
        }
    }

    false
}

pub(super) fn remove_file_node(nodes: &mut Vec<FileNode>, target: &Path) -> Option<FileNode> {
    if let Some(index) = nodes.iter().position(|node| node.path == target) {
        return Some(nodes.remove(index));
    }

    for node in nodes {
        if let FileNodeKind::Directory { children } = &mut node.kind {
            if let Some(removed) = remove_file_node(children, target) {
                return Some(removed);
            }
        }
    }

    None
}

pub(super) fn rebase_file_node(
    node: &mut FileNode,
    workspace_root: &Path,
    old_root: &Path,
    new_root: &Path,
) {
    if let Ok(suffix) = node.path.strip_prefix(old_root) {
        node.path = new_root.join(suffix);
    } else {
        node.path = new_root.to_path_buf();
    }
    node.relative_path = node
        .path
        .strip_prefix(workspace_root)
        .unwrap_or(&node.path)
        .to_path_buf();
    node.name = node
        .path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    if let FileNodeKind::Directory { children } = &mut node.kind {
        for child in children {
            rebase_file_node(child, workspace_root, old_root, new_root);
        }
    }
}

pub(super) fn refresh_recent_files(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
) -> Result<()> {
    file_state.recent_files = storage.list_recent(10)?;
    Ok(())
}

fn system_time_to_millis(time: std::time::SystemTime) -> Option<i64> {
    time.duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as i64)
}
