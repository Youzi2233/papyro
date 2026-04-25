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

    pub fn sidebar_collapsed(&self) -> bool {
        self.settings.sidebar_collapsed
    }

    pub fn toggle_sidebar(&mut self) {
        self.settings.sidebar_collapsed = !self.settings.sidebar_collapsed;
    }
}
