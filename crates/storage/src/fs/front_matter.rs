use yaml_rust::{Yaml, YamlEmitter, YamlLoader};

struct FrontMatterParts<'a> {
    block: &'a str,
    suffix: &'a str,
}

pub fn extract_front_matter_tags(markdown: &str) -> Vec<String> {
    let Some(front_matter) = front_matter_parts(markdown) else {
        return Vec::new();
    };

    let Ok(documents) = YamlLoader::load_from_str(front_matter.block) else {
        return Vec::new();
    };

    let Some(document) = documents.first() else {
        return Vec::new();
    };

    tags_from_yaml(document)
}

pub fn rename_front_matter_tag(markdown: &str, old_id: &str, new_name: &str) -> Option<String> {
    rewrite_front_matter_tags(markdown, |tags| {
        let mut changed = false;
        let old_id = normalize_tag_id(old_id);
        let new_name = normalize_tag_name(new_name)?;
        for tag in tags.iter_mut() {
            if normalize_tag_id(tag) == old_id {
                *tag = new_name.clone();
                changed = true;
            }
        }
        changed.then_some(())
    })
}

pub fn remove_front_matter_tag(markdown: &str, tag_id: &str) -> Option<String> {
    rewrite_front_matter_tags(markdown, |tags| {
        let tag_id = normalize_tag_id(tag_id);
        let before = tags.len();
        tags.retain(|tag| normalize_tag_id(tag) != tag_id);
        (tags.len() != before).then_some(())
    })
}

fn rewrite_front_matter_tags(
    markdown: &str,
    update_tags: impl FnOnce(&mut Vec<String>) -> Option<()>,
) -> Option<String> {
    let front_matter = front_matter_parts(markdown)?;
    let mut document = YamlLoader::load_from_str(front_matter.block)
        .ok()?
        .into_iter()
        .next()?;
    let mut tags = tags_from_yaml(&document);
    update_tags(&mut tags)?;
    dedupe_tags(&mut tags);
    replace_yaml_tags(&mut document, tags)?;
    let emitted = emit_front_matter(&document)?;
    Some(format!("---\n{emitted}\n---\n{}", front_matter.suffix))
}

fn front_matter_parts(markdown: &str) -> Option<FrontMatterParts<'_>> {
    let body = markdown.strip_prefix("---")?;
    let body = body
        .strip_prefix("\r\n")
        .or_else(|| body.strip_prefix('\n'))?;
    let (end, delimiter_len) = body
        .find("\n---\n")
        .map(|end| (end, "\n---\n".len()))
        .or_else(|| body.find("\n---\r\n").map(|end| (end, "\n---\r\n".len())))
        .or_else(|| {
            body.strip_suffix("\n---")
                .map(|stripped| (stripped.len(), "\n---".len()))
        })
        .or_else(|| {
            body.strip_suffix("\r\n---")
                .map(|stripped| (stripped.len(), "\r\n---".len()))
        })?;

    Some(FrontMatterParts {
        block: &body[..end],
        suffix: &body[end + delimiter_len..],
    })
}

fn tags_from_yaml(document: &Yaml) -> Vec<String> {
    let Some(tags) = document["tags"].as_vec() else {
        return document["tags"]
            .as_str()
            .map(parse_inline_tags)
            .unwrap_or_default();
    };

    let mut names = tags
        .iter()
        .filter_map(Yaml::as_str)
        .flat_map(parse_inline_tags)
        .collect::<Vec<_>>();
    dedupe_tags(&mut names);
    names
}

fn parse_inline_tags(value: &str) -> Vec<String> {
    let mut tags = value
        .split([',', ' '])
        .filter_map(normalize_tag_name)
        .collect::<Vec<_>>();
    dedupe_tags(&mut tags);
    tags
}

fn normalize_tag_name(value: &str) -> Option<String> {
    let name = value.trim().trim_start_matches('#').trim();
    (!name.is_empty()).then(|| name.to_string())
}

fn normalize_tag_id(value: &str) -> String {
    value.trim().trim_start_matches('#').trim().to_lowercase()
}

fn dedupe_tags(tags: &mut Vec<String>) {
    let mut seen = std::collections::HashSet::new();
    tags.retain(|tag| seen.insert(tag.to_lowercase()));
}

fn replace_yaml_tags(document: &mut Yaml, tags: Vec<String>) -> Option<()> {
    let Yaml::Hash(hash) = document else {
        return None;
    };
    let key = Yaml::String("tags".to_string());
    if tags.is_empty() {
        hash.remove(&key);
    } else {
        hash.insert(
            key,
            Yaml::Array(tags.into_iter().map(Yaml::String).collect()),
        );
    }
    Some(())
}

fn emit_front_matter(document: &Yaml) -> Option<String> {
    let mut emitted = String::new();
    {
        let mut emitter = YamlEmitter::new(&mut emitted);
        emitter.compact(false);
        emitter.dump(document).ok()?;
    }
    let emitted = emitted.strip_prefix("---\n").unwrap_or(&emitted);
    Some(emitted.trim_end_matches('\n').to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_sequence_tags_from_front_matter() {
        let markdown = "---\ntags:\n  - rust\n  - search\n---\n# Note";

        assert_eq!(
            extract_front_matter_tags(markdown),
            vec!["rust".to_string(), "search".to_string()]
        );
    }

    #[test]
    fn extracts_inline_string_tags() {
        let markdown = "---\ntags: \"#rust, search notes\"\n---\n# Note";

        assert_eq!(
            extract_front_matter_tags(markdown),
            vec![
                "rust".to_string(),
                "search".to_string(),
                "notes".to_string()
            ]
        );
    }

    #[test]
    fn ignores_missing_invalid_and_duplicate_tags() {
        assert!(extract_front_matter_tags("# No front matter").is_empty());
        assert!(extract_front_matter_tags("---\ntags: [\n---\n# Bad").is_empty());

        let markdown = "---\ntags:\n  - Rust\n  - rust\n  - \"\"\n---\n# Note";
        assert_eq!(
            extract_front_matter_tags(markdown),
            vec!["Rust".to_string()]
        );
    }

    #[test]
    fn renames_front_matter_tags() {
        let markdown = "---\ntitle: Draft\ntags: [Rust, search]\n---\n# Note";

        let updated = rename_front_matter_tag(markdown, "rust", "Systems").unwrap();

        assert_eq!(
            extract_front_matter_tags(&updated),
            vec!["Systems".to_string(), "search".to_string()]
        );
        assert!(updated.contains("title: Draft"));
        assert!(updated.ends_with("# Note"));
    }

    #[test]
    fn removes_front_matter_tags() {
        let markdown = "---\ntags:\n  - Rust\n  - search\n---\n# Note";

        let updated = remove_front_matter_tag(markdown, "search").unwrap();

        assert_eq!(
            extract_front_matter_tags(&updated),
            vec!["Rust".to_string()]
        );
        assert!(updated.ends_with("# Note"));
    }
}
