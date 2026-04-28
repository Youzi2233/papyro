use dioxus::prelude::*;
use papyro_core::models::{FileNodeKind, Theme};

use crate::commands::FileTarget;
use crate::components::{
    editor::EditorPane,
    header::AppHeader,
    settings::SettingsModal,
    sidebar::{FileTree, FileTreeSortMode},
    status_bar::StatusBar,
};
use crate::context::use_app_context;
use crate::perf::{perf_timer, trace_chrome_open_modal};

#[component]
pub fn MobileLayout(status_message: Option<String>) -> Element {
    let app = use_app_context();
    let ui_state = app.ui_state;
    let file_state = app.file_state;
    let pending_delete_path = app.pending_delete_path;
    let commands = app.commands;
    let settings_model = app.settings_model.read().clone();
    let open_workspace_commands = commands.clone();
    let browser_toggle_commands = commands.clone();
    let mut show_settings = use_signal(|| false);
    let mut show_create = use_signal(|| false);
    let mut show_rename = use_signal(|| false);
    let mut create_name = use_signal(String::new);
    let mut rename_name = use_signal(String::new);
    let mut tree_sort = use_signal(FileTreeSortMode::default);

    let theme = settings_model.theme;
    let browser_visible = !settings_model.sidebar_collapsed;
    let workspace = file_state.read().current_workspace.clone();
    let selected_node = file_state.read().selected_node();
    let selected_is_dir = selected_node
        .as_ref()
        .is_some_and(|node| matches!(node.kind, FileNodeKind::Directory { .. }));
    let selected_target = selected_node.as_ref().map(|node| FileTarget {
        path: node.path.clone(),
        name: node.name.clone(),
    });
    let selected_delete_pending = selected_node
        .as_ref()
        .is_some_and(|node| pending_delete_path.read().as_deref() == Some(node.path.as_path()));

    use_effect(use_reactive((&theme,), move |(theme,)| {
        let script = match theme {
            Theme::Dark => "document.documentElement.setAttribute('data-theme','dark');",
            Theme::Light => "document.documentElement.setAttribute('data-theme','light');",
            Theme::System => "document.documentElement.removeAttribute('data-theme');",
        };
        document::eval(script);
    }));

    rsx! {
        div { class: "mn-shell mn-shell-mobile",
            AppHeader {
                on_settings: move |_| {
                    let started_at = perf_timer();
                    show_settings.set(true);
                    trace_chrome_open_modal("settings", "header", started_at);
                },
            }
            div { class: "mn-mobile-stack",
                div { class: "mn-mobile-toolbar",
                    button {
                        class: "mn-button primary",
                        onclick: move |_| {
                            commands.open_workspace.call(());
                            if settings_model.sidebar_collapsed {
                                crate::chrome::toggle_sidebar(
                                    ui_state,
                                    open_workspace_commands.clone(),
                                    "mobile_open_workspace",
                                );
                            }
                        },
                        if workspace.is_some() { "Switch workspace" } else { "Open workspace" }
                    }
                    if workspace.is_some() {
                        button {
                            class: "mn-button",
                            onclick: move |_| {
                                crate::chrome::toggle_sidebar(
                                    ui_state,
                                    browser_toggle_commands.clone(),
                                    "mobile_toolbar",
                                );
                            },
                            if browser_visible { "Hide browser" } else { "Browse files" }
                        }
                        button {
                            class: "mn-button",
                            onclick: move |_| commands.refresh_workspace.call(()),
                            "Refresh"
                        }
                    }
                    button {
                        class: "mn-button",
                        onclick: move |_| {
                            crate::chrome::toggle_theme(ui_state, commands.clone());
                        },
                        if theme == Theme::Dark { "Light theme" } else { "Dark theme" }
                    }
                    button {
                        class: "mn-button",
                        onclick: move |_| {
                            let started_at = perf_timer();
                            show_settings.set(true);
                            trace_chrome_open_modal("settings", "mobile_toolbar", started_at);
                        },
                        "Settings"
                    }
                }

                if browser_visible || workspace.is_none() {
                    section { class: "mn-mobile-browser",
                        div { class: "mn-mobile-browser-header",
                            div {
                                if let Some(workspace) = &workspace {
                                    p { class: "mn-mobile-browser-title", "{workspace.name}" }
                                    p { class: "mn-mobile-browser-path", "{workspace.path.display()}" }
                                } else {
                                    p { class: "mn-mobile-browser-title", "No workspace" }
                                    p { class: "mn-mobile-browser-path", "Open a folder to start editing" }
                                }
                            }
                            if workspace.is_some() {
                                div { class: "mn-mobile-inline-actions",
                                    button {
                                        class: "mn-button",
                                        onclick: move |_| {
                                            show_create.set(!show_create());
                                            show_rename.set(false);
                                        },
                                        if show_create() { "Cancel" } else { "New note" }
                                    }
                                    button {
                                        class: "mn-button",
                                        onclick: move |_| commands.create_folder.call("New Folder".to_string()),
                                        "New folder"
                                    }
                                }
                            }
                        }

                        if show_create() {
                            div { class: "mn-mobile-form",
                                input {
                                    class: "mn-input",
                                    placeholder: "Note name",
                                    value: "{create_name}",
                                    autofocus: true,
                                    oninput: move |e| create_name.set(e.value()),
                                    onkeydown: move |e| {
                                        if e.key() == Key::Enter {
                                            let name = create_name().trim().to_string();
                                            commands.create_note.call(if name.is_empty() { "Untitled".to_string() } else { name });
                                            create_name.set(String::new());
                                            show_create.set(false);
                                        }
                                    },
                                }
                                button {
                                    class: "mn-button primary",
                                    onclick: move |_| {
                                        let name = create_name().trim().to_string();
                                        commands.create_note.call(if name.is_empty() { "Untitled".to_string() } else { name });
                                        create_name.set(String::new());
                                        show_create.set(false);
                                    },
                                    "Create"
                                }
                            }
                        }

                        if let Some(selected_node) = &selected_node {
                            div { class: "mn-mobile-selection",
                                div { class: "mn-mobile-selection-copy",
                                    p { class: "mn-mobile-selection-title",
                                        if selected_is_dir { "Selected folder" } else { "Selected note" }
                                    }
                                    p { class: "mn-mobile-selection-name", "{selected_node.name}" }
                                }
                                div { class: "mn-mobile-inline-actions",
                                    button {
                                        class: "mn-button",
                                        onclick: move |_| {
                                            show_rename.set(!show_rename());
                                            rename_name.set(String::new());
                                        },
                                        "Rename"
                                    }
                                    button {
                                        class: "mn-button danger",
                                        title: if selected_delete_pending { "Confirm delete" } else { "Delete selected" },
                                        onclick: move |_| commands.delete_selected.call(()),
                                        if selected_delete_pending { "Confirm delete" } else { "Delete" }
                                    }
                                    if let Some(target) = selected_target.clone() {
                                        button {
                                            class: "mn-button",
                                            onclick: move |_| commands.reveal_in_explorer.call(target.clone()),
                                            "Reveal"
                                        }
                                    }
                                }
                                if show_rename() {
                                    div { class: "mn-mobile-form",
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
                                            class: "mn-button primary",
                                            onclick: move |_| {
                                                let name = rename_name().trim().to_string();
                                                if !name.is_empty() {
                                                    commands.rename_selected.call(name);
                                                }
                                                show_rename.set(false);
                                            },
                                            "Apply"
                                        }
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

                        FileTree { sort_mode: tree_sort() }
                    }
                }

                div { class: "mn-workbench mn-workbench-mobile",
                    EditorPane {}
                }
            }
            StatusBar { status_message }
            if *show_settings.read() {
                SettingsModal { on_close: move |_| show_settings.set(false) }
            }
        }
    }
}
