use super::bridge::perf_enabled;
use crate::commands::AppCommands;
use crate::context::use_app_context;
use crate::perf::trace_tab_close_trigger;
use crate::view_model::EditorTabItemViewModel;
use dioxus::prelude::*;
use papyro_core::models::SaveStatus;
use std::time::Instant;

fn request_tab_close(commands: AppCommands, close_tab_id: String, trigger: &'static str) {
    let perf_started_at = perf_enabled().then(Instant::now);

    commands.close_tab.call(close_tab_id.clone());

    trace_tab_close_trigger(&close_tab_id, trigger, perf_started_at);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct TabSaveStatusIndicator {
    class_name: &'static str,
    label: &'static str,
    marker: &'static str,
}

fn tab_save_status_indicator(
    save_status: &SaveStatus,
    is_dirty: bool,
) -> Option<TabSaveStatusIndicator> {
    match save_status {
        SaveStatus::Saving => Some(TabSaveStatusIndicator {
            class_name: "saving",
            label: "Saving",
            marker: "...",
        }),
        SaveStatus::Failed => Some(TabSaveStatusIndicator {
            class_name: "failed",
            label: "Save failed",
            marker: "!",
        }),
        SaveStatus::Conflict => Some(TabSaveStatusIndicator {
            class_name: "conflict",
            label: "File changed outside Papyro",
            marker: "!",
        }),
        SaveStatus::Dirty => Some(TabSaveStatusIndicator {
            class_name: "dirty",
            label: "Unsaved changes",
            marker: "*",
        }),
        SaveStatus::Saved if is_dirty => Some(TabSaveStatusIndicator {
            class_name: "dirty",
            label: "Unsaved changes",
            marker: "*",
        }),
        SaveStatus::Saved => None,
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
    let save_status = item.save_status.clone();
    let save_status_attr = save_status_attr(&save_status);
    let status_indicator = tab_save_status_indicator(&save_status, item.is_dirty);
    let has_status_indicator = status_indicator.is_some();
    let status_class = status_indicator
        .as_ref()
        .map(|indicator| indicator.class_name)
        .unwrap_or_default();
    let status_label = status_indicator
        .as_ref()
        .map(|indicator| indicator.label)
        .unwrap_or_default();
    let status_marker = status_indicator
        .as_ref()
        .map(|indicator| indicator.marker)
        .unwrap_or_default();

    rsx! {
        div {
            "data-tab-id": "{item.id}",
            "data-save-status": "{save_status_attr}",
            class: if item.is_active { "mn-tab active" } else { "mn-tab" },
            button {
                class: "mn-tab-title",
                onclick: move |_| commands.activate_tab.call(activate_tab_id.clone()),
                "{item.title}"
                if has_status_indicator {
                    span {
                        class: "mn-tab-save-status {status_class}",
                        title: "{status_label}",
                        aria_label: "{status_label}",
                        "{status_marker}"
                    }
                }
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

fn save_status_attr(save_status: &SaveStatus) -> &'static str {
    match save_status {
        SaveStatus::Saved => "saved",
        SaveStatus::Dirty => "dirty",
        SaveStatus::Saving => "saving",
        SaveStatus::Conflict => "conflict",
        SaveStatus::Failed => "failed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tab_save_status_indicator_prefers_explicit_save_state() {
        assert_eq!(tab_save_status_indicator(&SaveStatus::Saved, false), None);
        assert_eq!(
            tab_save_status_indicator(&SaveStatus::Saved, true),
            Some(TabSaveStatusIndicator {
                class_name: "dirty",
                label: "Unsaved changes",
                marker: "*",
            })
        );
        assert_eq!(
            tab_save_status_indicator(&SaveStatus::Saving, true),
            Some(TabSaveStatusIndicator {
                class_name: "saving",
                label: "Saving",
                marker: "...",
            })
        );
        assert_eq!(
            tab_save_status_indicator(&SaveStatus::Failed, true),
            Some(TabSaveStatusIndicator {
                class_name: "failed",
                label: "Save failed",
                marker: "!",
            })
        );
        assert_eq!(
            tab_save_status_indicator(&SaveStatus::Conflict, true),
            Some(TabSaveStatusIndicator {
                class_name: "conflict",
                label: "File changed outside Papyro",
                marker: "!",
            })
        );
    }
}
