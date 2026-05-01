use crate::i18n::i18n_for;
use papyro_core::models::AppLanguage;

pub(crate) fn open_note_label(language: AppLanguage, title: &str) -> String {
    i18n_for(language).open_note_label(title)
}

pub(crate) fn delete_action_label(language: AppLanguage, is_pending: bool) -> &'static str {
    if is_pending {
        i18n_for(language).text("Confirm delete", "确认删除")
    } else {
        i18n_for(language).text("Delete", "删除")
    }
}

pub(crate) fn delete_action_title(language: AppLanguage, is_pending: bool) -> &'static str {
    if is_pending {
        i18n_for(language).text("Confirm delete", "确认删除")
    } else {
        i18n_for(language).text("Delete selected", "删除所选项")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::AppLanguage;

    #[test]
    fn open_note_label_names_open_action() {
        assert_eq!(
            open_note_label(AppLanguage::English, "Daily note"),
            "Open Daily note"
        );
        assert_eq!(
            open_note_label(AppLanguage::Chinese, "每日笔记"),
            "打开 每日笔记"
        );
    }

    #[test]
    fn delete_action_labels_reflect_confirmation_state() {
        assert_eq!(delete_action_label(AppLanguage::English, false), "Delete");
        assert_eq!(
            delete_action_label(AppLanguage::English, true),
            "Confirm delete"
        );
        assert_eq!(
            delete_action_title(AppLanguage::English, false),
            "Delete selected"
        );
        assert_eq!(
            delete_action_title(AppLanguage::English, true),
            "Confirm delete"
        );
        assert_eq!(delete_action_label(AppLanguage::Chinese, false), "删除");
    }
}
