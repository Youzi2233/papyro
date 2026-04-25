use super::bridge::{send_editor_destroy, EditorBridgeMap, EditorCommand, EditorEvent};
use super::fallback::{EditorRuntimeState, FallbackEditor};
use crate::commands::ContentChange;
use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::ViewMode;

#[component]
pub(super) fn EditorHost(tab_id: String, is_visible: bool, view_mode: ViewMode) -> Element {
    let app = use_app_context();
    let tab_contents = app.tab_contents;
    let commands = app.commands;
    let bridges = use_context::<EditorBridgeMap>();
    let container_id = format!("mn-editor-{tab_id}");
    let runtime_state = use_signal(|| EditorRuntimeState::Loading);
    let startup_view_mode = view_mode.clone();

    use_effect(use_reactive(
        (&tab_id, &container_id),
        move |(tab_id, container_id)| {
            if bridges.read().contains_key(&tab_id) {
                return;
            }

            let mut bridges = bridges;
            let tab_contents = tab_contents;
            let commands = commands.clone();
            let mut runtime_state = runtime_state;
            let initial_view_mode = startup_view_mode.clone();
            let tab_id = tab_id.clone();
            let container_id = container_id.clone();

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

                    window.papyroEditor.ensureEditor({{ tabId, containerId, initialContent, viewMode: initialViewMode }});
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
                    initial_content_json = serde_json::to_string(&initial_content)
                        .unwrap_or_else(|_| "\"\"".to_string()),
                    initial_view_mode_json = serde_json::to_string(&initial_view_mode)
                        .unwrap_or_else(|_| "\"Hybrid\"".to_string()),
                );

                let eval = document::eval(&script);
                bridges.write().insert(tab_id.clone(), eval);

                loop {
                    let event = {
                        let Some(mut eval) = bridges.read().get(&tab_id).copied() else {
                            break;
                        };
                        eval.recv::<EditorEvent>().await
                    };

                    let Ok(event) = event else {
                        bridges.write().remove(&tab_id);
                        runtime_state.set(EditorRuntimeState::Error(
                            "Editor runtime channel closed".to_string(),
                        ));
                        break;
                    };

                    match event {
                        EditorEvent::RuntimeReady { tab_id } => {
                            runtime_state.set(EditorRuntimeState::Ready);
                            let content = tab_contents
                                .read()
                                .content_for_tab(&tab_id)
                                .unwrap_or_default()
                                .to_string();
                            if let Some(eval) = bridges.read().get(&tab_id) {
                                let _ = eval.send(EditorCommand::SetContent { content });
                                let _ = eval.send(EditorCommand::SetViewMode {
                                    mode: initial_view_mode.clone(),
                                });
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
                    }
                }
            });
        },
    ));

    use_effect(use_reactive(
        (&tab_id, &is_visible),
        move |(tab_id, is_visible)| {
            if !is_visible {
                return;
            }

            if let Some(eval) = bridges.read().get(&tab_id) {
                let _ = eval.send(EditorCommand::RefreshLayout);
            }
        },
    ));

    use_effect(use_reactive(
        (&tab_id, &view_mode),
        move |(tab_id, mode)| {
            if let Some(eval) = bridges.read().get(&tab_id) {
                let _ = eval.send(EditorCommand::SetViewMode { mode });
            }
        },
    ));

    use_drop({
        let tab_id = tab_id.clone();
        let mut bridges = bridges;
        move || {
            if let Some(eval) = bridges.write().remove(&tab_id) {
                send_editor_destroy(eval);
            }
        }
    });

    let state = runtime_state();
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
