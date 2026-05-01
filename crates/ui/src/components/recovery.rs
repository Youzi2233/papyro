use crate::components::primitives::{Button, ButtonVariant, Modal};
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
                    label: i18n.text("Compare", "比较").to_string(),
                    variant: ButtonVariant::Default,
                    disabled: false,
                    on_click: move |_| {
                        compare_commands.compare_recovery_draft.call(compare_note_id.clone());
                    },
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
                RecoveryComparePanel {
                    title: i18n.text("Recovery draft", "恢复草稿").to_string(),
                    line_count: model.draft_line_count,
                    content: model.draft_content.clone(),
                    error: None,
                }
                RecoveryComparePanel {
                    title: i18n.text("Disk", "磁盘").to_string(),
                    line_count: model.disk_line_count,
                    content: model.disk_content.clone(),
                    error: model.disk_error.clone(),
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

#[component]
fn RecoveryComparePanel(
    title: String,
    line_count: usize,
    content: String,
    error: Option<String>,
) -> Element {
    let i18n = use_i18n();
    rsx! {
        section { class: "mn-recovery-compare-panel",
            div { class: "mn-recovery-compare-panel-header",
                h3 { "{title}" }
                span { "{i18n.line_count(line_count)}" }
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
