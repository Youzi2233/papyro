use crate::commands::{AppCommands, OpenMarkdownTarget, RestoreTrashedNoteTarget};
use crate::components::primitives::{Modal, TextInput};
use crate::context::use_app_context;
use crate::perf::{perf_timer, trace_chrome_open_modal};
use dioxus::prelude::*;
use papyro_core::models::{SaveStatus, Theme, ViewMode};
use std::path::PathBuf;

const COMMAND_PALETTE_LIMIT: usize = 24;

pub(crate) struct CommandPaletteActionInput<'a> {
    pub has_workspace: bool,
    pub recent_workspaces: &'a [crate::view_model::WorkspaceListItem],
    pub recent_files: &'a [crate::view_model::RecentFileListItem],
    pub trashed_notes: &'a [crate::view_model::TrashedNoteListItem],
    pub has_active_tab: bool,
    pub active_save_status: SaveStatus,
    pub selected_note_name: Option<&'a str>,
    pub theme: Theme,
    pub view_mode: ViewMode,
    pub outline_visible: bool,
}

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
    OpenMarkdown(OpenMarkdownTarget),
    RefreshWorkspace,
    SaveActiveNote,
    ReloadConflictedActiveNote,
    OverwriteActiveNote,
    SaveConflictedActiveNoteAs,
    ToggleSidebar,
    ToggleOutline,
    ToggleTheme,
    OpenSettings,
    SetViewMode(ViewMode),
    SetSelectedFavorite(bool),
    RestoreTrashedNote(RestoreTrashedNoteTarget),
    EmptyTrash,
}

