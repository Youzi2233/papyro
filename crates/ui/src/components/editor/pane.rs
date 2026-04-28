use super::bridge::{perf_enabled, send_editor_destroy_batch, EditorBridgeMap, RetiredEditorHosts};
use super::document_cache::{DocumentDerivedCache, DocumentDerivedCacheState};
use super::host::EditorHost;
use super::outline::OutlinePane;
use super::preview::PreviewPane;
use super::tabbar::EditorTabButton;
use crate::components::primitives::{EmptyState, SegmentedControl, SegmentedControlOption};
use crate::context::use_app_context;
use crate::view_model::EditorSurfaceViewModel;
use dioxus::prelude::*;
use papyro_core::models::{EditorTab, ViewMode};
use papyro_core::{EditorTabs, TabContentSnapshot, TabContentsMap};
use std::collections::HashMap;
use std::time::Instant;

const WARM_EDITOR_HOST_LIMIT: usize = 2;

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
    fn from_surface_model(model: &EditorSurfaceViewModel) -> Self {
        Self {
            font_family: model.font_family.clone(),
            font_size: model.font_size,
            line_height: model.line_height,
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
    let mut tracked_host_ids = bounded_host_ids(&open_tab_ids, active_tab_id.as_deref());

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

fn bounded_host_ids(open_tab_ids: &[String], active_tab_id: Option<&str>) -> Vec<String> {
    let mut ids = Vec::new();
    if let Some(active_tab_id) = active_tab_id {
        if open_tab_ids.iter().any(|id| id == active_tab_id) {
            ids.push(active_tab_id.to_string());
        }
    }

    for tab_id in open_tab_ids.iter().rev() {
        if Some(tab_id.as_str()) == active_tab_id || ids.iter().any(|id| id == tab_id) {
            continue;
        }
        ids.push(tab_id.clone());
        if ids.len() >= WARM_EDITOR_HOST_LIMIT + usize::from(active_tab_id.is_some()) {
            break;
        }
    }

    ids
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
    let surface_model = app.editor_surface_model.read().clone();
    let view_mode = surface_model.view_mode.clone();
    let editor_typography = EditorTypography::from_surface_model(&surface_model);
    let auto_link_paste = surface_model.auto_link_paste;
    let outline_visible = surface_model.outline_visible;
    let editor_style = editor_style(&editor_typography);
    let bridges: EditorBridgeMap = use_context_provider(|| Signal::new(HashMap::new()));
    let _document_cache: DocumentDerivedCache =
        use_context_provider(DocumentDerivedCacheState::shared);
    let mut retired_hosts: RetiredEditorHosts = use_context_provider(|| Signal::new(Vec::new()));
    let pane_model = use_memo(move || {
        let retired_host_ids = retired_hosts.read().clone();
        editor_pane_model(&editor_tabs.read(), &tab_contents.read(), &retired_host_ids)
    });
    let pane = pane_model();

    use_effect(use_reactive(
        (&pane.host_items, &pane.open_tab_ids),
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
            tab_count = pane.open_tab_ids.len(),
            host_count = pane.host_items.len(),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor pane render prep"
        );
    }

    rsx! {
        main { class: "mn-editor", style: "{editor_style}",
            if pane.active_tab.is_some() {
                div { class: "mn-tabbar",
                    for item in pane.tabs.iter().cloned() {
                        EditorTabButton {
                            key: "{item.id}",
                            is_active: Some(&item.id) == pane.active_tab_id.as_ref(),
                            tab: item,
                        }
                    }
                    div { class: "mn-tabbar-spacer" }
                    ViewToggle {
                        view_mode: view_mode.clone(),
                        on_change: move |mode| {
                            crate::chrome::set_view_mode(
                                ui_state,
                                commands.clone(),
                                mode,
                                "tabbar",
                            );
                        },
                    }
                }
                section { class: "mn-document",
                    div { class: "mn-document-main",
                        div {
                            class: if view_mode == ViewMode::Preview { "mn-editor-edit hidden" } else { "mn-editor-edit" },
                            div { class: "mn-editor-hosts",
                                for host in pane.host_items.clone() {
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
                                active_document: pane.active_document.clone(),
                                editor_services,
                            }
                        }
                        if outline_visible {
                            OutlinePane {
                                active_document: pane.active_document.clone(),
                            }
                        }
                    }
                }
            } else {
                EmptyState {
                    title: "Open a note to start editing",
                    description: "Select a file from the sidebar, or create a new note with the New button.",
                }
                if !pane.host_items.is_empty() {
                    div { class: "mn-editor-retired-hosts",
                        for host in pane.host_items.clone() {
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
    fn editor_pane_model_bounds_live_hosts_independent_of_open_tab_count() {
        let mut editor_tabs = EditorTabs::default();
        let mut tab_contents = TabContentsMap::default();
        for id in ["a", "b", "c", "d", "e"] {
            editor_tabs.open_tab(tab(id));
            tab_contents.insert_tab(id.to_string(), format!("# {id}"), DocumentStats::default());
        }
        editor_tabs.set_active_tab("b");

        let model = editor_pane_model(&editor_tabs, &tab_contents, &["closed".to_string()]);

        assert_eq!(
            model.open_tab_ids,
            vec![
                "a".to_string(),
                "b".to_string(),
                "c".to_string(),
                "d".to_string(),
                "e".to_string(),
            ]
        );
        assert_eq!(
            model.host_items,
            vec![
                EditorHostItem {
                    tab_id: "b".to_string(),
                    is_active: true,
                },
                EditorHostItem {
                    tab_id: "e".to_string(),
                    is_active: false,
                },
                EditorHostItem {
                    tab_id: "d".to_string(),
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
        let surface = EditorSurfaceViewModel {
            view_mode: ViewMode::Source,
            font_family: "\"Aptos\", sans-serif".to_string(),
            font_size: 18,
            line_height: 1.7,
            auto_link_paste: true,
            outline_visible: false,
        };
        let typography = EditorTypography::from_surface_model(&surface);

        assert!(editor_style(&typography).contains("--mn-editor-font-size: 18px"));
        assert!(!editor_style(&typography).contains("sidebar"));
        assert_eq!(before, editor_pane_model(&editor_tabs, &tab_contents, &[]));
    }
}
