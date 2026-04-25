#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutlineItem {
    pub level: u8,
    pub title: String,
    pub line_number: usize,
}

pub fn extract_outline(markdown: &str) -> Vec<OutlineItem> {
    let mut items = Vec::new();
    let mut in_fence = false;
    let mut fence_marker: Option<char> = None;

    for (index, line) in markdown.lines().enumerate() {
        let trimmed = line.trim_start();

        if let Some(marker) = fence_marker {
            if is_fence_line(trimmed, marker) {
                in_fence = false;
                fence_marker = None;
            }
            continue;
        }

        if is_fence_line(trimmed, '`') {
            in_fence = true;
            fence_marker = Some('`');
            continue;
        }
        if is_fence_line(trimmed, '~') {
            in_fence = true;
            fence_marker = Some('~');
            continue;
        }

        if in_fence {
            continue;
        }

        if let Some((level, title)) = parse_atx_heading(trimmed) {
            items.push(OutlineItem {
                level,
                title,
                line_number: index + 1,
            });
        }
    }

    items
}

fn parse_atx_heading(line: &str) -> Option<(u8, String)> {
    let level = line.chars().take_while(|ch| *ch == '#').count();
    if !(1..=6).contains(&level) {
        return None;
    }

    let rest = &line[level..];
    if !rest.chars().next().is_some_and(char::is_whitespace) {
        return None;
    }

    let title = rest.trim().trim_end_matches('#').trim().to_string();
    if title.is_empty() {
        return None;
    }

    Some((level as u8, title))
}

fn is_fence_line(line: &str, marker: char) -> bool {
    line.chars().take_while(|ch| *ch == marker).count() >= 3
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_outline_collects_atx_headings() {
        assert_eq!(
            extract_outline("# Title\n\n## Part\n### Detail ###"),
            vec![
                OutlineItem {
                    level: 1,
                    title: "Title".to_string(),
                    line_number: 1,
                },
                OutlineItem {
                    level: 2,
                    title: "Part".to_string(),
                    line_number: 3,
                },
                OutlineItem {
                    level: 3,
                    title: "Detail".to_string(),
                    line_number: 4,
                },
            ]
        );
    }

    #[test]
    fn extract_outline_ignores_fenced_code() {
        assert_eq!(
            extract_outline("# Real\n```md\n# Not heading\n```\n## Next"),
            vec![
                OutlineItem {
                    level: 1,
                    title: "Real".to_string(),
                    line_number: 1,
                },
                OutlineItem {
                    level: 2,
                    title: "Next".to_string(),
                    line_number: 5,
                },
            ]
        );
    }

    #[test]
    fn extract_outline_rejects_invalid_or_empty_headings() {
        assert_eq!(extract_outline("#\n#NoSpace\n####### Too deep"), Vec::new());
    }
}
