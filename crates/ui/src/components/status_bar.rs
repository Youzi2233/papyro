use crate::components::primitives::{DropdownOption, Select, StatusIndicator, StatusTone};
use crate::context::use_app_context;
use crate::i18n::{i18n_for, use_i18n};
use crate::view_model::EditorViewModel;
use dioxus::prelude::*;
use papyro_core::models::{AppLanguage, SaveStatus, ViewMode};

#[derive(Debug, Clone, PartialEq, Eq)]
struct StatusBarItem {
    label: String,
    tone: StatusTone,
}

#[component]
pub fn StatusBar() -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands;
    let editor_model = app.editor_model.read().clone();
    let status_message = visible_status_message((app.status_text)());
    let items = status_bar_items(&editor_model, i18n.language());
    let stats = status_bar_stats(&editor_model, i18n.language());
    let view_mode_options = view_mode_options(i18n.language());
    let mode_commands = commands.clone();

    rsx! {
        footer { class: "mn-status-bar",
            div { class: "mn-status-left",
                if let Some(message) = status_message {
                    if !message.is_empty() {
                        span { class: "mn-status-message", "{message}" }
                    }
                }
                for item in stats {
                    StatusIndicator {
                        label: item.label,
                        tone: item.tone,
                    }
                }
            }
            div { class: "mn-status-right",
                for item in items {
                    StatusIndicator {
                        label: item.label,
                        tone: item.tone,
                    }
                }
                div { class: "mn-status-mode",
                    Select {
                        label: i18n.text("Editor view mode", "编辑器视图模式").to_string(),
                        options: view_mode_options,
                        selected: view_mode_value(&editor_model.view_mode).to_string(),
                        on_change: move |value: String| {
                            if let Some(mode) = view_mode_from_value(&value) {
                                crate::chrome::set_view_mode(
                                    mode_commands.clone(),
                                    mode,
                                    "status_bar",
                                );
                            }
                        },
                    }
                }
            }
        }
    }
}

fn visible_status_message(message: Option<String>) -> Option<String> {
    message.filter(|message| !is_workspace_loaded_message(message))
}

fn is_workspace_loaded_message(message: &str) -> bool {
    let message = message.trim();
    message.starts_with("Loaded ") && message.contains(" notes from ")
}

fn status_bar_items(editor_model: &EditorViewModel, language: AppLanguage) -> Vec<StatusBarItem> {
    let i18n = i18n_for(language);
    if !editor_model.has_active_tab {
        return Vec::new();
    }

    let mut items = Vec::new();
    if editor_model.active_save_status != SaveStatus::Saved {
        items.push(StatusBarItem {
            label: i18n
                .save_status(&editor_model.active_save_status)
                .to_string(),
            tone: save_status_tone(&editor_model.active_save_status),
        });
    }

    items
}

fn status_bar_stats(editor_model: &EditorViewModel, language: AppLanguage) -> Vec<StatusBarItem> {
    let i18n = i18n_for(language);
    if !editor_model.has_active_tab || editor_model.active_stats_revision.is_none() {
        return Vec::new();
    }

    vec![
        StatusBarItem {
            label: i18n.word_count(editor_model.active_stats.word_count),
            tone: StatusTone::Default,
        },
        StatusBarItem {
            label: char_count_label(language, editor_model.active_stats.char_count),
            tone: StatusTone::Default,
        },
        StatusBarItem {
            label: i18n.line_count(editor_model.active_stats.line_count),
            tone: StatusTone::Default,
        },
    ]
}

fn char_count_label(language: AppLanguage, count: usize) -> String {
    match language {
        AppLanguage::English => {
            if count == 1 {
                "1 char".to_string()
            } else {
                format!("{count} chars")
            }
        }
        AppLanguage::Chinese => format!("{count} 字符"),
    }
}

fn editor_view_modes() -> [ViewMode; 3] {
    [ViewMode::Source, ViewMode::Hybrid, ViewMode::Preview]
}

fn view_mode_value(mode: &ViewMode) -> &'static str {
    mode.as_str()
}

fn view_mode_from_value(value: &str) -> Option<ViewMode> {
    match value {
        "source" => Some(ViewMode::Source),
        "hybrid" => Some(ViewMode::Hybrid),
        "preview" => Some(ViewMode::Preview),
        _ => None,
    }
}

fn view_mode_options(language: AppLanguage) -> Vec<DropdownOption> {
    editor_view_modes()
        .into_iter()
        .map(|mode| DropdownOption::new(status_view_mode_label(language, &mode), mode.as_str()))
        .collect()
}

fn status_view_mode_label(language: AppLanguage, mode: &ViewMode) -> &'static str {
    match language {
        AppLanguage::English => match mode {
            ViewMode::Source => "Source mode",
            ViewMode::Hybrid => "Hybrid mode",
            ViewMode::Preview => "Preview mode",
        },
        AppLanguage::Chinese => match mode {
            ViewMode::Source => "源码模式",
            ViewMode::Hybrid => "混合模式",
            ViewMode::Preview => "预览模式",
        },
    }
}

