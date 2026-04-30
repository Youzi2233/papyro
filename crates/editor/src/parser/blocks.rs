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
    pub ranges: MarkdownBlockRanges,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarkdownBlockRanges {
    pub source: MarkdownBlockRange,
    pub content: Option<MarkdownBlockRange>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub markers: Vec<MarkdownBlockRange>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarkdownBlockRange {
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
    Mermaid { language: Option<String> },
    Math,
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

        if let Some(math_fence) = parse_math_fence(trimmed) {
            let start = index;
            index += 1;
            if math_fence == MathFence::Block {
                while index < lines.len() {
                    if matches!(
                        parse_math_fence(lines[index].text.trim_start()),
                        Some(MathFence::Block)
                    ) {
                        index += 1;
                        break;
                    }
                    index += 1;
                }
            }
            blocks.push(block_from_lines(
                MarkdownBlockKind::Math,
                &lines[start..index],
            ));
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
            let kind = if language.as_deref() == Some("mermaid") {
                MarkdownBlockKind::Mermaid { language }
            } else {
                MarkdownBlockKind::FencedCode { language }
            };
            blocks.push(block_from_lines(kind, &lines[start..index]));
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
    let source = MarkdownBlockRange::from_lines(lines);
    let ranges = MarkdownBlockRanges {
        source,
        content: content_range_for_block(&kind, lines),
        markers: marker_ranges_for_block(&kind, lines),
    };
    MarkdownBlock {
        kind,
        start_byte: source.start_byte,
        end_byte: source.end_byte,
        start_line: source.start_line,
        end_line: source.end_line,
        ranges,
    }
}

impl MarkdownBlockRange {
    fn from_lines(lines: &[LineSpan<'_>]) -> Self {
        let first = lines.first().expect("block has at least one line");
        let last = lines.last().expect("block has at least one line");
        Self {
            start_byte: first.start_byte,
            end_byte: last.end_byte,
            start_line: first.line_number,
            end_line: last.line_number,
        }
    }

    fn text_from_lines(lines: &[LineSpan<'_>]) -> Self {
        let first = lines.first().expect("block has at least one line");
        let last = lines.last().expect("block has at least one line");
        Self {
            start_byte: first.start_byte,
            end_byte: last.text_end_byte(),
            start_line: first.line_number,
            end_line: last.line_number,
        }
    }

    fn on_line(line: LineSpan<'_>, start_offset: usize, end_offset: usize) -> Self {
        Self {
            start_byte: line.start_byte + start_offset,
            end_byte: line.start_byte + end_offset,
            start_line: line.line_number,
            end_line: line.line_number,
        }
    }

    fn byte_span(
        start: LineSpan<'_>,
        start_byte: usize,
        end: LineSpan<'_>,
        end_byte: usize,
    ) -> Self {
        Self {
            start_byte,
            end_byte,
            start_line: start.line_number,
            end_line: end.line_number,
        }
    }
}

impl LineSpan<'_> {
    fn text_end_byte(self) -> usize {
        self.start_byte + self.text.len()
    }
}

fn content_range_for_block(
    kind: &MarkdownBlockKind,
    lines: &[LineSpan<'_>],
) -> Option<MarkdownBlockRange> {
    match kind {
        MarkdownBlockKind::Blank | MarkdownBlockKind::ThematicBreak => None,
        MarkdownBlockKind::Heading { .. } => {
            let line = *lines.first()?;
            let marker_end = parse_heading_marker_end(line.text)?;
            Some(MarkdownBlockRange::on_line(
                line,
                marker_end,
                line.text.len(),
            ))
        }
        MarkdownBlockKind::ListItem { .. } => {
            let line = *lines.first()?;
            let marker = parse_list_marker_detail(line.text)?;
            Some(MarkdownBlockRange::on_line(
                line,
                marker.marker_end,
                line.text.len(),
            ))
        }
        MarkdownBlockKind::BlockQuote => blockquote_content_range(lines),
        MarkdownBlockKind::FencedCode { .. } | MarkdownBlockKind::Mermaid { .. } => {
            fenced_content_range(lines)
        }
        MarkdownBlockKind::Math => math_content_range(lines),
        MarkdownBlockKind::Paragraph | MarkdownBlockKind::Table => {
            Some(MarkdownBlockRange::text_from_lines(lines))
        }
    }
}

fn marker_ranges_for_block(
    kind: &MarkdownBlockKind,
    lines: &[LineSpan<'_>],
) -> Vec<MarkdownBlockRange> {
    match kind {
        MarkdownBlockKind::Heading { .. } => lines
            .first()
            .and_then(|line| {
                parse_heading_marker_end(line.text)
                    .map(|marker_end| MarkdownBlockRange::on_line(*line, 0, marker_end))
            })
            .into_iter()
            .collect(),
        MarkdownBlockKind::ListItem { .. } => lines
            .first()
            .and_then(|line| {
                parse_list_marker_detail(line.text)
                    .map(|marker| MarkdownBlockRange::on_line(*line, 0, marker.marker_end))
            })
            .into_iter()
            .collect(),
        MarkdownBlockKind::BlockQuote => lines
            .iter()
            .filter_map(|line| {
                parse_blockquote_marker_end(line.text)
                    .map(|marker_end| MarkdownBlockRange::on_line(*line, 0, marker_end))
            })
            .collect(),
        MarkdownBlockKind::FencedCode { .. } | MarkdownBlockKind::Mermaid { .. } => {
            fenced_marker_ranges(lines)
        }
        MarkdownBlockKind::Math => math_marker_ranges(lines),
        MarkdownBlockKind::Table => table_marker_ranges(lines),
        MarkdownBlockKind::ThematicBreak => lines
            .first()
            .map(|line| MarkdownBlockRange::on_line(*line, 0, line.text.len()))
            .into_iter()
            .collect(),
        MarkdownBlockKind::Blank | MarkdownBlockKind::Paragraph => Vec::new(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ListMarkerDetail {
    ordered: bool,
    task: Option<bool>,
    marker_end: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MathFence {
    Block,
    SingleLine,
}

fn parse_heading_marker_end(line: &str) -> Option<usize> {
    let indent_len = leading_whitespace_len(line);
    let trimmed = &line[indent_len..];
    let level = trimmed.chars().take_while(|ch| *ch == '#').count();
    if !(1..=6).contains(&level) {
        return None;
    }

    let whitespace_len = leading_whitespace_len(&trimmed[level..]);
    (whitespace_len > 0).then_some(indent_len + level + whitespace_len)
}

fn parse_list_marker_detail(line: &str) -> Option<ListMarkerDetail> {
    let indent_len = leading_whitespace_len(line);
    let trimmed = &line[indent_len..];
    let (ordered, marker_len) = parse_unordered_marker_len(trimmed)
        .map(|len| (false, len))
        .or_else(|| parse_ordered_marker_len(trimmed).map(|len| (true, len)))?;

    let rest = &trimmed[marker_len..];
    let rest_indent = leading_whitespace_len(rest);
    let task_start = indent_len + marker_len + rest_indent;
    let task_text = &line[task_start..];
    let (task, task_len) = parse_task_marker_with_trailing_space(task_text)
        .map(|(checked, len)| (Some(checked), len))
        .unwrap_or((None, 0));

    Some(ListMarkerDetail {
        ordered,
        task,
        marker_end: task_start + task_len,
    })
}

fn parse_unordered_marker_len(line: &str) -> Option<usize> {
    ["- ", "* ", "+ "]
        .iter()
        .find_map(|marker| line.starts_with(marker).then_some(marker.len()))
}

fn parse_ordered_marker_len(line: &str) -> Option<usize> {
    let digit_count = line.chars().take_while(|ch| ch.is_ascii_digit()).count();
    if digit_count == 0 {
        return None;
    }

    let marker = line[digit_count..].chars().next()?;
    if marker != '.' && marker != ')' {
        return None;
    }

    let after_marker = digit_count + marker.len_utf8();
    let whitespace_len = leading_whitespace_len(&line[after_marker..]);
    (whitespace_len > 0).then_some(after_marker + whitespace_len)
}

fn parse_task_marker_with_trailing_space(line: &str) -> Option<(bool, usize)> {
    let checked = match line.get(..3)? {
        "[ ]" => false,
        "[x]" | "[X]" => true,
        _ => return None,
    };
    let whitespace_len = leading_whitespace_len(&line[3..]);
    Some((checked, 3 + whitespace_len))
}

fn parse_blockquote_marker_end(line: &str) -> Option<usize> {
    let indent_len = leading_whitespace_len(line);
    let trimmed = &line[indent_len..];
    let after_marker = trimmed.strip_prefix('>')?;
    let marker_ws = after_marker
        .chars()
        .next()
        .filter(|character| character.is_ascii_whitespace())
        .map(char::len_utf8)
        .unwrap_or_default();
    Some(indent_len + 1 + marker_ws)
}

fn blockquote_content_range(lines: &[LineSpan<'_>]) -> Option<MarkdownBlockRange> {
    let first = *lines.first()?;
    let last = *lines.last()?;
    let marker_end = parse_blockquote_marker_end(first.text)?;
    Some(MarkdownBlockRange::byte_span(
        first,
        first.start_byte + marker_end,
        last,
        last.text_end_byte(),
    ))
}

fn fenced_marker_ranges(lines: &[LineSpan<'_>]) -> Vec<MarkdownBlockRange> {
    let Some(first) = lines.first().copied() else {
        return Vec::new();
    };
    let Some((marker, _language)) = parse_fence_start(first.text.trim_start()) else {
        return Vec::new();
    };

    let mut markers = vec![MarkdownBlockRange::on_line(first, 0, first.text.len())];
    if let Some(last) = lines
        .last()
        .copied()
        .filter(|line| line.line_number != first.line_number)
    {
        if is_fence_close(last.text.trim_start(), marker) {
            markers.push(MarkdownBlockRange::on_line(last, 0, last.text.len()));
        }
    }
    markers
}

fn fenced_content_range(lines: &[LineSpan<'_>]) -> Option<MarkdownBlockRange> {
    let first = *lines.first()?;
    let start = lines.get(1).copied()?;
    let closing = lines.last().copied().filter(|line| {
        line.line_number != first.line_number
            && parse_fence_start(first.text.trim_start())
                .is_some_and(|(marker, _)| is_fence_close(line.text.trim_start(), marker))
    });
    let end = if closing.is_some() && lines.len() >= 3 {
        lines[lines.len() - 2]
    } else if closing.is_none() {
        *lines.last()?
    } else {
        start
    };
    let end_byte = closing
        .map(|line| line.start_byte)
        .unwrap_or_else(|| end.text_end_byte());
    Some(MarkdownBlockRange::byte_span(
        start,
        start.start_byte,
        end,
        end_byte,
    ))
}

fn parse_math_fence(line: &str) -> Option<MathFence> {
    if line.trim() == "$$" {
        return Some(MathFence::Block);
    }

    let trimmed = line.trim();
    (trimmed.starts_with("$$") && trimmed.ends_with("$$") && trimmed.len() > 4)
        .then_some(MathFence::SingleLine)
}

fn math_marker_ranges(lines: &[LineSpan<'_>]) -> Vec<MarkdownBlockRange> {
    let Some(first) = lines.first().copied() else {
        return Vec::new();
    };
    if matches!(parse_math_fence(first.text), Some(MathFence::SingleLine)) {
        let indent_len = leading_whitespace_len(first.text);
        let end_marker_start = first.text.len().saturating_sub(2);
        return vec![
            MarkdownBlockRange::on_line(first, indent_len, indent_len + 2),
            MarkdownBlockRange::on_line(first, end_marker_start, first.text.len()),
        ];
    }

    let mut markers = vec![MarkdownBlockRange::on_line(
        first,
        leading_whitespace_len(first.text),
        first.text.len(),
    )];
    if let Some(last) = lines
        .last()
        .copied()
        .filter(|line| line.line_number != first.line_number)
        .filter(|line| matches!(parse_math_fence(line.text), Some(MathFence::Block)))
    {
        markers.push(MarkdownBlockRange::on_line(
            last,
            leading_whitespace_len(last.text),
            last.text.len(),
        ));
    }
    markers
}

fn math_content_range(lines: &[LineSpan<'_>]) -> Option<MarkdownBlockRange> {
    let first = *lines.first()?;
    if matches!(parse_math_fence(first.text), Some(MathFence::SingleLine)) {
        let start = first.start_byte + leading_whitespace_len(first.text) + 2;
        let end = first.text_end_byte().saturating_sub(2);
        return Some(MarkdownBlockRange::byte_span(first, start, first, end));
    }

    let start = lines.get(1).copied()?;
    let closing = lines
        .last()
        .copied()
        .filter(|line| line.line_number != first.line_number)
        .filter(|line| matches!(parse_math_fence(line.text), Some(MathFence::Block)));
    let end = if closing.is_some() && lines.len() >= 3 {
        lines[lines.len() - 2]
    } else if closing.is_none() {
        *lines.last()?
    } else {
        start
    };
    let end_byte = closing
        .map(|line| line.start_byte)
        .unwrap_or_else(|| end.text_end_byte());
    Some(MarkdownBlockRange::byte_span(
        start,
        start.start_byte,
        end,
        end_byte,
    ))
}

fn table_marker_ranges(lines: &[LineSpan<'_>]) -> Vec<MarkdownBlockRange> {
    lines
        .get(1)
        .map(|line| MarkdownBlockRange::on_line(*line, 0, line.text.len()))
        .into_iter()
        .collect()
}

fn leading_whitespace_len(line: &str) -> usize {
    line.len() - line.trim_start().len()
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
    let level = line
        .trim_start()
        .chars()
        .take_while(|ch| *ch == '#')
        .count();
    if !(1..=6).contains(&level) {
        return None;
    }

    parse_heading_marker_end(line).map(|_| level as u8)
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
    parse_list_marker_detail(line).map(|marker| (marker.ordered, marker.task))
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
    fn blocks_report_heading_list_quote_and_code_edit_ranges() {
        let markdown = [
            "## Heading",
            "- [x] task",
            "> quote",
            "```rust",
            "let x = 1;",
            "```",
        ]
        .join("\n");
        let blocks = analyze_markdown_blocks(&markdown);

        assert_eq!(blocks[0].ranges.markers, vec![range(0, 3, 1, 1)]);
        assert_eq!(blocks[0].ranges.content, Some(range(3, 10, 1, 1)));

        let task_start = markdown.find("- [x] task").unwrap();
        assert_eq!(
            blocks[1].ranges.markers,
            vec![range(task_start, task_start + "- [x] ".len(), 2, 2)]
        );
        assert_eq!(
            blocks[1].ranges.content,
            Some(range(
                task_start + "- [x] ".len(),
                task_start + "- [x] task".len(),
                2,
                2
            ))
        );

        let quote_start = markdown.find("> quote").unwrap();
        assert_eq!(
            blocks[2].ranges.markers,
            vec![range(quote_start, quote_start + 2, 3, 3)]
        );
        assert_eq!(
            blocks[2].ranges.content,
            Some(range(quote_start + 2, quote_start + "> quote".len(), 3, 3))
        );

        let fence_start = markdown.find("```rust").unwrap();
        let code_start = markdown.find("let x = 1;").unwrap();
        let closing_start = markdown.rfind("```").unwrap();
        assert_eq!(
            blocks[3].ranges.markers,
            vec![
                range(fence_start, fence_start + "```rust".len(), 4, 4),
                range(closing_start, closing_start + "```".len(), 6, 6),
            ]
        );
        assert_eq!(
            blocks[3].ranges.content,
            Some(range(code_start, closing_start, 5, 5))
        );
    }

    #[test]
    fn blocks_report_table_math_and_mermaid_edit_ranges() {
        let markdown = [
            "| A | B |",
            "|---|---|",
            "| 1 | 2 |",
            "$$",
            "x^2",
            "$$",
            "```mermaid",
            "flowchart TD",
            "A --> B",
            "```",
        ]
        .join("\n");
        let blocks = analyze_markdown_blocks(&markdown);

        assert_eq!(blocks[0].kind, MarkdownBlockKind::Table);
        let delimiter_start = markdown.find("|---|---|").unwrap();
        assert_eq!(
            blocks[0].ranges.markers,
            vec![range(
                delimiter_start,
                delimiter_start + "|---|---|".len(),
                2,
                2
            )]
        );

        assert_eq!(blocks[1].kind, MarkdownBlockKind::Math);
        let math_open = markdown.find("$$").unwrap();
        let math_content = markdown.find("x^2").unwrap();
        let math_close = markdown[math_content..].find("$$").unwrap() + math_content;
        assert_eq!(
            blocks[1].ranges.markers,
            vec![
                range(math_open, math_open + 2, 4, 4),
                range(math_close, math_close + 2, 6, 6),
            ]
        );
        assert_eq!(
            blocks[1].ranges.content,
            Some(range(math_content, math_close, 5, 5))
        );

        assert_eq!(
            blocks[2].kind,
            MarkdownBlockKind::Mermaid {
                language: Some("mermaid".to_string())
            }
        );
        let mermaid_open = markdown.find("```mermaid").unwrap();
        let mermaid_content = markdown.find("flowchart TD").unwrap();
        let mermaid_close = markdown.rfind("```").unwrap();
        assert_eq!(
            blocks[2].ranges.markers,
            vec![
                range(mermaid_open, mermaid_open + "```mermaid".len(), 7, 7),
                range(mermaid_close, mermaid_close + 3, 10, 10),
            ]
        );
        assert_eq!(
            blocks[2].ranges.content,
            Some(range(mermaid_content, mermaid_close, 8, 9))
        );
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
        let snapshot = analyze_markdown_block_snapshot("## Title\n", 5);
        let value = serde_json::to_value(snapshot).unwrap();

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
                    "end_line": 1,
                    "ranges": {
                        "source": {
                            "start_byte": 0,
                            "end_byte": 9,
                            "start_line": 1,
                            "end_line": 1
                        },
                        "content": {
                            "start_byte": 3,
                            "end_byte": 8,
                            "start_line": 1,
                            "end_line": 1
                        },
                        "markers": [{
                            "start_byte": 0,
                            "end_byte": 3,
                            "start_line": 1,
                            "end_line": 1
                        }]
                    }
                }]
            })
        );
    }

    #[test]
    fn empty_markdown_has_no_blocks() {
        assert!(analyze_markdown_blocks("").is_empty());
    }

    fn range(
        start_byte: usize,
        end_byte: usize,
        start_line: usize,
        end_line: usize,
    ) -> MarkdownBlockRange {
        MarkdownBlockRange {
            start_byte,
            end_byte,
            start_line,
            end_line,
        }
    }
}
