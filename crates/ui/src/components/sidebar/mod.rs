pub mod file_tree;

use crate::commands::FileTarget;
use crate::context::use_app_context;
use dioxus::prelude::*;

pub use file_tree::{FileTree, FileTreeSortMode};

#[component]
pub fn Sidebar() -> Element {
    let app = use_app_context();
    let file_state = app.file_state;
    let commands = app.commands;
    let workspace_model = app.view_model.read().workspace.clone();
    let settings_model = app.view_model.read().settings.clone();

    let mut create_name = use_signal(String::new);
    let mut show_create = use_signal(|| false);
    let mut tree_sort = use_signal(FileTreeSortMode::default);

    let workspace = file_state.read().current_workspace.clone();
    let sidebar_width = settings_model.sidebar_width;
    let selected_node = file_state.read().selected_node();
    let has_selection = workspace_model.has_selection;

    let selected_is_dir = workspace_model.selected_is_directory;
    let selected_target = selected_node.as_ref().map(|node| FileTarget {
        path: node.path.clone(),
        name: node.name.clone(),
    });
    let selected_delete_pending = workspace_model.selected_delete_pending;

    rsx! {
        aside {
            class: "mn-sidebar",
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
                        if show_create() { "✕ Cancel" } else { "+ New" }
                    }
                    button {
                        class: "mn-button",
                        title: "Reload workspace",
                        onclick: move |_| commands.refresh_workspace.call(()),
                        "⟳"
                    }
                    if workspace.is_none() {
                        button {
                            class: "mn-button primary",
                            onclick: move |_| commands.open_workspace.call(()),
                            "Open…"
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
                                    "↗"
                                }
                            }
                            button {
                                class: "mn-button danger",
                                title: if selected_delete_pending { "Confirm delete" } else { "Delete selected" },
                                onclick: move |_| commands.delete_selected.call(()),
                                if selected_delete_pending { "Confirm" } else { "✕" }
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

        }
    }
}
