use crate::models::{AppSettings, Theme, ViewMode, WorkspaceSettingsOverrides};

#[derive(Debug, Clone, PartialEq)]
pub enum ChromeSettingsTarget {
    Global(AppSettings),
    Workspace(WorkspaceSettingsOverrides),
}

#[derive(Debug, Clone, PartialEq)]
pub struct UiState {
    pub view_mode: ViewMode,
    pub settings: AppSettings,
    pub global_settings: AppSettings,
    pub workspace_overrides: WorkspaceSettingsOverrides,
    pub outline_visible: bool,
}

impl Default for UiState {
    fn default() -> Self {
        Self {
            view_mode: ViewMode::Hybrid,
            settings: AppSettings::default(),
            global_settings: AppSettings::default(),
            workspace_overrides: WorkspaceSettingsOverrides::default(),
            outline_visible: false,
        }
    }
}

impl UiState {
    pub fn from_settings(settings: AppSettings) -> Self {
        Self::from_settings_with_overrides(settings, WorkspaceSettingsOverrides::default())
    }

    pub fn from_settings_with_overrides(
        global_settings: AppSettings,
        workspace_overrides: WorkspaceSettingsOverrides,
    ) -> Self {
        let settings = global_settings.with_workspace_overrides(&workspace_overrides);
        Self {
            view_mode: settings.view_mode.clone(),
            global_settings,
            workspace_overrides,
            settings,
            outline_visible: false,
        }
    }

    pub fn theme(&self) -> &Theme {
        &self.settings.theme
    }

    pub fn apply_settings(&mut self, settings: AppSettings) {
        self.view_mode = settings.view_mode.clone();
        self.settings = settings;
    }

    pub fn apply_global_settings(&mut self, global_settings: AppSettings) {
        self.global_settings = global_settings;
        self.refresh_effective_settings();
    }

    pub fn apply_workspace_overrides(&mut self, workspace_overrides: WorkspaceSettingsOverrides) {
        self.workspace_overrides = workspace_overrides;
        self.refresh_effective_settings();
    }

    pub fn sidebar_collapsed(&self) -> bool {
        self.settings.sidebar_collapsed
    }

    pub fn outline_visible(&self) -> bool {
        self.outline_visible
    }

    pub fn toggle_sidebar(&mut self) {
        self.settings.sidebar_collapsed = !self.settings.sidebar_collapsed;
    }

    pub fn toggle_outline(&mut self) {
        self.outline_visible = !self.outline_visible;
    }

    fn refresh_effective_settings(&mut self) {
        self.settings = self
            .global_settings
            .with_workspace_overrides(&self.workspace_overrides);
        self.view_mode = self.settings.view_mode.clone();
    }
}

pub fn sidebar_toggle_target(state: &UiState) -> (bool, ChromeSettingsTarget) {
    let collapsed = !state.settings.sidebar_collapsed;
    if state.workspace_overrides.sidebar_collapsed.is_some() {
        let mut overrides = state.workspace_overrides.clone();
        overrides.sidebar_collapsed = Some(collapsed);
        (collapsed, ChromeSettingsTarget::Workspace(overrides))
    } else {
        let mut settings = state.global_settings.clone();
        settings.sidebar_collapsed = collapsed;
        (collapsed, ChromeSettingsTarget::Global(settings))
    }
}

pub fn sidebar_width_target(state: &UiState, width: u32) -> Option<ChromeSettingsTarget> {
    if state.settings.sidebar_width == width {
        return None;
    }

    if state.workspace_overrides.sidebar_width.is_some() {
        let mut overrides = state.workspace_overrides.clone();
        overrides.sidebar_width = Some(width);
        Some(ChromeSettingsTarget::Workspace(overrides))
    } else {
        let mut settings = state.global_settings.clone();
        settings.sidebar_width = width;
        Some(ChromeSettingsTarget::Global(settings))
    }
}

pub fn theme_toggle_target(state: &UiState) -> ChromeSettingsTarget {
    let next_theme = next_theme(state.theme());
    if state.workspace_overrides.theme.is_some() {
        let mut overrides = state.workspace_overrides.clone();
        overrides.theme = Some(next_theme);
        ChromeSettingsTarget::Workspace(overrides)
    } else {
        let mut settings = state.global_settings.clone();
        settings.theme = next_theme;
        ChromeSettingsTarget::Global(settings)
    }
}

pub fn view_mode_target(
    state: &UiState,
    mode: ViewMode,
) -> Option<(ViewMode, ViewMode, ChromeSettingsTarget)> {
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
            ChromeSettingsTarget::Workspace(overrides),
        ))
    } else {
        let mut settings = state.global_settings.clone();
        settings.view_mode = mode.clone();
        Some((previous_mode, mode, ChromeSettingsTarget::Global(settings)))
    }
}

