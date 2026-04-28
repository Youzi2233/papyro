use crate::actions::AppAction;
use crate::effects;
use crate::handlers::{file_ops, notes, search, tags, workspace};
use crate::runtime::AppShell;
use crate::state::RuntimeState;
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, WorkspaceSettingsOverrides, WorkspaceTreeState};
use papyro_core::{FileState, NoteStorage, UiState};
use papyro_platform::PlatformApi;
use papyro_ui::commands::{AppCommands, ContentChange};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppDispatcher {
    shell: AppShell,
    state: RuntimeState,
    storage: Arc<dyn NoteStorage>,
    platform: Arc<dyn PlatformApi>,
}

impl PartialEq for AppDispatcher {
    fn eq(&self, _other: &Self) -> bool {
        true
    }
}

impl AppDispatcher {
    pub fn new(
        shell: AppShell,
        state: RuntimeState,
        storage: Arc<dyn NoteStorage>,
        platform: Arc<dyn PlatformApi>,
    ) -> Self {
        Self {
            shell,
            state,
            storage,
            platform,
        }
    }

    pub fn dispatch(&self, action: AppAction) {
        match action {
            AppAction::OpenWorkspace => {
                let platform = self.platform.clone();
                let storage = self.storage.clone();
                let state = self.state;
                spawn(async move {
                    if !effects::flush_dirty_tabs(storage.clone(), state).await {
                        return;
                    }

                    workspace::open_workspace(platform, storage, state).await;
                });
            }
            AppAction::OpenWorkspacePath(action) => {
                let storage = self.storage.clone();
                let state = self.state;
                spawn(async move {
                    if !effects::flush_dirty_tabs(storage.clone(), state).await {
                        return;
                    }

                    workspace::open_workspace_path(storage, state, action.path).await;
                });
            }
            AppAction::RefreshWorkspace => {
                workspace::refresh_workspace(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.status_message,
                );
            }
            AppAction::CreateNote(action) => {
                file_ops::create_note(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.editor_tabs,
                    self.state.tab_contents,
                    self.state.status_message,
                    action.name,
                );
            }
            AppAction::CreateFolder(action) => {
                file_ops::create_folder(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.status_message,
                    action.name,
                );
            }
            AppAction::OpenNote(action) => {
                notes::open_note(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.editor_tabs,
                    self.state.tab_contents,
                    self.state.status_message,
                    action.node,
                );
            }
            AppAction::OpenRecentFile(action) => {
                let storage = self.storage.clone();
                let state = self.state;
                spawn(async move {
                    if !effects::flush_dirty_tabs(storage.clone(), state).await {
                        return;
                    }

                    notes::open_recent_file(storage, state, action.target).await;
                });
            }
            AppAction::SearchWorkspace(action) => {
                search::search_workspace(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.workspace_search,
                    action.query,
                );
            }
            AppAction::ContentChanged(action) => {
                effects::record_content_change(
                    self.storage.clone(),
                    self.state,
                    action.tab_id,
                    action.content,
                );
            }
            AppAction::SaveActiveNote => {
                notes::save_active_note(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.editor_tabs,
                    self.state.tab_contents,
                    self.state.status_message,
                );
                let mut pending_close_tab = self.state.pending_close_tab;
                pending_close_tab.set(None);
            }
            AppAction::SaveTab(action) => {
                notes::save_tab_by_id(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.editor_tabs,
                    self.state.tab_contents,
                    self.state.status_message,
                    &action.tab_id,
                );
            }
            AppAction::CloseTab(action) => {
                close_tab(self.shell, self.storage.clone(), self.state, action.tab_id);
            }
            AppAction::RenameSelected(action) => {
                file_ops::rename_selected(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.editor_tabs,
                    self.state.tab_contents,
                    self.state.status_message,
                    action.name,
                );
            }
            AppAction::MoveSelectedTo(action) => {
                file_ops::move_selected_to(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.editor_tabs,
                    self.state.tab_contents,
                    self.state.status_message,
                    action.target_dir,
                );
            }
            AppAction::SetSelectedFavorite(action) => {
                file_ops::set_selected_favorite(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.status_message,
                    action.favorite,
                );
            }
            AppAction::RestoreTrashedNote(action) => {
                file_ops::restore_trashed(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.status_message,
                    action.target.note_id,
                );
            }
            AppAction::EmptyTrash => {
                file_ops::empty_workspace_trash(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.status_message,
                    self.state.pending_empty_trash,
                );
            }
            AppAction::UpsertTag(action) => {
                tags::mutate_tag(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.status_message,
                    tags::TagMutation::Upsert(action.request),
                );
            }
            AppAction::RenameTag(action) => {
                tags::mutate_tag(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.status_message,
                    tags::TagMutation::Rename(action.request),
                );
            }
            AppAction::SetTagColor(action) => {
                tags::mutate_tag(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.status_message,
                    tags::TagMutation::SetColor(action.request),
                );
            }
            AppAction::DeleteTag(action) => {
                tags::mutate_tag(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.status_message,
                    tags::TagMutation::Delete(action.request),
                );
            }
            AppAction::DeleteSelected => {
                file_ops::delete_selected(
                    self.shell,
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.editor_tabs,
                    self.state.tab_contents,
                    self.state.status_message,
                    self.state.pending_delete_path,
                );
            }
            AppAction::ToggleExpandedPath(action) => {
                toggle_expanded_path(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.status_message,
                    action.path,
                );
            }
            AppAction::RevealInExplorer(action) => {
                file_ops::reveal_in_explorer(
                    self.platform.clone(),
                    self.state.status_message,
                    action.target,
                );
            }
            AppAction::ExportHtml => {
                export_html(self.shell, self.state);
            }
            AppAction::SaveSettings(action) => {
                apply_settings(
                    self.storage.clone(),
                    self.state.ui_state,
                    self.state.status_message,
                    action.settings,
                );
            }
            AppAction::SaveWorkspaceSettings(action) => {
                apply_workspace_settings(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.ui_state,
                    self.state.status_message,
                    action.overrides,
                );
            }
        }
    }

