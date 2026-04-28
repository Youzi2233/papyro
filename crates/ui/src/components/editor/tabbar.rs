use super::bridge::perf_enabled;
use crate::commands::AppCommands;
use crate::context::use_app_context;
use crate::view_model::EditorTabItemViewModel;
use dioxus::prelude::*;
use std::time::Instant;

fn request_tab_close(commands: AppCommands, close_tab_id: String, trigger: &'static str) {
    let perf_started_at = perf_enabled().then(Instant::now);

    commands.close_tab.call(close_tab_id.clone());

    if let Some(started_at) = perf_started_at {
        tracing::info!(
            tab_id = %close_tab_id,
            trigger,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf tab close trigger"
        );
    }
}

#[component]
pub(super) fn EditorTabButton(item: EditorTabItemViewModel) -> Element {
    let app = use_app_context();
    let commands = app.commands;
    let activate_tab_id = item.id.clone();
    let close_tab_id = item.id.clone();
    let close_tab_id_for_click = close_tab_id.clone();
    let close_tab_id_for_keyboard = close_tab_id.clone();
    let commands_for_click = commands.clone();
    let commands_for_keyboard = commands.clone();

    rsx! {
        div {
            "data-tab-id": "{item.id}",
            class: if item.is_active { "mn-tab active" } else { "mn-tab" },
            button {
                class: "mn-tab-title",
                onclick: move |_| commands.activate_tab.call(activate_tab_id.clone()),
                "{item.title}"
                if item.is_dirty { span { class: "mn-dirty", "*" } }
            }
            button {
                class: "mn-tab-close",
                title: "Close tab",
                "data-close-tab-id": "{close_tab_id}",
                "data-next-active-tab-id": "{item.next_active_tab_id}",
                "data-immediate-close": if item.should_retire_host_on_close { "true" } else { "false" },
                onclick: move |event| {
                    event.prevent_default();
                    event.stop_propagation();
                    request_tab_close(
                        commands_for_click.clone(),
                        close_tab_id_for_click.clone(),
                        "click",
                    );
                },
                onkeydown: move |event| {
                    let key = event.key();
                    let is_space = matches!(key, Key::Character(ref value) if value == " ");
                    if key != Key::Enter && !is_space {
                        return;
                    }
                    event.prevent_default();
                    event.stop_propagation();
                    request_tab_close(
                        commands_for_keyboard.clone(),
                        close_tab_id_for_keyboard.clone(),
                        "keyboard",
                    );
                },
                "x"
            }
        }
    }
}
