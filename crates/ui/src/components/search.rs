use crate::action_labels::open_note_label;
use crate::commands::{AppCommands, OpenMarkdownTarget};
use crate::components::primitives::{Modal, TextInput};
use crate::context::use_app_context;
use crate::i18n::{i18n_for, use_i18n};
use crate::view_model::SearchResultRowViewModel;
use dioxus::prelude::*;
use papyro_core::{models::AppLanguage, SearchField, SearchHighlight};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HighlightSegment {
    pub text: String,
    pub is_match: bool,
}

#[component]
pub fn SearchModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands.clone();
    let workspace_search_model = app.workspace_search_model.read().clone();
    let mut active_index = use_signal(|| 0usize);

    let query_value = workspace_search_model.query.clone();
    let results = workspace_search_model.results.clone();
    let active = if results.is_empty() {
        0
    } else {
        active_index().min(results.len() - 1)
    };
    let results_for_keys = results.clone();
    let commands_for_keys = commands.clone();
    let empty_message = empty_search_message(
        i18n.language(),
        query_value.as_str(),
        workspace_search_model.is_loading,
        workspace_search_model.error.as_deref(),
    );

    rsx! {
        Modal {
            label: i18n.text("Workspace search", "工作区搜索").to_string(),
            class_name: "mn-modal mn-command-modal".to_string(),
            on_close,
                div { class: "mn-command-search",
                    TextInput {
                        class_name: "mn-command-input".to_string(),
                        autofocus: true,
                        placeholder: i18n.text("Search notes", "搜索笔记").to_string(),
                        value: query_value,
                        on_input: move |value| {
                            active_index.set(0);
                            commands.search_workspace.call(value);
                        },
                        on_keydown: move |event: KeyboardEvent| {
                            match event.key() {
                                Key::Escape => {
                                    event.prevent_default();
                                    on_close.call(());
                                }
                                Key::ArrowDown => {
                                    event.prevent_default();
                                    if !results_for_keys.is_empty() {
                                        active_index.set((active_index() + 1).min(results_for_keys.len() - 1));
                                    }
                                }
                                Key::ArrowUp => {
                                    event.prevent_default();
                                    active_index.set(active_index().saturating_sub(1));
                                }
                                Key::Enter => {
                                    event.prevent_default();
                                    if let Some(result) = results_for_keys.get(active).cloned() {
                                        open_search_result(
                                            commands_for_keys.clone(),
                                            on_close,
                                            result.path,
                                        );
                                    }
                                }
                                _ => {}
                            }
                        },
                    }
                }
                div { class: "mn-command-list",
                    if results.is_empty() {
                        div { class: "mn-command-empty",
                            "{empty_message}"
                        }
                    } else {
                        for index in 0..results.len() {
                            SearchResultRow {
                                result: results[index].clone(),
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
fn SearchResultRow(
    result: SearchResultRowViewModel,
    is_active: bool,
    commands: AppCommands,
    on_close: EventHandler<()>,
) -> Element {
    let i18n = use_i18n();
    let path_for_click = result.path.clone();
    let preview = result.preview.clone();
    let open_label = open_note_label(i18n.language(), &result.title);
    let badge = preview
        .as_ref()
        .map(|result_match| field_label(i18n.language(), result_match.field))
        .unwrap_or("MD");

    rsx! {
        button {
            class: if is_active { "mn-command-row mn-search-row active" } else { "mn-command-row mn-search-row" },
            "aria-label": "{open_label}",
            onclick: move |_| {
                open_search_result(
                    commands.clone(),
                    on_close,
                    path_for_click.clone(),
                );
            },
            span { class: "mn-command-row-main",
                span { class: "mn-command-title",
                    HighlightedText {
                        text: result.title.clone(),
                        highlights: result.title_highlights.clone(),
                    }
                }
                span { class: "mn-command-path",
                    HighlightedText {
                        text: result.relative_path_label.clone(),
                        highlights: result.path_highlights.clone(),
                    }
                }
                if let Some(result_match) = preview {
                    span { class: "mn-search-snippet",
                        if let Some(line) = result_match.line {
                            span { class: "mn-search-line", "L{line}" }
                        }
                        span { class: "mn-search-excerpt",
                            HighlightedText {
                                text: result_match.snippet,
                                highlights: result_match.highlights,
                            }
                        }
                    }
                }
            }
            span { class: "mn-command-kind", "{badge}" }
        }
    }
}

#[component]
fn HighlightedText(text: String, highlights: Vec<SearchHighlight>) -> Element {
    let segments = highlighted_segments(&text, &highlights);

    rsx! {
        for segment in segments {
            if segment.is_match {
                mark { class: "mn-search-highlight", "{segment.text}" }
            } else {
                span { "{segment.text}" }
            }
        }
    }
}

fn open_search_result(commands: AppCommands, on_close: EventHandler<()>, path: PathBuf) {
    commands.open_markdown.call(OpenMarkdownTarget { path });
    on_close.call(());
}

fn empty_search_message(
    language: AppLanguage,
    query: &str,
    is_loading: bool,
    error: Option<&str>,
) -> String {
    let i18n = i18n_for(language);
    if query.trim().is_empty() {
        return i18n.text("Ready", "就绪").to_string();
    }

    if is_loading {
        return i18n
            .text("Searching notes...", "正在搜索笔记...")
            .to_string();
    }

    if let Some(error) = error {
        return error.to_string();
    }

    i18n.text("No matching notes", "没有匹配的笔记").to_string()
}

fn field_label(language: AppLanguage, field: SearchField) -> &'static str {
    i18n_for(language).search_field_label(field)
}

pub(crate) fn highlighted_segments(
    value: &str,
    highlights: &[SearchHighlight],
) -> Vec<HighlightSegment> {
    let mut normalized = highlights
        .iter()
        .filter(|highlight| {
            highlight.start < highlight.end
                && highlight.end <= value.len()
                && value.is_char_boundary(highlight.start)
                && value.is_char_boundary(highlight.end)
        })
        .copied()
        .collect::<Vec<_>>();
    normalized.sort_by_key(|highlight| highlight.start);

    let mut merged: Vec<SearchHighlight> = Vec::new();
    for highlight in normalized {
        if let Some(previous) = merged.last_mut() {
            if highlight.start <= previous.end {
                previous.end = previous.end.max(highlight.end);
                continue;
            }
        }

        merged.push(highlight);
    }

    if merged.is_empty() {
        return vec![HighlightSegment {
            text: value.to_string(),
            is_match: false,
        }];
    }

    let mut cursor = 0;
    let mut segments = Vec::new();
    for highlight in merged {
        if cursor < highlight.start {
            segments.push(HighlightSegment {
                text: value[cursor..highlight.start].to_string(),
                is_match: false,
            });
        }

        segments.push(HighlightSegment {
            text: value[highlight.start..highlight.end].to_string(),
            is_match: true,
        });
        cursor = highlight.end;
    }

    if cursor < value.len() {
        segments.push(HighlightSegment {
            text: value[cursor..].to_string(),
            is_match: false,
        });
    }

    segments
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::AppLanguage;

    #[test]
    fn highlighted_segments_split_plain_and_matched_text() {
        assert_eq!(
            highlighted_segments(
                "release search plan",
                &[
                    SearchHighlight { start: 0, end: 7 },
                    SearchHighlight { start: 8, end: 14 },
                ],
            ),
            vec![
                HighlightSegment {
                    text: "release".to_string(),
                    is_match: true,
                },
                HighlightSegment {
                    text: " ".to_string(),
                    is_match: false,
                },
                HighlightSegment {
                    text: "search".to_string(),
                    is_match: true,
                },
                HighlightSegment {
                    text: " plan".to_string(),
                    is_match: false,
                },
            ]
        );
    }

    #[test]
    fn highlighted_segments_merge_overlapping_ranges() {
        assert_eq!(
            highlighted_segments(
                "release",
                &[
                    SearchHighlight { start: 0, end: 4 },
                    SearchHighlight { start: 3, end: 7 },
                ],
            ),
            vec![HighlightSegment {
                text: "release".to_string(),
                is_match: true,
            }]
        );
    }

    #[test]
    fn highlighted_segments_ignore_invalid_boundaries() {
        assert_eq!(
            highlighted_segments("计划", &[SearchHighlight { start: 1, end: 2 }]),
            vec![HighlightSegment {
                text: "计划".to_string(),
                is_match: false,
            }]
        );
    }

    #[test]
    fn field_label_names_search_match_sources() {
        assert_eq!(field_label(AppLanguage::English, SearchField::Body), "BODY");
        assert_eq!(
            field_label(AppLanguage::Chinese, SearchField::Title),
            "标题"
        );
    }
}
