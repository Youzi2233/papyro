pub mod file_tree;

use crate::commands::{FileTarget, OpenMarkdownTarget};
use crate::components::primitives::{
    ActionButton, Button, ButtonState, ButtonVariant, ContextMenu, IconButton, MenuItem,
    ResizeRail, SidebarSearchButton, TextInput,
};
use crate::components::search::SearchResultsPanel;
use crate::context::use_app_context;
use crate::i18n::use_i18n;
use crate::perf::{perf_timer, trace_sidebar_resize};
use crate::view_model::{SearchResultRowViewModel, WorkspaceSearchViewModel};
use dioxus::prelude::*;
use std::path::Path;
use std::time::Instant;

pub use file_tree::{FileTree, FileTreeSortMode};

const SIDEBAR_MIN_WIDTH: u32 = 240;
const SIDEBAR_MAX_WIDTH: u32 = 380;
const SIDEBAR_RESIZE_SCRIPT: &str = r#"
const previous = window.__papyroSidebarResize;
if (previous?.cleanup) {
    previous.cleanup();
}

const minWidth = 240;
const maxWidth = 380;
const sidebar = document.querySelector(".mn-sidebar");
if (!sidebar) {
    dioxus.send("cancel");
} else {
    let finish = () => {};
    const done = new Promise((resolve) => {
        finish = resolve;
    });
    const startX = Number(await dioxus.recv());
    const startWidth = Number(await dioxus.recv());
    const clampWidth = (width) => Math.round(Math.min(maxWidth, Math.max(minWidth, width)));
    let latestWidth = clampWidth(startWidth);
    let frame = 0;

    const applyWidth = () => {
        frame = 0;
        sidebar.style.width = `${latestWidth}px`;
    };
    const requestApply = () => {
        if (!frame) {
            frame = requestAnimationFrame(applyWidth);
        }
    };
    const setResizing = (enabled) => {
        sidebar.classList.toggle("resizing", enabled);
        document.documentElement.classList.toggle("mn-sidebar-resizing", enabled);
    };
    const move = (event) => {
        latestWidth = clampWidth(startWidth + event.clientX - startX);
        requestApply();
        event.preventDefault();
    };
    const cleanup = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", cancel, true);
        if (frame) {
            cancelAnimationFrame(frame);
            applyWidth();
        }
        setResizing(false);
        if (window.__papyroSidebarResize?.cleanup === cleanup) {
            window.__papyroSidebarResize = null;
        }
        finish();
    };
    const up = (event) => {
        move(event);
        cleanup();
        dioxus.send(String(latestWidth));
    };
    const cancel = () => {
        cleanup();
        sidebar.style.width = `${clampWidth(startWidth)}px`;
        dioxus.send("cancel");
    };

    window.__papyroSidebarResize = { cleanup };
    setResizing(true);
    requestApply();
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    await done;
}
"#;
const SIDEBAR_SEARCH_DISMISS_SCRIPT: &str = r#"
const previous = window.__papyroSidebarSearchDismiss;
if (previous) {
    document.removeEventListener("pointerdown", previous, true);
}

const handler = (event) => {
    const target = event.target;
    const element = target instanceof Element ? target : target?.parentElement;
    if (element?.closest?.(".mn-sidebar-search-shell")) {
        return;
    }

    dioxus.send("close");
};

