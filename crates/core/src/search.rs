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

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WorkspaceSearchState {
    pub query: String,
    pub results: Vec<SearchResult>,
    pub is_loading: bool,
    pub error: Option<String>,
}

impl WorkspaceSearchState {
    pub fn start(&mut self, query: String) {
        let has_query = !query.trim().is_empty();

        self.query = query;
        self.results.clear();
        self.is_loading = has_query;
        self.error = None;
    }

    pub fn finish(&mut self, query: &str, results: Vec<SearchResult>) {
        if self.query != query {
            return;
        }

        self.results = results;
        self.is_loading = false;
        self.error = None;
    }

    pub fn fail(&mut self, query: &str, error: String) {
        if self.query != query {
            return;
        }

        self.results.clear();
        self.is_loading = false;
        self.error = Some(error);
    }

    pub fn clear(&mut self) {
        *self = Self::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn result(title: &str) -> SearchResult {
        SearchResult {
            title: title.to_string(),
            path: PathBuf::from(format!("{title}.md")),
            relative_path: PathBuf::from(format!("{title}.md")),
            matches: Vec::new(),
        }
    }

    #[test]
    fn workspace_search_state_tracks_loading_and_results() {
        let mut state = WorkspaceSearchState::default();

        state.start("release".to_string());
        assert!(state.is_loading);
        assert_eq!(state.query, "release");

        state.finish("release", vec![result("plan")]);
        assert!(!state.is_loading);
        assert_eq!(state.results, vec![result("plan")]);
        assert!(state.error.is_none());
    }

    #[test]
    fn workspace_search_state_ignores_stale_results() {
        let mut state = WorkspaceSearchState::default();

        state.start("release".to_string());
        state.start("meeting".to_string());
        state.finish("release", vec![result("old")]);

        assert!(state.is_loading);
        assert!(state.results.is_empty());
        assert_eq!(state.query, "meeting");
    }

    #[test]
    fn workspace_search_state_clears_empty_queries_and_failures() {
        let mut state = WorkspaceSearchState::default();

        state.start("release".to_string());
        state.fail("release", "search failed".to_string());
        assert_eq!(state.error.as_deref(), Some("search failed"));

        state.start("   ".to_string());
        assert!(!state.is_loading);
        assert!(state.results.is_empty());
        assert!(state.error.is_none());

        state.clear();
        assert_eq!(state, WorkspaceSearchState::default());
    }
}
