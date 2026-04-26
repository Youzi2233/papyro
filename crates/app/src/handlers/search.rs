use dioxus::prelude::*;
use papyro_core::{FileState, NoteStorage, WorkspaceSearchQuery, WorkspaceSearchState};
use std::sync::Arc;

const WORKSPACE_SEARCH_LIMIT: usize = 50;

pub fn search_workspace(
    storage: Arc<dyn NoteStorage>,
    file_state: Signal<FileState>,
    mut workspace_search: Signal<WorkspaceSearchState>,
    query: String,
) {
    workspace_search.write().start(query.clone());

    if query.trim().is_empty() {
        return;
    }

    let workspace = file_state.read().current_workspace.clone();
    let Some(workspace) = workspace else {
        workspace_search.write().fail(
            &query,
            "Open a workspace before searching notes".to_string(),
        );
        return;
    };

    spawn(async move {
        let search_query = query.clone();
        let parsed_query = WorkspaceSearchQuery::from_input(&search_query, WORKSPACE_SEARCH_LIMIT);
        let result = tokio::task::spawn_blocking(move || {
            storage.search_workspace_with_query(&workspace, &parsed_query)
        })
        .await;

        match result {
            Ok(Ok(results)) => {
                workspace_search.write().finish(&query, results);
            }
            Ok(Err(error)) => {
                workspace_search
                    .write()
                    .fail(&query, format!("Search failed: {error}"));
            }
            Err(error) => {
                workspace_search
                    .write()
                    .fail(&query, format!("Search failed: {error}"));
            }
        }
    });
}
