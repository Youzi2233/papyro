use crate::components::primitives::{
    Button, ButtonVariant, ComparePanel, InlineAlert, InlineAlertTone, Modal, ResultRow,
    ResultRowKind, RowActions,
};
use crate::context::use_app_context;
use crate::i18n::use_i18n;
use crate::view_model::{RecoveryDraftComparisonViewModel, RecoveryDraftItemViewModel};
use dioxus::prelude::*;

#[component]
pub fn RecoveryDraftsModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
    let commands = app.commands.clone();
    let model = app.recovery_model.read().clone();
    let drafts = model.drafts;

    rsx! {
        Modal {
            label: i18n.text("Recovery drafts", "恢复草稿").to_string(),
            class_name: "mn-modal mn-command-modal".to_string(),
            on_close,
            div { class: "mn-modal-header",
                h2 { class: "mn-modal-title", {i18n.text("Recovery drafts", "恢复草稿")} }
                button {
                    class: "mn-modal-close",
                    "aria-label": i18n.text("Close recovery drafts", "关闭恢复草稿"),
                    onclick: move |_| on_close.call(()),
                    "x"
                }
            }
            if drafts.is_empty() {
                InlineAlert {
                    message: i18n.text("No recovery drafts", "没有恢复草稿").to_string(),
                    tone: InlineAlertTone::Neutral,
                    class_name: "mn-command-empty".to_string(),
                }
            } else {
                div { class: "mn-command-list",
                    for draft in drafts {
                        RecoveryDraftRow {
                            draft,
                            commands: commands.clone(),
                        }
                    }
                }
            }
            div { class: "mn-modal-footer",
                Button {
                    label: i18n.text("Later", "稍后").to_string(),
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
    let i18n = use_i18n();
    let compare_note_id = draft.note_id.clone();
    let restore_note_id = draft.note_id.clone();
    let discard_note_id = draft.note_id.clone();
    let row_compare_note_id = draft.note_id.clone();
    let row_commands = commands.clone();
    let compare_commands = commands.clone();
    let restore_commands = commands.clone();
    let discard_commands = commands.clone();

    rsx! {
        ResultRow {
            label: draft.title.clone(),
            metadata: "DRAFT".to_string(),
            is_active: false,
            kind: ResultRowKind::Default,
            on_select: move |_| {
                row_commands.compare_recovery_draft.call(row_compare_note_id.clone());
            },
            span { class: "mn-command-title", "{draft.title}" }
            span { class: "mn-command-path", "{draft.relative_path_label}" }
            span { class: "mn-command-path", "{draft.preview}" }
            RowActions {
                class_name: "wrap".to_string(),
                button {
                    class: "mn-button",
                    onclick: move |event| {
                        event.stop_propagation();
                        compare_commands.compare_recovery_draft.call(compare_note_id.clone());
                    },
                    {i18n.text("Compare", "比较")}
                }
                button {
                    class: "mn-button primary",
                    onclick: move |event| {
                        event.stop_propagation();
                        restore_commands.restore_recovery_draft.call(restore_note_id.clone());
                    },
                    {i18n.text("Restore", "恢复")}
                }
                button {
                    class: "mn-button danger",
                    onclick: move |event| {
                        event.stop_propagation();
                        discard_commands.discard_recovery_draft.call(discard_note_id.clone());
                    },
                    {i18n.text("Discard", "丢弃")}
                }
            }
        }
    }
}

#[component]
pub fn RecoveryDraftCompareModal() -> Element {
    let app = use_app_context();
    let i18n = use_i18n();
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
        i18n.text("Disk content unavailable", "磁盘内容不可用")
    } else if model.is_identical {
        i18n.text("Recovery draft matches disk", "恢复草稿与磁盘内容一致")
    } else {
        i18n.text("Recovery draft differs from disk", "恢复草稿与磁盘内容不同")
    };

    rsx! {
        Modal {
            label: i18n.text("Compare recovery draft", "比较恢复草稿").to_string(),
            class_name: "mn-modal mn-recovery-compare-modal".to_string(),
            on_close: move |_| commands.close_recovery_comparison.call(()),
            div { class: "mn-modal-header",
                h2 { class: "mn-modal-title", {i18n.text("Compare recovery draft", "比较恢复草稿")} }
                button {
                    class: "mn-modal-close",
                    "aria-label": i18n.text("Close recovery comparison", "关闭恢复比较"),
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
                ComparePanel {
                    title: i18n.text("Recovery draft", "恢复草稿").to_string(),
                    metadata: i18n.line_count(model.draft_line_count),
                    content: model.draft_content.clone(),
                    error: None,
                    class_name: String::new(),
                }
                ComparePanel {
                    title: i18n.text("Disk", "磁盘").to_string(),
                    metadata: i18n.line_count(model.disk_line_count),
                    content: model.disk_content.clone(),
                    error: model.disk_error.clone(),
                    class_name: String::new(),
                }
            }
            div { class: "mn-modal-footer",
                Button {
                    label: i18n.text("Close", "关闭").to_string(),
                    variant: ButtonVariant::Default,
                    disabled: false,
                    on_click: move |_| footer_close_commands.close_recovery_comparison.call(()),
                }
                Button {
                    label: i18n.text("Restore", "恢复").to_string(),
                    variant: ButtonVariant::Primary,
                    disabled: false,
                    on_click: move |_| {
                        restore_commands.restore_recovery_draft.call(restore_note_id.clone());
                    },
                }
                Button {
                    label: i18n.text("Discard", "丢弃").to_string(),
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
