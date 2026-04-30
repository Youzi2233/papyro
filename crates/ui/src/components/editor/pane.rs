use super::bridge::{send_editor_destroy_batch, EditorBridgeMap};
use super::document_cache::{DocumentCacheKey, DocumentDerivedCache, DocumentDerivedCacheState};
use super::host::EditorHost;
use super::outline::OutlinePane;
use super::preview::{PreviewLinkBridge, PreviewPane};
use super::tabbar::EditorTabButton;
use crate::commands::AppCommands;
use crate::components::primitives::{Button, ButtonVariant};
use crate::context::use_app_context;
use crate::perf::{
    perf_timer, trace_editor_host_lifecycle, trace_editor_pane_render_prep,
    trace_editor_stale_bridge_cleanup,
};
use crate::view_model::{EditorHostItemViewModel, EditorSurfaceViewModel, EditorTabItemViewModel};
use dioxus::prelude::*;
use papyro_core::models::ViewMode;
use papyro_core::DocumentSnapshot;
use papyro_editor::parser::{
    analyze_markdown_block_snapshot_with_options, MarkdownBlockAnalysisOptions,
    MarkdownBlockHintSet,
};
use std::collections::HashMap;
use std::sync::Arc;

const TABBAR_WHEEL_BRIDGE_SCRIPT: &str = r#"
    if (!window.__papyroTabbarWheelBridgeInstalled) {
        window.__papyroTabbarWheelBridgeInstalled = true;
        let syncQueued = false;
        const syncTabbars = () => {
            document.querySelectorAll(".mn-tabbar").forEach((tabbar) => {
                const row = tabbar.closest(".mn-editor-tabs-row");
                const overflowing = tabbar.scrollWidth > tabbar.clientWidth + 1;
                tabbar.classList.toggle("overflowing", overflowing);
                row?.classList.toggle("overflowing", overflowing);
            });
        };
        const queueSync = () => {
            if (syncQueued) return;
            syncQueued = true;
            requestAnimationFrame(() => {
                syncQueued = false;
                syncTabbars();
            });
        };
        const resizeObserver = new ResizeObserver(queueSync);
        const observeTabbars = () => {
            document.querySelectorAll(".mn-editor-tabs-row, .mn-tabbar").forEach((element) => {
                resizeObserver.observe(element);
            });
        };
        const mutationObserver = new MutationObserver(() => {
            observeTabbars();
            queueSync();
        });
        const handler = (event) => {
            const target = event.target;
            const element = target instanceof Element ? target : target?.parentElement;
            const tabbar = element?.closest(".mn-tabbar");
            if (!tabbar || tabbar.scrollWidth <= tabbar.clientWidth + 1) return;

            const deltaX = Number(event.deltaX || 0);
            const deltaY = Number(event.deltaY || 0);
            const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
            if (!delta) return;

            const atStart = tabbar.scrollLeft <= 0;
            const atEnd = tabbar.scrollLeft + tabbar.clientWidth >= tabbar.scrollWidth - 1;
            if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;

            event.preventDefault();
            event.stopPropagation();
            tabbar.scrollLeft += delta;
        };
        observeTabbars();
        queueSync();
        window.addEventListener("resize", queueSync);
        mutationObserver.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        document.addEventListener("wheel", handler, { passive: false });
    }
    await new Promise(() => {});
"#;

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

fn editor_view_modes() -> Vec<ViewMode> {
    vec![ViewMode::Source, ViewMode::Hybrid, ViewMode::Preview]
}

fn view_mode_label(mode: &ViewMode) -> &'static str {
    match mode {
        ViewMode::Source => "Source",
        ViewMode::Hybrid => "Hybrid",
        ViewMode::Preview => "Preview",
    }
}

fn view_mode_option_class(current: &ViewMode, mode: &ViewMode) -> &'static str {
    if current == mode {
        "mn-view-mode-option active"
    } else {
        "mn-view-mode-option"
    }
}

fn sidebar_toggle_label(collapsed: bool) -> &'static str {
    if collapsed {
        "Show sidebar (Ctrl+\\)"
    } else {
        "Hide sidebar (Ctrl+\\)"
    }
}

fn sidebar_toggle_icon_class(collapsed: bool) -> &'static str {
    if collapsed {
        "mn-tool-icon sidebar-closed"
    } else {
        "mn-tool-icon sidebar-open"
    }
}

fn outline_tool_class(visible: bool) -> &'static str {
    if visible {
        "mn-editor-tool icon-only active"
    } else {
        "mn-editor-tool icon-only"
    }
}

fn scroll_editor_tabs(delta: i32) {
    document::eval(&format!(
        r#"document.querySelector(".mn-tabbar")?.scrollBy({{ left: {delta}, behavior: "smooth" }});"#
    ));
}

