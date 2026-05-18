use dioxus::desktop::tao::dpi::{LogicalSize, PhysicalPosition};
use dioxus::desktop::tao::event::Event;
use dioxus::desktop::tao::window::Icon;
use dioxus::desktop::{Config, WindowBuilder};
use dioxus::prelude::*;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const FAVICON_SRC: &str = "/assets/favicon.ico";
const EDITOR_JS_SRC: &str = "/assets/editor.js";
const FAVICON_ASSET: Asset = asset!("/assets/favicon.ico");
const BRAND_LOGO_ASSET: Asset = asset!("/assets/logo.png");
const EDITOR_JS_ASSET: Asset = asset!("/assets/editor.js");
const MAIN_CSS_ASSET: Asset = asset!("/assets/main.css");
const MODAL_CSS_ASSET: Asset = asset!("/assets/styles/modal.css");
const MARKDOWN_CSS_ASSET: Asset = asset!("/assets/styles/markdown.css");
const TIPTAP_CHROME_CSS_ASSET: Asset = asset!("/assets/styles/tiptap-chrome.css");
const TIPTAP_CHROME_CODE_CSS_ASSET: Asset = asset!("/assets/styles/tiptap-chrome-code.css");
const TIPTAP_CHROME_BASE_CSS_ASSET: Asset = asset!("/assets/styles/tiptap-chrome-base.css");
const TIPTAP_CHROME_COMMAND_CSS_ASSET: Asset = asset!("/assets/styles/tiptap-chrome-command.css");
const TIPTAP_CHROME_TABLE_CSS_ASSET: Asset = asset!("/assets/styles/tiptap-chrome-table.css");
const TIPTAP_CHROME_BLOCK_CSS_ASSET: Asset = asset!("/assets/styles/tiptap-chrome-block.css");
const TIPTAP_CHROME_PAPYRO_CSS_ASSET: Asset = asset!("/assets/styles/tiptap-chrome-papyro.css");
const MAIN_CSS: &str = concat!(
    include_str!("../assets/styles/modal.css"),
    "\n",
    include_str!("../assets/styles/markdown.css"),
    "\n",
    include_str!("../assets/styles/tiptap-chrome-code.css"),
    "\n",
    include_str!("../assets/styles/tiptap-chrome-base.css"),
    "\n",
    include_str!("../assets/styles/tiptap-chrome-command.css"),
    "\n",
    include_str!("../assets/styles/tiptap-chrome-table.css"),
    "\n",
    include_str!("../assets/styles/tiptap-chrome-block.css"),
    "\n",
    include_str!("../assets/styles/tiptap-chrome-papyro.css"),
    "\n",
    include_str!("../assets/main.css")
);
const DESKTOP_RUNTIME_ASSETS: &[RuntimeAsset] = &[
    RuntimeAsset {
        relative_path: "assets/favicon.ico",
        bytes: include_bytes!("../assets/favicon.ico"),
    },
    RuntimeAsset {
        relative_path: "assets/logo.png",
        bytes: include_bytes!("../assets/logo.png"),
    },
    RuntimeAsset {
        relative_path: "assets/editor.js",
        bytes: include_bytes!("../assets/editor.js"),
    },
    RuntimeAsset {
        relative_path: "assets/main.css",
        bytes: include_bytes!("../assets/main.css"),
    },
    RuntimeAsset {
        relative_path: "assets/styles/modal.css",
        bytes: include_bytes!("../assets/styles/modal.css"),
    },
    RuntimeAsset {
        relative_path: "assets/styles/markdown.css",
        bytes: include_bytes!("../assets/styles/markdown.css"),
    },
    RuntimeAsset {
        relative_path: "assets/styles/tiptap-chrome.css",
        bytes: include_bytes!("../assets/styles/tiptap-chrome.css"),
    },
    RuntimeAsset {
        relative_path: "assets/styles/tiptap-chrome-code.css",
        bytes: include_bytes!("../assets/styles/tiptap-chrome-code.css"),
    },
    RuntimeAsset {
        relative_path: "assets/styles/tiptap-chrome-base.css",
        bytes: include_bytes!("../assets/styles/tiptap-chrome-base.css"),
    },
    RuntimeAsset {
        relative_path: "assets/styles/tiptap-chrome-command.css",
        bytes: include_bytes!("../assets/styles/tiptap-chrome-command.css"),
    },
    RuntimeAsset {
        relative_path: "assets/styles/tiptap-chrome-table.css",
        bytes: include_bytes!("../assets/styles/tiptap-chrome-table.css"),
    },
    RuntimeAsset {
        relative_path: "assets/styles/tiptap-chrome-block.css",
        bytes: include_bytes!("../assets/styles/tiptap-chrome-block.css"),
    },
    RuntimeAsset {
        relative_path: "assets/styles/tiptap-chrome-papyro.css",
        bytes: include_bytes!("../assets/styles/tiptap-chrome-papyro.css"),
    },
];

