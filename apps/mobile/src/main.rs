use dioxus::prelude::*;

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
    let editor_runtime_bootstrap = format!(
        "window.__PAPYRO_EDITOR_SCRIPT_SRC__ = {:?};",
        EDITOR_JS.to_string()
    );

    rsx! {
        document::Stylesheet { href: MAIN_CSS }
        document::Script { "{editor_runtime_bootstrap}" }
        document::Script { src: EDITOR_JS }
        papyro_app::mobile::MobileApp {}
    }
}
