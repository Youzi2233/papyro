use anyhow::Result;
use async_trait::async_trait;
use std::path::{Path, PathBuf};

#[async_trait]
pub trait PlatformApi: Send + Sync {
    async fn pick_folder(&self) -> Result<Option<PathBuf>>;
    async fn pick_file(&self, filters: &[(&str, &[&str])]) -> Result<Option<PathBuf>>;
    async fn pick_save_file(
        &self,
        filters: &[(&str, &[&str])],
        default_name: &str,
        directory: Option<PathBuf>,
    ) -> Result<Option<PathBuf>>;
    fn open_in_explorer(&self, path: &Path) -> Result<()>;
    fn get_app_data_dir(&self) -> Result<PathBuf>;
}
