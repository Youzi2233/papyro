pub mod ast;
pub mod blocks;
pub mod markdown;
pub mod outline;

pub use ast::DocumentStats;
pub use blocks::{
    analyze_markdown_block_snapshot, analyze_markdown_block_snapshot_with_options,
    analyze_markdown_blocks, MarkdownBlock, MarkdownBlockAnalysisOptions, MarkdownBlockFallback,
    MarkdownBlockFallbackReason, MarkdownBlockHintSet, MarkdownBlockKind,
};
pub use markdown::summarize_markdown;
pub use outline::{extract_outline, OutlineItem};
