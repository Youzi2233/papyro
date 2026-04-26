use dioxus::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ButtonVariant {
    Default,
    Primary,
    Danger,
}

impl ButtonVariant {
    fn class(self) -> &'static str {
        match self {
            Self::Default => "mn-button",
            Self::Primary => "mn-button primary",
            Self::Danger => "mn-button danger",
        }
    }
}

#[component]
pub fn Button(
    label: String,
    variant: ButtonVariant,
    disabled: bool,
    on_click: EventHandler<()>,
) -> Element {
    let class = variant.class();

    rsx! {
        button {
            class,
            disabled,
            onclick: move |_| on_click.call(()),
            "{label}"
        }
    }
}

#[component]
pub fn IconButton(label: String, icon: String, on_click: EventHandler<()>) -> Element {
    rsx! {
        Tooltip { label: label.clone(),
            button {
                class: "mn-icon-btn",
                title: "{label}",
                "aria-label": "{label}",
                onclick: move |_| on_click.call(()),
                "{icon}"
            }
        }
    }
}

#[component]
pub fn Modal(
    label: String,
    class_name: String,
    on_close: EventHandler<()>,
    children: Element,
) -> Element {
    rsx! {
        div {
            class: "mn-modal-overlay",
            onclick: move |_| on_close.call(()),
            div {
                class: "{class_name}",
                role: "dialog",
                "aria-modal": "true",
                "aria-label": "{label}",
                onclick: move |event| event.stop_propagation(),
                {children}
            }
        }
    }
}

#[component]
pub fn Tooltip(label: String, children: Element) -> Element {
    rsx! {
        span {
            class: "mn-tooltip",
            "data-tooltip": "{label}",
            {children}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn button_variant_maps_to_existing_classes() {
        assert_eq!(ButtonVariant::Default.class(), "mn-button");
        assert_eq!(ButtonVariant::Primary.class(), "mn-button primary");
        assert_eq!(ButtonVariant::Danger.class(), "mn-button danger");
    }
}
