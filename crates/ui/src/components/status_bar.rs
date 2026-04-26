use crate::components::primitives::{StatusIndicator, StatusMessage, StatusTone};
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::SaveStatus;

#[component]
pub fn StatusBar(status_message: Option<String>) -> Element {
    let app = use_app_context();
    let editor = app.view_model.read().editor.clone();
    let stats = editor.active_stats.clone();

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
                if editor.has_active_tab {
                    StatusIndicator {
                        label: format!("{} words", stats.word_count),
                        tone: StatusTone::Default,
                    }
                    StatusIndicator {
                        label: format!("{} chars", stats.char_count),
                        tone: StatusTone::Default,
                    }
                    match editor.active_save_status {
                        SaveStatus::Saving => rsx! {
                            StatusIndicator { label: "Saving", tone: StatusTone::Saving }
                        },
                        SaveStatus::Failed => rsx! {
                            StatusIndicator { label: "Save failed", tone: StatusTone::Attention }
                        },
                        SaveStatus::Dirty => rsx! {
                            StatusIndicator { label: "Unsaved", tone: StatusTone::Attention }
                        },
                        SaveStatus::Saved => rsx! {
                            StatusIndicator { label: "Saved", tone: StatusTone::Default }
                        },
                    }
                }
            }
        }
    }
}
