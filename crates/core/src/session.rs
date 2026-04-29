use crate::models::{AppSettings, NoteOpenMode};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const DEFAULT_WINDOW_ID: &str = "main";

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
pub struct RegisteredWindowSession {
    pub window_id: WindowSessionId,
    pub workspace_path: Option<PathBuf>,
    pub document_path: Option<PathBuf>,
}

impl RegisteredWindowSession {
    pub fn new(window_id: impl Into<WindowSessionId>) -> Self {
        Self {
            window_id: window_id.into(),
            workspace_path: None,
            document_path: None,
        }
    }

    pub fn main() -> Self {
        Self::new(WindowSessionId::main())
    }

    pub fn with_workspace_path(mut self, workspace_path: impl Into<PathBuf>) -> Self {
        self.workspace_path = Some(workspace_path.into());
        self
    }

    pub fn with_document_path(mut self, document_path: impl Into<PathBuf>) -> Self {
        self.document_path = Some(document_path.into());
        self
    }

    pub fn owns_document(&self, path: &Path) -> bool {
        self.document_path.as_deref() == Some(path)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WindowRouteTarget {
    CurrentWindow(WindowSessionId),
    ExistingDocumentWindow(WindowSessionId),
    NewDocumentWindow,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessRuntimeSession {
    pub configured_note_open_mode: NoteOpenMode,
    pub effective_note_open_mode: NoteOpenMode,
    pub window_registry: WindowSessionRegistry,
}

impl ProcessRuntimeSession {
    pub fn tabs_only(settings: &AppSettings) -> Self {
        Self {
            configured_note_open_mode: settings.note_open_mode.clone(),
            effective_note_open_mode: NoteOpenMode::Tabs,
            window_registry: WindowSessionRegistry::default(),
        }
    }

    pub fn with_multi_window_available(settings: &AppSettings) -> Self {
        Self {
            configured_note_open_mode: settings.note_open_mode.clone(),
            effective_note_open_mode: settings.note_open_mode.clone(),
            window_registry: WindowSessionRegistry::default(),
        }
    }

    pub fn route_markdown_open(&self, path: &Path) -> WindowRouteTarget {
        match self.effective_note_open_mode {
            NoteOpenMode::Tabs => self.window_registry.route_tabs_open(),
            NoteOpenMode::MultiWindow => self.window_registry.route_multi_window_open(path),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowSessionRegistry {
    focused_window_id: WindowSessionId,
    sessions: BTreeMap<WindowSessionId, RegisteredWindowSession>,
}

impl WindowSessionRegistry {
    pub fn with_main_window() -> Self {
        let main = RegisteredWindowSession::main();
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

    pub fn register(
        &mut self,
        session: RegisteredWindowSession,
    ) -> Option<RegisteredWindowSession> {
        self.sessions.insert(session.window_id.clone(), session)
    }

    pub fn focus(&mut self, window_id: &WindowSessionId) -> bool {
        if !self.sessions.contains_key(window_id) {
            return false;
        }

        self.focused_window_id = window_id.clone();
        true
    }

    pub fn get(&self, window_id: &WindowSessionId) -> Option<&RegisteredWindowSession> {
        self.sessions.get(window_id)
    }

    pub fn iter(&self) -> impl Iterator<Item = &RegisteredWindowSession> {
        self.sessions.values()
    }

    pub fn window_for_document(&self, path: &Path) -> Option<&WindowSessionId> {
        self.sessions
            .values()
            .find(|session| session.owns_document(path))
            .map(|session| &session.window_id)
    }

    pub fn route_tabs_open(&self) -> WindowRouteTarget {
        WindowRouteTarget::CurrentWindow(self.focused_window_id.clone())
    }

    pub fn route_multi_window_open(&self, path: &Path) -> WindowRouteTarget {
        self.window_for_document(path)
            .cloned()
            .map(WindowRouteTarget::ExistingDocumentWindow)
            .unwrap_or(WindowRouteTarget::NewDocumentWindow)
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

        registry.register(RegisteredWindowSession::new(secondary.clone()));

        assert!(registry.focus(&secondary));
        assert_eq!(registry.focused_window_id(), &secondary);
    }

    #[test]
    fn tabs_route_uses_current_focused_window() {
        let mut registry = WindowSessionRegistry::default();
        let secondary = WindowSessionId::from("doc-1");
        registry.register(RegisteredWindowSession::new(secondary.clone()));
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
        registry.register(
            RegisteredWindowSession::new(document_window.clone())
                .with_document_path(note_path.clone()),
        );

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
            WindowRouteTarget::NewDocumentWindow
        );
    }

    #[test]
    fn workspace_metadata_does_not_claim_document_ownership() {
        let mut registry = WindowSessionRegistry::default();
        registry.register(
            RegisteredWindowSession::new("workspace-window").with_workspace_path("workspace"),
        );

        assert_eq!(
            registry.route_multi_window_open(Path::new("workspace/notes/a.md")),
            WindowRouteTarget::NewDocumentWindow
        );
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
        runtime.window_registry.register(
            RegisteredWindowSession::new(document_window.clone())
                .with_document_path(note_path.clone()),
        );

        assert_eq!(
            runtime.route_markdown_open(&note_path),
            WindowRouteTarget::ExistingDocumentWindow(document_window)
        );
    }
}
