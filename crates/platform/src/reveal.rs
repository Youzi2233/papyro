use anyhow::{Context, Result};
use std::path::Path;

pub(crate) fn reveal_path(path: &Path) -> Result<()> {
    reveal_path_with(path, |path| {
        open::that(path)?;
        Ok(())
    })
}

fn reveal_path_with(path: &Path, open: impl FnOnce(&Path) -> Result<()>) -> Result<()> {
    open(path).with_context(|| format!("failed to open {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, path::PathBuf};

    #[test]
    fn reveal_path_with_forwards_target_path() {
        let seen = RefCell::new(None);
        let target = Path::new("workspace/note.md");

        reveal_path_with(target, |path| {
            *seen.borrow_mut() = Some(path.to_path_buf());
            Ok(())
        })
        .expect("path reveal succeeds");

        assert_eq!(*seen.borrow(), Some(PathBuf::from("workspace/note.md")));
    }

    #[test]
    fn reveal_path_with_adds_target_context_to_errors() {
        let error = reveal_path_with(Path::new("workspace/missing.md"), |_| {
            anyhow::bail!("platform open failed")
        })
        .expect_err("platform open failure is reported");

        let message = format!("{error:#}");
        assert!(message.contains("failed to open workspace/missing.md"));
        assert!(message.contains("platform open failed"));
    }
}
