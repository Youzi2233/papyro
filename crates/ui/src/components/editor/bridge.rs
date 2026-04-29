use dioxus::document::Eval;
use dioxus::prelude::*;
use std::collections::HashMap;
use std::time::Duration;

use crate::perf::trace_editor_host_destroy;

pub(super) use papyro_editor::protocol::{EditorCommand, EditorEvent};

#[derive(Clone)]
pub(super) struct EditorBridge {
    pub eval: Eval,
    pub instance_id: String,
}

pub(super) type EditorBridgeMap = Signal<HashMap<String, EditorBridge>>;

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
        let instance_ids: Vec<String> = bridges
            .iter()
            .map(|bridge| bridge.instance_id.clone())
            .collect();
        trace_editor_host_destroy(&instance_ids);
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
