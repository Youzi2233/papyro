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
                        span { class: "mn-status-message", "{msg}" }
                    }
                }
            }
            div { class: "mn-status-right",
                if editor.has_active_tab {
                    span { "{stats.word_count} words" }
                    span { "{stats.char_count} chars" }
                    match editor.active_save_status {
                        SaveStatus::Saving => rsx! {
                            span { class: "mn-status-saving", "Saving" }
                        },
                        SaveStatus::Failed => rsx! {
                            span { class: "mn-status-unsaved", "Save failed" }
                        },
                        SaveStatus::Dirty => rsx! {
                            span { class: "mn-status-unsaved", "Unsaved" }
                        },
                        SaveStatus::Saved => rsx! {
                            span { "Saved" }
                        },
                    }
                }
            }
        }
    }
}
