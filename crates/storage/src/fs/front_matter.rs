use yaml_rust::{Yaml, YamlLoader};

pub fn extract_front_matter_tags(markdown: &str) -> Vec<String> {
    let Some(front_matter) = front_matter_block(markdown) else {
        return Vec::new();
    };

    let Ok(documents) = YamlLoader::load_from_str(front_matter) else {
        return Vec::new();
    };

    let Some(document) = documents.first() else {
        return Vec::new();
    };

    tags_from_yaml(document)
}

fn front_matter_block(markdown: &str) -> Option<&str> {
    let body = markdown.strip_prefix("---")?;
    let body = body
        .strip_prefix("\r\n")
        .or_else(|| body.strip_prefix('\n'))?;
    let end = body
        .find("\n---\n")
        .or_else(|| body.find("\n---\r\n"))
        .or_else(|| body.strip_suffix("\n---").map(|stripped| stripped.len()))
        .or_else(|| body.strip_suffix("\r\n---").map(|stripped| stripped.len()))?;

    Some(&body[..end])
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

fn dedupe_tags(tags: &mut Vec<String>) {
    let mut seen = std::collections::HashSet::new();
    tags.retain(|tag| seen.insert(tag.to_lowercase()));
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
}