    pub fn commands(&self) -> AppCommands {
        let open_workspace = self.clone();
        let open_workspace_path = self.clone();
        let refresh_workspace = self.clone();
        let create_note = self.clone();
        let create_folder = self.clone();
        let open_note = self.clone();
        let open_recent_file = self.clone();
        let search_workspace = self.clone();
        let content_changed = self.clone();
        let save_active_note = self.clone();
        let save_tab = self.clone();
        let close_tab = self.clone();
        let rename_selected = self.clone();
        let move_selected_to = self.clone();
        let set_selected_favorite = self.clone();
        let restore_trashed_note = self.clone();
        let empty_trash = self.clone();
        let upsert_tag = self.clone();
        let rename_tag = self.clone();
        let set_tag_color = self.clone();
        let delete_tag = self.clone();
        let delete_selected = self.clone();
        let toggle_expanded_path = self.clone();
        let reveal_in_explorer = self.clone();
        let export_html = self.clone();
        let save_settings = self.clone();
        let save_workspace_settings = self.clone();

        AppCommands {
            open_workspace: EventHandler::new(move |_| {
                open_workspace.dispatch(AppAction::OpenWorkspace);
            }),
            open_workspace_path: EventHandler::new(move |path| {
                open_workspace_path.dispatch(AppAction::open_workspace_path(path));
            }),
            refresh_workspace: EventHandler::new(move |_| {
                refresh_workspace.dispatch(AppAction::RefreshWorkspace);
            }),
            create_note: EventHandler::new(move |name| {
                create_note.dispatch(AppAction::create_note(name));
            }),
            create_folder: EventHandler::new(move |name| {
                create_folder.dispatch(AppAction::create_folder(name));
            }),
            open_note: EventHandler::new(move |node| {
                open_note.dispatch(AppAction::open_note(node));
            }),
            open_recent_file: EventHandler::new(move |target| {
                open_recent_file.dispatch(AppAction::open_recent_file(target));
            }),
            search_workspace: EventHandler::new(move |query| {
                search_workspace.dispatch(AppAction::search_workspace(query));
            }),
            content_changed: EventHandler::new(move |change: ContentChange| {
                content_changed.dispatch(AppAction::content_changed(change.tab_id, change.content));
            }),
            save_active_note: EventHandler::new(move |_| {
                save_active_note.dispatch(AppAction::SaveActiveNote);
            }),
            save_tab: EventHandler::new(move |tab_id| {
                save_tab.dispatch(AppAction::save_tab(tab_id));
            }),
            close_tab: EventHandler::new(move |tab_id| {
                close_tab.dispatch(AppAction::close_tab(tab_id));
            }),
            rename_selected: EventHandler::new(move |name| {
                rename_selected.dispatch(AppAction::rename_selected(name));
            }),
            move_selected_to: EventHandler::new(move |target_dir| {
                move_selected_to.dispatch(AppAction::move_selected_to(target_dir));
            }),
            set_selected_favorite: EventHandler::new(move |favorite| {
                set_selected_favorite.dispatch(AppAction::set_selected_favorite(favorite));
            }),
            restore_trashed_note: EventHandler::new(move |target| {
                restore_trashed_note.dispatch(AppAction::restore_trashed_note(target));
            }),
            empty_trash: EventHandler::new(move |_| {
                empty_trash.dispatch(AppAction::empty_trash());
            }),
            upsert_tag: EventHandler::new(move |request| {
                upsert_tag.dispatch(AppAction::upsert_tag(request));
            }),
            rename_tag: EventHandler::new(move |request| {
                rename_tag.dispatch(AppAction::rename_tag(request));
            }),
            set_tag_color: EventHandler::new(move |request| {
                set_tag_color.dispatch(AppAction::set_tag_color(request));
            }),
            delete_tag: EventHandler::new(move |request| {
                delete_tag.dispatch(AppAction::delete_tag(request));
            }),
            delete_selected: EventHandler::new(move |_| {
                delete_selected.dispatch(AppAction::DeleteSelected);
            }),
            toggle_expanded_path: EventHandler::new(move |path| {
                toggle_expanded_path.dispatch(AppAction::toggle_expanded_path(path));
            }),
            reveal_in_explorer: EventHandler::new(move |target| {
                reveal_in_explorer.dispatch(AppAction::reveal_in_explorer(target));
            }),
            export_html: EventHandler::new(move |_| {
                export_html.dispatch(AppAction::ExportHtml);
            }),
            save_settings: EventHandler::new(move |settings| {
                save_settings.dispatch(AppAction::save_settings(settings));
            }),
            save_workspace_settings: EventHandler::new(move |overrides| {
                save_workspace_settings.dispatch(AppAction::save_workspace_settings(overrides));
            }),
        }
    }
}

