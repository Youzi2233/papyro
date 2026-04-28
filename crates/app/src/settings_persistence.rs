use dioxus::prelude::*;
use papyro_core::models::{AppSettings, Workspace, WorkspaceSettingsOverrides};
use papyro_core::NoteStorage;
use std::collections::VecDeque;
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Default)]
pub(crate) struct SettingsPersistenceQueue {
    pending: VecDeque<SettingsPersistenceJob>,
    in_flight: bool,
}

#[derive(Debug, Clone, PartialEq)]
enum SettingsPersistenceJob {
    Global(AppSettings),
    Workspace {
        workspace: Workspace,
        overrides: WorkspaceSettingsOverrides,
    },
}

impl SettingsPersistenceQueue {
    pub(crate) fn enqueue_global(&mut self, settings: AppSettings) -> bool {
        self.coalesce_global(settings);
        self.start_next()
    }

    pub(crate) fn enqueue_workspace(
        &mut self,
        workspace: Workspace,
        overrides: WorkspaceSettingsOverrides,
    ) -> bool {
        self.coalesce_workspace(workspace, overrides);
        self.start_next()
    }

    fn coalesce_global(&mut self, settings: AppSettings) {
        if let Some(job) = self
            .pending
            .iter_mut()
            .find(|job| matches!(job, SettingsPersistenceJob::Global(_)))
        {
            *job = SettingsPersistenceJob::Global(settings);
            return;
        }

        self.pending
            .push_back(SettingsPersistenceJob::Global(settings));
    }

    fn coalesce_workspace(&mut self, workspace: Workspace, overrides: WorkspaceSettingsOverrides) {
        if let Some(job) = self.pending.iter_mut().find(|job| {
            matches!(
                job,
                SettingsPersistenceJob::Workspace {
                    workspace: existing,
                    ..
                } if existing.id == workspace.id
            )
        }) {
            *job = SettingsPersistenceJob::Workspace {
                workspace,
                overrides,
            };
            return;
        }

        self.pending.push_back(SettingsPersistenceJob::Workspace {
            workspace,
            overrides,
        });
    }

    fn start_next(&mut self) -> bool {
        if self.in_flight || self.pending.is_empty() {
            return false;
        }

        self.in_flight = true;
        true
    }

    fn take_next(&mut self) -> Option<SettingsPersistenceJob> {
        if !self.in_flight {
            return None;
        }

        self.pending.pop_front()
    }

    fn finish_current(&mut self) -> bool {
        self.in_flight = false;
        self.start_next()
    }
}

pub(crate) fn enqueue_global_settings_save(
    storage: Arc<dyn NoteStorage>,
    mut queue: Signal<SettingsPersistenceQueue>,
    status_message: Signal<Option<String>>,
    settings: AppSettings,
) {
    let should_start = queue.write().enqueue_global(settings);
    if should_start {
        spawn_settings_worker(storage, queue, status_message);
    }
}

pub(crate) fn enqueue_workspace_settings_save(
    storage: Arc<dyn NoteStorage>,
    mut queue: Signal<SettingsPersistenceQueue>,
    status_message: Signal<Option<String>>,
    workspace: Workspace,
    overrides: WorkspaceSettingsOverrides,
) {
    let should_start = queue.write().enqueue_workspace(workspace, overrides);
    if should_start {
        spawn_settings_worker(storage, queue, status_message);
    }
}

fn spawn_settings_worker(
    storage: Arc<dyn NoteStorage>,
    mut queue: Signal<SettingsPersistenceQueue>,
    mut status_message: Signal<Option<String>>,
) {
    spawn(async move {
        loop {
            let job = queue.write().take_next();
            let Some(job) = job else {
                queue.with_mut(|queue| {
                    queue.in_flight = false;
                });
                return;
            };

            let result = persist_job(storage.clone(), job).await;
            match result {
                SettingsPersistenceResult::SavedGlobal => {
                    status_message.set(Some("Saved global settings".to_string()));
                }
                SettingsPersistenceResult::SavedWorkspace { workspace_name } => {
                    status_message.set(Some(format!("Saved settings for {workspace_name}")));
                }
                SettingsPersistenceResult::Failed { scope, error } => {
                    status_message.set(Some(format!("Save {scope} settings failed: {error}")));
                    tracing::warn!(%scope, %error, "Failed to save settings");
                }
            }

            if !queue.write().finish_current() {
                return;
            }
        }
    });
}

