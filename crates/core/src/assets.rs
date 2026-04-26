use crate::models::Workspace;
use std::path::{Component, Path, PathBuf};

pub const WORKSPACE_ASSETS_DIR_NAME: &str = "assets";

pub fn workspace_assets_dir(workspace: &Workspace) -> PathBuf {
    workspace.path.join(WORKSPACE_ASSETS_DIR_NAME)
}

pub fn rewrite_moved_note_image_links(
    markdown: &str,
    workspace_root: &Path,
    old_note_path: &Path,
    new_note_path: &Path,
    moved_root: Option<(&Path, &Path)>,
) -> String {
    let mut output = String::with_capacity(markdown.len());
    let mut cursor = 0;

    while let Some(relative_start) = markdown[cursor..].find("![") {
        let start = cursor + relative_start;
        output.push_str(&markdown[cursor..start]);

        match rewrite_next_image_link(
            &markdown[start..],
            workspace_root,
            old_note_path,
            new_note_path,
            moved_root,
        ) {
            Some((replacement, consumed)) => {
                output.push_str(&replacement);
                cursor = start + consumed;
            }
            None => {
                output.push_str("![");
                cursor = start + 2;
            }
        }
    }

    output.push_str(&markdown[cursor..]);
    output
}

fn rewrite_next_image_link(
    markdown: &str,
    workspace_root: &Path,
    old_note_path: &Path,
    new_note_path: &Path,
    moved_root: Option<(&Path, &Path)>,
) -> Option<(String, usize)> {
    let after_marker = markdown.strip_prefix("![")?;
    let alt_end = after_marker.find("](")?;
    let alt = &after_marker[..alt_end];
    if alt.contains('\n') {
        return None;
    }

    let target_start = 2 + alt_end + 2;
    let after_target = &markdown[target_start..];
    let target_end = after_target.find(')')?;
    let body = &after_target[..target_end];
    if body.contains('\n') {
        return None;
    }

    let (target, suffix) = split_link_target(body);
    let rewritten_target = rewrite_relative_target(
        target,
        workspace_root,
        old_note_path,
        new_note_path,
        moved_root,
    )?;
    let consumed = target_start + target_end + 1;

    Some((format!("![{alt}]({rewritten_target}{suffix})"), consumed))
}

fn split_link_target(body: &str) -> (&str, &str) {
    let target_end = body
        .char_indices()
        .find(|(_, character)| character.is_whitespace())
        .map(|(index, _)| index)
        .unwrap_or(body.len());

    (&body[..target_end], &body[target_end..])
}

fn rewrite_relative_target(
    target: &str,
    workspace_root: &Path,
    old_note_path: &Path,
    new_note_path: &Path,
    moved_root: Option<(&Path, &Path)>,
) -> Option<String> {
    if !is_rewritable_relative_target(target) {
        return None;
    }

    let (path_part, target_suffix) = split_target_path_suffix(target);
    if path_part.is_empty() {
        return None;
    }

    let old_note_dir = old_note_path.parent().unwrap_or_else(|| Path::new(""));
    let new_note_dir = new_note_path.parent().unwrap_or_else(|| Path::new(""));
    let old_target = normalize_lexical(&old_note_dir.join(path_part));
    let workspace_root = normalize_lexical(workspace_root);
    if !old_target.starts_with(&workspace_root) {
        return None;
    }

    let new_target = moved_root
        .and_then(|(old_root, new_root)| {
            let old_root = normalize_lexical(old_root);
            let new_root = normalize_lexical(new_root);

            old_target
                .strip_prefix(old_root)
                .ok()
                .map(|suffix| normalize_lexical(&new_root.join(suffix)))
        })
        .unwrap_or(old_target);

    if !new_target.starts_with(&workspace_root) {
        return None;
    }

    let relative = relative_path(new_note_dir, &new_target);
    Some(format!("{}{}", markdown_path(&relative), target_suffix))
}

