use super::bridge::{send_editor_destroy_batch, EditorBridgeMap};
use super::document_cache::{DocumentCacheKey, DocumentDerivedCache, DocumentDerivedCacheState};
use super::host::EditorHost;
use super::outline::OutlinePane;
use super::preview::{PreviewLinkBridge, PreviewPane};
use super::tabbar::EditorTabButton;
use crate::commands::AppCommands;
use crate::components::primitives::{
    Button, ButtonVariant, EditorTabScrollButton, EditorToolButton, EmptyRecentItem,
    EmptyStateCopy, EmptyStateSurface, InlineOverflow, RawButton, ToolbarZone, ToolbarZoneKind,
};
use crate::context::use_app_context;
use crate::i18n::{use_i18n, UiText};
use crate::perf::{
    perf_timer, trace_editor_host_lifecycle, trace_editor_pane_render_prep,
    trace_editor_stale_bridge_cleanup,
};
use crate::view_model::{
    EditorHostItemViewModel, EditorSurfaceViewModel, EditorTabItemViewModel, WorkspaceViewModel,
};
use dioxus::prelude::*;
use papyro_core::models::{Theme, ViewMode};
use papyro_core::DocumentSnapshot;
use papyro_editor::parser::{
    analyze_markdown_block_snapshot_with_options, MarkdownBlockAnalysisOptions,
    MarkdownBlockHintSet,
};
use papyro_editor::renderer::CodeHighlightTheme;
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

fn code_highlight_theme(theme: &Theme) -> CodeHighlightTheme {
    if theme.is_dark() {
        CodeHighlightTheme::Dark
    } else {
        CodeHighlightTheme::Light
    }
}

fn theme_value(theme: &Theme) -> &'static str {
    if theme.is_dark() {
        "dark"
    } else {
        "light"
    }
}

fn sidebar_toggle_label(i18n: UiText, collapsed: bool) -> &'static str {
    if collapsed {
        i18n.text("Show sidebar (Ctrl+\\)", "显示侧边栏 (Ctrl+\\)")
    } else {
        i18n.text("Hide sidebar (Ctrl+\\)", "隐藏侧边栏 (Ctrl+\\)")
    }
}

fn sidebar_toggle_icon_class(collapsed: bool) -> &'static str {
    if collapsed {
        "mn-tool-icon sidebar-closed"
    } else {
        "mn-tool-icon sidebar-open"
    }
}

fn scroll_editor_tabs(delta: i32) {
    document::eval(&format!(
        r#"document.querySelector(".mn-tabbar")?.scrollBy({{ left: {delta}, behavior: "smooth" }});"#
    ));
}

fn minimize_app_window() {
    #[cfg(feature = "desktop-shell")]
    {
        dioxus::desktop::window().set_minimized(true);
    }
}

fn toggle_maximized_app_window() {
    #[cfg(feature = "desktop-shell")]
    {
        dioxus::desktop::window().toggle_maximized();
    }
}