fn save_status_tone(status: &SaveStatus) -> StatusTone {
    match status {
        SaveStatus::Saving => StatusTone::Saving,
        SaveStatus::Conflict | SaveStatus::Failed | SaveStatus::Dirty => StatusTone::Attention,
        SaveStatus::Saved => StatusTone::Default,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::{AppLanguage, DocumentStats, ViewMode};

    fn editor_model(has_active_tab: bool, save_status: SaveStatus) -> EditorViewModel {
        editor_model_with_stats_revision(has_active_tab, save_status, has_active_tab.then_some(0))
    }

    fn editor_model_with_stats_revision(
        has_active_tab: bool,
        save_status: SaveStatus,
        active_stats_revision: Option<u64>,
    ) -> EditorViewModel {
        EditorViewModel {
            active_tab_id: has_active_tab.then(|| "tab-a".to_string()),
            active_title: has_active_tab.then(|| "Draft".to_string()),
            has_active_tab,
            tab_count: usize::from(has_active_tab),
            active_is_dirty: matches!(save_status, SaveStatus::Dirty | SaveStatus::Conflict),
            active_save_status: save_status,
            active_stats: DocumentStats {
                line_count: 4,
                word_count: 12,
                char_count: 72,
                ..Default::default()
            },
            active_stats_revision,
            view_mode: ViewMode::Hybrid,
        }
    }

    #[test]
    fn status_bar_items_hide_editor_stats_without_active_tab() {
        assert!(status_bar_items(
            &editor_model(false, SaveStatus::Saved),
            AppLanguage::English
        )
        .is_empty());
    }

    #[test]
    fn status_bar_items_are_derived_from_editor_view_model() {
        assert_eq!(
            status_bar_items(&editor_model(true, SaveStatus::Dirty), AppLanguage::English),
            vec![StatusBarItem {
                label: "Unsaved".to_string(),
                tone: StatusTone::Attention,
            }]
        );
    }

    #[test]
    fn status_bar_items_hide_saved_state() {
        assert_eq!(
            status_bar_items(&editor_model(true, SaveStatus::Saved), AppLanguage::English),
            Vec::<StatusBarItem>::new()
        );
    }

    #[test]
    fn status_bar_items_hide_stale_editor_stats() {
        assert_eq!(
            status_bar_items(
                &editor_model_with_stats_revision(true, SaveStatus::Dirty, None),
                AppLanguage::English,
            ),
            vec![StatusBarItem {
                label: "Unsaved".to_string(),
                tone: StatusTone::Attention,
            }]
        );
    }

    #[test]
    fn status_bar_stats_include_words_chars_and_lines() {
        assert_eq!(
            status_bar_stats(&editor_model(true, SaveStatus::Saved), AppLanguage::English),
            vec![
                StatusBarItem {
                    label: "12 words".to_string(),
                    tone: StatusTone::Default,
                },
                StatusBarItem {
                    label: "72 chars".to_string(),
                    tone: StatusTone::Default,
                },
                StatusBarItem {
                    label: "4 lines".to_string(),
                    tone: StatusTone::Default,
                },
            ]
        );
    }

    #[test]
    fn status_bar_stats_hide_stale_editor_stats() {
        assert!(status_bar_stats(
            &editor_model_with_stats_revision(true, SaveStatus::Saved, None),
            AppLanguage::English,
        )
        .is_empty());
    }

    #[test]
    fn status_bar_items_show_conflict_state() {
        assert_eq!(
            status_bar_items(
                &editor_model_with_stats_revision(true, SaveStatus::Conflict, None),
                AppLanguage::English,
            ),
            vec![StatusBarItem {
                label: "Conflict".to_string(),
                tone: StatusTone::Attention,
            }]
        );
    }

    #[test]
    fn view_mode_options_round_trip() {
        assert_eq!(view_mode_from_value("source"), Some(ViewMode::Source));
        assert_eq!(view_mode_from_value("missing"), None);
        assert_eq!(view_mode_value(&ViewMode::Preview), "preview");
        assert_eq!(view_mode_options(AppLanguage::English).len(), 3);
        assert_eq!(
            view_mode_options(AppLanguage::Chinese)
                .into_iter()
                .map(|option| option.label)
                .collect::<Vec<_>>(),
            vec!["源码模式", "混合模式", "预览模式"]
        );
    }

    #[test]
    fn visible_status_message_hides_workspace_loaded_notice() {
        assert_eq!(
            visible_status_message(Some("Loaded 49 notes from E:\\papyro".to_string())),
            None
        );
        assert_eq!(
            visible_status_message(Some("Reloaded roadmap.md from disk".to_string())),
            Some("Reloaded roadmap.md from disk".to_string())
        );
    }
}