pub fn settings_target_theme(target: &ChromeSettingsTarget) -> Theme {
    match target {
        ChromeSettingsTarget::Global(settings) => settings.theme.clone(),
        ChromeSettingsTarget::Workspace(overrides) => {
            overrides.theme.clone().unwrap_or(Theme::System)
        }
    }
}

pub fn next_theme(theme: &Theme) -> Theme {
    if theme.is_dark() {
        Theme::Light
    } else {
        Theme::Dark
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
        assert_eq!(next_theme(&Theme::GitHubLight), Theme::Dark);
        assert_eq!(next_theme(&Theme::GitHubDark), Theme::Light);
        assert_eq!(next_theme(&Theme::HighContrast), Theme::Light);
        assert_eq!(next_theme(&Theme::WarmReading), Theme::Dark);
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
            ChromeSettingsTarget::Global(AppSettings {
                theme: Theme::Light,
                font_size: 14,
                sidebar_collapsed: true,
                view_mode: ViewMode::Hybrid,
                ..AppSettings::default()
            })
        );

        assert_eq!(
            theme_toggle_target(&state),
            ChromeSettingsTarget::Global(AppSettings {
                theme: Theme::Dark,
                font_size: 14,
                sidebar_collapsed: false,
                view_mode: ViewMode::Hybrid,
                ..AppSettings::default()
            })
        );

        assert_eq!(
            sidebar_width_target(&state, 320),
            Some(ChromeSettingsTarget::Global(AppSettings {
                theme: Theme::Light,
                font_size: 14,
                sidebar_collapsed: false,
                sidebar_width: 320,
                view_mode: ViewMode::Hybrid,
                ..AppSettings::default()
            }))
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
                sidebar_width: Some(300),
                view_mode: Some(ViewMode::Source),
                ..WorkspaceSettingsOverrides::default()
            },
        );

        let (collapsed, target) = sidebar_toggle_target(&state);
        assert!(collapsed);
        assert!(matches!(
            target,
            ChromeSettingsTarget::Workspace(WorkspaceSettingsOverrides {
                sidebar_collapsed: Some(true),
                ..
            })
        ));
        assert!(matches!(
            theme_toggle_target(&state),
            ChromeSettingsTarget::Workspace(WorkspaceSettingsOverrides {
                theme: Some(Theme::Light),
                ..
            })
        ));

        let (_, next_mode, target) = view_mode_target(&state, ViewMode::Preview).unwrap();
        assert_eq!(next_mode, ViewMode::Preview);
        assert!(matches!(
            target,
            ChromeSettingsTarget::Workspace(WorkspaceSettingsOverrides {
                view_mode: Some(ViewMode::Preview),
                ..
            })
        ));

        assert!(matches!(
            sidebar_width_target(&state, 340),
            Some(ChromeSettingsTarget::Workspace(
                WorkspaceSettingsOverrides {
                    sidebar_width: Some(340),
                    ..
                }
            ))
        ));
    }

    #[test]
    fn sidebar_width_target_skips_unchanged_width() {
        let state = UiState::from_settings(AppSettings {
            sidebar_width: 320,
            ..AppSettings::default()
        });

        assert_eq!(sidebar_width_target(&state, 320), None);
    }

    #[test]
    fn applying_global_settings_preserves_workspace_overrides() {
        let mut state = UiState::from_settings_with_overrides(
            AppSettings {
                theme: Theme::Light,
                font_size: 16,
                ..AppSettings::default()
            },
            WorkspaceSettingsOverrides {
                font_size: Some(18),
                ..WorkspaceSettingsOverrides::default()
            },
        );

        state.apply_global_settings(AppSettings {
            theme: Theme::Dark,
            font_size: 14,
            ..AppSettings::default()
        });

        assert_eq!(state.global_settings.theme, Theme::Dark);
        assert_eq!(state.settings.theme, Theme::Dark);
        assert_eq!(state.settings.font_size, 18);
    }

    #[test]
    fn applying_workspace_overrides_refreshes_effective_settings() {
        let mut state = UiState::from_settings(AppSettings {
            theme: Theme::Light,
            font_size: 16,
            ..AppSettings::default()
        });

        state.apply_workspace_overrides(WorkspaceSettingsOverrides {
            theme: Some(Theme::Dark),
            font_size: Some(20),
            ..WorkspaceSettingsOverrides::default()
        });

        assert_eq!(state.settings.theme, Theme::Dark);
        assert_eq!(state.settings.font_size, 20);
        assert_eq!(state.global_settings.theme, Theme::Light);
    }

    #[test]
    fn outline_visibility_is_ephemeral_chrome_state() {
        let mut state = UiState::from_settings(AppSettings::default());
        assert!(!state.outline_visible());

        state.toggle_outline();
        assert!(state.outline_visible());

        state.apply_global_settings(AppSettings {
            theme: Theme::Dark,
            ..AppSettings::default()
        });
        assert!(state.outline_visible());
    }
}
