use crate::models::{FileNode, RecentFile, Workspace};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Default)]
pub struct FileState {
    pub workspaces: Vec<Workspace>,
    pub current_workspace: Option<Workspace>,
    pub file_tree: Vec<FileNode>,
    pub expanded_paths: HashSet<PathBuf>,
    pub recent_files: Vec<RecentFile>,
    pub selected_path: Option<PathBuf>,
}

impl FileState {
    pub fn set_workspace(
        &mut self,
        workspace: Workspace,
        file_tree: Vec<FileNode>,
        recent_files: Vec<RecentFile>,
    ) {
        if !self.workspaces.iter().any(|item| item.id == workspace.id) {
            self.workspaces.push(workspace.clone());
        }

        self.current_workspace = Some(workspace);
        self.file_tree = file_tree;
        self.recent_files = recent_files;
    }

    pub fn select_path(&mut self, path: PathBuf) {
        self.selected_path = Some(path);
    }

    pub fn selected_node(&self) -> Option<FileNode> {
        let selected_path = self.selected_path.as_ref()?;
        find_node(&self.file_tree, selected_path).cloned()
    }

    pub fn is_expanded(&self, path: &Path) -> bool {
        self.expanded_paths.contains(path)
    }

    pub fn toggle_expanded(&mut self, path: PathBuf) {
        if !self.expanded_paths.insert(path.clone()) {
            self.expanded_paths.remove(&path);
        }
    }
}

fn find_node<'a>(nodes: &'a [FileNode], target: &Path) -> Option<&'a FileNode> {
    for node in nodes {
        if node.path == target {
            return Some(node);
        }

        if let crate::models::FileNodeKind::Directory { children } = &node.kind {
            if let Some(found) = find_node(children, target) {
                return Some(found);
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::FileNodeKind;

    #[test]
    fn expanded_paths_are_independent_from_file_tree() {
        let mut state = FileState::default();
        let first = PathBuf::from("notes");
        let second = PathBuf::from("archive");

        state.toggle_expanded(first.clone());
        state.toggle_expanded(second.clone());

        assert!(state.is_expanded(&first));
        assert!(state.is_expanded(&second));

        state.file_tree = Vec::new();
        assert!(state.is_expanded(&first));

        state.toggle_expanded(first.clone());
        assert!(!state.is_expanded(&first));
        assert!(state.is_expanded(&second));
    }

    #[test]
    fn selected_node_finds_nested_file_tree_nodes() {
        let nested_note = FileNode {
            name: "note.md".to_string(),
            path: PathBuf::from("workspace/folder/note.md"),
            relative_path: PathBuf::from("folder/note.md"),
            kind: FileNodeKind::Note {
                note_id: Some("note-id".to_string()),
            },
        };
        let file_tree = vec![FileNode {
            name: "folder".to_string(),
            path: PathBuf::from("workspace/folder"),
            relative_path: PathBuf::from("folder"),
            kind: FileNodeKind::Directory {
                children: vec![nested_note.clone()],
            },
        }];
        let mut state = FileState {
            file_tree,
            ..FileState::default()
        };

        state.select_path(PathBuf::from("workspace/folder/note.md"));

        assert_eq!(state.selected_node(), Some(nested_note));
    }
}
