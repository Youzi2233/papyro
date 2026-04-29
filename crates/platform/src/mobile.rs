use crate::{app_data::ensure_app_data_dir, dialog, reveal::reveal_path, traits::PlatformApi};
use anyhow::Result;
use async_trait::async_trait;
use std::path::{Path, PathBuf};

pub struct MobilePlatform;

#[async_trait]
impl PlatformApi for MobilePlatform {
    async fn pick_folder(&self) -> Result<Option<PathBuf>> {
        dialog::pick_folder("Select workspace folder").await
    }

    async fn pick_file(&self, filters: &[(&str, &[&str])]) -> Result<Option<PathBuf>> {
        dialog::pick_file("Select file", filters).await
    }

    async fn pick_save_file(
        &self,
        filters: &[(&str, &[&str])],
        default_name: &str,
        directory: Option<PathBuf>,
    ) -> Result<Option<PathBuf>> {
        dialog::pick_save_file("Save as", filters, default_name, directory).await
    }

    fn open_in_explorer(&self, path: &Path) -> Result<()> {
        reveal_path(path)
    }

    fn get_app_data_dir(&self) -> Result<PathBuf> {
        ensure_app_data_dir(dirs::data_local_dir())
    }
}
