use crate::actions::AppAction;
use crate::state::RuntimeState;
use dioxus::prelude::ReadableExt;
use papyro_core::{
    models::{Theme, ViewMode},
    TabContentsMap, DEFAULT_WINDOW_ID,
};
use papyro_editor::parser::INTERACTIVE_BLOCK_ANALYSIS_MAX_BYTES;
use std::path::Path;
use std::time::Instant;

pub(crate) fn perf_enabled() -> bool {
    std::env::var_os("PAPYRO_PERF").is_some()
}

pub(crate) fn perf_timer() -> Option<Instant> {
    perf_enabled().then(Instant::now)
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct HybridInputTraceContext<'a> {
    pub block_kind: Option<&'a str>,
    pub block_state: Option<&'a str>,
    pub block_tier: Option<&'a str>,
    pub fallback_reason: Option<&'a str>,
}

pub(crate) fn tab_revision_and_bytes(
    tab_contents: &TabContentsMap,
    tab_id: &str,
) -> (Option<u64>, Option<usize>) {
    (
        tab_contents.revision_for_tab(tab_id),
        tab_contents.content_for_tab(tab_id).map(str::len),
    )
}

pub(crate) fn trace_app_dispatch(
    action: &AppAction,
    state: RuntimeState,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        let view_mode = state.ui_state.read().view_mode.clone();
        let tab_id = action
            .trace_tab_id()
            .map(str::to_string)
            .or_else(|| state.editor_tabs.read().active_tab_id.clone());
        let (revision, content_bytes) = tab_id
            .as_deref()
            .map(|tab_id| tab_revision_and_bytes(&state.tab_contents.read(), tab_id))
            .unwrap_or((None, None));

        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = action.trace_interaction_path(),
            tab_id = trace_tab_id(tab_id.as_deref()),
            revision = trace_revision(revision),
            view_mode = view_mode.as_str(),
            content_bytes = trace_content_bytes(content_bytes),
            trigger_reason = "app_dispatch",
            action = action.trace_name(),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf app dispatch action"
        );
    }
}

pub(crate) fn trace_editor_open_markdown(
    path: &Path,
    tab_id: Option<&str>,
    revision: Option<u64>,
    view_mode: &ViewMode,
    content_bytes: Option<usize>,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = "editor.open_markdown",
            tab_id = trace_tab_id(tab_id),
            revision = trace_revision(revision),
            view_mode = view_mode.as_str(),
            content_bytes = trace_content_bytes(content_bytes),
            trigger_reason = "open_markdown_use_case",
            path = %path.display(),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor open markdown"
        );
    }
}

pub(crate) fn trace_editor_switch_tab(
    tab_id: &str,
    revision: Option<u64>,
    view_mode: &ViewMode,
    content_bytes: Option<usize>,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = "editor.tab_switch",
            tab_id = tab_id,
            revision = trace_revision(revision),
            view_mode = view_mode.as_str(),
            content_bytes = trace_content_bytes(content_bytes),
            trigger_reason = "app_action",
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor switch tab"
        );
    }
}

pub(crate) fn trace_editor_input_change(
    tab_id: &str,
    revision: Option<u64>,
    view_mode: &ViewMode,
    content_bytes: usize,
    changed: bool,
    hybrid: HybridInputTraceContext<'_>,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = "editor.input",
            tab_id = tab_id,
            revision = trace_revision(revision),
            view_mode = view_mode.as_str(),
            content_bytes,
            trigger_reason = "editor_event",
            changed,
            hybrid_block_kind = trace_optional(hybrid.block_kind),
            hybrid_block_state = trace_optional(hybrid.block_state),
            hybrid_block_tier = trace_optional(hybrid.block_tier),
            hybrid_fallback_reason = trace_optional(hybrid.fallback_reason),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor input change"
        );
    }
}

pub(crate) fn trace_runtime_close_tab_handler(
    tab_id: &str,
    revision: Option<u64>,
    view_mode: &ViewMode,
    content_bytes: Option<usize>,
    close_intent: &'static str,
    closed: bool,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = "editor.tab_close",
            tab_id = tab_id,
            revision = trace_revision(revision),
            view_mode = view_mode.as_str(),
            content_bytes = trace_content_bytes(content_bytes),
            trigger_reason = "app_action",
            close_intent,
            closed,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf runtime close_tab handler"
        );
    }
}

pub(crate) fn trace_chrome_toggle_sidebar(
    trigger: &str,
    collapsed: bool,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = "chrome.sidebar",
            tab_id = trace_tab_id(None),
            revision = trace_revision(None),
            view_mode = "none",
            content_bytes = trace_content_bytes(None),
            trigger_reason = trigger,
            collapsed,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf chrome toggle sidebar"
        );
    }
}

