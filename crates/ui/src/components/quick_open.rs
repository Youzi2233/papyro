use crate::action_labels::open_note_label;
use crate::commands::{AppCommands, OpenMarkdownTarget};
use crate::components::primitives::{Modal, TextInput};
use crate::context::use_app_context;
use crate::view_model::QuickOpenItemViewModel;
use dioxus::prelude::*;

const QUICK_OPEN_LIMIT: usize = 24;

#[component]
pub fn QuickOpenModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let quick_open_items = app.quick_open_items;
    let commands = app.commands.clone();
    let mut query = use_signal(String::new);
    let mut active_index = use_signal(|| 0usize);

    let query_value = query();
    let all_items = quick_open_items.read().clone();
    let filtered = filter_quick_open_items(&all_items, &query_value);
    let active = if filtered.is_empty() {
        0
    } else {
        active_index().min(filtered.len() - 1)
    };
    let filtered_for_keys = filtered.clone();
    let commands_for_keys = commands.clone();

    rsx! {
        Modal {
            label: "Quick open",
            class_name: "mn-modal mn-command-modal",
            on_close,
                div { class: "mn-command-search",
                    TextInput {
                        class_name: "mn-command-input",
                        autofocus: true,
                        placeholder: "Open note",
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
                                    if let Some(item) = filtered_for_keys.get(active).cloned() {
                                        open_quick_item(
                                            commands_for_keys.clone(),
                                            on_close,
                                            item,
                                        );
                                    }
                                }
                                _ => {}
                            }
                        },
                    }
                }
                div { class: "mn-command-list",
                    if filtered.is_empty() {
                        div { class: "mn-command-empty",
                            if all_items.is_empty() {
                                "No notes in this workspace"
                            } else {
                                "No matching notes"
                            }
                        }
                    } else {
                        for index in 0..filtered.len().min(QUICK_OPEN_LIMIT) {
                            QuickOpenRow {
                                item: filtered[index].clone(),
                                is_active: index == active,
                                commands: commands.clone(),
                                on_close,
                            }
                        }
                    }
                }
        }
    }
}

#[component]
fn QuickOpenRow(
    item: QuickOpenItemViewModel,
    is_active: bool,
    commands: AppCommands,
    on_close: EventHandler<()>,
) -> Element {
    let item_for_click = item.clone();
    let open_label = open_note_label(&item.title);

    rsx! {
        button {
            class: if is_active { "mn-command-row active" } else { "mn-command-row" },
            "aria-label": "{open_label}",
            onclick: move |_| {
                open_quick_item(commands.clone(), on_close, item_for_click.clone());
            },
            span { class: "mn-command-row-main",
                span { class: "mn-command-title", "{item.title}" }
                span { class: "mn-command-path", "{item.path_label}" }
            }
            span { class: "mn-command-kind", "MD" }
        }
    }
}

fn open_quick_item(
    commands: AppCommands,
    on_close: EventHandler<()>,
    item: QuickOpenItemViewModel,
) {
    commands
        .open_markdown
        .call(OpenMarkdownTarget { path: item.path });
    on_close.call(());
}

pub(crate) fn filter_quick_open_items(
    items: &[QuickOpenItemViewModel],
    query: &str,
) -> Vec<QuickOpenItemViewModel> {
    let tokens = query
        .split_whitespace()
        .map(str::to_lowercase)
        .collect::<Vec<_>>();

    items
        .iter()
        .filter(|item| {
            if tokens.is_empty() {
                return true;
            }

            let haystack = format!("{} {}", item.title, item.path_label).to_lowercase();
            tokens.iter().all(|token| haystack.contains(token))
        })
        .take(QUICK_OPEN_LIMIT)
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn quick_open_filter_matches_title_and_path_tokens() {
        let items = vec![
            QuickOpenItemViewModel {
                path: PathBuf::from("workspace/journal/today.md"),
                title: "today".to_string(),
                path_label: "journal/today.md".to_string(),
            },
            QuickOpenItemViewModel {
                path: PathBuf::from("workspace/work/release-plan.md"),
                title: "release-plan".to_string(),
                path_label: "work/release-plan.md".to_string(),
            },
        ];

        assert_eq!(
            filter_quick_open_items(&items, "work plan")
                .iter()
                .map(|item| item.title.as_str())
                .collect::<Vec<_>>(),
            vec!["release-plan"]
        );
        assert!(filter_quick_open_items(&items, "missing").is_empty());
    }
}
