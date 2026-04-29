use papyro_core::{
    models::{Theme, ViewMode},
    DocumentSnapshot, DEFAULT_WINDOW_ID,
};
use std::time::Instant;

pub(crate) fn perf_enabled() -> bool {
    std::env::var_os("PAPYRO_PERF").is_some()
}

pub(crate) fn perf_timer() -> Option<Instant> {
    perf_enabled().then(Instant::now)
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct TraceContext<'a> {
    pub tab_id: Option<&'a str>,
    pub revision: Option<u64>,
    pub view_mode: Option<&'a ViewMode>,
    pub content_bytes: Option<usize>,
    pub trigger_reason: &'static str,
    pub interaction_path: &'static str,
}

impl<'a> TraceContext<'a> {
    pub(crate) fn chrome(trigger_reason: &'static str, interaction_path: &'static str) -> Self {
        Self {
            tab_id: None,
            revision: None,
            view_mode: None,
            content_bytes: None,
            trigger_reason,
            interaction_path,
        }
    }

    pub(crate) fn tab(
        tab_id: &'a str,
        trigger_reason: &'static str,
        interaction_path: &'static str,
    ) -> Self {
        Self {
            tab_id: Some(tab_id),
            revision: None,
            view_mode: None,
            content_bytes: None,
            trigger_reason,
            interaction_path,
        }
    }

    pub(crate) fn document(
        document: &'a DocumentSnapshot,
        view_mode: Option<&'a ViewMode>,
        trigger_reason: &'static str,
        interaction_path: &'static str,
    ) -> Self {
        Self {
            tab_id: Some(document.tab_id.as_str()),
            revision: Some(document.revision),
            view_mode,
            content_bytes: Some(document.content.len()),
            trigger_reason,
            interaction_path,
        }
    }

    pub(crate) fn derived(
        tab_id: Option<&'a str>,
        revision: Option<u64>,
        content_bytes: usize,
        trigger_reason: &'static str,
    ) -> Self {
        Self {
            tab_id,
            revision,
            view_mode: None,
            content_bytes: Some(content_bytes),
            trigger_reason,
            interaction_path: "document.derived",
        }
    }

    fn tab_id(self) -> &'a str {
        self.tab_id.unwrap_or("none")
    }

    fn revision(self) -> i64 {
        self.revision.map(|revision| revision as i64).unwrap_or(-1)
    }

    fn view_mode(self) -> &'static str {
        self.view_mode.map(ViewMode::as_str).unwrap_or("none")
    }

    fn content_bytes(self) -> i64 {
        self.content_bytes.map(|bytes| bytes as i64).unwrap_or(-1)
    }
}

pub(crate) fn trace_sidebar_toggle(
    trigger: &'static str,
    collapsed: bool,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        let ctx = TraceContext::chrome(trigger, "chrome.sidebar");
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            collapsed,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf chrome toggle sidebar"
        );
    }
}

pub(crate) fn trace_sidebar_resize(start_width: u32, end_width: u32, started_at: Option<Instant>) {
    if let Some(started_at) = started_at {
        let ctx = TraceContext::chrome("drag_commit", "chrome.sidebar");
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
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
        let ctx = TraceContext::chrome(trigger, "chrome.modal");
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            modal,
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
        let ctx = TraceContext {
            tab_id: None,
            revision: None,
            view_mode: Some(to),
            content_bytes: None,
            trigger_reason: trigger,
            interaction_path: "editor.view_mode",
        };
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            from = from.as_str(),
            to = to.as_str(),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor view mode change"
        );
    }
}

pub(crate) fn trace_theme_toggle(from: &Theme, to: &Theme, started_at: Option<Instant>) {
    if let Some(started_at) = started_at {
        let ctx = TraceContext::chrome("toggle_theme", "chrome.theme");
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            from = theme_name(from),
            to = theme_name(to),
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf chrome toggle theme"
        );
    }
}

pub(crate) fn trace_outline_extract(
    tab_id: Option<&str>,
    revision: Option<u64>,
    content_bytes: usize,
    heading_count: usize,
    skipped: bool,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        let ctx = TraceContext::derived(
            tab_id,
            revision,
            content_bytes,
            if skipped {
                "size_gate"
            } else {
                "document_snapshot"
            },
        );
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            heading_count,
            skipped,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor outline extract"
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

pub(crate) fn trace_preview_render(
    tab_id: &str,
    revision: u64,
    content_bytes: usize,
    code_highlighting: bool,
    live_preview: bool,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        let ctx = TraceContext::derived(
            Some(tab_id),
            Some(revision),
            content_bytes,
            if live_preview {
                "document_snapshot"
            } else {
                "size_gate"
            },
        );
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            code_highlighting,
            live_preview,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor preview render"
        );
    }
}

pub(crate) fn trace_editor_set_view_mode(
    tab_id: &str,
    mode: &ViewMode,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        let ctx = TraceContext {
            tab_id: Some(tab_id),
            revision: None,
            view_mode: Some(mode),
            content_bytes: None,
            trigger_reason: "runtime_command",
            interaction_path: "editor.command",
        };
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            mode = mode.as_str(),
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
        let ctx = TraceContext::tab(tab_id, "runtime_command", "editor.command");
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
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
        let ctx = TraceContext {
            tab_id: active_tab_id,
            revision: None,
            view_mode: None,
            content_bytes: None,
            trigger_reason: "pane_effect",
            interaction_path: "editor.host",
        };
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
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
        let ctx = TraceContext::chrome("idle_destroy", "editor.host");
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            destroy_count = instance_ids.len(),
            instance_ids = ?instance_ids,
            "perf editor host destroy"
        );
    }
}

pub(crate) fn trace_editor_pane_render_prep(
    active_document: Option<&DocumentSnapshot>,
    view_mode: &ViewMode,
    tab_count: usize,
    host_count: usize,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        let ctx = active_document
            .map(|document| {
                TraceContext::document(
                    document,
                    Some(view_mode),
                    "component_render",
                    "editor.render",
                )
            })
            .unwrap_or(TraceContext {
                tab_id: None,
                revision: None,
                view_mode: Some(view_mode),
                content_bytes: None,
                trigger_reason: "component_render",
                interaction_path: "editor.render",
            });
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            tab_count,
            host_count,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor pane render prep"
        );
    }
}

pub(crate) fn trace_editor_stale_bridge_cleanup(cleaned_count: usize, started_at: Option<Instant>) {
    if let Some(started_at) = started_at {
        let ctx = TraceContext::chrome("pane_effect", "editor.host");
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            cleaned_count,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf editor stale bridge cleanup"
        );
    }
}

pub(crate) fn trace_tab_close_trigger(
    tab_id: &str,
    trigger: &'static str,
    started_at: Option<Instant>,
) {
    if let Some(started_at) = started_at {
        let ctx = TraceContext::tab(tab_id, trigger, "editor.tab_close");
        tracing::info!(
            window_id = DEFAULT_WINDOW_ID,
            interaction_path = ctx.interaction_path,
            tab_id = ctx.tab_id(),
            revision = ctx.revision(),
            view_mode = ctx.view_mode(),
            content_bytes = ctx.content_bytes(),
            trigger_reason = ctx.trigger_reason,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf tab close trigger"
        );
    }
}
