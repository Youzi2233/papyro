use dioxus::prelude::*;
use papyro_core::{EditorTabs, FileState, NoteStorage, TabContentsMap};
use papyro_editor::parser::summarize_markdown;
use papyro_platform::PlatformApi;
use papyro_ui::commands::FileTarget;
use std::path::PathBuf;
use std::sync::Arc;

use crate::workspace_flow::{
    create_folder_in_storage, create_note_in_storage, delete_selected_path, normalized_name,
    rename_selected_path,
};

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
        let result: Result<
            Result<(PathBuf, FileState, EditorTabs, TabContentsMap), anyhow::Error>,
            tokio::task::JoinError,
        > = tokio::task::spawn_blocking(move || {
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
        let result: Result<
            Result<(PathBuf, FileState, EditorTabs, TabContentsMap), anyhow::Error>,
            tokio::task::JoinError,
        > = tokio::task::spawn_blocking(move || {
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
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    mut status_message: Signal<Option<String>>,
) {
    let workspace = file_state.read().current_workspace.clone();
    let selected_node = file_state.read().selected_node();

    let Some(workspace) = workspace else {
        status_message.set(Some("Open a workspace before deleting files".to_string()));
        return;
    };
    let Some(selected_node) = selected_node else {
        status_message.set(Some("Select a note or folder to delete".to_string()));
        return;
    };

    let node_name = selected_node.name.clone();
    let mut next_file_state = file_state.read().clone();
    next_file_state.current_workspace = Some(workspace);
    let mut next_editor_tabs = editor_tabs.read().clone();
    let mut next_tab_contents = tab_contents.read().clone();

    spawn(async move {
        let result: Result<
            Result<(PathBuf, FileState, EditorTabs, TabContentsMap), anyhow::Error>,
            tokio::task::JoinError,
        > = tokio::task::spawn_blocking(move || {
            let deleted_path = delete_selected_path(
                storage.as_ref(),
                &mut next_file_state,
                &mut next_editor_tabs,
                &mut next_tab_contents,
            )?;

            Ok::<_, anyhow::Error>((
                deleted_path,
                next_file_state,
                next_editor_tabs,
                next_tab_contents,
            ))
        })
        .await;

        match result {
            Ok(Ok((_deleted_path, next_file_state, next_editor_tabs, next_tab_contents))) => {
                file_state.set(next_file_state);
                editor_tabs.set(next_editor_tabs);
                tab_contents.set(next_tab_contents);
                status_message.set(Some(format!("Deleted {node_name}")));
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
