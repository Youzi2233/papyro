use base64::{engine::general_purpose::STANDARD, Engine as _};
use papyro_core::models::{EditorTab, Workspace};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct SavedEditorAsset {
    pub markdown: String,
    pub path: PathBuf,
}

pub(super) async fn save_pasted_image_asset(
    workspace: &Workspace,
    tab: &EditorTab,
    mime_type: &str,
    data: &str,
) -> Result<SavedEditorAsset, String> {
    if !tab.path.starts_with(&workspace.path) {
        return Err("active note is outside the current workspace".to_string());
    }

    let extension = image_extension(mime_type)?;
    let bytes = STANDARD
        .decode(data.trim())
        .map_err(|error| format!("invalid pasted image data: {error}"))?;
    if bytes.is_empty() {
        return Err("pasted image data is empty".to_string());
    }

    let assets_dir = workspace.path.join("assets");
    tokio::fs::create_dir_all(&assets_dir)
        .await
        .map_err(|error| format!("failed to create assets directory: {error}"))?;

    let (mut file, path) = create_unique_asset_file(&assets_dir, extension).await?;
    file.write_all(&bytes)
        .await
        .map_err(|error| format!("failed to write pasted image: {error}"))?;

    let link = markdown_asset_link(workspace, &tab.path, &path);

    Ok(SavedEditorAsset {
        markdown: format!("![image]({link})"),
        path,
    })
}

fn image_extension(mime_type: &str) -> Result<&'static str, String> {
    match mime_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "image/png" => Ok("png"),
        "image/jpeg" | "image/jpg" => Ok("jpg"),
        "image/gif" => Ok("gif"),
        "image/webp" => Ok("webp"),
        other => Err(format!("unsupported pasted image type: {other}")),
    }
}

async fn create_unique_asset_file(
    assets_dir: &Path,
    extension: &str,
) -> Result<(tokio::fs::File, PathBuf), String> {
    let stem = pasted_image_stem();

    for suffix in 0..1000 {
        let filename = if suffix == 0 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{suffix}.{extension}")
        };
        let path = assets_dir.join(filename);

        match tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .await
        {
            Ok(file) => return Ok((file, path)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("failed to create pasted image file: {error}")),
        }
    }

    Err("failed to allocate a unique pasted image name".to_string())
}

fn pasted_image_stem() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("pasted-image-{millis}")
}

fn markdown_asset_link(workspace: &Workspace, note_path: &Path, asset_path: &Path) -> String {
    let asset_relative = asset_path
        .strip_prefix(&workspace.path)
        .unwrap_or(asset_path);
    let note_dir_relative = note_path
        .parent()
        .and_then(|parent| parent.strip_prefix(&workspace.path).ok())
        .unwrap_or_else(|| Path::new(""));

    let mut link = PathBuf::new();
    for _ in note_dir_relative.components() {
        link.push("..");
    }
    link.push(asset_relative);

    markdown_path(&link)
}

fn markdown_path(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::SaveStatus;

    fn workspace(root: &Path) -> Workspace {
        Workspace {
            id: "workspace".to_string(),
            name: "Workspace".to_string(),
            path: root.to_path_buf(),
            created_at: 0,
            last_opened: None,
            sort_order: 0,
        }
    }

    fn tab(root: &Path) -> EditorTab {
        EditorTab {
            id: "tab-a".to_string(),
            note_id: "note-a".to_string(),
            title: "Note".to_string(),
            path: root.join("note.md"),
            is_dirty: false,
            save_status: SaveStatus::Saved,
        }
    }

    #[tokio::test]
    async fn save_pasted_image_asset_writes_workspace_asset() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path();
        let workspace = workspace(root);
        let tab = tab(root);

        let saved = save_pasted_image_asset(&workspace, &tab, "image/png", "YWJj")
            .await
            .expect("saved image");

        assert_eq!(tokio::fs::read(&saved.path).await.unwrap(), b"abc");
        assert!(saved.path.starts_with(root.join("assets")));
        assert!(saved.markdown.starts_with("![image](assets/pasted-image-"));
        assert!(saved.markdown.ends_with(".png)"));
    }

    #[test]
    fn markdown_asset_link_is_relative_to_note_directory() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path();
        let workspace = workspace(root);
        let link = markdown_asset_link(
            &workspace,
            &root.join("notes/daily/note.md"),
            &root.join("assets/pasted-image.png"),
        );

        assert_eq!(link, "../../assets/pasted-image.png");
    }

    #[tokio::test]
    async fn save_pasted_image_asset_rejects_unsupported_types() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path();
        let workspace = workspace(root);
        let tab = tab(root);

        let error = save_pasted_image_asset(&workspace, &tab, "text/plain", "YWJj")
            .await
            .expect_err("unsupported");

        assert!(error.contains("unsupported pasted image type"));
    }
}
