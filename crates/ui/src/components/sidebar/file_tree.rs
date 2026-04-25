use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::{FileNode, FileNodeKind};

#[component]
pub fn FileTree() -> Element {
    let file_state = use_app_context().file_state;

    let nodes = file_state.read().file_tree.clone();

    rsx! {
        div { class: "mn-file-tree",
            if nodes.is_empty() {
                div { class: "mn-sidebar-empty", "No Markdown files found" }
            } else {
                for node in nodes {
                    FileTreeNode { node, depth: 0 }
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
        FileNodeKind::Directory { children } => {
            let children = children.clone();
            let is_expanded = file_state.read().is_expanded(&node_path);
            let dir_path = node_path.clone();

            rsx! {
                div { class: "mn-tree-group",
                    button {
                        class: if is_selected { "mn-tree-row directory active" } else { "mn-tree-row directory" },
                        style: "padding-left: {indent}px",
                        onclick: move |_| {
                            let mut state = file_state.write();
                            state.select_path(dir_path.clone());
                            state.toggle_expanded(dir_path.clone());
                        },
                        span { class: "mn-tree-caret", if is_expanded { "v" } else { ">" } }
                        span { class: "mn-tree-icon", "dir" }
                        span { class: "mn-tree-label", "{node.name}" }
                    }
                    if is_expanded {
                        for child in children {
                            FileTreeNode { node: child, depth: depth + 1 }
                        }
                    }
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
