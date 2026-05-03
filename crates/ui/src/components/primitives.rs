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
    AppShell, EditorTabScrollButton, EditorToolButton, EditorToolbar, MainColumn, ScrollContainer,
    ToolbarZone, ToolbarZoneKind, Workbench,
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

#[cfg(test)]
mod tests;
