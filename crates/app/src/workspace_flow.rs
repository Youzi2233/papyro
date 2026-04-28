mod create;
mod delete;
mod move_path;
mod open;
mod reload;
mod rename;
mod save;
mod utils;

#[cfg(test)]
mod support;
#[cfg(test)]
mod tests;

pub(crate) use create::{create_folder_in_storage, create_note_in_storage};
pub(crate) use delete::{delete_selected_path, empty_trash, restore_trashed_note};
pub(crate) use move_path::move_selected_path;
pub(crate) use open::{
    open_markdown_from_storage, open_note_from_storage, open_recent_file_from_storage,
};
pub(crate) use reload::{
    apply_workspace_bootstrap, reload_workspace_or_bootstrap, WorkspaceReloadOutcome,
};
pub(crate) use rename::rename_selected_path;
#[cfg(test)]
pub(crate) use save::save_tab_to_storage;
pub(crate) use save::{
    apply_save_failure, apply_save_success, begin_save_tab, write_save_snapshot, SaveTabSnapshot,
};
pub(crate) use utils::normalized_name;