pub(crate) fn trace_chrome_toggle_theme(from: &Theme, to: &Theme, started_at: Option<Instant>) {
    if let Some(started_at) = started_at {
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = "chrome.theme",
            tab_id = trace_tab_id(None),
            revision = trace_revision(None),
            view_mode = "none",
            content_bytes = trace_content_bytes(None),
            trigger_reason = "toggle_theme",
            from = theme_name(from),
            to = theme_name(to),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf chrome toggle theme"
        );
    }
}

pub(crate) fn trace_workspace_search(
    query: &str,
    limit: usize,
    result_count: Option<usize>,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = "workspace.search",
            tab_id = trace_tab_id(None),
            revision = trace_revision(None),
            view_mode = "none",
            content_bytes = trace_content_bytes(None),
            trigger_reason = "search_use_case",
            query_bytes = query.len(),
            limit,
            result_count = trace_result_count(result_count),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf workspace search"
        );
    }
}

pub(crate) fn trace_editor_view_mode_change(
    trigger: &str,
    tab_id: Option<&str>,
    revision: Option<u64>,
    content_bytes: Option<usize>,
    from: &ViewMode,
    to: &ViewMode,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = "editor.view_mode",
            tab_id = trace_tab_id(tab_id),
            revision = trace_revision(revision),
            view_mode = to.as_str(),
            content_bytes = trace_content_bytes(content_bytes),
            trigger_reason = trigger,
            hybrid_render_gate = hybrid_render_gate(content_bytes, to),
            from = from.as_str(),
            to = to.as_str(),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor view mode change"
        );
    }
}

fn theme_name(theme: &Theme) -> &'static str {
    match theme {
        Theme::System => "system",
        Theme::Light => "light",
        Theme::Dark => "dark",
    }
}

fn trace_tab_id(tab_id: Option<&str>) -> &str {
    tab_id.unwrap_or("none")
}

fn trace_revision(revision: Option<u64>) -> i64 {
    revision.map(|revision| revision as i64).unwrap_or(-1)
}

fn trace_content_bytes(content_bytes: Option<usize>) -> i64 {
    content_bytes.map(|bytes| bytes as i64).unwrap_or(-1)
}

fn trace_result_count(result_count: Option<usize>) -> i64 {
    result_count.map(|count| count as i64).unwrap_or(-1)
}

fn trace_optional(value: Option<&str>) -> &str {
    value.filter(|value| !value.is_empty()).unwrap_or("none")
}

fn hybrid_render_gate(content_bytes: Option<usize>, to: &ViewMode) -> &'static str {
    if to != &ViewMode::Hybrid {
        return "inactive";
    }

    match content_bytes {
        Some(bytes) if bytes <= INTERACTIVE_BLOCK_ANALYSIS_MAX_BYTES => "block_hints",
        Some(_) => "source_fallback",
        None => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::DocumentStats;

    #[test]
    fn tab_revision_and_bytes_reports_open_tab_metadata() {
        let mut tab_contents = TabContentsMap::default();
        tab_contents.insert_tab(
            "tab-a".to_string(),
            "hello".to_string(),
            DocumentStats::default(),
        );
        assert_eq!(
            tab_contents.update_tab_content("tab-a", "hello world".to_string()),
            Some(1)
        );

        assert_eq!(
            tab_revision_and_bytes(&tab_contents, "tab-a"),
            (Some(1), Some(11))
        );
        assert_eq!(
            tab_revision_and_bytes(&tab_contents, "missing"),
            (None, None)
        );
    }

    #[test]
    fn missing_trace_fields_use_smoke_checker_sentinels() {
        assert_eq!(trace_tab_id(Some("tab-a")), "tab-a");
        assert_eq!(trace_tab_id(None), "none");
        assert_eq!(trace_revision(Some(7)), 7);
        assert_eq!(trace_revision(None), -1);
        assert_eq!(trace_content_bytes(Some(1024)), 1024);
        assert_eq!(trace_content_bytes(None), -1);
        assert_eq!(trace_result_count(Some(50)), 50);
        assert_eq!(trace_result_count(None), -1);
        assert_eq!(trace_optional(Some("table")), "table");
        assert_eq!(trace_optional(Some("")), "none");
        assert_eq!(trace_optional(None), "none");
        assert_eq!(
            hybrid_render_gate(
                Some(INTERACTIVE_BLOCK_ANALYSIS_MAX_BYTES),
                &ViewMode::Hybrid
            ),
            "block_hints"
        );
        assert_eq!(
            hybrid_render_gate(
                Some(INTERACTIVE_BLOCK_ANALYSIS_MAX_BYTES + 1),
                &ViewMode::Hybrid
            ),
            "source_fallback"
        );
        assert_eq!(
            hybrid_render_gate(Some(1024), &ViewMode::Source),
            "inactive"
        );
    }

    #[test]
    fn theme_names_match_settings_contract() {
        assert_eq!(theme_name(&Theme::System), "system");
        assert_eq!(theme_name(&Theme::Light), "light");
        assert_eq!(theme_name(&Theme::Dark), "dark");
    }
}
