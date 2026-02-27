use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqliteJournalMode, SqlitePool};
use std::str::FromStr;

pub async fn init_pool(db_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(db_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal);

    SqlitePool::connect_with(options).await
}
