use crate::commands::AppCommands;
use crate::perf::{perf_timer, trace_sidebar_toggle, trace_view_mode_change};
use dioxus::prelude::*;
use papyro_core::models::{Theme, ViewMode};
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

pub(crate) fn toggle_theme(ui_state: Signal<UiState>, commands: AppCommands) {
    let (settings, workspace_overrides) = {
        let state = ui_state.read();
        let next_theme = next_theme(state.theme());
        if state.workspace_overrides.theme.is_some() {
            let mut overrides = state.workspace_overrides.clone();
            overrides.theme = Some(next_theme);
            (None, Some(overrides))
        } else {
            let mut settings = state.settings.clone();
            settings.theme = next_theme;
            (Some(settings), None)
        }
    };

    if let Some(overrides) = workspace_overrides {
        commands.save_workspace_settings.call(overrides);
    } else if let Some(settings) = settings {
        commands.save_settings.call(settings);
    }
}

pub(crate) fn set_view_mode(
    ui_state: Signal<UiState>,
    commands: AppCommands,
    mode: ViewMode,
    trigger: &'static str,
) {
    let started_at = perf_timer();
    let (previous_mode, next_mode, settings, workspace_overrides) = {
        let state = ui_state.read();
        let previous_mode = state.settings.view_mode.clone();
        if previous_mode == mode {
            return;
        }

        if state.workspace_overrides.view_mode.is_some() {
            let mut overrides = state.workspace_overrides.clone();
            overrides.view_mode = Some(mode.clone());
            (previous_mode, mode, None, Some(overrides))
        } else {
            let mut settings = state.settings.clone();
            settings.view_mode = mode.clone();
            (previous_mode, mode, Some(settings), None)
        }
    };

    trace_view_mode_change(trigger, &previous_mode, &next_mode, started_at);

    if let Some(overrides) = workspace_overrides {
        commands.save_workspace_settings.call(overrides);
    } else if let Some(settings) = settings {
        commands.save_settings.call(settings);
    }
}

fn next_theme(theme: &Theme) -> Theme {
    match theme {
        Theme::Light | Theme::System => Theme::Dark,
        Theme::Dark => Theme::Light,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_theme_toggles_between_light_and_dark() {
        assert_eq!(next_theme(&Theme::System), Theme::Dark);
        assert_eq!(next_theme(&Theme::Light), Theme::Dark);
        assert_eq!(next_theme(&Theme::Dark), Theme::Light);
    }
}
