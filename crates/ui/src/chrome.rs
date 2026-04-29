use crate::commands::{AppCommands, ChromeTrigger, SetViewModeRequest};
use papyro_core::models::ViewMode;

pub(crate) fn toggle_sidebar(commands: AppCommands, trigger: &'static str) {
    commands.toggle_sidebar.call(ChromeTrigger::new(trigger));
}

pub(crate) fn toggle_theme(commands: AppCommands) {
    commands.toggle_theme.call(());
}

pub(crate) fn set_view_mode(commands: AppCommands, mode: ViewMode, trigger: &'static str) {
    commands
        .set_view_mode
        .call(SetViewModeRequest::new(mode, trigger));
}

pub(crate) fn set_sidebar_width(commands: AppCommands, width: u32) {
    commands.set_sidebar_width.call(width);
}
