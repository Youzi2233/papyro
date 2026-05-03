use dioxus::prelude::*;

use super::append_class;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolbarZoneKind {
    Flexible,
    Fixed,
}

pub(super) fn app_shell_class(class_name: &str) -> String {
    append_class("mn-shell", class_name)
}

pub(super) fn workbench_class(class_name: &str) -> String {
    append_class("mn-workbench", class_name)
}

pub(super) fn toolbar_zone_class(kind: ToolbarZoneKind, class_name: &str) -> String {
    let base = match kind {
        ToolbarZoneKind::Flexible => "mn-editor-tabs-row",
        ToolbarZoneKind::Fixed => "mn-editor-tools",
    };
    append_class(base, class_name)
}

pub(super) fn editor_tool_button_class(selected: bool, class_name: &str) -> String {
    let base = if selected {
        "mn-editor-tool icon-only active"
    } else {
        "mn-editor-tool icon-only"
    };
    append_class(base, class_name)
}

pub(super) fn editor_tab_scroll_button_class(class_name: &str) -> String {
    append_class("mn-tab-scroll-btn", class_name)
}

pub(super) fn resize_rail_class(is_resizing: bool, class_name: &str) -> String {
    let base = if is_resizing {
        "mn-resize-rail resizing"
    } else {
        "mn-resize-rail"
    };
    append_class(base, class_name)
}

pub(super) fn resize_rail_overlay_class(class_name: &str) -> String {
    append_class("mn-resize-rail-overlay", class_name)
}

pub(super) fn scroll_container_class(class_name: &str) -> String {
    append_class("mn-scroll-container", class_name)
}

#[component]
pub fn AppShell(class_name: String, children: Element) -> Element {
    let class = app_shell_class(&class_name);

    rsx! {
        div { class, {children} }
    }
}

#[component]
pub fn Workbench(class_name: String, children: Element) -> Element {
    let class = workbench_class(&class_name);

    rsx! {
        div { class, {children} }
    }
}

#[component]
pub fn MainColumn(children: Element) -> Element {
    rsx! {
        div { class: "mn-main-column", {children} }
    }
}

#[component]
pub fn EditorToolbar(children: Element) -> Element {
    rsx! {
        div { class: "mn-editor-chrome", {children} }
    }
}

#[component]
pub fn ToolbarZone(kind: ToolbarZoneKind, class_name: String, children: Element) -> Element {
    let class = toolbar_zone_class(kind, &class_name);

    rsx! {
        div { class, {children} }
    }
}

#[component]
pub fn EditorToolButton(
    label: String,
    class_name: String,
    icon_class: String,
    disabled: bool,
    selected: bool,
    on_click: EventHandler<()>,
) -> Element {
    let class = editor_tool_button_class(selected, &class_name);

    rsx! {
        button {
            class,
            title: "{label}",
            "aria-label": "{label}",
            disabled,
            onclick: move |_| on_click.call(()),
            span { class: "{icon_class}", "aria-hidden": "true" }
        }
    }
}

#[component]
pub fn EditorTabScrollButton(
    label: String,
    icon_class: String,
    class_name: String,
    on_click: EventHandler<()>,
) -> Element {
    let class = editor_tab_scroll_button_class(&class_name);

    rsx! {
        button {
            class,
            title: "{label}",
            "aria-label": "{label}",
            onclick: move |_| on_click.call(()),
            span { class: "{icon_class}", "aria-hidden": "true" }
        }
    }
}

#[component]
pub fn ResizeRail(
    label: String,
    class_name: String,
    overlay_class_name: String,
    is_resizing: bool,
    on_start: EventHandler<MouseEvent>,
    on_drag: EventHandler<MouseEvent>,
    on_end: EventHandler<MouseEvent>,
) -> Element {
    let class = resize_rail_class(is_resizing, &class_name);
    let overlay_class = resize_rail_overlay_class(&overlay_class_name);

    rsx! {
        div {
            class,
            title: "{label}",
            "aria-label": "{label}",
            role: "separator",
            "aria-orientation": "vertical",
            onmousedown: move |event| on_start.call(event),
        }
        if is_resizing {
            div {
                class: "{overlay_class}",
                onmousemove: move |event| on_drag.call(event),
                onmouseup: move |event| on_end.call(event),
            }
        }
    }
}

#[component]
pub fn ScrollContainer(class_name: String, children: Element) -> Element {
    let class = scroll_container_class(&class_name);

    rsx! {
        div { class, {children} }
    }
}
