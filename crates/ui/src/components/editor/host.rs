use super::assets::save_pasted_image_asset;
use super::bridge::{
    send_editor_destroy, EditorBridge, EditorBridgeMap, EditorCommand, EditorEvent,
};
use super::fallback::{EditorRuntimeState, FallbackEditor};
use crate::commands::ContentChange;
use crate::context::use_app_context;
use crate::perf::{
    perf_timer, trace_editor_refresh_layout, trace_editor_set_preferences,
    trace_editor_set_view_mode,
};
use dioxus::prelude::*;
use papyro_core::models::ViewMode;
use uuid::Uuid;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct EditorCommandCache {
    view_mode: Option<ViewMode>,
    auto_link_paste: Option<bool>,
    layout_size: Option<EditorLayoutSize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct EditorLayoutSize {
    width: u32,
    height: u32,
}

#[component]
pub(super) fn EditorHost(tab_id: String, is_visible: bool, view_mode: ViewMode) -> Element {
    let app = use_app_context();
    let file_state = app.file_state;
    let editor_tabs = app.editor_tabs;
    let tab_contents = app.tab_contents;
    let ui_state = app.ui_state;
    let status_message = app.status_message;
    let commands = app.commands;
    let bridges = use_context::<EditorBridgeMap>();
    let container_id = format!("mn-editor-{tab_id}");
    let instance_id = use_signal(|| format!("host-{}", Uuid::new_v4()));
    let instance_id_value = instance_id();
    let runtime_state = use_signal(|| EditorRuntimeState::Loading);
    let command_cache = use_signal(EditorCommandCache::default);
    let mut latest_visibility = use_signal(|| is_visible);
    let startup_view_mode = view_mode.clone();
    let auto_link_paste = ui_state.read().settings.auto_link_paste;
    let state = runtime_state();
    let runtime_ready = state == EditorRuntimeState::Ready;

    use_effect(use_reactive((&is_visible,), move |(is_visible,)| {
        latest_visibility.set(is_visible);
    }));

    use_effect(use_reactive(
        (&tab_id, &container_id),
        move |(tab_id, container_id)| {
            if bridges.read().contains_key(&tab_id) {
                return;
            }

            let mut bridges = bridges;
            let file_state = file_state;
            let editor_tabs = editor_tabs;
            let tab_contents = tab_contents;
            let commands = commands.clone();
            let mut runtime_state = runtime_state;
            let mut status_message = status_message;
            let command_cache = command_cache;
            let latest_visibility = latest_visibility;
            let initial_view_mode = startup_view_mode.clone();
            let tab_id = tab_id.clone();
            let container_id = container_id.clone();
            let instance_id = instance_id_value.clone();

            spawn(async move {
                if bridges.read().contains_key(&tab_id) {
                    return;
                }

                runtime_state.set(EditorRuntimeState::Loading);

                let initial_content = tab_contents
                    .read()
                    .content_for_tab(&tab_id)
                    .unwrap_or_default()
                    .to_string();

                let script = format!(
                    r#"
                const tabId = {tab_id_json};
                const containerId = {container_id_json};
                const instanceId = {instance_id_json};
                const initialContent = {initial_content_json};
                const initialViewMode = {initial_view_mode_json};

                async function ensurePapyroEditorRuntime() {{
                    if (window.papyroEditor) return;

                    const runtimeSrc = window.__PAPYRO_EDITOR_SCRIPT_SRC__;
                    const hasRuntimeScriptForSrc = (src) => {{
                        if (!src) return false;
                        const absoluteSrc = new URL(src, document.baseURI).href;
                        return Array.from(document.scripts).some((script) =>
                            script.dataset.papyroEditorRuntimeSrc === src ||
                            script.src === absoluteSrc
                        );
                    }};

                    if (runtimeSrc && !hasRuntimeScriptForSrc(runtimeSrc)) {{
                        await new Promise((resolve) => {{
                            const script = document.createElement("script");
                            script.src = runtimeSrc;
                            script.async = false;
                            script.dataset.papyroEditorRuntime = "external";
                            script.dataset.papyroEditorRuntimeSrc = runtimeSrc;
                            script.onload = resolve;
                            script.onerror = () => {{
                                if (!window.__PAPYRO_EDITOR_LOAD_ERROR__) {{
                                    window.__PAPYRO_EDITOR_LOAD_ERROR__ =
                                        `failed to load editor runtime script: ${{runtimeSrc}}`;
                                }}
                                resolve();
                            }};
                            document.head.appendChild(script);
                        }});
                    }}

                    for (let attempt = 0; attempt < 25; attempt++) {{
                        if (window.papyroEditor) return;
                        await new Promise(r => setTimeout(r, 20));
                    }}

                    const detail =
                        window.__PAPYRO_EDITOR_LOAD_ERROR__ ||
                        `script src: ${{runtimeSrc || "not configured"}}`;
                    throw new Error(`papyroEditor runtime not ready (${{detail}})`);
                }}

                try {{
                    await ensurePapyroEditorRuntime();

                    window.papyroEditor.ensureEditor({{ tabId, containerId, instanceId, initialContent, viewMode: initialViewMode }});
                    window.papyroEditor.attachChannel(tabId, dioxus);
                    dioxus.send({{ type: "runtime_ready", tab_id: tabId }});

                    while (true) {{
                        const message = await dioxus.recv();
                        const result = window.papyroEditor.handleRustMessage(tabId, message);
                        if (result === "destroyed") break;
                    }}
                    return "closed";
                }} catch (error) {{
                    const message = error?.stack || error?.message || String(error);
                    try {{
                        dioxus.send({{ type: "runtime_error", tab_id: tabId, message }});
                    }} catch (_) {{}}
                    throw error;
                }}
                "#,
                    tab_id_json =
                        serde_json::to_string(&tab_id).unwrap_or_else(|_| "\"\"".to_string()),
                    container_id_json =
                        serde_json::to_string(&container_id).unwrap_or_else(|_| "\"\"".to_string()),
                    instance_id_json =
                        serde_json::to_string(&instance_id).unwrap_or_else(|_| "\"\"".to_string()),
                    initial_content_json = serde_json::to_string(&initial_content)
                        .unwrap_or_else(|_| "\"\"".to_string()),
                    initial_view_mode_json = serde_json::to_string(&initial_view_mode)
                        .unwrap_or_else(|_| "\"Hybrid\"".to_string()),
                );

                let eval = document::eval(&script);
                bridges.write().insert(
                    tab_id.clone(),
                    EditorBridge {
                        eval,
                        instance_id: instance_id.clone(),
                    },
                );
                let mut runtime_is_ready = false;

                loop {
                    let event = {
                        let Some(mut eval) =
                            bridge_eval_for_instance(bridges, &tab_id, &instance_id)
                        else {
                            break;
                        };
                        eval.recv::<EditorEvent>().await
                    };

                    let Ok(event) = event else {
                        remove_bridge_for_instance(bridges, &tab_id, &instance_id);
                        runtime_state.set(EditorRuntimeState::Error(
                            "Editor runtime channel closed".to_string(),
                        ));
                        break;
                    };

                    match event {
                        EditorEvent::RuntimeReady { tab_id } => {
                            runtime_is_ready = true;
                            runtime_state.set(EditorRuntimeState::Ready);
                            let content = tab_contents
                                .read()
                                .content_for_tab(&tab_id)
                                .unwrap_or_default()
                                .to_string();
                            if let Some(eval) =
                                bridge_eval_for_instance(bridges, &tab_id, &instance_id)
                            {
                                let _ = eval.send(EditorCommand::SetContent { content });
                                send_set_view_mode(
                                    &eval,
                                    command_cache,
                                    &tab_id,
                                    initial_view_mode.clone(),
                                );
                                send_set_preferences(
                                    &eval,
                                    command_cache,
                                    &tab_id,
                                    auto_link_paste,
                                );
                            }
                        }
                        EditorEvent::RuntimeError { tab_id, message } => {
                            tracing::warn!(%tab_id, %message, "editor runtime failed");
                            runtime_state.set(EditorRuntimeState::Error(message));
                        }
                        EditorEvent::ContentChanged { tab_id, content } => {
                            commands
                                .content_changed
                                .call(ContentChange { tab_id, content });
                        }
                        EditorEvent::SaveRequested { tab_id } => {
                            commands.save_tab.call(tab_id);
                        }
                        EditorEvent::PasteImageRequested {
                            tab_id,
                            mime_type,
                            data,
                        } => {
                            let workspace = file_state.read().current_workspace.clone();
                            let tab = editor_tabs.read().tab_by_id(&tab_id).cloned();

                            let Some((workspace, tab)) = workspace.zip(tab) else {
                                status_message.set(Some(
                                    "Open a workspace note before pasting images".to_string(),
                                ));
                                continue;
                            };

                            let Some(eval) =
                                bridge_eval_for_instance(bridges, &tab_id, &instance_id)
                            else {
                                continue;
                            };

                            match save_pasted_image_asset(&workspace, &tab, &mime_type, &data).await
                            {
                                Ok(saved) => {
                                    let _ = eval.send(EditorCommand::InsertMarkdown {
                                        markdown: saved.markdown,
                                    });
                                }
                                Err(error) => {
                                    status_message.set(Some(error));
                                }
                            }
                        }
                        EditorEvent::LayoutChanged {
                            tab_id,
                            width,
                            height,
                        } => {
                            if !should_refresh_layout(
                                command_cache,
                                &tab_id,
                                width,
                                height,
                                runtime_is_ready,
                                latest_visibility(),
                            ) {
                                continue;
                            }

                            if let Some(eval) =
                                bridge_eval_for_instance(bridges, &tab_id, &instance_id)
                            {
                                let started_at = perf_timer();
                                let _ = eval.send(EditorCommand::RefreshLayout);
                                trace_editor_refresh_layout(&tab_id, started_at);
                            }
                        }
                    }
                }
            });
        },
    ));

    use_effect(use_reactive(
        (&tab_id, &is_visible, &view_mode, &runtime_ready),
        move |(tab_id, is_visible, mode, runtime_ready)| {
            if !is_visible || !runtime_ready {
                return;
            }

            if let Some(bridge) = bridges.read().get(&tab_id) {
                send_set_view_mode(&bridge.eval, command_cache, &tab_id, mode);
            }
        },
    ));

    use_effect(use_reactive(
        (&tab_id, &is_visible, &auto_link_paste, &runtime_ready),
        move |(tab_id, is_visible, auto_link_paste, runtime_ready)| {
            if !is_visible || !runtime_ready {
                return;
            }

            if let Some(bridge) = bridges.read().get(&tab_id) {
                send_set_preferences(&bridge.eval, command_cache, &tab_id, auto_link_paste);
            }
        },
    ));

    use_drop({
        let tab_id = tab_id.clone();
        let mut bridges = bridges;
        move || {
            if let Some(bridge) = bridges.write().remove(&tab_id) {
                send_editor_destroy(bridge);
            }
        }
    });

    let show_fallback = state != EditorRuntimeState::Ready;

    rsx! {
        div { class: "mn-editor-runtime-frame",
            div {
                id: "{container_id}",
                class: if show_fallback { "mn-codemirror-host initializing" } else { "mn-codemirror-host" },
            }
            if show_fallback {
                FallbackEditor {
                    tab_id: tab_id.clone(),
                    state,
                }
            }
        }
    }
}

fn send_set_view_mode(
    eval: &dioxus::document::Eval,
    mut command_cache: Signal<EditorCommandCache>,
    tab_id: &str,
    mode: ViewMode,
) {
    let already_sent = { command_cache.read().view_mode.as_ref() == Some(&mode) };
    if already_sent {
        return;
    }

    let started_at = perf_timer();
    let _ = eval.send(EditorCommand::SetViewMode { mode: mode.clone() });
    command_cache.with_mut(|cache| cache.view_mode = Some(mode.clone()));
    trace_editor_set_view_mode(tab_id, &mode, started_at);
}

fn send_set_preferences(
    eval: &dioxus::document::Eval,
    mut command_cache: Signal<EditorCommandCache>,
    tab_id: &str,
    auto_link_paste: bool,
) {
    let already_sent = { command_cache.read().auto_link_paste == Some(auto_link_paste) };
    if already_sent {
        return;
    }

    let started_at = perf_timer();
    let _ = eval.send(EditorCommand::SetPreferences { auto_link_paste });
    command_cache.with_mut(|cache| cache.auto_link_paste = Some(auto_link_paste));
    trace_editor_set_preferences(tab_id, auto_link_paste, started_at);
}

fn bridge_eval_for_instance(
    bridges: EditorBridgeMap,
    tab_id: &str,
    instance_id: &str,
) -> Option<dioxus::document::Eval> {
    bridges
        .read()
        .get(tab_id)
        .filter(|bridge| bridge.instance_id == instance_id)
        .map(|bridge| bridge.eval)
}

fn remove_bridge_for_instance(mut bridges: EditorBridgeMap, tab_id: &str, instance_id: &str) {
    let should_remove = bridges
        .peek()
        .get(tab_id)
        .is_some_and(|bridge| bridge.instance_id == instance_id);
    if should_remove {
        bridges.write().remove(tab_id);
    }
}

fn should_refresh_layout(
    mut command_cache: Signal<EditorCommandCache>,
    tab_id: &str,
    width: u32,
    height: u32,
    runtime_ready: bool,
    is_visible: bool,
) -> bool {
    let changed = command_cache.with_mut(|cache| {
        record_layout_size_change(cache, width, height, runtime_ready, is_visible)
    });
    if changed {
        tracing::debug!(tab_id, width, height, "editor host layout changed");
    }
    changed
}

fn record_layout_size_change(
    command_cache: &mut EditorCommandCache,
    width: u32,
    height: u32,
    runtime_ready: bool,
    is_visible: bool,
) -> bool {
    if !runtime_ready || !is_visible || width == 0 || height == 0 {
        return false;
    }

    let next_size = EditorLayoutSize { width, height };
    if command_cache.layout_size == Some(next_size) {
        return false;
    }

    command_cache.layout_size = Some(next_size);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refresh_layout_requires_visible_nonzero_size_change() {
        let mut cache = EditorCommandCache::default();

        assert!(!record_layout_size_change(
            &mut cache, 800, 600, false, true
        ));
        assert!(!record_layout_size_change(
            &mut cache, 800, 600, true, false
        ));
        assert!(!record_layout_size_change(&mut cache, 0, 600, true, true));
        assert!(!record_layout_size_change(&mut cache, 800, 0, true, true));
        assert!(record_layout_size_change(&mut cache, 800, 600, true, true));
        assert!(!record_layout_size_change(&mut cache, 800, 600, true, true));
        assert!(record_layout_size_change(&mut cache, 820, 600, true, true));
    }
}