struct RuntimeAsset {
    relative_path: &'static str,
    bytes: &'static [u8],
}

fn main() {
    mark_desktop_assets_for_bundling();

    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init();

    if let Err(error) = sync_desktop_runtime_assets() {
        tracing::warn!(%error, "failed to sync desktop runtime assets");
    }
    prepare_macos_desktop_process_for_foreground();

    let startup_open_request = papyro_app::desktop::desktop_startup_open_request_from_env();
    let (external_open_sender, external_open_receiver) =
        papyro_app::desktop::desktop_external_open_request_channel();
    if !startup_open_request.is_empty() {
        tracing::info!(
            markdown_paths = startup_open_request.markdown_paths.len(),
            "desktop startup markdown open request parsed"
        );
    }

    let mut chrome = papyro_app::desktop::desktop_startup_chrome(FAVICON_SRC, MAIN_CSS);
    chrome
        .custom_head
        .push_str(desktop_interpreter_patch_head());
    // Optimistic tab close patch disabled — the synchronous Dioxus interpreter
    // patch already eliminates the one-frame gap, and the DOM-level hide was
    // racing with the VDOM diff causing layout thrash on close.
    // chrome.custom_head.push_str(desktop_tab_close_patch_head());
    chrome
        .custom_head
        .push_str(&desktop_editor_runtime_head(EDITOR_JS_SRC));

    let window = WindowBuilder::new()
        .with_title("Papyro")
        .with_inner_size(LogicalSize::new(1440.0, 920.0))
        .with_min_inner_size(LogicalSize::new(880.0, 600.0))
        .with_decorations(desktop_window_decorations())
        .with_visible(true)
        .with_focused(true)
        .with_always_on_top(false);
    let window = if let Some(icon) = load_window_icon() {
        window.with_window_icon(Some(icon))
    } else {
        window
    };
    let mut desktop_config = Config::new()
        .with_menu(None)
        .with_window(window)
        .with_background_color(chrome.background_color)
        .with_custom_head(chrome.custom_head)
        .with_on_window(|window, _| {
            keep_window_in_visible_area(&window);
            activate_macos_desktop_window();
        });
    if let Some(browser_args) = desktop_webview_browser_args() {
        desktop_config = desktop_config.with_windows_browser_args(browser_args);
    }

    dioxus::LaunchBuilder::new()
        .with_context(startup_open_request)
        .with_context(external_open_receiver)
        .with_cfg(desktop_config.with_custom_event_handler(move |event, _| {
            if let Event::Opened { urls } = event {
                if papyro_app::desktop::desktop_send_external_open_urls(
                    &external_open_sender,
                    urls.iter(),
                ) {
                    tracing::info!(
                        url_count = urls.len(),
                        "desktop external open request queued"
                    );
                }
            }

            if !perf_enabled() {
                return;
            }

            let event_debug = format!("{event:?}");
            if event_debug.contains("UserEvent(Poll(") || event_debug.contains("UserEvent(Ipc") {
                tracing::info!(event = %event_debug, "perf desktop event loop");
            }
        }))
        .launch(DesktopRoot);
}

