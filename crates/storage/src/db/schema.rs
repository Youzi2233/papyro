use anyhow::{Context, Result};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite_migration::{Migrations, M};
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;

const MIGRATION_SQL_FILES: &[(&str, &str)] =
    &[("V1__init.sql", include_str!("migrations/V1__init.sql"))];

pub fn create_pool(db_path: &Path) -> Result<DbPool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create storage database directory {}", parent.display()))?;
    }
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|conn| conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"));
    let pool = Pool::builder()
        .max_size(4)
        .build(manager)
        .with_context(|| format!("open storage database {}", db_path.display()))?;
    run_migrations(&pool)
        .with_context(|| format!("run storage database migrations for {}", db_path.display()))?;
    Ok(pool)
}

fn run_migrations(pool: &DbPool) -> Result<()> {
    let mut conn = pool.get()?;
    let migrations = Migrations::new(
        MIGRATION_SQL_FILES
            .iter()
            .map(|(_, sql)| M::up(sql))
            .collect(),
    );
    migrations.to_latest(&mut conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    const EXPECTED_TABLES: &[&str] = &[
        "workspaces",
        "notes",
        "tags",
        "note_tags",
        "recent_files",
        "settings",
    ];
    const EXPECTED_INDEXES: &[&str] = &[
        "idx_notes_workspace",
        "idx_notes_updated",
        "idx_notes_favorite",
        "idx_note_tags_note",
        "idx_note_tags_tag",
        "idx_recent_opened",
    ];
    const EXPECTED_NOTE_COLUMNS: &[&str] = &[
        "id",
        "workspace_id",
        "relative_path",
        "title",
        "created_at",
        "updated_at",
        "word_count",
        "char_count",
        "is_favorite",
        "is_trashed",
        "trashed_at",
        "front_matter",
    ];

    #[test]
    fn migrations_are_idempotent() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let db_path = temp.path().join("meta.db");

        let pool = create_pool(&db_path)?;
        drop(pool);
        let pool = create_pool(&db_path)?;

        let conn = pool.get()?;
        assert_schema_contract(&conn)?;

        Ok(())
    }

    #[test]
    fn migrations_upgrade_existing_database_without_dropping_data() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let db_path = temp.path().join("meta.db");
        let conn = Connection::open(&db_path)?;
        conn.execute(
            "CREATE TABLE legacy_marker (id INTEGER PRIMARY KEY, label TEXT NOT NULL)",
            [],
        )?;
        conn.execute(
            "INSERT INTO legacy_marker (id, label) VALUES (1, 'keep')",
            [],
        )?;
        drop(conn);

        let pool = create_pool(&db_path)?;
        let conn = pool.get()?;

        assert_schema_contract(&conn)?;
        let label: String =
            conn.query_row("SELECT label FROM legacy_marker WHERE id = 1", [], |row| {
                row.get(0)
            })?;
        assert_eq!(label, "keep");

        Ok(())
    }

    #[test]
    fn migration_registry_matches_sql_files() -> Result<()> {
        let migrations_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src")
            .join("db")
            .join("migrations");
        let mut migration_files = std::fs::read_dir(migrations_dir)?
            .map(|entry| entry.map(|entry| entry.file_name().to_string_lossy().to_string()))
            .collect::<std::io::Result<Vec<_>>>()?;
        migration_files.retain(|name| name.ends_with(".sql"));
        migration_files.sort();

        let registered_files = MIGRATION_SQL_FILES
            .iter()
            .map(|(name, _)| name.to_string())
            .collect::<Vec<_>>();
        assert_eq!(registered_files, migration_files);

        for (index, name) in registered_files.iter().enumerate() {
            let expected_prefix = format!("V{}__", index + 1);
            assert!(
                name.starts_with(&expected_prefix),
                "migration {name} must use contiguous version prefix {expected_prefix}"
            );
        }

        Ok(())
    }

    #[test]
    fn create_pool_reports_database_directory_context() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let blocker = temp.path().join("not-a-directory");
        std::fs::write(&blocker, "blocks child paths")?;

        let error = create_pool(&blocker.join("meta.db"))
            .expect_err("file parent should block database initialization");

        let message = error.to_string();
        assert!(message.contains("create storage database directory"));
        assert!(message.contains("not-a-directory"));

        Ok(())
    }

    fn assert_schema_contract(conn: &Connection) -> Result<()> {
        let tables = object_names(conn, "table")?;
        for table in EXPECTED_TABLES {
            assert!(
                tables.iter().any(|name| name == table),
                "missing table {table}"
            );
        }

        let indexes = object_names(conn, "index")?;
        for index in EXPECTED_INDEXES {
            assert!(
                indexes.iter().any(|name| name == index),
                "missing index {index}"
            );
        }

        let note_columns = table_columns(conn, "notes")?;
        for column in EXPECTED_NOTE_COLUMNS {
            assert!(
                note_columns.iter().any(|name| name == column),
                "missing notes column {column}"
            );
        }

        let foreign_keys_enabled: i64 =
            conn.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
        assert_eq!(foreign_keys_enabled, 1);

        Ok(())
    }

    fn object_names(conn: &Connection, object_type: &str) -> Result<Vec<String>> {
        let mut stmt = conn.prepare(
            "SELECT name FROM sqlite_master WHERE type = ?1 AND name NOT LIKE 'sqlite_%'",
        )?;
        let rows = stmt.query_map([object_type], |row| row.get(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn table_columns(conn: &Connection, table: &str) -> Result<Vec<String>> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let rows = stmt.query_map([], |row| row.get(1))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}