fn close_app_window() {
    #[cfg(feature = "desktop-shell")]
    {
        dioxus::desktop::window().close();
    }
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
    let theme = (app.theme)();
    let highlight_theme = if view_mode == ViewMode::Preview {
        code_highlight_theme(&theme)
    } else {
        CodeHighlightTheme::Light
    };
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
                theme,
                outline_visible,
                sidebar_collapsed,
                commands: commands.clone(),
                on_settings,
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
                                highlight_theme,
                            }
                        }
                        if outline_visible {
                            OutlinePane {
                                active_document: pane.active_document.clone(),
                                view_mode: view_mode.clone(),
                            }
                        }
                    }
                }
            } else {
                EditorEmptyState {
                    commands: commands.clone(),
                    workspace: workspace.clone(),
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
    theme: Theme,
    outline_visible: bool,
    sidebar_collapsed: bool,
    commands: AppCommands,
    on_settings: EventHandler<()>,
) -> Element {
    let i18n = use_i18n();
    let sidebar_commands = commands.clone();
    let outline_tool_commands = commands.clone();
    let theme_commands = commands.clone();
    let sidebar_label = sidebar_toggle_label(i18n, sidebar_collapsed);
    let sidebar_icon_class = sidebar_toggle_icon_class(sidebar_collapsed);
    let outline_label = if outline_visible {
        i18n.text("Hide outline", "隐藏大纲")
    } else {
        i18n.text("Show outline", "显示大纲")
    };
    let active_tab_id = tab_items
        .iter()
        .find(|item| item.is_active)
        .map(|item| item.id.clone());
    let can_insert = has_active_tab && view_mode.is_editable();

    rsx! {
        div { class: "mn-editor-chrome-shell",
            div {
                class: "mn-editor-chrome mn-sticky-toolbar mn-editor-titlebar",
                onmousedown: crate::chrome::drag_window_on_primary_mouse_down,
                ondoubleclick: move |_| toggle_maximized_app_window(),
                ToolbarZone { kind: ToolbarZoneKind::Flexible, class_name: String::new(),
                    if sidebar_collapsed {
                        EditorToolButton {
                            label: sidebar_label.to_string(),
                            class_name: "mn-editor-sidebar-toggle".to_string(),
                            icon_class: sidebar_icon_class.to_string(),
                            disabled: false,
                            selected: false,
                            on_click: move |_| {
                                crate::chrome::toggle_sidebar(sidebar_commands.clone(), "editor");
                            },
                        }
                    }
                    EditorTabScrollButton {
                        label: i18n.text("Scroll tabs left", "向左滚动标签").to_string(),
                        icon_class: "mn-tool-icon tab-left".to_string(),
                        class_name: String::new(),
                        on_click: move |_| scroll_editor_tabs(-220),
                    }
                    InlineOverflow { class_name: "mn-tabbar".to_string(),
                        if !tab_items.is_empty() {
                            for item in tab_items.iter().cloned() {
                                EditorTabButton {
                                    key: "{item.id}",
                                    item,
                                }
                            }
                        }
                    }
                    EditorTabScrollButton {
                        label: i18n.text("Scroll tabs right", "向右滚动标签").to_string(),
                        icon_class: "mn-tool-icon tab-right".to_string(),
                        class_name: String::new(),
                        on_click: move |_| scroll_editor_tabs(220),
                    }
                }
                ToolbarZone { kind: ToolbarZoneKind::Fixed, class_name: String::new(),
                    ThemeSwitch {
                        label: i18n.text("Theme", "主题").to_string(),
                        selected: theme_value(&theme).to_string(),
                        on_change: move |value: String| {
                            if value != theme_value(&theme) {
                                crate::chrome::toggle_theme(theme_commands.clone());
                            }
                        },
                    }
                    EditorToolButton {
                        label: i18n.text("Settings", "设置").to_string(),
                        class_name: "mn-editor-settings-button".to_string(),
                        icon_class: "mn-tool-icon settings".to_string(),
                        disabled: false,
                        selected: false,
                        on_click: move |_| on_settings.call(()),
                    }
                    WindowControls {}
                }
            }
            div { class: "mn-markdown-toolbar",
                div { class: "mn-markdown-tools-left",
                    MarkdownToolButton {
                        label: i18n.text("Heading", "标题").to_string(),
                        icon_class: "mn-tool-icon heading".to_string(),
                        disabled: !can_insert,
                        commands: commands.clone(),
                        active_tab_id: active_tab_id.clone(),
                        template: TEMPLATE_HEADING,
                    }
                    MarkdownToolButton {
                        label: i18n.text("Bold", "加粗").to_string(),
                        icon_class: "mn-tool-icon bold".to_string(),
                        disabled: !can_insert,
                        commands: commands.clone(),
                        active_tab_id: active_tab_id.clone(),
                        template: TEMPLATE_BOLD,
                    }
                    MarkdownToolButton {
                        label: i18n.text("Italic", "斜体").to_string(),
                        icon_class: "mn-tool-icon italic".to_string(),
                        disabled: !can_insert,
                        commands: commands.clone(),
                        active_tab_id: active_tab_id.clone(),
                        template: TEMPLATE_ITALIC,
                    }
                    MarkdownToolButton {
                        label: i18n.text("Quote", "引用").to_string(),
                        icon_class: "mn-tool-icon quote".to_string(),
                        disabled: !can_insert,
                        commands: commands.clone(),
                        active_tab_id: active_tab_id.clone(),
                        template: TEMPLATE_QUOTE,
                    }
                    MarkdownToolButton {
                        label: i18n.text("Code", "代码").to_string(),
                        icon_class: "mn-tool-icon code".to_string(),
                        disabled: !can_insert,
                        commands: commands.clone(),
                        active_tab_id: active_tab_id.clone(),
                        template: TEMPLATE_CODE,
                    }
                    MarkdownToolButton {
                        label: i18n.text("Link", "链接").to_string(),
                        icon_class: "mn-tool-icon link".to_string(),
                        disabled: !can_insert,
                        commands: commands.clone(),
                        active_tab_id: active_tab_id.clone(),
                        template: TEMPLATE_LINK,
                    }
                    MarkdownToolButton {
                        label: i18n.text("List", "列表").to_string(),
                        icon_class: "mn-tool-icon list".to_string(),
                        disabled: !can_insert,
                        commands: commands.clone(),
                        active_tab_id: active_tab_id.clone(),
                        template: TEMPLATE_LIST,
                    }
                    MarkdownToolButton {
                        label: i18n.text("Task list", "任务列表").to_string(),
                        icon_class: "mn-tool-icon task".to_string(),
                        disabled: !can_insert,
                        commands: commands.clone(),
                        active_tab_id: active_tab_id.clone(),
                        template: TEMPLATE_TASK,
                    }
                    MarkdownToolButton {
                        label: i18n.text("Table", "表格").to_string(),
                        icon_class: "mn-tool-icon table".to_string(),
                        disabled: !can_insert,
                        commands: commands.clone(),
                        active_tab_id: active_tab_id.clone(),
                        template: TEMPLATE_TABLE,
                    }
                }
                div { class: "mn-markdown-tools-right",
                    EditorToolButton {
                        label: outline_label.to_string(),
                        class_name: "mn-editor-outline-toggle".to_string(),
                        icon_class: "mn-tool-icon outline".to_string(),
                        disabled: !has_active_tab,
                        selected: outline_visible,
                        on_click: move |_| outline_tool_commands.toggle_outline.call(()),
                    }
                }
            }
        }
    }
}

#[component]
fn ThemeSwitch(label: String, selected: String, on_change: EventHandler<String>) -> Element {
    rsx! {
        div {
            class: "mn-theme-switch",
            role: "radiogroup",
            "aria-label": "{label}",
            onmousedown: move |event| event.stop_propagation(),
            ondoubleclick: move |event| event.stop_propagation(),
            ThemeSwitchOption {
                label: "Light theme".to_string(),
                value: "light".to_string(),
                icon_class: "mn-tool-icon sun".to_string(),
                selected: selected == "light",
                on_change,
            }
            ThemeSwitchOption {
                label: "Dark theme".to_string(),
                value: "dark".to_string(),
                icon_class: "mn-tool-icon moon".to_string(),
                selected: selected == "dark",
                on_change,
            }
        }
    }
}

#[component]
fn ThemeSwitchOption(
    label: String,
    value: String,
    icon_class: String,
    selected: bool,
    on_change: EventHandler<String>,
) -> Element {
    rsx! {
        RawButton {
            class_name: (if selected { "mn-theme-switch-option active" } else { "mn-theme-switch-option" }).to_string(),
            label: Some(label),
            title: None::<String>,
            disabled: false,
            pressed: None::<bool>,
            checked: Some(selected),
            role: Some("radio".to_string()),
            stop_events: true,
            on_click: move |event: MouseEvent| {
                event.stop_propagation();
                on_change.call(value.clone());
            },
            on_context_menu: None::<EventHandler<MouseEvent>>,
            span { class: "{icon_class}", "aria-hidden": "true" }
        }
    }
}

#[component]
fn MarkdownToolButton(
    label: String,
    icon_class: String,
    disabled: bool,
    commands: AppCommands,
    active_tab_id: Option<String>,
    template: &'static str,
) -> Element {
    rsx! {
        RawButton {
            class_name: "mn-markdown-tool".to_string(),
            label: Some(label.clone()),
            title: Some(label),
            disabled,
            pressed: None::<bool>,
            checked: None::<bool>,
            role: None::<String>,
            stop_events: false,
            on_click: move |_| {
                if let Some(tab_id) = active_tab_id.clone() {
                    insert_markdown_template(commands.clone(), tab_id, template);
                }
            },
            on_context_menu: None::<EventHandler<MouseEvent>>,
            span { class: "{icon_class}", "aria-hidden": "true" }
        }
    }
}

#[component]
fn WindowControls() -> Element {
    let i18n = use_i18n();

    rsx! {
        div {
            class: "mn-window-controls",
            onmousedown: move |event| event.stop_propagation(),
            ondoubleclick: move |event| event.stop_propagation(),
            RawButton {
                class_name: "mn-window-control minimize".to_string(),
                label: Some(i18n.text("Minimize window", "最小化窗口").to_string()),
                title: None::<String>,
                disabled: false,
                pressed: None::<bool>,
                checked: None::<bool>,
                role: None::<String>,
                stop_events: false,
                on_click: move |_| minimize_app_window(),
                on_context_menu: None::<EventHandler<MouseEvent>>,
                span { "aria-hidden": "true" }
            }
            RawButton {
                class_name: "mn-window-control maximize".to_string(),
                label: Some(i18n.text("Maximize window", "最大化窗口").to_string()),
                title: None::<String>,
                disabled: false,
                pressed: None::<bool>,
                checked: None::<bool>,
                role: None::<String>,
                stop_events: false,
                on_click: move |_| toggle_maximized_app_window(),
                on_context_menu: None::<EventHandler<MouseEvent>>,
                span { "aria-hidden": "true" }
            }
            RawButton {
                class_name: "mn-window-control close".to_string(),
                label: Some(i18n.text("Close window", "关闭窗口").to_string()),
                title: None::<String>,
                disabled: false,
                pressed: None::<bool>,
                checked: None::<bool>,
                role: None::<String>,
                stop_events: false,
                on_click: move |_| close_app_window(),
                on_context_menu: None::<EventHandler<MouseEvent>>,
                span { "aria-hidden": "true" }
            }
        }
    }
}

fn insert_markdown_template(commands: AppCommands, tab_id: String, template: &str) {
    let (markdown, cursor_offset) = markdown_insert_template(template);
    commands
        .insert_markdown
        .call(crate::commands::InsertMarkdownRequest {
            tab_id,
            markdown,
            cursor_offset,
        });
}

const INSERT_CURSOR_MARKER: &str = "{|cursor|}";
const TEMPLATE_HEADING: &str = "## {|cursor|}";
const TEMPLATE_BOLD: &str = "**{|cursor|}**";
const TEMPLATE_ITALIC: &str = "*{|cursor|}*";
const TEMPLATE_QUOTE: &str = "\n> {|cursor|}";
const TEMPLATE_CODE: &str = "`{|cursor|}`";
const TEMPLATE_LINK: &str = "[{|cursor|}](https://)";
const TEMPLATE_LIST: &str = "\n- {|cursor|}";
const TEMPLATE_TASK: &str = "\n- [ ] {|cursor|}";
const TEMPLATE_TABLE: &str = "\n| Column | Column |\n| --- | --- |\n| {|cursor|} |  |\n";

fn markdown_insert_template(template: &str) -> (String, Option<usize>) {
    let Some(cursor_offset) = template.find(INSERT_CURSOR_MARKER) else {
        return (template.to_string(), None);
    };

    let mut markdown = String::with_capacity(template.len() - INSERT_CURSOR_MARKER.len());
    markdown.push_str(&template[..cursor_offset]);
    markdown.push_str(&template[cursor_offset + INSERT_CURSOR_MARKER.len()..]);
    (markdown, Some(cursor_offset))
}

#[component]
fn EditorEmptyState(commands: AppCommands, workspace: WorkspaceViewModel) -> Element {
    let i18n = use_i18n();
    let create_commands = commands.clone();
    let open_commands = commands.clone();
    let onboarding_open_commands = commands.clone();
    let has_workspace = workspace.path.is_some();
    let recent_workspaces = workspace.recent_workspaces.clone();

    rsx! {
        EmptyStateSurface {
            onboarding: !has_workspace,
            class_name: String::new(),
                if has_workspace {
                    EmptyStateCopy {
                        title: i18n.text("Open a note", "打开一篇笔记").to_string(),
                        description: i18n.text(
                            "Pick a Markdown file from the sidebar or start a new note.",
                            "从侧边栏选择 Markdown 文件，或新建一篇笔记。",
                        )
                        .to_string(),
                    }
                    div { class: "mn-empty-actions",
                        Button {
                            label: i18n.text("New note", "新建笔记").to_string(),
                            variant: ButtonVariant::Primary,
                            disabled: false,
                            on_click: move |_| create_commands.create_note.call("Untitled".to_string()),
                        }
                        Button {
                            label: i18n.text("Open workspace", "打开工作区").to_string(),
                            variant: ButtonVariant::Default,
                            disabled: false,
                            on_click: move |_| open_commands.open_workspace.call(()),
                        }
                    }
                } else {
                    EmptyStateCopy {
                        title: i18n.text("Choose a workspace", "选择工作区").to_string(),
                        description: i18n.text(
                            "Open a folder of Markdown notes to begin.",
                            "打开一个 Markdown 笔记目录即可开始。",
                        )
                        .to_string(),
                    }
                    Button {
                        label: i18n.text("Open workspace", "打开工作区").to_string(),
                        variant: ButtonVariant::Primary,
                        disabled: false,
                        on_click: move |_| onboarding_open_commands.open_workspace.call(()),
                    }
                    if !recent_workspaces.is_empty() {
                        div { class: "mn-empty-recent",
                            p { class: "mn-empty-recent-title", {i18n.text("Recent workspaces", "最近工作区")} }
                            div { class: "mn-empty-recent-list",
                                for item in recent_workspaces.iter().take(4).cloned() {
                                    EmptyRecentItem {
                                        key: "{item.path.display()}",
                                        name: item.name.clone(),
                                        detail: item.path.display().to_string(),
                                        title: item.path.display().to_string(),
                                        on_click: {
                                            let commands = commands.clone();
                                            let path = item.path.clone();
                                            move |_| commands.open_workspace_path.call(path.clone())
                                        },
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
    use crate::i18n::i18n_for;
    use papyro_core::models::AppLanguage;
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
    fn editor_chrome_markdown_template_tracks_cursor_offset() {
        assert_eq!(
            markdown_insert_template("**{|cursor|}**"),
            ("****".to_string(), Some(2))
        );
        assert_eq!(
            markdown_insert_template("plain"),
            ("plain".to_string(), None)
        );
    }

    #[test]
    fn editor_chrome_theme_value_groups_light_and_dark_themes() {
        assert_eq!(theme_value(&Theme::Light), "light");
        assert_eq!(theme_value(&Theme::WarmReading), "light");
        assert_eq!(theme_value(&Theme::Dark), "dark");
        assert_eq!(theme_value(&Theme::HighContrast), "dark");
    }

    #[test]
    fn editor_chrome_icon_helpers_reflect_panel_state() {
        let i18n = i18n_for(AppLanguage::English);
        assert_eq!(sidebar_toggle_label(i18n, false), "Hide sidebar (Ctrl+\\)");
        assert_eq!(sidebar_toggle_label(i18n, true), "Show sidebar (Ctrl+\\)");
        assert_eq!(
            sidebar_toggle_icon_class(false),
            "mn-tool-icon sidebar-open"
        );
        assert_eq!(
            sidebar_toggle_icon_class(true),
            "mn-tool-icon sidebar-closed"
        );
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
