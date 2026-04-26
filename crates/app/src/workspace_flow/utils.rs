use anyhow::{anyhow, Result};
use papyro_core::models::{FileNode, FileNodeKind, Workspace};
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
                        tab_contents.update_tab_content(&tab.id, rewritten);
                        tab_contents.refresh_stats(&tab.id, stats);
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
