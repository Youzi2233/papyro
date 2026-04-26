use anyhow::Result;
use papyro_core::{SearchField, SearchHighlight, SearchMatch, SearchResult, Workspace};
use std::path::{Path, PathBuf};

pub fn search_workspace(
    workspace: &Workspace,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchResult>> {
    let tokens = query_tokens(query);
    if tokens.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    for note_path in workspace_markdown_files(&workspace.path) {
        let content = std::fs::read_to_string(&note_path)?;
        let relative_path = note_path
            .strip_prefix(&workspace.path)
            .unwrap_or(&note_path)
            .to_path_buf();
        let title = crate::fs::extract_title(&note_path, &content);
        let path = relative_path.to_string_lossy().replace('\\', "/");
        if !document_matches_all_tokens(&title, &path, &content, &tokens) {
            continue;
        }

        let mut matches = Vec::new();

        collect_field_match(SearchField::Title, None, &title, &tokens, &mut matches);
        collect_field_match(SearchField::Path, None, &path, &tokens, &mut matches);
        collect_body_matches(&content, &tokens, &mut matches);

        if !matches.is_empty() {
            results.push(SearchResult {
                title,
                path: note_path,
                relative_path,
                matches,
            });
        }

        if results.len() >= limit {
            break;
        }
    }

    results.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(results)
}

fn query_tokens(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(|token| token.to_lowercase())
        .filter(|token| !token.is_empty())
        .collect()
}

fn collect_field_match(
    field: SearchField,
    line: Option<usize>,
    value: &str,
    tokens: &[String],
    matches: &mut Vec<SearchMatch>,
) {
    let Some(highlights) = search_highlights(value, tokens) else {
        return;
    };

    matches.push(SearchMatch {
        field,
        line,
        snippet: value.to_string(),
        highlights,
    });
}

fn collect_body_matches(content: &str, tokens: &[String], matches: &mut Vec<SearchMatch>) {
    for (index, line) in content.lines().enumerate() {
        collect_field_match(SearchField::Body, Some(index + 1), line, tokens, matches);
        if matches
            .iter()
            .filter(|result_match| result_match.field == SearchField::Body)
            .count()
            >= 3
        {
            break;
        }
    }
}

fn document_matches_all_tokens(title: &str, path: &str, content: &str, tokens: &[String]) -> bool {
    let haystack = format!("{title} {path} {content}").to_lowercase();
    tokens.iter().all(|token| haystack.contains(token))
}

fn search_highlights(value: &str, tokens: &[String]) -> Option<Vec<SearchHighlight>> {
    let lower_value = value.to_lowercase();
    let mut highlights = Vec::new();

    for token in tokens {
        if let Some(index) = lower_value.find(token) {
            highlights.push(SearchHighlight {
                start: index,
                end: index + token.len(),
            });
        }
    }

    if highlights.is_empty() {
        return None;
    }

    highlights.sort_by_key(|highlight| highlight.start);
    Some(highlights)
}

fn workspace_markdown_files(root: &Path) -> Vec<PathBuf> {
    let mut files = walkdir::WalkDir::new(root)
        .into_iter()
        .filter_entry(|entry| entry.depth() == 0 || !is_hidden(entry.path()))
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file() && is_markdown(entry.path()))
        .map(|entry| entry.path().to_path_buf())
        .collect::<Vec<_>>();
    files.sort();
    files
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with('.'))
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn search_workspace_matches_title_path_and_body() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let root = temp.path();
        std::fs::create_dir_all(root.join("notes"))?;
        std::fs::write(
            root.join("notes").join("release-plan.md"),
            "# Release Plan\n\nShip the search feature safely.\n",
        )?;
        std::fs::write(root.join("notes").join("daily.md"), "# Daily\n\nNo match")?;

        let results = search_workspace(&workspace(root), "release search", 10)?;

        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0].relative_path,
            PathBuf::from("notes/release-plan.md")
        );
        assert!(results[0]
            .matches
            .iter()
            .any(|result_match| result_match.field == SearchField::Title));
        assert!(results[0]
            .matches
            .iter()
            .any(|result_match| result_match.field == SearchField::Path));
        assert!(results[0].matches.iter().any(|result_match| {
            result_match.field == SearchField::Body && result_match.line == Some(3)
        }));

        Ok(())
    }

    #[test]
    fn search_workspace_respects_limit_and_case_insensitive_tokens() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let root = temp.path();
        std::fs::write(root.join("a.md"), "# Alpha\n\nSearch Token")?;
        std::fs::write(root.join("b.md"), "# Beta\n\nsearch token")?;

        let results = search_workspace(&workspace(root), "SEARCH token", 1)?;

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].relative_path, PathBuf::from("a.md"));
        assert_eq!(
            results[0].matches[0].highlights,
            vec![
                SearchHighlight { start: 0, end: 6 },
                SearchHighlight { start: 7, end: 12 },
            ]
        );

        Ok(())
    }
}
