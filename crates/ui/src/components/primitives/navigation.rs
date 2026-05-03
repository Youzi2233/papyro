use dioxus::prelude::*;

use super::append_class;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TreeItemKind {
    Directory,
    Note,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TreeItemIconKind {
    Folder,
    FolderOpen,
    Markdown,
}

pub(super) fn sidebar_item_class(selected: bool, class_name: &str) -> String {
    let base = if selected {
        "mn-sidebar-workspace active"
    } else {
        "mn-sidebar-workspace"
    };
    append_class(base, class_name)
}

pub(super) fn sidebar_search_button_class(class_name: &str) -> String {
    append_class("mn-sidebar-search", class_name)
}

pub(super) fn outline_item_class(level: u8, class_name: &str) -> String {
    append_class(&format!("mn-outline-item level-{level}"), class_name)
}

pub(super) fn tree_item_class(
    kind: TreeItemKind,
    is_selected: bool,
    is_editing: bool,
    is_dragging: bool,
    is_drop_target: bool,
) -> String {
    let kind_class = match kind {
        TreeItemKind::Directory => "directory",
        TreeItemKind::Note => "note",
    };
    let mut classes = vec!["mn-tree-row", kind_class];
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

pub(super) fn tree_caret_class(is_expanded: bool) -> &'static str {
    if is_expanded {
        "mn-tree-caret expanded"
    } else {
        "mn-tree-caret"
    }
}

pub(super) fn tree_icon_class(kind: TreeItemIconKind) -> &'static str {
    match kind {
        TreeItemIconKind::Folder => "mn-tree-icon folder",
        TreeItemIconKind::FolderOpen => "mn-tree-icon folder-open",
        TreeItemIconKind::Markdown => "mn-tree-icon markdown",
    }
}

#[component]
pub fn OutlineItemButton(
    label: String,
    title: String,
    tab_id: String,
    line_number: usize,
    heading_index: usize,
    level: u8,
    class_name: String,
    on_click: EventHandler<()>,
) -> Element {
    let class = outline_item_class(level, &class_name);

    rsx! {
        button {
            r#type: "button",
            class,
            "data-tab-id": "{tab_id}",
            "data-line-number": "{line_number}",
            "data-heading-index": "{heading_index}",
            title,
            onclick: move |_| on_click.call(()),
            "{label}"
        }
    }
}

#[component]
pub fn SidebarSearchButton(
    label: String,
    title: String,
    shortcut: String,
    class_name: String,
    disabled: bool,
    on_click: EventHandler<()>,
) -> Element {
    let class = sidebar_search_button_class(&class_name);

    rsx! {
        button {
            r#type: "button",
            class,
            disabled,
            title,
            onclick: move |_| on_click.call(()),
            span { class: "mn-sidebar-search-icon", "⌕" }
            span { class: "mn-sidebar-search-label", "{label}" }
            span { class: "mn-sidebar-search-shortcut", "{shortcut}" }
        }
    }
}

#[component]
pub fn SidebarItem(
    label: String,
    value: String,
    title: String,
    selected: bool,
    class_name: String,
    on_click: Option<EventHandler<MouseEvent>>,
    on_context_menu: Option<EventHandler<MouseEvent>>,
) -> Element {
    let class = sidebar_item_class(selected, &class_name);

    if let Some(on_click) = on_click {
        rsx! {
            button {
                r#type: "button",
                class,
                title,
                "aria-pressed": if selected { "true" } else { "false" },
                onclick: move |event| on_click.call(event),
                oncontextmenu: move |event| {
                    if let Some(handler) = &on_context_menu {
                        handler.call(event);
                    }
                },
                span { class: "mn-sidebar-workspace-label", "{label}" }
                span { class: "mn-sidebar-workspace-path", "{value}" }
            }
        }
    } else {
        rsx! {
            div { class, title,
                span { class: "mn-sidebar-workspace-label", "{label}" }
                span { class: "mn-sidebar-workspace-path", "{value}" }
            }
        }
    }
}

#[component]
pub fn TreeItemButton(
    kind: TreeItemKind,
    label: String,
    selected: bool,
    dragging: bool,
    drop_target: bool,
    depth_px: u32,
    expanded: Option<bool>,
    icon: TreeItemIconKind,
    accessible_label: Option<String>,
    on_click: EventHandler<MouseEvent>,
    on_context_menu: EventHandler<MouseEvent>,
    on_drag_start: EventHandler<DragEvent>,
    on_drag_end: EventHandler<DragEvent>,
    on_drag_over: EventHandler<DragEvent>,
    on_drag_leave: EventHandler<DragEvent>,
    on_drop: EventHandler<DragEvent>,
    children: Element,
) -> Element {
    let class = tree_item_class(kind, selected, false, dragging, drop_target);
    let style = format!("padding-left: {depth_px}px");

    rsx! {
        button {
            class,
            style,
            role: "treeitem",
            "aria-label": accessible_label.as_deref().unwrap_or(&label),
            "aria-selected": "{selected}",
            "aria-expanded": expanded.map(|value| if value { "true" } else { "false" }),
            draggable: true,
            onclick: move |event| on_click.call(event),
            oncontextmenu: move |event| on_context_menu.call(event),
            ondragstart: move |event| on_drag_start.call(event),
            ondragend: move |event| on_drag_end.call(event),
            ondragover: move |event| on_drag_over.call(event),
            ondragleave: move |event| on_drag_leave.call(event),
            ondrop: move |event| on_drop.call(event),
            if let Some(expanded) = expanded {
                span { class: tree_caret_class(expanded), "aria-hidden": "true" }
            }
            span { class: tree_icon_class(icon), "aria-hidden": "true" }
            {children}
        }
    }
}

#[component]
pub fn TreeItemEditRow(
    kind: TreeItemKind,
    selected: bool,
    depth_px: u32,
    expanded: Option<bool>,
    icon: TreeItemIconKind,
    children: Element,
) -> Element {
    let class = tree_item_class(kind, selected, true, false, false);
    let style = format!("padding-left: {depth_px}px");

    rsx! {
        div {
            class,
            style,
            role: "treeitem",
            "aria-selected": "{selected}",
            "aria-expanded": expanded.map(|value| if value { "true" } else { "false" }),
            if let Some(expanded) = expanded {
                span { class: tree_caret_class(expanded), "aria-hidden": "true" }
            }
            span { class: tree_icon_class(icon), "aria-hidden": "true" }
            {children}
        }
    }
}

#[component]
pub fn TreeItemLabel(label: String) -> Element {
    rsx! {
        span { class: "mn-tree-label", "{label}" }
    }
}
