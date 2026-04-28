use super::bridge::{perf_enabled, send_editor_destroy_batch, EditorBridgeMap};
use super::document_cache::{DocumentDerivedCache, DocumentDerivedCacheState};
use super::host::EditorHost;
use super::outline::OutlinePane;
use super::preview::PreviewPane;
use super::tabbar::EditorTabButton;
use crate::components::primitives::{EmptyState, SegmentedControl, SegmentedControlOption};
use crate::context::use_app_context;
use crate::view_model::EditorSurfaceViewModel;
use dioxus::prelude::*;
use papyro_core::models::ViewMode;
use std::collections::HashMap;
use std::time::Instant;

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
    let editor_services = app.editor_services;
    let ui_state = app.ui_state;
    let commands = app.commands;
    let pane_model = app.editor_pane_model;
    let surface_model = app.editor_surface_model.read().clone();
    let view_mode = surface_model.view_mode.clone();
    let editor_typography = EditorTypography::from_surface_model(&surface_model);
    let auto_link_paste = surface_model.auto_link_paste;
    let outline_visible = surface_model.outline_visible;
    let editor_style = editor_style(&editor_typography);
    let bridges: EditorBridgeMap = use_context_provider(|| Signal::new(HashMap::new()));
    let _document_cache: DocumentDerivedCache =
        use_context_provider(DocumentDerivedCacheState::shared);
    let pane = pane_model();

    use_effect(use_reactive((&pane.host_items,), move |(ids,)| {
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
            return;
        }

        let retired_bridges = {
            let mut bridges = bridges;
            let mut map = bridges.write();
            stale.iter().filter_map(|id| map.remove(id)).collect()
        };
        send_editor_destroy_batch(retired_bridges);

        if let Some(started_at) = perf_started_at {
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis(),
                "perf editor stale bridge cleanup"
            );
        }
    }));

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
            if pane.has_active_tab {
                div { class: "mn-tabbar",
                    for item in pane.tab_items.iter().cloned() {
                        EditorTabButton {
                            key: "{item.id}",
                            item,
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
                                            initial_content: host.initial_content.clone(),
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
                                    initial_content: host.initial_content.clone(),
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

    #[test]
    fn editor_style_uses_typography_only() {
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
    }
}
