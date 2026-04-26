use dioxus::prelude::*;
use papyro_core::{FileState, NoteStorage};
use papyro_ui::commands::{
    DeleteTagRequest, RenameTagRequest, SetTagColorRequest, UpsertTagRequest,
};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TagMutation {
    Upsert(UpsertTagRequest),
    Rename(RenameTagRequest),
    SetColor(SetTagColorRequest),
    Delete(DeleteTagRequest),
}

impl TagMutation {
    fn success_message(&self) -> String {
        match self {
            Self::Upsert(request) => format!("Saved tag {}", request.name.trim()),
            Self::Rename(request) => format!("Renamed tag to {}", request.name.trim()),
            Self::SetColor(_) => "Updated tag color".to_string(),
            Self::Delete(_) => "Deleted tag".to_string(),
        }
    }
}

pub fn mutate_tag(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut status_message: Signal<Option<String>>,
    mutation: TagMutation,
) {
    if file_state.read().current_workspace.is_none() {
        status_message.set(Some("Open a workspace before managing tags".to_string()));
        return;
    }

    spawn(async move {
        let success_message = mutation.success_message();
        let result = tokio::task::spawn_blocking(move || {
            match mutation {
                TagMutation::Upsert(request) => {
                    storage.upsert_tag(&request.name, &request.color)?;
                }
                TagMutation::Rename(request) => {
                    storage.rename_tag(&request.id, &request.name)?;
                }
                TagMutation::SetColor(request) => {
                    storage.set_tag_color(&request.id, &request.color)?;
                }
                TagMutation::Delete(request) => {
                    storage.delete_tag(&request.id)?;
                }
            }

            storage.list_tags()
        })
        .await;

        match result {
            Ok(Ok(tags)) => {
                file_state.write().tags = tags;
                status_message.set(Some(success_message));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Tag update failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Tag update failed: {error}")));
            }
        }
    });
}
