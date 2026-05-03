use dioxus::prelude::*;

use super::{append_class, ClassBuilder, Tooltip};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ButtonVariant {
    Default,
    Primary,
    Danger,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ButtonState {
    Enabled,
    Disabled,
    Loading,
}

impl ButtonVariant {
    pub(super) fn class(self) -> &'static str {
        match self {
            Self::Default => "mn-button",
            Self::Primary => "mn-button primary",
            Self::Danger => "mn-button danger",
        }
    }
}

impl ButtonState {
    pub(super) fn is_disabled(self) -> bool {
        matches!(self, Self::Disabled | Self::Loading)
    }
}

pub(super) fn action_button_class(variant: ButtonVariant, class_name: &str) -> String {
    let base = variant.class();
    append_class(base, class_name)
}

pub(super) fn icon_button_class(selected: bool, danger: bool, class_name: &str) -> String {
    ClassBuilder::new("mn-icon-btn")
        .when(selected, "active")
        .when(danger, "danger")
        .extend(class_name)
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
pub fn ActionButton(
    label: String,
    variant: ButtonVariant,
    state: ButtonState,
    icon_class: Option<String>,
    title: Option<String>,
    class_name: String,
    on_click: EventHandler<()>,
) -> Element {
    let class = action_button_class(variant, &class_name);
    let is_loading = state == ButtonState::Loading;

    rsx! {
        button {
            class,
            disabled: state.is_disabled(),
            title: title.as_deref(),
            "aria-busy": if is_loading { "true" } else { "false" },
            onclick: move |_| on_click.call(()),
            if let Some(icon_class) = icon_class {
                span { class: "{icon_class}", "aria-hidden": "true" }
            }
            span { "{label}" }
        }
    }
}

#[component]
pub fn RowActionButton(
    label: String,
    variant: ButtonVariant,
    state: ButtonState,
    class_name: String,
    on_click: EventHandler<()>,
) -> Element {
    let class = action_button_class(variant, &class_name);
    let is_loading = state == ButtonState::Loading;

    rsx! {
        button {
            class,
            disabled: state.is_disabled(),
            "aria-busy": if is_loading { "true" } else { "false" },
            onclick: move |event| {
                event.stop_propagation();
                on_click.call(());
            },
            "{label}"
        }
    }
}

#[component]
pub fn IconButton(
    label: String,
    icon: String,
    icon_class: Option<String>,
    class_name: String,
    disabled: bool,
    selected: bool,
    danger: bool,
    on_click: EventHandler<()>,
) -> Element {
    let class = icon_button_class(selected, danger, &class_name);

    rsx! {
        Tooltip { label: label.clone(),
            button {
                class,
                disabled,
                "aria-label": "{label}",
                "aria-pressed": selected.then_some("true"),
                onclick: move |_| on_click.call(()),
                if let Some(icon_class) = icon_class {
                    span { class: "{icon_class}", "aria-hidden": "true" }
                } else {
                    "{icon}"
                }
            }
        }
    }
}
