use crate::components::primitives::{StatusIndicator, StatusMessage, StatusTone};
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::SaveStatus;

#[component]
pub fn StatusBar(status_message: Option<String>) -> Element {
    let app = use_app_context();
    let (active_tab_id, active_save_status, has_active_tab) = {
        let editor_tabs = app.editor_tabs.read();
        let active_tab = editor_tabs.active_tab();
        (
            editor_tabs.active_tab_id.clone(),
            active_tab
                .map(|tab| tab.save_status.clone())
                .unwrap_or_default(),
            active_tab.is_some(),
        )
    };
    let stats = app
        .tab_contents
        .read()
        .active_stats(active_tab_id.as_deref());

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
                if has_active_tab {
                    StatusIndicator {
                        label: format!("{} words", stats.word_count),
                        tone: StatusTone::Default,
                    }
                    StatusIndicator {
                        label: format!("{} chars", stats.char_count),
                        tone: StatusTone::Default,
                    }
                    match active_save_status {
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
