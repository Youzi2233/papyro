use crate::commands::AppCommands;
use crate::context::use_app_context;
use dioxus::document::Eval;
use dioxus::prelude::*;
use papyro_core::models::ViewMode;
use papyro_core::{EditorTabs, TabContentsMap};
use papyro_editor::parser::summarize_markdown;
use papyro_editor::renderer::render_markdown_html;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum EditorEvent {
    RuntimeReady { tab_id: String },
    RuntimeError { tab_id: String, message: String },
    ContentChanged { tab_id: String, content: String },
    SaveRequested { tab_id: String },
}

#[derive(Debug, Clone, Deserialize)]
struct ClosePerfEvent {
    tab_id: String,
    phase: String,
    elapsed_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(dead_code)]
enum EditorCommand {
    SetContent { content: String },
    ApplyFormat { kind: &'static str },
    Focus,
    RefreshLayout,
    Destroy,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum EditorRuntimeState {
    Loading,
    Ready,
    Error(String),
}

type EditorBridgeMap = Signal<HashMap<String, Eval>>;
type RetiredEditorHosts = Signal<Vec<String>>;

fn perf_enabled() -> bool {
    std::env::var_os("PAPYRO_PERF").is_some()
}

#[component]
pub fn EditorPane() -> Element {
    let perf_started_at = perf_enabled().then(Instant::now);
    let app = use_app_context();
    let editor_tabs = app.editor_tabs;
    let tab_contents = app.tab_contents;
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
        use_context_provider(|| Signal::new(HashMap::<String, Eval>::new()));
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
                let open: std::collections::HashSet<String> =
                    open_ids.into_iter().collect();
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
                            rsx! { PreviewPane { content } }
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
fn PreviewPane(content: String) -> Element {
    let html = render_markdown_html(&content);

    rsx! {
        div {
            class: "mn-preview",
            dangerous_inner_html: "{html}",
        }
    }
}

#[component]
fn EditorToolbar(active_tab_id: String) -> Element {
    rsx! {
        div { class: "mn-toolbar",
            ToolbarButton { label: "B", title: "Bold (Ctrl+B)", kind: "bold", tab_id: active_tab_id.clone() }
            ToolbarButton { label: "I", title: "Italic (Ctrl+I)", kind: "italic", tab_id: active_tab_id.clone() }
            ToolbarButton { label: "Link", title: "Insert link (Ctrl+K)", kind: "link", tab_id: active_tab_id.clone() }
            ToolbarButton { label: "Code", title: "Insert code block", kind: "code_block", tab_id: active_tab_id.clone() }
            ToolbarButton { label: "H1", title: "Heading 1", kind: "heading1", tab_id: active_tab_id.clone() }
            ToolbarButton { label: "H2", title: "Heading 2", kind: "heading2", tab_id: active_tab_id.clone() }
            ToolbarButton { label: "\"", title: "Blockquote", kind: "quote", tab_id: active_tab_id.clone() }
        }
    }
}

#[component]
fn ToolbarButton(
    label: &'static str,
    title: &'static str,
    kind: &'static str,
    tab_id: String,
) -> Element {
    let bridges = use_context::<EditorBridgeMap>();

    rsx! {
        button {
            class: "mn-toolbar-button",
            title: "{title}",
            onclick: move |_| {
                if let Some(eval) = bridges.read().get(&tab_id) {
                    let _ = eval.send(EditorCommand::ApplyFormat { kind });
                }
            },
            "{label}"
        }
    }
}

#[component]
fn EditorHost(tab_id: String, auto_save_delay_ms: u64, is_visible: bool) -> Element {
    let app = use_app_context();
    let editor_tabs = app.editor_tabs;
    let tab_contents = app.tab_contents;
    let commands = app.commands;
    let bridges = use_context::<EditorBridgeMap>();
    let container_id = format!("mn-editor-{tab_id}");
    let runtime_state = use_signal(|| EditorRuntimeState::Loading);

    use_effect(use_reactive(
        (&tab_id, &container_id),
        move |(tab_id, container_id)| {
            if bridges.read().contains_key(&tab_id) {
                return;
            }

            let mut bridges = bridges;
            let editor_tabs = editor_tabs;
            let tab_contents = tab_contents;
            let commands = commands.clone();
            let mut runtime_state = runtime_state;
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

                    window.papyroEditor.ensureEditor({{ tabId, containerId, initialContent }});
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
                            }
                        }
                        EditorEvent::RuntimeError { tab_id, message } => {
                            tracing::warn!(%tab_id, %message, "editor runtime failed");
                            runtime_state.set(EditorRuntimeState::Error(message));
                        }
                        EditorEvent::ContentChanged { tab_id, content } => {
                            record_content_change(
                                editor_tabs,
                                tab_contents,
                                commands.clone(),
                                tab_id,
                                content,
                                auto_save_delay_ms,
                            );
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
                    auto_save_delay_ms,
                }
            }
        }
    }
}

fn send_editor_destroy(eval: Eval) {
    let _ = eval.send(EditorCommand::Destroy);
}

#[component]
fn FallbackEditor(tab_id: String, state: EditorRuntimeState, auto_save_delay_ms: u64) -> Element {
    let _ = (tab_id, auto_save_delay_ms);
    let status = match state {
        EditorRuntimeState::Loading => "Starting editor runtime...".to_string(),
        EditorRuntimeState::Ready => String::new(),
        EditorRuntimeState::Error(message) => format!("Editor runtime failed: {message}"),
    };

    rsx! {
        div { class: "mn-editor-fallback",
            div { class: "mn-editor-fallback-status", "{status}" }
        }
    }
}

fn record_content_change(
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    commands: AppCommands,
    tab_id: String,
    content: String,
    auto_save_delay_ms: u64,
) {
    let revision = papyro_core::change_tab_content(
        &mut editor_tabs.write(),
        &mut tab_contents.write(),
        &tab_id,
        content,
    );

    if let Some(revision) = revision {
        let delay = Duration::from_millis(auto_save_delay_ms);
        spawn(async move {
            tokio::time::sleep(delay).await;
            if papyro_core::should_auto_save(
                &editor_tabs.read(),
                &tab_contents.read(),
                &tab_id,
                revision,
            ) {
                let content = tab_contents
                    .read()
                    .content_for_tab(&tab_id)
                    .unwrap_or_default()
                    .to_string();
                let stats = summarize_markdown(&content);
                tab_contents.write().refresh_stats(&tab_id, stats);
                commands.save_tab.call(tab_id);
            }
        });
    }
}

fn trace_close_ui_phases(tab_id: &str) {
    if !perf_enabled() {
        return;
    }

    let script = format!(
        r#"
            const tabId = {tab_id_json};
            const startedAt = performance.now();
            const send = (phase) => {{
                dioxus.send({{
                    tab_id: tabId,
                    phase,
                    elapsed_ms: performance.now() - startedAt,
                }});
            }};

            send("eval_sync");
            await Promise.resolve();
            send("await_promise");
            await new Promise((resolve) => setTimeout(resolve, 0));
            send("timeout_0");
            await new Promise((resolve) => {{
                if (typeof requestAnimationFrame === "function") {{
                    requestAnimationFrame(() => resolve());
                }} else {{
                    setTimeout(resolve, 0);
                }}
            }});
            send("raf");
        "#,
        tab_id_json = serde_json::to_string(tab_id).unwrap_or_else(|_| "\"\"".to_string()),
    );

    let mut eval = document::eval(&script);
    spawn(async move {
        while let Ok(event) = eval.recv::<ClosePerfEvent>().await {
            tracing::info!(
                tab_id = %event.tab_id,
                phase = %event.phase,
                elapsed_ms = event.elapsed_ms,
                "perf tab close js phase"
            );
        }
    });
}

fn request_tab_close(
    mut retired_hosts: RetiredEditorHosts,
    commands: AppCommands,
    close_tab_id: String,
    should_retire_host: bool,
    trigger: &'static str,
) {
    let perf_started_at = perf_enabled().then(Instant::now);
    trace_close_ui_phases(&close_tab_id);

    // Both writes happen synchronously so Dioxus batches them into a single
    // render pass, eliminating the extra tick that caused the close stutter.
    if should_retire_host {
        retired_hosts.with_mut(|ids| {
            if !ids.iter().any(|id| id == &close_tab_id) {
                ids.push(close_tab_id.clone());
            }
        });
    }

    commands.close_tab.call(close_tab_id.clone());

    if let Some(started_at) = perf_started_at {
        tracing::info!(
            tab_id = %close_tab_id,
            trigger,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf tab close trigger"
        );
    }
}

#[component]
fn EditorTabButton(tab: papyro_core::models::EditorTab, is_active: bool) -> Element {
    let app = use_app_context();
    let mut editor_tabs = app.editor_tabs;
    let pending_close_tab = app.pending_close_tab;
    let commands = app.commands;
    let retired_hosts = use_context::<RetiredEditorHosts>();
    let activate_tab_id = tab.id.clone();
    let close_tab_id = tab.id.clone();
    let close_tab_id_for_mouse = close_tab_id.clone();
    let close_tab_id_for_keyboard = close_tab_id.clone();
    let commands_for_mouse = commands.clone();
    let commands_for_keyboard = commands.clone();
    let should_retire_host =
        !tab.is_dirty || pending_close_tab.read().as_deref() == Some(tab.id.as_str());
    let next_active_tab_id = {
        let tabs = editor_tabs.read();
        if is_active {
            tabs.tabs
                .iter()
                .filter(|candidate| candidate.id != close_tab_id)
                .map(|candidate| candidate.id.clone())
                .last()
                .unwrap_or_default()
        } else {
            tabs.active_tab_id.clone().unwrap_or_default()
        }
    };

    rsx! {
        div {
            "data-tab-id": "{tab.id}",
            class: if is_active { "mn-tab active" } else { "mn-tab" },
            button {
                class: "mn-tab-title",
                onclick: move |_| editor_tabs.write().set_active_tab(&activate_tab_id),
                "{tab.title}"
                if tab.is_dirty { span { class: "mn-dirty", "*" } }
            }
            button {
                class: "mn-tab-close",
                title: "Close tab",
                "data-close-tab-id": "{close_tab_id}",
                "data-next-active-tab-id": "{next_active_tab_id}",
                "data-immediate-close": if should_retire_host { "true" } else { "false" },
                onmousedown: move |event| {
                    event.prevent_default();
                    event.stop_propagation();
                    request_tab_close(
                        retired_hosts,
                        commands_for_mouse.clone(),
                        close_tab_id_for_mouse.clone(),
                        should_retire_host,
                        "mouse_down",
                    );
                },
                onkeydown: move |event| {
                    let key = event.key();
                    let is_space = matches!(key, Key::Character(ref value) if value == " ");
                    if key != Key::Enter && !is_space {
                        return;
                    }
                    event.prevent_default();
                    event.stop_propagation();
                    request_tab_close(
                        retired_hosts,
                        commands_for_keyboard.clone(),
                        close_tab_id_for_keyboard.clone(),
                        should_retire_host,
                        "keyboard",
                    );
                },
                "x"
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
