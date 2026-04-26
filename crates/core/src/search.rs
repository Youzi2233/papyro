use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchResult {
    pub title: String,
    pub path: PathBuf,
    pub relative_path: PathBuf,
    pub matches: Vec<SearchMatch>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchMatch {
    pub field: SearchField,
    pub line: Option<usize>,
    pub snippet: String,
    pub highlights: Vec<SearchHighlight>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchField {
    Title,
    Path,
    Body,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SearchHighlight {
    pub start: usize,
    pub end: usize,
}