#[component]
pub fn CommandPaletteModal(on_close: EventHandler<()>, on_settings: EventHandler<()>) -> Element {
    let app = use_app_context();
    let commands = app.commands.clone();
    let workspace_model = app.workspace_model.read().clone();
    let editor_model = app.editor_model.read().clone();
    let theme = (app.theme)();
    let outline_visible = (app.outline_visible)();
    let mut query = use_signal(String::new);
    let mut active_index = use_signal(|| 0usize);

    let actions = command_palette_actions(CommandPaletteActionInput {
        has_workspace: workspace_model.name.is_some(),
        recent_workspaces: &workspace_model.recent_workspaces,
        recent_files: &workspace_model.recent_files,
        trashed_notes: &workspace_model.trashed_notes,
        has_active_tab: editor_model.has_active_tab,
        active_save_status: editor_model.active_save_status.clone(),
        selected_note_name: selected_note_name(&workspace_model),
        theme,
        view_mode: editor_model.view_mode,
        outline_visible,
    });
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
        Modal {
            label: "Command palette",
            class_name: "mn-modal mn-command-modal",
            on_close,
                div { class: "mn-command-search",
                    TextInput {
                        class_name: "mn-command-input",
                        autofocus: true,
                        placeholder: "Run command",
                        value: query_value,
                        on_input: move |value| {
                            query.set(value);
                            active_index.set(0);
                        },
                        on_keydown: move |event: KeyboardEvent| {
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

#[component]
fn CommandPaletteRow(
    action: CommandPaletteAction,
    is_active: bool,
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
        CommandPaletteActionKind::OpenMarkdown(target) => commands.open_markdown.call(target),
        CommandPaletteActionKind::RefreshWorkspace => commands.refresh_workspace.call(()),
        CommandPaletteActionKind::SaveActiveNote => commands.save_active_note.call(()),
        CommandPaletteActionKind::ReloadConflictedActiveNote => {
            commands.reload_conflicted_active_note.call(())
        }
        CommandPaletteActionKind::OverwriteActiveNote => commands.overwrite_active_note.call(()),
        CommandPaletteActionKind::SaveConflictedActiveNoteAs => {
            commands.save_conflicted_active_note_as.call(())
        }
        CommandPaletteActionKind::ToggleSidebar => {
            crate::chrome::toggle_sidebar(commands.clone(), "command_palette");
        }
        CommandPaletteActionKind::ToggleOutline => {
            commands.toggle_outline.call(());
        }
        CommandPaletteActionKind::ToggleTheme => {
            crate::chrome::toggle_theme(commands.clone());
        }
        CommandPaletteActionKind::OpenSettings => {
            let started_at = perf_timer();
            on_settings.call(());
            trace_chrome_open_modal("settings", "command_palette", started_at);
        }
        CommandPaletteActionKind::SetViewMode(mode) => {
            crate::chrome::set_view_mode(commands.clone(), mode, "command_palette");
        }
        CommandPaletteActionKind::SetSelectedFavorite(favorite) => {
            commands.set_selected_favorite.call(favorite);
        }
        CommandPaletteActionKind::RestoreTrashedNote(target) => {
            commands.restore_trashed_note.call(target);
        }
        CommandPaletteActionKind::EmptyTrash => {
            commands.empty_trash.call(());
        }
    }

    on_close.call(());
}

pub(crate) fn command_palette_actions(
    input: CommandPaletteActionInput<'_>,
) -> Vec<CommandPaletteAction> {
    let workspace_title = if input.has_workspace {
        "Switch workspace"
    } else {
        "Open workspace"
    };
    let next_theme = match input.theme {
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
            if input.outline_visible {
                "Hide outline"
            } else {
                "Show outline"
            },
            "Toggle the active note heading outline",
            "VIEW",
            CommandPaletteActionKind::ToggleOutline,
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

    for workspace in input
        .recent_workspaces
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

    for file in input.recent_files {
        actions.push(action(
            &format!("Open {}", file.title),
            &format!("{} / {}", file.workspace_name, file.relative_path.display()),
            "REC",
            CommandPaletteActionKind::OpenMarkdown(OpenMarkdownTarget {
                path: file.workspace_path.join(&file.relative_path),
            }),
        ));
    }

    if input.has_workspace {
        for trashed in input.trashed_notes {
            actions.push(action(
                &format!("Restore {}", trashed.title),
                &trashed.relative_path.display().to_string(),
                "TRASH",
                CommandPaletteActionKind::RestoreTrashedNote(RestoreTrashedNoteTarget {
                    note_id: trashed.note_id.clone(),
                }),
            ));
        }

        if !input.trashed_notes.is_empty() {
            actions.push(action(
                "Empty trash",
                &format!(
                    "Permanently delete {} trashed note(s)",
                    input.trashed_notes.len()
                ),
                "TRASH",
                CommandPaletteActionKind::EmptyTrash,
            ));
        }
    }

    if input.has_workspace {
        actions.push(action(
            "Refresh workspace",
            "Reload the file tree",
            "APP",
            CommandPaletteActionKind::RefreshWorkspace,
        ));
    }

    if input.has_active_tab {
        actions.push(action(
            "Save active note",
            "Write current note changes",
            "FILE",
            CommandPaletteActionKind::SaveActiveNote,
        ));
        if input.active_save_status == SaveStatus::Conflict {
            actions.push(action(
                "Reload conflicted note",
                "Discard editor content and load the disk version",
                "FILE",
                CommandPaletteActionKind::ReloadConflictedActiveNote,
            ));
            actions.push(action(
                "Overwrite conflicted note",
                "Replace the disk version with editor content",
                "FILE",
                CommandPaletteActionKind::OverwriteActiveNote,
            ));
            actions.push(action(
                "Save conflicted note as...",
                "Write editor content to another workspace Markdown file",
                "FILE",
                CommandPaletteActionKind::SaveConflictedActiveNoteAs,
            ));
        }
    }

    if let Some(name) = input.selected_note_name {
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
        if mode != input.view_mode {
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

    fn test_input() -> CommandPaletteActionInput<'static> {
        CommandPaletteActionInput {
            has_workspace: true,
            recent_workspaces: &[],
            recent_files: &[],
            trashed_notes: &[],
            has_active_tab: false,
            active_save_status: SaveStatus::Saved,
            selected_note_name: None,
            theme: Theme::Light,
            view_mode: ViewMode::Hybrid,
            outline_visible: false,
        }
    }

    #[test]
    fn command_palette_actions_reflect_workspace_and_tab_state() {
        let actions = command_palette_actions(CommandPaletteActionInput {
            has_active_tab: true,
            selected_note_name: Some("Draft.md"),
            theme: Theme::Dark,
            ..test_input()
        });
        let titles = actions
            .iter()
            .map(|action| action.title.as_str())
            .collect::<Vec<_>>();

        assert!(titles.contains(&"Switch workspace"));
        assert!(titles.contains(&"Refresh workspace"));
        assert!(titles.contains(&"Save active note"));
        assert!(titles.contains(&"Show outline"));
        assert!(titles.contains(&"Favorite selected note"));
        assert!(titles.contains(&"Unfavorite selected note"));
        assert!(titles.contains(&"Use source mode"));
        assert!(!titles.contains(&"Use hybrid mode"));
    }

    #[test]
    fn command_palette_actions_hide_file_commands_without_active_tab() {
        let actions = command_palette_actions(CommandPaletteActionInput {
            has_workspace: false,
            theme: Theme::System,
            view_mode: ViewMode::Preview,
            ..test_input()
        });
        let titles = actions
            .iter()
            .map(|action| action.title.as_str())
            .collect::<Vec<_>>();

        assert!(titles.contains(&"Open workspace"));
        assert!(!titles.contains(&"Refresh workspace"));
        assert!(!titles.contains(&"Save active note"));
        assert!(!titles.contains(&"Reload conflicted note"));
        assert!(!titles.contains(&"Overwrite conflicted note"));
        assert!(!titles.contains(&"Save conflicted note as..."));
    }

    #[test]
    fn command_palette_actions_include_conflict_resolution() {
        let actions = command_palette_actions(CommandPaletteActionInput {
            has_active_tab: true,
            active_save_status: SaveStatus::Conflict,
            ..test_input()
        });

        assert!(actions.iter().any(|action| {
            action.title == "Reload conflicted note"
                && action.detail == "Discard editor content and load the disk version"
                && action.group == "FILE"
                && matches!(
                    action.kind,
                    CommandPaletteActionKind::ReloadConflictedActiveNote
                )
        }));
        assert!(actions.iter().any(|action| {
            action.title == "Overwrite conflicted note"
                && action.detail == "Replace the disk version with editor content"
                && action.group == "FILE"
                && matches!(action.kind, CommandPaletteActionKind::OverwriteActiveNote)
        }));
        assert!(actions.iter().any(|action| {
            action.title == "Save conflicted note as..."
                && action.detail == "Write editor content to another workspace Markdown file"
                && action.group == "FILE"
                && matches!(
                    action.kind,
                    CommandPaletteActionKind::SaveConflictedActiveNoteAs
                )
        }));
    }

    #[test]
    fn command_palette_actions_toggle_outline_label() {
        let actions = command_palette_actions(CommandPaletteActionInput {
            outline_visible: true,
            ..test_input()
        });
        let titles = actions
            .iter()
            .map(|action| action.title.as_str())
            .collect::<Vec<_>>();

        assert!(titles.contains(&"Hide outline"));
        assert!(!titles.contains(&"Show outline"));
        assert!(actions
            .iter()
            .any(|action| matches!(action.kind, CommandPaletteActionKind::ToggleOutline)));
    }

    #[test]
    fn command_palette_filter_matches_title_detail_and_group() {
        let actions = command_palette_actions(CommandPaletteActionInput {
            has_active_tab: true,
            view_mode: ViewMode::Source,
            ..test_input()
        });

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
        let recent_workspaces = [
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
        ];
        let actions = command_palette_actions(CommandPaletteActionInput {
            recent_workspaces: &recent_workspaces,
            ..test_input()
        });

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
        let recent_files = [crate::view_model::RecentFileListItem {
            title: "Meeting".to_string(),
            relative_path: PathBuf::from("notes/meeting.md"),
            workspace_name: "Work".to_string(),
            workspace_path: PathBuf::from("work"),
        }];
        let actions = command_palette_actions(CommandPaletteActionInput {
            recent_files: &recent_files,
            ..test_input()
        });

        assert!(actions.iter().any(|action| {
            action.title == "Open Meeting"
                && action.detail == "Work / notes/meeting.md"
                && action.group == "REC"
                && matches!(
                    &action.kind,
                    CommandPaletteActionKind::OpenMarkdown(target)
                        if target.path == std::path::Path::new("work/notes/meeting.md")
                )
        }));
    }

    #[test]
    fn command_palette_actions_include_trashed_notes() {
        let trashed_notes = [crate::view_model::TrashedNoteListItem {
            note_id: "note-a".to_string(),
            title: "Deleted draft".to_string(),
            relative_path: PathBuf::from("notes/deleted.md"),
            trashed_at: 1,
        }];
        let actions = command_palette_actions(CommandPaletteActionInput {
            trashed_notes: &trashed_notes,
            ..test_input()
        });

        assert!(actions.iter().any(|action| {
            action.title == "Restore Deleted draft"
                && action.detail == "notes/deleted.md"
                && action.group == "TRASH"
                && matches!(
                    &action.kind,
                    CommandPaletteActionKind::RestoreTrashedNote(target)
                        if target.note_id == "note-a"
                )
        }));
        assert!(actions.iter().any(|action| {
            action.title == "Empty trash"
                && action.detail == "Permanently delete 1 trashed note(s)"
                && action.group == "TRASH"
                && matches!(action.kind, CommandPaletteActionKind::EmptyTrash)
        }));
    }

    #[test]
    fn command_palette_actions_include_selected_note_favorites() {
        let actions = command_palette_actions(CommandPaletteActionInput {
            selected_note_name: Some("Draft.md"),
            ..test_input()
        });

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
