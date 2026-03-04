use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqliteJournalMode, SqlitePool};
use std::str::FromStr;

pub async fn init_pool(db_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(db_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal);

    let pool = SqlitePool::connect_with(options).await?;
    run_migrations(&pool).await?;
    Ok(pool)
}

async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _app_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    // Backfill tracking for databases previously migrated by tauri-plugin-sql
    let tracked_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _app_migrations")
        .fetch_one(pool)
        .await?;

    if tracked_count == 0 {
        let existing = detect_schema_version(pool).await?;
        for v in 1..=existing {
            sqlx::query("INSERT INTO _app_migrations (version) VALUES (?)")
                .bind(v)
                .execute(pool)
                .await?;
        }
    }

    let applied: Vec<i64> = sqlx::query_scalar("SELECT version FROM _app_migrations")
        .fetch_all(pool)
        .await?;

    let migrations: &[(i64, &str)] = &[
        (1, include_str!("../migrations/001_initial.sql")),
        (2, include_str!("../migrations/002_phase4_session.sql")),
        (3, include_str!("../migrations/003_phase6_library.sql")),
        (4, include_str!("../migrations/004_phase14_post_processing.sql")),
    ];

    for &(version, sql) in migrations {
        if applied.contains(&version) {
            continue;
        }
        let mut tx = pool.begin().await?;
        for statement in sql.split(';') {
            let stmt = statement.trim();
            if stmt.is_empty() {
                continue;
            }
            sqlx::query(stmt).execute(&mut *tx).await?;
        }
        sqlx::query("INSERT INTO _app_migrations (version) VALUES (?)")
            .bind(version)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
    }

    Ok(())
}

/// Detect how far the schema has been migrated by inspecting table structure.
/// Handles databases previously migrated by tauri-plugin-sql (before we tracked
/// migrations in `_app_migrations`).
async fn detect_schema_version(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    let has_meetings: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='meetings'",
    )
    .fetch_one(pool)
    .await?;

    if has_meetings == 0 {
        return Ok(0);
    }

    // post_processing_status column added in migration 4
    let has_post_processing_status: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('meetings') WHERE name='post_processing_status'",
    )
    .fetch_one(pool)
    .await?;

    if has_post_processing_status > 0 {
        return Ok(4);
    }

    // deleted_at column added in migration 3
    let has_deleted_at: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('meetings') WHERE name='deleted_at'",
    )
    .fetch_one(pool)
    .await?;

    if has_deleted_at > 0 {
        return Ok(3);
    }

    // audio_path column added in migration 2
    let has_audio_path: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('meetings') WHERE name='audio_path'",
    )
    .fetch_one(pool)
    .await?;

    if has_audio_path > 0 {
        return Ok(2);
    }

    Ok(1)
}
