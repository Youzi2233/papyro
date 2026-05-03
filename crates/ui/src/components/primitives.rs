use dioxus::prelude::*;

mod feedback;
mod layout;
mod settings;

pub use feedback::{
    ErrorState, InlineAlert, InlineAlertTone, Message, SkeletonRows, StatusIndicator,
    StatusMessage, StatusStrip, StatusTone,
};
pub use layout::{
    AppShell, EditorToolButton, EditorToolbar, MainColumn, ScrollContainer, ToolbarZone,
    ToolbarZoneKind, Workbench,
};
pub use settings::{
    DialogSection, SettingsContent, SettingsInlineRow, SettingsInlineRowKind, SettingsLayout,
    SettingsNav, SettingsNavItem, SettingsPanel, SettingsRow,
};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResultRowKind {
    Default,
    Search,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TreeItemKind {
    Directory,
    Note,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TreeItemIconKind {
    Folder,
    FolderOpen,
    Markdown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SegmentedControlOption {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DropdownOption {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TabOption {
    pub label: String,
    pub value: String,
}

impl SegmentedControlOption {
    pub fn new(label: &str, value: &str) -> Self {
        Self {
            label: label.to_string(),
            value: value.to_string(),
        }
    }
}

impl DropdownOption {
    pub fn new(label: &str, value: &str) -> Self {
        Self {
            label: label.to_string(),
            value: value.to_string(),
        }
    }
}

impl TabOption {
    pub fn new(label: &str, value: &str) -> Self {
        Self {
            label: label.to_string(),
            value: value.to_string(),
        }
    }
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

impl ButtonState {
    fn is_disabled(self) -> bool {
        matches!(self, Self::Disabled | Self::Loading)
    }
}

fn segmented_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-segmented-option active"
    } else {
        "mn-segmented-option"
    }
}

fn tab_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-tabs-option active"
    } else {
        "mn-tabs-option"
    }
}

fn dropdown_class(is_open: bool) -> &'static str {
    if is_open {
        "mn-select open"
    } else {
        "mn-select"
    }
}

fn dropdown_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-select-option active"
    } else {
        "mn-select-option"
    }
}

fn dropdown_selected_label(options: &[DropdownOption], selected: &str) -> String {
    options
        .iter()
        .find(|option| option.value == selected)
        .map(|option| option.label.clone())
        .unwrap_or_else(|| selected.to_string())
}

fn dropdown_id_suffix(value: &str) -> String {
    let suffix = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if suffix.is_empty() {
        "value".to_string()
    } else {
        suffix
    }
}

fn dropdown_list_id(label: &str, selected: &str) -> String {
    format!(
        "mn-select-{}-{}",
        dropdown_id_suffix(label),
        dropdown_id_suffix(selected)
    )
}

fn menu_item_class(danger: bool) -> &'static str {
    if danger {
        "mn-menu-item danger"
    } else {
        "mn-menu-item"
    }
}

fn form_field_class(class_name: &str) -> String {
    append_class("mn-form-field mn-setting-row", class_name)
}

fn result_row_class(kind: ResultRowKind, is_active: bool) -> &'static str {
    match (kind, is_active) {
        (ResultRowKind::Default, false) => "mn-command-row",
        (ResultRowKind::Default, true) => "mn-command-row active",
        (ResultRowKind::Search, false) => "mn-command-row mn-search-row",
        (ResultRowKind::Search, true) => "mn-command-row mn-search-row active",
    }
}

fn action_button_class(variant: ButtonVariant, class_name: &str) -> String {
    let base = variant.class();
    let trimmed = class_name.trim();
    if trimmed.is_empty() {
        base.to_string()
    } else {
        format!("{base} {trimmed}")
    }
}

fn icon_button_class(selected: bool, danger: bool, class_name: &str) -> String {
    let mut classes = vec!["mn-icon-btn"];
    if selected {
        classes.push("active");
    }
    if danger {
        classes.push("danger");
    }
    let class = classes.join(" ");
    append_class(&class, class_name)
}

fn empty_state_card_class(onboarding: bool, class_name: &str) -> String {
    let base = if onboarding {
        "mn-empty-card onboarding"
    } else {
        "mn-empty-card"
    };
    append_class(base, class_name)
}

fn sidebar_item_class(selected: bool, class_name: &str) -> String {
    let base = if selected {
        "mn-sidebar-workspace active"
    } else {
        "mn-sidebar-workspace"
    };
    append_class(base, class_name)
}

