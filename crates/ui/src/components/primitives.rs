use dioxus::prelude::*;

#[component]
pub fn IconButton(label: String, icon: String, on_click: EventHandler<()>) -> Element {
    rsx! {
        button {
            class: "mn-icon-btn",
            title: "{label}",
            "aria-label": "{label}",
            onclick: move |_| on_click.call(()),
            "{icon}"
        }
    }
}
