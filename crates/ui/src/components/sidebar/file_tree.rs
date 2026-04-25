use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::{FileNode, FileNodeKind};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[component]
pub fn FileTree() -> Element {
    let app = use_app_context();
    let mut file_state = app.file_state;
    let commands = app.commands;

    let nodes = file_state.read().file_tree.clone();
    let expanded_paths = file_state.read().expanded_paths.clone();
    let selected_path = file_state.read().selected_path.clone();
    let visible_items = visible_file_tree_items(&nodes, &expanded_paths);
    let keyboard_items = visible_items.clone();

    rsx! {
        div {
            class: "mn-file-tree",
            tabindex: "0",
            role: "tree",
            "aria-label": "Workspace files",
            onkeydown: move |event| {
                let Some(key) = FileTreeKey::from_dioxus_key(event.key()) else {
                    return;
                };
                let action = file_tree_keyboard_action(
                    &keyboard_items,
                    selected_path.as_deref(),
                    &expanded_paths,
                    key,
                );

                match action {
                    FileTreeKeyboardAction::None => {}
                    FileTreeKeyboardAction::Select(path) => {
                        event.prevent_default();
                        file_state.write().select_path(path);
                    }
                    FileTreeKeyboardAction::ToggleDirectory(path) => {
                        event.prevent_default();
                        let mut state = file_state.write();
                        state.select_path(path.clone());
                        state.toggle_expanded(path);
                    }
                    FileTreeKeyboardAction::OpenNote(node) => {
                        event.prevent_default();
                        file_state.write().select_path(node.path.clone());
                        commands.open_note.call(node);
                    }
                }
            },
            if nodes.is_empty() {
                div { class: "mn-sidebar-empty", "No Markdown files found" }
            } else {
                for item in visible_items {
                    FileTreeNode { node: item.node, depth: item.depth }
                }
            }
        }
    }
}

