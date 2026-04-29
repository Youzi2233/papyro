pub(crate) fn open_note_label(title: &str) -> String {
    format!("Open {title}")
}

pub(crate) fn delete_action_label(is_pending: bool) -> &'static str {
    if is_pending {
        "Confirm delete"
    } else {
        "Delete"
    }
}

pub(crate) fn delete_action_title(is_pending: bool) -> &'static str {
    if is_pending {
        "Confirm delete"
    } else {
        "Delete selected"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_note_label_names_open_action() {
        assert_eq!(open_note_label("Daily note"), "Open Daily note");
    }

    #[test]
    fn delete_action_labels_reflect_confirmation_state() {
        assert_eq!(delete_action_label(false), "Delete");
        assert_eq!(delete_action_label(true), "Confirm delete");
        assert_eq!(delete_action_title(false), "Delete selected");
        assert_eq!(delete_action_title(true), "Confirm delete");
    }
}