fn sync_desktop_runtime_assets() -> io::Result<()> {
    for asset_root in desktop_runtime_asset_roots()? {
        for asset in DESKTOP_RUNTIME_ASSETS {
            sync_runtime_asset_bytes(&asset_root.join(asset.relative_path), asset.bytes)?;
        }
    }

    Ok(())
}

fn desktop_runtime_asset_roots() -> io::Result<Vec<PathBuf>> {
    let exe_dir = std::env::current_exe()?
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "executable directory not found"))?
        .to_path_buf();
    Ok(desktop_runtime_asset_roots_for_exe_dir(
        &exe_dir,
        cfg!(target_os = "macos"),
    ))
}

fn desktop_runtime_asset_roots_for_exe_dir(exe_dir: &Path, macos: bool) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if macos {
        if let Some(contents_dir) = exe_dir.parent() {
            roots.push(contents_dir.join("Resources"));
        }
    }

    roots.push(exe_dir.to_path_buf());
    roots.sort();
    roots.dedup();
    roots
}

fn mark_desktop_assets_for_bundling() {
    let _ = [
        FAVICON_ASSET,
        BRAND_LOGO_ASSET,
        EDITOR_JS_ASSET,
        MAIN_CSS_ASSET,
        MODAL_CSS_ASSET,
        MARKDOWN_CSS_ASSET,
        TIPTAP_CHROME_CSS_ASSET,
        TIPTAP_CHROME_CODE_CSS_ASSET,
        TIPTAP_CHROME_BASE_CSS_ASSET,
        TIPTAP_CHROME_COMMAND_CSS_ASSET,
        TIPTAP_CHROME_TABLE_CSS_ASSET,
        TIPTAP_CHROME_BLOCK_CSS_ASSET,
        TIPTAP_CHROME_PAPYRO_CSS_ASSET,
    ];
}

fn sync_runtime_asset_bytes(target: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }

    if fs::read(target)
        .map(|current| current == bytes)
        .unwrap_or(false)
    {
        return Ok(());
    }

    fs::write(target, bytes)
}

#[component]
fn DesktopRoot() -> Element {
    use_context_provider(papyro_app::desktop::desktop_brand_logo_src);
    use_effect(|| {
        let current_window = dioxus::desktop::window();
        keep_window_in_visible_area(&current_window.window);
        current_window.set_visible(true);
        current_window.set_focus();
        activate_macos_desktop_window();
    });

    rsx! {
        papyro_app::desktop::DesktopApp {}
    }
}

fn desktop_window_decorations() -> bool {
    cfg!(target_os = "macos")
}

fn load_window_icon() -> Option<Icon> {
    let image = image::load_from_memory(include_bytes!("../assets/logo.png"))
        .ok()?
        .into_rgba8();
    let (width, height) = image.dimensions();
    Icon::from_rgba(image.into_raw(), width, height).ok()
}

