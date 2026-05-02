use crate::commands::{AppCommands, RestoreTrashedNoteTarget};
use crate::components::primitives::{Button, ButtonVariant, InlineAlert, InlineAlertTone, Modal};
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
                button {
                    class: "mn-modal-close",
                    "aria-label": i18n.text("Close trash", "关闭回收站"),
                    onclick: move |_| on_close.call(()),
                    "x"
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
                span {
                    class: "mn-command-path",
                    style: "margin-right:auto;",
                    "{trash_count_label(i18n.language(), note_count)}"
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

    rsx! {
        div { class: "mn-command-row",
            span { class: "mn-command-row-main",
                span { class: "mn-command-title", "{note.title}" }
                span { class: "mn-command-path", "{note.relative_path.display()}" }
            }
            span {
                class: "mn-row-actions",
                style: "display:flex;gap:6px;align-items:center;justify-content:flex-end;",
                Button {
                    label: i18n.text("Restore", "恢复").to_string(),
                    variant: ButtonVariant::Primary,
                    disabled: false,
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
