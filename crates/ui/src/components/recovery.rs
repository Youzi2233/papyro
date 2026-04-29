use crate::components::primitives::{Button, ButtonVariant, Modal};
use crate::context::use_app_context;
use crate::view_model::{RecoveryDraftComparisonViewModel, RecoveryDraftItemViewModel};
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
    let compare_note_id = draft.note_id.clone();
    let restore_note_id = draft.note_id.clone();
    let discard_note_id = draft.note_id.clone();
    let compare_commands = commands.clone();
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
                    label: "Compare",
                    variant: ButtonVariant::Default,
                    disabled: false,
                    on_click: move |_| {
                        compare_commands.compare_recovery_draft.call(compare_note_id.clone());
                    },
                }
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

#[component]
pub fn RecoveryDraftCompareModal() -> Element {
    let app = use_app_context();
    let commands = app.commands.clone();
    let comparison = app.recovery_comparison.read().clone();
    let Some(comparison) = comparison else {
        return rsx! {};
    };
    let model = RecoveryDraftComparisonViewModel::from_comparison(&comparison);
    let restore_note_id = model.note_id.clone();
    let discard_note_id = model.note_id.clone();
    let restore_commands = commands.clone();
    let discard_commands = commands.clone();
    let close_commands = commands.clone();
    let footer_close_commands = commands.clone();
    let compare_status = if model.disk_error.is_some() {
        "Disk content unavailable"
    } else if model.is_identical {
        "Recovery draft matches disk"
    } else {
        "Recovery draft differs from disk"
    };

    rsx! {
        Modal {
            label: "Compare recovery draft",
            class_name: "mn-modal mn-recovery-compare-modal",
            on_close: move |_| commands.close_recovery_comparison.call(()),
            div { class: "mn-modal-header",
                h2 { class: "mn-modal-title", "Compare recovery draft" }
                button {
                    class: "mn-modal-close",
                    "aria-label": "Close recovery comparison",
                    onclick: move |_| close_commands.close_recovery_comparison.call(()),
                    "x"
                }
            }
            div { class: "mn-recovery-compare-summary",
                span { class: "mn-command-title", "{model.title}" }
                span { class: "mn-command-path", "{model.relative_path_label}" }
                span { class: "mn-command-path", "{compare_status}" }
            }
            div { class: "mn-recovery-compare-grid",
                RecoveryComparePanel {
                    title: "Recovery draft",
                    line_count: model.draft_line_count,
                    content: model.draft_content.clone(),
                    error: None,
                }
                RecoveryComparePanel {
                    title: "Disk",
                    line_count: model.disk_line_count,
                    content: model.disk_content.clone(),
                    error: model.disk_error.clone(),
                }
            }
            div { class: "mn-modal-footer",
                Button {
                    label: "Close",
                    variant: ButtonVariant::Default,
                    disabled: false,
                    on_click: move |_| footer_close_commands.close_recovery_comparison.call(()),
                }
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

#[component]
fn RecoveryComparePanel(
    title: String,
    line_count: usize,
    content: String,
    error: Option<String>,
) -> Element {
    rsx! {
        section { class: "mn-recovery-compare-panel",
            div { class: "mn-recovery-compare-panel-header",
                h3 { "{title}" }
                span { "{line_count} lines" }
            }
            if let Some(error) = error {
                p { class: "mn-recovery-compare-error", "{error}" }
            }
            pre { class: "mn-recovery-compare-content",
                code { "{content}" }
            }
        }
    }
}
