use crate::actions::AppAction;
use crate::assets::save_pasted_image_asset;
use crate::effects;
use crate::handlers::{file_ops, notes, recovery, search, tags, workspace};
use crate::open_requests::MarkdownOpenRequest;
use crate::perf::{
    perf_timer, tab_revision_and_bytes, trace_app_dispatch, trace_chrome_toggle_sidebar,
    trace_chrome_toggle_theme, trace_editor_switch_tab, trace_editor_view_mode_change,
    trace_runtime_close_tab_handler,
};
use crate::runtime::AppShell;
use crate::settings_persistence::{enqueue_global_settings_save, enqueue_workspace_settings_save};
use crate::state::RuntimeState;
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, WorkspaceSettingsOverrides, WorkspaceTreeState};
use papyro_core::{
    settings_target_theme, sidebar_toggle_target, sidebar_width_target, theme_toggle_target,
    view_mode_target, ChromeSettingsTarget, FileState, NoteStorage, UiState, WindowRouteTarget,
};
use papyro_platform::PlatformApi;
use papyro_ui::commands::{
    AppCommands, ContentChange, OpenMarkdownTarget, PasteImageRequest, SetViewModeRequest,
};
use std::path::{Path, PathBuf};
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
        trace_app_dispatch(&action, self.state, perf_timer());
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
            AppAction::OpenMarkdown(action) => {
                self.dispatch_open_markdown(action.target);
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
                effects::record_content_change(self.storage.clone(), self.state, action);
            }
            AppAction::PasteImage(action) => {
                paste_image(self.state, action.request);
            }
            AppAction::ActivateTab(action) => {
                activate_tab(self.state, action.tab_id);
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
            AppAction::ReloadConflictedActiveNote => {
                notes::reload_conflicted_active_note(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.editor_tabs,
                    self.state.tab_contents,
                    self.state.status_message,
                );
                let mut pending_close_tab = self.state.pending_close_tab;
                pending_close_tab.set(None);
            }
            AppAction::OverwriteActiveNote => {
                notes::overwrite_active_note(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.editor_tabs,
                    self.state.tab_contents,
                    self.state.status_message,
                );
                let mut pending_close_tab = self.state.pending_close_tab;
                pending_close_tab.set(None);
            }
            AppAction::SaveConflictedActiveNoteAs => {
                notes::save_conflicted_active_note_as(
                    self.platform.clone(),
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
                close_tab(self.shell, self.state, action.tab_id);
            }
            AppAction::CompareRecoveryDraft(action) => {
                recovery::compare_recovery_draft(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.recovery_drafts,
                    self.state.recovery_comparison,
                    self.state.status_message,
                    action.note_id,
                );
            }
            AppAction::RestoreRecoveryDraft(action) => {
                let mut recovery_comparison = self.state.recovery_comparison;
                recovery_comparison.set(None);
                recovery::restore_recovery_draft(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.editor_tabs,
                    self.state.tab_contents,
                    self.state.recovery_drafts,
                    self.state.status_message,
                    action.note_id,
                );
            }
            AppAction::DiscardRecoveryDraft(action) => {
                let mut recovery_comparison = self.state.recovery_comparison;
                recovery_comparison.set(None);
                recovery::discard_recovery_draft(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.recovery_drafts,
                    self.state.status_message,
                    action.note_id,
                );
            }
            AppAction::CloseRecoveryComparison => {
                let mut recovery_comparison = self.state.recovery_comparison;
                recovery_comparison.set(None);
            }
            AppAction::ToggleOutline => {
                let mut ui_state = self.state.ui_state;
                ui_state.write().toggle_outline();
            }
            AppAction::ToggleSidebar(action) => {
                toggle_sidebar(self.storage.clone(), self.state, action.trigger);
            }
            AppAction::ToggleTheme => {
                toggle_theme(self.storage.clone(), self.state);
            }
            AppAction::SetViewMode(action) => {
                set_view_mode(self.storage.clone(), self.state, action);
            }
            AppAction::SetSidebarWidth(action) => {
                set_sidebar_width(self.storage.clone(), self.state, action.width);
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
            AppAction::SelectPath(action) => {
                let mut file_state = self.state.file_state;
                file_state.write().select_path(action.path);
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
            AppAction::OpenExternalUrl(action) => {
                file_ops::open_external_url(
                    self.platform.clone(),
                    self.state.status_message,
                    action.url,
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
                    self.state.settings_persistence,
                    action.settings,
                );
            }
            AppAction::SaveWorkspaceSettings(action) => {
                apply_workspace_settings(
                    self.storage.clone(),
                    self.state.file_state,
                    self.state.ui_state,
                    self.state.status_message,
                    self.state.settings_persistence,
                    action.overrides,
                );
            }
        }
    }

    fn dispatch_open_markdown(&self, target: OpenMarkdownTarget) {
        let storage = self.storage.clone();
        let state = self.state;
        spawn(async move {
            run_open_markdown(storage, state, target).await;
        });
    }

    pub(crate) fn dispatch_startup_markdown_paths(&self, markdown_paths: Vec<PathBuf>) {
        self.dispatch_markdown_paths(markdown_paths);
    }

    pub(crate) fn dispatch_external_markdown_request(&self, request: MarkdownOpenRequest) {
        self.dispatch_markdown_paths(request.markdown_paths);
    }

    fn dispatch_markdown_paths(&self, markdown_paths: Vec<PathBuf>) {
        let targets = open_markdown_targets_from_paths(markdown_paths);
        if targets.is_empty() {
            return;
        }

        let storage = self.storage.clone();
        let state = self.state;
        spawn(async move {
            for target in targets {
                run_open_markdown(storage.clone(), state, target).await;
            }
        });
    }

    pub fn commands(&self) -> AppCommands {
        let open_workspace = self.clone();
        let open_workspace_path = self.clone();
        let refresh_workspace = self.clone();
        let create_note = self.clone();
        let create_folder = self.clone();
        let open_markdown = self.clone();
        let search_workspace = self.clone();
        let content_changed = self.clone();
        let paste_image = self.clone();
        let activate_tab = self.clone();
        let save_active_note = self.clone();
        let reload_conflicted_active_note = self.clone();
        let overwrite_active_note = self.clone();
        let save_conflicted_active_note_as = self.clone();
        let save_tab = self.clone();
        let close_tab = self.clone();
        let compare_recovery_draft = self.clone();
        let restore_recovery_draft = self.clone();
        let discard_recovery_draft = self.clone();
        let close_recovery_comparison = self.clone();
        let toggle_outline = self.clone();
        let toggle_sidebar = self.clone();
        let toggle_theme = self.clone();
        let set_view_mode = self.clone();
        let set_sidebar_width = self.clone();
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
        let select_path = self.clone();
        let toggle_expanded_path = self.clone();
        let reveal_in_explorer = self.clone();
        let open_external_url = self.clone();
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
            open_markdown: EventHandler::new(move |target| {
                open_markdown.dispatch(AppAction::open_markdown(target));
            }),
            search_workspace: EventHandler::new(move |query| {
                search_workspace.dispatch(AppAction::search_workspace(query));
            }),
            content_changed: EventHandler::new(move |change: ContentChange| {
                content_changed.dispatch(AppAction::content_change(change));
            }),
            paste_image: EventHandler::new(move |request| {
                paste_image.dispatch(AppAction::paste_image(request));
            }),
            activate_tab: EventHandler::new(move |tab_id| {
                activate_tab.dispatch(AppAction::activate_tab(tab_id));
            }),
            save_active_note: EventHandler::new(move |_| {
                save_active_note.dispatch(AppAction::SaveActiveNote);
            }),
            reload_conflicted_active_note: EventHandler::new(move |_| {
                reload_conflicted_active_note.dispatch(AppAction::ReloadConflictedActiveNote);
            }),
            overwrite_active_note: EventHandler::new(move |_| {
                overwrite_active_note.dispatch(AppAction::OverwriteActiveNote);
            }),
            save_conflicted_active_note_as: EventHandler::new(move |_| {
                save_conflicted_active_note_as.dispatch(AppAction::SaveConflictedActiveNoteAs);
            }),
            save_tab: EventHandler::new(move |tab_id| {
                save_tab.dispatch(AppAction::save_tab(tab_id));
            }),
            close_tab: EventHandler::new(move |tab_id| {
                close_tab.dispatch(AppAction::close_tab(tab_id));
            }),
            compare_recovery_draft: EventHandler::new(move |note_id| {
                compare_recovery_draft.dispatch(AppAction::compare_recovery_draft(note_id));
            }),
            restore_recovery_draft: EventHandler::new(move |note_id| {
                restore_recovery_draft.dispatch(AppAction::restore_recovery_draft(note_id));
            }),
            discard_recovery_draft: EventHandler::new(move |note_id| {
                discard_recovery_draft.dispatch(AppAction::discard_recovery_draft(note_id));
            }),
            close_recovery_comparison: EventHandler::new(move |_| {
                close_recovery_comparison.dispatch(AppAction::CloseRecoveryComparison);
            }),
            toggle_outline: EventHandler::new(move |_| {
                toggle_outline.dispatch(AppAction::ToggleOutline);
            }),
            toggle_sidebar: EventHandler::new(move |trigger| {
                toggle_sidebar.dispatch(AppAction::toggle_sidebar(trigger));
            }),
            toggle_theme: EventHandler::new(move |_| {
                toggle_theme.dispatch(AppAction::ToggleTheme);
            }),
            set_view_mode: EventHandler::new(move |request| {
                set_view_mode.dispatch(AppAction::set_view_mode(request));
            }),
            set_sidebar_width: EventHandler::new(move |width| {
                set_sidebar_width.dispatch(AppAction::set_sidebar_width(width));
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
            select_path: EventHandler::new(move |path| {
                select_path.dispatch(AppAction::select_path(path));
            }),
            toggle_expanded_path: EventHandler::new(move |path| {
                toggle_expanded_path.dispatch(AppAction::toggle_expanded_path(path));
            }),
            reveal_in_explorer: EventHandler::new(move |target| {
                reveal_in_explorer.dispatch(AppAction::reveal_in_explorer(target));
            }),
            open_external_url: EventHandler::new(move |url| {
                open_external_url.dispatch(AppAction::open_external_url(url));
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

fn activate_tab(mut state: RuntimeState, tab_id: String) {
    let perf_started_at = perf_timer();
    state.editor_tabs.write().set_active_tab(&tab_id);
    let view_mode = state.ui_state.read().view_mode.clone();
    let (revision, content_bytes) = tab_revision_and_bytes(&state.tab_contents.read(), &tab_id);
    trace_editor_switch_tab(
        &tab_id,
        revision,
        &view_mode,
        content_bytes,
        perf_started_at,
    );
}

fn paste_image(mut state: RuntimeState, request: PasteImageRequest) {
    let workspace = state.file_state.read().current_workspace.clone();
    let tab = state.editor_tabs.read().tab_by_id(&request.tab_id).cloned();

    let Some((workspace, tab)) = workspace.zip(tab) else {
        state.status_message.set(Some(
            "Open a workspace note before pasting images".to_string(),
        ));
        return;
    };

    let mut status_message = state.status_message;
    let mut editor_runtime_commands = state.editor_runtime_commands;
    spawn(async move {
        match save_pasted_image_asset(&workspace, &tab.path, &request.mime_type, &request.data)
            .await
        {
            Ok(saved) => {
                editor_runtime_commands.with_mut(|commands| {
                    commands.push_insert_markdown(request.tab_id.clone(), saved.markdown);
                });
            }
            Err(error) => {
                status_message.set(Some(error));
            }
        }
    });
}

fn close_tab(shell: AppShell, mut state: RuntimeState, tab_id: String) {
    let perf_started_at = perf_timer();

    let tab = state
        .editor_tabs
        .read()
        .tabs
        .iter()
        .find(|t| t.id == tab_id)
        .cloned();
    let Some(tab) = tab else { return };
    let view_mode = state.ui_state.read().view_mode.clone();
    let (revision, content_bytes) = tab_revision_and_bytes(&state.tab_contents.read(), &tab.id);

    if close_tab_intent(&tab, state.pending_close_tab.read().as_deref())
        == CloseTabIntent::ConfirmDirty
    {
        state.pending_close_tab.set(Some(tab_id));
        state
            .status_message
            .set(Some(shell.close_confirmation(&tab.title)));
        trace_runtime_close_tab_handler(
            &tab.id,
            revision,
            &view_mode,
            content_bytes,
            "confirm_dirty",
            false,
            perf_started_at,
        );
        return;
    }

    let closed = state.editor_tabs.write().close_tab(&tab.id);
    if !closed {
        return;
    }

    state.tab_contents.write().close_tab(&tab.id);
    state.pending_close_tab.set(None);
    state
        .editor_runtime_commands
        .with_mut(|commands| commands.discard_for_tab(&tab.id));

    let closed_title = tab.title;
    state
        .status_message
        .set(Some(format!("Closed {closed_title}")));

    trace_runtime_close_tab_handler(
        &tab.id,
        revision,
        &view_mode,
        content_bytes,
        "close_now",
        true,
        perf_started_at,
    );
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CloseTabIntent {
    ConfirmDirty,
    CloseNow,
}

fn close_tab_intent(tab: &papyro_core::models::EditorTab, pending: Option<&str>) -> CloseTabIntent {
    if tab.is_dirty && pending != Some(tab.id.as_str()) {
        CloseTabIntent::ConfirmDirty
    } else {
        CloseTabIntent::CloseNow
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
    status_message: Signal<Option<String>>,
    settings_persistence: Signal<crate::settings_persistence::SettingsPersistenceQueue>,
    settings: AppSettings,
) {
    ui_state.write().apply_global_settings(settings.clone());
    enqueue_global_settings_save(storage, settings_persistence, status_message, settings);
}

fn apply_workspace_settings(
    storage: Arc<dyn NoteStorage>,
    file_state: Signal<FileState>,
    mut ui_state: Signal<UiState>,
    mut status_message: Signal<Option<String>>,
    settings_persistence: Signal<crate::settings_persistence::SettingsPersistenceQueue>,
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
    enqueue_workspace_settings_save(
        storage,
        settings_persistence,
        status_message,
        workspace,
        overrides,
    );
}

fn toggle_sidebar(storage: Arc<dyn NoteStorage>, state: RuntimeState, trigger: String) {
    let started_at = perf_timer();
    let (collapsed, target) = {
        let ui_state = state.ui_state.read();
        sidebar_toggle_target(&ui_state)
    };

    apply_chrome_settings_target(storage, state, target);
    trace_chrome_toggle_sidebar(&trigger, collapsed, started_at);
}

fn toggle_theme(storage: Arc<dyn NoteStorage>, state: RuntimeState) {
    let started_at = perf_timer();
    let (from_theme, target) = {
        let ui_state = state.ui_state.read();
        (ui_state.theme().clone(), theme_toggle_target(&ui_state))
    };
    let to_theme = settings_target_theme(&target);

    apply_chrome_settings_target(storage, state, target);
    trace_chrome_toggle_theme(&from_theme, &to_theme, started_at);
}

fn set_view_mode(storage: Arc<dyn NoteStorage>, state: RuntimeState, request: SetViewModeRequest) {
    let started_at = perf_timer();
    let Some((previous_mode, next_mode, target)) = ({
        let ui_state = state.ui_state.read();
        view_mode_target(&ui_state, request.mode)
    }) else {
        return;
    };
    let active_tab_id = state.editor_tabs.read().active_tab_id.clone();
    let (revision, content_bytes) = active_tab_id
        .as_deref()
        .map(|tab_id| tab_revision_and_bytes(&state.tab_contents.read(), tab_id))
        .unwrap_or((None, None));

    apply_chrome_settings_target(storage, state, target);
    trace_editor_view_mode_change(
        &request.trigger,
        active_tab_id.as_deref(),
        revision,
        content_bytes,
        &previous_mode,
        &next_mode,
        started_at,
    );
}

fn set_sidebar_width(storage: Arc<dyn NoteStorage>, state: RuntimeState, width: u32) {
    let target = {
        let ui_state = state.ui_state.read();
        sidebar_width_target(&ui_state, width)
    };

    if let Some(target) = target {
        apply_chrome_settings_target(storage, state, target);
    }
}

fn apply_chrome_settings_target(
    storage: Arc<dyn NoteStorage>,
    state: RuntimeState,
    target: ChromeSettingsTarget,
) {
    match target {
        ChromeSettingsTarget::Global(settings) => {
            apply_settings(
                storage,
                state.ui_state,
                state.status_message,
                state.settings_persistence,
                settings,
            );
        }
        ChromeSettingsTarget::Workspace(overrides) => {
            apply_workspace_settings(
                storage,
                state.file_state,
                state.ui_state,
                state.status_message,
                state.settings_persistence,
                overrides,
            );
        }
    }
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

async fn run_open_markdown(
    storage: Arc<dyn NoteStorage>,
    state: RuntimeState,
    target: OpenMarkdownTarget,
) {
    let route_target = {
        let process_runtime = state.process_runtime.read();
        process_runtime.route_markdown_open(&target.path)
    };
    match route_target {
        WindowRouteTarget::CurrentWindow(_) => {}
        WindowRouteTarget::ExistingDocumentWindow(window_id) => {
            tracing::warn!(
                window_id = window_id.as_str(),
                "multi-window document focus route is not implemented; falling back to current tabs"
            );
        }
        WindowRouteTarget::NewDocumentWindow => {
            tracing::warn!(
                "multi-window document creation route is not implemented; falling back to current tabs"
            );
        }
    }

    let should_flush = {
        let file_state = state.file_state.read();
        open_markdown_requires_dirty_flush(&file_state, &target.path)
    };

    if should_flush && !effects::flush_dirty_tabs(storage.clone(), state).await {
        return;
    }

    notes::open_markdown(storage, state, target).await;
}

fn open_markdown_targets_from_paths(markdown_paths: Vec<PathBuf>) -> Vec<OpenMarkdownTarget> {
    markdown_paths
        .into_iter()
        .map(|path| OpenMarkdownTarget { path })
        .collect()
}

fn open_markdown_requires_dirty_flush(file_state: &FileState, path: &Path) -> bool {
    file_state
        .current_workspace
        .as_ref()
        .is_none_or(|workspace| !path.starts_with(&workspace.path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::{Theme, ViewMode, Workspace, WorkspaceSettingsOverrides};
    use papyro_ui::commands::{
        ChromeTrigger, DeleteTagRequest, OpenMarkdownTarget, RenameTagRequest,
        RestoreTrashedNoteTarget, SetTagColorRequest, SetViewModeRequest, UpsertTagRequest,
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
            AppAction::open_markdown(OpenMarkdownTarget {
                path: std::path::PathBuf::from("workspace/notes/a.md"),
            }),
            AppAction::OpenMarkdown(crate::actions::OpenMarkdown {
                target: OpenMarkdownTarget {
                    path: std::path::PathBuf::from("workspace/notes/a.md"),
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
            AppAction::content_change(papyro_ui::commands::ContentChange {
                tab_id: "tab-a".to_string(),
                content: "body".to_string(),
                hybrid_block_kind: None,
                hybrid_block_state: None,
                hybrid_block_tier: None,
                hybrid_fallback_reason: None,
            }),
            AppAction::ContentChanged(papyro_ui::commands::ContentChange {
                tab_id: "tab-a".to_string(),
                content: "body".to_string(),
                hybrid_block_kind: None,
                hybrid_block_state: None,
                hybrid_block_tier: None,
                hybrid_fallback_reason: None
            })
        );
        assert_eq!(
            AppAction::paste_image(papyro_ui::commands::PasteImageRequest {
                tab_id: "tab-a".to_string(),
                mime_type: "image/png".to_string(),
                data: "YWJj".to_string(),
            }),
            AppAction::PasteImage(crate::actions::PasteImage {
                request: papyro_ui::commands::PasteImageRequest {
                    tab_id: "tab-a".to_string(),
                    mime_type: "image/png".to_string(),
                    data: "YWJj".to_string(),
                }
            })
        );
        assert_eq!(
            AppAction::activate_tab("tab-a".to_string()),
            AppAction::ActivateTab(crate::actions::ActivateTab {
                tab_id: "tab-a".to_string()
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
            AppAction::select_path(std::path::PathBuf::from("workspace/notes/a.md")),
            AppAction::SelectPath(crate::actions::SelectPath {
                path: std::path::PathBuf::from("workspace/notes/a.md")
            })
        );
        assert_eq!(
            AppAction::select_path(std::path::PathBuf::from("workspace/notes/a.md"))
                .trace_interaction_path(),
            "workspace.selection"
        );
        assert_eq!(
            AppAction::set_selected_favorite(true),
            AppAction::SetSelectedFavorite(crate::actions::SetSelectedFavorite { favorite: true })
        );
        assert_eq!(AppAction::empty_trash(), AppAction::EmptyTrash);
        assert_eq!(AppAction::SaveActiveNote.trace_name(), "save_active_note");
        assert_eq!(
            AppAction::close_tab("tab-a".to_string()).trace_interaction_path(),
            "editor.tab_close"
        );
        assert_eq!(
            AppAction::compare_recovery_draft("note-a".to_string()),
            AppAction::CompareRecoveryDraft(crate::actions::RecoveryDraftAction {
                note_id: "note-a".to_string()
            })
        );
        assert_eq!(
            AppAction::compare_recovery_draft("note-a".to_string()).trace_interaction_path(),
            "editor.recovery"
        );
        assert_eq!(
            AppAction::CloseRecoveryComparison.trace_name(),
            "close_recovery_comparison"
        );
        assert_eq!(AppAction::ToggleOutline.trace_name(), "toggle_outline");
        assert_eq!(
            AppAction::ToggleOutline.trace_interaction_path(),
            "chrome.outline"
        );
        assert_eq!(
            AppAction::toggle_sidebar(ChromeTrigger::new("test")),
            AppAction::ToggleSidebar(ChromeTrigger::new("test"))
        );
        assert_eq!(
            AppAction::ToggleTheme.trace_interaction_path(),
            "chrome.theme"
        );
        assert_eq!(
            AppAction::set_view_mode(SetViewModeRequest::new(ViewMode::Preview, "test")),
            AppAction::SetViewMode(SetViewModeRequest::new(ViewMode::Preview, "test"))
        );
        assert_eq!(
            AppAction::set_view_mode(SetViewModeRequest::new(ViewMode::Preview, "test"))
                .trace_interaction_path(),
            "editor.view_mode"
        );
        assert_eq!(
            AppAction::set_sidebar_width(320),
            AppAction::SetSidebarWidth(crate::actions::SetSidebarWidth { width: 320 })
        );
        assert_eq!(
            AppAction::content_change(papyro_ui::commands::ContentChange {
                tab_id: "tab-a".to_string(),
                content: "body".to_string(),
                hybrid_block_kind: None,
                hybrid_block_state: None,
                hybrid_block_tier: None,
                hybrid_fallback_reason: None,
            })
            .trace_tab_id(),
            Some("tab-a")
        );
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
        assert_eq!(
            AppAction::open_external_url("https://example.test".to_string()),
            AppAction::OpenExternalUrl(crate::actions::OpenExternalUrl {
                url: "https://example.test".to_string(),
            })
        );
        assert_eq!(
            AppAction::open_external_url("https://example.test".to_string())
                .trace_interaction_path(),
            "platform.external_link"
        );
    }

    #[test]
    fn startup_markdown_paths_map_to_open_markdown_targets() {
        assert_eq!(
            open_markdown_targets_from_paths(vec![
                std::path::PathBuf::from("workspace/a.md"),
                std::path::PathBuf::from("workspace/b.markdown"),
            ]),
            vec![
                OpenMarkdownTarget {
                    path: std::path::PathBuf::from("workspace/a.md"),
                },
                OpenMarkdownTarget {
                    path: std::path::PathBuf::from("workspace/b.markdown"),
                },
            ]
        );
    }

    #[test]
    fn dirty_tab_close_requires_confirmation_without_saving() {
        let tab = papyro_core::models::EditorTab {
            id: "tab-a".to_string(),
            note_id: "note-a".to_string(),
            title: "A".to_string(),
            path: std::path::PathBuf::from("a.md"),
            is_dirty: true,
            save_status: papyro_core::models::SaveStatus::Dirty,
            disk_content_hash: None,
        };

        assert_eq!(close_tab_intent(&tab, None), CloseTabIntent::ConfirmDirty);
        assert_eq!(
            close_tab_intent(&tab, Some("tab-a")),
            CloseTabIntent::CloseNow
        );
        assert_eq!(
            close_tab_intent(&tab, Some("tab-b")),
            CloseTabIntent::ConfirmDirty
        );
    }

    #[test]
    fn clean_tab_close_does_not_require_confirmation() {
        let tab = papyro_core::models::EditorTab {
            id: "tab-a".to_string(),
            note_id: "note-a".to_string(),
            title: "A".to_string(),
            path: std::path::PathBuf::from("a.md"),
            is_dirty: false,
            save_status: papyro_core::models::SaveStatus::Saved,
            disk_content_hash: None,
        };

        assert_eq!(close_tab_intent(&tab, None), CloseTabIntent::CloseNow);
    }

    #[test]
    fn open_markdown_flush_gate_only_triggers_outside_current_workspace() {
        let state = FileState {
            current_workspace: Some(Workspace {
                id: "workspace".to_string(),
                name: "Workspace".to_string(),
                path: std::path::PathBuf::from("workspace"),
                created_at: 0,
                last_opened: None,
                sort_order: 0,
            }),
            ..FileState::default()
        };

        assert!(!open_markdown_requires_dirty_flush(
            &state,
            std::path::Path::new("workspace/notes/a.md")
        ));
        assert!(open_markdown_requires_dirty_flush(
            &state,
            std::path::Path::new("archive/notes/a.md")
        ));
        assert!(open_markdown_requires_dirty_flush(
            &FileState::default(),
            std::path::Path::new("workspace/notes/a.md")
        ));
    }
}
