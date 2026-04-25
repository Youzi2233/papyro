use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub created_at: i64,
    pub last_opened: Option<i64>,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NoteMeta {
    pub id: String,
    pub workspace_id: String,
    pub relative_path: PathBuf,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub word_count: u32,
    pub char_count: u32,
    pub is_favorite: bool,
    pub is_trashed: bool,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileNode {
    pub name: String,
    pub path: PathBuf,
    pub relative_path: PathBuf,
    pub kind: FileNodeKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FileNodeKind {
    Directory { children: Vec<FileNode> },
    Note { note_id: Option<String> },
}

#[derive(Debug, Clone, PartialEq)]
pub struct EditorTab {
    pub id: String,
    pub note_id: String,
    pub title: String,
    pub path: PathBuf,
    pub is_dirty: bool,
    pub save_status: SaveStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum SaveStatus {
    #[default]
    Saved,
    Dirty,
    Saving,
    Failed,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RecentFile {
    pub note_id: String,
    pub title: String,
    pub relative_path: PathBuf,
    pub workspace_id: String,
    pub workspace_name: String,
    pub workspace_path: PathBuf,
    pub opened_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    pub theme: Theme,
    pub font_family: String,
    pub font_size: u8,
    pub line_height: f32,
    #[serde(default = "default_auto_link_paste")]
    pub auto_link_paste: bool,
    pub auto_save_delay_ms: u64,
    pub show_word_count: bool,
    pub sidebar_width: u32,
    #[serde(default)]
    pub sidebar_collapsed: bool,
    #[serde(default)]
    pub view_mode: ViewMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct WorkspaceSettingsOverrides {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<Theme>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_link_paste: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_save_delay_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub show_word_count: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidebar_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidebar_collapsed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_mode: Option<ViewMode>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            font_family: "Inter, system-ui, sans-serif".to_string(),
            font_size: 16,
            line_height: 1.6,
            auto_link_paste: true,
            auto_save_delay_ms: 500,
            show_word_count: true,
            sidebar_width: 260,
            sidebar_collapsed: false,
            view_mode: ViewMode::Hybrid,
        }
    }
}

impl AppSettings {
    pub fn with_workspace_overrides(&self, overrides: &WorkspaceSettingsOverrides) -> AppSettings {
        AppSettings {
            theme: overrides
                .theme
                .clone()
                .unwrap_or_else(|| self.theme.clone()),
            font_family: overrides
                .font_family
                .clone()
                .unwrap_or_else(|| self.font_family.clone()),
            font_size: overrides.font_size.unwrap_or(self.font_size),
            line_height: overrides.line_height.unwrap_or(self.line_height),
            auto_link_paste: overrides.auto_link_paste.unwrap_or(self.auto_link_paste),
            auto_save_delay_ms: overrides
                .auto_save_delay_ms
                .unwrap_or(self.auto_save_delay_ms),
            show_word_count: overrides.show_word_count.unwrap_or(self.show_word_count),
            sidebar_width: overrides.sidebar_width.unwrap_or(self.sidebar_width),
            sidebar_collapsed: overrides
                .sidebar_collapsed
                .unwrap_or(self.sidebar_collapsed),
            view_mode: overrides
                .view_mode
                .clone()
                .unwrap_or_else(|| self.view_mode.clone()),
        }
    }
}

fn default_auto_link_paste() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum ViewMode {
    #[default]
    Hybrid,
    Source,
    Preview,
}

impl ViewMode {
    pub fn is_editable(&self) -> bool {
        matches!(self, Self::Source | Self::Hybrid)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DocumentStats {
    pub line_count: usize,
    pub word_count: usize,
    pub char_count: usize,
    pub heading_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_overrides_merge_with_global_settings() {
        let global = AppSettings {
            theme: Theme::Light,
            font_size: 16,
            auto_save_delay_ms: 500,
            view_mode: ViewMode::Hybrid,
            ..AppSettings::default()
        };
        let overrides = WorkspaceSettingsOverrides {
            theme: Some(Theme::Dark),
            font_size: Some(18),
            auto_save_delay_ms: Some(1000),
            view_mode: Some(ViewMode::Source),
            ..WorkspaceSettingsOverrides::default()
        };

        let effective = global.with_workspace_overrides(&overrides);

        assert_eq!(effective.theme, Theme::Dark);
        assert_eq!(effective.font_size, 18);
        assert_eq!(effective.auto_save_delay_ms, 1000);
        assert_eq!(effective.view_mode, ViewMode::Source);
        assert_eq!(effective.font_family, global.font_family);
    }

    #[test]
    fn empty_workspace_overrides_keep_global_settings() {
        let global = AppSettings {
            theme: Theme::Dark,
            font_size: 20,
            ..AppSettings::default()
        };

        assert_eq!(
            global.with_workspace_overrides(&WorkspaceSettingsOverrides::default()),
            global
        );
    }
}