fn tree_item_class(
    kind: TreeItemKind,
    is_selected: bool,
    is_editing: bool,
    is_dragging: bool,
    is_drop_target: bool,
) -> String {
    let kind_class = match kind {
        TreeItemKind::Directory => "directory",
        TreeItemKind::Note => "note",
    };
    let mut classes = vec!["mn-tree-row", kind_class];
    if is_selected {
        classes.push("active");
    }
    if is_editing {
        classes.push("editing");
    }
    if is_dragging {
        classes.push("dragging");
    }
    if is_drop_target {
        classes.push("drop-target");
    }
    classes.join(" ")
}

fn tree_caret_class(is_expanded: bool) -> &'static str {
    if is_expanded {
        "mn-tree-caret expanded"
    } else {
        "mn-tree-caret"
    }
}

fn tree_icon_class(kind: TreeItemIconKind) -> &'static str {
    match kind {
        TreeItemIconKind::Folder => "mn-tree-icon folder",
        TreeItemIconKind::FolderOpen => "mn-tree-icon folder-open",
        TreeItemIconKind::Markdown => "mn-tree-icon markdown",
    }
}

fn append_class(base: &str, class_name: &str) -> String {
    let trimmed = class_name.trim();
    if trimmed.is_empty() {
        base.to_string()
    } else {
        format!("{base} {trimmed}")
    }
}

#[component]
pub fn SidebarItem(
    label: String,
    value: String,
    title: String,
    selected: bool,
    class_name: String,
    on_click: Option<EventHandler<MouseEvent>>,
    on_context_menu: Option<EventHandler<MouseEvent>>,
) -> Element {
    let class = sidebar_item_class(selected, &class_name);

    if let Some(on_click) = on_click {
        rsx! {
            button {
                r#type: "button",
                class,
                title,
                "aria-pressed": if selected { "true" } else { "false" },
                onclick: move |event| on_click.call(event),
                oncontextmenu: move |event| {
                    if let Some(handler) = &on_context_menu {
                        handler.call(event);
                    }
                },
                span { class: "mn-sidebar-workspace-label", "{label}" }
                span { class: "mn-sidebar-workspace-path", "{value}" }
            }
        }
    } else {
        rsx! {
            div { class, title,
                span { class: "mn-sidebar-workspace-label", "{label}" }
                span { class: "mn-sidebar-workspace-path", "{value}" }
            }
        }
    }
}

#[component]
pub fn TreeItemButton(
    kind: TreeItemKind,
    label: String,
    selected: bool,
    dragging: bool,
    drop_target: bool,
    depth_px: u32,
    expanded: Option<bool>,
    icon: TreeItemIconKind,
    accessible_label: Option<String>,
    on_click: EventHandler<MouseEvent>,
    on_context_menu: EventHandler<MouseEvent>,
    on_drag_start: EventHandler<DragEvent>,
    on_drag_end: EventHandler<DragEvent>,
    on_drag_over: EventHandler<DragEvent>,
    on_drag_leave: EventHandler<DragEvent>,
    on_drop: EventHandler<DragEvent>,
    children: Element,
) -> Element {
    let class = tree_item_class(kind, selected, false, dragging, drop_target);
    let style = format!("padding-left: {depth_px}px");

    rsx! {
        button {
            class,
            style,
            role: "treeitem",
            "aria-label": accessible_label.as_deref().unwrap_or(&label),
            "aria-selected": "{selected}",
            "aria-expanded": expanded.map(|value| if value { "true" } else { "false" }),
            draggable: true,
            onclick: move |event| on_click.call(event),
            oncontextmenu: move |event| on_context_menu.call(event),
            ondragstart: move |event| on_drag_start.call(event),
            ondragend: move |event| on_drag_end.call(event),
            ondragover: move |event| on_drag_over.call(event),
            ondragleave: move |event| on_drag_leave.call(event),
            ondrop: move |event| on_drop.call(event),
            if let Some(expanded) = expanded {
                span { class: tree_caret_class(expanded), "aria-hidden": "true" }
            }
            span { class: tree_icon_class(icon), "aria-hidden": "true" }
            {children}
        }
    }
}

#[component]
pub fn TreeItemEditRow(
    kind: TreeItemKind,
    selected: bool,
    depth_px: u32,
    expanded: Option<bool>,
    icon: TreeItemIconKind,
    children: Element,
) -> Element {
    let class = tree_item_class(kind, selected, true, false, false);
    let style = format!("padding-left: {depth_px}px");

    rsx! {
        div {
            class,
            style,
            role: "treeitem",
            "aria-selected": "{selected}",
            "aria-expanded": expanded.map(|value| if value { "true" } else { "false" }),
            if let Some(expanded) = expanded {
                span { class: tree_caret_class(expanded), "aria-hidden": "true" }
            }
            span { class: tree_icon_class(icon), "aria-hidden": "true" }
            {children}
        }
    }
}

