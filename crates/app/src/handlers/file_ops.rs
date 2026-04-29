use dioxus::prelude::*;
use papyro_core::models::FileNodeKind;
use papyro_core::{EditorTabs, FileState, NoteStorage, TabContentsMap};
use papyro_editor::parser::summarize_markdown;
use papyro_platform::PlatformApi;
use papyro_ui::commands::FileTarget;
use std::path::PathBuf;
use std::sync::Arc;

use crate::runtime::AppShell;
use crate::workspace_flow::{
    create_folder_in_storage, create_note_in_storage, delete_selected_path, empty_trash,
    move_selected_path, normalized_name, rename_selected_path, restore_trashed_note,
};

type BlockingResult<T> = Result<Result<T, anyhow::Error>, tokio::task::JoinError>;

pub fn create_note(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
    name: String,
) {
    let mut next_file_state = file_state.read().clone();
    let mut next_editor_tabs = editor_tabs.read().clone();
    let mut next_tab_contents = tab_contents.read().clone();
    let name = normalized_name(&name, "Untitled");

    spawn(async move {
        let result: BlockingResult<(PathBuf, FileState, EditorTabs, TabContentsMap)> =
            tokio::task::spawn_blocking(move || {
                let path = create_note_in_storage(
                    storage.as_ref(),
                    &mut next_file_state,
                    &mut next_editor_tabs,
                    &mut next_tab_contents,
                    &name,
                    summarize_markdown,
                )?;

                Ok::<_, anyhow::Error>((path, next_file_state, next_editor_tabs, next_tab_contents))
            })
            .await;

        match result {
            Ok(Ok((path, next_file_state, next_editor_tabs, next_tab_contents))) => {
                file_state.set(next_file_state);
                editor_tabs.set(next_editor_tabs);
                tab_contents.set(next_tab_contents);
                status_message.set(Some(format!("Created note {}", path.display())));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Create note failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Create note failed: {error}")));
            }
        }
    });
}

pub fn create_folder(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut status_message: Signal<Option<String>>,
    name: String,
) {
    let mut next_file_state = file_state.read().clone();
    let name = normalized_name(&name, "New Folder");

    spawn(async move {
        let result: Result<Result<(PathBuf, FileState), anyhow::Error>, tokio::task::JoinError> =
            tokio::task::spawn_blocking(move || {
                let path = create_folder_in_storage(storage.as_ref(), &mut next_file_state, &name)?;

                Ok::<_, anyhow::Error>((path, next_file_state))
            })
            .await;

        match result {
            Ok(Ok((path, next_file_state))) => {
                file_state.set(next_file_state);
                status_message.set(Some(format!("Created folder {}", path.display())));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Create folder failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Create folder failed: {error}")));
            }
        }
    });
}

pub fn rename_selected(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
    new_name: String,
) {
    let workspace = file_state.read().current_workspace.clone();
    let selected_node = file_state.read().selected_node();

    let Some(workspace) = workspace else {
        status_message.set(Some("Open a workspace before renaming files".to_string()));
        return;
    };
    let Some(selected_node) = selected_node else {
        status_message.set(Some("Select a note or folder to rename".to_string()));
        return;
    };

    let name = normalized_name(&new_name, &selected_node.name);
    let mut next_file_state = file_state.read().clone();
    next_file_state.current_workspace = Some(workspace);
    let mut next_editor_tabs = editor_tabs.read().clone();
    let mut next_tab_contents = tab_contents.read().clone();

    spawn(async move {
        let result: BlockingResult<(PathBuf, FileState, EditorTabs, TabContentsMap)> =
            tokio::task::spawn_blocking(move || {
                let new_path = rename_selected_path(
                    storage.as_ref(),
                    &mut next_file_state,
                    &mut next_editor_tabs,
                    &mut next_tab_contents,
                    &name,
                )?;

                Ok::<_, anyhow::Error>((
                    new_path,
                    next_file_state,
                    next_editor_tabs,
                    next_tab_contents,
                ))
            })
            .await;

        match result {
            Ok(Ok((new_path, next_file_state, next_editor_tabs, next_tab_contents))) => {
                file_state.set(next_file_state);
                editor_tabs.set(next_editor_tabs);
                tab_contents.set(next_tab_contents);
                status_message.set(Some(format!("Renamed to {}", new_path.display())));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Rename failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Rename failed: {error}")));
            }
        }
    });
}

