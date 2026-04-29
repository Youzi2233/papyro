use anyhow::{Context, Result};
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn read_note(path: &Path) -> Result<String> {
    std::fs::read_to_string(path).with_context(|| format!("read note {}", path.display()))
}

pub fn write_note(path: &Path, content: &str) -> Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(parent)
        .with_context(|| format!("create parent directory {}", parent.display()))?;

    let mut temp_file = tempfile::Builder::new()
        .prefix(".papyro-save-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .with_context(|| format!("create temporary note file in {}", parent.display()))?;
    temp_file
        .write_all(content.as_bytes())
        .with_context(|| format!("write temporary note file for {}", path.display()))?;
    temp_file
        .as_file_mut()
        .sync_all()
        .with_context(|| format!("sync temporary note file for {}", path.display()))?;
    temp_file
        .persist(path)
        .map_err(|error| error.error)
        .with_context(|| format!("replace note {}", path.display()))?;

    Ok(())
}

pub fn create_note(dir: &Path, name: &str) -> Result<PathBuf> {
    std::fs::create_dir_all(dir)
        .with_context(|| format!("create notes directory {}", dir.display()))?;
    let stem = sanitize_filename(name);
    let path = unique_path(dir, &stem, "md");
    let title = path.file_stem().unwrap_or_default().to_string_lossy();
    std::fs::write(&path, format!("# {}\n\n", title))
        .with_context(|| format!("create note {}", path.display()))?;
    Ok(path)
}

pub fn delete_note(path: &Path) -> Result<()> {
    std::fs::remove_file(path).with_context(|| format!("delete note {}", path.display()))
}

pub fn delete_folder(path: &Path) -> Result<()> {
    std::fs::remove_dir_all(path).with_context(|| format!("delete folder {}", path.display()))
}

pub fn rename_note(path: &Path, new_name: &str) -> Result<PathBuf> {
    let parent = path.parent().unwrap_or(Path::new("."));
    let stem = sanitize_filename(new_name);
    let new_path = unique_path(parent, &stem, "md");
    std::fs::rename(path, &new_path)
        .with_context(|| format!("rename note {} to {}", path.display(), new_path.display()))?;
    Ok(new_path)
}

pub fn rename_folder(path: &Path, new_name: &str) -> Result<PathBuf> {
    let parent = path.parent().unwrap_or(Path::new("."));
    let name = sanitize_filename(new_name);
    let new_path = unique_folder_path(parent, &name);
    std::fs::rename(path, &new_path)
        .with_context(|| format!("rename folder {} to {}", path.display(), new_path.display()))?;
    Ok(new_path)
}

pub fn move_note(path: &Path, target_dir: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(target_dir)
        .with_context(|| format!("create target directory {}", target_dir.display()))?;
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Untitled");
    let new_path = unique_path(target_dir, stem, "md");
    std::fs::rename(path, &new_path)
        .with_context(|| format!("move note {} to {}", path.display(), new_path.display()))?;
    Ok(new_path)
}

pub fn move_folder(path: &Path, target_dir: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(target_dir)
        .with_context(|| format!("create target directory {}", target_dir.display()))?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Folder");
    let new_path = unique_folder_path(target_dir, name);
    std::fs::rename(path, &new_path)
        .with_context(|| format!("move folder {} to {}", path.display(), new_path.display()))?;
    Ok(new_path)
}

pub fn create_folder(parent: &Path, name: &str) -> Result<PathBuf> {
    let folder = unique_folder_path(parent, &sanitize_filename(name));
    std::fs::create_dir_all(&folder)
        .with_context(|| format!("create folder {}", folder.display()))?;
    Ok(folder)
}

/// 从文件内容提取标题（第一个 H1，否则用文件名）
pub fn extract_title(path: &Path, content: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            let title = rest.trim();
            if !title.is_empty() {
                return title.to_string();
            }
        }
        if !trimmed.is_empty() {
            break;
        }
    }
    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

/// 统计字数（按空白分词）
pub fn count_words(content: &str) -> u32 {
    content.split_whitespace().count() as u32
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if r#"\/:*?"<>|"#.contains(c) { '_' } else { c })
        .collect::<String>()
        .trim()
        .to_string()
}

fn unique_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let candidate = dir.join(format!("{}.{}", stem, ext));
    if !candidate.exists() {
        return candidate;
    }
    for i in 1..=999 {
        let p = dir.join(format!("{} ({}).{}", stem, i, ext));
        if !p.exists() {
            return p;
        }
    }
    candidate
}

fn unique_folder_path(parent: &Path, name: &str) -> PathBuf {
    let candidate = parent.join(name);
    if !candidate.exists() {
        return candidate;
    }
    for i in 1..=999 {
        let path = parent.join(format!("{} ({})", name, i));
        if !path.exists() {
            return path;
        }
    }
    candidate
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_note_replaces_existing_file_from_temp_file() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let path = temp.path().join("notes").join("a.md");

        write_note(&path, "old")?;
        write_note(&path, "new")?;

        assert_eq!(std::fs::read_to_string(&path)?, "new");
        let parent_entries = std::fs::read_dir(path.parent().unwrap())?
            .map(|entry| entry.map(|entry| entry.file_name()))
            .collect::<std::io::Result<Vec<_>>>()?;
        assert!(!parent_entries
            .iter()
            .any(|name| name.to_string_lossy().starts_with(".papyro-save-")));

        Ok(())
    }

    #[test]
    fn read_note_reports_path_on_error() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let path = temp.path().join("missing.md");

        let error = read_note(&path).expect_err("missing note should fail");

        let message = error.to_string();
        assert!(message.contains("read note"));
        assert!(message.contains("missing.md"));

        Ok(())
    }

    #[test]
    fn write_note_reports_parent_directory_context() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let blocker = temp.path().join("not-a-directory");
        std::fs::write(&blocker, "blocks child paths")?;

        let error = write_note(&blocker.join("note.md"), "content")
            .expect_err("file parent should block note write");

        let message = error.to_string();
        assert!(message.contains("create parent directory"));
        assert!(message.contains("not-a-directory"));

        Ok(())
    }

    #[test]
    fn rename_note_reports_source_and_target_on_error() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let missing = temp.path().join("missing.md");

        let error = rename_note(&missing, "renamed").expect_err("missing note should fail");

        let message = error.to_string();
        assert!(message.contains("rename note"));
        assert!(message.contains("missing.md"));
        assert!(message.contains("renamed.md"));

        Ok(())
    }
}
