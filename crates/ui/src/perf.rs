use papyro_core::models::ViewMode;
use std::time::Instant;

pub(crate) fn perf_enabled() -> bool {
    std::env::var_os("PAPYRO_PERF").is_some()
}

pub(crate) fn perf_timer() -> Option<Instant> {
    perf_enabled().then(Instant::now)
}

pub(crate) fn trace_sidebar_toggle(
    trigger: &'static str,
    collapsed: bool,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            trigger,
            collapsed,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf chrome toggle sidebar"
        );
    }
}

pub(crate) fn trace_view_mode_change(
    trigger: &'static str,
    from: &ViewMode,
    to: &ViewMode,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            trigger,
            from = view_mode_name(from),
            to = view_mode_name(to),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor view mode change"
        );
    }
}

pub(crate) fn trace_editor_refresh_layout(tab_id: &str, started_at: Option<Instant>) {
    if let Some(started_at) = started_at {
        tracing::info!(
            tab_id,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor command refresh_layout"
        );
    }
}

pub(crate) fn trace_editor_set_view_mode(
    tab_id: &str,
    mode: &ViewMode,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            tab_id,
            mode = view_mode_name(mode),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor command set_view_mode"
        );
    }
}

pub(crate) fn trace_editor_set_preferences(
    tab_id: &str,
    auto_link_paste: bool,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            tab_id,
            auto_link_paste,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor command set_preferences"
        );
    }
}

fn view_mode_name(mode: &ViewMode) -> &'static str {
    match mode {
        ViewMode::Source => "source",
        ViewMode::Hybrid => "hybrid",
        ViewMode::Preview => "preview",
    }
}
