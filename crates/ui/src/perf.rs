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

pub(crate) fn trace_sidebar_resize(start_width: u32, end_width: u32, started_at: Option<Instant>) {
    if let Some(started_at) = started_at {
        tracing::info!(
            start_width,
            end_width,
            delta_px = end_width as i64 - start_width as i64,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf chrome resize sidebar"
        );
    }
}

pub(crate) fn trace_chrome_open_modal(
    modal: &'static str,
    trigger: &'static str,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            modal,
            trigger,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf chrome open modal"
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

pub(crate) fn trace_outline_extract(
    tab_id: Option<&str>,
    content_bytes: usize,
    heading_count: usize,
    skipped: bool,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            tab_id,
            content_bytes,
            heading_count,
            skipped,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor outline extract"
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

pub(crate) fn trace_editor_host_lifecycle(
    active_tab_id: Option<&str>,
    host_count: usize,
    created: &[String],
    restored: &[String],
    hidden: &[String],
    retired: &[String],
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        tracing::info!(
            active_tab_id,
            host_count,
            created_count = created.len(),
            restored_count = restored.len(),
            hidden_count = hidden.len(),
            retired_count = retired.len(),
            created = ?created,
            restored = ?restored,
            hidden = ?hidden,
            retired = ?retired,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor host lifecycle"
        );
    }
}

pub(crate) fn trace_editor_host_destroy(instance_ids: &[String]) {
    if perf_enabled() {
        tracing::info!(
            destroy_count = instance_ids.len(),
            instance_ids = ?instance_ids,
            "perf editor host destroy"
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
