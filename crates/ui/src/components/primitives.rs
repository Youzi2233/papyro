mod buttons;
mod empty;
mod feedback;
mod forms;
mod layout;
mod navigation;
mod overlays;
mod results;
mod settings;
mod tabs;

pub use buttons::{ActionButton, Button, ButtonState, ButtonVariant, IconButton, RowActionButton};
pub use empty::{EmptyRecentItem, EmptyState, EmptyStateCopy, EmptyStateSurface};
pub use feedback::{
    ErrorState, InlineAlert, InlineAlertTone, Message, SkeletonRows, StatusIndicator,
    StatusMessage, StatusStrip, StatusTone,
};
pub use forms::{
    ColorInput, Dropdown, DropdownOption, FormField, SegmentedControl, SegmentedControlOption,
    Select, Slider, Switch, TextInput, Toggle,
};
pub use layout::{
    AppShell, EditorTabScrollButton, EditorToolButton, EditorToolbar, MainColumn, ResizeRail,
    ScrollContainer, ToolbarZone, ToolbarZoneKind, Workbench,
};
pub use navigation::{
    OutlineItemButton, SidebarItem, SidebarSearchButton, TreeItemButton, TreeItemEditRow,
    TreeItemIconKind, TreeItemKind, TreeItemLabel, TreeRenameInput,
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
pub use tabs::{DocumentTab, TabOption, Tabs};

fn append_class(base: &str, class_name: &str) -> String {
    let trimmed = class_name.trim();
    if trimmed.is_empty() {
        base.to_string()
    } else {
        format!("{base} {trimmed}")
    }
}

struct ClassBuilder {
    classes: Vec<&'static str>,
}

impl ClassBuilder {
    fn new(base: &'static str) -> Self {
        Self {
            classes: vec![base],
        }
    }

    fn when(mut self, condition: bool, class_name: &'static str) -> Self {
        if condition {
            self.classes.push(class_name);
        }
        self
    }

    fn push(mut self, class_name: &'static str) -> Self {
        self.classes.push(class_name);
        self
    }

    fn extend(self, class_name: &str) -> String {
        append_class(&self.classes.join(" "), class_name)
    }

    fn extend_when(self, class_name: &str, condition: bool, state_class: &'static str) -> String {
        let state_class = if condition { state_class } else { "" };
        append_class(&self.extend(class_name), state_class)
    }
}

#[cfg(test)]
mod tests;
