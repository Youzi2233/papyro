use dioxus::desktop::tao::dpi::LogicalSize;
use dioxus::desktop::tao::event::Event;
use dioxus::desktop::tao::window::Icon;
use dioxus::desktop::{Config, WindowBuilder};
use dioxus::prelude::*;
use std::fs;
use std::io;
use std::path::Path;

const FAVICON: Asset = asset!("/assets/favicon.ico");
const BRAND_LOGO_SRC: &str = "/assets/logo.png";
const MAIN_CSS: &str = concat!(
    include_str!("../assets/styles/modal.css"),
    "\n",
    include_str!("../assets/main.css")
);
const EDITOR_JS: &str = include_str!("../assets/editor.js");
const EDITOR_JS_SRC: &str = "/assets/editor.js";

fn main() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init();

    if let Err(error) = sync_desktop_runtime_assets() {
        tracing::warn!(%error, "failed to sync desktop runtime assets");
    }

    let startup_open_request = papyro_app::desktop::desktop_startup_open_request_from_env();
    let (external_open_sender, external_open_receiver) =
        papyro_app::desktop::desktop_external_open_request_channel();
    if !startup_open_request.is_empty() {
        tracing::info!(
            markdown_paths = startup_open_request.markdown_paths.len(),
            "desktop startup markdown open request parsed"
        );
    }

    let mut chrome = papyro_app::desktop::desktop_startup_chrome(FAVICON, MAIN_CSS);
    chrome
        .custom_head
        .push_str(desktop_interpreter_patch_head());
    // Optimistic tab close patch disabled — the synchronous Dioxus interpreter
    // patch already eliminates the one-frame gap, and the DOM-level hide was
    // racing with the VDOM diff causing layout thrash on close.
    // chrome.custom_head.push_str(desktop_tab_close_patch_head());
    chrome
        .custom_head
        .push_str(&editor_runtime_head(EDITOR_JS_SRC));

    let window = WindowBuilder::new()
        .with_title("Papyro")
        .with_inner_size(LogicalSize::new(1440.0, 920.0))
        .with_min_inner_size(LogicalSize::new(880.0, 600.0))
        .with_always_on_top(false);
    let window = if let Some(icon) = load_window_icon() {
        window.with_window_icon(Some(icon))
    } else {
        window
    };

    dioxus::LaunchBuilder::new()
        .with_context(startup_open_request)
        .with_context(external_open_receiver)
        .with_cfg(
            Config::new()
                .with_menu(None)
                .with_window(window)
                .with_background_color(chrome.background_color)
                .with_custom_head(chrome.custom_head)
                .with_custom_event_handler(move |event, _| {
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
                    if event_debug.contains("UserEvent(Poll(")
                        || event_debug.contains("UserEvent(Ipc")
                    {
                        tracing::info!(event = %event_debug, "perf desktop event loop");
                    }
                }),
        )
        .launch(DesktopRoot);
}

fn sync_desktop_runtime_assets() -> io::Result<()> {
    let exe_dir = std::env::current_exe()?
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "executable directory not found"))?
        .to_path_buf();
    let source_asset_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("assets");
    let asset_dir = exe_dir.join("assets");

    fs::create_dir_all(&asset_dir)?;
    sync_runtime_asset_bytes(&asset_dir.join("editor.js"), EDITOR_JS.as_bytes())?;
    sync_runtime_asset_file(
        &source_asset_dir.join("favicon.ico"),
        &asset_dir.join("favicon.ico"),
    )?;
    sync_runtime_asset_file(
        &source_asset_dir.join("logo.png"),
        &asset_dir.join("logo.png"),
    )?;

    Ok(())
}

fn sync_runtime_asset_file(source: &Path, target: &Path) -> io::Result<()> {
    let bytes = fs::read(source)?;
    sync_runtime_asset_bytes(target, &bytes)
}

fn sync_runtime_asset_bytes(target: &Path, bytes: &[u8]) -> io::Result<()> {
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
    use_context_provider(|| BRAND_LOGO_SRC.to_string());

    rsx! {
        papyro_app::desktop::DesktopApp {}
    }
}

fn load_window_icon() -> Option<Icon> {
    let image = image::load_from_memory(include_bytes!("../assets/logo.png"))
        .ok()?
        .into_rgba8();
    let (width, height) = image.dimensions();
    Icon::from_rgba(image.into_raw(), width, height).ok()
}

fn editor_runtime_head(editor_js_src: &str) -> String {
    let editor_js_attr = html_attr(editor_js_src);
    let editor_js_src = js_string_literal(editor_js_src);

    format!(
        r#"<script>
window.__PAPYRO_EDITOR_SCRIPT_SRC__ = {editor_js_src};
window.__PAPYRO_EDITOR_LOAD_ERROR__ = "desktop editor runtime script has not loaded yet";
</script>
<script
    src="{editor_js_attr}"
    data-papyro-editor-runtime="external"
    data-papyro-editor-runtime-src="{editor_js_attr}"
    onload="if (window.papyroEditor) delete window.__PAPYRO_EDITOR_LOAD_ERROR__; else window.__PAPYRO_EDITOR_LOAD_ERROR__ = 'desktop editor runtime script loaded but did not register';"
    onerror="window.__PAPYRO_EDITOR_LOAD_ERROR__ = 'failed to load editor runtime script: {editor_js_attr}';"
></script>"#
    )
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

fn js_string_literal(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('"', "\\\"");
    format!("\"{escaped}\"")
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
    fn editor_runtime_head_loads_external_script() {
        let head = editor_runtime_head("/assets/editor.js");

        assert_eq!(head.matches("</script>").count(), 2);
        assert!(head.contains(r#"src="/assets/editor.js""#));
        assert!(head.contains(r#"data-papyro-editor-runtime="external""#));
    }

    #[test]
    fn editor_runtime_head_configures_fallback_src() {
        let head = editor_runtime_head(r#"/assets/editor.js?name="quoted""#);

        assert!(head.contains("window.__PAPYRO_EDITOR_SCRIPT_SRC__"));
        assert!(head.contains(r#"/assets/editor.js?name=\"quoted\""#));
        assert!(head.contains(r#"src="/assets/editor.js?name=&quot;quoted&quot;""#));
    }

    #[test]
    fn desktop_interpreter_patch_filters_unknown_event_targets() {
        let head = desktop_interpreter_patch_head();

        assert!(head.contains("__papyroNullEventGuardPatched"));
        assert!(head.contains("hasDioxusTarget(event?.target)"));
        assert!(head.contains(r#"hasAttribute("data-dioxus-id")"#));
    }
}