fn keep_window_in_visible_area(window: &dioxus::desktop::tao::window::Window) {
    let Some(monitor) = window
        .current_monitor()
        .or_else(|| window.primary_monitor())
        .or_else(|| window.available_monitors().next())
    else {
        return;
    };
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let window_size = window.outer_size();

    let margin = 24;
    let minimum_visible_size = 96;
    let monitor_right = monitor_position.x + monitor_size.width as i32;
    let monitor_bottom = monitor_position.y + monitor_size.height as i32;

    let centered_position = PhysicalPosition::new(
        monitor_position.x + ((monitor_size.width as i32 - window_size.width as i32) / 2).max(0),
        monitor_position.y + ((monitor_size.height as i32 - window_size.height as i32) / 2).max(0),
    );
    let position = window.outer_position().unwrap_or(centered_position);
    let is_mostly_visible = position.x < monitor_right - minimum_visible_size
        && position.y < monitor_bottom - minimum_visible_size
        && position.x + window_size.width as i32 > monitor_position.x + minimum_visible_size
        && position.y + window_size.height as i32 > monitor_position.y + minimum_visible_size;

    if is_mostly_visible {
        return;
    }

    let max_x =
        (monitor_right - window_size.width as i32 - margin).max(monitor_position.x + margin);
    let max_y =
        (monitor_bottom - window_size.height as i32 - margin).max(monitor_position.y + margin);
    window.set_outer_position(PhysicalPosition::new(
        centered_position
            .x
            .clamp(monitor_position.x + margin, max_x),
        centered_position
            .y
            .clamp(monitor_position.y + margin, max_y),
    ));
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn prepare_macos_desktop_process_for_foreground() {
    use cocoa::appkit::{NSApp, NSApplication, NSApplicationActivationPolicy};

    unsafe {
        let app = NSApp();
        app.setActivationPolicy_(
            NSApplicationActivationPolicy::NSApplicationActivationPolicyRegular,
        );
        set_macos_application_icon(app);
    }
}

#[cfg(not(target_os = "macos"))]
fn prepare_macos_desktop_process_for_foreground() {}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn activate_macos_desktop_window() {
    use cocoa::appkit::NSApp;
    use cocoa::appkit::NSApplication;
    use cocoa::base::YES;

    unsafe {
        NSApp().activateIgnoringOtherApps_(YES);
    }
}

#[cfg(not(target_os = "macos"))]
fn activate_macos_desktop_window() {}

#[cfg(target_os = "macos")]
#[allow(deprecated, unsafe_op_in_unsafe_fn)]
unsafe fn set_macos_application_icon(app: cocoa::base::id) {
    use cocoa::appkit::{NSApplication, NSImage};
    use cocoa::base::nil;
    use cocoa::foundation::{NSData, NSUInteger};
    use std::ffi::c_void;

    let logo = include_bytes!("../assets/logo.png");
    let data = NSData::dataWithBytes_length_(
        nil,
        logo.as_ptr().cast::<c_void>(),
        logo.len() as NSUInteger,
    );
    if data == nil {
        return;
    }

    let image = NSImage::alloc(nil).initWithData_(data);
    if image != nil {
        app.setApplicationIconImage_(image);
    }
}

fn desktop_editor_runtime_head(editor_js_src: &str) -> String {
    if cfg!(target_os = "macos") {
        papyro_app::desktop::desktop_editor_runtime_head(editor_js_src)
    } else {
        papyro_app::desktop::desktop_editor_runtime_external_head(editor_js_src)
    }
}

fn desktop_interpreter_patch_head() -> &'static str {
    r#"<script>
(() => {
    const hasDioxusTarget = (target) => {
        if (!(target instanceof Node)) {
            return false;
        }

        for (let node = target; node; node = node.parentNode) {
            if (node instanceof Element && node.hasAttribute("data-dioxus-id")) {
                return true;
            }
        }

        return false;
    };

    const patchInterpreter = () => {
        const interpreter = window.interpreter;
        if (!interpreter) {
            return false;
        }

        if (
            !interpreter.__papyroNullEventGuardPatched &&
            typeof interpreter.handleEvent === "function"
        ) {
            const handleEvent = interpreter.handleEvent;
            interpreter.handleEvent = function(event, name, bubbles) {
                if (!hasDioxusTarget(event?.target)) {
                    return;
                }

                return handleEvent.call(this, event, name, bubbles);
            };
            interpreter.__papyroNullEventGuardPatched = true;
        }

        if (!interpreter.__papyroSyncEditsPatched) {
            if (
                typeof interpreter.run_from_bytes !== "function" ||
                typeof interpreter.markEditsFinished !== "function"
            ) {
                return false;
            }

            interpreter.rafEdits = function(bytes) {
                this.run_from_bytes(bytes);
                this.markEditsFinished();
            };
            interpreter.__papyroSyncEditsPatched = true;
        }

        return (
            interpreter.__papyroNullEventGuardPatched &&
            interpreter.__papyroSyncEditsPatched
        );
    };

    if (patchInterpreter()) {
        return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
        if (patchInterpreter() || Date.now() - startedAt > 10000) {
            clearInterval(timer);
        }
    }, 10);

    window.addEventListener("load", patchInterpreter, { once: true });
})();
</script>"#
}

