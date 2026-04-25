pub const KB: usize = 1024;
pub const MB: usize = 1024 * KB;

pub const SAMPLE_100_KB: usize = 100 * KB;
pub const SAMPLE_1_MB: usize = MB;
pub const SAMPLE_5_MB: usize = 5 * MB;

pub const DISABLE_CODE_HIGHLIGHT_BYTES: usize = SAMPLE_1_MB;
pub const DISABLE_LIVE_PREVIEW_BYTES: usize = SAMPLE_5_MB;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EditorPerfBudget {
    pub label: &'static str,
    pub bytes: usize,
    pub open_ms: u64,
    pub switch_tab_ms: u64,
    pub input_ms: u64,
    pub preview_ms: u64,
}

pub const EDITOR_PERF_BUDGETS: [EditorPerfBudget; 3] = [
    EditorPerfBudget {
        label: "100KB",
        bytes: SAMPLE_100_KB,
        open_ms: 250,
        switch_tab_ms: 80,
        input_ms: 16,
        preview_ms: 200,
    },
    EditorPerfBudget {
        label: "1MB",
        bytes: SAMPLE_1_MB,
        open_ms: 800,
        switch_tab_ms: 150,
        input_ms: 32,
        preview_ms: 1_000,
    },
    EditorPerfBudget {
        label: "5MB",
        bytes: SAMPLE_5_MB,
        open_ms: 2_500,
        switch_tab_ms: 300,
        input_ms: 50,
        preview_ms: 150,
    },
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PreviewPolicy {
    pub byte_len: usize,
    pub code_highlighting_enabled: bool,
    pub live_preview_enabled: bool,
}

impl PreviewPolicy {
    pub fn for_len(byte_len: usize) -> Self {
        Self {
            byte_len,
            code_highlighting_enabled: byte_len < DISABLE_CODE_HIGHLIGHT_BYTES,
            live_preview_enabled: byte_len < DISABLE_LIVE_PREVIEW_BYTES,
        }
    }

    pub fn is_degraded(self) -> bool {
        !self.code_highlighting_enabled || !self.live_preview_enabled
    }
}

pub fn should_highlight_code(byte_len: usize) -> bool {
    PreviewPolicy::for_len(byte_len).code_highlighting_enabled
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_policy_degrades_large_documents_in_steps() {
        let small = PreviewPolicy::for_len(SAMPLE_100_KB);
        assert!(small.code_highlighting_enabled);
        assert!(small.live_preview_enabled);

        let medium = PreviewPolicy::for_len(SAMPLE_1_MB);
        assert!(!medium.code_highlighting_enabled);
        assert!(medium.live_preview_enabled);

        let huge = PreviewPolicy::for_len(SAMPLE_5_MB);
        assert!(!huge.code_highlighting_enabled);
        assert!(!huge.live_preview_enabled);
    }

    #[test]
    fn budgets_are_defined_for_required_sample_sizes() {
        assert_eq!(EDITOR_PERF_BUDGETS[0].bytes, SAMPLE_100_KB);
        assert_eq!(EDITOR_PERF_BUDGETS[1].bytes, SAMPLE_1_MB);
        assert_eq!(EDITOR_PERF_BUDGETS[2].bytes, SAMPLE_5_MB);
    }
}
