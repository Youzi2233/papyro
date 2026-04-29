use crate::components::primitives::{StatusIndicator, StatusMessage, StatusTone};
use crate::context::use_app_context;
use crate::view_model::EditorViewModel;
use dioxus::prelude::*;
use papyro_core::models::SaveStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
struct StatusBarItem {
    label: String,
    tone: StatusTone,
}

#[component]
pub fn StatusBar() -> Element {
    let app = use_app_context();
    let editor_model = app.editor_model.read().clone();
    let status_message = (app.status_text)();
    let items = status_bar_items(&editor_model);

    rsx! {
        footer { class: "mn-status-bar",
            div { class: "mn-status-left",
                if let Some(msg) = &status_message {
                    if !msg.is_empty() {
                        StatusMessage { message: msg.clone() }
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
            }
        }
    }
}

fn status_bar_items(editor_model: &EditorViewModel) -> Vec<StatusBarItem> {
    if !editor_model.has_active_tab {
        return Vec::new();
    }

    let mut items = Vec::new();
    if editor_model.active_stats_revision.is_some() {
        items.push(StatusBarItem {
            label: format!("{} words", editor_model.active_stats.word_count),
            tone: StatusTone::Default,
        });
        items.push(StatusBarItem {
            label: format!("{} chars", editor_model.active_stats.char_count),
            tone: StatusTone::Default,
        });
    }
    items.push(StatusBarItem {
        label: save_status_label(&editor_model.active_save_status).to_string(),
        tone: save_status_tone(&editor_model.active_save_status),
    });

    items
}

fn save_status_label(status: &SaveStatus) -> &'static str {
    match status {
        SaveStatus::Saving => "Saving",
        SaveStatus::Failed => "Save failed",
        SaveStatus::Dirty => "Unsaved",
        SaveStatus::Saved => "Saved",
    }
}

fn save_status_tone(status: &SaveStatus) -> StatusTone {
    match status {
        SaveStatus::Saving => StatusTone::Saving,
        SaveStatus::Failed | SaveStatus::Dirty => StatusTone::Attention,
        SaveStatus::Saved => StatusTone::Default,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::{DocumentStats, ViewMode};

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
            active_is_dirty: save_status == SaveStatus::Dirty,
            active_save_status: save_status,
            active_stats: DocumentStats {
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
        assert!(status_bar_items(&editor_model(false, SaveStatus::Saved)).is_empty());
    }

    #[test]
    fn status_bar_items_are_derived_from_editor_view_model() {
        assert_eq!(
            status_bar_items(&editor_model(true, SaveStatus::Dirty)),
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
                    label: "Unsaved".to_string(),
                    tone: StatusTone::Attention,
                },
            ]
        );
    }

    #[test]
    fn status_bar_items_hide_stale_editor_stats() {
        assert_eq!(
            status_bar_items(&editor_model_with_stats_revision(
                true,
                SaveStatus::Dirty,
                None,
            )),
            vec![StatusBarItem {
                label: "Unsaved".to_string(),
                tone: StatusTone::Attention,
            }]
        );
    }
}
