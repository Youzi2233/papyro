use dioxus::prelude::*;

use super::{ClassBuilder, PrimitiveState};

pub(super) fn empty_state_card_class(onboarding: bool, class_name: &str) -> String {
    ClassBuilder::new("mn-empty-card")
        .state_when(onboarding, PrimitiveState::Onboarding)
        .extend(class_name)
}

#[component]
pub fn EmptyState(title: String, description: String) -> Element {
    rsx! {
        EmptyStateSurface {
            onboarding: false,
            class_name: String::new(),
            h1 { "{title}" }
            p { "{description}" }
        }
    }
}

#[component]
pub fn EmptyStateSurface(onboarding: bool, class_name: String, children: Element) -> Element {
    let card_class = empty_state_card_class(onboarding, &class_name);

    rsx! {
        section { class: "mn-empty",
            div { class: card_class,
                {children}
            }
        }
    }
}

#[component]
pub fn EmptyStateCopy(title: String, description: String) -> Element {
    rsx! {
                h1 { "{title}" }
                p { "{description}" }
    }
}

#[component]
pub fn EmptyRecentItem(
    name: String,
    detail: String,
    title: String,
    on_click: EventHandler<()>,
) -> Element {
    rsx! {
        button {
            class: "mn-empty-recent-item",
            title: "{title}",
            onclick: move |_| on_click.call(()),
            span { class: "mn-empty-recent-name", "{name}" }
            span { class: "mn-empty-recent-path", "{detail}" }
        }
    }
}
