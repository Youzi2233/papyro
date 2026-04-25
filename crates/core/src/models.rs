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
    pub workspace_name: String,
    pub opened_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    pub theme: Theme,
    pub font_family: String,
    pub font_size: u8,
    pub line_height: f32,
    pub auto_save_delay_ms: u64,
    pub show_word_count: bool,
    pub sidebar_width: u32,
    #[serde(default)]
    pub sidebar_collapsed: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            font_family: "Inter, system-ui, sans-serif".to_string(),
            font_size: 16,
            line_height: 1.6,
            auto_save_delay_ms: 500,
            show_word_count: true,
            sidebar_width: 260,
            sidebar_collapsed: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Default)]
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
