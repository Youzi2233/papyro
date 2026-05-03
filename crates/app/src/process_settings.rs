use crate::state::RuntimeState;
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, Workspace, WorkspaceSettingsOverrides};
use papyro_core::WorkspaceBootstrap;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::watch;

#[derive(Clone)]
pub(crate) struct ProcessSettingsHub {
    inner: Arc<ProcessSettingsHubInner>,
}

impl PartialEq for ProcessSettingsHub {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.inner, &other.inner)
    }
}

struct ProcessSettingsHubInner {
    snapshot: Mutex<ProcessSettingsSnapshot>,
    sender: watch::Sender<ProcessSettingsSnapshot>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ProcessSettingsSnapshot {
    global_settings: AppSettings,
    global_revision: u64,
    global_initialized: bool,
    workspace_overrides: HashMap<String, WorkspaceSettingsState>,
}

#[derive(Debug, Clone, PartialEq)]
struct WorkspaceSettingsState {
    overrides: WorkspaceSettingsOverrides,
    revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SettingsPersistenceGuard {
    Global { revision: u64 },
    Workspace { workspace_id: String, revision: u64 },
}

impl Default for ProcessSettingsHub {
    fn default() -> Self {
        let snapshot = ProcessSettingsSnapshot {
            global_settings: AppSettings::default(),
            global_revision: 0,
            global_initialized: false,
            workspace_overrides: HashMap::new(),
        };
        let (sender, _) = watch::channel(snapshot.clone());

        Self {
            inner: Arc::new(ProcessSettingsHubInner {
                snapshot: Mutex::new(snapshot),
                sender,
            }),
        }
    }
}

impl ProcessSettingsHub {
    pub(crate) fn prepare_bootstrap(
        &self,
        mut bootstrap: WorkspaceBootstrap,
    ) -> WorkspaceBootstrap {
        let global_settings = self.ensure_global_settings(bootstrap.global_settings.clone());
        let workspace_overrides = bootstrap
            .file_state
            .current_workspace
            .as_ref()
            .map(|workspace| {
                self.ensure_workspace_overrides(&workspace.id, bootstrap.workspace_settings.clone())
            })
            .unwrap_or_default();

        bootstrap.global_settings = global_settings.clone();
        bootstrap.workspace_settings = workspace_overrides.clone();
        bootstrap.settings = global_settings.with_workspace_overrides(&workspace_overrides);
        bootstrap
    }

    pub(crate) fn publish_global(&self, settings: AppSettings) -> SettingsPersistenceGuard {
        let snapshot = {
            let mut snapshot = self.inner.snapshot.lock().unwrap();
            snapshot.global_revision = snapshot.global_revision.saturating_add(1);
            snapshot.global_initialized = true;
            snapshot.global_settings = settings;
            snapshot.clone()
        };
        let _ = self.inner.sender.send(snapshot.clone());

        SettingsPersistenceGuard::Global {
            revision: snapshot.global_revision,
        }
    }

    pub(crate) fn publish_workspace(
        &self,
        workspace: &Workspace,
        overrides: WorkspaceSettingsOverrides,
    ) -> SettingsPersistenceGuard {
        let snapshot = {
            let mut snapshot = self.inner.snapshot.lock().unwrap();
            let state = snapshot
                .workspace_overrides
                .entry(workspace.id.clone())
                .or_insert_with(|| WorkspaceSettingsState {
                    overrides: WorkspaceSettingsOverrides::default(),
                    revision: 0,
                });
            state.revision = state.revision.saturating_add(1);
            state.overrides = overrides;
            snapshot.clone()
        };
        let _ = self.inner.sender.send(snapshot.clone());

        SettingsPersistenceGuard::Workspace {
            workspace_id: workspace.id.clone(),
            revision: snapshot
                .workspace_overrides
                .get(&workspace.id)
                .map(|state| state.revision)
                .unwrap_or_default(),
        }
    }

    pub(crate) fn is_current(&self, guard: &SettingsPersistenceGuard) -> bool {
        let snapshot = self.inner.snapshot.lock().unwrap();
        match guard {
            SettingsPersistenceGuard::Global { revision } => snapshot.global_revision == *revision,
            SettingsPersistenceGuard::Workspace {
                workspace_id,
                revision,
            } => snapshot
                .workspace_overrides
                .get(workspace_id)
                .is_some_and(|state| state.revision == *revision),
        }
    }

    #[cfg(test)]
    pub(crate) fn current_global_settings(&self) -> AppSettings {
        self.inner.snapshot.lock().unwrap().global_settings.clone()
    }

    #[cfg(test)]
    fn current_workspace_overrides(
        &self,
        workspace_id: &str,
    ) -> Option<WorkspaceSettingsOverrides> {
        self.inner
            .snapshot
            .lock()
            .unwrap()
            .workspace_overrides
            .get(workspace_id)
            .map(|state| state.overrides.clone())
    }

    fn current_snapshot(&self) -> ProcessSettingsSnapshot {
        self.inner.snapshot.lock().unwrap().clone()
    }

    fn subscribe(&self) -> watch::Receiver<ProcessSettingsSnapshot> {
        self.inner.sender.subscribe()
    }

    fn ensure_global_settings(&self, settings: AppSettings) -> AppSettings {
        let snapshot = {
            let mut snapshot = self.inner.snapshot.lock().unwrap();
            if snapshot.global_initialized {
                return snapshot.global_settings.clone();
            }

            snapshot.global_initialized = true;
            snapshot.global_settings = settings;
            snapshot.clone()
        };
        let _ = self.inner.sender.send(snapshot.clone());
        snapshot.global_settings
    }

