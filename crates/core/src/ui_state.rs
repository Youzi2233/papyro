use crate::models::{AppSettings, Theme, ViewMode};

#[derive(Debug, Clone, PartialEq)]
pub struct UiState {
    pub view_mode: ViewMode,
    pub settings: AppSettings,
}

impl Default for UiState {
    fn default() -> Self {
        Self {
            view_mode: ViewMode::Hybrid,
            settings: AppSettings::default(),
        }
    }
}

impl UiState {
    pub fn from_settings(settings: AppSettings) -> Self {
        Self {
            view_mode: settings.view_mode.clone(),
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
