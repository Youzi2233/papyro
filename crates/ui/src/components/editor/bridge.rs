use dioxus::document::Eval;
use dioxus::prelude::*;
use std::collections::HashMap;
use std::time::Duration;

pub(super) use papyro_editor::protocol::{EditorCommand, EditorEvent};

#[derive(Clone)]
pub(super) struct EditorBridge {
    pub eval: Eval,
    pub instance_id: String,
}

pub(super) type EditorBridgeMap = Signal<HashMap<String, EditorBridge>>;
pub(super) type RetiredEditorHosts = Signal<Vec<String>>;

const EDITOR_DESTROY_IDLE_DELAY: Duration = Duration::from_millis(80);

pub(super) fn send_editor_destroy(bridge: EditorBridge) {
    send_editor_destroy_batch(vec![bridge]);
}

pub(super) fn send_editor_destroy_batch(bridges: Vec<EditorBridge>) {
    if bridges.is_empty() {
        return;
    }

    spawn(async move {
        tokio::time::sleep(EDITOR_DESTROY_IDLE_DELAY).await;
        for bridge in bridges {
            let _ = bridge.eval.send(EditorCommand::Destroy {
                instance_id: bridge.instance_id,
            });
        }
    });
}

pub(super) fn perf_enabled() -> bool {
    crate::perf::perf_enabled()
}
