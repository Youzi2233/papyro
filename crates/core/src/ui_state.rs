use crate::models::{AppSettings, Theme, ViewMode, WorkspaceSettingsOverrides};

#[derive(Debug, Clone, PartialEq)]
pub struct UiState {
    pub view_mode: ViewMode,
    pub settings: AppSettings,
    pub global_settings: AppSettings,
    pub workspace_overrides: WorkspaceSettingsOverrides,
}

impl Default for UiState {
    fn default() -> Self {
        Self {
            view_mode: ViewMode::Hybrid,
            settings: AppSettings::default(),
            global_settings: AppSettings::default(),
            workspace_overrides: WorkspaceSettingsOverrides::default(),
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

    pub fn toggle_sidebar(&mut self) {
        self.settings.sidebar_collapsed = !self.settings.sidebar_collapsed;
    }

    fn refresh_effective_settings(&mut self) {
        self.settings = self
            .global_settings
            .with_workspace_overrides(&self.workspace_overrides);
        self.view_mode = self.settings.view_mode.clone();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
