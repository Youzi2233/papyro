use super::bridge::{perf_enabled, send_editor_destroy, EditorBridgeMap, RetiredEditorHosts};
use super::host::EditorHost;
use super::preview::PreviewPane;
use super::tabbar::EditorTabButton;
use super::toolbar::EditorToolbar;
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::ViewMode;
use std::collections::HashMap;
use std::time::Instant;

#[component]
pub fn EditorPane() -> Element {
    let perf_started_at = perf_enabled().then(Instant::now);
    let app = use_app_context();
    let editor_tabs = app.editor_tabs;
    let tab_contents = app.tab_contents;
    let editor_services = app.editor_services;
    let mut ui_state = app.ui_state;

    let active_tab = editor_tabs.read().active_tab().cloned();
    let active_tab_id = editor_tabs.read().active_tab_id.clone();
    let tabs = editor_tabs.read().tabs.clone();
    let view_mode = ui_state.read().view_mode.clone();
    let settings = ui_state.read().settings.clone();
    let auto_save_delay_ms = settings.auto_save_delay_ms;

    let editor_style = format!(
        "--mn-editor-font: {}; --mn-editor-font-size: {}px; --mn-editor-line-height: {};",
        settings.font_family, settings.font_size, settings.line_height
    );
    let bridges: EditorBridgeMap =
        use_context_provider(|| Signal::new(HashMap::<String, dioxus::document::Eval>::new()));
    let mut retired_hosts: RetiredEditorHosts = use_context_provider(|| Signal::new(Vec::new()));
    let retired_host_ids = retired_hosts.read().clone();

    let open_tab_ids: Vec<String> = tabs.iter().map(|t| t.id.clone()).collect();
    let mut tracked_host_ids = open_tab_ids.clone();
    for retired_id in retired_host_ids {
        if !tracked_host_ids.iter().any(|id| id == &retired_id) {
            tracked_host_ids.push(retired_id);
        }
    }

    let host_items: Vec<(String, bool)> = tracked_host_ids
        .iter()
        .map(|id| {
            let is_active = Some(id) == active_tab_id.as_ref();
            (id.clone(), is_active)
        })
        .collect();

    use_effect(use_reactive(
        (&tracked_host_ids, &open_tab_ids),
        move |(ids, open_ids)| {
            let perf_started_at = perf_enabled().then(Instant::now);
            let valid: std::collections::HashSet<String> = ids.into_iter().collect();
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

            let mut bridges = bridges;
            let mut map = bridges.write();
            for id in &stale {
                if let Some(eval) = map.remove(id) {
                    send_editor_destroy(eval);
                }
            }
            drop(map);

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
            tab_count = tabs.len(),
            host_count = host_items.len(),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor pane render prep"
        );
    }

    rsx! {
        main { class: "mn-editor", style: "{editor_style}",
            if let Some(tab) = active_tab {
                div { class: "mn-tabbar",
                    for item in tabs.iter().cloned() {
                        EditorTabButton {
                            key: "{item.id}",
                            is_active: Some(&item.id) == active_tab_id.as_ref(),
                            tab: item,
                        }
                    }
                    div { class: "mn-tabbar-spacer" }
                    if view_mode == ViewMode::Edit {
                        EditorToolbar { active_tab_id: tab.id.clone() }
                        div { class: "mn-toolbar-sep" }
                    }
                    ViewToggle {
                        view_mode: view_mode.clone(),
                        on_change: move |mode| ui_state.write().view_mode = mode,
                    }
                }
                section { class: "mn-document",
                    div {
                        class: if view_mode == ViewMode::Preview { "mn-editor-edit hidden" } else { "mn-editor-edit" },
                        div { class: "mn-editor-hosts",
                            for (tab_id, is_active) in host_items {
                                div {
                                    key: "{tab_id}",
                                    "data-tab-id": "{tab_id}",
                                    class: if is_active { "mn-editor-host-slot" } else { "mn-editor-host-slot hidden" },
                                    EditorHost {
                                        tab_id: tab_id.clone(),
                                        auto_save_delay_ms,
                                        is_visible: is_active && view_mode == ViewMode::Edit,
                                    }
                                }
                            }
                        }
                    }
                    if view_mode == ViewMode::Preview {
                        {
                            let content = tab_contents
                                .read()
                                .active_content(active_tab_id.as_deref())
                                .unwrap_or_default()
                                .to_string();
                            rsx! { PreviewPane { content, editor_services } }
                        }
                    }
                }
            } else {
                EmptyEditor {}
                if !host_items.is_empty() {
                    div { class: "mn-editor-retired-hosts",
                        for (tab_id, _) in host_items {
                            div {
                                key: "{tab_id}",
                                "data-tab-id": "{tab_id}",
                                class: "mn-editor-host-slot hidden",
                                EditorHost {
                                    tab_id: tab_id.clone(),
                                    auto_save_delay_ms,
                                    is_visible: false,
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
    rsx! {
        div { class: "mn-view-toggle",
            button {
                class: if view_mode == ViewMode::Edit { "mn-view-btn active" } else { "mn-view-btn" },
                title: "Edit mode",
                onclick: move |_| on_change.call(ViewMode::Edit),
                "Edit"
            }
            button {
                class: if view_mode == ViewMode::Preview { "mn-view-btn active" } else { "mn-view-btn" },
                title: "Preview rendered markdown",
                onclick: move |_| on_change.call(ViewMode::Preview),
                "Preview"
            }
        }
    }
}

#[component]
fn EmptyEditor() -> Element {
    rsx! {
        section { class: "mn-empty",
            div { class: "mn-empty-card",
                h1 { "Open a note to start editing" }
                p { "Select a file from the sidebar, or create a new note with the New button." }
            }
        }
    }
}