#[component]
fn TabbarWheelBridge() -> Element {
    use_effect(move || {
        let mut eval = document::eval(TABBAR_WHEEL_BRIDGE_SCRIPT);
        spawn(async move {
            let _ = eval.recv::<String>().await;
        });
    });

    rsx! {}
}

#[component]
pub fn EditorPane(
    on_settings: EventHandler<()>,
    on_quick_open: EventHandler<()>,
    on_command_palette: EventHandler<()>,
) -> Element {
    let _ = (on_settings, on_quick_open, on_command_palette);
    let perf_started_at = perf_timer();
    let app = use_app_context();
    let editor_services = app.editor_services;
    let commands = app.commands;
    let pane_model = app.editor_pane_model;
    let workspace_model = app.workspace_model;
    let surface_model = app.editor_surface_model.read().clone();
    let view_mode = surface_model.view_mode.clone();
    let sidebar_collapsed = (app.sidebar_collapsed)();
    let workspace = workspace_model();
    let workspace_path = if view_mode == ViewMode::Preview {
        workspace.path.clone()
    } else {
        None
    };
    let editor_typography = EditorTypography::from_surface_model(&surface_model);
    let auto_link_paste = surface_model.auto_link_paste;
    let outline_visible = surface_model.outline_visible;
    let editor_style = editor_style(&editor_typography);
    let bridges: EditorBridgeMap = use_context_provider(|| Signal::new(HashMap::new()));
    let document_cache: DocumentDerivedCache =
        use_context_provider(DocumentDerivedCacheState::shared);
    let mut host_lifecycle_state = use_signal(HashMap::<String, bool>::new);
    let mut block_hint_state = use_signal(|| None::<BlockHintDerivationState>);
    let block_hint_cache = document_cache.clone();
    let pane = pane_model();

    use_effect(use_reactive(
        (&pane.active_document, &view_mode),
        move |(document, view_mode)| {
            if view_mode != ViewMode::Hybrid {
                block_hint_state.set(None);
                return;
            }

            let Some(document) = document else {
                block_hint_state.set(None);
                return;
            };

            let key = DocumentCacheKey::from_snapshot(&document);
            if let Some(hints) = block_hint_cache.borrow().block_hints(&key) {
                block_hint_state.set(Some(BlockHintDerivationState {
                    key: Some(key),
                    hints: Some(hints),
                }));
                return;
            }

            let input = BlockHintDerivationInput::from_document(key.clone(), &document);
            block_hint_state.set(Some(BlockHintDerivationState {
                key: Some(key.clone()),
                hints: None,
            }));

            let mut state = block_hint_state;
            let cache = block_hint_cache.clone();
            spawn(async move {
                let result = derive_block_hints_async(input).await;
                if !block_hint_result_matches_current(state.peek().as_ref(), &key) {
                    return;
                }

                if let Some(hints) = result.hints.as_ref() {
                    cache
                        .borrow_mut()
                        .insert_block_hints(key.clone(), hints.clone());
                }
                state.set(Some(result));
            });
        },
    ));

    use_effect(use_reactive((&pane.host_items,), move |(host_items,)| {
        let perf_started_at = perf_timer();
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

        trace_editor_stale_bridge_cleanup(stale.len(), perf_started_at);
    }));

    trace_editor_pane_render_prep(
        pane.active_document.as_ref(),
        &view_mode,
        pane.open_tab_ids.len(),
        pane.host_items.len(),
        perf_started_at,
    );

    let active_document_key = pane
        .active_document
        .as_ref()
        .map(DocumentCacheKey::from_snapshot);
    let block_hints = resolve_block_hints(
        &document_cache,
        active_document_key.as_ref(),
        block_hint_state.read().as_ref(),
    );

    rsx! {
        main { class: "mn-editor", style: "{editor_style}",
            PreviewLinkBridge {
                commands: commands.clone(),
            }
            TabbarWheelBridge {}
            EditorChrome {
                tab_items: pane.tab_items.clone(),
                has_active_tab: pane.has_active_tab,
                view_mode: view_mode.clone(),
                outline_visible,
                sidebar_collapsed,
                commands: commands.clone(),
            }
            if pane.has_active_tab {
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
                                            block_hints: block_hints_for_host(
                                                host.is_active,
                                                block_hints.as_ref(),
                                            ),
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
                                workspace_path: workspace_path.clone(),
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
                EditorEmptyState {
                    commands: commands.clone(),
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
                                    block_hints: None,
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

#[component]
fn EditorChrome(
    tab_items: Vec<EditorTabItemViewModel>,
    has_active_tab: bool,
    view_mode: ViewMode,
    outline_visible: bool,
    sidebar_collapsed: bool,
    commands: AppCommands,
) -> Element {
    let sidebar_commands = commands.clone();
    let outline_commands = commands.clone();
    let mode_commands = commands.clone();
    let sidebar_label = sidebar_toggle_label(sidebar_collapsed);
    let sidebar_icon_class = sidebar_toggle_icon_class(sidebar_collapsed);
    let outline_class = outline_tool_class(outline_visible);
    let outline_label = if outline_visible {
        "Hide outline"
    } else {
        "Show outline"
    };

    rsx! {
        div { class: "mn-editor-chrome",
            div { class: "mn-editor-tabs-row",
                button {
                    class: "mn-editor-tool mn-editor-sidebar-toggle icon-only",
                    title: "{sidebar_label}",
                    "aria-label": "{sidebar_label}",
                    onclick: move |_| {
                        crate::chrome::toggle_sidebar(sidebar_commands.clone(), "editor");
                    },
                    span { class: sidebar_icon_class, "aria-hidden": "true" }
                }
                button {
                    class: "mn-tab-scroll-btn",
                    title: "Scroll tabs left",
                    "aria-label": "Scroll tabs left",
                    onclick: move |_| scroll_editor_tabs(-220),
                    span { class: "mn-tool-icon tab-left", "aria-hidden": "true" }
                }
                div { class: "mn-tabbar",
                    if tab_items.is_empty() {
                        span { class: "mn-tabbar-placeholder", "No open note" }
                    } else {
                        for item in tab_items.iter().cloned() {
                            EditorTabButton {
                                key: "{item.id}",
                                item,
                            }
                        }
                    }
                }
                button {
                    class: "mn-tab-scroll-btn",
                    title: "Scroll tabs right",
                    "aria-label": "Scroll tabs right",
                    onclick: move |_| scroll_editor_tabs(220),
                    span { class: "mn-tool-icon tab-right", "aria-hidden": "true" }
                }
            }
            div { class: "mn-editor-tools",
                div {
                    class: "mn-view-mode-switch",
                    role: "radiogroup",
                    "aria-label": "Editor view mode",
                    for mode in editor_view_modes() {
                        button {
                            class: view_mode_option_class(&view_mode, &mode),
                            r#type: "button",
                            role: "radio",
                            disabled: !has_active_tab,
                            "aria-checked": if mode == view_mode { "true" } else { "false" },
                            onclick: {
                                let mode_commands = mode_commands.clone();
                                let mode = mode.clone();
                                move |_| {
                                    crate::chrome::set_view_mode(
                                        mode_commands.clone(),
                                        mode.clone(),
                                        "editor_chrome",
                                    );
                                }
                            },
                            "{view_mode_label(&mode)}"
                        }
                    }
                }
                button {
                    class: outline_class,
                    title: "{outline_label}",
                    "aria-label": "{outline_label}",
                    disabled: !has_active_tab,
                    onclick: move |_| outline_commands.toggle_outline.call(()),
                    span { class: "mn-tool-icon outline", "aria-hidden": "true" }
                }
            }
        }
    }
}

#[component]
fn EditorEmptyState(commands: AppCommands) -> Element {
    let create_commands = commands.clone();
    let open_commands = commands.clone();

    rsx! {
        section { class: "mn-empty",
            div { class: "mn-empty-card",
                h1 { "Open a note" }
                p { "Pick a Markdown file from the sidebar or start a new note." }
                div { class: "mn-empty-actions",
                    Button {
                        label: "New note",
                        variant: ButtonVariant::Primary,
                        disabled: false,
                        on_click: move |_| create_commands.create_note.call("Untitled".to_string()),
                    }
                    Button {
                        label: "Open workspace",
                        variant: ButtonVariant::Default,
                        disabled: false,
                        on_click: move |_| open_commands.open_workspace.call(()),
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

#[derive(Debug, Clone, PartialEq)]
struct BlockHintDerivationState {
    key: Option<DocumentCacheKey>,
    hints: Option<MarkdownBlockHintSet>,
}

struct BlockHintDerivationInput {
    key: DocumentCacheKey,
    revision: u64,
    content: Arc<str>,
}

impl BlockHintDerivationInput {
    fn from_document(key: DocumentCacheKey, document: &DocumentSnapshot) -> Self {
        Self {
            key,
            revision: document.revision,
            content: document.content.clone(),
        }
    }
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

fn resolve_block_hints(
    document_cache: &DocumentDerivedCache,
    key: Option<&DocumentCacheKey>,
    state: Option<&BlockHintDerivationState>,
) -> Option<MarkdownBlockHintSet> {
    if let Some(hints) = key.and_then(|key| document_cache.borrow().block_hints(key)) {
        return Some(hints);
    }

    state
        .filter(|state| state.key.as_ref() == key)
        .and_then(|state| state.hints.clone())
}

async fn derive_block_hints_async(input: BlockHintDerivationInput) -> BlockHintDerivationState {
    let key = input.key.clone();
    let result = tokio::task::spawn_blocking(move || {
        analyze_markdown_block_snapshot_with_options(
            input.content.as_ref(),
            input.revision,
            MarkdownBlockAnalysisOptions::interactive(),
        )
    })
    .await;

    let hints = match result {
        Ok(hints) => Some(hints),
        Err(error) => {
            tracing::warn!(error = %error, "markdown block hint derivation failed");
            None
        }
    };

    BlockHintDerivationState {
        key: Some(key),
        hints,
    }
}

fn block_hint_result_matches_current(
    state: Option<&BlockHintDerivationState>,
    key: &DocumentCacheKey,
) -> bool {
    state.and_then(|state| state.key.as_ref()) == Some(key)
}

fn block_hints_for_host(
    is_active: bool,
    block_hints: Option<&MarkdownBlockHintSet>,
) -> Option<MarkdownBlockHintSet> {
    is_active.then(|| block_hints.cloned()).flatten()
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

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_editor::parser::MarkdownBlockFallback;

    fn host_item(tab_id: &str, is_active: bool) -> EditorHostItemViewModel {
        EditorHostItemViewModel {
            tab_id: tab_id.to_string(),
            is_active,
            initial_content: Default::default(),
        }
    }

    fn snapshot(tab_id: &str, revision: u64, content: &str) -> DocumentSnapshot {
        DocumentSnapshot {
            tab_id: tab_id.to_string(),
            path: std::path::PathBuf::from(format!("{tab_id}.md")),
            revision,
            content: Arc::from(content),
        }
    }

    fn block_hints(revision: u64) -> MarkdownBlockHintSet {
        MarkdownBlockHintSet {
            revision,
            fallback: MarkdownBlockFallback::None,
            blocks: Vec::new(),
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
    fn editor_chrome_view_mode_helpers_keep_visible_labels() {
        assert_eq!(editor_view_modes().len(), 3);
        assert_eq!(view_mode_label(&ViewMode::Source), "Source");
        assert_eq!(view_mode_label(&ViewMode::Hybrid), "Hybrid");
        assert_eq!(view_mode_label(&ViewMode::Preview), "Preview");
        assert_eq!(
            view_mode_option_class(&ViewMode::Hybrid, &ViewMode::Hybrid),
            "mn-view-mode-option active"
        );
        assert_eq!(
            view_mode_option_class(&ViewMode::Hybrid, &ViewMode::Source),
            "mn-view-mode-option"
        );
    }

    #[test]
    fn editor_chrome_icon_helpers_reflect_panel_state() {
        assert_eq!(sidebar_toggle_label(false), "Hide sidebar (Ctrl+\\)");
        assert_eq!(sidebar_toggle_label(true), "Show sidebar (Ctrl+\\)");
        assert_eq!(
            sidebar_toggle_icon_class(false),
            "mn-tool-icon sidebar-open"
        );
        assert_eq!(
            sidebar_toggle_icon_class(true),
            "mn-tool-icon sidebar-closed"
        );
        assert_eq!(outline_tool_class(false), "mn-editor-tool icon-only");
        assert_eq!(outline_tool_class(true), "mn-editor-tool icon-only active");
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

    #[test]
    fn block_hints_only_route_to_active_host() {
        let hints = block_hints(3);

        assert_eq!(block_hints_for_host(true, Some(&hints)), Some(hints));
        assert_eq!(block_hints_for_host(false, Some(&block_hints(4))), None);
        assert_eq!(block_hints_for_host(true, None), None);
    }

    #[test]
    fn resolve_block_hints_rejects_stale_state() {
        let cache = DocumentDerivedCacheState::shared();
        let document = snapshot("a", 2, "# Current");
        let stale = snapshot("a", 1, "# Old");
        let current_key = DocumentCacheKey::from_snapshot(&document);
        let stale_key = DocumentCacheKey::from_snapshot(&stale);
        let state = BlockHintDerivationState {
            key: Some(stale_key),
            hints: Some(block_hints(1)),
        };

        assert_eq!(
            resolve_block_hints(&cache, Some(&current_key), Some(&state)),
            None
        );
    }

    #[test]
    fn resolve_block_hints_prefers_cached_document_match() {
        let cache = DocumentDerivedCacheState::shared();
        let document = snapshot("a", 2, "# Current");
        let key = DocumentCacheKey::from_snapshot(&document);
        let hints = block_hints(2);
        cache
            .borrow_mut()
            .insert_block_hints(key.clone(), hints.clone());

        assert_eq!(resolve_block_hints(&cache, Some(&key), None), Some(hints));
    }
}
