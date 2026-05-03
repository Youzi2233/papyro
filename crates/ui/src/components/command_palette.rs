use crate::commands::{AppCommands, InsertMarkdownRequest, OpenMarkdownTarget};
use crate::components::primitives::{
    InlineAlert, InlineAlertTone, Modal, ResultList, ResultRow, ResultRowKind, TextInput,
};
use crate::context::use_app_context;
use crate::i18n::{i18n_for, use_i18n};
use crate::perf::{perf_timer, trace_chrome_open_modal};
use dioxus::prelude::*;
use papyro_core::models::{AppLanguage, SaveStatus, Theme, ViewMode};
use papyro_core::next_theme;
use std::path::PathBuf;

const COMMAND_PALETTE_LIMIT: usize = 24;

pub(crate) struct CommandPaletteActionInput<'a> {
    pub language: AppLanguage,
    pub has_workspace: bool,
    pub recent_workspaces: &'a [crate::view_model::WorkspaceListItem],
    pub recent_files: &'a [crate::view_model::RecentFileListItem],
    pub trashed_notes: &'a [crate::view_model::TrashedNoteListItem],
    pub active_tab_id: Option<&'a str>,
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
    CloseActiveTab(String),
    ToggleSidebar,
    ToggleOutline,
    ToggleTheme,
    OpenSettings,
    OpenTrash,
    SetViewMode(ViewMode),
    SetSelectedFavorite(bool),
    InsertMarkdown(InsertMarkdownRequest),
}

