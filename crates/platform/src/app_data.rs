use anyhow::{Context, Result};
use std::path::PathBuf;

pub(crate) fn ensure_app_data_dir(base: Option<PathBuf>) -> Result<PathBuf> {
    let dir = app_data_dir(base);
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("failed to create app data directory {}", dir.display()))?;
    Ok(dir)
}

fn app_data_dir(base: Option<PathBuf>) -> PathBuf {
    base.unwrap_or_else(|| PathBuf::from(".")).join("papyro")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn app_data_dir_uses_system_base_when_available() {
        let dir = app_data_dir(Some(PathBuf::from("base")));

        assert_eq!(dir, PathBuf::from("base").join("papyro"));
    }

    #[test]
    fn app_data_dir_falls_back_to_current_directory() {
        let dir = app_data_dir(None);

        assert_eq!(dir, PathBuf::from(".").join("papyro"));
    }

    #[test]
    fn ensure_app_data_dir_creates_papyro_directory() {
        let base = temp_path("create");
        let expected = base.join("papyro");

        let dir = ensure_app_data_dir(Some(base.clone())).expect("app data dir is created");

        assert_eq!(dir, expected);
        assert!(dir.is_dir());

        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn ensure_app_data_dir_reports_creation_failure() {
        let base = temp_path("file-base");
        fs::write(&base, "not a directory").expect("test base file is written");

        let error = ensure_app_data_dir(Some(base.clone())).expect_err("file base must fail");

        assert!(error
            .to_string()
            .contains("failed to create app data directory"));

        let _ = fs::remove_file(base);
    }

    fn temp_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time is after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "papyro-platform-{label}-{}-{nanos}",
            std::process::id()
        ))
    }
}
