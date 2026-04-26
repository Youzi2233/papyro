use anyhow::Result;
use std::path::{Path, PathBuf};

pub fn read_note(path: &Path) -> Result<String> {
    Ok(std::fs::read_to_string(path)?)
}

pub fn write_note(path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(std::fs::write(path, content)?)
}

pub fn create_note(dir: &Path, name: &str) -> Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let stem = sanitize_filename(name);
    let path = unique_path(dir, &stem, "md");
    let title = path.file_stem().unwrap_or_default().to_string_lossy();
    std::fs::write(&path, format!("# {}\n\n", title))?;
    Ok(path)
}

pub fn delete_note(path: &Path) -> Result<()> {
    Ok(std::fs::remove_file(path)?)
}

pub fn delete_folder(path: &Path) -> Result<()> {
    Ok(std::fs::remove_dir_all(path)?)
}

pub fn rename_note(path: &Path, new_name: &str) -> Result<PathBuf> {
    let parent = path.parent().unwrap_or(Path::new("."));
    let stem = sanitize_filename(new_name);
    let new_path = unique_path(parent, &stem, "md");
    std::fs::rename(path, &new_path)?;
    Ok(new_path)
}

pub fn rename_folder(path: &Path, new_name: &str) -> Result<PathBuf> {
    let parent = path.parent().unwrap_or(Path::new("."));
    let name = sanitize_filename(new_name);
    let new_path = unique_folder_path(parent, &name);
    std::fs::rename(path, &new_path)?;
    Ok(new_path)
}

pub fn move_note(path: &Path, target_dir: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(target_dir)?;
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Untitled");
    let new_path = unique_path(target_dir, stem, "md");
    std::fs::rename(path, &new_path)?;
    Ok(new_path)
}

pub fn move_folder(path: &Path, target_dir: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(target_dir)?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Folder");
    let new_path = unique_folder_path(target_dir, name);
    std::fs::rename(path, &new_path)?;
    Ok(new_path)
}

pub fn create_folder(parent: &Path, name: &str) -> Result<PathBuf> {
    let folder = unique_folder_path(parent, &sanitize_filename(name));
    std::fs::create_dir_all(&folder)?;
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
