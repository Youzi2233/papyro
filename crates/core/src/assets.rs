use crate::models::Workspace;
use std::path::PathBuf;

pub const WORKSPACE_ASSETS_DIR_NAME: &str = "assets";

pub fn workspace_assets_dir(workspace: &Workspace) -> PathBuf {
    workspace.path.join(WORKSPACE_ASSETS_DIR_NAME)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_assets_dir_uses_workspace_root() {
        let workspace = Workspace {
            id: "workspace".to_string(),
            name: "Workspace".to_string(),
            path: PathBuf::from("workspace"),
            created_at: 0,
            last_opened: None,
            sort_order: 0,
        };

        assert_eq!(
            workspace_assets_dir(&workspace),
            PathBuf::from("workspace/assets")
        );
    }
}