    fn ensure_workspace_overrides(
        &self,
        workspace_id: &str,
        overrides: WorkspaceSettingsOverrides,
    ) -> WorkspaceSettingsOverrides {
        let mut snapshot = self.inner.snapshot.lock().unwrap();
        let state = snapshot
            .workspace_overrides
            .entry(workspace_id.to_string())
            .or_insert_with(|| WorkspaceSettingsState {
                overrides,
                revision: 0,
            });
        state.overrides.clone()
    }
}

pub(crate) fn shared_process_settings_hub() -> ProcessSettingsHub {
    static HUB: OnceLock<ProcessSettingsHub> = OnceLock::new();
    HUB.get_or_init(ProcessSettingsHub::default).clone()
}

pub(crate) fn use_process_settings_sync(state: RuntimeState, process_settings: ProcessSettingsHub) {
    let receiver = use_hook({
        let process_settings = process_settings.clone();
        move || process_settings.subscribe()
    });
    let workspace_id = use_memo(move || {
        state
            .file_state
            .read()
            .current_workspace
            .as_ref()
            .map(|workspace| workspace.id.clone())
    });

    use_effect(use_reactive((&workspace_id,), {
        let process_settings = process_settings.clone();
        move |_| {
            let snapshot = process_settings.current_snapshot();
            apply_process_settings_snapshot(state, &snapshot);
        }
    }));

    use_effect(move || {
        let mut receiver = receiver.clone();
        spawn(async move {
            while receiver.changed().await.is_ok() {
                let snapshot = receiver.borrow().clone();
                apply_process_settings_snapshot(state, &snapshot);
            }
        });
    });
}

fn apply_process_settings_snapshot(mut state: RuntimeState, snapshot: &ProcessSettingsSnapshot) {
    let workspace_id = state
        .file_state
        .read()
        .current_workspace
        .as_ref()
        .map(|workspace| workspace.id.clone());
    let workspace_overrides = workspace_id
        .as_deref()
        .and_then(|workspace_id| snapshot.workspace_overrides.get(workspace_id))
        .map(|state| state.overrides.clone())
        .unwrap_or_default();

    let mut ui_state = state.ui_state.write();
    if ui_state.global_settings != snapshot.global_settings {
        ui_state.apply_global_settings(snapshot.global_settings.clone());
        state
            .process_runtime
            .write()
            .apply_settings(&snapshot.global_settings);
    }

    if ui_state.workspace_overrides != workspace_overrides {
        ui_state.apply_workspace_overrides(workspace_overrides);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::{Theme, ViewMode, Workspace};
    use papyro_core::FileState;
    use std::path::PathBuf;

    fn workspace(id: &str) -> Workspace {
        Workspace {
            id: id.to_string(),
            name: id.to_string(),
            path: PathBuf::from(id),
            created_at: 0,
            last_opened: None,
            sort_order: 0,
        }
    }

    #[test]
    fn bootstrap_uses_process_global_settings() {
        let hub = ProcessSettingsHub::default();
        hub.publish_global(AppSettings {
            theme: Theme::Dark,
            view_mode: ViewMode::Preview,
            ..AppSettings::default()
        });
        let bootstrap = WorkspaceBootstrap {
            global_settings: AppSettings {
                theme: Theme::Light,
                view_mode: ViewMode::Source,
                ..AppSettings::default()
            },
            ..WorkspaceBootstrap::default()
        };

        let prepared = hub.prepare_bootstrap(bootstrap);

        assert_eq!(prepared.global_settings.theme, Theme::Dark);
        assert_eq!(prepared.settings.theme, Theme::Dark);
        assert_eq!(prepared.settings.view_mode, ViewMode::Preview);
    }

    #[test]
    fn workspace_overrides_are_reused_for_matching_workspace() {
        let hub = ProcessSettingsHub::default();
        let workspace = workspace("workspace-a");
        let guard = hub.publish_workspace(
            &workspace,
            WorkspaceSettingsOverrides {
                theme: Some(Theme::GitHubDark),
                ..WorkspaceSettingsOverrides::default()
            },
        );
        let file_state = FileState {
            current_workspace: Some(workspace.clone()),
            ..FileState::default()
        };
        let bootstrap = WorkspaceBootstrap {
            file_state,
            global_settings: AppSettings {
                theme: Theme::Light,
                ..AppSettings::default()
            },
            workspace_settings: WorkspaceSettingsOverrides {
                theme: Some(Theme::WarmReading),
                ..WorkspaceSettingsOverrides::default()
            },
            ..WorkspaceBootstrap::default()
        };

        let prepared = hub.prepare_bootstrap(bootstrap);

        assert_eq!(prepared.workspace_settings.theme, Some(Theme::GitHubDark));
        assert_eq!(prepared.settings.theme, Theme::GitHubDark);
        assert_eq!(
            hub.current_workspace_overrides(&workspace.id)
                .and_then(|overrides| overrides.theme),
            Some(Theme::GitHubDark)
        );
        assert!(hub.is_current(&guard));
    }

    #[test]
    fn newer_global_publish_invalidates_old_guard() {
        let hub = ProcessSettingsHub::default();
        let first = hub.publish_global(AppSettings {
            theme: Theme::Light,
            ..AppSettings::default()
        });
        let second = hub.publish_global(AppSettings {
            theme: Theme::Dark,
            ..AppSettings::default()
        });

        assert!(!hub.is_current(&first));
        assert!(hub.is_current(&second));
        assert_eq!(hub.current_global_settings().theme, Theme::Dark);
    }
}
