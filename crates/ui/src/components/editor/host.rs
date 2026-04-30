use super::bridge::{
    send_editor_destroy, EditorBridge, EditorBridgeMap, EditorCommand, EditorEvent,
};
use super::fallback::{EditorRuntimeState, FallbackEditor};
use crate::commands::{ContentChange, EditorRuntimeCommand, PasteImageRequest};
use crate::context::use_app_context;
use crate::perf::{perf_timer, trace_editor_set_preferences, trace_editor_set_view_mode};
use crate::view_model::EditorHostInitialContent;
use dioxus::prelude::*;
use papyro_core::models::ViewMode;
use papyro_editor::parser::MarkdownBlockHintSet;
use uuid::Uuid;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct EditorCommandCache {
    view_mode: Option<ViewMode>,
    auto_link_paste: Option<bool>,
    block_hints_revision: Option<u64>,
}

#[component]
pub(super) fn EditorHost(
    tab_id: String,
    is_visible: bool,
    initial_content: EditorHostInitialContent,
    block_hints: Option<MarkdownBlockHintSet>,
    view_mode: ViewMode,
    auto_link_paste: bool,
) -> Element {
    let app = use_app_context();
    let commands = app.commands;
    let editor_runtime_commands = app.editor_runtime_command_port;
    let bridges = use_context::<EditorBridgeMap>();
    let container_id = format!("mn-editor-{tab_id}");
    let instance_id = use_signal(|| format!("host-{}", Uuid::new_v4()));
    let instance_id_value = instance_id();
    let runtime_state = use_signal(|| EditorRuntimeState::Loading);
    let command_cache = use_signal(EditorCommandCache::default);
    let startup_view_mode = view_mode.clone();
    let state = runtime_state();
    let runtime_ready = state == EditorRuntimeState::Ready;
    let runtime_command_revision = editor_runtime_commands.revision();

    use_effect(use_reactive(
        (&tab_id, &container_id),
        move |(tab_id, container_id)| {
            if bridges.read().contains_key(&tab_id) {
                return;
            }

            let mut bridges = bridges;
            let commands = commands.clone();
            let mut runtime_state = runtime_state;
            let command_cache = command_cache;
            let initial_content = initial_content.content.clone();
            let initial_view_mode = startup_view_mode.clone();
            let tab_id = tab_id.clone();
            let container_id = container_id.clone();
            let instance_id = instance_id_value.clone();

            spawn(async move {
                if bridges.read().contains_key(&tab_id) {
                    return;
                }

                runtime_state.set(EditorRuntimeState::Loading);

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
                    initial_content_json = serde_json::to_string(initial_content.as_ref())
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
                            runtime_state.set(EditorRuntimeState::Ready);
                            if let Some(eval) =
                                bridge_eval_for_instance(bridges, &tab_id, &instance_id)
                            {
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
                        EditorEvent::ContentChanged {
                            tab_id,
                            content,
                            hybrid_block_kind,
                            hybrid_block_state,
                            hybrid_block_tier,
                            hybrid_fallback_reason,
                        } => {
                            commands.content_changed.call(ContentChange {
                                tab_id,
                                content,
                                hybrid_block_kind,
                                hybrid_block_state,
                                hybrid_block_tier,
                                hybrid_fallback_reason,
                            });
                        }
                        EditorEvent::SaveRequested { tab_id } => {
                            commands.save_tab.call(tab_id);
                        }
                        EditorEvent::PasteImageRequested {
                            tab_id,
                            mime_type,
                            data,
                        } => {
                            commands.paste_image.call(PasteImageRequest {
                                tab_id,
                                mime_type,
                                data,
                            });
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

    use_effect(use_reactive(
        (&tab_id, &is_visible, &block_hints, &runtime_ready),
        move |(tab_id, is_visible, block_hints, runtime_ready)| {
            if !is_visible || !runtime_ready {
                return;
            }

            let Some(hints) = block_hints else {
                return;
            };

            if let Some(bridge) = bridges.read().get(&tab_id) {
                send_set_block_hints(&bridge.eval, command_cache, &tab_id, hints);
            }
        },
    ));

    use_effect(use_reactive(
        (&tab_id, &runtime_ready, &runtime_command_revision),
        move |(tab_id, runtime_ready, _revision)| {
            if !runtime_ready || !editor_runtime_commands.has_pending_for_tab(&tab_id) {
                return;
            }

            let commands = editor_runtime_commands.drain_for_tab(&tab_id);
            let Some(eval) = bridges.read().get(&tab_id).map(|bridge| bridge.eval) else {
                return;
            };

            for command in commands {
                match command {
                    EditorRuntimeCommand::InsertMarkdown { markdown, .. } => {
                        let _ = eval.send(EditorCommand::InsertMarkdown { markdown });
                    }
                }
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
    let changed = command_cache.with_mut(|cache| record_view_mode_change(cache, mode.clone()));
    if !changed {
        return;
    }

    let started_at = perf_timer();
    let _ = eval.send(EditorCommand::SetViewMode { mode: mode.clone() });
    trace_editor_set_view_mode(tab_id, &mode, started_at);
}

fn send_set_preferences(
    eval: &dioxus::document::Eval,
    mut command_cache: Signal<EditorCommandCache>,
    tab_id: &str,
    auto_link_paste: bool,
) {
    let changed = command_cache.with_mut(|cache| record_preferences_change(cache, auto_link_paste));
    if !changed {
        return;
    }

    let started_at = perf_timer();
    let _ = eval.send(EditorCommand::SetPreferences { auto_link_paste });
    trace_editor_set_preferences(tab_id, auto_link_paste, started_at);
}

fn send_set_block_hints(
    eval: &dioxus::document::Eval,
    mut command_cache: Signal<EditorCommandCache>,
    _tab_id: &str,
    hints: MarkdownBlockHintSet,
) {
    let changed = command_cache.with_mut(|cache| record_block_hints_change(cache, hints.revision));
    if !changed {
        return;
    }

    let _ = eval.send(EditorCommand::SetBlockHints { hints });
}

fn bridge_eval_for_instance(
    bridges: EditorBridgeMap,
    tab_id: &str,
    instance_id: &str,
) -> Option<dioxus::document::Eval> {
    bridges
        .read()
        .get(tab_id)
        .filter(|bridge| bridge_instance_matches(Some(bridge.instance_id.as_str()), instance_id))
        .map(|bridge| bridge.eval)
}

fn remove_bridge_for_instance(mut bridges: EditorBridgeMap, tab_id: &str, instance_id: &str) {
    let should_remove = {
        let bridges = bridges.peek();
        let current_instance_id = bridges
            .get(tab_id)
            .map(|bridge| bridge.instance_id.as_str());
        bridge_instance_matches(current_instance_id, instance_id)
    };
    if should_remove {
        bridges.write().remove(tab_id);
    }
}

fn bridge_instance_matches(current_instance_id: Option<&str>, requested_instance_id: &str) -> bool {
    current_instance_id == Some(requested_instance_id)
}

fn record_preferences_change(
    command_cache: &mut EditorCommandCache,
    auto_link_paste: bool,
) -> bool {
    if command_cache.auto_link_paste == Some(auto_link_paste) {
        return false;
    }

    command_cache.auto_link_paste = Some(auto_link_paste);
    true
}

fn record_view_mode_change(command_cache: &mut EditorCommandCache, mode: ViewMode) -> bool {
    if command_cache.view_mode.as_ref() == Some(&mode) {
        return false;
    }

    command_cache.view_mode = Some(mode);
    true
}

fn record_block_hints_change(command_cache: &mut EditorCommandCache, revision: u64) -> bool {
    if command_cache.block_hints_revision == Some(revision) {
        return false;
    }

    command_cache.block_hints_revision = Some(revision);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_instance_contract_rejects_stale_cleanup() {
        assert!(bridge_instance_matches(Some("host-new"), "host-new"));
        assert!(!bridge_instance_matches(Some("host-new"), "host-old"));
        assert!(!bridge_instance_matches(None, "host-old"));
    }

    #[test]
    fn preferences_change_is_idempotent() {
        let mut cache = EditorCommandCache::default();

        assert!(record_preferences_change(&mut cache, true));
        assert!(!record_preferences_change(&mut cache, true));
        assert!(record_preferences_change(&mut cache, false));
        assert!(!record_preferences_change(&mut cache, false));
    }

    #[test]
    fn view_mode_change_is_idempotent() {
        let mut cache = EditorCommandCache::default();

        assert!(record_view_mode_change(&mut cache, ViewMode::Hybrid));
        assert!(!record_view_mode_change(&mut cache, ViewMode::Hybrid));
        assert!(record_view_mode_change(&mut cache, ViewMode::Preview));
        assert!(!record_view_mode_change(&mut cache, ViewMode::Preview));
    }

    #[test]
    fn block_hints_change_is_idempotent_by_revision() {
        let mut cache = EditorCommandCache::default();

        assert!(record_block_hints_change(&mut cache, 1));
        assert!(!record_block_hints_change(&mut cache, 1));
        assert!(record_block_hints_change(&mut cache, 2));
        assert!(!record_block_hints_change(&mut cache, 2));
    }
}
