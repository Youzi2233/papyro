use super::bridge::{perf_enabled, send_editor_destroy_batch, EditorBridgeMap};
use super::document_cache::{DocumentDerivedCache, DocumentDerivedCacheState};
use super::host::EditorHost;
use super::outline::OutlinePane;
use super::preview::PreviewPane;
use super::tabbar::EditorTabButton;
use crate::components::primitives::{EmptyState, SegmentedControl, SegmentedControlOption};
use crate::context::use_app_context;
use crate::perf::{perf_timer, trace_editor_host_lifecycle};
use crate::view_model::{EditorHostItemViewModel, EditorSurfaceViewModel};
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
    let mut host_lifecycle_state = use_signal(HashMap::<String, bool>::new);
    let pane = pane_model();

    use_effect(use_reactive((&pane.host_items,), move |(host_items,)| {
        let perf_started_at = perf_enabled().then(Instant::now);
        let host_lifecycle_started_at = perf_timer();
        let lifecycle_change =
            host_lifecycle_change(&host_lifecycle_state.peek(), host_items.as_slice());
        if lifecycle_change.has_changes() {
            trace_editor_host_lifecycle(
                lifecycle_change.active_tab_id.as_deref(),
                lifecycle_change.host_count,
                &lifecycle_change.created,
                &lifecycle_change.restored,
                &lifecycle_change.hidden,
                &lifecycle_change.retired,
                host_lifecycle_started_at,
            );
        }
        host_lifecycle_state.set(host_lifecycle_map(host_items.as_slice()));

        let valid: std::collections::HashSet<String> =
            host_items.into_iter().map(|item| item.tab_id).collect();
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
                                            view_mode: host_runtime_view_mode(host.is_active, &view_mode),
                                            auto_link_paste: host_runtime_auto_link_paste(
                                                host.is_active,
                                                auto_link_paste,
                                            ),
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
                                    view_mode: host_runtime_view_mode(false, &view_mode),
                                    auto_link_paste: host_runtime_auto_link_paste(
                                        false,
                                        auto_link_paste,
                                    ),
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct HostLifecycleChange {
    active_tab_id: Option<String>,
    host_count: usize,
    created: Vec<String>,
    restored: Vec<String>,
    hidden: Vec<String>,
    retired: Vec<String>,
}

impl HostLifecycleChange {
    fn has_changes(&self) -> bool {
        !self.created.is_empty()
            || !self.restored.is_empty()
            || !self.hidden.is_empty()
            || !self.retired.is_empty()
    }
}

fn host_lifecycle_change(
    previous: &HashMap<String, bool>,
    current: &[EditorHostItemViewModel],
) -> HostLifecycleChange {
    let current_map = host_lifecycle_map(current);
    let mut change = HostLifecycleChange {
        active_tab_id: current
            .iter()
            .find(|host| host.is_active)
            .map(|host| host.tab_id.clone()),
        host_count: current.len(),
        ..HostLifecycleChange::default()
    };

    for host in current {
        match previous.get(&host.tab_id) {
            None => change.created.push(host.tab_id.clone()),
            Some(was_active) if *was_active && !host.is_active => {
                change.hidden.push(host.tab_id.clone());
            }
            Some(was_active) if !*was_active && host.is_active => {
                change.restored.push(host.tab_id.clone());
            }
            Some(_) => {}
        }
    }

    for tab_id in previous.keys() {
        if !current_map.contains_key(tab_id) {
            change.retired.push(tab_id.clone());
        }
    }

    change
}

fn host_lifecycle_map(current: &[EditorHostItemViewModel]) -> HashMap<String, bool> {
    current
        .iter()
        .map(|host| (host.tab_id.clone(), host.is_active))
        .collect()
}

fn host_runtime_view_mode(is_active: bool, view_mode: &ViewMode) -> ViewMode {
    if is_active {
        view_mode.clone()
    } else {
        ViewMode::Source
    }
}

fn host_runtime_auto_link_paste(is_active: bool, auto_link_paste: bool) -> bool {
    is_active && auto_link_paste
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

    fn host_item(tab_id: &str, is_active: bool) -> EditorHostItemViewModel {
        EditorHostItemViewModel {
            tab_id: tab_id.to_string(),
            is_active,
            initial_content: Default::default(),
        }
    }

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

    #[test]
    fn host_lifecycle_change_tracks_create_hide_restore_and_retire() {
        let previous = HashMap::from([
            ("a".to_string(), true),
            ("b".to_string(), false),
            ("old".to_string(), false),
        ]);
        let current = vec![
            host_item("b", true),
            host_item("a", false),
            host_item("c", false),
        ];

        let change = host_lifecycle_change(&previous, &current);

        assert_eq!(change.active_tab_id.as_deref(), Some("b"));
        assert_eq!(change.host_count, 3);
        assert_eq!(change.created, vec!["c".to_string()]);
        assert_eq!(change.restored, vec!["b".to_string()]);
        assert_eq!(change.hidden, vec!["a".to_string()]);
        assert_eq!(change.retired, vec!["old".to_string()]);
        assert!(change.has_changes());
    }

    #[test]
    fn host_lifecycle_change_is_empty_for_stable_pool() {
        let previous = HashMap::from([("a".to_string(), true), ("b".to_string(), false)]);
        let current = vec![host_item("a", true), host_item("b", false)];

        let change = host_lifecycle_change(&previous, &current);

        assert!(!change.has_changes());
    }

    #[test]
    fn hidden_host_runtime_inputs_ignore_editor_preferences() {
        assert_eq!(
            host_runtime_view_mode(false, &ViewMode::Preview),
            ViewMode::Source
        );
        assert!(!host_runtime_auto_link_paste(false, true));
    }

    #[test]
    fn active_host_runtime_inputs_track_editor_preferences() {
        assert_eq!(
            host_runtime_view_mode(true, &ViewMode::Preview),
            ViewMode::Preview
        );
        assert!(host_runtime_auto_link_paste(true, true));
        assert!(!host_runtime_auto_link_paste(true, false));
    }
}
