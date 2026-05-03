use dioxus::prelude::*;

mod buttons;
mod empty;
mod feedback;
mod forms;
mod layout;
mod navigation;
mod overlays;
mod results;
mod settings;

pub use buttons::{ActionButton, Button, ButtonState, ButtonVariant, IconButton, RowActionButton};
pub use empty::{EmptyRecentItem, EmptyState, EmptyStateCopy, EmptyStateSurface};
pub use feedback::{
    ErrorState, InlineAlert, InlineAlertTone, Message, SkeletonRows, StatusIndicator,
    StatusMessage, StatusStrip, StatusTone,
};
pub use forms::{
    Dropdown, DropdownOption, FormField, SegmentedControl, SegmentedControlOption, Select, Slider,
    Switch, TextInput, Toggle,
};
pub use layout::{
    AppShell, EditorToolButton, EditorToolbar, MainColumn, ScrollContainer, ToolbarZone,
    ToolbarZoneKind, Workbench,
};
pub use navigation::{
    SidebarItem, TreeItemButton, TreeItemEditRow, TreeItemIconKind, TreeItemKind, TreeItemLabel,
};
pub use overlays::{
    ContextMenu, Menu, MenuItem, MenuSeparator, Modal, ModalCloseButton, ModalHeader, Tooltip,
};
pub use results::{
    ComparePanel, ModalFooterMeta, ResultList, ResultRow, ResultRowKind, RowActions,
};
pub use settings::{
    DialogSection, SettingsContent, SettingsInlineRow, SettingsInlineRowKind, SettingsLayout,
    SettingsNav, SettingsNavItem, SettingsPanel, SettingsRow,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TabOption {
    pub label: String,
    pub value: String,
}

impl TabOption {
    pub fn new(label: &str, value: &str) -> Self {
        Self {
            label: label.to_string(),
            value: value.to_string(),
        }
    }
}

fn tab_option_class(is_selected: bool) -> &'static str {
    if is_selected {
        "mn-tabs-option active"
    } else {
        "mn-tabs-option"
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

#[cfg(test)]
mod tests;
