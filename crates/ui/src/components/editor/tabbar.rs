use super::bridge::{perf_enabled, RetiredEditorHosts};
use crate::commands::AppCommands;
use crate::context::use_app_context;
use dioxus::prelude::*;
use std::time::Instant;

const MAX_RETIRED_HOSTS: usize = 2;

fn retire_host_for_close(retired_ids: &mut Vec<String>, close_tab_id: &str) {
    if retired_ids.iter().any(|id| id == close_tab_id) {
        return;
    }

    retired_ids.push(close_tab_id.to_string());
    let overflow = retired_ids.len().saturating_sub(MAX_RETIRED_HOSTS);
    if overflow > 0 {
        retired_ids.drain(0..overflow);
    }
}

fn request_tab_close(
    mut retired_hosts: RetiredEditorHosts,
    commands: AppCommands,
    close_tab_id: String,
    should_retire_host: bool,
    trigger: &'static str,
) {
    let perf_started_at = perf_enabled().then(Instant::now);

    // Both writes happen synchronously so Dioxus batches them into a single
    // render pass, eliminating the extra tick that caused the close stutter.
    if should_retire_host {
        retired_hosts.with_mut(|ids| {
            retire_host_for_close(ids, &close_tab_id);
        });
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retired_hosts_are_unique_and_bounded() {
        let mut retired = vec!["a".to_string(), "b".to_string()];

        retire_host_for_close(&mut retired, "b");
        assert_eq!(retired, vec!["a".to_string(), "b".to_string()]);

        retire_host_for_close(&mut retired, "c");
        assert_eq!(retired, vec!["b".to_string(), "c".to_string()]);
    }
}

fn activate_tab(mut editor_tabs: Signal<papyro_core::EditorTabs>, tab_id: &str) {
    let perf_started_at = perf_enabled().then(Instant::now);
    editor_tabs.write().set_active_tab(tab_id);
    if let Some(started_at) = perf_started_at {
        tracing::info!(
            tab_id,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor switch tab"
        );
    }
}

#[component]
pub(super) fn EditorTabButton(tab: papyro_core::models::EditorTab, is_active: bool) -> Element {
    let app = use_app_context();
    let editor_tabs = app.editor_tabs;
    let pending_close_tab = app.pending_close_tab;
    let commands = app.commands;
    let retired_hosts = use_context::<RetiredEditorHosts>();
    let activate_tab_id = tab.id.clone();
    let close_tab_id = tab.id.clone();
    let close_tab_id_for_mouse = close_tab_id.clone();
    let close_tab_id_for_keyboard = close_tab_id.clone();
    let commands_for_mouse = commands.clone();
    let commands_for_keyboard = commands.clone();
    let should_retire_host =
        !tab.is_dirty || pending_close_tab.read().as_deref() == Some(tab.id.as_str());
    let next_active_tab_id = {
        let tabs = editor_tabs.read();
        if is_active {
            tabs.tabs
                .iter()
                .rfind(|candidate| candidate.id != close_tab_id)
                .map(|candidate| candidate.id.clone())
                .unwrap_or_default()
        } else {
            tabs.active_tab_id.clone().unwrap_or_default()
        }
    };

    rsx! {
        div {
            "data-tab-id": "{tab.id}",
            class: if is_active { "mn-tab active" } else { "mn-tab" },
            button {
                class: "mn-tab-title",
                onclick: move |_| activate_tab(editor_tabs, &activate_tab_id),
                "{tab.title}"
                if tab.is_dirty { span { class: "mn-dirty", "*" } }
            }
            button {
                class: "mn-tab-close",
                title: "Close tab",
                "data-close-tab-id": "{close_tab_id}",
                "data-next-active-tab-id": "{next_active_tab_id}",
                "data-immediate-close": if should_retire_host { "true" } else { "false" },
                onmousedown: move |event| {
                    event.prevent_default();
                    event.stop_propagation();
                    request_tab_close(
                        retired_hosts,
                        commands_for_mouse.clone(),
                        close_tab_id_for_mouse.clone(),
                        should_retire_host,
                        "mouse_down",
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
                        retired_hosts,
                        commands_for_keyboard.clone(),
                        close_tab_id_for_keyboard.clone(),
                        should_retire_host,
                        "keyboard",
                    );
                },
                "x"
            }
        }
    }
}
