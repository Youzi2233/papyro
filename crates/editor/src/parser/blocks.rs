use serde::{Deserialize, Serialize};

pub const INTERACTIVE_BLOCK_ANALYSIS_MAX_BYTES: usize = 256 * 1024;
pub const INTERACTIVE_BLOCK_ANALYSIS_MAX_BLOCKS: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarkdownBlockHintSet {
    pub revision: u64,
    pub fallback: MarkdownBlockFallback,
    pub blocks: Vec<MarkdownBlock>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MarkdownBlockAnalysisOptions {
    pub max_bytes: usize,
    pub max_blocks: usize,
}

impl MarkdownBlockAnalysisOptions {
    pub const fn interactive() -> Self {
        Self {
            max_bytes: INTERACTIVE_BLOCK_ANALYSIS_MAX_BYTES,
            max_blocks: INTERACTIVE_BLOCK_ANALYSIS_MAX_BLOCKS,
        }
    }
}

impl Default for MarkdownBlockAnalysisOptions {
    fn default() -> Self {
        Self {
            max_bytes: usize::MAX,
            max_blocks: usize::MAX,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MarkdownBlockFallback {
    None,
    SourceOnly { reason: MarkdownBlockFallbackReason },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarkdownBlockFallbackReason {
    DocumentTooLarge,
    TooManyBlocks,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarkdownBlock {
    pub kind: MarkdownBlockKind,
    pub start_byte: usize,
    pub end_byte: usize,
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MarkdownBlockKind {
    Blank,
    Paragraph,
    Heading { level: u8 },
    BlockQuote,
    ListItem { ordered: bool, task: Option<bool> },
    FencedCode { language: Option<String> },
    Table,
    ThematicBreak,
}

#[derive(Debug, Clone, Copy)]
struct LineSpan<'a> {
    text: &'a str,
    start_byte: usize,
    end_byte: usize,
    line_number: usize,
}

pub fn analyze_markdown_blocks(markdown: &str) -> Vec<MarkdownBlock> {
    let lines = line_spans(markdown);
    let mut blocks = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index];
        let trimmed = line.text.trim_start();

        if trimmed.is_empty() {
            blocks.push(block_from_lines(
                MarkdownBlockKind::Blank,
                &lines[index..=index],
            ));
            index += 1;
            continue;
        }

        if let Some((marker, language)) = parse_fence_start(trimmed) {
            let start = index;
            index += 1;
            while index < lines.len() {
                if is_fence_close(lines[index].text.trim_start(), marker) {
                    index += 1;
                    break;
                }
                index += 1;
            }
            blocks.push(block_from_lines(
                MarkdownBlockKind::FencedCode { language },
                &lines[start..index],
            ));
            continue;
        }

        if let Some(level) = parse_heading_level(trimmed) {
            blocks.push(block_from_lines(
                MarkdownBlockKind::Heading { level },
                &lines[index..=index],
            ));
            index += 1;
            continue;
        }

        if is_thematic_break(trimmed) {
            blocks.push(block_from_lines(
                MarkdownBlockKind::ThematicBreak,
                &lines[index..=index],
            ));
            index += 1;
            continue;
        }

        if let Some((ordered, task)) = parse_list_marker(trimmed) {
            blocks.push(block_from_lines(
                MarkdownBlockKind::ListItem { ordered, task },
                &lines[index..=index],
            ));
            index += 1;
            continue;
        }

        if trimmed.starts_with('>') {
            let start = index;
            index += 1;
            while index < lines.len() && lines[index].text.trim_start().starts_with('>') {
                index += 1;
            }
            blocks.push(block_from_lines(
                MarkdownBlockKind::BlockQuote,
                &lines[start..index],
            ));
            continue;
        }

        if is_table_start(&lines, index) {
            let start = index;
            index += 2;
            while index < lines.len() && is_table_row(lines[index].text.trim()) {
                index += 1;
            }
            blocks.push(block_from_lines(
                MarkdownBlockKind::Table,
                &lines[start..index],
            ));
            continue;
        }

        let start = index;
        index += 1;
        while index < lines.len() && is_paragraph_continuation(&lines, index) {
            index += 1;
        }
        blocks.push(block_from_lines(
            MarkdownBlockKind::Paragraph,
            &lines[start..index],
        ));
    }

    blocks
}

pub fn analyze_markdown_block_snapshot(markdown: &str, revision: u64) -> MarkdownBlockHintSet {
    analyze_markdown_block_snapshot_with_options(
        markdown,
        revision,
        MarkdownBlockAnalysisOptions::default(),
    )
}

pub fn analyze_markdown_block_snapshot_with_options(
    markdown: &str,
    revision: u64,
    options: MarkdownBlockAnalysisOptions,
) -> MarkdownBlockHintSet {
    if markdown.len() > options.max_bytes {
        return MarkdownBlockHintSet::source_only(
            revision,
            MarkdownBlockFallbackReason::DocumentTooLarge,
        );
    }

    let blocks = analyze_markdown_blocks(markdown);
    if blocks.len() > options.max_blocks {
        return MarkdownBlockHintSet::source_only(
            revision,
            MarkdownBlockFallbackReason::TooManyBlocks,
        );
    }

    MarkdownBlockHintSet {
        revision,
        fallback: MarkdownBlockFallback::None,
        blocks,
    }
}

impl MarkdownBlockHintSet {
    fn source_only(revision: u64, reason: MarkdownBlockFallbackReason) -> Self {
        Self {
            revision,
            fallback: MarkdownBlockFallback::SourceOnly { reason },
            blocks: Vec::new(),
        }
    }
}

fn line_spans(markdown: &str) -> Vec<LineSpan<'_>> {
    let mut spans = Vec::new();
    let mut start = 0;

    for (index, line) in markdown.split_inclusive('\n').enumerate() {
        let end = start + line.len();
        spans.push(LineSpan {
            text: trim_line_ending(line),
            start_byte: start,
            end_byte: end,
            line_number: index + 1,
        });
        start = end;
    }

    if start < markdown.len() {
        spans.push(LineSpan {
            text: &markdown[start..],
            start_byte: start,
            end_byte: markdown.len(),
            line_number: spans.len() + 1,
        });
    }

    spans
}

fn trim_line_ending(line: &str) -> &str {
    line.trim_end_matches(['\r', '\n'])
}

fn block_from_lines(kind: MarkdownBlockKind, lines: &[LineSpan<'_>]) -> MarkdownBlock {
    let first = lines.first().expect("block has at least one line");
    let last = lines.last().expect("block has at least one line");
    MarkdownBlock {
        kind,
        start_byte: first.start_byte,
        end_byte: last.end_byte,
        start_line: first.line_number,
        end_line: last.line_number,
    }
}

fn parse_fence_start(line: &str) -> Option<(char, Option<String>)> {
    let marker = line.chars().next()?;
    if marker != '`' && marker != '~' {
        return None;
    }
    let marker_count = line.chars().take_while(|ch| *ch == marker).count();
    if marker_count < 3 {
        return None;
    }

    let language = line[marker_count..]
        .split_whitespace()
        .next()
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    Some((marker, language))
}

fn is_fence_close(line: &str, marker: char) -> bool {
    line.chars().take_while(|ch| *ch == marker).count() >= 3
}

fn parse_heading_level(line: &str) -> Option<u8> {
    let level = line.chars().take_while(|ch| *ch == '#').count();
    if !(1..=6).contains(&level) {
        return None;
    }

    line[level..]
        .chars()
        .next()
        .is_some_and(char::is_whitespace)
        .then_some(level as u8)
}

fn is_thematic_break(line: &str) -> bool {
    let compact = line.split_whitespace().collect::<String>();
    if compact.len() < 3 {
        return false;
    }
    compact.chars().all(|ch| ch == '-')
        || compact.chars().all(|ch| ch == '*')
        || compact.chars().all(|ch| ch == '_')
}

fn parse_list_marker(line: &str) -> Option<(bool, Option<bool>)> {
    let unordered = ["- ", "* ", "+ "]
        .iter()
        .find_map(|marker| line.strip_prefix(marker).map(|rest| (false, rest)));
    let ordered = parse_ordered_marker(line).map(|rest| (true, rest));
    let (ordered, rest) = unordered.or(ordered)?;
    Some((ordered, parse_task_marker(rest.trim_start())))
}

fn parse_ordered_marker(line: &str) -> Option<&str> {
    let digit_count = line.chars().take_while(|ch| ch.is_ascii_digit()).count();
    if digit_count == 0 {
        return None;
    }

    let rest = &line[digit_count..];
    let marker = rest.chars().next()?;
    if marker != '.' && marker != ')' {
        return None;
    }

    let rest = &rest[marker.len_utf8()..];
    rest.chars()
        .next()
        .is_some_and(char::is_whitespace)
        .then_some(rest.trim_start())
}

fn parse_task_marker(rest: &str) -> Option<bool> {
    if rest.len() < 3 {
        return None;
    }
    let marker = &rest[..3];
    match marker {
        "[ ]" => Some(false),
        "[x]" | "[X]" => Some(true),
        _ => None,
    }
}

fn is_table_start(lines: &[LineSpan<'_>], index: usize) -> bool {
    let Some(delimiter) = lines.get(index + 1) else {
        return false;
    };
    is_table_row(lines[index].text.trim()) && is_table_delimiter(delimiter.text.trim())
}

fn is_table_row(line: &str) -> bool {
    line.contains('|') && !line.trim_matches('|').trim().is_empty()
}

fn is_table_delimiter(line: &str) -> bool {
    if !line.contains('|') {
        return false;
    }
    line.split('|').all(|cell| {
        let cell = cell.trim();
        cell.is_empty()
            || (cell.chars().filter(|ch| *ch == '-').count() >= 3
                && cell
                    .chars()
                    .all(|ch| ch == '-' || ch == ':' || ch.is_whitespace()))
    })
}

fn is_paragraph_continuation(lines: &[LineSpan<'_>], index: usize) -> bool {
    let line = lines[index].text.trim_start();
    !line.is_empty()
        && parse_fence_start(line).is_none()
        && parse_heading_level(line).is_none()
        && !is_thematic_break(line)
        && parse_list_marker(line).is_none()
        && !line.starts_with('>')
        && !is_table_start(lines, index)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn analyze_markdown_blocks_detects_common_boundaries() {
        let blocks = analyze_markdown_blocks(
            "# Title\n\nA paragraph\n- [x] task\n> quote\n\n```rs\n# not heading\n```\n| A | B |\n|---|---|\n| 1 | 2 |\n",
        );

        assert_eq!(
            blocks.iter().map(|block| &block.kind).collect::<Vec<_>>(),
            vec![
                &MarkdownBlockKind::Heading { level: 1 },
                &MarkdownBlockKind::Blank,
                &MarkdownBlockKind::Paragraph,
                &MarkdownBlockKind::ListItem {
                    ordered: false,
                    task: Some(true),
                },
                &MarkdownBlockKind::BlockQuote,
                &MarkdownBlockKind::Blank,
                &MarkdownBlockKind::FencedCode {
                    language: Some("rs".to_string()),
                },
                &MarkdownBlockKind::Table,
            ]
        );
    }

    #[test]
    fn fenced_code_consumes_markdown_markers_until_close() {
        let blocks = analyze_markdown_blocks("```md\n# Not heading\n- not list\n```\n# Real\n");

        assert_eq!(blocks.len(), 2);
        assert_eq!(
            blocks[0].kind,
            MarkdownBlockKind::FencedCode {
                language: Some("md".to_string()),
            }
        );
        assert_eq!(blocks[0].start_line, 1);
        assert_eq!(blocks[0].end_line, 4);
        assert_eq!(blocks[1].kind, MarkdownBlockKind::Heading { level: 1 });
    }

    #[test]
    fn blocks_report_byte_and_line_ranges() {
        let markdown = "# Title\n\nbody";
        let blocks = analyze_markdown_blocks(markdown);

        assert_eq!(blocks[0].start_byte, 0);
        assert_eq!(blocks[0].end_byte, "# Title\n".len());
        assert_eq!(blocks[0].start_line, 1);
        assert_eq!(blocks[0].end_line, 1);
        assert_eq!(blocks[2].start_byte, "# Title\n\n".len());
        assert_eq!(blocks[2].end_byte, markdown.len());
        assert_eq!(blocks[2].start_line, 3);
        assert_eq!(blocks[2].end_line, 3);
    }

    #[test]
    fn snapshot_preserves_revision_and_blocks() {
        let snapshot = analyze_markdown_block_snapshot("# Title\n\nbody", 42);

        assert_eq!(snapshot.revision, 42);
        assert_eq!(snapshot.fallback, MarkdownBlockFallback::None);
        assert_eq!(snapshot.blocks.len(), 3);
        assert_eq!(
            snapshot.blocks[0].kind,
            MarkdownBlockKind::Heading { level: 1 }
        );
    }

    #[test]
    fn snapshot_falls_back_before_parsing_oversized_documents() {
        let snapshot = analyze_markdown_block_snapshot_with_options(
            "# Title",
            7,
            MarkdownBlockAnalysisOptions {
                max_bytes: 1,
                max_blocks: usize::MAX,
            },
        );

        assert_eq!(snapshot.revision, 7);
        assert_eq!(
            snapshot.fallback,
            MarkdownBlockFallback::SourceOnly {
                reason: MarkdownBlockFallbackReason::DocumentTooLarge,
            }
        );
        assert!(snapshot.blocks.is_empty());
    }

    #[test]
    fn snapshot_falls_back_when_block_budget_is_exceeded() {
        let snapshot = analyze_markdown_block_snapshot_with_options(
            "# One\n\n# Two",
            8,
            MarkdownBlockAnalysisOptions {
                max_bytes: usize::MAX,
                max_blocks: 2,
            },
        );

        assert_eq!(snapshot.revision, 8);
        assert_eq!(
            snapshot.fallback,
            MarkdownBlockFallback::SourceOnly {
                reason: MarkdownBlockFallbackReason::TooManyBlocks,
            }
        );
        assert!(snapshot.blocks.is_empty());
    }

    #[test]
    fn snapshot_serializes_block_hints_for_js() {
        let value = serde_json::to_value(MarkdownBlockHintSet {
            revision: 5,
            fallback: MarkdownBlockFallback::None,
            blocks: vec![MarkdownBlock {
                kind: MarkdownBlockKind::Heading { level: 2 },
                start_byte: 0,
                end_byte: 9,
                start_line: 1,
                end_line: 1,
            }],
        })
        .unwrap();

        assert_eq!(
            value,
            json!({
                "revision": 5,
                "fallback": { "type": "none" },
                "blocks": [{
                    "kind": { "type": "heading", "level": 2 },
                    "start_byte": 0,
                    "end_byte": 9,
                    "start_line": 1,
                    "end_line": 1
                }]
            })
        );
    }

    #[test]
    fn empty_markdown_has_no_blocks() {
        assert!(analyze_markdown_blocks("").is_empty());
    }
}
