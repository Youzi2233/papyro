use crate::commands::{AppCommands, RestoreTrashedNoteTarget};
use crate::components::primitives::{
    Button, ButtonState, ButtonVariant, InlineAlert, InlineAlertTone, Modal, ModalCloseButton,
    ModalFooterMeta, ResultRow, ResultRowKind, RowActionButton, RowActions,
};
use crate::context::use_app_context;
use crate::i18n::{i18n_for, use_i18n};
use crate::view_model::TrashedNoteListItem;
use dioxus::prelude::*;
use papyro_core::models::AppLanguage;

#[component]
pub fn TrashModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands.clone();
    let workspace = app.workspace_model.read().clone();
    let notes = workspace.trashed_notes;
    let note_count = notes.len();
    let empty_disabled = notes.is_empty();
    let empty_commands = commands.clone();

    rsx! {
        Modal {
            label: i18n.text("Trash", "回收站").to_string(),
            class_name: "mn-modal mn-command-modal".to_string(),
            on_close,
            div { class: "mn-modal-header",
                h2 { class: "mn-modal-title", {i18n.text("Trash", "回收站")} }
                ModalCloseButton {
                    label: i18n.text("Close trash", "关闭回收站").to_string(),
                    on_close,
                }
            }
            if notes.is_empty() {
                InlineAlert {
                    message: i18n.text("Trash is empty", "回收站为空").to_string(),
                    tone: InlineAlertTone::Neutral,
                    class_name: "mn-command-empty".to_string(),
                }
            } else {
                div { class: "mn-command-list",
                    for note in notes {
                        TrashNoteRow {
                            key: "{note.note_id}",
                            note,
                            commands: commands.clone(),
                        }
                    }
                }
            }
            div { class: "mn-modal-footer",
                ModalFooterMeta {
                    label: trash_count_label(i18n.language(), note_count),
                    class_name: String::new(),
                }
                Button {
                    label: i18n.text("Close", "关闭").to_string(),
                    variant: ButtonVariant::Default,
                    disabled: false,
                    on_click: move |_| on_close.call(()),
                }
                Button {
                    label: i18n.text("Empty trash", "清空回收站").to_string(),
                    variant: ButtonVariant::Danger,
                    disabled: empty_disabled,
                    on_click: move |_| empty_commands.empty_trash.call(()),
                }
            }
        }
    }
}

#[component]
fn TrashNoteRow(note: TrashedNoteListItem, commands: AppCommands) -> Element {
    let i18n = use_i18n();
    let target = RestoreTrashedNoteTarget {
        note_id: note.note_id.clone(),
    };
    let row_target = target.clone();
    let row_commands = commands.clone();

    rsx! {
        ResultRow {
            label: note.title.clone(),
            metadata: "TRASH".to_string(),
            is_active: false,
            kind: ResultRowKind::Default,
            on_select: move |_| row_commands.restore_trashed_note.call(row_target.clone()),
            span { class: "mn-command-title", "{note.title}" }
            span { class: "mn-command-path", "{note.relative_path.display()}" }
            RowActions {
                class_name: String::new(),
                RowActionButton {
                    label: i18n.text("Restore", "恢复").to_string(),
                    variant: ButtonVariant::Primary,
                    state: ButtonState::Enabled,
                    class_name: String::new(),
                    on_click: move |_| commands.restore_trashed_note.call(target.clone()),
                }
            }
        }
    }
}

fn trash_count_label(language: AppLanguage, count: usize) -> String {
    i18n_for(language).deleted_notes_count(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trash_count_label_names_empty_singular_and_plural_states() {
        assert_eq!(
            trash_count_label(AppLanguage::English, 0),
            "No deleted notes"
        );
        assert_eq!(trash_count_label(AppLanguage::English, 1), "1 deleted note");
        assert_eq!(
            trash_count_label(AppLanguage::English, 3),
            "3 deleted notes"
        );
    }
}
