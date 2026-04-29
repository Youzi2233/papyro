use crate::commands::{AppCommands, FileTarget, OpenMarkdownTarget};
use crate::components::primitives::{Menu, MenuItem, MenuSeparator};
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::{FileNode, FileNodeKind};
use std::cmp::Ordering;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FileTreeSortMode {
    #[default]
    Name,
    Updated,
    Created,
}

impl FileTreeSortMode {
    pub fn all() -> [Self; 3] {
        [Self::Name, Self::Updated, Self::Created]
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Name => "Name",
            Self::Updated => "Updated",
            Self::Created => "Created",
        }
    }
}

#[component]
pub fn FileTree(sort_mode: FileTreeSortMode) -> Element {
    let app = use_app_context();
    let commands = app.commands;
    let file_tree_model = app.file_tree_model.read().clone();
    let keyboard_commands = commands.clone();
    let context_rename_commands = commands.clone();

    let nodes = file_tree_model.nodes;
    let expanded_paths = file_tree_model.expanded_paths;
    let selected_path = file_tree_model.selected_path;
    let sorted_nodes = sorted_file_tree_nodes(&nodes, sort_mode);
    let visible_items = visible_file_tree_items(&sorted_nodes, &expanded_paths);
    let keyboard_items = visible_items.clone();
    let render_items = visible_items
        .iter()
        .cloned()
        .map(|item| FileTreeRenderItem {
            is_selected: selected_path.as_ref() == Some(&item.node.path),
            is_expanded: expanded_paths.contains(&item.node.path),
            item,
        })
        .collect::<Vec<_>>();
    let mut context_menu = use_signal(|| None::<FileTreeContextMenu>);
    let mut rename_draft = use_signal(|| None::<FileTreeRenameDraft>);
    let drag_source = use_signal(|| None::<FileTreeDragSource>);
    let drop_target = use_signal(|| None::<PathBuf>);

    rsx! {
        div {
            class: "mn-file-tree",
            tabindex: "0",
            role: "tree",
            "aria-label": "Workspace files",
            onclick: move |_| context_menu.set(None),
            onkeydown: move |event| {
                if event.key() == Key::Escape {
                    event.prevent_default();
                    context_menu.set(None);
                    rename_draft.set(None);
                    return;
                }

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
                        keyboard_commands.select_path.call(path);
                    }
                    FileTreeKeyboardAction::ToggleDirectory(path) => {
                        event.prevent_default();
                        keyboard_commands.toggle_expanded_path.call(path);
                    }
                    FileTreeKeyboardAction::OpenNote(node) => {
                        event.prevent_default();
                        keyboard_commands.select_path.call(node.path.clone());
                        keyboard_commands.open_markdown.call(OpenMarkdownTarget {
                            path: node.path,
                        });
                    }
                    FileTreeKeyboardAction::Rename(node) => {
                        event.prevent_default();
                        begin_inline_rename(keyboard_commands.clone(), rename_draft, node);
                    }
                }
            },
            if nodes.is_empty() {
                div { class: "mn-sidebar-empty", "No Markdown files found" }
            } else {
                for item in render_items {
                    FileTreeNode {
                        node: item.item.node,
                        depth: item.item.depth,
                        is_selected: item.is_selected,
                        is_expanded: item.is_expanded,
                        rename_draft,
                        drag_source,
                        drop_target,
                        on_context_menu: move |menu| {
                            rename_draft.set(None);
                            context_menu.set(Some(menu));
                        },
                    }
                }
            }
            if let Some(menu) = context_menu() {
                div {
                    class: "mn-tree-context-dismiss",
                    onclick: move |_| context_menu.set(None),
                    oncontextmenu: move |event| {
                        event.prevent_default();
                        context_menu.set(None);
                    },
                }
                FileTreeContextMenuView {
                    menu,
                    on_close: move |_| context_menu.set(None),
                    on_rename_start: move |node| {
                        context_menu.set(None);
                        begin_inline_rename(context_rename_commands.clone(), rename_draft, node);
                    },
                }
            }
        }
    }
}

