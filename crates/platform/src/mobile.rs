use crate::traits::PlatformApi;
use anyhow::Result;
use async_trait::async_trait;
use std::path::{Path, PathBuf};

pub struct MobilePlatform;

#[async_trait]
impl PlatformApi for MobilePlatform {
    async fn pick_folder(&self) -> Result<Option<PathBuf>> {
        let handle = rfd::AsyncFileDialog::new()
            .set_title("Select workspace folder")
            .pick_folder()
            .await;
        Ok(handle.map(|h| h.path().to_owned()))
    }

    async fn pick_file(&self, filters: &[(&str, &[&str])]) -> Result<Option<PathBuf>> {
        let mut dialog = rfd::AsyncFileDialog::new().set_title("Select file");
        for (name, exts) in filters {
            dialog = dialog.add_filter(*name, exts);
        }
        let handle = dialog.pick_file().await;
        Ok(handle.map(|h| h.path().to_owned()))
    }

    fn open_in_explorer(&self, path: &Path) -> Result<()> {
        open::that(path)?;
        Ok(())
    }

    fn get_app_data_dir(&self) -> Result<PathBuf> {
        let dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("papyro");
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }
}