pub fn delete_selected(
    shell: AppShell,
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
    mut pending_delete_path: Signal<Option<PathBuf>>,
) {
    let workspace = file_state.read().current_workspace.clone();
    let selected_node = file_state.read().selected_node();

    let Some(workspace) = workspace else {
        pending_delete_path.set(None);
        status_message.set(Some("Open a workspace before deleting files".to_string()));
        return;
    };
    let Some(selected_node) = selected_node else {
        pending_delete_path.set(None);
        status_message.set(Some("Select a note or folder to delete".to_string()));
        return;
    };

    let node_name = selected_node.name.clone();
    let selected_path = selected_node.path.clone();

    if pending_delete_decision(pending_delete_path.read().as_deref(), &selected_path)
        == DeleteConfirmationDecision::Prompt
    {
        pending_delete_path.set(Some(selected_path));
        status_message.set(Some(shell.delete_confirmation(&node_name, 0)));
        return;
    }

    pending_delete_path.set(None);

    let mut next_file_state = file_state.read().clone();
    next_file_state.current_workspace = Some(workspace);
    let mut next_editor_tabs = editor_tabs.read().clone();
    let mut next_tab_contents = tab_contents.read().clone();

    spawn(async move {
        let result: BlockingResult<(usize, FileState, EditorTabs, TabContentsMap)> =
            tokio::task::spawn_blocking(move || {
                let outcome = delete_selected_path(
                    storage.as_ref(),
                    &mut next_file_state,
                    &mut next_editor_tabs,
                    &mut next_tab_contents,
                    true,
                )?;

                Ok::<_, anyhow::Error>((
                    outcome.orphaned_asset_count,
                    next_file_state,
                    next_editor_tabs,
                    next_tab_contents,
                ))
            })
            .await;

        match result {
            Ok(Ok((orphan_asset_count, next_file_state, next_editor_tabs, next_tab_contents))) => {
                file_state.set(next_file_state);
                editor_tabs.set(next_editor_tabs);
                tab_contents.set(next_tab_contents);
                let mut message = format!("Moved {node_name} to trash");
                if orphan_asset_count > 0 {
                    message.push_str(&format!(" and cleaned {orphan_asset_count} attachment(s)"));
                }
                status_message.set(Some(message));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Delete failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Delete failed: {error}")));
            }
        }
    });
}

pub fn set_selected_favorite(
    storage: Arc<dyn NoteStorage>,
    file_state: Signal<FileState>,
    mut status_message: Signal<Option<String>>,
    favorite: bool,
) {
    let workspace = file_state.read().current_workspace.clone();
    let selected_node = file_state.read().selected_node();

    let Some(workspace) = workspace else {
        status_message.set(Some(
            "Open a workspace before changing favorites".to_string(),
        ));
        return;
    };
    let Some(selected_node) = selected_node else {
        status_message.set(Some("Select a note to change favorites".to_string()));
        return;
    };
    if matches!(selected_node.kind, FileNodeKind::Directory { .. }) {
        status_message.set(Some("Select a note to change favorites".to_string()));
        return;
    }

    let selected_path = selected_node.path.clone();
    let selected_name = selected_node.name.clone();

    spawn(async move {
        let result: Result<Result<(), anyhow::Error>, tokio::task::JoinError> =
            tokio::task::spawn_blocking(move || {
                storage.set_note_favorite(&workspace, &selected_path, favorite)
            })
            .await;

        match result {
            Ok(Ok(())) => {
                let action = if favorite { "Favorited" } else { "Unfavorited" };
                status_message.set(Some(format!("{action} {selected_name}")));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Favorite update failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Favorite update failed: {error}")));
            }
        }
    });
}

pub fn restore_trashed(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut status_message: Signal<Option<String>>,
    note_id: String,
) {
    let mut next_file_state = file_state.read().clone();

    spawn(async move {
        let result: BlockingResult<(PathBuf, FileState)> = tokio::task::spawn_blocking(move || {
            let restored_path =
                restore_trashed_note(storage.as_ref(), &mut next_file_state, &note_id)?;
            Ok::<_, anyhow::Error>((restored_path, next_file_state))
        })
        .await;

        match result {
            Ok(Ok((restored_path, next_file_state))) => {
                file_state.set(next_file_state);
                status_message.set(Some(format!("Restored {}", restored_path.display())));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Restore failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Restore failed: {error}")));
            }
        }
    });
}