#[allow(dead_code)]
fn desktop_tab_close_patch_head() -> &'static str {
    r#"<script>
(() => {
    const applyOptimisticTabClose = (button) => {
        if (!(button instanceof HTMLElement)) {
            return;
        }

        if (button.dataset.immediateClose !== "true") {
            return;
        }

        const closeTabId = button.dataset.closeTabId;
        if (!closeTabId) {
            return;
        }

        const nextActiveTabId = button.dataset.nextActiveTabId || "";
        const tabSelector = (tabId) => `.mn-tab[data-tab-id="${CSS.escape(tabId)}"]`;
        const hostSelector = (tabId) => `.mn-editor-host-slot[data-tab-id="${CSS.escape(tabId)}"]`;

        const closingTab = button.closest(".mn-tab");
        const wasActive = closingTab?.classList.contains("active") ?? false;
        closingTab?.setAttribute("hidden", "hidden");
        closingTab?.setAttribute("aria-hidden", "true");
        if (closingTab instanceof HTMLElement) {
            closingTab.style.display = "none";
        }

        const closingHost = document.querySelector(hostSelector(closeTabId));
        if (closingHost instanceof HTMLElement) {
            closingHost.classList.add("hidden");
            closingHost.style.visibility = "hidden";
        }

        if (!wasActive) {
            return;
        }

        document
            .querySelectorAll(".mn-tab.active")
            .forEach((tab) => tab.classList.remove("active"));

        if (nextActiveTabId) {
            const nextTab = document.querySelector(tabSelector(nextActiveTabId));
            if (nextTab instanceof HTMLElement) {
                nextTab.removeAttribute("hidden");
                nextTab.removeAttribute("aria-hidden");
                nextTab.style.display = "";
                nextTab.classList.add("active");
            }

            document
                .querySelectorAll(".mn-editor-host-slot")
                .forEach((slot) => slot.classList.add("hidden"));

            const nextHost = document.querySelector(hostSelector(nextActiveTabId));
            if (nextHost instanceof HTMLElement) {
                nextHost.classList.remove("hidden");
                nextHost.style.visibility = "";
            }
        }
    };

    document.addEventListener(
        "mousedown",
        (event) => {
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            const closeButton = target.closest(".mn-tab-close");
            if (!closeButton) {
                return;
            }

            applyOptimisticTabClose(closeButton);
        },
        true
    );
})();
</script>"#
}

fn perf_enabled() -> bool {
    std::env::var_os("PAPYRO_PERF").is_some()
}

fn desktop_webview_browser_args() -> Option<String> {
    normalize_desktop_webview_browser_args(
        std::env::var("PAPYRO_WEBVIEW2_ADDITIONAL_BROWSER_ARGS").ok(),
    )
}

