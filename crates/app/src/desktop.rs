use crate::open_requests::{
    markdown_open_request_channel, markdown_open_request_from_paths, MarkdownOpenRequest,
    MarkdownOpenRequestReceiver, MarkdownOpenRequestSender,
};
use crate::runtime::{use_app_runtime, AppShell};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, Theme, Workspace};
use papyro_core::{FileState, NoteStorage, WorkspaceBootstrap};
use papyro_platform::{DesktopPlatform, PlatformApi};
use papyro_ui::desktop_chrome::DesktopChromePolicy;
use std::ffi::OsString;
use std::fmt::Display;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use url::Url;

const DESKTOP_EDITOR_JS_SOURCE: &str = include_str!("../../../assets/editor.js");
const DESKTOP_LOGO_PNG: &[u8] = include_bytes!("../../../assets/logo.png");

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopStartupChrome {
    pub background_color: (u8, u8, u8, u8),
    pub custom_head: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DesktopStartupOpenRequest {
    pub markdown_paths: Vec<PathBuf>,
}

impl DesktopStartupOpenRequest {
    pub fn is_empty(&self) -> bool {
        self.markdown_paths.is_empty()
    }
}

impl From<MarkdownOpenRequest> for DesktopStartupOpenRequest {
    fn from(request: MarkdownOpenRequest) -> Self {
        Self {
            markdown_paths: request.into_paths(),
        }
    }
}

pub type DesktopExternalOpenRequestSender = MarkdownOpenRequestSender;
pub type DesktopExternalOpenRequestReceiver = MarkdownOpenRequestReceiver;

pub fn desktop_external_open_request_channel() -> (
    DesktopExternalOpenRequestSender,
    DesktopExternalOpenRequestReceiver,
) {
    markdown_open_request_channel()
}

pub fn desktop_send_external_open_urls<'a>(
    sender: &DesktopExternalOpenRequestSender,
    urls: impl IntoIterator<Item = &'a Url>,
) -> bool {
    let markdown_paths = papyro_platform::desktop::file_paths_from_opened_urls(urls);
    sender.send_paths(markdown_paths)
}

pub fn desktop_startup_chrome(favicon: impl Display, main_css: &str) -> DesktopStartupChrome {
    let settings = load_startup_settings();
    build_startup_chrome(&settings, &favicon.to_string(), main_css)
}

pub fn desktop_startup_open_request_from_env() -> DesktopStartupOpenRequest {
    desktop_startup_open_request_from_args(std::env::args_os())
}

pub fn desktop_brand_logo_src() -> String {
    embedded_png_data_url(DESKTOP_LOGO_PNG)
}

pub fn desktop_editor_runtime_head(editor_js_src: &str) -> String {
    desktop_editor_runtime_head_for_source(editor_js_src, DESKTOP_EDITOR_JS_SOURCE)
}

pub fn desktop_editor_runtime_head_for_source(
    editor_js_src: &str,
    editor_js_source: &str,
) -> String {
    let editor_js_attr = html_attr(editor_js_src);
    let editor_js_src = js_string_literal(editor_js_src);
    let editor_js_source = inline_script_body(editor_js_source);

    format!(
        r#"<script>
window.__PAPYRO_EDITOR_SCRIPT_SRC__ = {editor_js_src};
window.__PAPYRO_EDITOR_LOAD_ERROR__ = "desktop editor runtime script has not loaded yet";
</script>
<script
    data-papyro-editor-runtime="inline"
    data-papyro-editor-runtime-src="{editor_js_attr}"
>
{editor_js_source}
</script>
<script>
(() => {{
    const runtimeSrc = window.__PAPYRO_EDITOR_SCRIPT_SRC__ || {editor_js_src};
    if (window.papyroEditor) {{
        delete window.__PAPYRO_EDITOR_LOAD_ERROR__;
        return;
    }}

    const script = document.createElement("script");
    script.src = runtimeSrc;
    script.dataset.papyroEditorRuntime = "external-fallback";
    script.dataset.papyroEditorRuntimeSrc = runtimeSrc;
    script.onload = () => {{
        if (window.papyroEditor) {{
            delete window.__PAPYRO_EDITOR_LOAD_ERROR__;
        }} else {{
            window.__PAPYRO_EDITOR_LOAD_ERROR__ = "desktop editor runtime fallback loaded but did not register";
        }}
    }};
    script.onerror = () => {{
        window.__PAPYRO_EDITOR_LOAD_ERROR__ = `failed to load editor runtime script: ${{runtimeSrc}}`;
    }};
    document.head.appendChild(script);
}})();
</script>"#
    )
}