fn split_target_path_suffix(target: &str) -> (&str, &str) {
    let suffix_start = target
        .char_indices()
        .find(|(_, character)| matches!(character, '?' | '#'))
        .map(|(index, _)| index)
        .unwrap_or(target.len());

    (&target[..suffix_start], &target[suffix_start..])
}

fn is_rewritable_relative_target(target: &str) -> bool {
    if target.is_empty() || target.starts_with('/') || target.starts_with('#') {
        return false;
    }

    let first_segment_end = target
        .char_indices()
        .find(|(_, character)| matches!(character, '/' | '\\' | '?' | '#'))
        .map(|(index, _)| index)
        .unwrap_or(target.len());

    !target[..first_segment_end].contains(':')
}

fn normalize_lexical(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    normalized.push("..");
                }
            }
            _ => normalized.push(component.as_os_str()),
        }
    }

    normalized
}

fn relative_path(from_dir: &Path, to_path: &Path) -> PathBuf {
    let from_dir = normalize_lexical(from_dir);
    let to_path = normalize_lexical(to_path);
    let from_components = from_dir.components().collect::<Vec<_>>();
    let to_components = to_path.components().collect::<Vec<_>>();
    let common_len = from_components
        .iter()
        .zip(to_components.iter())
        .take_while(|(left, right)| left == right)
        .count();

    let mut relative = PathBuf::new();
    for component in &from_components[common_len..] {
        if matches!(component, Component::Normal(_)) {
            relative.push("..");
        }
    }
    for component in &to_components[common_len..] {
        relative.push(component.as_os_str());
    }

    relative
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

    #[test]
    fn workspace_assets_dir_uses_workspace_root() {
        let workspace = Workspace {
            id: "workspace".to_string(),
            name: "Workspace".to_string(),
            path: PathBuf::from("workspace"),
            created_at: 0,
            last_opened: None,
            sort_order: 0,
        };

        assert_eq!(
            workspace_assets_dir(&workspace),
            PathBuf::from("workspace/assets")
        );
    }

    #[test]
    fn rewrites_workspace_asset_link_when_note_moves() {
        let markdown = "Logo: ![logo](../../assets/logo.png)";

        let rewritten = rewrite_moved_note_image_links(
            markdown,
            Path::new("workspace"),
            Path::new("workspace/notes/daily/note.md"),
            Path::new("workspace/archive/note.md"),
            None,
        );

        assert_eq!(rewritten, "Logo: ![logo](../assets/logo.png)");
    }

    #[test]
    fn rewrites_links_to_assets_moved_with_folder() {
        let markdown = "![local](images/photo.png)";

        let rewritten = rewrite_moved_note_image_links(
            markdown,
            Path::new("workspace"),
            Path::new("workspace/notes/day/note.md"),
            Path::new("workspace/archive/day/note.md"),
            Some((Path::new("workspace/notes"), Path::new("workspace/archive"))),
        );

        assert_eq!(rewritten, "![local](images/photo.png)");
    }

    #[test]
    fn preserves_external_and_root_image_links() {
        let markdown =
            "![remote](https://example.test/a.png) ![root](/assets/a.png) ![data](data:image/png;base64,abc)";

        let rewritten = rewrite_moved_note_image_links(
            markdown,
            Path::new("workspace"),
            Path::new("workspace/notes/note.md"),
            Path::new("workspace/archive/note.md"),
            None,
        );

        assert_eq!(rewritten, markdown);
    }

    #[test]
    fn preserves_title_query_and_fragment_when_rewriting() {
        let markdown = "![logo](../assets/logo.png?size=large#preview \"Logo\")";

        let rewritten = rewrite_moved_note_image_links(
            markdown,
            Path::new("workspace"),
            Path::new("workspace/notes/note.md"),
            Path::new("workspace/archive/2026/note.md"),
            None,
        );

        assert_eq!(
            rewritten,
            "![logo](../../assets/logo.png?size=large#preview \"Logo\")"
        );
    }
}