fn perf_enabled() -> bool {
    std::env::var_os("PAPYRO_PERF").is_some()
}

fn close_tab(
    shell: AppShell,
    storage: Arc<dyn NoteStorage>,
    mut state: RuntimeState,
    tab_id: String,
) {
    let perf_started_at = perf_enabled().then(std::time::Instant::now);

    let tab = state
        .editor_tabs
        .read()
        .tabs
        .iter()
        .find(|t| t.id == tab_id)
        .cloned();
    let Some(tab) = tab else { return };

    if tab.is_dirty && state.pending_close_tab.read().as_deref() != Some(&tab_id) {
        notes::save_tab_by_id(
            storage,
            state.file_state,
            state.editor_tabs,
            state.tab_contents,
            state.status_message,
            &tab_id,
        );
        state.pending_close_tab.set(Some(tab_id));
        state
            .status_message
            .set(Some(shell.close_confirmation(&tab.title)));
        return;
    }

    let closed = state.editor_tabs.write().close_tab(&tab.id);
    if !closed {
        return;
    }

    state.tab_contents.write().close_tab(&tab.id);
    state.pending_close_tab.set(None);

    let closed_title = tab.title;
    state
        .status_message
        .set(Some(format!("Closed {closed_title}")));

    if let Some(started_at) = perf_started_at {
        tracing::info!(
            tab_id = %tab.id,
            elapsed_ms = started_at.elapsed().as_millis(),
            "perf runtime close_tab handler"
        );
    }
}

fn export_html(shell: AppShell, mut state: RuntimeState) {
    if let Some(message) = shell.export_unavailable_message() {
        state.status_message.set(Some(message.to_string()));
        return;
    }

    #[cfg(feature = "desktop-shell")]
    spawn(async move {
        crate::export::export_active_note_html(
            state.editor_tabs,
            state.tab_contents,
            state.status_message,
        )
        .await;
    });

    #[cfg(not(feature = "desktop-shell"))]
    state
        .status_message
        .set(Some("Export is not available in this build".to_string()));
}

