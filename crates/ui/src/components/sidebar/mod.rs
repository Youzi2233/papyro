pub mod file_tree;

use crate::commands::FileTarget;
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::FileNodeKind;

pub use file_tree::FileTree;

#[component]
pub fn Sidebar() -> Element {
    let app = use_app_context();
    let file_state = app.file_state;
    let ui_state = app.ui_state;
    let commands = app.commands;

    let mut create_name = use_signal(|| String::new());
    let mut rename_name = use_signal(String::new);
    let mut show_create = use_signal(|| false);
    let mut show_rename = use_signal(|| false);

    let workspace = file_state.read().current_workspace.clone();
    let sidebar_width = ui_state.read().settings.sidebar_width;
    let selected_node = file_state.read().selected_node();
    let has_selection = selected_node.is_some();

    let selected_is_dir = selected_node
        .as_ref()
        .map_or(false, |n| matches!(n.kind, FileNodeKind::Directory { .. }));
    let selected_target = selected_node.as_ref().map(|node| FileTarget {
        path: node.path.clone(),
        name: node.name.clone(),
    });

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
                            show_rename.set(false);
                        },
                        if show_create() { "✕ Cancel" } else { "+ New" }
                    }
                    button {
                        class: "mn-button",
                        title: "Reload workspace",
                        onclick: move |_| commands.refresh_workspace.call(()),
                        "⟳"
                    }
                    if !workspace.is_some() {
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

            // ── File tree ──
            FileTree {}

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
                                title: "Delete selected",
                                onclick: move |_| commands.delete_selected.call(()),
                                "✕"
                            }
                        }
                    }

                    // ── Inline rename ──
                    if show_rename() {
                        div { class: "mn-rename-row",
                            input {
                                class: "mn-input",
                                placeholder: "New name",
                                value: "{rename_name}",
                                autofocus: true,
                                oninput: move |e| rename_name.set(e.value()),
                                onkeydown: move |e| {
                                    if e.key() == Key::Enter {
                                        let name = rename_name().trim().to_string();
                                        if !name.is_empty() {
                                            commands.rename_selected.call(name);
                                        }
                                        show_rename.set(false);
                                    }
                                },
                            }
                            button {
                                class: "mn-button",
                                onclick: move |_| {
                                    let name = rename_name().trim().to_string();
                                    if !name.is_empty() {
                                        commands.rename_selected.call(name);
                                    }
                                    show_rename.set(false);
                                },
                                "OK"
                            }
                        }
                    } else {
                        button {
                            class: "mn-button",
                            style: "width:100%; justify-content:center",
                            onclick: move |_| {
                                show_rename.set(true);
                                rename_name.set(String::new());
                            },
                            "Rename…"
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
