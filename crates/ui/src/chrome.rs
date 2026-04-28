use crate::commands::AppCommands;
use crate::perf::{perf_timer, trace_sidebar_toggle, trace_view_mode_change};
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, Theme, ViewMode, WorkspaceSettingsOverrides};
use papyro_core::UiState;

#[derive(Debug, Clone, PartialEq)]
enum SettingsSaveTarget {
    Global(AppSettings),
    Workspace(WorkspaceSettingsOverrides),
}

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
    let target = {
        let state = ui_state.read();
        theme_toggle_target(&state)
    };

    call_settings_target(commands, target);
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

fn call_settings_target(commands: AppCommands, target: SettingsSaveTarget) {
    match target {
        SettingsSaveTarget::Global(settings) => commands.save_settings.call(settings),
        SettingsSaveTarget::Workspace(overrides) => {
            commands.save_workspace_settings.call(overrides)
        }
    }
}

fn sidebar_toggle_target(state: &UiState) -> (bool, SettingsSaveTarget) {
    let collapsed = !state.settings.sidebar_collapsed;
    if state.workspace_overrides.sidebar_collapsed.is_some() {
        let mut overrides = state.workspace_overrides.clone();
        overrides.sidebar_collapsed = Some(collapsed);
        (collapsed, SettingsSaveTarget::Workspace(overrides))
    } else {
        let mut settings = state.global_settings.clone();
        settings.sidebar_collapsed = collapsed;
        (collapsed, SettingsSaveTarget::Global(settings))
    }
}

fn theme_toggle_target(state: &UiState) -> SettingsSaveTarget {
    let next_theme = next_theme(state.theme());
    if state.workspace_overrides.theme.is_some() {
        let mut overrides = state.workspace_overrides.clone();
        overrides.theme = Some(next_theme);
        SettingsSaveTarget::Workspace(overrides)
    } else {
        let mut settings = state.global_settings.clone();
        settings.theme = next_theme;
        SettingsSaveTarget::Global(settings)
    }
}

fn view_mode_target(
    state: &UiState,
    mode: ViewMode,
) -> Option<(ViewMode, ViewMode, SettingsSaveTarget)> {
    let previous_mode = state.settings.view_mode.clone();
    if previous_mode == mode {
        return None;
    }

    if state.workspace_overrides.view_mode.is_some() {
        let mut overrides = state.workspace_overrides.clone();
        overrides.view_mode = Some(mode.clone());
        Some((
            previous_mode,
            mode,
            SettingsSaveTarget::Workspace(overrides),
        ))
    } else {
        let mut settings = state.global_settings.clone();
        settings.view_mode = mode.clone();
        Some((previous_mode, mode, SettingsSaveTarget::Global(settings)))
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

    #[test]
    fn chrome_global_targets_do_not_persist_unrelated_workspace_overrides() {
        let state = UiState::from_settings_with_overrides(
            AppSettings {
                theme: Theme::Light,
                font_size: 14,
                sidebar_collapsed: false,
                view_mode: ViewMode::Hybrid,
                ..AppSettings::default()
            },
            WorkspaceSettingsOverrides {
                font_size: Some(22),
                ..WorkspaceSettingsOverrides::default()
            },
        );

        let (collapsed, target) = sidebar_toggle_target(&state);
        assert!(collapsed);
        assert_eq!(
            target,
            SettingsSaveTarget::Global(AppSettings {
                theme: Theme::Light,
                font_size: 14,
                sidebar_collapsed: true,
                view_mode: ViewMode::Hybrid,
                ..AppSettings::default()
            })
        );

        assert_eq!(
            theme_toggle_target(&state),
            SettingsSaveTarget::Global(AppSettings {
                theme: Theme::Dark,
                font_size: 14,
                sidebar_collapsed: false,
                view_mode: ViewMode::Hybrid,
                ..AppSettings::default()
            })
        );
    }

    #[test]
    fn chrome_targets_workspace_overrides_when_field_is_scoped() {
        let state = UiState::from_settings_with_overrides(
            AppSettings {
                theme: Theme::Light,
                sidebar_collapsed: false,
                view_mode: ViewMode::Hybrid,
                ..AppSettings::default()
            },
            WorkspaceSettingsOverrides {
                theme: Some(Theme::Dark),
                sidebar_collapsed: Some(false),
                view_mode: Some(ViewMode::Source),
                ..WorkspaceSettingsOverrides::default()
            },
        );

        let (collapsed, target) = sidebar_toggle_target(&state);
        assert!(collapsed);
        assert!(matches!(
            target,
            SettingsSaveTarget::Workspace(WorkspaceSettingsOverrides {
                sidebar_collapsed: Some(true),
                ..
            })
        ));
        assert!(matches!(
            theme_toggle_target(&state),
            SettingsSaveTarget::Workspace(WorkspaceSettingsOverrides {
                theme: Some(Theme::Light),
                ..
            })
        ));

        let (_, next_mode, target) = view_mode_target(&state, ViewMode::Preview).unwrap();
        assert_eq!(next_mode, ViewMode::Preview);
        assert!(matches!(
            target,
            SettingsSaveTarget::Workspace(WorkspaceSettingsOverrides {
                view_mode: Some(ViewMode::Preview),
                ..
            })
        ));
    }
}