fn normalize_desktop_webview_browser_args(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editor_runtime_head_loads_external_script() {
        let head = desktop_editor_runtime_head(EDITOR_JS_SRC);

        assert!(head.contains(r#"window.__PAPYRO_EDITOR_SCRIPT_SRC__ = "/assets/editor.js";"#));
        assert!(head.contains(r#"data-papyro-editor-runtime-src="/assets/editor.js""#));
        if cfg!(target_os = "macos") {
            assert_eq!(head.matches("</script>").count(), 3);
            assert!(head.contains(r#"data-papyro-editor-runtime="inline""#));
            assert!(head.contains("external-fallback"));
            assert!(!head.contains(r#"<script src="/assets/editor.js""#));
        } else {
            assert_eq!(head.matches("</script>").count(), 2);
            assert!(head.contains(r#"src="/assets/editor.js""#));
            assert!(head.contains(r#"data-papyro-editor-runtime="external""#));
            assert!(!head.contains(r#"data-papyro-editor-runtime="inline""#));
        }
    }

    #[test]
    fn desktop_runtime_assets_use_webview_relative_urls() {
        for asset_url in [FAVICON_SRC, EDITOR_JS_SRC] {
            assert!(asset_url.starts_with("/assets/"));
            assert!(!asset_url.contains('\\'));
            assert!(!asset_url.contains(':'));
        }
    }

    #[test]
    fn desktop_runtime_asset_roots_cover_macos_resources() {
        let exe_dir = PathBuf::from("/Applications/Papyro.app/Contents/MacOS");
        let roots = desktop_runtime_asset_roots_for_exe_dir(&exe_dir, true);

        assert_eq!(
            roots,
            vec![
                PathBuf::from("/Applications/Papyro.app/Contents/MacOS"),
                PathBuf::from("/Applications/Papyro.app/Contents/Resources"),
            ]
        );
    }

    #[test]
    fn desktop_runtime_asset_roots_keep_executable_fallback() {
        let exe_dir = PathBuf::from("/opt/papyro");
        let roots = desktop_runtime_asset_roots_for_exe_dir(&exe_dir, false);

        assert_eq!(roots, vec![PathBuf::from("/opt/papyro")]);
    }

    #[test]
    fn editor_runtime_head_does_not_expose_local_asset_paths() {
        let head = papyro_app::desktop::desktop_editor_runtime_head_for_source(
            EDITOR_JS_SRC,
            "window.papyroEditor = {};",
        );

        assert!(head.contains(r#"window.__PAPYRO_EDITOR_SCRIPT_SRC__ = "/assets/editor.js";"#));
        assert!(!head.contains("apps/desktop/assets"));
        assert!(!head.contains("E:"));
        assert!(!head.contains('\\'));
    }

    #[test]
    fn editor_runtime_head_configures_fallback_src() {
        let head = papyro_app::desktop::desktop_editor_runtime_head_for_source(
            r#"/assets/editor.js?name="quoted""#,
            "window.papyroEditor = {};",
        );

        assert!(head.contains("window.__PAPYRO_EDITOR_SCRIPT_SRC__"));
        assert!(head.contains(r#"/assets/editor.js?name=\"quoted\""#));
        assert!(head.contains(
            r#"data-papyro-editor-runtime-src="/assets/editor.js?name=&quot;quoted&quot;""#
        ));
    }

    #[test]
    fn editor_runtime_head_escapes_inline_script_body() {
        let head = papyro_app::desktop::desktop_editor_runtime_head_for_source(
            EDITOR_JS_SRC,
            r#"window.x = "</script><!--";"#,
        );

        assert!(head.contains(r#"<\/script><\!--"#));
        assert!(!head.contains(r#""</script><!--""#));
    }

    #[test]
    fn desktop_brand_logo_src_embeds_png_data_url() {
        let logo = papyro_app::desktop::desktop_brand_logo_src();

        assert!(logo.starts_with("data:image/png;base64,"));
        assert!(logo.len() > 128);
    }

    #[test]
    fn desktop_interpreter_patch_filters_unknown_event_targets() {
        let head = desktop_interpreter_patch_head();

        assert!(head.contains("__papyroNullEventGuardPatched"));
        assert!(head.contains("hasDioxusTarget(event?.target)"));
        assert!(head.contains(r#"hasAttribute("data-dioxus-id")"#));
    }

    #[test]
    fn desktop_webview_browser_args_reads_test_hook() {
        assert_eq!(
            normalize_desktop_webview_browser_args(Some(
                " --remote-debugging-port=9234 ".to_string()
            ))
            .as_deref(),
            Some("--remote-debugging-port=9234")
        );
        assert_eq!(
            normalize_desktop_webview_browser_args(Some(" ".to_string())),
            None
        );
        assert_eq!(normalize_desktop_webview_browser_args(None), None);
    }
}
