use crate::commands::{AppCommands, RestoreTrashedNoteTarget};
use crate::components::primitives::{Button, ButtonVariant, Modal};
use crate::context::use_app_context;
use crate::view_model::TrashedNoteListItem;
use dioxus::prelude::*;

#[component]
pub fn TrashModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let commands = app.commands.clone();
    let workspace = app.workspace_model.read().clone();
    let notes = workspace.trashed_notes;
    let note_count = notes.len();
    let empty_disabled = notes.is_empty();
    let empty_commands = commands.clone();

    rsx! {
        Modal {
            label: "Trash",
            class_name: "mn-modal mn-command-modal",
            on_close,
            div { class: "mn-modal-header",
                h2 { class: "mn-modal-title", "Trash" }
                button {
                    class: "mn-modal-close",
                    "aria-label": "Close trash",
                    onclick: move |_| on_close.call(()),
                    "x"
                }
            }
            if notes.is_empty() {
                div { class: "mn-command-empty", "Trash is empty" }
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
                    "{trash_count_label(note_count)}"
                }
                Button {
                    label: "Close",
                    variant: ButtonVariant::Default,
                    disabled: false,
                    on_click: move |_| on_close.call(()),
                }
                Button {
                    label: "Empty trash",
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
                    label: "Restore",
                    variant: ButtonVariant::Primary,
                    disabled: false,
                    on_click: move |_| commands.restore_trashed_note.call(target.clone()),
                }
            }
        }
    }
}

fn trash_count_label(count: usize) -> String {
    match count {
        0 => "No deleted notes".to_string(),
        1 => "1 deleted note".to_string(),
        count => format!("{count} deleted notes"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trash_count_label_names_empty_singular_and_plural_states() {
        assert_eq!(trash_count_label(0), "No deleted notes");
        assert_eq!(trash_count_label(1), "1 deleted note");
        assert_eq!(trash_count_label(3), "3 deleted notes");
    }
}
