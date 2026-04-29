use super::open::open_markdown_target_from_storage;
use anyhow::Result;
use papyro_core::models::{RecoveryDraft, RecoveryDraftComparison};
use papyro_core::{change_tab_content, EditorTabs, FileState, NoteStorage, TabContentsMap};
use papyro_editor::parser::summarize_markdown;

pub(crate) fn compare_recovery_draft_in_storage(
    storage: &dyn NoteStorage,
    file_state: &FileState,
    recovery_drafts: &[RecoveryDraft],
    note_id: &str,
) -> Result<RecoveryDraftComparison> {
    let draft = recovery_drafts
        .iter()
        .find(|draft| draft.note_id == note_id)
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("Recovery draft not found: {note_id}"))?;
    let workspace = file_state
        .current_workspace
        .clone()
        .ok_or_else(|| anyhow::anyhow!("Open a workspace before comparing recovery drafts"))?;
    if draft.workspace_id != workspace.id {
        anyhow::bail!("Recovery draft belongs to another workspace");
    }

    let path = workspace.path.join(&draft.relative_path);
    let disk = storage.read_note_content(&workspace, &path);
    Ok(RecoveryDraftComparison {
        note_id: draft.note_id,
        title: draft.title,
        relative_path: draft.relative_path,
        draft_content: draft.content,
        disk_content: disk.as_ref().ok().cloned(),
        disk_error: disk.err().map(|error| error.to_string()),
    })
}

pub(crate) fn restore_recovery_draft_in_state(
    storage: &dyn NoteStorage,
    file_state: &mut FileState,
    editor_tabs: &mut EditorTabs,
    tab_contents: &mut TabContentsMap,
    recovery_drafts: &mut Vec<RecoveryDraft>,
    note_id: &str,
) -> Result<String> {
    let index = recovery_drafts
        .iter()
        .position(|draft| draft.note_id == note_id)
        .ok_or_else(|| anyhow::anyhow!("Recovery draft not found: {note_id}"))?;
    let draft = recovery_drafts[index].clone();
    let workspace = file_state
        .current_workspace
        .clone()
        .ok_or_else(|| anyhow::anyhow!("Open a workspace before restoring recovery drafts"))?;
    if draft.workspace_id != workspace.id {
        anyhow::bail!("Recovery draft belongs to another workspace");
    }

    let path = workspace.path.join(&draft.relative_path);
    if !editor_tabs
        .tabs
        .iter()
        .any(|tab| tab.note_id == draft.note_id)
    {
        let _ = open_markdown_target_from_storage(
            storage,
            file_state,
            editor_tabs,
            tab_contents,
            path.clone(),
            summarize_markdown,
        )?;
    } else {
        file_state.select_path(path);
    }

    let tab_id = editor_tabs
        .tabs
        .iter()
        .find(|tab| tab.note_id == draft.note_id)
        .map(|tab| tab.id.clone())
        .ok_or_else(|| anyhow::anyhow!("Restored tab not found: {note_id}"))?;
    editor_tabs.set_active_tab(&tab_id);
    if let Some(revision) =
        change_tab_content(editor_tabs, tab_contents, &tab_id, draft.content.clone())
    {
        tab_contents.refresh_stats(&tab_id, revision, summarize_markdown(&draft.content));
    }

    recovery_drafts.remove(index);
    Ok(draft.title)
}
