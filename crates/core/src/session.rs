use crate::models::{AppSettings, NoteOpenMode};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const DEFAULT_WINDOW_ID: &str = "main";
pub const SETTINGS_WINDOW_ID: &str = "settings";

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct WindowSessionId(String);

impl WindowSessionId {
    pub fn new(value: impl Into<String>) -> Self {
        let value = value.into();
        assert!(!value.is_empty(), "window session id cannot be empty");
        Self(value)
    }

    pub fn main() -> Self {
        Self(DEFAULT_WINDOW_ID.to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Default for WindowSessionId {
    fn default() -> Self {
        Self::main()
    }
}

impl AsRef<str> for WindowSessionId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl From<&str> for WindowSessionId {
    fn from(value: &str) -> Self {
        Self::new(value)
    }
}

impl From<String> for WindowSessionId {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WindowSessionKind {
    Main,
    Settings,
    Document { path: PathBuf },
}

impl WindowSessionKind {
    fn owns_document(&self, path: &Path) -> bool {
        matches!(self, Self::Document { path: owned } if owned == path)
    }

    fn accepts_tab_documents(&self) -> bool {
        !matches!(self, Self::Settings)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowSession {
    pub window_id: WindowSessionId,
    pub kind: WindowSessionKind,
    pub workspace_path: Option<PathBuf>,
}

pub type RegisteredWindowSession = WindowSession;

impl WindowSession {
    pub fn new(window_id: impl Into<WindowSessionId>, kind: WindowSessionKind) -> Self {
        Self {
            window_id: window_id.into(),
            kind,
            workspace_path: None,
        }
    }

    pub fn main() -> Self {
        Self::new(WindowSessionId::main(), WindowSessionKind::Main)
    }

    pub fn settings() -> Self {
        Self::new(
            WindowSessionId::new(SETTINGS_WINDOW_ID),
            WindowSessionKind::Settings,
        )
    }

    pub fn document(window_id: impl Into<WindowSessionId>, path: impl Into<PathBuf>) -> Self {
        Self::new(window_id, WindowSessionKind::Document { path: path.into() })
    }

    pub fn with_workspace_context(mut self, workspace_path: impl Into<PathBuf>) -> Self {
        self.workspace_path = Some(workspace_path.into());
        self
    }

    pub fn is_tool_window(&self) -> bool {
        matches!(self.kind, WindowSessionKind::Settings)
    }

    pub fn owns_document(&self, path: &Path) -> bool {
        self.kind.owns_document(path)
    }

    pub fn accepts_tab_documents(&self) -> bool {
        self.kind.accepts_tab_documents()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WindowRouteTarget {
    CurrentWindow(WindowSessionId),
    ExistingDocumentWindow(WindowSessionId),
    NewDocumentWindow(WindowSessionId),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessRuntimeSession {
    pub configured_note_open_mode: NoteOpenMode,
    pub effective_note_open_mode: NoteOpenMode,
    pub multi_window_available: bool,
    pub window_registry: WindowSessionRegistry,
}

impl ProcessRuntimeSession {
    pub fn tabs_only(settings: &AppSettings) -> Self {
        Self {
            configured_note_open_mode: settings.note_open_mode.clone(),
            effective_note_open_mode: NoteOpenMode::Tabs,
            multi_window_available: false,
            window_registry: WindowSessionRegistry::default(),
        }
    }

    pub fn with_multi_window_available(settings: &AppSettings) -> Self {
        Self {
            configured_note_open_mode: settings.note_open_mode.clone(),
            effective_note_open_mode: settings.note_open_mode.clone(),
            multi_window_available: true,
            window_registry: WindowSessionRegistry::default(),
        }
    }

    pub fn apply_settings(&mut self, settings: &AppSettings) {
        self.configured_note_open_mode = settings.note_open_mode.clone();
        self.effective_note_open_mode = if self.multi_window_available {
            settings.note_open_mode.clone()
        } else {
            NoteOpenMode::Tabs
        };
    }

    pub fn route_markdown_open(&self, path: &Path) -> WindowRouteTarget {
        match self.effective_note_open_mode {
            NoteOpenMode::Tabs => self.window_registry.route_tabs_open(),
            NoteOpenMode::MultiWindow => self.window_registry.route_multi_window_open(path),
        }
    }

    pub fn prepare_markdown_open(&mut self, path: &Path) -> WindowRouteTarget {
        match self.effective_note_open_mode {
            NoteOpenMode::Tabs => self.window_registry.route_tabs_open(),
            NoteOpenMode::MultiWindow => self.window_registry.prepare_multi_window_open(path),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowSessionRegistry {
    focused_window_id: WindowSessionId,
    sessions: BTreeMap<WindowSessionId, WindowSession>,
}

impl WindowSessionRegistry {
    pub fn with_main_window() -> Self {
        let main = WindowSession::main();
        let focused_window_id = main.window_id.clone();
        let sessions = BTreeMap::from([(main.window_id.clone(), main)]);
        Self {
            focused_window_id,
            sessions,
        }
    }

    pub fn focused_window_id(&self) -> &WindowSessionId {
        &self.focused_window_id
    }

    pub fn register(&mut self, session: WindowSession) -> Option<WindowSession> {
        self.sessions.insert(session.window_id.clone(), session)
    }

    pub fn focus(&mut self, window_id: &WindowSessionId) -> bool {
        if !self.sessions.contains_key(window_id) {
            return false;
        }

        self.focused_window_id = window_id.clone();
        true
    }

    pub fn get(&self, window_id: &WindowSessionId) -> Option<&WindowSession> {
        self.sessions.get(window_id)
    }

    pub fn iter(&self) -> impl Iterator<Item = &WindowSession> {
        self.sessions.values()
    }

    pub fn window_for_document(&self, path: &Path) -> Option<&WindowSessionId> {
        self.sessions
            .values()
            .find(|session| session.owns_document(path))
            .map(|session| &session.window_id)
    }

    pub fn route_tabs_open(&self) -> WindowRouteTarget {
        let target = self
            .sessions
            .get(&self.focused_window_id)
            .filter(|session| session.accepts_tab_documents())
            .map(|session| session.window_id.clone())
            .unwrap_or_else(WindowSessionId::main);
        WindowRouteTarget::CurrentWindow(target)
    }

    pub fn route_multi_window_open(&self, path: &Path) -> WindowRouteTarget {
        self.window_for_document(path)
            .cloned()
            .map(WindowRouteTarget::ExistingDocumentWindow)
            .unwrap_or_else(|| WindowRouteTarget::NewDocumentWindow(self.next_document_window_id()))
    }

    pub fn prepare_multi_window_open(&mut self, path: &Path) -> WindowRouteTarget {
        if let Some(window_id) = self.window_for_document(path).cloned() {
            self.focus(&window_id);
            return WindowRouteTarget::ExistingDocumentWindow(window_id);
        }

        let window_id = self.next_document_window_id();
        self.register(WindowSession::document(
            window_id.clone(),
            path.to_path_buf(),
        ));
        self.focus(&window_id);
        WindowRouteTarget::NewDocumentWindow(window_id)
    }

    fn next_document_window_id(&self) -> WindowSessionId {
        for index in 1.. {
            let window_id = WindowSessionId::new(format!("document-{index}"));
            if !self.sessions.contains_key(&window_id) {
                return window_id;
            }
        }

        unreachable!("document window id allocation cannot exhaust usize")
    }
}

impl Default for WindowSessionRegistry {
    fn default() -> Self {
        Self::with_main_window()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_registry_contains_and_focuses_main_window() {
        let registry = WindowSessionRegistry::default();

        assert_eq!(registry.focused_window_id().as_str(), DEFAULT_WINDOW_ID);
        assert!(registry.get(&WindowSessionId::main()).is_some());
        assert_eq!(registry.iter().count(), 1);
    }

    #[test]
    fn focus_only_updates_registered_windows() {
        let mut registry = WindowSessionRegistry::default();
        let secondary = WindowSessionId::from("doc-1");

        assert!(!registry.focus(&secondary));
        assert_eq!(registry.focused_window_id(), &WindowSessionId::main());

        registry.register(WindowSession::new(
            secondary.clone(),
            WindowSessionKind::Main,
        ));

        assert!(registry.focus(&secondary));
        assert_eq!(registry.focused_window_id(), &secondary);
    }

    #[test]
    fn tabs_route_uses_current_focused_window() {
        let mut registry = WindowSessionRegistry::default();
        let secondary = WindowSessionId::from("doc-1");
        registry.register(WindowSession::new(
            secondary.clone(),
            WindowSessionKind::Main,
        ));
        registry.focus(&secondary);

        assert_eq!(
            registry.route_tabs_open(),
            WindowRouteTarget::CurrentWindow(secondary)
        );
    }

    #[test]
    fn multi_window_route_focuses_existing_document_window() {
        let mut registry = WindowSessionRegistry::default();
        let note_path = PathBuf::from("workspace/notes/a.md");
        let document_window = WindowSessionId::from("doc-a");
        registry.register(WindowSession::document(
            document_window.clone(),
            note_path.clone(),
        ));

        assert_eq!(
            registry.route_multi_window_open(&note_path),
            WindowRouteTarget::ExistingDocumentWindow(document_window)
        );
    }

    #[test]
    fn multi_window_route_requests_new_window_for_unregistered_document() {
        let registry = WindowSessionRegistry::default();

        assert_eq!(
            registry.route_multi_window_open(Path::new("workspace/notes/new.md")),
            WindowRouteTarget::NewDocumentWindow(WindowSessionId::from("document-1"))
        );
    }

    #[test]
    fn prepare_multi_window_open_registers_and_focuses_new_document() {
        let mut registry = WindowSessionRegistry::default();
        let note_path = PathBuf::from("workspace/notes/new.md");

        assert_eq!(
            registry.prepare_multi_window_open(&note_path),
            WindowRouteTarget::NewDocumentWindow(WindowSessionId::from("document-1"))
        );
        assert_eq!(
            registry.focused_window_id(),
            &WindowSessionId::from("document-1")
        );
        assert!(registry
            .get(&WindowSessionId::from("document-1"))
            .is_some_and(|session| session.owns_document(&note_path)));

        assert_eq!(
            registry.prepare_multi_window_open(&note_path),
            WindowRouteTarget::ExistingDocumentWindow(WindowSessionId::from("document-1"))
        );
        assert_eq!(
            registry.focused_window_id(),
            &WindowSessionId::from("document-1")
        );
    }

    #[test]
    fn workspace_metadata_does_not_claim_document_ownership() {
        let mut registry = WindowSessionRegistry::default();
        registry.register(
            WindowSession::new("workspace-window", WindowSessionKind::Main)
                .with_workspace_context("workspace"),
        );

        assert_eq!(
            registry.route_multi_window_open(Path::new("workspace/notes/a.md")),
            WindowRouteTarget::NewDocumentWindow(WindowSessionId::from("document-1"))
        );
    }

    #[test]
    fn settings_window_does_not_receive_tab_documents() {
        let mut registry = WindowSessionRegistry::default();
        let settings = WindowSession::settings();
        let settings_id = settings.window_id.clone();
        registry.register(settings);
        registry.focus(&settings_id);

        assert_eq!(
            registry.route_tabs_open(),
            WindowRouteTarget::CurrentWindow(WindowSessionId::main())
        );
        assert!(registry
            .get(&settings_id)
            .is_some_and(WindowSession::is_tool_window));
    }

    #[test]
    fn document_session_owns_only_its_explicit_document_path() {
        let note_path = PathBuf::from("workspace/notes/a.md");
        let session =
            WindowSession::document("doc-a", note_path.clone()).with_workspace_context("workspace");

        assert!(session.owns_document(&note_path));
        assert!(!session.owns_document(Path::new("workspace/notes/b.md")));
        assert_eq!(session.workspace_path, Some(PathBuf::from("workspace")));
    }

    #[test]
    fn process_runtime_tabs_only_preserves_configured_mode_but_effective_tabs() {
        let settings = AppSettings {
            note_open_mode: NoteOpenMode::MultiWindow,
            ..AppSettings::default()
        };

        let runtime = ProcessRuntimeSession::tabs_only(&settings);

        assert_eq!(runtime.configured_note_open_mode, NoteOpenMode::MultiWindow);
        assert_eq!(runtime.effective_note_open_mode, NoteOpenMode::Tabs);
        assert!(!runtime.multi_window_available);
        assert_eq!(
            runtime.route_markdown_open(Path::new("workspace/notes/a.md")),
            WindowRouteTarget::CurrentWindow(WindowSessionId::main())
        );
    }

    #[test]
    fn process_runtime_routes_multi_window_when_available() {
        let settings = AppSettings {
            note_open_mode: NoteOpenMode::MultiWindow,
            ..AppSettings::default()
        };
        let note_path = PathBuf::from("workspace/notes/a.md");
        let document_window = WindowSessionId::from("doc-a");
        let mut runtime = ProcessRuntimeSession::with_multi_window_available(&settings);
        runtime.window_registry.register(WindowSession::document(
            document_window.clone(),
            note_path.clone(),
        ));

        assert_eq!(
            runtime.route_markdown_open(&note_path),
            WindowRouteTarget::ExistingDocumentWindow(document_window)
        );
    }

    #[test]
    fn process_runtime_updates_effective_mode_from_settings() {
        let mut runtime = ProcessRuntimeSession::tabs_only(&AppSettings::default());
        runtime.apply_settings(&AppSettings {
            note_open_mode: NoteOpenMode::MultiWindow,
            ..AppSettings::default()
        });

        assert_eq!(runtime.configured_note_open_mode, NoteOpenMode::MultiWindow);
        assert_eq!(runtime.effective_note_open_mode, NoteOpenMode::Tabs);

        let mut runtime =
            ProcessRuntimeSession::with_multi_window_available(&AppSettings::default());
        runtime.apply_settings(&AppSettings {
            note_open_mode: NoteOpenMode::MultiWindow,
            ..AppSettings::default()
        });

        assert_eq!(runtime.configured_note_open_mode, NoteOpenMode::MultiWindow);
        assert_eq!(runtime.effective_note_open_mode, NoteOpenMode::MultiWindow);
    }

    #[test]
    fn process_runtime_prepares_multi_window_route_when_available() {
        let settings = AppSettings {
            note_open_mode: NoteOpenMode::MultiWindow,
            ..AppSettings::default()
        };
        let note_path = PathBuf::from("workspace/notes/a.md");
        let mut runtime = ProcessRuntimeSession::with_multi_window_available(&settings);

        assert_eq!(
            runtime.prepare_markdown_open(&note_path),
            WindowRouteTarget::NewDocumentWindow(WindowSessionId::from("document-1"))
        );
        assert_eq!(
            runtime.prepare_markdown_open(&note_path),
            WindowRouteTarget::ExistingDocumentWindow(WindowSessionId::from("document-1"))
        );
    }
}
