use dioxus::document::Eval;
use dioxus::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(super) enum EditorEvent {
    RuntimeReady { tab_id: String },
    RuntimeError { tab_id: String, message: String },
    ContentChanged { tab_id: String, content: String },
    SaveRequested { tab_id: String },
}

#[derive(Debug, Clone, Deserialize)]
pub(super) struct ClosePerfEvent {
    pub tab_id: String,
    pub phase: String,
    pub elapsed_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(dead_code)]
pub(super) enum EditorCommand {
    SetContent { content: String },
    ApplyFormat { kind: &'static str },
    Focus,
    RefreshLayout,
    Destroy,
}

pub(super) type EditorBridgeMap = Signal<HashMap<String, Eval>>;
pub(super) type RetiredEditorHosts = Signal<Vec<String>>;

pub(super) fn send_editor_destroy(eval: Eval) {
    let _ = eval.send(EditorCommand::Destroy);
}

pub(super) fn perf_enabled() -> bool {
    std::env::var_os("PAPYRO_PERF").is_some()
}