#[component]
fn FileTreeNode(node: FileNode, depth: u32) -> Element {
    let app = use_app_context();
    let mut file_state = app.file_state;
    let commands = app.commands;
    let indent = depth * 14 + 12;

    // Stable key captured outside the memo closure so the closure body is
    // cheap and only depends on FileState. Tab changes should not make every
    // file row recalculate active-note styling.
    let node_path = node.path.clone();
    let node_path_for_memo = node_path.clone();
    let is_selected =
        use_memo(move || file_state.read().selected_path.as_ref() == Some(&node_path_for_memo))();

    match &node.kind {
        FileNodeKind::Directory { .. } => {
            let is_expanded = file_state.read().is_expanded(&node_path);
            let dir_path = node_path.clone();

            rsx! {
                button {
                    class: if is_selected { "mn-tree-row directory active" } else { "mn-tree-row directory" },
                    style: "padding-left: {indent}px",
                    role: "treeitem",
                    "aria-selected": "{is_selected}",
                    "aria-expanded": "{is_expanded}",
                    onclick: move |_| {
                        let mut state = file_state.write();
                        state.select_path(dir_path.clone());
                        state.toggle_expanded(dir_path.clone());
                    },
                    span { class: "mn-tree-caret", if is_expanded { "v" } else { ">" } }
                    span { class: "mn-tree-icon", "dir" }
                    span { class: "mn-tree-label", "{node.name}" }
                }
            }
        }
        FileNodeKind::Note { .. } => {
            let node_title = node.name.trim_end_matches(".md").to_string();
            let open_node = node.clone();

            rsx! {
                button {
                    class: if is_selected { "mn-tree-row note active" } else { "mn-tree-row note" },
                    style: "padding-left: {indent + 18}px",
                    role: "treeitem",
                    "aria-selected": "{is_selected}",
                    onclick: move |_| {
                        file_state.write().select_path(open_node.path.clone());
                        commands.open_note.call(open_node.clone());
                    },
                    span { class: "mn-tree-icon", "md" }
                    span { class: "mn-tree-label", "{node_title}" }
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
struct VisibleFileTreeItem {
    node: FileNode,
    depth: u32,
}

fn visible_file_tree_items(
    nodes: &[FileNode],
    expanded_paths: &HashSet<PathBuf>,
) -> Vec<VisibleFileTreeItem> {
    let mut items = Vec::new();
    append_visible_file_tree_items(nodes, expanded_paths, 0, &mut items);
    items
}

fn append_visible_file_tree_items(
    nodes: &[FileNode],
    expanded_paths: &HashSet<PathBuf>,
    depth: u32,
    items: &mut Vec<VisibleFileTreeItem>,
) {
    for node in nodes {
        items.push(VisibleFileTreeItem {
            node: node.clone(),
            depth,
        });

        if let FileNodeKind::Directory { children } = &node.kind {
            if expanded_paths.contains(&node.path) {
                append_visible_file_tree_items(children, expanded_paths, depth + 1, items);
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FileTreeKey {
    ArrowDown,
    ArrowUp,
    ArrowRight,
    ArrowLeft,
    Enter,
    Space,
}

impl FileTreeKey {
    fn from_dioxus_key(key: Key) -> Option<Self> {
        match key {
            Key::ArrowDown => Some(Self::ArrowDown),
            Key::ArrowUp => Some(Self::ArrowUp),
            Key::ArrowRight => Some(Self::ArrowRight),
            Key::ArrowLeft => Some(Self::ArrowLeft),
            Key::Enter => Some(Self::Enter),
            Key::Character(value) if value == " " => Some(Self::Space),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
enum FileTreeKeyboardAction {
    None,
    Select(PathBuf),
    ToggleDirectory(PathBuf),
    OpenNote(FileNode),
}

fn file_tree_keyboard_action(
    items: &[VisibleFileTreeItem],
    selected_path: Option<&Path>,
    expanded_paths: &HashSet<PathBuf>,
    key: FileTreeKey,
) -> FileTreeKeyboardAction {
    let Some(current_index) = current_tree_index(items, selected_path) else {
        return items
            .first()
            .map(|item| FileTreeKeyboardAction::Select(item.node.path.clone()))
            .unwrap_or(FileTreeKeyboardAction::None);
    };

    let current = &items[current_index].node;

    match key {
        FileTreeKey::ArrowDown => items
            .get(current_index + 1)
            .map(|item| FileTreeKeyboardAction::Select(item.node.path.clone()))
            .unwrap_or(FileTreeKeyboardAction::None),
        FileTreeKey::ArrowUp => current_index
            .checked_sub(1)
            .and_then(|index| items.get(index))
            .map(|item| FileTreeKeyboardAction::Select(item.node.path.clone()))
            .unwrap_or(FileTreeKeyboardAction::None),
        FileTreeKey::ArrowRight => match &current.kind {
            FileNodeKind::Directory { .. } if !expanded_paths.contains(&current.path) => {
                FileTreeKeyboardAction::ToggleDirectory(current.path.clone())
            }
            FileNodeKind::Directory { children } if !children.is_empty() => items
                .get(current_index + 1)
                .map(|item| FileTreeKeyboardAction::Select(item.node.path.clone()))
                .unwrap_or(FileTreeKeyboardAction::None),
            _ => FileTreeKeyboardAction::None,
        },
        FileTreeKey::ArrowLeft => match &current.kind {
            FileNodeKind::Directory { .. } if expanded_paths.contains(&current.path) => {
                FileTreeKeyboardAction::ToggleDirectory(current.path.clone())
            }
            _ => parent_item(items, current_index)
                .map(|item| FileTreeKeyboardAction::Select(item.node.path.clone()))
                .unwrap_or(FileTreeKeyboardAction::None),
        },
        FileTreeKey::Enter | FileTreeKey::Space => match &current.kind {
            FileNodeKind::Directory { .. } => {
                FileTreeKeyboardAction::ToggleDirectory(current.path.clone())
            }
            FileNodeKind::Note { .. } => FileTreeKeyboardAction::OpenNote(current.clone()),
        },
    }
}

fn current_tree_index(
    items: &[VisibleFileTreeItem],
    selected_path: Option<&Path>,
) -> Option<usize> {
    let selected_path = selected_path?;
    items
        .iter()
        .position(|item| item.node.path.as_path() == selected_path)
}

fn parent_item(
    items: &[VisibleFileTreeItem],
    current_index: usize,
) -> Option<&VisibleFileTreeItem> {
    let current_depth = items.get(current_index)?.depth;
    if current_depth == 0 {
        return None;
    }

    items[..current_index]
        .iter()
        .rev()
        .find(|item| item.depth + 1 == current_depth)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(path: &str) -> FileNode {
        FileNode {
            name: path
                .rsplit('/')
                .next()
                .expect("test path has a file name")
                .to_string(),
            path: PathBuf::from(path),
            relative_path: PathBuf::from(path),
            kind: FileNodeKind::Note { note_id: None },
        }
    }

    fn directory(path: &str, children: Vec<FileNode>) -> FileNode {
        FileNode {
            name: path
                .rsplit('/')
                .next()
                .expect("test path has a directory name")
                .to_string(),
            path: PathBuf::from(path),
            relative_path: PathBuf::from(path),
            kind: FileNodeKind::Directory { children },
        }
    }

    #[test]
    fn visible_items_include_only_expanded_descendants() {
        let nodes = vec![directory(
            "workspace/notes",
            vec![note("workspace/notes/a.md"), note("workspace/notes/b.md")],
        )];

        assert_eq!(visible_file_tree_items(&nodes, &HashSet::new()).len(), 1);

        let expanded = HashSet::from([PathBuf::from("workspace/notes")]);
        let items = visible_file_tree_items(&nodes, &expanded);

        assert_eq!(
            items
                .iter()
                .map(|item| (item.node.path.clone(), item.depth))
                .collect::<Vec<_>>(),
            vec![
                (PathBuf::from("workspace/notes"), 0),
                (PathBuf::from("workspace/notes/a.md"), 1),
                (PathBuf::from("workspace/notes/b.md"), 1),
            ]
        );
    }

    #[test]
    fn keyboard_navigation_moves_between_visible_items() {
        let nodes = vec![directory(
            "workspace/notes",
            vec![note("workspace/notes/a.md"), note("workspace/notes/b.md")],
        )];
        let expanded = HashSet::from([PathBuf::from("workspace/notes")]);
        let items = visible_file_tree_items(&nodes, &expanded);

        assert_eq!(
            file_tree_keyboard_action(
                &items,
                Some(Path::new("workspace/notes/a.md")),
                &expanded,
                FileTreeKey::ArrowDown,
            ),
            FileTreeKeyboardAction::Select(PathBuf::from("workspace/notes/b.md"))
        );
        assert_eq!(
            file_tree_keyboard_action(
                &items,
                Some(Path::new("workspace/notes/a.md")),
                &expanded,
                FileTreeKey::ArrowUp,
            ),
            FileTreeKeyboardAction::Select(PathBuf::from("workspace/notes"))
        );
    }

    #[test]
    fn keyboard_navigation_expands_collapses_and_opens_nodes() {
        let nodes = vec![directory(
            "workspace/notes",
            vec![note("workspace/notes/a.md")],
        )];
        let collapsed_items = visible_file_tree_items(&nodes, &HashSet::new());

        assert_eq!(
            file_tree_keyboard_action(
                &collapsed_items,
                Some(Path::new("workspace/notes")),
                &HashSet::new(),
                FileTreeKey::ArrowRight,
            ),
            FileTreeKeyboardAction::ToggleDirectory(PathBuf::from("workspace/notes"))
        );

        let expanded = HashSet::from([PathBuf::from("workspace/notes")]);
        let expanded_items = visible_file_tree_items(&nodes, &expanded);

        assert_eq!(
            file_tree_keyboard_action(
                &expanded_items,
                Some(Path::new("workspace/notes/a.md")),
                &expanded,
                FileTreeKey::ArrowLeft,
            ),
            FileTreeKeyboardAction::Select(PathBuf::from("workspace/notes"))
        );
        assert!(matches!(
            file_tree_keyboard_action(
                &expanded_items,
                Some(Path::new("workspace/notes/a.md")),
                &expanded,
                FileTreeKey::Enter,
            ),
            FileTreeKeyboardAction::OpenNote(node)
                if node.path == Path::new("workspace/notes/a.md")
        ));
    }
}
