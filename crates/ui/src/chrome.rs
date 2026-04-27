use crate::commands::AppCommands;
use crate::perf::{perf_timer, trace_sidebar_toggle};
use dioxus::prelude::*;
use papyro_core::UiState;

pub(crate) fn toggle_sidebar(
    mut ui_state: Signal<UiState>,
    commands: AppCommands,
    trigger: &'static str,
) {
    let started_at = perf_timer();
    let (collapsed, settings, workspace_overrides) = {
        let mut state = ui_state.write();
        state.toggle_sidebar();
        if state.workspace_overrides.sidebar_collapsed.is_some() {
            state.workspace_overrides.sidebar_collapsed = Some(state.settings.sidebar_collapsed);
            (
                state.settings.sidebar_collapsed,
                None,
                Some(state.workspace_overrides.clone()),
            )
        } else {
            (
                state.settings.sidebar_collapsed,
                Some(state.settings.clone()),
                None,
            )
        }
    };

    trace_sidebar_toggle(trigger, collapsed, started_at);

    if let Some(overrides) = workspace_overrides {
        commands.save_workspace_settings.call(overrides);
    } else if let Some(settings) = settings {
        commands.save_settings.call(settings);
    }
}