enum SettingsPersistenceResult {
    SavedGlobal,
    SavedWorkspace { workspace_name: String },
    Failed { scope: &'static str, error: String },
}

async fn persist_job(
    storage: Arc<dyn NoteStorage>,
    job: SettingsPersistenceJob,
) -> SettingsPersistenceResult {
    match job {
        SettingsPersistenceJob::Global(settings) => {
            let result =
                tokio::task::spawn_blocking(move || storage.save_settings(&settings)).await;
            match result {
                Ok(Ok(())) => SettingsPersistenceResult::SavedGlobal,
                Ok(Err(error)) => SettingsPersistenceResult::Failed {
                    scope: "global",
                    error: error.to_string(),
                },
                Err(error) => SettingsPersistenceResult::Failed {
                    scope: "global",
                    error: error.to_string(),
                },
            }
        }
        SettingsPersistenceJob::Workspace {
            workspace,
            overrides,
        } => {
            let workspace_name = workspace.name.clone();
            let result = tokio::task::spawn_blocking(move || {
                storage.save_workspace_settings(&workspace, &overrides)
            })
            .await;
            match result {
                Ok(Ok(())) => SettingsPersistenceResult::SavedWorkspace { workspace_name },
                Ok(Err(error)) => SettingsPersistenceResult::Failed {
                    scope: "workspace",
                    error: error.to_string(),
                },
                Err(error) => SettingsPersistenceResult::Failed {
                    scope: "workspace",
                    error: error.to_string(),
                },
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn settings(theme: papyro_core::models::Theme) -> AppSettings {
        AppSettings {
            theme,
            ..AppSettings::default()
        }
    }

    fn workspace(id: &str, name: &str) -> Workspace {
        Workspace {
            id: id.to_string(),
            name: name.to_string(),
            path: PathBuf::from(name),
            created_at: 0,
            last_opened: None,
            sort_order: 0,
        }
    }

    #[test]
    fn global_settings_jobs_are_coalesced() {
        let mut queue = SettingsPersistenceQueue::default();

        assert!(queue.enqueue_global(settings(papyro_core::models::Theme::Light)));
        assert!(!queue.enqueue_global(settings(papyro_core::models::Theme::Dark)));

        let Some(SettingsPersistenceJob::Global(saved)) = queue.take_next() else {
            panic!("expected global settings job");
        };
        assert_eq!(saved.theme, papyro_core::models::Theme::Dark);
    }

    #[test]
    fn workspace_settings_jobs_are_coalesced_per_workspace() {
        let mut queue = SettingsPersistenceQueue::default();
        let first = workspace("a", "A");
        let second = workspace("b", "B");

        assert!(queue.enqueue_workspace(
            first.clone(),
            WorkspaceSettingsOverrides {
                sidebar_collapsed: Some(false),
                ..WorkspaceSettingsOverrides::default()
            },
        ));
        assert!(!queue.enqueue_workspace(
            first.clone(),
            WorkspaceSettingsOverrides {
                sidebar_collapsed: Some(true),
                ..WorkspaceSettingsOverrides::default()
            },
        ));
        assert!(!queue.enqueue_workspace(
            second.clone(),
            WorkspaceSettingsOverrides {
                sidebar_collapsed: Some(false),
                ..WorkspaceSettingsOverrides::default()
            },
        ));

        let Some(SettingsPersistenceJob::Workspace {
            workspace,
            overrides,
        }) = queue.take_next()
        else {
            panic!("expected first workspace settings job");
        };
        assert_eq!(workspace.id, "a");
        assert_eq!(overrides.sidebar_collapsed, Some(true));

        assert!(queue.finish_current());
        let Some(SettingsPersistenceJob::Workspace { workspace, .. }) = queue.take_next() else {
            panic!("expected second workspace settings job");
        };
        assert_eq!(workspace.id, "b");
    }
}
