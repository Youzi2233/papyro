pub mod file_tree;

use crate::commands::FileTarget;
use crate::components::primitives::{Menu, MenuItem};
use crate::context::use_app_context;
use crate::i18n::use_i18n;
use crate::perf::{perf_timer, trace_sidebar_resize};
use dioxus::prelude::*;
use std::path::Path;
use std::time::Instant;

pub use file_tree::{FileTree, FileTreeSortMode};

const SIDEBAR_MIN_WIDTH: u32 = 240;
const SIDEBAR_MAX_WIDTH: u32 = 380;

#[derive(Debug, Clone, Copy, PartialEq)]
struct SidebarResizeDrag {
    start_x: f64,
    start_width: u32,
    started_at: Option<Instant>,
}

#[derive(Debug, Clone, PartialEq)]
struct SidebarWorkspaceMenu {
    position: SidebarContextMenuPosition,
    target: FileTarget,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct SidebarContextMenuPosition {
    x: f64,
    y: f64,
}

impl SidebarContextMenuPosition {
    fn from_event(event: &MouseEvent) -> Self {
        let point = event.client_coordinates();
        Self {
            x: point.x,
            y: point.y,
        }
    }
}

#[component]
pub fn Sidebar(on_search: EventHandler<()>, on_settings: EventHandler<()>) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands;
    let sidebar_model = app.sidebar_model.read().clone();
    let resize_commands = commands.clone();
    let theme_commands = commands.clone();
    let workspace_path_text = sidebar_workspace_path_text(sidebar_model.path.as_deref(), i18n);

    let mut create_name = use_signal(String::new);
    let mut show_create = use_signal(|| false);
    let mut tree_sort = use_signal(FileTreeSortMode::default);
    let mut resize_drag = use_signal(|| None::<SidebarResizeDrag>);
    let mut resize_preview_width = use_signal(|| None::<u32>);
    let mut workspace_menu = use_signal(|| None::<SidebarWorkspaceMenu>);

    let configured_sidebar_width = (app.sidebar_width)();
    let sidebar_width = resize_preview_width().unwrap_or(configured_sidebar_width);
    let sidebar_class = if resize_drag().is_some() {
        "mn-sidebar resizing"
    } else {
        "mn-sidebar"
    };
    let has_workspace = sidebar_model.name.is_some();
    let create_action_label = if show_create() {
        i18n.text("Cancel", "取消")
    } else {
        i18n.text("New note", "新建笔记")
    };
    let create_action_icon_class = if show_create() {
        "mn-button-icon cancel"
    } else {
        "mn-button-icon note"
    };
    let workspace_root_path = sidebar_model.path.clone();
    let workspace_root_selected = sidebar_model.root_selected;
    let workspace_root_target_name = sidebar_model
        .name
        .clone()
        .unwrap_or_else(|| workspace_path_text.clone());
    let workspace_action_label = if has_workspace {
        i18n.text("Switch", "切换")
    } else {
        i18n.text("Open workspace", "打开工作区")
    };

