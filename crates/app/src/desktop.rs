use crate::open_requests::{
    markdown_open_request_channel, markdown_open_request_from_paths, MarkdownOpenRequest,
    MarkdownOpenRequestReceiver, MarkdownOpenRequestSender,
};
use crate::runtime::{use_app_runtime, AppShell};
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, Theme};
use papyro_core::{NoteStorage, WorkspaceBootstrap};
use papyro_platform::{DesktopPlatform, PlatformApi};
use std::ffi::OsString;
use std::fmt::Display;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use url::Url;

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
            markdown_paths: request.markdown_paths,
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
    DesktopPlatform
        .get_app_data_dir()
        .ok()
        .and_then(|dir| papyro_storage::SqliteStorage::shared_in_app_data_dir(&dir).ok())
        .map(|storage| storage.load_settings())
        .unwrap_or_default()
}

fn build_startup_chrome(
    settings: &AppSettings,
    favicon: &str,
    main_css: &str,
) -> DesktopStartupChrome {
    let light_bg = (243, 245, 248, 255);
    let dark_bg = (15, 17, 23, 255);

    let (background_color, forced_theme_attr) = match settings.theme {
        Theme::Light => (light_bg, "light"),
        Theme::Dark => (dark_bg, "dark"),
        Theme::System => (dark_bg, ""),
    };

    let theme_script = if forced_theme_attr.is_empty() {
        String::new()
    } else {
        format!(
            "<script>document.documentElement.setAttribute('data-theme','{forced_theme_attr}');</script>"
        )
    };

    let custom_head = format!(
        r#"{theme_script}<link rel="icon" href="{favicon}">
<style>
html,body{{margin:0;padding:0;overflow:hidden;background:#f3f5f8;color:#111827;
font-family:"SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",system-ui,sans-serif;}}
:root[data-theme="dark"] html,:root[data-theme="dark"] body{{background:#0f1117;color:#f3f4f6;}}
@media(prefers-color-scheme:dark){{:root:not([data-theme="light"]) html,:root:not([data-theme="light"]) body{{background:#0f1117;color:#f3f4f6;}}}}
</style>
<style>{main_css}</style>"#,
        favicon = favicon,
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
        Arc::new(papyro_storage::SqliteStorage::shared().expect("default storage is initialized"))
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
    let recent_workspaces = papyro_storage::list_recent_workspaces(10).unwrap_or_else(|error| {
        tracing::warn!(%error, "failed to resolve recent workspaces for startup markdown path");
        Vec::new()
    });
    let default_workspace_path = desktop_default_workspace_path();

    match startup_workspace_path(
        startup_open_request,
        &recent_workspaces,
        default_workspace_path.as_deref(),
    ) {
        Some(workspace_path) => papyro_storage::bootstrap_from_workspace(&workspace_path),
        None => papyro_storage::bootstrap_from_env_or_current_dir(),
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

fn desktop_default_workspace_path() -> Option<PathBuf> {
    std::env::var_os("PAPYRO_WORKSPACE")
        .map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
}

fn absolutize_startup_path(path: &Path) -> PathBuf {
    if path.is_absolute() {
        return path.to_path_buf();
    }

    std::env::current_dir()
        .map(|current_dir| current_dir.join(path))
        .unwrap_or_else(|_| path.to_path_buf())
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
        assert!(chrome.custom_head.contains("data-theme','light'"));
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
        assert!(!chrome.custom_head.contains("setAttribute('data-theme'"));
        assert!(chrome.custom_head.contains("prefers-color-scheme:dark"));
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
        assert_eq!(request.markdown_paths, vec![markdown_path]);
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
}
