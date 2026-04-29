use crate::{create_pool, SqliteStorage};
use anyhow::Result;
use papyro_core::models::{AppSettings, NoteOpenMode};

fn test_storage(db_path: &std::path::Path) -> Result<SqliteStorage> {
    Ok(SqliteStorage::from_pool(
        create_pool(db_path)?,
        db_path.to_path_buf(),
    ))
}

#[test]
fn app_settings_note_open_mode_survives_storage_restart() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let db_path = temp.path().join("meta.db");
    let storage = test_storage(&db_path)?;
    let settings = AppSettings {
        note_open_mode: NoteOpenMode::MultiWindow,
        ..AppSettings::default()
    };

    storage.save_settings(&settings)?;

    let restarted_storage = test_storage(&db_path)?;
    let loaded = restarted_storage.load_settings();

    assert_eq!(loaded.note_open_mode, NoteOpenMode::MultiWindow);

    Ok(())
}