pub fn desktop_startup_open_request_from_args<I, S>(args: I) -> DesktopStartupOpenRequest
where
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    markdown_open_request_from_paths(
        args.into_iter()
            .skip(1)
            .map(|arg| PathBuf::from(arg.into())),
    )
    .into()
}

fn load_startup_settings() -> AppSettings {
    shared_desktop_storage()
        .ok()
        .map(|storage| storage.load_settings())
        .unwrap_or_default()
}

fn shared_desktop_storage() -> anyhow::Result<papyro_storage::SqliteStorage> {
    let app_data_dir = DesktopPlatform.get_app_data_dir()?;
    papyro_storage::SqliteStorage::shared_in_app_data_dir(&app_data_dir)
}

fn build_startup_chrome(
    settings: &AppSettings,
    favicon: &str,
    main_css: &str,
) -> DesktopStartupChrome {
    let light_bg = (243, 245, 248, 255);
    let dark_bg = (15, 17, 23, 255);

    let background_color = match &settings.theme {
        Theme::System => dark_bg,
        Theme::Light | Theme::GitHubLight | Theme::WarmReading => light_bg,
        Theme::Dark | Theme::GitHubDark | Theme::HighContrast => dark_bg,
    };

    let theme_script = papyro_ui::theme::theme_dom_script(&settings.theme);

    let custom_head = format!(
        r#"<script>{theme_script}</script><script>document.documentElement.dataset.platform='{platform}';</script>
<link rel="icon" href="{favicon}">
<style>
html,body{{margin:0;padding:0;overflow:hidden;background:#f3f5f8;color:#111827;
font-family:"SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",system-ui,sans-serif;}}
:root[data-theme="dark"] html,:root[data-theme="dark"] body{{background:#0f1117;color:#f3f4f6;}}
:root[data-theme="github_light"] html,:root[data-theme="github_light"] body{{background:#f6f8fa;color:#24292f;}}
:root[data-theme="github_dark"] html,:root[data-theme="github_dark"] body{{background:#0d1117;color:#e6edf3;}}
:root[data-theme="high_contrast"] html,:root[data-theme="high_contrast"] body{{background:#000000;color:#ffffff;}}
:root[data-theme="warm_reading"] html,:root[data-theme="warm_reading"] body{{background:#f4f1e8;color:#202124;}}
@media(prefers-color-scheme:dark){{:root:not([data-theme]) html,:root:not([data-theme]) body{{background:#0f1117;color:#f3f4f6;}}}}
</style>
<style>{main_css}</style>"#,
        favicon = favicon,
        platform = DesktopChromePolicy::current().platform.as_str(),
    );

    DesktopStartupChrome {
        background_color,
        custom_head,
    }
}

#[component]
pub fn DesktopApp() -> Element {
    let startup_open_request =
        use_hook(|| try_consume_context::<DesktopStartupOpenRequest>().unwrap_or_default());
    let external_open_requests =
        use_hook(try_consume_context::<DesktopExternalOpenRequestReceiver>);
    let bootstrap = use_hook(|| desktop_bootstrap(&startup_open_request));
    let storage = use_hook(|| {
        Arc::new(shared_desktop_storage().expect("desktop storage is initialized"))
            as Arc<dyn NoteStorage>
    });
    let platform = use_hook(|| Arc::new(DesktopPlatform) as Arc<dyn PlatformApi>);
    use_app_runtime(
        AppShell::Desktop,
        bootstrap,
        storage,
        platform,
        startup_open_request.markdown_paths.clone(),
        external_open_requests,
    );

    rsx! {
        papyro_ui::layouts::DesktopLayout {}
    }
}

fn desktop_bootstrap(startup_open_request: &DesktopStartupOpenRequest) -> WorkspaceBootstrap {
    let storage = shared_desktop_storage().expect("desktop storage is initialized");
    desktop_bootstrap_from_storage(
        &storage,
        startup_open_request,
        Some(storage.db_path().to_path_buf()),
    )
}

pub(crate) fn desktop_bootstrap_from_storage(
    storage: &dyn NoteStorage,
    startup_open_request: &DesktopStartupOpenRequest,
    db_path: Option<PathBuf>,
) -> WorkspaceBootstrap {
    let recent_workspaces = storage.list_recent_workspaces(10).unwrap_or_else(|error| {
        tracing::warn!(%error, "failed to resolve recent workspaces for desktop startup");
        Vec::new()
    });
    let configured_workspace_path = desktop_configured_workspace_path();

    let workspace_path = startup_workspace_path(
        startup_open_request,
        &recent_workspaces,
        configured_workspace_path.as_deref(),
    )
    .or_else(|| resume_workspace_path(&recent_workspaces, configured_workspace_path.as_deref()));

    match workspace_path {
        Some(workspace_path) => {
            let mut bootstrap = storage.bootstrap_from_workspace(&workspace_path);
            if bootstrap.file_state.current_workspace.is_none()
                && bootstrap.file_state.workspaces.is_empty()
            {
                bootstrap.file_state.workspaces = recent_workspaces;
            }
            bootstrap
        }
        None => desktop_onboarding_bootstrap(storage.load_settings(), db_path, recent_workspaces),
    }
}

fn startup_workspace_path(
    startup_open_request: &DesktopStartupOpenRequest,
    recent_workspaces: &[papyro_core::models::Workspace],
    default_workspace_path: Option<&Path>,
) -> Option<PathBuf> {
    let startup_path = startup_open_request.markdown_paths.first()?;
    let startup_path = absolutize_startup_path(startup_path);

    recent_workspaces
        .iter()
        .filter(|workspace| startup_path.starts_with(&workspace.path))
        .max_by_key(|workspace| workspace.path.components().count())
        .map(|workspace| workspace.path.clone())
        .or_else(|| {
            default_workspace_path
                .filter(|workspace_path| startup_path.starts_with(workspace_path))
                .map(Path::to_path_buf)
        })
        .or_else(|| startup_path.parent().map(Path::to_path_buf))
        .filter(|path| !path.as_os_str().is_empty())
}

fn resume_workspace_path(
    recent_workspaces: &[Workspace],
    configured_workspace_path: Option<&Path>,
) -> Option<PathBuf> {
    configured_workspace_path
        .map(Path::to_path_buf)
        .or_else(|| {
            recent_workspaces
                .first()
                .map(|workspace| workspace.path.clone())
        })
}

fn desktop_configured_workspace_path() -> Option<PathBuf> {
    std::env::var_os("PAPYRO_WORKSPACE").map(PathBuf::from)
}

fn desktop_onboarding_bootstrap(
    settings: AppSettings,
    db_path: Option<PathBuf>,
    recent_workspaces: Vec<Workspace>,
) -> WorkspaceBootstrap {
    WorkspaceBootstrap {
        file_state: FileState {
            workspaces: recent_workspaces,
            ..FileState::default()
        },
        db_path,
        status_message: "Choose a workspace to begin".to_string(),
        settings: settings.clone(),
        global_settings: settings,
        ..WorkspaceBootstrap::default()
    }
}

fn absolutize_startup_path(path: &Path) -> PathBuf {
    if path.is_absolute() {
        return path.to_path_buf();
    }

    std::env::current_dir()
        .map(|current_dir| current_dir.join(path))
        .unwrap_or_else(|_| path.to_path_buf())
}

fn embedded_png_data_url(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", STANDARD.encode(bytes))
}

fn js_string_literal(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('"', "\\\"");
    format!("\"{escaped}\"")
}

fn inline_script_body(source: &str) -> String {
    let lower_source = source.to_ascii_lowercase();
    let mut escaped = String::with_capacity(source.len());
    let mut offset = 0;
    let needle = "</script";

    while let Some(relative_index) = lower_source[offset..].find(needle) {
        let index = offset + relative_index;
        escaped.push_str(&source[offset..index]);
        escaped.push_str("<\\/");
        escaped.push_str(&source[index + 2..index + needle.len()]);
        offset = index + needle.len();
    }

    escaped.push_str(&source[offset..]);
    escaped.replace("<!--", "<\\!--")
}

fn html_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_chrome_forces_light_theme_when_configured() {
        let settings = AppSettings {
            theme: Theme::Light,
            ..AppSettings::default()
        };

        let chrome =
            build_startup_chrome(&settings, "/favicon.ico", ".mn-shell { display: grid; }");

        assert_eq!(chrome.background_color, (243, 245, 248, 255));
        assert!(chrome.custom_head.contains(r#"var theme = "light";"#));
        assert!(chrome
            .custom_head
            .contains(r#"root.classList.toggle("dark", dark)"#));
        assert!(chrome
            .custom_head
            .contains("document.documentElement.dataset.platform="));
        assert!(chrome.custom_head.contains(r#"href="/favicon.ico""#));
        assert!(chrome.custom_head.contains(".mn-shell"));
        assert!(!chrome.custom_head.contains("papyroEditor"));
    }

    #[test]
    fn startup_chrome_defers_system_theme_to_css_media_query() {
        let settings = AppSettings {
            theme: Theme::System,
            ..AppSettings::default()
        };

        let chrome = build_startup_chrome(&settings, "/favicon.ico", "");

        assert_eq!(chrome.background_color, (15, 17, 23, 255));
        assert!(chrome.custom_head.contains("var theme = null;"));
        assert!(chrome.custom_head.contains("prefers-color-scheme:dark"));
        assert!(chrome.custom_head.contains("prefers-color-scheme: dark"));
    }

    #[test]
    fn startup_chrome_forces_curated_theme_when_configured() {
        let settings = AppSettings {
            theme: Theme::GitHubDark,
            ..AppSettings::default()
        };

        let chrome = build_startup_chrome(&settings, "/favicon.ico", "");

        assert_eq!(chrome.background_color, (15, 17, 23, 255));
        assert!(chrome.custom_head.contains(r#"var theme = "github_dark";"#));
        assert!(chrome.custom_head.contains("var dark = theme ? true"));
        assert!(chrome.custom_head.contains("github_dark"));
        assert!(chrome.custom_head.contains(":root:not([data-theme])"));
    }

    #[test]
    fn startup_chrome_exposes_platform_name() {
        let settings = AppSettings::default();
        let chrome = build_startup_chrome(&settings, "/favicon.ico", "");

        assert!(chrome
            .custom_head
            .contains("document.documentElement.dataset.platform="));
    }

    #[test]
    fn desktop_startup_open_request_filters_markdown_args() {
        let current_dir = std::env::current_dir().unwrap();
        let request = desktop_startup_open_request_from_args([
            OsString::from("papyro.exe"),
            OsString::from("notes/a.md"),
            OsString::from("notes/b.MARKDOWN"),
            OsString::from("notes/image.png"),
        ]);

        assert_eq!(
            request.markdown_paths,
            vec![
                current_dir.join("notes/a.md"),
                current_dir.join("notes/b.MARKDOWN")
            ]
        );
    }

    #[test]
    fn desktop_startup_open_request_skips_binary_without_args() {
        let request = desktop_startup_open_request_from_args([OsString::from("papyro.exe")]);

        assert!(request.is_empty());
    }

    #[test]
    fn desktop_external_open_urls_enqueue_markdown_file_paths() {
        let current_dir = std::env::current_dir().unwrap();
        let markdown_path = current_dir.join("notes/a.md");
        let ignored_path = current_dir.join("notes/image.png");
        let urls = [
            Url::from_file_path(&markdown_path).unwrap(),
            Url::from_file_path(&ignored_path).unwrap(),
            Url::parse("https://example.test/remote.md").unwrap(),
        ];
        let (sender, receiver) = desktop_external_open_request_channel();

        assert!(desktop_send_external_open_urls(&sender, urls.iter()));

        let request = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(receiver.recv())
            .unwrap();
        assert_eq!(request.paths(), vec![markdown_path]);
    }

    #[test]
    fn startup_workspace_path_uses_first_markdown_parent() {
        let current_dir = std::env::current_dir().unwrap();
        let request = DesktopStartupOpenRequest {
            markdown_paths: vec![
                current_dir.join("workspace/notes/a.md"),
                current_dir.join("other/b.md"),
            ],
        };

        assert_eq!(
            startup_workspace_path(&request, &[], None),
            Some(current_dir.join("workspace/notes"))
        );
    }

    #[test]
    fn startup_workspace_path_skips_empty_request() {
        assert_eq!(
            startup_workspace_path(&DesktopStartupOpenRequest::default(), &[], None),
            None
        );
    }

    #[test]
    fn startup_workspace_path_prefers_known_workspace() {
        let current_dir = std::env::current_dir().unwrap();
        let workspace_path = current_dir.join("workspace");
        let request = DesktopStartupOpenRequest {
            markdown_paths: vec![workspace_path.join("notes/a.md")],
        };
        let workspace = papyro_core::models::Workspace {
            id: "workspace".to_string(),
            name: "Workspace".to_string(),
            path: workspace_path.clone(),
            created_at: 0,
            last_opened: Some(1),
            sort_order: 0,
        };

        assert_eq!(
            startup_workspace_path(&request, &[workspace], None),
            Some(workspace_path)
        );
    }

    #[test]
    fn startup_workspace_path_uses_default_workspace_before_parent() {
        let current_dir = std::env::current_dir().unwrap();
        let default_workspace = current_dir.join("workspace");
        let request = DesktopStartupOpenRequest {
            markdown_paths: vec![default_workspace.join("notes/a.md")],
        };

        assert_eq!(
            startup_workspace_path(&request, &[], Some(&default_workspace)),
            Some(default_workspace)
        );
    }

    #[test]
    fn resume_workspace_path_prefers_configured_workspace() {
        let configured = PathBuf::from("configured");
        let recent = Workspace {
            id: "recent".to_string(),
            name: "Recent".to_string(),
            path: PathBuf::from("recent"),
            created_at: 0,
            last_opened: Some(1),
            sort_order: 0,
        };

        assert_eq!(
            resume_workspace_path(&[recent], Some(&configured)),
            Some(configured)
        );
    }

    #[test]
    fn resume_workspace_path_uses_most_recent_workspace() {
        let recent = Workspace {
            id: "recent".to_string(),
            name: "Recent".to_string(),
            path: PathBuf::from("recent"),
            created_at: 0,
            last_opened: Some(1),
            sort_order: 0,
        };

        assert_eq!(
            resume_workspace_path(&[recent], None),
            Some(PathBuf::from("recent"))
        );
    }

    #[test]
    fn onboarding_bootstrap_keeps_recent_workspaces_without_current_workspace() {
        let recent = Workspace {
            id: "recent".to_string(),
            name: "Recent".to_string(),
            path: PathBuf::from("recent"),
            created_at: 0,
            last_opened: Some(1),
            sort_order: 0,
        };
        let bootstrap = desktop_onboarding_bootstrap(
            AppSettings::default(),
            Some(PathBuf::from("papyro.db")),
            vec![recent.clone()],
        );

        assert_eq!(bootstrap.file_state.current_workspace, None);
        assert_eq!(bootstrap.file_state.workspaces, vec![recent]);
        assert_eq!(bootstrap.workspace_root, None);
        assert_eq!(bootstrap.db_path, Some(PathBuf::from("papyro.db")));
    }
}
