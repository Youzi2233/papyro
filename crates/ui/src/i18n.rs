use crate::context::use_app_context;
use papyro_core::{
    models::{AppLanguage, SaveStatus, ViewMode},
    SearchField,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UiText {
    language: AppLanguage,
}

pub fn use_i18n() -> UiText {
    let app = use_app_context();
    UiText::new((app.language)())
}

pub const fn i18n_for(language: AppLanguage) -> UiText {
    UiText::new(language)
}

impl UiText {
    pub const fn new(language: AppLanguage) -> Self {
        Self { language }
    }

    pub const fn language(self) -> AppLanguage {
        self.language
    }

    pub fn text(self, english: &'static str, chinese: &'static str) -> &'static str {
        match self.language {
            AppLanguage::English => english,
            AppLanguage::Chinese => chinese,
        }
    }

    pub fn open_note_label(self, title: &str) -> String {
        match self.language {
            AppLanguage::English => format!("Open {title}"),
            AppLanguage::Chinese => format!("打开 {title}"),
        }
    }

    pub fn close_label(self, title: &str) -> String {
        match self.language {
            AppLanguage::English => format!("Close {title}"),
            AppLanguage::Chinese => format!("关闭 {title}"),
        }
    }

    pub fn word_count(self, count: usize) -> String {
        match self.language {
            AppLanguage::English => format!("{count} words"),
            AppLanguage::Chinese => format!("{count} 字"),
        }
    }

    pub fn line_count(self, count: usize) -> String {
        match self.language {
            AppLanguage::English => {
                if count == 1 {
                    "1 line".to_string()
                } else {
                    format!("{count} lines")
                }
            }
            AppLanguage::Chinese => format!("{count} 行"),
        }
    }

    pub fn deleted_notes_review(self, count: usize) -> String {
        match self.language {
            AppLanguage::English => match count {
                0 => "No deleted notes".to_string(),
                1 => "Review 1 deleted note".to_string(),
                count => format!("Review {count} deleted notes"),
            },
            AppLanguage::Chinese => match count {
                0 => "没有已删除笔记".to_string(),
                1 => "查看 1 条已删除笔记".to_string(),
                count => format!("查看 {count} 条已删除笔记"),
            },
        }
    }

    pub fn deleted_notes_count(self, count: usize) -> String {
        match self.language {
            AppLanguage::English => match count {
                0 => "No deleted notes".to_string(),
                1 => "1 deleted note".to_string(),
                count => format!("{count} deleted notes"),
            },
            AppLanguage::Chinese => match count {
                0 => "没有已删除笔记".to_string(),
                1 => "1 条已删除笔记".to_string(),
                count => format!("{count} 条已删除笔记"),
            },
        }
    }

    pub fn save_status(self, status: &SaveStatus) -> &'static str {
        match status {
            SaveStatus::Saving => self.text("Saving", "保存中"),
            SaveStatus::Conflict => self.text("Conflict", "冲突"),
            SaveStatus::Failed => self.text("Save failed", "保存失败"),
            SaveStatus::Dirty => self.text("Unsaved", "未保存"),
            SaveStatus::Saved => self.text("Saved", "已保存"),
        }
    }

    pub fn unsaved_changes(self) -> &'static str {
        self.text("Unsaved changes", "未保存更改")
    }

    pub fn file_changed_outside(self) -> &'static str {
        self.text("File changed outside Papyro", "文件已在 Papyro 外部更改")
    }

    pub fn view_mode_label(self, mode: &ViewMode) -> &'static str {
        match mode {
            ViewMode::Source => self.text("Source", "源码"),
            ViewMode::Hybrid => self.text("Hybrid", "混合"),
            ViewMode::Preview => self.text("Preview", "预览"),
        }
    }

    pub fn search_field_label(self, field: SearchField) -> &'static str {
        match field {
            SearchField::Title => self.text("TITLE", "标题"),
            SearchField::Path => self.text("PATH", "路径"),
            SearchField::Body => self.text("BODY", "正文"),
        }
    }
}
