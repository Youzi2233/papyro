use crate::commands::{AppCommands, RecentFileTarget};
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::{Theme, ViewMode};
use papyro_core::UiState;
use std::path::PathBuf;

const COMMAND_PALETTE_LIMIT: usize = 24;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CommandPaletteAction {
    pub title: String,
    pub detail: String,
    pub group: String,
    pub kind: CommandPaletteActionKind,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum CommandPaletteActionKind {
    OpenWorkspace,
    OpenWorkspacePath(PathBuf),
    OpenRecentFile(RecentFileTarget),
    RefreshWorkspace,
    SaveActiveNote,
    ExportHtml,
    ToggleSidebar,
    ToggleTheme,
    OpenSettings,
    SetViewMode(ViewMode),
    SetSelectedFavorite(bool),
}

#[component]
pub fn CommandPaletteModal(on_close: EventHandler<()>, on_settings: EventHandler<()>) -> Element {
    let app = use_app_context();
    let ui_state = app.ui_state;
    let commands = app.commands.clone();
    let view_model = app.view_model.read().clone();
    let mut query = use_signal(String::new);
    let mut active_index = use_signal(|| 0usize);

    let actions = command_palette_actions(
        view_model.workspace.name.is_some(),
        &view_model.workspace.recent_workspaces,
        &view_model.workspace.recent_files,
        view_model.editor.has_active_tab,
        selected_note_name(&view_model.workspace),
        view_model.settings.theme,
        view_model.editor.view_mode,
    );
    let query_value = query();
    let filtered = filter_command_palette_actions(&actions, &query_value);
    let active = if filtered.is_empty() {
        0
    } else {
        active_index().min(filtered.len() - 1)
    };
    let filtered_for_keys = filtered.clone();
    let commands_for_keys = commands.clone();

    rsx! {
        div { class: "mn-modal-overlay", onclick: move |_| on_close.call(()),
            div { class: "mn-modal mn-command-modal", onclick: move |event| event.stop_propagation(),
                div { class: "mn-command-search",
                    input {
                        class: "mn-command-input",
                        autofocus: true,
                        placeholder: "Run command",
                        value: "{query_value}",
                        oninput: move |event| {
                            query.set(event.value());
                            active_index.set(0);
                        },
                        onkeydown: move |event| {
                            match event.key() {
                                Key::Escape => {
                                    event.prevent_default();
                                    on_close.call(());
                                }
                                Key::ArrowDown => {
                                    event.prevent_default();
                                    if !filtered_for_keys.is_empty() {
                                        active_index.set((active_index() + 1).min(filtered_for_keys.len() - 1));
                                    }
                                }
                                Key::ArrowUp => {
                                    event.prevent_default();
                                    active_index.set(active_index().saturating_sub(1));
                                }
                                Key::Enter => {
                                    event.prevent_default();
                                    if let Some(action) = filtered_for_keys.get(active).cloned() {
                                        execute_command_action(
                                            ui_state,
                                            commands_for_keys.clone(),
                                            on_settings,
                                            on_close,
                                            action.kind,
                                        );
                                    }
                                }
                                _ => {}
                            }
                        },
                    }
                }
                div { class: "mn-command-list",
                    if filtered.is_empty() {
                        div { class: "mn-command-empty", "No matching commands" }
                    } else {
                        for index in 0..filtered.len().min(COMMAND_PALETTE_LIMIT) {
                            CommandPaletteRow {
                                action: filtered[index].clone(),
                                is_active: index == active,
                                ui_state,
                                commands: commands.clone(),
                                on_settings,
                                on_close,
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn CommandPaletteRow(
    action: CommandPaletteAction,
    is_active: bool,
    ui_state: Signal<UiState>,
    commands: AppCommands,
    on_settings: EventHandler<()>,
    on_close: EventHandler<()>,
) -> Element {
    let kind = action.kind.clone();

    rsx! {
        button {
            class: if is_active { "mn-command-row active" } else { "mn-command-row" },
            onclick: move |_| {
                execute_command_action(
                    ui_state,
                    commands.clone(),
                    on_settings,
                    on_close,
                    kind.clone(),
                );
            },
            span { class: "mn-command-row-main",
                span { class: "mn-command-title", "{action.title}" }
                span { class: "mn-command-path", "{action.detail}" }
            }
            span { class: "mn-command-kind", "{action.group}" }
        }
    }
}

fn execute_command_action(
    mut ui_state: Signal<UiState>,
    commands: AppCommands,
    on_settings: EventHandler<()>,
    on_close: EventHandler<()>,
    kind: CommandPaletteActionKind,
) {
    match kind {
        CommandPaletteActionKind::OpenWorkspace => commands.open_workspace.call(()),
        CommandPaletteActionKind::OpenWorkspacePath(path) => {
            commands.open_workspace_path.call(path)
        }
        CommandPaletteActionKind::OpenRecentFile(target) => commands.open_recent_file.call(target),
        CommandPaletteActionKind::RefreshWorkspace => commands.refresh_workspace.call(()),
        CommandPaletteActionKind::SaveActiveNote => commands.save_active_note.call(()),
        CommandPaletteActionKind::ExportHtml => commands.export_html.call(()),
        CommandPaletteActionKind::ToggleSidebar => {
            ui_state.write().toggle_sidebar();
            let settings = ui_state.read().settings.clone();
            commands.save_settings.call(settings);
        }
        CommandPaletteActionKind::ToggleTheme => {
            let mut settings = ui_state.read().settings.clone();
            settings.theme = match ui_state.read().theme() {
                Theme::Light | Theme::System => Theme::Dark,
                Theme::Dark => Theme::Light,
            };
            commands.save_settings.call(settings);
        }
        CommandPaletteActionKind::OpenSettings => on_settings.call(()),
        CommandPaletteActionKind::SetViewMode(mode) => {
            let mut settings = ui_state.read().settings.clone();
            settings.view_mode = mode;
            commands.save_settings.call(settings);
        }
        CommandPaletteActionKind::SetSelectedFavorite(favorite) => {
            commands.set_selected_favorite.call(favorite);
        }
    }

    on_close.call(());
}

pub(crate) fn command_palette_actions(
    has_workspace: bool,
    recent_workspaces: &[crate::view_model::WorkspaceListItem],
    recent_files: &[crate::view_model::RecentFileListItem],
    has_active_tab: bool,
    selected_note_name: Option<&str>,
    theme: Theme,
    view_mode: ViewMode,
) -> Vec<CommandPaletteAction> {
    let workspace_title = if has_workspace {
        "Switch workspace"
    } else {
        "Open workspace"
    };
    let next_theme = match theme {
        Theme::Dark => "Light",
        Theme::Light | Theme::System => "Dark",
    };

    let mut actions = vec![
        action(
            workspace_title,
            "Choose a workspace folder",
            "APP",
            CommandPaletteActionKind::OpenWorkspace,
        ),
        action(
            "Toggle sidebar",
            "Show or hide the workspace browser",
            "VIEW",
            CommandPaletteActionKind::ToggleSidebar,
        ),
        action(
            "Toggle theme",
            &format!("Switch to {next_theme}"),
            "VIEW",
            CommandPaletteActionKind::ToggleTheme,
        ),
        action(
            "Open settings",
            "Edit app preferences",
            "APP",
            CommandPaletteActionKind::OpenSettings,
        ),
    ];

    for workspace in recent_workspaces
        .iter()
        .filter(|workspace| !workspace.is_current)
    {
        actions.push(action(
            &format!("Open {}", workspace.name),
            &workspace.path.display().to_string(),
            "WS",
            CommandPaletteActionKind::OpenWorkspacePath(workspace.path.clone()),
        ));
    }

    for file in recent_files {
        actions.push(action(
            &format!("Open {}", file.title),
            &format!("{} / {}", file.workspace_name, file.relative_path.display()),
            "REC",
            CommandPaletteActionKind::OpenRecentFile(RecentFileTarget {
                workspace_path: file.workspace_path.clone(),
                relative_path: file.relative_path.clone(),
            }),
        ));
    }

    if has_workspace {
        actions.push(action(
            "Refresh workspace",
            "Reload the file tree",
            "APP",
            CommandPaletteActionKind::RefreshWorkspace,
        ));
    }

    if has_active_tab {
        actions.push(action(
            "Save active note",
            "Write current note changes",
            "FILE",
            CommandPaletteActionKind::SaveActiveNote,
        ));
        actions.push(action(
            "Export HTML",
            "Export the active note",
            "FILE",
            CommandPaletteActionKind::ExportHtml,
        ));
    }

    if let Some(name) = selected_note_name {
        actions.push(action(
            "Favorite selected note",
            name,
            "FILE",
            CommandPaletteActionKind::SetSelectedFavorite(true),
        ));
        actions.push(action(
            "Unfavorite selected note",
            name,
            "FILE",
            CommandPaletteActionKind::SetSelectedFavorite(false),
        ));
    }

    for (mode, title) in [
        (ViewMode::Hybrid, "Use hybrid mode"),
        (ViewMode::Source, "Use source mode"),
        (ViewMode::Preview, "Use preview mode"),
    ] {
        if mode != view_mode {
            actions.push(action(
                title,
                "Change editor rendering mode",
                "VIEW",
                CommandPaletteActionKind::SetViewMode(mode),
            ));
        }
    }

    actions
}

fn action(
    title: &str,
    detail: &str,
    group: &str,
    kind: CommandPaletteActionKind,
) -> CommandPaletteAction {
    CommandPaletteAction {
        title: title.to_string(),
        detail: detail.to_string(),
        group: group.to_string(),
        kind,
    }
}

fn selected_note_name(workspace: &crate::view_model::WorkspaceViewModel) -> Option<&str> {
    if workspace.has_selection && !workspace.selected_is_directory {
        workspace.selected_name.as_deref()
    } else {
        None
    }
}

pub(crate) fn filter_command_palette_actions(
    actions: &[CommandPaletteAction],
    query: &str,
) -> Vec<CommandPaletteAction> {
    let tokens = query
        .split_whitespace()
        .map(str::to_lowercase)
        .collect::<Vec<_>>();

    actions
        .iter()
        .filter(|action| {
            if tokens.is_empty() {
                return true;
            }

            let haystack =
                format!("{} {} {}", action.title, action.detail, action.group).to_lowercase();
            tokens.iter().all(|token| haystack.contains(token))
        })
        .take(COMMAND_PALETTE_LIMIT)
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_palette_actions_reflect_workspace_and_tab_state() {
        let actions = command_palette_actions(
            true,
            &[],
            &[],
            true,
            Some("Draft.md"),
            Theme::Dark,
            ViewMode::Hybrid,
        );
        let titles = actions
            .iter()
            .map(|action| action.title.as_str())
            .collect::<Vec<_>>();

        assert!(titles.contains(&"Switch workspace"));
        assert!(titles.contains(&"Refresh workspace"));
        assert!(titles.contains(&"Save active note"));
        assert!(titles.contains(&"Export HTML"));
        assert!(titles.contains(&"Favorite selected note"));
        assert!(titles.contains(&"Unfavorite selected note"));
        assert!(titles.contains(&"Use source mode"));
        assert!(!titles.contains(&"Use hybrid mode"));
    }

    #[test]
    fn command_palette_actions_hide_file_commands_without_active_tab() {
        let actions = command_palette_actions(
            false,
            &[],
            &[],
            false,
            None,
            Theme::System,
            ViewMode::Preview,
        );
        let titles = actions
            .iter()
            .map(|action| action.title.as_str())
            .collect::<Vec<_>>();

        assert!(titles.contains(&"Open workspace"));
        assert!(!titles.contains(&"Refresh workspace"));
        assert!(!titles.contains(&"Save active note"));
        assert!(!titles.contains(&"Export HTML"));
    }

    #[test]
    fn command_palette_filter_matches_title_detail_and_group() {
        let actions =
            command_palette_actions(true, &[], &[], true, None, Theme::Light, ViewMode::Source);

        assert_eq!(
            filter_command_palette_actions(&actions, "file save")
                .iter()
                .map(|action| action.title.as_str())
                .collect::<Vec<_>>(),
            vec!["Save active note"]
        );
        assert_eq!(
            filter_command_palette_actions(&actions, "render preview")
                .iter()
                .map(|action| action.title.as_str())
                .collect::<Vec<_>>(),
            vec!["Use preview mode"]
        );
    }

    #[test]
    fn command_palette_actions_include_recent_workspaces() {
        let actions = command_palette_actions(
            true,
            &[
                crate::view_model::WorkspaceListItem {
                    name: "Current".to_string(),
                    path: PathBuf::from("current"),
                    is_current: true,
                },
                crate::view_model::WorkspaceListItem {
                    name: "Archive".to_string(),
                    path: PathBuf::from("archive"),
                    is_current: false,
                },
            ],
            &[],
            false,
            None,
            Theme::Light,
            ViewMode::Hybrid,
        );

        assert!(actions.iter().any(|action| {
            action.title == "Open Archive"
                && action.group == "WS"
                && matches!(
                    &action.kind,
                    CommandPaletteActionKind::OpenWorkspacePath(path) if path == &PathBuf::from("archive")
                )
        }));
        assert!(!actions.iter().any(|action| action.title == "Open Current"));
    }

    #[test]
    fn command_palette_actions_include_recent_files() {
        let actions = command_palette_actions(
            true,
            &[],
            &[crate::view_model::RecentFileListItem {
                title: "Meeting".to_string(),
                relative_path: PathBuf::from("notes/meeting.md"),
                workspace_name: "Work".to_string(),
                workspace_path: PathBuf::from("work"),
            }],
            false,
            None,
            Theme::Light,
            ViewMode::Hybrid,
        );

        assert!(actions.iter().any(|action| {
            action.title == "Open Meeting"
                && action.detail == "Work / notes/meeting.md"
                && action.group == "REC"
                && matches!(
                    &action.kind,
                    CommandPaletteActionKind::OpenRecentFile(target)
                        if target.workspace_path == std::path::Path::new("work")
                            && target.relative_path == std::path::Path::new("notes/meeting.md")
                )
        }));
    }

    #[test]
    fn command_palette_actions_include_selected_note_favorites() {
        let actions = command_palette_actions(
            true,
            &[],
            &[],
            false,
            Some("Draft.md"),
            Theme::Light,
            ViewMode::Hybrid,
        );

        assert!(actions.iter().any(|action| {
            action.title == "Favorite selected note"
                && action.detail == "Draft.md"
                && matches!(
                    action.kind,
                    CommandPaletteActionKind::SetSelectedFavorite(true)
                )
        }));
        assert!(actions.iter().any(|action| {
            action.title == "Unfavorite selected note"
                && action.detail == "Draft.md"
                && matches!(
                    action.kind,
                    CommandPaletteActionKind::SetSelectedFavorite(false)
                )
        }));
    }
}
