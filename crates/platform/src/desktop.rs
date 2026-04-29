use crate::{
    app_data::ensure_app_data_dir, dialog, external::open_external_url, reveal::reveal_path,
    traits::PlatformApi,
};
use anyhow::Result;
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use url::Url;

pub struct DesktopPlatform;

#[async_trait]
impl PlatformApi for DesktopPlatform {
    async fn pick_folder(&self) -> Result<Option<PathBuf>> {
        dialog::pick_folder("选择工作空间文件夹").await
    }

    async fn pick_file(&self, filters: &[(&str, &[&str])]) -> Result<Option<PathBuf>> {
        dialog::pick_file("选择文件", filters).await
    }

    async fn pick_save_file(
        &self,
        filters: &[(&str, &[&str])],
        default_name: &str,
        directory: Option<PathBuf>,
    ) -> Result<Option<PathBuf>> {
        dialog::pick_save_file("另存为", filters, default_name, directory).await
    }

    fn open_in_explorer(&self, path: &Path) -> Result<()> {
        reveal_path(path)
    }

    fn open_external_url(&self, url: &str) -> Result<()> {
        open_external_url(url)
    }

    fn get_app_data_dir(&self) -> Result<PathBuf> {
        ensure_app_data_dir(dirs::data_local_dir())
    }
}

pub fn file_paths_from_opened_urls<'a>(urls: impl IntoIterator<Item = &'a Url>) -> Vec<PathBuf> {
    urls.into_iter()
        .filter_map(|url| url.to_file_path().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opened_urls_extract_file_paths_and_ignore_other_schemes() {
        let first_path = std::env::current_dir().unwrap().join("notes/a.md");
        let second_path = std::env::current_dir().unwrap().join("notes/b.markdown");
        let urls = [
            Url::from_file_path(&first_path).unwrap(),
            Url::parse("https://example.test/note.md").unwrap(),
            Url::from_file_path(&second_path).unwrap(),
        ];

        assert_eq!(
            file_paths_from_opened_urls(urls.iter()),
            vec![first_path, second_path]
        );
    }
}
