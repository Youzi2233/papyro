pub mod file_tree;

use crate::context::use_app_context;
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

#[component]
pub fn Sidebar(on_search: EventHandler<()>, on_settings: EventHandler<()>) -> Element {
    let app = use_app_context();
    let commands = app.commands;
    let sidebar_model = app.sidebar_model.read().clone();
    let resize_commands = commands.clone();
    let theme_commands = commands.clone();
    let workspace_path_text = sidebar_workspace_path_text(sidebar_model.path.as_deref());

    let mut create_name = use_signal(String::new);
    let mut show_create = use_signal(|| false);
    let mut tree_sort = use_signal(FileTreeSortMode::default);
    let mut resize_drag = use_signal(|| None::<SidebarResizeDrag>);
    let mut resize_preview_width = use_signal(|| None::<u32>);

    let configured_sidebar_width = (app.sidebar_width)();
    let sidebar_width = resize_preview_width().unwrap_or(configured_sidebar_width);
    let sidebar_class = if resize_drag().is_some() {
        "mn-sidebar resizing"
    } else {
        "mn-sidebar"
    };
    let has_workspace = sidebar_model.name.is_some();
    let create_action_label = if show_create() { "Cancel" } else { "New note" };
    let create_action_icon_class = if show_create() {
        "mn-button-icon cancel"
    } else {
        "mn-button-icon note"
    };
    let workspace_action_label = if has_workspace {
        "Switch"
    } else {
        "Open workspace"
    };

    rsx! {
        aside {
            class: "{sidebar_class}",
            style: "width: {sidebar_width}px",

            // ── Header ──
            div { class: "mn-sidebar-header",
                div { class: "mn-sidebar-brand",
                    div { class: "mn-sidebar-brand-mark", "P" }
                    div { class: "mn-sidebar-brand-copy",
                        p { class: "mn-sidebar-brand-title", "papyro" }
                    }
                    div { class: "mn-sidebar-brand-actions",
                        button {
                            class: "mn-sidebar-icon-btn",
                            title: "Toggle theme",
                            "aria-label": "Toggle theme",
                            onclick: move |_| {
                                crate::chrome::toggle_theme(theme_commands.clone());
                            },
                            span { class: "mn-tool-icon theme", "aria-hidden": "true" }
                        }
                        button {
                            class: "mn-sidebar-icon-btn",
                            title: "Settings",
                            "aria-label": "Settings",
                            onclick: move |_| on_settings.call(()),
                            span { class: "mn-tool-icon settings", "aria-hidden": "true" }
                        }
                    }
                }
                button {
                    class: "mn-sidebar-search",
                    disabled: !has_workspace,
                    title: if has_workspace { "Search workspace" } else { "Open a workspace to search" },
                    onclick: move |_| on_search.call(()),
                    span { class: "mn-sidebar-search-icon", "⌕" }
                    span { class: "mn-sidebar-search-label", "Search notes" }
                    span { class: "mn-sidebar-search-shortcut", "Ctrl Shift F" }
                }
                div { class: "mn-sidebar-workspace", title: "{workspace_path_text}",
                    span { class: "mn-sidebar-workspace-label", "Folder" }
                    span { class: "mn-sidebar-workspace-path", "{workspace_path_text}" }
                }

                // ── Inline create form ──
                if show_create() {
                    div { class: "mn-sidebar-create",
                        input {
                            class: "mn-input",
                            placeholder: "Note name",
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
                            "Create"
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
                        title: "Sort by {mode.label()}",
                        "aria-pressed": "{tree_sort() == mode}",
                        onclick: move |_| tree_sort.set(mode),
                        "{mode.label()}"
                    }
                }
            }

            // ── File tree ──
            FileTree { sort_mode: tree_sort() }

            div { class: "mn-sidebar-footer",
                button {
                    class: "mn-button primary mn-sidebar-new",
                    title: "New note in current folder",
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
                        title: "Reload workspace",
                        disabled: !has_workspace,
                        onclick: move |_| commands.refresh_workspace.call(()),
                        span { class: "mn-button-icon refresh", "aria-hidden": "true" }
                        span { "Refresh" }
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
                title: "Resize sidebar",
                "aria-label": "Resize sidebar",
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
        }
    }
}

fn sidebar_width_from_drag(drag: SidebarResizeDrag, current_x: f64) -> u32 {
    clamp_sidebar_width(drag.start_width as f64 + current_x - drag.start_x)
}

fn clamp_sidebar_width(width: f64) -> u32 {
    width
        .round()
        .clamp(SIDEBAR_MIN_WIDTH as f64, SIDEBAR_MAX_WIDTH as f64) as u32
}

fn sidebar_workspace_path_text(path: Option<&Path>) -> String {
    path.map(|path| path.display().to_string())
        .unwrap_or_else(|| "Open a folder to start".to_string())
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
            sidebar_workspace_path_text(Some(Path::new("workspace"))),
            "workspace"
        );
        assert_eq!(sidebar_workspace_path_text(None), "Open a folder to start");
    }
}
