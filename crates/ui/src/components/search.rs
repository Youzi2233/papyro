use crate::commands::{AppCommands, OpenMarkdownTarget};
use crate::components::primitives::{Modal, TextInput};
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::{SearchField, SearchHighlight, SearchMatch, SearchResult};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HighlightSegment {
    pub text: String,
    pub is_match: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SearchResultRowModel {
    title: String,
    path: PathBuf,
    relative_path_label: String,
    title_highlights: Vec<SearchHighlight>,
    path_highlights: Vec<SearchHighlight>,
    preview: Option<SearchPreviewModel>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SearchPreviewModel {
    field: SearchField,
    line: Option<usize>,
    snippet: String,
    highlights: Vec<SearchHighlight>,
}

impl SearchResultRowModel {
    fn from_result(result: &SearchResult) -> Self {
        Self {
            title: result.title.clone(),
            path: result.path.clone(),
            relative_path_label: result.relative_path.to_string_lossy().replace('\\', "/"),
            title_highlights: highlights_for_field(&result.matches, SearchField::Title),
            path_highlights: highlights_for_field(&result.matches, SearchField::Path),
            preview: preview_match(&result.matches).map(SearchPreviewModel::from_match),
        }
    }
}

impl SearchPreviewModel {
    fn from_match(result_match: SearchMatch) -> Self {
        Self {
            field: result_match.field,
            line: result_match.line,
            snippet: result_match.snippet,
            highlights: result_match.highlights,
        }
    }
}

#[component]
pub fn SearchModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let commands = app.commands.clone();
    let workspace_search = app.workspace_search;
    let mut active_index = use_signal(|| 0usize);

    let state = workspace_search.read().clone();
    let query_value = state.query.clone();
    let results = state
        .results
        .iter()
        .map(SearchResultRowModel::from_result)
        .collect::<Vec<_>>();
    let active = if results.is_empty() {
        0
    } else {
        active_index().min(results.len() - 1)
    };
    let results_for_keys = results.clone();
    let commands_for_keys = commands.clone();
    let empty_message = empty_search_message(
        query_value.as_str(),
        state.is_loading,
        state.error.as_deref(),
    );

    rsx! {
        Modal {
            label: "Workspace search",
            class_name: "mn-modal mn-command-modal",
            on_close,
                div { class: "mn-command-search",
                    TextInput {
                        class_name: "mn-command-input",
                        autofocus: true,
                        placeholder: "Search notes",
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
    result: SearchResultRowModel,
    is_active: bool,
    commands: AppCommands,
    on_close: EventHandler<()>,
) -> Element {
    let path_for_click = result.path.clone();
    let preview = result.preview.clone();
    let badge = preview
        .as_ref()
        .map(|result_match| field_label(result_match.field))
        .unwrap_or("MD");

    rsx! {
        button {
            class: if is_active { "mn-command-row mn-search-row active" } else { "mn-command-row mn-search-row" },
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

fn empty_search_message(query: &str, is_loading: bool, error: Option<&str>) -> String {
    if query.trim().is_empty() {
        return "Ready".to_string();
    }

    if is_loading {
        return "Searching notes...".to_string();
    }

    if let Some(error) = error {
        return error.to_string();
    }

    "No matching notes".to_string()
}

fn preview_match(matches: &[SearchMatch]) -> Option<SearchMatch> {
    matches
        .iter()
        .find(|result_match| result_match.field == SearchField::Body)
        .or_else(|| matches.first())
        .cloned()
}

fn highlights_for_field(matches: &[SearchMatch], field: SearchField) -> Vec<SearchHighlight> {
    matches
        .iter()
        .find(|result_match| result_match.field == field)
        .map(|result_match| result_match.highlights.clone())
        .unwrap_or_default()
}

fn field_label(field: SearchField) -> &'static str {
    match field {
        SearchField::Title => "TITLE",
        SearchField::Path => "PATH",
        SearchField::Body => "BODY",
    }
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
    fn preview_match_uses_storage_supplied_body_snippet() {
        let matches = vec![
            SearchMatch {
                field: SearchField::Title,
                line: None,
                snippet: "Release Plan".to_string(),
                highlights: vec![SearchHighlight { start: 0, end: 7 }],
            },
            SearchMatch {
                field: SearchField::Body,
                line: Some(3),
                snippet: "Ship the search feature safely.".to_string(),
                highlights: vec![SearchHighlight { start: 9, end: 15 }],
            },
        ];

        let preview = preview_match(&matches).unwrap();

        assert_eq!(preview.field, SearchField::Body);
        assert_eq!(preview.line, Some(3));
        assert_eq!(preview.snippet, "Ship the search feature safely.");
    }
}