pub fn empty_workspace_trash(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut status_message: Signal<Option<String>>,
    mut pending_empty_trash: Signal<bool>,
) {
    if file_state.read().current_workspace.is_none() {
        pending_empty_trash.set(false);
        status_message.set(Some("Open a workspace before emptying trash".to_string()));
        return;
    }

    let trashed_count = file_state.read().trashed_notes.len();
    if trashed_count == 0 {
        pending_empty_trash.set(false);
        status_message.set(Some("Trash is already empty".to_string()));
        return;
    }

    if !pending_empty_trash() {
        pending_empty_trash.set(true);
        status_message.set(Some(format!(
            "{trashed_count} trashed note(s) will be permanently deleted. Run Empty trash again to confirm."
        )));
        return;
    }

    pending_empty_trash.set(false);
    let mut next_file_state = file_state.read().clone();

    spawn(async move {
        let result: BlockingResult<(papyro_core::EmptyTrashOutcome, FileState)> =
            tokio::task::spawn_blocking(move || {
                let outcome = empty_trash(storage.as_ref(), &mut next_file_state)?;
                Ok::<_, anyhow::Error>((outcome, next_file_state))
            })
            .await;

        match result {
            Ok(Ok((outcome, next_file_state))) => {
                file_state.set(next_file_state);
                let mut message = format!(
                    "Emptied trash and permanently deleted {} note(s)",
                    outcome.deleted_note_count
                );
                if outcome.deleted_asset_count > 0 {
                    message.push_str(&format!(
                        " and cleaned {} attachment(s)",
                        outcome.deleted_asset_count
                    ));
                }
                status_message.set(Some(message));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Empty trash failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Empty trash failed: {error}")));
            }
        }
    });
}

pub fn move_selected_to(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
    target_dir: PathBuf,
) {
    let workspace = file_state.read().current_workspace.clone();
    let selected_node = file_state.read().selected_node();

    let Some(workspace) = workspace else {
        status_message.set(Some("Open a workspace before moving files".to_string()));
        return;
    };
    if selected_node.is_none() {
        status_message.set(Some("Select a note or folder to move".to_string()));
        return;
    }

    let mut next_file_state = file_state.read().clone();
    next_file_state.current_workspace = Some(workspace);
    let mut next_editor_tabs = editor_tabs.read().clone();
    let mut next_tab_contents = tab_contents.read().clone();

    spawn(async move {
        let result: BlockingResult<(PathBuf, FileState, EditorTabs, TabContentsMap)> =
            tokio::task::spawn_blocking(move || {
                let moved_path = move_selected_path(
                    storage.as_ref(),
                    &mut next_file_state,
                    &mut next_editor_tabs,
                    &mut next_tab_contents,
                    &target_dir,
                )?;

                Ok::<_, anyhow::Error>((
                    moved_path,
                    next_file_state,
                    next_editor_tabs,
                    next_tab_contents,
                ))
            })
            .await;

        match result {
            Ok(Ok((moved_path, next_file_state, next_editor_tabs, next_tab_contents))) => {
                file_state.set(next_file_state);
                editor_tabs.set(next_editor_tabs);
                tab_contents.set(next_tab_contents);
                status_message.set(Some(format!("Moved to {}", moved_path.display())));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Move failed: {error}")));
            }
            Err(error) => {
                status_message.set(Some(format!("Move failed: {error}")));
            }
        }
    });
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DeleteConfirmationDecision {
    Prompt,
    Delete,
}

fn pending_delete_decision(
    pending_path: Option<&std::path::Path>,
    selected_path: &std::path::Path,
) -> DeleteConfirmationDecision {
    if pending_path == Some(selected_path) {
        DeleteConfirmationDecision::Delete
    } else {
        DeleteConfirmationDecision::Prompt
    }
}

pub fn reveal_in_explorer(
    platform: Arc<dyn PlatformApi>,
    mut status_message: Signal<Option<String>>,
    target: FileTarget,
) {
    match platform.open_in_explorer(&target.path) {
        Ok(()) => status_message.set(Some(format!("Opened {}", target.name))),
        Err(error) => status_message.set(Some(format!("Reveal failed: {error}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn delete_confirmation_requires_same_selected_path_twice() {
        assert_eq!(
            pending_delete_decision(None, Path::new("workspace/a.md")),
            DeleteConfirmationDecision::Prompt
        );
        assert_eq!(
            pending_delete_decision(
                Some(Path::new("workspace/other.md")),
                Path::new("workspace/a.md"),
            ),
            DeleteConfirmationDecision::Prompt
        );
        assert_eq!(
            pending_delete_decision(
                Some(Path::new("workspace/a.md")),
                Path::new("workspace/a.md"),
            ),
            DeleteConfirmationDecision::Delete
        );
    }
}
