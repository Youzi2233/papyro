use crate::commands::AppCommands;
use crate::perf::{perf_timer, trace_sidebar_toggle, trace_theme_toggle, trace_view_mode_change};
use dioxus::prelude::*;
use papyro_core::models::ViewMode;
use papyro_core::{
    settings_target_theme, sidebar_toggle_target, sidebar_width_target, theme_toggle_target,
    view_mode_target, ChromeSettingsTarget, UiState,
};

pub(crate) fn toggle_sidebar(
    ui_state: Signal<UiState>,
    commands: AppCommands,
    trigger: &'static str,
) {
    let started_at = perf_timer();
    let (collapsed, target) = {
        let state = ui_state.read();
        sidebar_toggle_target(&state)
    };

    call_settings_target(commands, target);

    trace_sidebar_toggle(trigger, collapsed, started_at);
}

pub(crate) fn toggle_theme(ui_state: Signal<UiState>, commands: AppCommands) {
    let started_at = perf_timer();
    let (from_theme, target) = {
        let state = ui_state.read();
        (state.theme().clone(), theme_toggle_target(&state))
    };
    let to_theme = settings_target_theme(&target);

    call_settings_target(commands, target);
    trace_theme_toggle(&from_theme, &to_theme, started_at);
}

pub(crate) fn set_view_mode(
    ui_state: Signal<UiState>,
    commands: AppCommands,
    mode: ViewMode,
    trigger: &'static str,
) {
    let started_at = perf_timer();
    let Some((previous_mode, next_mode, target)) = ({
        let state = ui_state.read();
        view_mode_target(&state, mode)
    }) else {
        return;
    };

    call_settings_target(commands, target);

    trace_view_mode_change(trigger, &previous_mode, &next_mode, started_at);
}

pub(crate) fn set_sidebar_width(ui_state: Signal<UiState>, commands: AppCommands, width: u32) {
    let target = {
        let state = ui_state.read();
        sidebar_width_target(&state, width)
    };

    if let Some(target) = target {
        call_settings_target(commands, target);
    }
}

fn call_settings_target(commands: AppCommands, target: ChromeSettingsTarget) {
    match target {
        ChromeSettingsTarget::Global(settings) => commands.save_settings.call(settings),
        ChromeSettingsTarget::Workspace(overrides) => {
            commands.save_workspace_settings.call(overrides)
        }
    }
}
