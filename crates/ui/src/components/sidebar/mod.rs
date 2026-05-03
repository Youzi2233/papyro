pub mod file_tree;

use crate::commands::FileTarget;
use crate::components::primitives::{
    ActionButton, ButtonState, ButtonVariant, ContextMenu, IconButton, MenuItem, SegmentedControl,
    SegmentedControlOption, SidebarItem, TextInput,
};
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
    let brand_logo_src =
        try_use_context::<String>().unwrap_or_else(|| "/assets/logo.png".to_string());
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
                    img {
                        class: "mn-sidebar-brand-logo",
                        src: brand_logo_src,
                        alt: "Papyro logo",
                    }
                    div { class: "mn-sidebar-brand-copy",
                        p { class: "mn-sidebar-brand-title", "papyro" }
                    }
                    div { class: "mn-sidebar-brand-actions",
                        IconButton {
                            label: i18n.text("Toggle theme", "切换主题").to_string(),
                            icon: String::new(),
                            icon_class: Some("mn-tool-icon theme".to_string()),
                            class_name: "mn-sidebar-icon-btn".to_string(),
                            disabled: false,
                            selected: false,
                            danger: false,
                            on_click: move |_| {
                                crate::chrome::toggle_theme(theme_commands.clone());
                            },
                        }
                        IconButton {
                            label: i18n.text("Settings", "设置").to_string(),
                            icon: String::new(),
                            icon_class: Some("mn-tool-icon settings".to_string()),
                            class_name: "mn-sidebar-icon-btn".to_string(),
                            disabled: false,
                            selected: false,
                            danger: false,
                            on_click: move |_| on_settings.call(()),
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
                    SidebarItem {
                        label: i18n.text("Folder", "目录").to_string(),
                        value: workspace_path_text.clone(),
                        title: i18n.text(
                            "Use the workspace root for new notes and folders",
                            "将工作区根目录作为新建笔记和文件夹的位置",
                        ).to_string(),
                        selected: workspace_root_selected,
                        class_name: String::new(),
                        on_click: Some(EventHandler::new({
                            let commands = commands.clone();
                            let root_path = root_path.clone();
                            move |_event: MouseEvent| {
                                commands.select_path.call(root_path.clone());
                            }
                        })),
                        on_context_menu: Some(EventHandler::new({
                            let commands = commands.clone();
                            let root_path = root_path.clone();
                            let target_name = workspace_root_target_name.clone();
                            move |event: MouseEvent| {
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
                        })),
                    }
                } else {
                    SidebarItem {
                        label: i18n.text("Folder", "目录").to_string(),
                        value: workspace_path_text.clone(),
                        title: workspace_path_text.clone(),
                        selected: false,
                        class_name: String::new(),
                        on_click: None::<EventHandler<MouseEvent>>,
                        on_context_menu: None::<EventHandler<MouseEvent>>,
                    }
                }

                if show_create() {
                    div { class: "mn-sidebar-create",
                        TextInput {
                            class_name: "mn-input".to_string(),
                            placeholder: i18n.text("Note name", "笔记名称").to_string(),
                            value: create_name(),
                            autofocus: true,
                            on_input: move |value| create_name.set(value),
                            on_keydown: move |e: KeyboardEvent| {
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

            TreeSortControl {
                selected: tree_sort(),
                on_change: move |mode| tree_sort.set(mode),
            }

            FileTree { sort_mode: tree_sort() }

            div { class: "mn-sidebar-footer",
                ActionButton {
                    label: create_action_label.to_string(),
                    variant: ButtonVariant::Primary,
                    state: if has_workspace { ButtonState::Enabled } else { ButtonState::Disabled },
                    icon_class: Some(create_action_icon_class.to_string()),
                    title: None::<String>,
                    class_name: "mn-sidebar-new".to_string(),
                    on_click: move |_| {
                        show_create.set(!show_create());
                    },
                }
                div { class: "mn-sidebar-footer-tools",
                    ActionButton {
                        label: i18n.text("Refresh", "刷新").to_string(),
                        variant: ButtonVariant::Default,
                        state: if has_workspace { ButtonState::Enabled } else { ButtonState::Disabled },
                        icon_class: Some("mn-button-icon refresh".to_string()),
                        title: None::<String>,
                        class_name: String::new(),
                        on_click: move |_| commands.refresh_workspace.call(()),
                    }
                    ActionButton {
                        label: workspace_action_label.to_string(),
                        variant: ButtonVariant::Default,
                        state: ButtonState::Enabled,
                        icon_class: Some("mn-button-icon workspace".to_string()),
                        title: None::<String>,
                        class_name: String::new(),
                        on_click: move |_| commands.open_workspace.call(()),
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
pub fn TreeSortControl(
    selected: FileTreeSortMode,
    on_change: EventHandler<FileTreeSortMode>,
) -> Element {
    let i18n = use_i18n();
    let options = FileTreeSortMode::all()
        .into_iter()
        .map(|mode| SegmentedControlOption::new(sort_mode_label(mode, i18n), sort_mode_value(mode)))
        .collect::<Vec<_>>();

    rsx! {
        SegmentedControl {
            label: i18n.text("File tree sort", "文件树排序").to_string(),
            options,
            selected: sort_mode_value(selected).to_string(),
            class_name: "mn-tree-sortbar".to_string(),
            option_class_name: "mn-tree-sort-btn".to_string(),
            on_change: move |value: String| {
                if let Some(mode) = sort_mode_from_value(&value) {
                    on_change.call(mode);
                }
            },
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
        ContextMenu {
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

fn sort_mode_value(mode: FileTreeSortMode) -> &'static str {
    match mode {
        FileTreeSortMode::Name => "name",
        FileTreeSortMode::Updated => "updated",
        FileTreeSortMode::Created => "created",
    }
}

fn sort_mode_from_value(value: &str) -> Option<FileTreeSortMode> {
    match value {
        "name" => Some(FileTreeSortMode::Name),
        "updated" => Some(FileTreeSortMode::Updated),
        "created" => Some(FileTreeSortMode::Created),
        _ => None,
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

    #[test]
    fn sort_mode_values_round_trip() {
        assert_eq!(sort_mode_value(FileTreeSortMode::Name), "name");
        assert_eq!(sort_mode_value(FileTreeSortMode::Updated), "updated");
        assert_eq!(sort_mode_value(FileTreeSortMode::Created), "created");
        assert_eq!(sort_mode_from_value("name"), Some(FileTreeSortMode::Name));
        assert_eq!(
            sort_mode_from_value("updated"),
            Some(FileTreeSortMode::Updated)
        );
        assert_eq!(
            sort_mode_from_value("created"),
            Some(FileTreeSortMode::Created)
        );
        assert_eq!(sort_mode_from_value("missing"), None);
    }
}