#[component]
pub fn CommandPaletteModal(
    on_close: EventHandler<()>,
    on_settings: EventHandler<()>,
    on_trash: EventHandler<()>,
) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands.clone();
    let workspace_model = app.workspace_model.read().clone();
    let editor_model = app.editor_model.read().clone();
    let theme = (app.theme)();
    let outline_visible = (app.outline_visible)();
    let mut query = use_signal(String::new);
    let mut active_index = use_signal(|| 0usize);

    let actions = command_palette_actions(CommandPaletteActionInput {
        language: i18n.language(),
        has_workspace: workspace_model.name.is_some(),
        recent_workspaces: &workspace_model.recent_workspaces,
        recent_files: &workspace_model.recent_files,
        trashed_notes: &workspace_model.trashed_notes,
        active_tab_id: editor_model.active_tab_id.as_deref(),
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
            label: i18n.text("Command palette", "命令面板").to_string(),
            class_name: "mn-modal mn-command-modal".to_string(),
            on_close,
                div { class: "mn-command-search",
                    TextInput {
                        class_name: "mn-command-input".to_string(),
                        autofocus: true,
                        placeholder: i18n.text("Run command", "执行命令").to_string(),
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
                                            on_trash,
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
                ResultList {
                    label: i18n.text("Command results", "命令结果").to_string(),
                    class_name: String::new(),
                    if filtered.is_empty() {
                        InlineAlert {
                            message: i18n.text("No matching commands", "没有匹配的命令").to_string(),
                            tone: InlineAlertTone::Neutral,
                            class_name: "mn-command-empty".to_string(),
                        }
                    } else {
                        for index in 0..filtered.len().min(COMMAND_PALETTE_LIMIT) {
                            CommandPaletteRow {
                                action: filtered[index].clone(),
                                is_active: index == active,
                                commands: commands.clone(),
                                on_settings,
                                on_trash,
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
    on_trash: EventHandler<()>,
    on_close: EventHandler<()>,
) -> Element {
    let kind = action.kind.clone();

    rsx! {
        ResultRow {
            label: action.title.clone(),
            metadata: action.group.clone(),
            is_active,
            kind: ResultRowKind::Default,
            on_select: move |_| {
                execute_command_action(
                    commands.clone(),
                    on_settings,
                    on_trash,
                    on_close,
                    kind.clone(),
                );
            },
            span { class: "mn-command-title", "{action.title}" }
            span { class: "mn-command-path", "{action.detail}" }
        }
    }
}

fn execute_command_action(
    commands: AppCommands,
    on_settings: EventHandler<()>,
    on_trash: EventHandler<()>,
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
        CommandPaletteActionKind::CloseActiveTab(tab_id) => commands.close_tab.call(tab_id),
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
        CommandPaletteActionKind::OpenTrash => {
            let started_at = perf_timer();
            on_trash.call(());
            trace_chrome_open_modal("trash", "command_palette", started_at);
        }
        CommandPaletteActionKind::SetViewMode(mode) => {
            crate::chrome::set_view_mode(commands.clone(), mode, "command_palette");
        }
        CommandPaletteActionKind::SetSelectedFavorite(favorite) => {
            commands.set_selected_favorite.call(favorite);
        }
        CommandPaletteActionKind::InsertMarkdown(request) => {
            commands.insert_markdown.call(request);
        }
    }

    on_close.call(());
}

pub(crate) fn command_palette_actions(
    input: CommandPaletteActionInput<'_>,
) -> Vec<CommandPaletteAction> {
    let i18n = i18n_for(input.language);
    let workspace_title = if input.has_workspace {
        i18n.text("Switch workspace", "切换工作区")
    } else {
        i18n.text("Open workspace", "打开工作区")
    };
    let next_theme_label = theme_label(input.language, &next_theme(&input.theme));

    let mut actions = vec![
        action(
            workspace_title,
            i18n.text("Choose a workspace folder", "选择工作区目录"),
            "APP",
            CommandPaletteActionKind::OpenWorkspace,
        ),
        action(
            i18n.text("Toggle sidebar", "切换侧边栏"),
            i18n.text(
                "Show or hide the workspace browser",
                "显示或隐藏工作区文件栏",
            ),
            "VIEW",
            CommandPaletteActionKind::ToggleSidebar,
        ),
        action(
            if input.outline_visible {
                i18n.text("Hide outline", "隐藏大纲")
            } else {
                i18n.text("Show outline", "显示大纲")
            },
            i18n.text(
                "Toggle the active note heading outline",
                "切换当前笔记的大纲面板",
            ),
            "VIEW",
            CommandPaletteActionKind::ToggleOutline,
        ),
        action(
            i18n.text("Toggle theme", "切换主题"),
            &format!("Switch to {next_theme_label}"),
            "VIEW",
            CommandPaletteActionKind::ToggleTheme,
        ),
        action(
            i18n.text("Open settings", "打开设置"),
            i18n.text("Edit app preferences", "修改应用偏好"),
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
            &format!("{} {}", i18n.text("Open", "打开"), workspace.name),
            &workspace.path.display().to_string(),
            "WS",
            CommandPaletteActionKind::OpenWorkspacePath(workspace.path.clone()),
        ));
    }

    for file in input.recent_files {
        actions.push(action(
            &format!("{} {}", i18n.text("Open", "打开"), file.title),
            &format!("{} / {}", file.workspace_name, file.relative_path.display()),
            "REC",
            CommandPaletteActionKind::OpenMarkdown(OpenMarkdownTarget {
                path: file.workspace_path.join(&file.relative_path),
            }),
        ));
    }

    if input.has_workspace {
        actions.push(action(
            i18n.text("Open trash", "打开回收站"),
            &trash_action_detail(input.language, input.trashed_notes.len()),
            "APP",
            CommandPaletteActionKind::OpenTrash,
        ));
        actions.push(action(
            i18n.text("Refresh workspace", "刷新工作区"),
            i18n.text("Reload the file tree", "重新加载文件树"),
            "APP",
            CommandPaletteActionKind::RefreshWorkspace,
        ));
    }

    if input.has_active_tab {
        actions.push(action(
            i18n.text("Save active note", "保存当前笔记"),
            i18n.text("Write current note changes", "写入当前笔记的更改"),
            "FILE",
            CommandPaletteActionKind::SaveActiveNote,
        ));
        if let Some(tab_id) = input.active_tab_id {
            actions.push(action(
                i18n.text("Close active note", "关闭当前笔记"),
                i18n.text("Close the current tab", "关闭当前标签页"),
                "FILE",
                CommandPaletteActionKind::CloseActiveTab(tab_id.to_string()),
            ));
            actions.extend(markdown_insert_actions(input.language, tab_id));
        }
        if input.active_save_status == SaveStatus::Conflict {
            actions.push(action(
                i18n.text("Reload conflicted note", "重新加载冲突笔记"),
                i18n.text(
                    "Discard editor content and load the disk version",
                    "丢弃编辑器内容并加载磁盘版本",
                ),
                "FILE",
                CommandPaletteActionKind::ReloadConflictedActiveNote,
            ));
            actions.push(action(
                i18n.text("Overwrite conflicted note", "覆盖冲突笔记"),
                i18n.text(
                    "Replace the disk version with editor content",
                    "用编辑器内容替换磁盘版本",
                ),
                "FILE",
                CommandPaletteActionKind::OverwriteActiveNote,
            ));
            actions.push(action(
                i18n.text("Save conflicted note as...", "将冲突笔记另存为..."),
                i18n.text(
                    "Write editor content to another workspace Markdown file",
                    "将编辑器内容写入另一个工作区 Markdown 文件",
                ),
                "FILE",
                CommandPaletteActionKind::SaveConflictedActiveNoteAs,
            ));
        }
    }

    if let Some(name) = input.selected_note_name {
        actions.push(action(
            i18n.text("Favorite selected note", "收藏所选笔记"),
            name,
            "FILE",
            CommandPaletteActionKind::SetSelectedFavorite(true),
        ));
        actions.push(action(
            i18n.text("Unfavorite selected note", "取消收藏所选笔记"),
            name,
            "FILE",
            CommandPaletteActionKind::SetSelectedFavorite(false),
        ));
    }

    for (mode, title) in [
        (
            ViewMode::Hybrid,
            i18n.text("Use hybrid mode", "切换到混合模式"),
        ),
        (
            ViewMode::Source,
            i18n.text("Use source mode", "切换到源码模式"),
        ),
        (
            ViewMode::Preview,
            i18n.text("Use preview mode", "切换到预览模式"),
        ),
    ] {
        if mode != input.view_mode {
            actions.push(action(
                title,
                i18n.text("Change editor rendering mode", "切换编辑器渲染模式"),
                "VIEW",
                CommandPaletteActionKind::SetViewMode(mode),
            ));
        }
    }

    actions
}

const INSERT_CURSOR_MARKER: &str = "{|cursor|}";

fn markdown_insert_template(template: &str) -> (String, Option<usize>) {
    let Some(cursor_offset) = template.find(INSERT_CURSOR_MARKER) else {
        return (template.to_string(), None);
    };

    let mut markdown = String::with_capacity(template.len() - INSERT_CURSOR_MARKER.len());
    markdown.push_str(&template[..cursor_offset]);
    markdown.push_str(&template[cursor_offset + INSERT_CURSOR_MARKER.len()..]);
    (markdown, Some(cursor_offset))
}

fn markdown_insert_actions(language: AppLanguage, tab_id: &str) -> Vec<CommandPaletteAction> {
    let i18n = i18n_for(language);
    [
        (
            i18n.text("Insert table", "插入表格"),
            i18n.text("Add a basic Markdown table", "添加基础 Markdown 表格"),
            "\n| Column | Value |\n| --- | --- |\n| {|cursor|} |  |\n",
        ),
        (
            i18n.text("Insert code block", "插入代码块"),
            i18n.text("Add a fenced code block", "添加围栏代码块"),
            "\n```text\n{|cursor|}\n```\n",
        ),
        (
            i18n.text("Insert link", "插入链接"),
            i18n.text("Add Markdown link syntax", "添加 Markdown 链接语法"),
            "[link text]({|cursor|}https://example.com)",
        ),
        (
            i18n.text("Insert image", "插入图片"),
            i18n.text("Add Markdown image syntax", "添加 Markdown 图片语法"),
            "![alt text]({|cursor|}assets/image.png)",
        ),
        (
            i18n.text("Insert callout", "插入提示块"),
            i18n.text(
                "Add a portable Markdown callout",
                "添加可移植的 Markdown 提示块",
            ),
            "\n> [!NOTE]\n> {|cursor|}\n",
        ),
        (
            i18n.text("Insert inline math", "插入行内公式"),
            i18n.text("Add an inline KaTeX expression", "添加行内 KaTeX 公式"),
            "${|cursor|}$",
        ),
        (
            i18n.text("Insert math block", "插入公式块"),
            i18n.text("Add a display math block", "添加独立数学公式"),
            "\n$$\n{|cursor|}\n$$\n",
        ),
        (
            i18n.text("Insert Mermaid diagram", "插入 Mermaid 图"),
            i18n.text(
                "Add a live Mermaid diagram block",
                "添加可预览的 Mermaid 图表",
            ),
            "\n```mermaid\nflowchart TD\n    A[Start] --> B[Finish]{|cursor|}\n```\n",
        ),
        (
            i18n.text("Insert task list", "插入任务列表"),
            i18n.text("Add a Markdown checklist item", "添加 Markdown 待办项"),
            "\n- [ ] {|cursor|}\n",
        ),
    ]
    .into_iter()
    .map(|(title, detail, template)| {
        let (markdown, cursor_offset) = markdown_insert_template(template);
        action(
            title,
            detail,
            "INSERT",
            CommandPaletteActionKind::InsertMarkdown(InsertMarkdownRequest {
                tab_id: tab_id.to_string(),
                markdown,
                cursor_offset,
            }),
        )
    })
    .collect()
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

fn theme_label(language: AppLanguage, theme: &Theme) -> &'static str {
    let i18n = i18n_for(language);
    match theme {
        Theme::System => i18n.text("System", "跟随系统"),
        Theme::Light => i18n.text("Light", "浅色"),
        Theme::Dark => i18n.text("Dark", "深色"),
        Theme::GitHubLight => i18n.text("GitHub Light", "GitHub 浅色"),
        Theme::GitHubDark => i18n.text("GitHub Dark", "GitHub 深色"),
        Theme::HighContrast => i18n.text("High Contrast", "高对比度"),
        Theme::WarmReading => i18n.text("Warm Reading", "暖色阅读"),
    }
}

fn selected_note_name(workspace: &crate::view_model::WorkspaceViewModel) -> Option<&str> {
    if workspace.has_selection && !workspace.selected_is_directory {
        workspace.selected_name.as_deref()
    } else {
        None
    }
}

fn trash_action_detail(language: AppLanguage, count: usize) -> String {
    i18n_for(language).deleted_notes_review(count)
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
            language: AppLanguage::English,
            has_workspace: true,
            recent_workspaces: &[],
            recent_files: &[],
            trashed_notes: &[],
            active_tab_id: None,
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
            active_tab_id: Some("tab-draft"),
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
        assert!(titles.contains(&"Close active note"));
        assert!(titles.contains(&"Show outline"));
        assert!(titles.contains(&"Favorite selected note"));
        assert!(titles.contains(&"Unfavorite selected note"));
        assert!(titles.contains(&"Use source mode"));
        assert!(titles.contains(&"Insert table"));
        assert!(titles.contains(&"Insert link"));
        assert!(titles.contains(&"Insert image"));
        assert!(titles.contains(&"Insert callout"));
        assert!(titles.contains(&"Insert inline math"));
        assert!(titles.contains(&"Insert Mermaid diagram"));
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
        assert!(!titles.contains(&"Open trash"));
        assert!(!titles.contains(&"Save active note"));
        assert!(!titles.contains(&"Insert table"));
        assert!(!titles.contains(&"Reload conflicted note"));
        assert!(!titles.contains(&"Overwrite conflicted note"));
        assert!(!titles.contains(&"Save conflicted note as..."));
    }

    #[test]
    fn command_palette_actions_include_conflict_resolution() {
        let actions = command_palette_actions(CommandPaletteActionInput {
            has_active_tab: true,
            active_tab_id: Some("tab-a"),
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
    fn command_palette_actions_include_close_active_tab() {
        let actions = command_palette_actions(CommandPaletteActionInput {
            has_active_tab: true,
            active_tab_id: Some("tab-a"),
            ..test_input()
        });

        assert!(actions.iter().any(|action| {
            action.title == "Close active note"
                && action.detail == "Close the current tab"
                && action.group == "FILE"
                && matches!(
                    &action.kind,
                    CommandPaletteActionKind::CloseActiveTab(tab_id) if tab_id == "tab-a"
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
    fn command_palette_actions_include_trash_entry() {
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
            action.title == "Open trash"
                && action.detail == "Review 1 deleted note"
                && action.group == "APP"
                && matches!(action.kind, CommandPaletteActionKind::OpenTrash)
        }));
        assert!(!actions
            .iter()
            .any(|action| action.title == "Restore Deleted draft"));
        assert!(!actions.iter().any(|action| action.title == "Empty trash"));
    }

    #[test]
    fn trash_action_detail_names_empty_singular_and_plural_states() {
        assert_eq!(
            trash_action_detail(AppLanguage::English, 0),
            "No deleted notes"
        );
        assert_eq!(
            trash_action_detail(AppLanguage::English, 1),
            "Review 1 deleted note"
        );
        assert_eq!(
            trash_action_detail(AppLanguage::English, 4),
            "Review 4 deleted notes"
        );
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

    #[test]
    fn command_palette_insert_actions_target_active_tab() {
        let actions = command_palette_actions(CommandPaletteActionInput {
            has_active_tab: true,
            active_tab_id: Some("tab-a"),
            ..test_input()
        });

        assert!(actions.iter().any(|action| {
            action.title == "Insert table"
                && action.group == "INSERT"
                && matches!(
                    &action.kind,
                    CommandPaletteActionKind::InsertMarkdown(request)
                        if request.tab_id == "tab-a"
                            && request.markdown.contains("| Column | Value |")
                            && request.cursor_offset.is_some()
                )
        }));
        assert!(actions.iter().any(|action| {
            action.title == "Insert inline math"
                && matches!(
                    &action.kind,
                    CommandPaletteActionKind::InsertMarkdown(request)
                        if request.markdown == "$$"
                            && request.cursor_offset == Some(1)
                )
        }));
        assert!(actions.iter().any(|action| {
            action.title == "Insert callout"
                && matches!(
                    &action.kind,
                    CommandPaletteActionKind::InsertMarkdown(request)
                        if request.markdown.contains("> [!NOTE]")
                            && request.cursor_offset.is_some()
                )
        }));
        assert!(actions.iter().any(|action| {
            action.title == "Insert math block"
                && matches!(
                    &action.kind,
                    CommandPaletteActionKind::InsertMarkdown(request)
                        if request.markdown.contains("$$")
                            && request.cursor_offset.is_some()
                )
        }));
    }
}
