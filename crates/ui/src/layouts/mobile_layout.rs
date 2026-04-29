use dioxus::prelude::*;
use papyro_core::models::Theme;

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
use crate::theme::ThemeDomEffect;

#[component]
pub fn MobileLayout() -> Element {
    let app = use_app_context();
    let ui_state = app.ui_state;
    let commands = app.commands;
    let sidebar_model = app.sidebar_model.read().clone();
    let open_workspace_commands = commands.clone();
    let browser_toggle_commands = commands.clone();
    let mut show_settings = use_signal(|| false);
    let mut show_create = use_signal(|| false);
    let mut show_rename = use_signal(|| false);
    let mut create_name = use_signal(String::new);
    let mut rename_name = use_signal(String::new);
    let mut tree_sort = use_signal(FileTreeSortMode::default);

    let theme = (app.theme)();
    let sidebar_collapsed = (app.sidebar_collapsed)();
    let browser_visible = !sidebar_collapsed;
    let has_workspace = sidebar_model.name.is_some();
    let selected_is_dir = sidebar_model.selected_is_directory;
    let selected_delete_pending = sidebar_model.selected_delete_pending;
    let selected_target = sidebar_model.selected_path.clone().map(|path| FileTarget {
        path,
        name: sidebar_model.selected_name.clone().unwrap_or_default(),
    });

    rsx! {
        div { class: "mn-shell mn-shell-mobile",
            ThemeDomEffect {}
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
                            if sidebar_collapsed {
                                crate::chrome::toggle_sidebar(
                                    ui_state,
                                    open_workspace_commands.clone(),
                                    "mobile_open_workspace",
                                );
                            }
                        },
                        if has_workspace { "Switch workspace" } else { "Open workspace" }
                    }
                    if has_workspace {
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

                if browser_visible || !has_workspace {
                    section { class: "mn-mobile-browser",
                        div { class: "mn-mobile-browser-header",
                            div {
                                if let (Some(name), Some(path)) = (&sidebar_model.name, &sidebar_model.path) {
                                    p { class: "mn-mobile-browser-title", "{name}" }
                                    p { class: "mn-mobile-browser-path", "{path.display()}" }
                                } else {
                                    p { class: "mn-mobile-browser-title", "No workspace" }
                                    p { class: "mn-mobile-browser-path", "Open a folder to start editing" }
                                }
                            }
                            if has_workspace {
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

                        if let Some(selected_name) = &sidebar_model.selected_name {
                            div { class: "mn-mobile-selection",
                                div { class: "mn-mobile-selection-copy",
                                    p { class: "mn-mobile-selection-title",
                                        if selected_is_dir { "Selected folder" } else { "Selected note" }
                                    }
                                    p { class: "mn-mobile-selection-name", "{selected_name}" }
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
            StatusBar {}
            if *show_settings.read() {
                SettingsModal { on_close: move |_| show_settings.set(false) }
            }
        }
    }
}
