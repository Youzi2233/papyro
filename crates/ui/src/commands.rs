use dioxus::prelude::*;
use papyro_core::models::{AppSettings, WorkspaceSettingsOverrides};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentChange {
    pub tab_id: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasteImageRequest {
    pub tab_id: String,
    pub mime_type: String,
    pub data: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EditorRuntimeCommand {
    InsertMarkdown { tab_id: String, markdown: String },
}

impl EditorRuntimeCommand {
    fn tab_id(&self) -> &str {
        match self {
            Self::InsertMarkdown { tab_id, .. } => tab_id,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EditorRuntimeCommandQueue {
    revision: u64,
    pending: Vec<EditorRuntimeCommand>,
}

impl EditorRuntimeCommandQueue {
    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn push_insert_markdown(&mut self, tab_id: String, markdown: String) {
        self.revision = self.revision.saturating_add(1);
        self.pending
            .push(EditorRuntimeCommand::InsertMarkdown { tab_id, markdown });
    }

    pub fn has_pending_for_tab(&self, tab_id: &str) -> bool {
        self.pending
            .iter()
            .any(|command| command.tab_id() == tab_id)
    }

    pub fn drain_for_tab(&mut self, tab_id: &str) -> Vec<EditorRuntimeCommand> {
        let mut drained = Vec::new();
        let mut pending = Vec::with_capacity(self.pending.len());

        for command in self.pending.drain(..) {
            if command.tab_id() == tab_id {
                drained.push(command);
            } else {
                pending.push(command);
            }
        }

        self.pending = pending;
        drained
    }

    pub fn discard_for_tab(&mut self, tab_id: &str) {
        self.pending.retain(|command| command.tab_id() != tab_id);
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct FileTarget {
    pub path: PathBuf,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenMarkdownTarget {
    pub path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoreTrashedNoteTarget {
    pub note_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpsertTagRequest {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenameTagRequest {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetTagColorRequest {
    pub id: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteTagRequest {
    pub id: String,
}

#[derive(Clone, PartialEq)]
pub struct AppCommands {
    pub open_workspace: EventHandler<()>,
    pub open_workspace_path: EventHandler<PathBuf>,
    pub refresh_workspace: EventHandler<()>,
    pub create_note: EventHandler<String>,
    pub create_folder: EventHandler<String>,
    pub open_markdown: EventHandler<OpenMarkdownTarget>,
    pub search_workspace: EventHandler<String>,
    pub content_changed: EventHandler<ContentChange>,
    pub paste_image: EventHandler<PasteImageRequest>,
    pub activate_tab: EventHandler<String>,
    pub save_active_note: EventHandler<()>,
    pub save_tab: EventHandler<String>,
    pub close_tab: EventHandler<String>,
    pub toggle_outline: EventHandler<()>,
    pub rename_selected: EventHandler<String>,
    pub move_selected_to: EventHandler<PathBuf>,
    pub set_selected_favorite: EventHandler<bool>,
    pub restore_trashed_note: EventHandler<RestoreTrashedNoteTarget>,
    pub empty_trash: EventHandler<()>,
    pub upsert_tag: EventHandler<UpsertTagRequest>,
    pub rename_tag: EventHandler<RenameTagRequest>,
    pub set_tag_color: EventHandler<SetTagColorRequest>,
    pub delete_tag: EventHandler<DeleteTagRequest>,
    pub delete_selected: EventHandler<()>,
    pub toggle_expanded_path: EventHandler<PathBuf>,
    pub reveal_in_explorer: EventHandler<FileTarget>,
    pub export_html: EventHandler<()>,
    pub save_settings: EventHandler<AppSettings>,
    pub save_workspace_settings: EventHandler<WorkspaceSettingsOverrides>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editor_runtime_command_queue_drains_only_target_tab() {
        let mut queue = EditorRuntimeCommandQueue::default();
        queue.push_insert_markdown("a".to_string(), "![a](a.png)".to_string());
        queue.push_insert_markdown("b".to_string(), "![b](b.png)".to_string());

        let drained = queue.drain_for_tab("a");

        assert_eq!(
            drained,
            vec![EditorRuntimeCommand::InsertMarkdown {
                tab_id: "a".to_string(),
                markdown: "![a](a.png)".to_string(),
            }]
        );
        assert!(!queue.has_pending_for_tab("a"));
        assert!(queue.has_pending_for_tab("b"));
    }

    #[test]
    fn editor_runtime_command_queue_discards_closed_tab_commands() {
        let mut queue = EditorRuntimeCommandQueue::default();
        queue.push_insert_markdown("a".to_string(), "![a](a.png)".to_string());
        queue.push_insert_markdown("b".to_string(), "![b](b.png)".to_string());

        queue.discard_for_tab("a");

        assert!(!queue.has_pending_for_tab("a"));
        assert!(queue.has_pending_for_tab("b"));
    }
}
