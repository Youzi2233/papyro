use crate::runtime::{use_app_runtime, AppShell};
use dioxus::prelude::*;
use papyro_core::models::AppSettings;
use papyro_core::{NoteStorage, WorkspaceBootstrap};
use papyro_platform::{MobilePlatform, PlatformApi};
use std::sync::Arc;

fn mobile_storage() -> anyhow::Result<papyro_storage::SqliteStorage> {
    let app_data_dir = MobilePlatform.get_app_data_dir()?;
    papyro_storage::SqliteStorage::shared_in_app_data_dir(&app_data_dir)
}

fn mobile_bootstrap() -> WorkspaceBootstrap {
    mobile_storage()
        .map(|storage| storage.bootstrap_from_env_or_current_dir())
        .unwrap_or_else(|error| WorkspaceBootstrap {
            status_message: "Failed to initialize mobile storage".to_string(),
            error_message: Some(error.to_string()),
            settings: AppSettings::default(),
            ..WorkspaceBootstrap::default()
        })
}

#[component]
pub fn MobileApp() -> Element {
    let bootstrap = use_hook(mobile_bootstrap);
    let storage = use_hook(|| {
        let storage = mobile_storage().unwrap_or_else(|error| {
            tracing::warn!("Failed to initialize mobile app-data storage: {error}");
            papyro_storage::SqliteStorage::shared().expect("default storage is initialized")
        });
        Arc::new(storage) as Arc<dyn NoteStorage>
    });
    let platform = use_hook(|| Arc::new(MobilePlatform) as Arc<dyn PlatformApi>);
    use_app_runtime(AppShell::Mobile, bootstrap, storage, platform);

    rsx! {
        papyro_ui::layouts::MobileLayout {}
    }
}