#[component]
fn FileTreeNode(
    node: FileNode,
    depth: u32,
    is_selected: bool,
    is_expanded: bool,
    rename_draft: Signal<Option<FileTreeRenameDraft>>,
    drag_source: Signal<Option<FileTreeDragSource>>,
    drop_target: Signal<Option<PathBuf>>,
    on_context_menu: EventHandler<FileTreeContextMenu>,
) -> Element {
    let app = use_app_context();
    let commands = app.commands;
    let mut rename_draft_for_change = rename_draft;
    let rename_draft_for_commit = rename_draft;
    let mut rename_draft_for_cancel = rename_draft;
    let rename_commands = commands.clone();
    let indent = depth * 14 + 12;

    let node_path = node.path.clone();
    let active_rename = rename_draft
        .read()
        .as_ref()
        .filter(|draft| draft.path == node_path)
        .cloned();
    let is_dragging = drag_source
        .read()
        .as_ref()
        .is_some_and(|source| source.path == node_path);
    let is_drop_target = drop_target.read().as_ref() == Some(&node_path);

    match &node.kind {
        FileNodeKind::Directory { .. } => {
            let toggle_path = node_path.clone();
            let toggle_commands = commands.clone();
            let menu_node = node.clone();
            let menu_path = node_path.clone();
            let drag_node = node.clone();
            let drop_path_over = node_path.clone();
            let drop_path_leave = node_path.clone();
            let drop_path_drop = node_path.clone();
            let drop_commands = commands.clone();

            if let Some(draft) = active_rename {
                rsx! {
                    div {
                        class: file_tree_row_class("directory", true, true, false, false),
                        style: "padding-left: {indent}px",
                        role: "treeitem",
                        "aria-selected": "true",
                        "aria-expanded": "{is_expanded}",
                        span { class: "mn-tree-caret", if is_expanded { "v" } else { ">" } }
                        span { class: "mn-tree-icon", "dir" }
                        input {
                            class: "mn-tree-rename-input",
                            value: "{draft.value}",
                            autofocus: true,
                            oninput: move |event| {
                                if let Some(mut draft) = rename_draft_for_change() {
                                    draft.value = event.value();
                                    rename_draft_for_change.set(Some(draft));
                                }
                            },
                            onblur: move |_| {
                                commit_inline_rename(rename_draft_for_commit, rename_commands.clone());
                            },
                            onkeydown: move |event| {
                                event.stop_propagation();
                                match event.key() {
                                    Key::Enter => {
                                        event.prevent_default();
                                        commit_inline_rename(rename_draft, commands.clone());
                                    }
                                    Key::Escape => {
                                        event.prevent_default();
                                        rename_draft_for_cancel.set(None);
                                    }
                                    _ => {}
                                }
                            },
                            oncontextmenu: move |event| {
                                event.prevent_default();
                                event.stop_propagation();
                            },
                        }
                    }
                }
            } else {
                rsx! {
                    button {
                        class: file_tree_row_class("directory", is_selected, false, is_dragging, is_drop_target),
                        style: "padding-left: {indent}px",
                        role: "treeitem",
                        draggable: true,
                        "aria-selected": "{is_selected}",
                        "aria-expanded": "{is_expanded}",
                        onclick: move |_| {
                            toggle_commands.toggle_expanded_path.call(toggle_path.clone());
                        },
                        oncontextmenu: move |event| {
                            event.prevent_default();
                            event.stop_propagation();
                            commands.select_path.call(menu_path.clone());
                            on_context_menu.call(FileTreeContextMenu::from_event(&menu_node, &event));
                        },
                        ondragstart: move |event| {
                            event.stop_propagation();
                            commands.select_path.call(drag_node.path.clone());
                            drag_source.set(Some(FileTreeDragSource::from_node(&drag_node)));
                        },
                        ondragend: move |_| {
                            drag_source.set(None);
                            drop_target.set(None);
                        },
                        ondragover: move |event| {
                            if let Some(source) = drag_source() {
                                if can_drop_on_directory(&source, &drop_path_over) {
                                    event.prevent_default();
                                    drop_target.set(Some(drop_path_over.clone()));
                                }
                            }
                        },
                        ondragleave: move |_| {
                            if drop_target.read().as_ref() == Some(&drop_path_leave) {
                                drop_target.set(None);
                            }
                        },
                        ondrop: move |event| {
                            event.prevent_default();
                            event.stop_propagation();
                            if let Some(source) = drag_source() {
                                if can_drop_on_directory(&source, &drop_path_drop) {
                                    commands.select_path.call(source.path.clone());
                                    drop_commands.move_selected_to.call(drop_path_drop.clone());
                                }
                            }
                            drag_source.set(None);
                            drop_target.set(None);
                        },
                        span { class: "mn-tree-caret", if is_expanded { "v" } else { ">" } }
                        span { class: "mn-tree-icon", "dir" }
                        span { class: "mn-tree-label", "{node.name}" }
                    }
                }
            }
        }
        FileNodeKind::Note { .. } => {
            let node_title = node.name.trim_end_matches(".md").to_string();
            let open_node = node.clone();
            let open_commands = commands.clone();
            let menu_node = node.clone();
            let menu_path = node_path.clone();
            let drag_node = node.clone();

            if let Some(draft) = active_rename {
                rsx! {
                    div {
                        class: file_tree_row_class("note", true, true, false, false),
                        style: "padding-left: {indent + 18}px",
                        role: "treeitem",
                        "aria-selected": "true",
                        span { class: "mn-tree-icon", "md" }
                        input {
                            class: "mn-tree-rename-input",
                            value: "{draft.value}",
                            autofocus: true,
                            oninput: move |event| {
                                if let Some(mut draft) = rename_draft_for_change() {
                                    draft.value = event.value();
                                    rename_draft_for_change.set(Some(draft));
                                }
                            },
                            onblur: move |_| {
                                commit_inline_rename(rename_draft_for_commit, rename_commands.clone());
                            },
                            onkeydown: move |event| {
                                event.stop_propagation();
                                match event.key() {
                                    Key::Enter => {
                                        event.prevent_default();
                                        commit_inline_rename(rename_draft, commands.clone());
                                    }
                                    Key::Escape => {
                                        event.prevent_default();
                                        rename_draft_for_cancel.set(None);
                                    }
                                    _ => {}
                                }
                            },
                            oncontextmenu: move |event| {
                                event.prevent_default();
                                event.stop_propagation();
                            },
                        }
                    }
                }
            } else {
                rsx! {
                    button {
                        class: file_tree_row_class("note", is_selected, false, is_dragging, false),
                        style: "padding-left: {indent + 18}px",
                        role: "treeitem",
                        draggable: true,
                        "aria-selected": "{is_selected}",
                        onclick: move |_| {
                            open_commands.select_path.call(open_node.path.clone());
                            open_commands.open_markdown.call(OpenMarkdownTarget {
                                path: open_node.path.clone(),
                            });
                        },
                        oncontextmenu: move |event| {
                            event.prevent_default();
                            event.stop_propagation();
                            commands.select_path.call(menu_path.clone());
                            on_context_menu.call(FileTreeContextMenu::from_event(&menu_node, &event));
                        },
                        ondragstart: move |event| {
                            event.stop_propagation();
                            commands.select_path.call(drag_node.path.clone());
                            drag_source.set(Some(FileTreeDragSource::from_node(&drag_node)));
                        },
                        ondragend: move |_| {
                            drag_source.set(None);
                            drop_target.set(None);
                        },
                        span { class: "mn-tree-icon", "md" }
                        span { class: "mn-tree-label", "{node_title}" }
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
struct FileTreeRenameDraft {
    path: PathBuf,
    value: String,
    original_value: String,
}

impl FileTreeRenameDraft {
    fn from_node(node: &FileNode) -> Self {
        let value = rename_input_value(node);
        Self {
            path: node.path.clone(),
            value: value.clone(),
            original_value: value,
        }
    }

    fn commit_name(&self) -> Option<String> {
        let trimmed = self.value.trim();
        (!trimmed.is_empty() && trimmed != self.original_value).then(|| trimmed.to_string())
    }
}

fn rename_input_value(node: &FileNode) -> String {
    match &node.kind {
        FileNodeKind::Note { .. } => node.name.trim_end_matches(".md").to_string(),
        FileNodeKind::Directory { .. } => node.name.clone(),
    }
}

#[derive(Debug, Clone, PartialEq)]
struct FileTreeDragSource {
    path: PathBuf,
    is_directory: bool,
}

impl FileTreeDragSource {
    fn from_node(node: &FileNode) -> Self {
        Self {
            path: node.path.clone(),
            is_directory: matches!(node.kind, FileNodeKind::Directory { .. }),
        }
    }
}

fn can_drop_on_directory(source: &FileTreeDragSource, target_dir: &Path) -> bool {
    if source.path == target_dir || source.path.parent() == Some(target_dir) {
        return false;
    }

    !source.is_directory || !target_dir.starts_with(&source.path)
}

fn file_tree_row_class(
    kind: &str,
    is_selected: bool,
    is_editing: bool,
    is_dragging: bool,
    is_drop_target: bool,
) -> String {
    let mut classes = vec!["mn-tree-row", kind];
    if is_selected {
        classes.push("active");
    }
    if is_editing {
        classes.push("editing");
    }
    if is_dragging {
        classes.push("dragging");
    }
    if is_drop_target {
        classes.push("drop-target");
    }
    classes.join(" ")
}

fn begin_inline_rename(
    commands: AppCommands,
    mut rename_draft: Signal<Option<FileTreeRenameDraft>>,
    node: FileNode,
) {
    commands.select_path.call(node.path.clone());
    rename_draft.set(Some(FileTreeRenameDraft::from_node(&node)));
}

fn commit_inline_rename(
    mut rename_draft: Signal<Option<FileTreeRenameDraft>>,
    commands: AppCommands,
) {
    let Some(draft) = rename_draft() else {
        return;
    };

    if let Some(name) = draft.commit_name() {
        commands.select_path.call(draft.path.clone());
        commands.rename_selected.call(name);
    }

    rename_draft.set(None);
}

#[derive(Debug, Clone, PartialEq)]
struct FileTreeContextMenu {
    node: FileNode,
    position: ContextMenuPosition,
}

impl FileTreeContextMenu {
    fn from_event(node: &FileNode, event: &MouseEvent) -> Self {
        let point = event.client_coordinates();
        Self {
            node: node.clone(),
            position: ContextMenuPosition {
                x: point.x,
                y: point.y,
            },
        }
    }

    fn is_directory(&self) -> bool {
        matches!(self.node.kind, FileNodeKind::Directory { .. })
    }

    fn file_target(&self) -> FileTarget {
        FileTarget {
            path: self.node.path.clone(),
            name: self.node.name.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct ContextMenuPosition {
    x: f64,
    y: f64,
}

fn context_menu_style(position: ContextMenuPosition) -> String {
    let left = position.x.max(8.0);
    let top = position.y.max(8.0);
    format!(
        "left: min({left:.0}px, calc(100vw - 188px)); top: min({top:.0}px, calc(100vh - 220px));"
    )
}

#[component]
fn FileTreeContextMenuView(
    menu: FileTreeContextMenu,
    on_close: EventHandler<()>,
    on_rename_start: EventHandler<FileNode>,
) -> Element {
    let app = use_app_context();
    let commands = app.commands;
    let style = context_menu_style(menu.position);
    let is_directory = menu.is_directory();
    let open_node = menu.node.clone();
    let rename_node = menu.node.clone();
    let toggle_path = menu.node.path.clone();
    let reveal_target = menu.file_target();
    let delete_pending = app
        .pending_delete_path
        .read()
        .as_deref()
        .is_some_and(|path| path == menu.node.path.as_path());
    let delete_label = delete_menu_label(delete_pending);

    rsx! {
        Menu {
            label: "File actions",
            class_name: "mn-tree-context-menu",
            style,
            if !is_directory {
                MenuItem {
                    label: "Open",
                    danger: false,
                    on_select: move |_| {
                        commands.select_path.call(open_node.path.clone());
                        commands.open_markdown.call(OpenMarkdownTarget {
                            path: open_node.path.clone(),
                        });
                        on_close.call(());
                    },
                }
            }
            if is_directory {
                MenuItem {
                    label: "Expand / collapse",
                    danger: false,
                    on_select: move |_| {
                        commands.toggle_expanded_path.call(toggle_path.clone());
                        on_close.call(());
                    },
                }
            }
            MenuItem {
                label: "Rename",
                danger: false,
                on_select: move |_| {
                    on_rename_start.call(rename_node.clone());
                    on_close.call(());
                },
            }
            MenuItem {
                label: "New note",
                danger: false,
                on_select: move |_| {
                    commands.create_note.call("Untitled".to_string());
                    on_close.call(());
                },
            }
            MenuItem {
                label: "New folder",
                danger: false,
                on_select: move |_| {
                    commands.create_folder.call("New Folder".to_string());
                    on_close.call(());
                },
            }
            MenuItem {
                label: "Reveal",
                danger: false,
                on_select: move |_| {
                    commands.reveal_in_explorer.call(reveal_target.clone());
                    on_close.call(());
                },
            }
            MenuSeparator {}
            MenuItem {
                label: delete_label,
                danger: true,
                on_select: move |_| {
                    commands.delete_selected.call(());
                    on_close.call(());
                },
            }
        }
    }
}

fn delete_menu_label(is_pending: bool) -> &'static str {
    if is_pending {
        "Confirm delete"
    } else {
        "Delete"
    }
}

#[derive(Debug, Clone, PartialEq)]
struct VisibleFileTreeItem {
    node: FileNode,
    depth: u32,
}

#[derive(Debug, Clone, PartialEq)]
struct FileTreeRenderItem {
    item: VisibleFileTreeItem,
    is_selected: bool,
    is_expanded: bool,
}

fn sorted_file_tree_nodes(nodes: &[FileNode], sort_mode: FileTreeSortMode) -> Vec<FileNode> {
    let mut sorted = nodes
        .iter()
        .map(|node| {
            let mut node = node.clone();
            if let FileNodeKind::Directory { children } = &mut node.kind {
                *children = sorted_file_tree_nodes(children, sort_mode);
            }
            node
        })
        .collect::<Vec<_>>();

    sorted.sort_by(|a, b| compare_file_nodes(a, b, sort_mode));
    sorted
}

fn compare_file_nodes(a: &FileNode, b: &FileNode, sort_mode: FileTreeSortMode) -> Ordering {
    let a_is_dir = matches!(a.kind, FileNodeKind::Directory { .. });
    let b_is_dir = matches!(b.kind, FileNodeKind::Directory { .. });

    b_is_dir.cmp(&a_is_dir).then_with(|| match sort_mode {
        FileTreeSortMode::Name => compare_node_names(a, b),
        FileTreeSortMode::Updated => b
            .updated_at
            .cmp(&a.updated_at)
            .then_with(|| compare_node_names(a, b)),
        FileTreeSortMode::Created => b
            .created_at
            .cmp(&a.created_at)
            .then_with(|| compare_node_names(a, b)),
    })
}

fn compare_node_names(a: &FileNode, b: &FileNode) -> Ordering {
    a.name.to_lowercase().cmp(&b.name.to_lowercase())
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
    F2,
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
            Key::F2 => Some(Self::F2),
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
    Rename(FileNode),
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
        FileTreeKey::F2 => FileTreeKeyboardAction::Rename(current.clone()),
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
            created_at: 0,
            updated_at: 0,
            kind: FileNodeKind::Note { note_id: None },
        }
    }

    fn note_with_times(path: &str, created_at: i64, updated_at: i64) -> FileNode {
        FileNode {
            created_at,
            updated_at,
            ..note(path)
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
            created_at: 0,
            updated_at: 0,
            kind: FileNodeKind::Directory { children },
        }
    }

    fn directory_with_times(
        path: &str,
        created_at: i64,
        updated_at: i64,
        children: Vec<FileNode>,
    ) -> FileNode {
        FileNode {
            created_at,
            updated_at,
            ..directory(path, children)
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
    fn sorted_tree_orders_by_name_with_directories_first() {
        let nodes = vec![
            note("workspace/z.md"),
            directory("workspace/B", Vec::new()),
            note("workspace/a.md"),
            directory("workspace/A", Vec::new()),
        ];

        let sorted = sorted_file_tree_nodes(&nodes, FileTreeSortMode::Name);

        assert_eq!(
            sorted
                .iter()
                .map(|node| node.name.as_str())
                .collect::<Vec<_>>(),
            vec!["A", "B", "a.md", "z.md"]
        );
    }

    #[test]
    fn sorted_tree_orders_by_updated_and_created_times() {
        let nodes = vec![
            note_with_times("workspace/old.md", 10, 20),
            note_with_times("workspace/new.md", 30, 40),
            directory_with_times(
                "workspace/dir",
                5,
                50,
                vec![
                    note_with_times("workspace/dir/child-old.md", 1, 2),
                    note_with_times("workspace/dir/child-new.md", 3, 4),
                ],
            ),
        ];

        let updated = sorted_file_tree_nodes(&nodes, FileTreeSortMode::Updated);
        let created = sorted_file_tree_nodes(&nodes, FileTreeSortMode::Created);

        assert_eq!(
            updated
                .iter()
                .map(|node| node.name.as_str())
                .collect::<Vec<_>>(),
            vec!["dir", "new.md", "old.md"]
        );
        assert_eq!(
            created
                .iter()
                .map(|node| node.name.as_str())
                .collect::<Vec<_>>(),
            vec!["dir", "new.md", "old.md"]
        );

        let FileNodeKind::Directory { children } = &updated[0].kind else {
            panic!("expected directory children");
        };
        assert_eq!(
            children
                .iter()
                .map(|node| node.name.as_str())
                .collect::<Vec<_>>(),
            vec!["child-new.md", "child-old.md"]
        );
    }

    #[test]
    fn drag_drop_model_allows_valid_directory_targets_only() {
        let note_source = FileTreeDragSource {
            path: PathBuf::from("workspace/notes/a.md"),
            is_directory: false,
        };
        let directory_source = FileTreeDragSource {
            path: PathBuf::from("workspace/notes"),
            is_directory: true,
        };

        assert!(can_drop_on_directory(
            &note_source,
            Path::new("workspace/archive")
        ));
        assert!(!can_drop_on_directory(
            &note_source,
            Path::new("workspace/notes")
        ));
        assert!(!can_drop_on_directory(
            &directory_source,
            Path::new("workspace/notes")
        ));
        assert!(!can_drop_on_directory(
            &directory_source,
            Path::new("workspace/notes/nested")
        ));
        assert!(can_drop_on_directory(
            &directory_source,
            Path::new("workspace/archive")
        ));
    }

    #[test]
    fn tree_row_class_reflects_drag_states() {
        assert_eq!(
            file_tree_row_class("directory", true, false, true, true),
            "mn-tree-row directory active dragging drop-target"
        );
        assert_eq!(
            file_tree_row_class("note", false, true, false, false),
            "mn-tree-row note editing"
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

    #[test]
    fn keyboard_navigation_starts_inline_rename_with_f2() {
        let nodes = vec![directory(
            "workspace/notes",
            vec![note("workspace/notes/a.md")],
        )];
        let expanded = HashSet::from([PathBuf::from("workspace/notes")]);
        let items = visible_file_tree_items(&nodes, &expanded);

        assert!(matches!(
            file_tree_keyboard_action(
                &items,
                Some(Path::new("workspace/notes/a.md")),
                &expanded,
                FileTreeKey::F2,
            ),
            FileTreeKeyboardAction::Rename(node)
                if node.path == Path::new("workspace/notes/a.md")
        ));
    }

    #[test]
    fn rename_draft_uses_note_stem_and_directory_name() {
        let note_draft = FileTreeRenameDraft::from_node(&note("workspace/notes/a.md"));
        let directory_draft =
            FileTreeRenameDraft::from_node(&directory("workspace/notes", Vec::new()));

        assert_eq!(note_draft.value, "a");
        assert_eq!(note_draft.original_value, "a");
        assert_eq!(directory_draft.value, "notes");
        assert_eq!(directory_draft.original_value, "notes");
    }

    #[test]
    fn rename_draft_commits_only_changed_non_empty_names() {
        let mut draft = FileTreeRenameDraft::from_node(&note("workspace/notes/a.md"));

        draft.value = "  ".to_string();
        assert_eq!(draft.commit_name(), None);

        draft.value = "a".to_string();
        assert_eq!(draft.commit_name(), None);

        draft.value = " renamed ".to_string();
        assert_eq!(draft.commit_name(), Some("renamed".to_string()));
    }

    #[test]
    fn context_menu_model_detects_directory_and_target() {
        let menu = FileTreeContextMenu {
            node: directory("workspace/notes", Vec::new()),
            position: ContextMenuPosition { x: 24.0, y: 36.0 },
        };

        assert!(menu.is_directory());
        assert_eq!(
            menu.file_target(),
            FileTarget {
                path: PathBuf::from("workspace/notes"),
                name: "notes".to_string(),
            }
        );
    }

    #[test]
    fn context_menu_style_clamps_to_viewport() {
        assert_eq!(
            context_menu_style(ContextMenuPosition { x: -4.0, y: 3.0 }),
            "left: min(8px, calc(100vw - 188px)); top: min(8px, calc(100vh - 220px));"
        );
        assert_eq!(
            context_menu_style(ContextMenuPosition { x: 42.4, y: 99.7 }),
            "left: min(42px, calc(100vw - 188px)); top: min(100px, calc(100vh - 220px));"
        );
    }

    #[test]
    fn delete_menu_label_reflects_confirmation_state() {
        assert_eq!(delete_menu_label(false), "Delete");
        assert_eq!(delete_menu_label(true), "Confirm delete");
    }
}