fn apply_settings(
    storage: Arc<dyn NoteStorage>,
    mut ui_state: Signal<UiState>,
    mut status_message: Signal<Option<String>>,
    settings: AppSettings,
) {
    ui_state.write().apply_global_settings(settings.clone());

    spawn(async move {
        let result = tokio::task::spawn_blocking(move || storage.save_settings(&settings)).await;
        match result {
            Ok(Ok(())) => {
                status_message.set(Some("Saved global settings".to_string()));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Save settings failed: {error}")));
                tracing::warn!("Failed to save settings: {error}");
            }
            Err(error) => {
                status_message.set(Some(format!("Save settings failed: {error}")));
                tracing::warn!("Settings save task failed: {error}");
            }
        }
    });
}

fn apply_workspace_settings(
    storage: Arc<dyn NoteStorage>,
    file_state: Signal<FileState>,
    mut ui_state: Signal<UiState>,
    mut status_message: Signal<Option<String>>,
    overrides: WorkspaceSettingsOverrides,
) {
    let workspace = file_state.read().current_workspace.clone();
    let Some(workspace) = workspace else {
        status_message.set(Some(
            "Open a workspace before saving workspace settings".to_string(),
        ));
        return;
    };

    ui_state
        .write()
        .apply_workspace_overrides(overrides.clone());

    spawn(async move {
        let workspace_name = workspace.name.clone();
        let result = tokio::task::spawn_blocking(move || {
            storage.save_workspace_settings(&workspace, &overrides)
        })
        .await;

        match result {
            Ok(Ok(())) => {
                status_message.set(Some(format!("Saved settings for {workspace_name}")));
            }
            Ok(Err(error)) => {
                status_message.set(Some(format!("Save workspace settings failed: {error}")));
                tracing::warn!("Failed to save workspace settings: {error}");
            }
            Err(error) => {
                status_message.set(Some(format!("Save workspace settings failed: {error}")));
                tracing::warn!("Workspace settings save task failed: {error}");
            }
        }
    });
}

