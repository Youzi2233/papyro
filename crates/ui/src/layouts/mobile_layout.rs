use dioxus::prelude::*;

use crate::action_labels::{delete_action_label, delete_action_title};
use crate::commands::FileTarget;
use crate::components::{
    command_palette::CommandPaletteModal,
    editor::EditorPane,
    header::AppHeader,
    primitives::{
        ActionButton, AppShell, Button, ButtonState, ButtonVariant, TextInput, Workbench,
    },
    quick_open::QuickOpenModal,
    settings::SettingsModal,
    sidebar::{FileTree, FileTreeSortMode},
    status_bar::StatusBar,
    trash::TrashModal,
};
use crate::context::use_app_context;
use crate::i18n::use_i18n;
use crate::perf::{perf_timer, trace_chrome_open_modal};
use crate::theme::ThemeDomEffect;

#[component]
pub fn MobileLayout() -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands;
    let sidebar_model = app.sidebar_model.read().clone();
    let open_workspace_commands = commands.clone();
    let browser_toggle_commands = commands.clone();
    let refresh_commands = commands.clone();
    let theme_commands = commands.clone();
    let create_folder_commands = commands.clone();
    let reveal_commands = commands.clone();
    let mut show_settings = use_signal(|| false);
    let mut show_quick_open = use_signal(|| false);
    let mut show_command_palette = use_signal(|| false);
    let mut show_trash = use_signal(|| false);
    let mut show_create = use_signal(|| false);
    let mut show_rename = use_signal(|| false);
    let mut create_name = use_signal(String::new);
    let mut rename_name = use_signal(String::new);

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
        AppShell { class_name: "mn-shell-mobile".to_string(),
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
                    Button {
                        label: if has_workspace {
                            i18n.text("Switch workspace", "切换工作区").to_string()
                        } else {
                            i18n.text("Open workspace", "打开工作区").to_string()
                        },
                        variant: ButtonVariant::Primary,
                        disabled: false,
                        on_click: move |_| {
                            commands.open_workspace.call(());
                            if sidebar_collapsed {
                                crate::chrome::toggle_sidebar(
                                    open_workspace_commands.clone(),
                                    "mobile_open_workspace",
                                );
                            }
                        },
                    }
                    if has_workspace {
                        Button {
                            label: if browser_visible {
                                i18n.text("Hide browser", "隐藏文件栏").to_string()
                            } else {
                                i18n.text("Browse files", "浏览文件").to_string()
                            },
                            variant: ButtonVariant::Default,
                            disabled: false,
                            on_click: move |_| {
                                crate::chrome::toggle_sidebar(
                                    browser_toggle_commands.clone(),
                                    "mobile_toolbar",
                                );
                            },
                        }
                        Button {
                            label: i18n.text("Refresh", "刷新").to_string(),
                            variant: ButtonVariant::Default,
                            disabled: false,
                            on_click: move |_| refresh_commands.refresh_workspace.call(()),
                        }
                    }
                    Button {
                        label: if theme.is_dark() {
                            i18n.text("Light theme", "浅色主题").to_string()
                        } else {
                            i18n.text("Dark theme", "深色主题").to_string()
                        },
                        variant: ButtonVariant::Default,
                        disabled: false,
                        on_click: move |_| {
                            crate::chrome::toggle_theme(theme_commands.clone());
                        },
                    }
                    Button {
                        label: i18n.text("Settings", "设置").to_string(),
                        variant: ButtonVariant::Default,
                        disabled: false,
                        on_click: move |_| {
                            let started_at = perf_timer();
                            show_settings.set(true);
                            trace_chrome_open_modal("settings", "mobile_toolbar", started_at);
                        },
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
                                    p { class: "mn-mobile-browser-title", {i18n.text("No workspace", "未打开工作区")} }
                                    p { class: "mn-mobile-browser-path", {i18n.text("Open a folder to start editing", "打开目录即可开始编辑")} }
                                }
                            }
                            if has_workspace {
                                div { class: "mn-mobile-inline-actions",
                                    Button {
                                        label: if show_create() {
                                            i18n.text("Cancel", "取消").to_string()
                                        } else {
                                            i18n.text("New note", "新建笔记").to_string()
                                        },
                                        variant: ButtonVariant::Default,
                                        disabled: false,
                                        on_click: move |_| {
                                            show_create.set(!show_create());
                                            show_rename.set(false);
                                        },
                                    }
                                    Button {
                                        label: i18n.text("New folder", "新建文件夹").to_string(),
                                        variant: ButtonVariant::Default,
                                        disabled: false,
                                        on_click: move |_| create_folder_commands.create_folder.call("New Folder".to_string()),
                                    }
                                }
                            }
                        }

                        if show_create() {
                            div { class: "mn-mobile-form",
                                TextInput {
                                    class_name: "mn-input".to_string(),
                                    placeholder: i18n.text("Note name", "笔记名称").to_string(),
                                    value: create_name(),
                                    autofocus: true,
                                    on_input: move |value| create_name.set(value),
                                    on_keydown: move |e: KeyboardEvent| {
                                        if e.key() == Key::Enter {
                                            let name = create_name().trim().to_string();
                                            commands.create_note.call(if name.is_empty() { "Untitled".to_string() } else { name });
                                            create_name.set(String::new());
                                            show_create.set(false);
                                        }
                                    },
                                }
                                Button {
                                    label: i18n.text("Create", "创建").to_string(),
                                    variant: ButtonVariant::Primary,
                                    disabled: false,
                                    on_click: move |_| {
                                        let name = create_name().trim().to_string();
                                        commands.create_note.call(if name.is_empty() { "Untitled".to_string() } else { name });
                                        create_name.set(String::new());
                                        show_create.set(false);
                                    },
                                }
                            }
                        }

                        if let Some(selected_name) = &sidebar_model.selected_name {
                            div { class: "mn-mobile-selection",
                                div { class: "mn-mobile-selection-copy",
                                    p { class: "mn-mobile-selection-title",
                                        if selected_is_dir {
                                            {i18n.text("Selected folder", "已选文件夹")}
                                        } else {
                                            {i18n.text("Selected note", "已选笔记")}
                                        }
                                    }
                                    p { class: "mn-mobile-selection-name", "{selected_name}" }
                                }
                                div { class: "mn-mobile-inline-actions",
                                    Button {
                                        label: i18n.text("Rename", "重命名").to_string(),
                                        variant: ButtonVariant::Default,
                                        disabled: false,
                                        on_click: move |_| {
                                            show_rename.set(!show_rename());
                                            rename_name.set(String::new());
                                        },
                                    }
                                    ActionButton {
                                        label: delete_action_label(i18n.language(), selected_delete_pending).to_string(),
                                        variant: ButtonVariant::Danger,
                                        state: ButtonState::Enabled,
                                        icon_class: None,
                                        title: Some(delete_action_title(i18n.language(), selected_delete_pending).to_string()),
                                        class_name: String::new(),
                                        on_click: move |_| commands.delete_selected.call(()),
                                    }
                                    if let Some(target) = selected_target.clone() {
                                        Button {
                                            label: i18n.text("Reveal", "定位").to_string(),
                                            variant: ButtonVariant::Default,
                                            disabled: false,
                                            on_click: move |_| reveal_commands.reveal_in_explorer.call(target.clone()),
                                        }
                                    }
                                }
                                if show_rename() {
                                    div { class: "mn-mobile-form",
                                        TextInput {
                                            class_name: "mn-input".to_string(),
                                            placeholder: i18n.text("New name", "新名称").to_string(),
                                            value: rename_name(),
                                            autofocus: true,
                                            on_input: move |value| rename_name.set(value),
                                            on_keydown: move |e: KeyboardEvent| {
                                                if e.key() == Key::Enter {
                                                    let name = rename_name().trim().to_string();
                                                    if !name.is_empty() {
                                                        commands.rename_selected.call(name);
                                                    }
                                                    show_rename.set(false);
                                                }
                                            },
                                        }
                                        Button {
                                            label: i18n.text("Apply", "应用").to_string(),
                                            variant: ButtonVariant::Primary,
                                            disabled: false,
                                            on_click: move |_| {
                                                let name = rename_name().trim().to_string();
                                                if !name.is_empty() {
                                                    commands.rename_selected.call(name);
                                                }
                                                show_rename.set(false);
                                            },
                                        }
                                    }
                                }
                            }
                        }

                        FileTree { sort_mode: FileTreeSortMode::Name }
                    }
                }

                Workbench { class_name: "mn-workbench-mobile".to_string(),
                    EditorPane {
                        on_settings: move |_| {
                            let started_at = perf_timer();
                            show_settings.set(true);
                            trace_chrome_open_modal("settings", "mobile_editor", started_at);
                        },
                        on_quick_open: move |_| {
                            let started_at = perf_timer();
                            show_quick_open.set(true);
                            trace_chrome_open_modal("quick_open", "mobile_editor", started_at);
                        },
                        on_command_palette: move |_| {
                            let started_at = perf_timer();
                            show_command_palette.set(true);
                            trace_chrome_open_modal("command_palette", "mobile_editor", started_at);
                        },
                    }
                }
            }
            StatusBar {}
            if *show_settings.read() {
                SettingsModal { on_close: move |_| show_settings.set(false) }
            }
            if *show_quick_open.read() {
                QuickOpenModal { on_close: move |_| show_quick_open.set(false) }
            }
            if *show_command_palette.read() {
                CommandPaletteModal {
                    on_close: move |_| show_command_palette.set(false),
                    on_settings: move |_| show_settings.set(true),
                    on_trash: move |_| show_trash.set(true),
                }
            }
            if *show_trash.read() {
                TrashModal { on_close: move |_| show_trash.set(false) }
            }
        }
    }
}
