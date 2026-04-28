pub mod file_tree;

use crate::commands::FileTarget;
use crate::context::use_app_context;
use crate::perf::{perf_timer, trace_sidebar_resize};
use dioxus::prelude::*;
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
pub fn Sidebar() -> Element {
    let app = use_app_context();
    let file_state = app.file_state;
    let ui_state = app.ui_state;
    let pending_delete_path = app.pending_delete_path;
    let commands = app.commands;
    let settings_model = app.settings_model.read().clone();
    let resize_commands = commands.clone();

    let mut create_name = use_signal(String::new);
    let mut show_create = use_signal(|| false);
    let mut tree_sort = use_signal(FileTreeSortMode::default);
    let mut resize_drag = use_signal(|| None::<SidebarResizeDrag>);
    let mut resize_preview_width = use_signal(|| None::<u32>);

    let workspace = file_state.read().current_workspace.clone();
    let configured_sidebar_width = settings_model.sidebar_width;
    let sidebar_width = resize_preview_width().unwrap_or(configured_sidebar_width);
    let sidebar_class = if resize_drag().is_some() {
        "mn-sidebar resizing"
    } else {
        "mn-sidebar"
    };
    let selected_node = file_state.read().selected_node();
    let has_selection = selected_node.is_some();
    let selected_is_dir = selected_node.as_ref().is_some_and(|node| {
        matches!(
            node.kind,
            papyro_core::models::FileNodeKind::Directory { .. }
        )
    });
    let selected_target = selected_node.as_ref().map(|node| FileTarget {
        path: node.path.clone(),
        name: node.name.clone(),
    });
    let selected_delete_pending = selected_node
        .as_ref()
        .is_some_and(|node| pending_delete_path.read().as_deref() == Some(node.path.as_path()));

    rsx! {
        aside {
            class: "{sidebar_class}",
            style: "width: {sidebar_width}px",

            // ── Header ──
            div { class: "mn-sidebar-header",
                div { class: "mn-sidebar-workspace",
                    div {
                        if let Some(ws) = &workspace {
                            p { class: "mn-sidebar-workspace-name", "{ws.name}" }
                            p { class: "mn-sidebar-workspace-path", "{ws.path.display()}" }
                        } else {
                            p { class: "mn-sidebar-workspace-name", "No workspace" }
                            p { class: "mn-sidebar-workspace-path", "Open a folder to start" }
                        }
                    }
                }
                div { class: "mn-sidebar-actions",
                    button {
                        class: "mn-button",
                        title: "New note in current folder",
                        onclick: move |_| {
                            show_create.set(!show_create());
                        },
                        if show_create() { "Cancel" } else { "New" }
                    }
                    button {
                        class: "mn-button",
                        title: "Reload workspace",
                        onclick: move |_| commands.refresh_workspace.call(()),
                        "Refresh"
                    }
                    if workspace.is_none() {
                        button {
                            class: "mn-button primary",
                            onclick: move |_| commands.open_workspace.call(()),
                            "Open"
                        }
                    }
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

            // ── Context-sensitive ops for selected item ──
            if has_selection {
                div { class: "mn-sidebar-ops",
                    div { class: "mn-sidebar-ops-header",
                        if selected_is_dir {
                            span { "Folder" }
                        } else {
                            span { "Note" }
                        }
                        div { style: "display:flex;gap:4px",
                            if let Some(target) = selected_target.clone() {
                                button {
                                    class: "mn-button",
                                    title: "Show in Explorer",
                                    onclick: move |_| commands.reveal_in_explorer.call(target.clone()),
                                    "Reveal"
                                }
                            }
                            button {
                                class: "mn-button danger",
                                title: if selected_delete_pending { "Confirm delete" } else { "Delete selected" },
                                onclick: move |_| commands.delete_selected.call(()),
                                if selected_delete_pending { "Confirm" } else { "Delete" }
                            }
                        }
                    }

                    if selected_is_dir {
                        button {
                            class: "mn-button",
                            style: "width:100%; justify-content:center",
                            onclick: move |_| {
                                show_create.set(!show_create());
                            },
                            "New note here"
                        }
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
                        persist_sidebar_width(ui_state, resize_commands.clone(), width);
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

fn persist_sidebar_width(
    mut ui_state: Signal<papyro_core::UiState>,
    commands: crate::commands::AppCommands,
    width: u32,
) {
    let (settings, workspace_overrides) = {
        let mut state = ui_state.write();
        state.settings.sidebar_width = width;

        if state.workspace_overrides.sidebar_width.is_some() {
            state.workspace_overrides.sidebar_width = Some(width);
            (None, Some(state.workspace_overrides.clone()))
        } else {
            let mut settings = state.settings.clone();
            settings.sidebar_width = width;
            (Some(settings), None)
        }
    };

    if let Some(overrides) = workspace_overrides {
        commands.save_workspace_settings.call(overrides);
    } else if let Some(settings) = settings {
        commands.save_settings.call(settings);
    }
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
}