fn toggle_expanded_path(
    storage: Arc<dyn NoteStorage>,
    mut file_state: Signal<FileState>,
    mut status_message: Signal<Option<String>>,
    path: PathBuf,
) {
    let workspace = {
        let mut state = file_state.write();
        let workspace = state.current_workspace.clone();
        state.select_path(path.clone());
        state.toggle_expanded(path);
        workspace
    };

    let Some(workspace) = workspace else {
        status_message.set(Some(
            "Open a workspace before expanding folders".to_string(),
        ));
        return;
    };

    let tree_state = {
        let state = file_state.read();
        WorkspaceTreeState::from_expanded_paths(&state.expanded_paths)
    };

    if let Err(error) = storage.save_workspace_tree_state(&workspace, &tree_state) {
        status_message.set(Some(format!("Save file tree state failed: {error}")));
        tracing::warn!("Failed to save file tree state: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::{Theme, ViewMode, WorkspaceSettingsOverrides};
    use papyro_ui::commands::{
        DeleteTagRequest, RecentFileTarget, RenameTagRequest, RestoreTrashedNoteTarget,
        SetTagColorRequest, UpsertTagRequest,
    };

    #[test]
    fn app_action_helpers_wrap_payloads() {
        assert_eq!(
            AppAction::create_note("Draft".to_string()),
            AppAction::CreateNote(crate::actions::CreateNote {
                name: "Draft".to_string()
            })
        );
        assert_eq!(
            AppAction::save_tab("tab-a".to_string()),
            AppAction::SaveTab(crate::actions::SaveTab {
                tab_id: "tab-a".to_string()
            })
        );
        assert_eq!(
            AppAction::open_workspace_path(std::path::PathBuf::from("workspace")),
            AppAction::OpenWorkspacePath(crate::actions::OpenWorkspacePath {
                path: std::path::PathBuf::from("workspace")
            })
        );
        assert_eq!(
            AppAction::open_recent_file(RecentFileTarget {
                workspace_path: std::path::PathBuf::from("workspace"),
                relative_path: std::path::PathBuf::from("notes/a.md"),
            }),
            AppAction::OpenRecentFile(crate::actions::OpenRecentFile {
                target: RecentFileTarget {
                    workspace_path: std::path::PathBuf::from("workspace"),
                    relative_path: std::path::PathBuf::from("notes/a.md"),
                }
            })
        );
        assert_eq!(
            AppAction::search_workspace("release".to_string()),
            AppAction::SearchWorkspace(crate::actions::SearchWorkspace {
                query: "release".to_string()
            })
        );
        assert_eq!(
            AppAction::content_changed("tab-a".to_string(), "body".to_string()),
            AppAction::ContentChanged(papyro_ui::commands::ContentChange {
                tab_id: "tab-a".to_string(),
                content: "body".to_string()
            })
        );
        assert_eq!(
            AppAction::save_settings(papyro_core::models::AppSettings {
                theme: Theme::Dark,
                view_mode: ViewMode::Source,
                ..Default::default()
            }),
            AppAction::SaveSettings(crate::actions::SaveSettings {
                settings: papyro_core::models::AppSettings {
                    theme: Theme::Dark,
                    view_mode: ViewMode::Source,
                    ..Default::default()
                }
            })
        );
        assert_eq!(
            AppAction::save_workspace_settings(WorkspaceSettingsOverrides {
                theme: Some(Theme::Dark),
                ..WorkspaceSettingsOverrides::default()
            }),
            AppAction::SaveWorkspaceSettings(crate::actions::SaveWorkspaceSettings {
                overrides: WorkspaceSettingsOverrides {
                    theme: Some(Theme::Dark),
                    ..WorkspaceSettingsOverrides::default()
                }
            })
        );
        assert_eq!(
            AppAction::toggle_expanded_path(std::path::PathBuf::from("workspace/notes")),
            AppAction::ToggleExpandedPath(crate::actions::ToggleExpandedPath {
                path: std::path::PathBuf::from("workspace/notes")
            })
        );
        assert_eq!(
            AppAction::move_selected_to(std::path::PathBuf::from("workspace/archive")),
            AppAction::MoveSelectedTo(crate::actions::MoveSelectedTo {
                target_dir: std::path::PathBuf::from("workspace/archive")
            })
        );
        assert_eq!(
            AppAction::set_selected_favorite(true),
            AppAction::SetSelectedFavorite(crate::actions::SetSelectedFavorite { favorite: true })
        );
        assert_eq!(AppAction::empty_trash(), AppAction::EmptyTrash);
        assert_eq!(
            AppAction::upsert_tag(UpsertTagRequest {
                name: "Planning".to_string(),
                color: "#2563EB".to_string(),
            }),
            AppAction::UpsertTag(crate::actions::UpsertTag {
                request: UpsertTagRequest {
                    name: "Planning".to_string(),
                    color: "#2563EB".to_string(),
                }
            })
        );
        assert_eq!(
            AppAction::rename_tag(RenameTagRequest {
                id: "planning".to_string(),
                name: "Roadmap".to_string(),
            }),
            AppAction::RenameTag(crate::actions::RenameTag {
                request: RenameTagRequest {
                    id: "planning".to_string(),
                    name: "Roadmap".to_string(),
                }
            })
        );
        assert_eq!(
            AppAction::set_tag_color(SetTagColorRequest {
                id: "planning".to_string(),
                color: "#111827".to_string(),
            }),
            AppAction::SetTagColor(crate::actions::SetTagColor {
                request: SetTagColorRequest {
                    id: "planning".to_string(),
                    color: "#111827".to_string(),
                }
            })
        );
        assert_eq!(
            AppAction::delete_tag(DeleteTagRequest {
                id: "planning".to_string(),
            }),
            AppAction::DeleteTag(crate::actions::DeleteTag {
                request: DeleteTagRequest {
                    id: "planning".to_string(),
                }
            })
        );
        assert_eq!(
            AppAction::restore_trashed_note(RestoreTrashedNoteTarget {
                note_id: "note-a".to_string(),
            }),
            AppAction::RestoreTrashedNote(crate::actions::RestoreTrashedNote {
                target: RestoreTrashedNoteTarget {
                    note_id: "note-a".to_string(),
                }
            })
        );
    }
}
