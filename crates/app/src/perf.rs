use papyro_core::{models::ViewMode, TabContentsMap, DEFAULT_WINDOW_ID};
use std::path::Path;
use std::time::Instant;

pub(crate) fn perf_enabled() -> bool {
    std::env::var_os("PAPYRO_PERF").is_some()
}

pub(crate) fn perf_timer() -> Option<Instant> {
    perf_enabled().then(Instant::now)
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

fn trace_tab_id(tab_id: Option<&str>) -> &str {
    tab_id.unwrap_or("none")
}

fn trace_revision(revision: Option<u64>) -> i64 {
    revision.map(|revision| revision as i64).unwrap_or(-1)
}

fn trace_content_bytes(content_bytes: Option<usize>) -> i64 {
    content_bytes.map(|bytes| bytes as i64).unwrap_or(-1)
}