    rsx! {
        aside {
            class: "{sidebar_class}",
            style: format!("width: {}px", sidebar_width),
            onclick: move |_| workspace_menu.set(None),

            div { class: "mn-sidebar-header",
                div { class: "mn-sidebar-brand",
                    div { class: "mn-sidebar-brand-mark", "P" }
                    div { class: "mn-sidebar-brand-copy",
                        p { class: "mn-sidebar-brand-title", "papyro" }
                    }
                    div { class: "mn-sidebar-brand-actions",
                        button {
                            class: "mn-sidebar-icon-btn",
                            title: i18n.text("Toggle theme", "切换主题"),
                            "aria-label": i18n.text("Toggle theme", "切换主题"),
                            onclick: move |_| {
                                crate::chrome::toggle_theme(theme_commands.clone());
                            },
                            span { class: "mn-tool-icon theme", "aria-hidden": "true" }
                        }
                        button {
                            class: "mn-sidebar-icon-btn",
                            title: i18n.text("Settings", "设置"),
                            "aria-label": i18n.text("Settings", "设置"),
                            onclick: move |_| on_settings.call(()),
                            span { class: "mn-tool-icon settings", "aria-hidden": "true" }
                        }
                    }
                }
                button {
                    class: "mn-sidebar-search",
                    disabled: !has_workspace,
                    title: if has_workspace {
                        i18n.text("Search workspace", "搜索工作区")
                    } else {
                        i18n.text("Open a workspace to search", "打开工作区后即可搜索")
                    },
                    onclick: move |_| on_search.call(()),
                    span { class: "mn-sidebar-search-icon", "⌕" }
                    span { class: "mn-sidebar-search-label", {i18n.text("Search notes", "搜索笔记")} }
                    span { class: "mn-sidebar-search-shortcut", "Ctrl Shift F" }
                }
                if let Some(root_path) = workspace_root_path.clone() {
                    button {
                        r#type: "button",
                        class: if workspace_root_selected {
                            "mn-sidebar-workspace active"
                        } else {
                            "mn-sidebar-workspace"
                        },
                        title: i18n.text(
                            "Use the workspace root for new notes and folders",
                            "将工作区根目录作为新建笔记和文件夹的位置",
                        ),
                        "aria-pressed": if workspace_root_selected { "true" } else { "false" },
                        onclick: {
                            let commands = commands.clone();
                            let root_path = root_path.clone();
                            move |_| commands.select_path.call(root_path.clone())
                        },
                        oncontextmenu: {
                            let commands = commands.clone();
                            let root_path = root_path.clone();
                            let target_name = workspace_root_target_name.clone();
                            move |event| {
                                event.prevent_default();
                                event.stop_propagation();
                                commands.select_path.call(root_path.clone());
                                workspace_menu.set(Some(SidebarWorkspaceMenu {
                                    position: SidebarContextMenuPosition::from_event(&event),
                                    target: FileTarget {
                                        path: root_path.clone(),
                                        name: target_name.clone(),
                                    },
                                }));
                            }
                        },
                        span { class: "mn-sidebar-workspace-label", {i18n.text("Folder", "目录")} }
                        span { class: "mn-sidebar-workspace-path", "{workspace_path_text}" }
                    }
                } else {
                    div { class: "mn-sidebar-workspace", title: "{workspace_path_text}",
                        span { class: "mn-sidebar-workspace-label", {i18n.text("Folder", "目录")} }
                        span { class: "mn-sidebar-workspace-path", "{workspace_path_text}" }
                    }
                }

                if show_create() {
                    div { class: "mn-sidebar-create",
                        input {
                            class: "mn-input",
                            placeholder: i18n.text("Note name", "笔记名称"),
                            value: "{create_name}",
                            autofocus: true,
                            oninput: move |e| create_name.set(e.value()),
                            onkeydown: move |e| {
                                if e.key() == Key::Enter {
                                    let name = create_name().trim().to_string();
                                    let name = if name.is_empty() { "Untitled".to_string() } else { name };
                                    commands.create_note.call(name);
                                    create_name.set(String::new());
                                    show_create.set(false);
                                }
                            },
                        }
                        button {
                            class: "mn-button",
                            onclick: move |_| {
                                let name = create_name().trim().to_string();
                                let name = if name.is_empty() { "Untitled".to_string() } else { name };
                                commands.create_note.call(name);
                                create_name.set(String::new());
                                show_create.set(false);
                            },
                            {i18n.text("Create", "创建")}
                        }
                    }
                }
            }

            div {
                class: "mn-tree-sortbar",
                role: "group",
                "aria-label": "File tree sort",
                for mode in FileTreeSortMode::all() {
                    button {
                        class: if tree_sort() == mode { "mn-tree-sort-btn active" } else { "mn-tree-sort-btn" },
                        title: format!(
                            "{} {}",
                            i18n.text("Sort by", "排序方式"),
                            sort_mode_label(mode, i18n)
                        ),
                        "aria-pressed": "{tree_sort() == mode}",
                        onclick: move |_| tree_sort.set(mode),
                        "{sort_mode_label(mode, i18n)}"
                    }
                }
            }

            FileTree { sort_mode: tree_sort() }

            div { class: "mn-sidebar-footer",
                button {
                    class: "mn-button primary mn-sidebar-new",
                    title: i18n.text("New note in current folder", "在当前目录中新建笔记"),
                    disabled: !has_workspace,
                    onclick: move |_| {
                        show_create.set(!show_create());
                    },
                    span { class: "{create_action_icon_class}", "aria-hidden": "true" }
                    span { "{create_action_label}" }
                }
                div { class: "mn-sidebar-footer-tools",
                    button {
                        class: "mn-button",
                        title: i18n.text("Reload workspace", "重新加载工作区"),
                        disabled: !has_workspace,
                        onclick: move |_| commands.refresh_workspace.call(()),
                        span { class: "mn-button-icon refresh", "aria-hidden": "true" }
                        span { {i18n.text("Refresh", "刷新")} }
                    }
                    button {
                        class: "mn-button",
                        onclick: move |_| commands.open_workspace.call(()),
                        span { class: "mn-button-icon workspace", "aria-hidden": "true" }
                        span { "{workspace_action_label}" }
                    }
                }
            }

            div {
                class: "mn-sidebar-resize-handle",
                title: i18n.text("Resize sidebar", "调整侧边栏宽度"),
                "aria-label": i18n.text("Resize sidebar", "调整侧边栏宽度"),
                role: "separator",
                "aria-orientation": "vertical",
                onmousedown: move |event| {
                    event.prevent_default();
                    event.stop_propagation();
                    let started_at = perf_timer();
                    resize_drag.set(Some(SidebarResizeDrag {
                        start_x: event.client_coordinates().x,
                        start_width: sidebar_width,
                        started_at,
                    }));
                    resize_preview_width.set(Some(sidebar_width));
                },
            }
            if let Some(drag) = resize_drag() {
                div {
                    class: "mn-sidebar-resize-overlay",
                    onmousemove: move |event| {
                        event.prevent_default();
                        let width = sidebar_width_from_drag(drag, event.client_coordinates().x);
                        resize_preview_width.set(Some(width));
                    },
                    onmouseup: move |event| {
                        event.prevent_default();
                        let width = sidebar_width_from_drag(drag, event.client_coordinates().x);
                        resize_preview_width.set(Some(width));
                        crate::chrome::set_sidebar_width(resize_commands.clone(), width);
                        trace_sidebar_resize(drag.start_width, width, drag.started_at);
                        resize_drag.set(None);
                        resize_preview_width.set(None);
                    },
                }
            }
            if let Some(menu) = workspace_menu() {
                div {
                    class: "mn-tree-context-dismiss",
                    onclick: move |_| workspace_menu.set(None),
                    oncontextmenu: move |event| {
                        event.prevent_default();
                        workspace_menu.set(None);
                    },
                }
                SidebarWorkspaceMenuView {
                    menu,
                    on_close: move |_| workspace_menu.set(None),
                }
            }
        }
    }
}

