use super::bridge::{perf_enabled, send_editor_destroy_batch, EditorBridgeMap, RetiredEditorHosts};
use super::document_cache::{DocumentDerivedCache, DocumentDerivedCacheState};
use super::host::EditorHost;
use super::outline::OutlinePane;
use super::preview::PreviewPane;
use super::tabbar::EditorTabButton;
use super::toolbar::EditorToolbar;
use crate::components::primitives::{EmptyState, SegmentedControl, SegmentedControlOption};
use crate::context::use_app_context;
use crate::perf::{perf_timer, trace_view_mode_change};
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, EditorTab, ViewMode};
use papyro_core::{EditorTabs, TabContentSnapshot, TabContentsMap};
use std::collections::HashMap;
use std::time::Instant;

#[derive(Debug, Clone, PartialEq)]
struct EditorPaneModel {
    active_tab: Option<EditorTab>,
    active_tab_id: Option<String>,
    active_document: Option<TabContentSnapshot>,
    tabs: Vec<EditorTab>,
    open_tab_ids: Vec<String>,
    host_items: Vec<EditorHostItem>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EditorHostItem {
    tab_id: String,
    is_active: bool,
}

#[derive(Debug, Clone, PartialEq)]
struct EditorTypography {
    font_family: String,
    font_size: u8,
    line_height: f32,
}

impl EditorTypography {
    fn from_settings(settings: &AppSettings) -> Self {
        Self {
            font_family: settings.font_family.clone(),
            font_size: settings.font_size,
            line_height: settings.line_height,
        }
    }
}

fn editor_pane_model(
    editor_tabs: &EditorTabs,
    tab_contents: &TabContentsMap,
    retired_host_ids: &[String],
) -> EditorPaneModel {
    let active_tab = editor_tabs.active_tab().cloned();
    let active_tab_id = editor_tabs.active_tab_id.clone();
    let tabs = editor_tabs.tabs.clone();
    let open_tab_ids: Vec<String> = editor_tabs.tabs.iter().map(|tab| tab.id.clone()).collect();
    let mut tracked_host_ids = open_tab_ids.clone();

    for retired_id in retired_host_ids {
        if !tracked_host_ids.iter().any(|id| id == retired_id) {
            tracked_host_ids.push(retired_id.clone());
        }
    }

    let active_document = active_tab_id
        .as_deref()
        .and_then(|id| tab_contents.snapshot_for_tab(id));
    let host_items = tracked_host_ids
        .into_iter()
        .map(|tab_id| EditorHostItem {
            is_active: Some(&tab_id) == active_tab_id.as_ref(),
            tab_id,
        })
        .collect();

    EditorPaneModel {
        active_tab,
        active_tab_id,
        active_document,
        tabs,
        open_tab_ids,
        host_items,
    }
}

fn editor_style(typography: &EditorTypography) -> String {
    format!(
        "--mn-editor-font: {}; --mn-editor-font-size: {}px; --mn-editor-line-height: {}; --mn-markdown-body-size: {}px; --mn-markdown-line-height: {};",
        typography.font_family,
        typography.font_size,
        typography.line_height,
        typography.font_size,
        typography.line_height
    )
}

#[component]
pub fn EditorPane() -> Element {
    let perf_started_at = perf_enabled().then(Instant::now);
    let app = use_app_context();
    let editor_tabs = app.editor_tabs;
    let tab_contents = app.tab_contents;
    let editor_services = app.editor_services;
    let ui_state = app.ui_state;
    let commands = app.commands;
    let mut format_tools_open = use_signal(|| false);

    let (view_mode, editor_typography, auto_link_paste, outline_visible) = {
        let state = ui_state.read();
        (
            state.view_mode.clone(),
            EditorTypography::from_settings(&state.settings),
            state.settings.auto_link_paste,
            state.outline_visible(),
        )
    };
    let editor_style = editor_style(&editor_typography);
    let bridges: EditorBridgeMap = use_context_provider(|| Signal::new(HashMap::new()));
    let _document_cache: DocumentDerivedCache =
        use_context_provider(DocumentDerivedCacheState::shared);
    let mut retired_hosts: RetiredEditorHosts = use_context_provider(|| Signal::new(Vec::new()));
    let retired_host_ids = retired_hosts.read().clone();
    let pane_model =
        editor_pane_model(&editor_tabs.read(), &tab_contents.read(), &retired_host_ids);

    use_effect(use_reactive((&view_mode,), move |(view_mode,)| {
        if !view_mode.is_editable() {
            format_tools_open.set(false);
        }
    }));

    use_effect(use_reactive(
        (&pane_model.host_items, &pane_model.open_tab_ids),
        move |(ids, open_ids)| {
            let perf_started_at = perf_enabled().then(Instant::now);
            let valid: std::collections::HashSet<String> =
                ids.into_iter().map(|item| item.tab_id).collect();
            let stale: Vec<String> = bridges
                .peek()
                .keys()
                .filter(|key| !valid.contains(key.as_str()))
                .cloned()
                .collect();

            if stale.is_empty() {
                // Even when no bridges are stale, drain retired hosts whose
                // tabs no longer exist so the list doesn't grow forever.
                let open: std::collections::HashSet<String> = open_ids.into_iter().collect();
                retired_hosts.with_mut(|ids| ids.retain(|id| open.contains(id)));
                return;
            }

            let retired_bridges = {
                let mut bridges = bridges;
                let mut map = bridges.write();
                stale.iter().filter_map(|id| map.remove(id)).collect()
            };
            send_editor_destroy_batch(retired_bridges);

            // Drain retired entries whose bridges have just been destroyed.
            let destroyed: std::collections::HashSet<&String> = stale.iter().collect();
            retired_hosts.with_mut(|ids| ids.retain(|id| !destroyed.contains(id)));

            if let Some(started_at) = perf_started_at {
                tracing::info!(
                    elapsed_ms = started_at.elapsed().as_millis(),
                    "perf editor stale bridge cleanup"
                );
            }
        },
    ));

    if let Some(started_at) = perf_started_at {
        tracing::info!(
            tab_count = pane_model.open_tab_ids.len(),
            host_count = pane_model.host_items.len(),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor pane render prep"
        );
    }

    rsx! {
        main { class: "mn-editor", style: "{editor_style}",
            if let Some(tab) = pane_model.active_tab.clone() {
                div { class: "mn-tabbar",
                    for item in pane_model.tabs.iter().cloned() {
                        EditorTabButton {
                            key: "{item.id}",
                            is_active: Some(&item.id) == pane_model.active_tab_id.as_ref(),
                            tab: item,
                        }
                    }
                    div { class: "mn-tabbar-spacer" }
                    if view_mode.is_editable() {
                        FormatMenu {
                            active_tab_id: tab.id.clone(),
                            is_open: format_tools_open(),
                            on_toggle: move |_| {
                                format_tools_open.set(!format_tools_open());
                            },
                        }
                    }
                    ViewToggle {
                        view_mode: view_mode.clone(),
                        on_change: move |mode| {
                            let mut settings = ui_state.read().settings.clone();
                            let previous_mode = settings.view_mode.clone();
                            let started_at = perf_timer();
                            settings.view_mode = mode;
                            trace_view_mode_change(
                                "toolbar",
                                &previous_mode,
                                &settings.view_mode,
                                started_at,
                            );
                            commands.save_settings.call(settings);
                        },
                    }
                }
                section { class: "mn-document",
                    div { class: "mn-document-main",
                        div {
                            class: if view_mode == ViewMode::Preview { "mn-editor-edit hidden" } else { "mn-editor-edit" },
                            div { class: "mn-editor-hosts",
                                for host in pane_model.host_items.clone() {
                                    div {
                                        key: "{host.tab_id}",
                                        "data-tab-id": "{host.tab_id}",
                                        class: if host.is_active { "mn-editor-host-slot" } else { "mn-editor-host-slot hidden" },
                                        EditorHost {
                                            tab_id: host.tab_id.clone(),
                                            is_visible: host.is_active && view_mode.is_editable(),
                                            view_mode: view_mode.clone(),
                                            auto_link_paste,
                                        }
                                    }
                                }
                            }
                        }
                        if view_mode == ViewMode::Preview {
                            PreviewPane {
                                active_document: pane_model.active_document.clone(),
                                editor_services,
                            }
                        }
                        if outline_visible {
                            OutlinePane {
                                active_document: pane_model.active_document.clone(),
                            }
                        }
                    }
                }
            } else {
                EmptyState {
                    title: "Open a note to start editing",
                    description: "Select a file from the sidebar, or create a new note with the New button.",
                }
                if !pane_model.host_items.is_empty() {
                    div { class: "mn-editor-retired-hosts",
                        for host in pane_model.host_items.clone() {
                            div {
                                key: "{host.tab_id}",
                                "data-tab-id": "{host.tab_id}",
                                class: "mn-editor-host-slot hidden",
                                EditorHost {
                                    tab_id: host.tab_id.clone(),
                                    is_visible: false,
                                    view_mode: view_mode.clone(),
                                    auto_link_paste,
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn FormatMenu(active_tab_id: String, is_open: bool, on_toggle: EventHandler<()>) -> Element {
    rsx! {
        div { class: "mn-format-menu",
            button {
                class: format_toggle_class(is_open),
                title: if is_open { "Hide formatting tools" } else { "Show formatting tools" },
                "aria-label": if is_open { "Hide formatting tools" } else { "Show formatting tools" },
                "aria-expanded": if is_open { "true" } else { "false" },
                onclick: move |_| on_toggle.call(()),
                "Format"
            }
            if is_open {
                div { class: "mn-format-panel",
                    EditorToolbar { active_tab_id: active_tab_id.clone() }
                }
            }
        }
    }
}

fn format_toggle_class(is_open: bool) -> &'static str {
    if is_open {
        "mn-format-toggle active"
    } else {
        "mn-format-toggle"
    }
}

#[component]
fn ViewToggle(view_mode: ViewMode, on_change: EventHandler<ViewMode>) -> Element {
    let selected = view_mode_value(&view_mode).to_string();
    let options = vec![
        SegmentedControlOption::new("Source", "source"),
        SegmentedControlOption::new("Hybrid", "hybrid"),
        SegmentedControlOption::new("Preview", "preview"),
    ];

    rsx! {
        SegmentedControl {
            label: "Editor view mode",
            options,
            selected,
            class_name: "mn-view-toggle",
            on_change: move |value: String| {
                if let Some(mode) = view_mode_from_value(&value) {
                    on_change.call(mode);
                }
            },
        }
    }
}

fn view_mode_value(view_mode: &ViewMode) -> &'static str {
    match view_mode {
        ViewMode::Source => "source",
        ViewMode::Hybrid => "hybrid",
        ViewMode::Preview => "preview",
    }
}

fn view_mode_from_value(value: &str) -> Option<ViewMode> {
    match value {
        "source" => Some(ViewMode::Source),
        "hybrid" => Some(ViewMode::Hybrid),
        "preview" => Some(ViewMode::Preview),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::{DocumentStats, SaveStatus};
    use std::path::PathBuf;

    fn tab(id: &str) -> EditorTab {
        EditorTab {
            id: id.to_string(),
            note_id: format!("note-{id}"),
            title: format!("Note {id}"),
            path: PathBuf::from(format!("{id}.md")),
            is_dirty: false,
            save_status: SaveStatus::Saved,
        }
    }

    #[test]
    fn editor_pane_model_tracks_active_document_and_retired_hosts() {
        let mut editor_tabs = EditorTabs::default();
        editor_tabs.open_tab(tab("a"));
        editor_tabs.open_tab(tab("b"));
        editor_tabs.set_active_tab("a");

        let mut tab_contents = TabContentsMap::default();
        tab_contents.insert_tab("a".to_string(), "# A".to_string(), DocumentStats::default());
        tab_contents.insert_tab("b".to_string(), "# B".to_string(), DocumentStats::default());

        let model = editor_pane_model(&editor_tabs, &tab_contents, &["closed".to_string()]);

        assert_eq!(model.active_tab_id.as_deref(), Some("a"));
        assert_eq!(
            model.active_document.as_ref().map(|document| {
                (
                    document.tab_id.as_str(),
                    document.revision,
                    document.content.as_ref(),
                )
            }),
            Some(("a", 0, "# A"))
        );
        assert_eq!(
            model.host_items,
            vec![
                EditorHostItem {
                    tab_id: "a".to_string(),
                    is_active: true,
                },
                EditorHostItem {
                    tab_id: "b".to_string(),
                    is_active: false,
                },
                EditorHostItem {
                    tab_id: "closed".to_string(),
                    is_active: false,
                },
            ]
        );
    }

    #[test]
    fn editor_pane_model_is_stable_across_settings_changes() {
        let mut editor_tabs = EditorTabs::default();
        editor_tabs.open_tab(tab("a"));

        let mut tab_contents = TabContentsMap::default();
        tab_contents.insert_tab("a".to_string(), "# A".to_string(), DocumentStats::default());

        let before = editor_pane_model(&editor_tabs, &tab_contents, &[]);
        let settings = AppSettings {
            font_size: 18,
            sidebar_width: 360,
            sidebar_collapsed: true,
            ..Default::default()
        };
        let typography = EditorTypography::from_settings(&settings);

        assert!(editor_style(&typography).contains("--mn-editor-font-size: 18px"));
        assert!(!editor_style(&typography).contains("360"));
        assert_eq!(before, editor_pane_model(&editor_tabs, &tab_contents, &[]));
    }

    #[test]
    fn format_toggle_class_marks_active_state() {
        assert_eq!(format_toggle_class(false), "mn-format-toggle");
        assert_eq!(format_toggle_class(true), "mn-format-toggle active");
    }
}
