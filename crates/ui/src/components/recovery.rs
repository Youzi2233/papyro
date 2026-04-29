use crate::components::primitives::{Button, ButtonVariant, Modal};
use crate::context::use_app_context;
use crate::view_model::RecoveryDraftItemViewModel;
use dioxus::prelude::*;

#[component]
pub fn RecoveryDraftsModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let commands = app.commands.clone();
    let model = app.recovery_model.read().clone();

    rsx! {
        Modal {
            label: "Recovery drafts",
            class_name: "mn-modal mn-command-modal",
            on_close,
            div { class: "mn-modal-header",
                h2 { class: "mn-modal-title", "Recovery drafts" }
                button {
                    class: "mn-modal-close",
                    "aria-label": "Close recovery drafts",
                    onclick: move |_| on_close.call(()),
                    "x"
                }
            }
            div { class: "mn-command-list",
                for draft in model.drafts {
                    RecoveryDraftRow {
                        draft,
                        commands: commands.clone(),
                    }
                }
            }
            div { class: "mn-modal-footer",
                Button {
                    label: "Later",
                    variant: ButtonVariant::Default,
                    disabled: false,
                    on_click: move |_| on_close.call(()),
                }
            }
        }
    }
}

#[component]
fn RecoveryDraftRow(
    draft: RecoveryDraftItemViewModel,
    commands: crate::commands::AppCommands,
) -> Element {
    let restore_note_id = draft.note_id.clone();
    let discard_note_id = draft.note_id.clone();
    let restore_commands = commands.clone();
    let discard_commands = commands.clone();

    rsx! {
        div { class: "mn-command-row",
            span { class: "mn-command-row-main",
                span { class: "mn-command-title", "{draft.title}" }
                span { class: "mn-command-path", "{draft.relative_path_label}" }
                span { class: "mn-command-path", "{draft.preview}" }
            }
            span {
                class: "mn-row-actions",
                style: "display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap;",
                Button {
                    label: "Restore",
                    variant: ButtonVariant::Primary,
                    disabled: false,
                    on_click: move |_| {
                        restore_commands.restore_recovery_draft.call(restore_note_id.clone());
                    },
                }
                Button {
                    label: "Discard",
                    variant: ButtonVariant::Danger,
                    disabled: false,
                    on_click: move |_| {
                        discard_commands.discard_recovery_draft.call(discard_note_id.clone());
                    },
                }
            }
        }
    }
}
