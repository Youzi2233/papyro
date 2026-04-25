use crate::commands::AppCommands;
use crate::context::EditorServices;
use dioxus::prelude::*;
use papyro_core::{EditorTabs, TabContentsMap};
use std::time::Duration;

pub(super) fn record_content_change(
    mut editor_tabs: Signal<EditorTabs>,
    mut tab_contents: Signal<TabContentsMap>,
    commands: AppCommands,
    editor_services: EditorServices,
    tab_id: String,
    content: String,
    auto_save_delay_ms: u64,
) {
    let revision = papyro_core::change_tab_content(
        &mut editor_tabs.write(),
        &mut tab_contents.write(),
        &tab_id,
        content,
    );

    if let Some(revision) = revision {
        let delay = Duration::from_millis(auto_save_delay_ms);
        spawn(async move {
            tokio::time::sleep(delay).await;
            if papyro_core::should_auto_save(
                &editor_tabs.read(),
                &tab_contents.read(),
                &tab_id,
                revision,
            ) {
                let content = tab_contents
                    .read()
                    .content_for_tab(&tab_id)
                    .unwrap_or_default()
                    .to_string();
                let stats = editor_services.summarize(&content);
                tab_contents.write().refresh_stats(&tab_id, stats);
                commands.save_tab.call(tab_id);
            }
        });
    }
}
