use crate::context::use_app_context;
use dioxus::prelude::*;

#[component]
pub fn StatusBar(status_message: Option<String>) -> Element {
    let app = use_app_context();
    let editor_tabs = app.editor_tabs;
    let tab_contents = app.tab_contents;
    let tabs = editor_tabs.read();
    let stats = tab_contents
        .read()
        .active_stats(tabs.active_tab_id.as_deref());
    let active_tab = tabs.active_tab().cloned();
    let is_dirty = active_tab.as_ref().map_or(false, |t| t.is_dirty);

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
                if active_tab.is_some() {
                    span { "{stats.word_count} words" }
                    span { "{stats.char_count} chars" }
                    if is_dirty {
                        span { class: "mn-status-unsaved", "Unsaved" }
                    } else {
                        span { "Saved" }
                    }
                }
            }
        }
    }
}
