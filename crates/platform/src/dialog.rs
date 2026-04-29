use anyhow::{Context, Result};
use async_trait::async_trait;
use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct FileDialogFilter {
    pub(crate) name: String,
    pub(crate) extensions: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct OpenFileDialogRequest {
    pub(crate) title: String,
    pub(crate) filters: Vec<FileDialogFilter>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SaveFileDialogRequest {
    pub(crate) title: String,
    pub(crate) filters: Vec<FileDialogFilter>,
    pub(crate) default_name: String,
    pub(crate) directory: Option<PathBuf>,
}

#[async_trait]
pub(crate) trait FileDialogAdapter: Send + Sync {
    async fn pick_folder(&self, title: String) -> Result<Option<PathBuf>>;
    async fn pick_file(&self, request: OpenFileDialogRequest) -> Result<Option<PathBuf>>;
    async fn pick_save_file(&self, request: SaveFileDialogRequest) -> Result<Option<PathBuf>>;
}

pub(crate) struct RfdFileDialogAdapter;

#[async_trait]
impl FileDialogAdapter for RfdFileDialogAdapter {
    async fn pick_folder(&self, title: String) -> Result<Option<PathBuf>> {
        let handle = rfd::AsyncFileDialog::new()
            .set_title(title.as_str())
            .pick_folder()
            .await;
        Ok(handle.map(|handle| handle.path().to_owned()))
    }

    async fn pick_file(&self, request: OpenFileDialogRequest) -> Result<Option<PathBuf>> {
        let mut dialog = rfd::AsyncFileDialog::new().set_title(request.title.as_str());
        for filter in &request.filters {
            let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
            dialog = dialog.add_filter(filter.name.as_str(), &extensions);
        }
        let handle = dialog.pick_file().await;
        Ok(handle.map(|handle| handle.path().to_owned()))
    }

    async fn pick_save_file(&self, request: SaveFileDialogRequest) -> Result<Option<PathBuf>> {
        let mut dialog = rfd::AsyncFileDialog::new()
            .set_title(request.title.as_str())
            .set_file_name(request.default_name.as_str());
        if let Some(directory) = request.directory {
            dialog = dialog.set_directory(directory);
        }
        for filter in &request.filters {
            let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
            dialog = dialog.add_filter(filter.name.as_str(), &extensions);
        }
        let handle = dialog.save_file().await;
        Ok(handle.map(|handle| handle.path().to_owned()))
    }
}

pub(crate) async fn pick_folder(title: &str) -> Result<Option<PathBuf>> {
    pick_folder_with(&RfdFileDialogAdapter, title).await
}

pub(crate) async fn pick_file(title: &str, filters: &[(&str, &[&str])]) -> Result<Option<PathBuf>> {
    pick_file_with(&RfdFileDialogAdapter, title, filters).await
}

pub(crate) async fn pick_save_file(
    title: &str,
    filters: &[(&str, &[&str])],
    default_name: &str,
    directory: Option<PathBuf>,
) -> Result<Option<PathBuf>> {
    pick_save_file_with(
        &RfdFileDialogAdapter,
        title,
        filters,
        default_name,
        directory,
    )
    .await
}

async fn pick_folder_with<A>(adapter: &A, title: &str) -> Result<Option<PathBuf>>
where
    A: FileDialogAdapter + ?Sized,
{
    adapter
        .pick_folder(title.to_string())
        .await
        .with_context(|| dialog_error_context("folder", title))
}

async fn pick_file_with<A>(
    adapter: &A,
    title: &str,
    filters: &[(&str, &[&str])],
) -> Result<Option<PathBuf>>
where
    A: FileDialogAdapter + ?Sized,
{
    adapter
        .pick_file(OpenFileDialogRequest {
            title: title.to_string(),
            filters: normalize_filters(filters),
        })
        .await
        .with_context(|| dialog_error_context("open file", title))
}

async fn pick_save_file_with<A>(
    adapter: &A,
    title: &str,
    filters: &[(&str, &[&str])],
    default_name: &str,
    directory: Option<PathBuf>,
) -> Result<Option<PathBuf>>
where
    A: FileDialogAdapter + ?Sized,
{
    adapter
        .pick_save_file(SaveFileDialogRequest {
            title: title.to_string(),
            filters: normalize_filters(filters),
            default_name: default_name.to_string(),
            directory,
        })
        .await
        .with_context(|| dialog_error_context("save file", title))
}

fn normalize_filters(filters: &[(&str, &[&str])]) -> Vec<FileDialogFilter> {
    filters
        .iter()
        .map(|(name, extensions)| FileDialogFilter {
            name: (*name).to_string(),
            extensions: extensions
                .iter()
                .map(|extension| (*extension).to_string())
                .collect(),
        })
        .collect()
}

fn dialog_error_context(kind: &str, title: &str) -> String {
    format!("failed to show {kind} dialog: {title}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::bail;
    use std::sync::Mutex;

    #[derive(Default)]
    struct RecordingFileDialogAdapter {
        folder_title: Mutex<Option<String>>,
        open_request: Mutex<Option<OpenFileDialogRequest>>,
        save_request: Mutex<Option<SaveFileDialogRequest>>,
        folder_result: Option<PathBuf>,
        open_result: Option<PathBuf>,
        save_result: Option<PathBuf>,
        fail_folder: bool,
    }

    #[async_trait]
    impl FileDialogAdapter for RecordingFileDialogAdapter {
        async fn pick_folder(&self, title: String) -> Result<Option<PathBuf>> {
            *self.folder_title.lock().unwrap() = Some(title);
            if self.fail_folder {
                bail!("native dialog failed");
            }
            Ok(self.folder_result.clone())
        }

        async fn pick_file(&self, request: OpenFileDialogRequest) -> Result<Option<PathBuf>> {
            *self.open_request.lock().unwrap() = Some(request);
            Ok(self.open_result.clone())
        }

        async fn pick_save_file(&self, request: SaveFileDialogRequest) -> Result<Option<PathBuf>> {
            *self.save_request.lock().unwrap() = Some(request);
            Ok(self.save_result.clone())
        }
    }

    #[tokio::test]
    async fn pick_file_with_forwards_filters_to_adapter() {
        let adapter = RecordingFileDialogAdapter {
            open_result: Some(PathBuf::from("workspace/note.md")),
            ..RecordingFileDialogAdapter::default()
        };

        let selected = pick_file_with(
            &adapter,
            "Select file",
            &[("Markdown", &["md", "markdown"]), ("Text", &["txt"])],
        )
        .await
        .expect("file dialog succeeds");

        assert_eq!(selected, Some(PathBuf::from("workspace/note.md")));
        assert_eq!(
            *adapter.open_request.lock().unwrap(),
            Some(OpenFileDialogRequest {
                title: "Select file".to_string(),
                filters: vec![
                    FileDialogFilter {
                        name: "Markdown".to_string(),
                        extensions: vec!["md".to_string(), "markdown".to_string()],
                    },
                    FileDialogFilter {
                        name: "Text".to_string(),
                        extensions: vec!["txt".to_string()],
                    },
                ],
            })
        );
    }

    #[tokio::test]
    async fn pick_save_file_with_forwards_default_name_and_directory() {
        let adapter = RecordingFileDialogAdapter {
            save_result: Some(PathBuf::from("workspace/export.md")),
            ..RecordingFileDialogAdapter::default()
        };

        let selected = pick_save_file_with(
            &adapter,
            "Save as",
            &[("Markdown", &["md"])],
            "draft.md",
            Some(PathBuf::from("workspace")),
        )
        .await
        .expect("save dialog succeeds");

        assert_eq!(selected, Some(PathBuf::from("workspace/export.md")));
        assert_eq!(
            *adapter.save_request.lock().unwrap(),
            Some(SaveFileDialogRequest {
                title: "Save as".to_string(),
                filters: vec![FileDialogFilter {
                    name: "Markdown".to_string(),
                    extensions: vec!["md".to_string()],
                }],
                default_name: "draft.md".to_string(),
                directory: Some(PathBuf::from("workspace")),
            })
        );
    }

    #[tokio::test]
    async fn pick_folder_with_adds_dialog_context_to_errors() {
        let adapter = RecordingFileDialogAdapter {
            fail_folder: true,
            ..RecordingFileDialogAdapter::default()
        };

        let error = pick_folder_with(&adapter, "Select workspace")
            .await
            .expect_err("dialog failure is reported");

        let message = format!("{error:#}");
        assert!(message.contains("failed to show folder dialog: Select workspace"));
        assert!(message.contains("native dialog failed"));
        assert_eq!(
            *adapter.folder_title.lock().unwrap(),
            Some("Select workspace".to_string())
        );
    }
}
