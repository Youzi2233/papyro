use super::DocumentStats;

/// Cheap O(n) stats — no AST build. Heading count is approximated by counting
/// lines that start with `#` after optional whitespace, ignoring fenced code
/// blocks (``` / ~~~). Good enough for the status pill and re-runs on every
/// keystroke without noticeable lag.
pub fn summarize_markdown(markdown: &str) -> DocumentStats {
    let mut line_count = 0usize;
    let mut word_count = 0usize;
    let mut heading_count = 0usize;
    let mut in_fence = false;
    let mut fence_marker: Option<char> = None;

    for line in markdown.lines() {
        line_count += 1;
        word_count += line.split_whitespace().count();

        let trimmed = line.trim_start();

        if let Some(marker) = fence_marker {
            if trimmed.starts_with(marker)
                && trimmed.chars().take_while(|c| *c == marker).count() >= 3
            {
                in_fence = false;
                fence_marker = None;
            }
            continue;
        }

        if trimmed.starts_with("```") {
            in_fence = true;
            fence_marker = Some('`');
            continue;
        }
        if trimmed.starts_with("~~~") {
            in_fence = true;
            fence_marker = Some('~');
            continue;
        }

        if !in_fence && trimmed.starts_with('#') {
            let hashes = trimmed.chars().take_while(|c| *c == '#').count();
            if (1..=6).contains(&hashes) {
                let rest = &trimmed[hashes..];
                if rest.starts_with(' ') || rest.is_empty() {
                    heading_count += 1;
                }
            }
        }
    }

    // lines() swallows a trailing newline — compensate so "a\n" reports 1 line, not 0
    if markdown.is_empty() {
        line_count = 0;
    }

    DocumentStats {
        line_count,
        word_count,
        char_count: markdown.chars().count(),
        heading_count,
    }
}
