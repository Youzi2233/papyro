use dioxus::document::Eval;
use dioxus::prelude::*;
use serde::Deserialize;
use std::collections::HashMap;

pub(super) use papyro_editor::protocol::{EditorCommand, EditorEvent, EditorFormat};

#[derive(Debug, Clone, Deserialize)]
pub(super) struct ClosePerfEvent {
    pub tab_id: String,
    pub phase: String,
    pub elapsed_ms: f64,
}

pub(super) type EditorBridgeMap = Signal<HashMap<String, Eval>>;
pub(super) type RetiredEditorHosts = Signal<Vec<String>>;

pub(super) fn send_editor_destroy(eval: Eval) {
    let _ = eval.send(EditorCommand::Destroy);
}

pub(super) fn perf_enabled() -> bool {
    crate::perf::perf_enabled()
}
