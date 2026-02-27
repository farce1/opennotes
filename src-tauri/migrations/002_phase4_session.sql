-- Recreate meetings table with expanded status values and source metadata.
CREATE TABLE IF NOT EXISTS meetings_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'Untitled Meeting',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    duration_seconds INTEGER,
    status TEXT NOT NULL DEFAULT 'recording'
        CHECK(status IN ('recording', 'paused', 'processing', 'completed', 'failed', 'recovered')),
    audio_path TEXT,
    audio_sources TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO meetings_new (
    id,
    title,
    started_at,
    ended_at,
    duration_seconds,
    status,
    audio_path,
    audio_sources,
    created_at,
    updated_at
)
SELECT
    id,
    title,
    started_at,
    ended_at,
    duration_seconds,
    status,
    NULL,
    NULL,
    created_at,
    updated_at
FROM meetings;

DROP TABLE meetings;
ALTER TABLE meetings_new RENAME TO meetings;

CREATE INDEX IF NOT EXISTS idx_meetings_started_at ON meetings(started_at);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