#[component]
fn SidebarWorkspaceMenuView(menu: SidebarWorkspaceMenu, on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands;
    let style = sidebar_context_menu_style(menu.position);
    let reveal_target = menu.target.clone();

    rsx! {
        Menu {
            label: i18n.text("Workspace actions", "工作区操作").to_string(),
            class_name: "mn-tree-context-menu".to_string(),
            style,
            MenuItem {
                label: i18n.text("New note", "新建笔记").to_string(),
                danger: false,
                on_select: move |_| {
                    commands.create_note.call("Untitled".to_string());
                    on_close.call(());
                },
            }
            MenuItem {
                label: i18n.text("New folder", "新建文件夹").to_string(),
                danger: false,
                on_select: move |_| {
                    commands.create_folder.call("New Folder".to_string());
                    on_close.call(());
                },
            }
            MenuItem {
                label: i18n.text("Reveal", "定位").to_string(),
                danger: false,
                on_select: move |_| {
                    commands.reveal_in_explorer.call(reveal_target.clone());
                    on_close.call(());
                },
            }
        }
    }
}

fn sidebar_context_menu_style(position: SidebarContextMenuPosition) -> String {
    let left = position.x.max(8.0);
    let top = position.y.max(8.0);
    format!(
        "left: min({left:.0}px, calc(100vw - 188px)); top: min({top:.0}px, calc(100vh - 180px));"
    )
}

fn sidebar_width_from_drag(drag: SidebarResizeDrag, current_x: f64) -> u32 {
    clamp_sidebar_width(drag.start_width as f64 + current_x - drag.start_x)
}

fn sort_mode_label(mode: FileTreeSortMode, i18n: crate::i18n::UiText) -> &'static str {
    match mode {
        FileTreeSortMode::Name => i18n.text("Name", "名称"),
        FileTreeSortMode::Updated => i18n.text("Updated", "更新"),
        FileTreeSortMode::Created => i18n.text("Created", "创建"),
    }
}

fn clamp_sidebar_width(width: f64) -> u32 {
    width
        .round()
        .clamp(SIDEBAR_MIN_WIDTH as f64, SIDEBAR_MAX_WIDTH as f64) as u32
}

fn sidebar_workspace_path_text(path: Option<&Path>, i18n: crate::i18n::UiText) -> String {
    path.map(|path| path.display().to_string())
        .unwrap_or_else(|| {
            i18n.text("Open a folder to start", "打开目录即可开始")
                .to_string()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sidebar_resize_clamps_width() {
        assert_eq!(clamp_sidebar_width(120.0), SIDEBAR_MIN_WIDTH);
        assert_eq!(clamp_sidebar_width(640.0), SIDEBAR_MAX_WIDTH);
        assert_eq!(clamp_sidebar_width(301.6), 302);
    }

    #[test]
    fn sidebar_resize_uses_start_width_and_delta() {
        let drag = SidebarResizeDrag {
            start_x: 100.0,
            start_width: 260,
            started_at: None,
        };

        assert_eq!(sidebar_width_from_drag(drag, 140.0), 300);
        assert_eq!(sidebar_width_from_drag(drag, 0.0), SIDEBAR_MIN_WIDTH);
    }

    #[test]
    fn sidebar_workspace_path_text_describes_current_folder() {
        assert_eq!(
            sidebar_workspace_path_text(
                Some(Path::new("workspace")),
                crate::i18n::i18n_for(papyro_core::models::AppLanguage::English)
            ),
            "workspace"
        );
        assert_eq!(
            sidebar_workspace_path_text(
                None,
                crate::i18n::i18n_for(papyro_core::models::AppLanguage::English)
            ),
            "Open a folder to start"
        );
    }
}
