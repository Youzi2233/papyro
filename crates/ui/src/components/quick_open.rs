use crate::commands::AppCommands;
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::{FileNode, FileNodeKind};
use papyro_core::FileState;

const QUICK_OPEN_LIMIT: usize = 24;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct QuickOpenItem {
    pub node: FileNode,
    pub title: String,
    pub path: String,
}

#[component]
pub fn QuickOpenModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let file_state = app.file_state;
    let commands = app.commands.clone();
    let mut query = use_signal(String::new);
    let mut active_index = use_signal(|| 0usize);

    let all_items = collect_quick_open_items(&file_state.read().file_tree);
    let query_value = query();
    let filtered = filter_quick_open_items(&all_items, &query_value);
    let active = if filtered.is_empty() {
        0
    } else {
        active_index().min(filtered.len() - 1)
    };
    let filtered_for_keys = filtered.clone();
    let commands_for_keys = commands.clone();

    rsx! {
        div { class: "mn-modal-overlay", onclick: move |_| on_close.call(()),
            div { class: "mn-modal mn-command-modal", onclick: move |e| e.stop_propagation(),
                div { class: "mn-command-search",
                    input {
                        class: "mn-command-input",
                        autofocus: true,
                        placeholder: "Open note",
                        value: "{query_value}",
                        oninput: move |event| {
                            query.set(event.value());
                            active_index.set(0);
                        },
                        onkeydown: move |event| {
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
                                            file_state,
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
                                file_state,
                                commands: commands.clone(),
                                on_close,
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn QuickOpenRow(
    item: QuickOpenItem,
    is_active: bool,
    file_state: Signal<FileState>,
    commands: AppCommands,
    on_close: EventHandler<()>,
) -> Element {
    let item_for_click = item.clone();

    rsx! {
        button {
            class: if is_active { "mn-command-row active" } else { "mn-command-row" },
            onclick: move |_| {
                open_quick_item(file_state, commands.clone(), on_close, item_for_click.clone());
            },
            span { class: "mn-command-row-main",
                span { class: "mn-command-title", "{item.title}" }
                span { class: "mn-command-path", "{item.path}" }
            }
            span { class: "mn-command-kind", "MD" }
        }
    }
}

fn open_quick_item(
    mut file_state: Signal<FileState>,
    commands: AppCommands,
    on_close: EventHandler<()>,
    item: QuickOpenItem,
) {
    file_state.write().select_path(item.node.path.clone());
    commands.open_note.call(item.node);
    on_close.call(());
}

pub(crate) fn collect_quick_open_items(nodes: &[FileNode]) -> Vec<QuickOpenItem> {
    let mut items = Vec::new();
    collect_quick_open_items_into(nodes, &mut items);
    items.sort_by(|left, right| left.path.cmp(&right.path));
    items
}

fn collect_quick_open_items_into(nodes: &[FileNode], items: &mut Vec<QuickOpenItem>) {
    for node in nodes {
        match &node.kind {
            FileNodeKind::Directory { children } => {
                collect_quick_open_items_into(children, items);
            }
            FileNodeKind::Note { .. } => items.push(QuickOpenItem {
                node: node.clone(),
                title: node.name.trim_end_matches(".md").to_string(),
                path: node.relative_path.to_string_lossy().replace('\\', "/"),
            }),
        }
    }
}

pub(crate) fn filter_quick_open_items(items: &[QuickOpenItem], query: &str) -> Vec<QuickOpenItem> {
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

            let haystack = format!("{} {}", item.title, item.path).to_lowercase();
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

    fn note(name: &str, relative_path: &str) -> FileNode {
        FileNode {
            name: name.to_string(),
            path: PathBuf::from(format!("workspace/{relative_path}")),
            relative_path: PathBuf::from(relative_path),
            kind: FileNodeKind::Note { note_id: None },
        }
    }

    fn directory(name: &str, children: Vec<FileNode>) -> FileNode {
        FileNode {
            name: name.to_string(),
            path: PathBuf::from(format!("workspace/{name}")),
            relative_path: PathBuf::from(name),
            kind: FileNodeKind::Directory { children },
        }
    }

    #[test]
    fn quick_open_items_flatten_nested_notes() {
        let items = collect_quick_open_items(&[
            directory(
                "journal",
                vec![
                    note("today.md", "journal/today.md"),
                    note("ideas.md", "journal/ideas.md"),
                ],
            ),
            note("root.md", "root.md"),
        ]);

        assert_eq!(
            items
                .iter()
                .map(|item| item.path.as_str())
                .collect::<Vec<_>>(),
            vec!["journal/ideas.md", "journal/today.md", "root.md"]
        );
        assert_eq!(items[0].title, "ideas");
    }

    #[test]
    fn quick_open_filter_matches_title_and_path_tokens() {
        let items = collect_quick_open_items(&[
            note("today.md", "journal/today.md"),
            note("release-plan.md", "work/release-plan.md"),
        ]);

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
