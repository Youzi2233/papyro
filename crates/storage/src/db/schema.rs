use anyhow::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite_migration::{Migrations, M};
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;

const MIGRATION_SQL: &str = include_str!("migrations/V1__init.sql");

pub fn create_pool(db_path: &Path) -> Result<DbPool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|conn| conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"));
    let pool = Pool::builder().max_size(4).build(manager)?;
    run_migrations(&pool)?;
    Ok(pool)
}

fn run_migrations(pool: &DbPool) -> Result<()> {
    let mut conn = pool.get()?;
    let migrations = Migrations::new(vec![M::up(MIGRATION_SQL)]);
    migrations.to_latest(&mut conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_idempotent() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let db_path = temp.path().join("meta.db");

        let pool = create_pool(&db_path)?;
        drop(pool);
        let pool = create_pool(&db_path)?;

        let conn = pool.get()?;
        let settings_table: String = conn.query_row(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(settings_table, "settings");

        Ok(())
    }
}
