use anyhow::Error;
use papyro_core::SaveConflict;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SaveFailureContext {
    Normal,
    WorkspaceSwitch,
    Shutdown,
}

pub(crate) fn save_failure_message(context: SaveFailureContext, error: &Error) -> String {
    if error.downcast_ref::<SaveConflict>().is_some() {
        return match context {
            SaveFailureContext::Normal => {
                "File changed on disk. Reload, overwrite, or save as.".to_string()
            }
            SaveFailureContext::WorkspaceSwitch => {
                "File changed on disk. Resolve conflict before switching workspace.".to_string()
            }
            SaveFailureContext::Shutdown => {
                "File changed on disk. Resolve conflict before closing.".to_string()
            }
        };
    }

    match context {
        SaveFailureContext::Normal => format!("Save failed: {error}"),
        SaveFailureContext::WorkspaceSwitch => {
            format!("Save failed before switching workspace: {error}")
        }
        SaveFailureContext::Shutdown => format!("Save failed before shutdown: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::anyhow;
    use std::path::PathBuf;

    #[test]
    fn save_conflict_message_is_actionable() {
        let error = Error::new(SaveConflict {
            path: PathBuf::from("notes/draft.md"),
        });

        assert_eq!(
            save_failure_message(SaveFailureContext::Normal, &error),
            "File changed on disk. Reload, overwrite, or save as."
        );
    }

    #[test]
    fn save_conflict_message_keeps_context() {
        let error = Error::new(SaveConflict {
            path: PathBuf::from("notes/draft.md"),
        });

        assert_eq!(
            save_failure_message(SaveFailureContext::WorkspaceSwitch, &error),
            "File changed on disk. Resolve conflict before switching workspace."
        );
        assert_eq!(
            save_failure_message(SaveFailureContext::Shutdown, &error),
            "File changed on disk. Resolve conflict before closing."
        );
    }

    #[test]
    fn non_conflict_save_error_keeps_error_detail() {
        let error = anyhow!("disk is full");

        assert_eq!(
            save_failure_message(SaveFailureContext::Normal, &error),
            "Save failed: disk is full"
        );
    }
}