#[component]
pub fn TreeItemLabel(label: String) -> Element {
    rsx! {
        span { class: "mn-tree-label", "{label}" }
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
pub fn FormField(label: String, class_name: String, children: Element) -> Element {
    let class = form_field_class(&class_name);

    rsx! {
        div { class,
            label { class: "mn-form-label mn-setting-label", "{label}" }
            div { class: "mn-form-control mn-setting-control", {children} }
        }
    }
}

#[component]
pub fn SegmentedControl(
    label: String,
    options: Vec<SegmentedControlOption>,
    selected: String,
    class_name: String,
    on_change: EventHandler<String>,
) -> Element {
    let class = if class_name.trim().is_empty() {
        "mn-segmented-control".to_string()
    } else {
        class_name
    };

    rsx! {
        div {
            class: "{class}",
            role: "radiogroup",
            "aria-label": "{label}",
            for option in options {
                button {
                    class: segmented_option_class(option.value == selected),
                    r#type: "button",
                    role: "radio",
                    "aria-checked": if option.value == selected { "true" } else { "false" },
                    onclick: {
                        let value = option.value.clone();
                        move |_| on_change.call(value.clone())
                    },
                    "{option.label}"
                }
            }
        }
    }
}

#[component]
pub fn Dropdown(
    label: String,
    options: Vec<DropdownOption>,
    selected: String,
    on_change: EventHandler<String>,
) -> Element {
    let mut is_open = use_signal(|| false);
    let selected_label = dropdown_selected_label(&options, &selected);
    let list_id = dropdown_list_id(&label, &selected);

    rsx! {
        div {
            class: dropdown_class(is_open()),
            button {
                class: "mn-select-trigger",
                r#type: "button",
                "aria-label": "{label}",
                "aria-haspopup": "listbox",
                "aria-expanded": if is_open() { "true" } else { "false" },
                "aria-controls": "{list_id}",
                onclick: move |_| is_open.set(!is_open()),
                span { class: "mn-select-value", "{selected_label}" }
                span { class: "mn-select-caret", "aria-hidden": "true" }
            }
            if is_open() {
                div {
                    id: "{list_id}",
                    class: "mn-select-list",
                    role: "listbox",
                    "aria-label": "{label}",
                    for option in options {
                        button {
                            class: dropdown_option_class(option.value == selected),
                            r#type: "button",
                            role: "option",
                            "aria-selected": if option.value == selected { "true" } else { "false" },
                            onclick: {
                                let value = option.value.clone();
                                move |_| {
                                    on_change.call(value.clone());
                                    is_open.set(false);
                                }
                            },
                            "{option.label}"
                        }
                    }
                }
            }
        }
    }
}

#[component]
pub fn Select(
    label: String,
    options: Vec<DropdownOption>,
    selected: String,
    on_change: EventHandler<String>,
) -> Element {
    rsx! {
        Dropdown {
            label,
            options,
            selected,
            on_change,
        }
    }
}

#[component]
pub fn Menu(label: String, class_name: String, style: String, children: Element) -> Element {
    rsx! {
        div {
            class: "{class_name}",
            role: "menu",
            "aria-label": "{label}",
            style,
            onclick: move |event| event.stop_propagation(),
            oncontextmenu: move |event| {
                event.prevent_default();
                event.stop_propagation();
            },
            {children}
        }
    }
}

#[component]
pub fn ContextMenu(label: String, class_name: String, style: String, children: Element) -> Element {
    rsx! {
        Menu {
            label,
            class_name,
            style,
            {children}
        }
    }
}

#[component]
pub fn MenuItem(label: String, danger: bool, on_select: EventHandler<()>) -> Element {
    rsx! {
        button {
            class: menu_item_class(danger),
            r#type: "button",
            role: "menuitem",
            onclick: move |_| on_select.call(()),
            "{label}"
        }
    }
}

#[component]
pub fn MenuSeparator() -> Element {
    rsx! {
        div { class: "mn-menu-separator" }
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

#[component]
pub fn Tabs(
    label: String,
    options: Vec<TabOption>,
    selected: String,
    class_name: String,
    on_change: EventHandler<String>,
) -> Element {
    let class = if class_name.trim().is_empty() {
        "mn-tabs".to_string()
    } else {
        class_name
    };

    rsx! {
        div {
            class: "{class}",
            role: "tablist",
            "aria-label": "{label}",
            for option in options {
                button {
                    class: tab_option_class(option.value == selected),
                    r#type: "button",
                    role: "tab",
                    "aria-selected": if option.value == selected { "true" } else { "false" },
                    onclick: {
                        let value = option.value.clone();
                        move |_| on_change.call(value.clone())
                    },
                    "{option.label}"
                }
            }
        }
    }
}

#[component]
pub fn Switch(label: String, checked: bool, on_change: EventHandler<bool>) -> Element {
    rsx! {
        label {
            class: "mn-setting-switch",
            title: "{label}",
            input {
                r#type: "checkbox",
                checked,
                "aria-label": "{label}",
                onchange: move |event| on_change.call(event.checked()),
            }
            span { class: "mn-setting-switch-track",
                span { class: "mn-setting-switch-thumb" }
            }
        }
    }
}

#[component]
pub fn Toggle(label: String, checked: bool, on_change: EventHandler<bool>) -> Element {
    rsx! {
        Switch {
            label,
            checked,
            on_change,
        }
    }
}

#[component]
pub fn Slider(
    label: String,
    value: String,
    min: String,
    max: String,
    step: String,
    on_input: EventHandler<String>,
) -> Element {
    rsx! {
        input {
            class: "mn-range",
            r#type: "range",
            "aria-label": "{label}",
            min: "{min}",
            max: "{max}",
            step: "{step}",
            value: "{value}",
            oninput: move |event| on_input.call(event.value()),
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
pub fn ModalCloseButton(label: String, on_close: EventHandler<()>) -> Element {
    rsx! {
        button {
            class: "mn-modal-close",
            "aria-label": "{label}",
            onclick: move |_| on_close.call(()),
            "x"
        }
    }
}

#[component]
pub fn ModalHeader(title: String, close_label: String, on_close: EventHandler<()>) -> Element {
    rsx! {
        div { class: "mn-modal-header",
            h2 { class: "mn-modal-title", "{title}" }
            ModalCloseButton {
                label: close_label,
                on_close,
            }
        }
    }
}

#[component]
pub fn TextInput(
    class_name: String,
    placeholder: String,
    value: String,
    autofocus: bool,
    on_input: EventHandler<String>,
    on_keydown: EventHandler<KeyboardEvent>,
) -> Element {
    rsx! {
        input {
            class: "{class_name}",
            r#type: "text",
            "aria-label": "{placeholder}",
            autofocus,
            placeholder: "{placeholder}",
            value: "{value}",
            oninput: move |event| on_input.call(event.value()),
            onkeydown: move |event| on_keydown.call(event),
        }
    }
}

#[component]
pub fn ResultRow(
    label: String,
    metadata: String,
    is_active: bool,
    kind: ResultRowKind,
    on_select: EventHandler<()>,
    children: Element,
) -> Element {
    rsx! {
        button {
            class: result_row_class(kind, is_active),
            "aria-label": "{label}",
            onclick: move |_| on_select.call(()),
            span { class: "mn-command-row-main", {children} }
            span { class: "mn-command-kind", "{metadata}" }
        }
    }
}

#[component]
pub fn ResultList(label: String, class_name: String, children: Element) -> Element {
    let class = append_class("mn-command-list", &class_name);

    rsx! {
        div {
            class,
            role: "list",
            "aria-label": "{label}",
            {children}
        }
    }
}

#[component]
pub fn RowActions(class_name: String, children: Element) -> Element {
    let class = append_class("mn-row-actions", &class_name);

    rsx! {
        span { class, {children} }
    }
}

#[component]
pub fn ModalFooterMeta(label: String, class_name: String) -> Element {
    let class = append_class("mn-modal-footer-meta", &class_name);

    rsx! {
        span { class, "{label}" }
    }
}

#[component]
pub fn ComparePanel(
    title: String,
    metadata: String,
    content: String,
    error: Option<String>,
    class_name: String,
) -> Element {
    let class = append_class("mn-compare-panel", &class_name);

    rsx! {
        section { class,
            div { class: "mn-compare-panel-header",
                h3 { "{title}" }
                span { "{metadata}" }
            }
            if let Some(error) = error {
                p { class: "mn-compare-panel-error", "{error}" }
            }
            pre { class: "mn-compare-panel-content",
                code { "{content}" }
            }
        }
    }
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
mod tests;
