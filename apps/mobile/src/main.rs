use dioxus::prelude::*;

const FAVICON: Asset = asset!("/assets/favicon.ico");
const BRAND_LOGO_SRC: &str = "/assets/logo.png";
const MAIN_CSS: Asset = asset!("/assets/main.css");
const EDITOR_JS: Asset = asset!("/assets/editor.js");

fn main() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init();

    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    use_context_provider(|| BRAND_LOGO_SRC.to_string());

    let editor_runtime_bootstrap = format!(
        "window.__PAPYRO_EDITOR_SCRIPT_SRC__ = {:?};",
        EDITOR_JS.to_string()
    );

    rsx! {
        document::Link { rel: "icon", href: FAVICON }
        document::Stylesheet { href: MAIN_CSS }
        document::Script { "{editor_runtime_bootstrap}" }
        document::Script { src: EDITOR_JS }
        papyro_app::mobile::MobileApp {}
    }
}