window.__papyroSidebarSearchDismiss = handler;
document.addEventListener("pointerdown", handler, true);
await new Promise(() => {});
"#;

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
    let _ = on_settings;
    let _ = on_search;
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands;
    let brand_logo_src =
        try_use_context::<String>().unwrap_or_else(|| "/assets/logo.png".to_string());
    let sidebar_model = app.sidebar_model.read().clone();
    let resize_commands = commands.clone();
    let collapse_commands = commands.clone();
    let workspace_switch_commands = commands.clone();
    let workspace_path_text = sidebar_workspace_path_text(sidebar_model.path.as_deref(), i18n);

    let mut create_name = use_signal(String::new);
    let mut show_create = use_signal(|| false);
    let mut resize_drag = use_signal(|| None::<SidebarResizeDrag>);
    let mut workspace_menu = use_signal(|| None::<SidebarWorkspaceMenu>);
    let mut search_focused = use_signal(|| false);
    let search_active_index = use_signal(|| 0usize);

    let configured_sidebar_width = (app.sidebar_width)();
    let sidebar_class = if resize_drag().is_some() {
        "mn-sidebar resizing"
    } else {
        "mn-sidebar"
    };
    let workspace_root_path = sidebar_model.path.clone();
    let workspace_root_selected = sidebar_model.root_selected;
    let workspace_root_target_name = sidebar_model
        .name
        .clone()
        .unwrap_or_else(|| workspace_path_text.clone());
    let has_workspace = sidebar_model.name.is_some();
    let workspace_name = i18n.text("Workspace", "工作区").to_string();
    let workspace_switch_label = if has_workspace {
        i18n.text("Switch workspace", "切换工作区")
    } else {
        i18n.text("Open workspace", "打开工作区")
    };
    let workspace_card_class = if workspace_root_selected {
        "mn-sidebar-workspace-card active"
    } else if has_workspace {
        "mn-sidebar-workspace-card"
    } else {
        "mn-sidebar-workspace-card empty"
    };
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
    let search_title = if has_workspace {
        i18n.text("Search workspace", "搜索工作区")
    } else {
        i18n.text("Open a workspace to search", "打开工作区后即可搜索")
    };

    let workspace_search_model = app.workspace_search_model.read().clone();
    let search_query = workspace_search_model.query.clone();
    let search_results = workspace_search_model.results.clone();
    let search_has_content = !search_query.trim().is_empty()
        || workspace_search_model.is_loading
        || workspace_search_model.error.is_some();
    let search_open = has_workspace && search_focused() && search_has_content;
    let search_active = if search_results.is_empty() {
        0
    } else {
        search_active_index().min(search_results.len() - 1)
    };

    rsx! {
        aside {
            class: "{sidebar_class}",
            style: format!("width: {}px", configured_sidebar_width),
            onclick: move |_| {
                workspace_menu.set(None);
                search_focused.set(false);
            },

            div { class: "mn-sidebar-header",
                div { class: "mn-sidebar-brand",
                    onmousedown: crate::chrome::drag_window_on_primary_mouse_down,
                    img {
                        class: "mn-sidebar-brand-logo",
                        src: brand_logo_src,
                        alt: "Papyro logo",
                    }
                    div { class: "mn-sidebar-brand-copy",
                        p { class: "mn-sidebar-brand-title", "Papyro" }
                    }
                    div { class: "mn-sidebar-brand-actions",
                        IconButton {
                            label: i18n.text("Collapse sidebar", "收起侧边栏").to_string(),
                            icon: String::new(),
                            icon_class: Some("mn-tool-icon sidebar-open".to_string()),
                            class_name: "mn-sidebar-icon-btn".to_string(),
                            disabled: false,
                            selected: false,
                            danger: false,
                            on_click: move |_| {
                                crate::chrome::toggle_sidebar(collapse_commands.clone(), "sidebar");
                            },
                        }
                    }
                }
                SidebarInlineSearch {
                    title: search_title.to_string(),
                    has_workspace,
                    query: search_query.clone(),
                    results: search_results.clone(),
                    model: workspace_search_model.clone(),
                    active_index: search_active,
                    is_open: search_open,
                    search_focused,
                    search_active_index,
                }
                SidebarSearchButton {
                    label: i18n.text("Search notes", "搜索笔记").to_string(),
                    title: search_title.to_string(),
                    shortcut: "Ctrl Shift F".to_string(),
                    class_name: "legacy-hidden".to_string(),
                    disabled: !has_workspace,
                    on_click: move |_| on_search.call(()),
                }
                div { class: "{workspace_card_class}",
                    if let Some(root_path) = workspace_root_path.clone() {
                        button {
                            class: "mn-sidebar-workspace-main",
                            r#type: "button",
                            title: i18n.text(
                                "Use the workspace root for new notes and folders",
                                "将工作区根目录作为新建笔记和文件夹的位置",
                            ),
                            "aria-pressed": if workspace_root_selected { "true" } else { "false" },
                            onmousedown: move |event| event.stop_propagation(),
                            onclick: {
                                let commands = commands.clone();
                                let root_path = root_path.clone();
                                move |_| commands.select_path.call(root_path.clone())
                            },
                            oncontextmenu: {
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
                            },
                            span { class: "mn-sidebar-workspace-name", "{workspace_name}" }
                            span { class: "mn-sidebar-workspace-path", "{workspace_path_text}" }
                        }
                    } else {
                        div {
                            class: "mn-sidebar-workspace-main",
                            title: workspace_path_text.clone(),
                            onmousedown: move |event| event.stop_propagation(),
                            span { class: "mn-sidebar-workspace-name", "{workspace_name}" }
                            span { class: "mn-sidebar-workspace-path", "{workspace_path_text}" }
                        }
                    }
                    button {
                        class: "mn-sidebar-workspace-switch",
                        r#type: "button",
                        title: workspace_switch_label,
                        "aria-label": workspace_switch_label,
                        onmousedown: move |event| event.stop_propagation(),
                        onclick: move |event| {
                            event.stop_propagation();
                            workspace_switch_commands.open_workspace.call(());
                        },
                        span { class: "mn-button-icon workspace", "aria-hidden": "true" }
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
                        Button {
                            label: i18n.text("Create", "创建").to_string(),
                            variant: ButtonVariant::Default,
                            disabled: false,
                            on_click: move |_| {
                                let name = create_name().trim().to_string();
                                let name = if name.is_empty() { "Untitled".to_string() } else { name };
                                commands.create_note.call(name);
                                create_name.set(String::new());
                                show_create.set(false);
                            },
                        }
                    }
                }
            }

            FileTree { sort_mode: FileTreeSortMode::Name }

            div { class: "mn-sidebar-footer",
                onmousedown: move |event| event.stop_propagation(),
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
            }

            ResizeRail {
                label: i18n.text("Resize sidebar", "调整侧边栏宽度").to_string(),
                class_name: "mn-sidebar-resize-handle".to_string(),
                is_resizing: resize_drag().is_some(),
                on_start: move |event: MouseEvent| {
                    event.prevent_default();
                    event.stop_propagation();
                    let started_at = perf_timer();
                    let drag = SidebarResizeDrag {
                        start_x: event.client_coordinates().x,
                        start_width: configured_sidebar_width,
                        started_at,
                    };
                    resize_drag.set(Some(drag));

                    let mut eval = document::eval(SIDEBAR_RESIZE_SCRIPT);
                    let commands = resize_commands.clone();
                    spawn(async move {
                        if eval.send(drag.start_x).is_err() || eval.send(drag.start_width).is_err() {
                            resize_drag.set(None);
                            return;
                        }

                        match eval.recv::<String>().await {
                            Ok(width) if width != "cancel" => {
                                if let Ok(width) = width.parse::<u32>() {
                                    let width = clamp_sidebar_width(width as f64);
                                    crate::chrome::set_sidebar_width(commands, width);
                                    trace_sidebar_resize(drag.start_width, width, drag.started_at);
                                }
                            }
                            _ => {}
                        }
                        resize_drag.set(None);
                    });
                },
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
fn SidebarInlineSearch(
    title: String,
    has_workspace: bool,
    query: String,
    results: Vec<SearchResultRowViewModel>,
    model: WorkspaceSearchViewModel,
    active_index: usize,
    is_open: bool,
    mut search_focused: Signal<bool>,
    mut search_active_index: Signal<usize>,
) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands;
    let results_for_keys = results.clone();

    use_effect(move || {
        let mut eval = document::eval(SIDEBAR_SEARCH_DISMISS_SCRIPT);

        spawn(async move {
            while eval.recv::<String>().await.is_ok() {
                search_focused.set(false);
            }
        });
    });

    rsx! {
        div {
            class: if is_open { "mn-sidebar-search-shell open" } else { "mn-sidebar-search-shell" },
            onmousedown: move |event| event.stop_propagation(),
            ondoubleclick: move |event| event.stop_propagation(),
            onclick: move |event| event.stop_propagation(),
            span { class: "mn-sidebar-search-icon", "⌕" }
            input {
                id: "mn-sidebar-search-input",
                class: "mn-sidebar-search-input",
                r#type: "text",
                disabled: !has_workspace,
                title,
                "aria-label": i18n.text("Search notes", "搜索笔记"),
                placeholder: i18n.text("Search notes", "搜索笔记"),
                value: "{query}",
                onfocus: move |_| search_focused.set(true),
                oninput: move |event| {
                    search_active_index.set(0);
                    search_focused.set(true);
                    commands.search_workspace.call(event.value());
                },
                onkeydown: move |event: KeyboardEvent| {
                    match event.key() {
                        Key::Escape => {
                            event.prevent_default();
                            search_focused.set(false);
                        }
                        Key::ArrowDown => {
                            event.prevent_default();
                            if !results_for_keys.is_empty() {
                                search_active_index.set((search_active_index() + 1).min(results_for_keys.len() - 1));
                            }
                        }
                        Key::ArrowUp => {
                            event.prevent_default();
                            search_active_index.set(search_active_index().saturating_sub(1));
                        }
                        Key::Enter => {
                            event.prevent_default();
                            if let Some(result) = results_for_keys.get(active_index).cloned() {
                                open_sidebar_search_result(commands.clone(), result, search_focused);
                            }
                        }
                        _ => {}
                    }
                },
            }
            span { class: "mn-sidebar-search-shortcut", "Ctrl Shift F" }
            if is_open {
                SidebarSearchPopover {
                    model,
                    active_index,
                    on_close: move |_| search_focused.set(false),
                }
            }
        }
    }
}

#[component]
fn SidebarSearchPopover(
    model: WorkspaceSearchViewModel,
    active_index: usize,
    on_close: EventHandler<()>,
) -> Element {
    rsx! {
        div {
            class: "mn-sidebar-search-popover",
            onmousedown: move |event| event.stop_propagation(),
            onclick: move |event| event.stop_propagation(),
            SearchResultsPanel {
                query: model.query,
                results: model.results,
                is_loading: model.is_loading,
                error: model.error,
                active_index,
                class_name: "mn-sidebar-search-results".to_string(),
                on_close,
            }
        }
    }
}

fn open_sidebar_search_result(
    commands: crate::commands::AppCommands,
    result: SearchResultRowViewModel,
    mut search_focused: Signal<bool>,
) {
    commands
        .open_markdown
        .call(OpenMarkdownTarget { path: result.path });
    search_focused.set(false);
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

#[cfg(test)]
fn sidebar_width_from_drag(drag: SidebarResizeDrag, current_x: f64) -> u32 {
    clamp_sidebar_width(drag.start_width as f64 + current_x - drag.start_x)
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
