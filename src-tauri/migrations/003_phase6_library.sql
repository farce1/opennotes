-- Soft-delete lifecycle support
ALTER TABLE meetings ADD COLUMN deleted_at DATETIME DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_deleted_at ON meetings(deleted_at);

-- Full-text search index for meeting title + transcript content.
CREATE VIRTUAL TABLE IF NOT EXISTS meetings_fts USING fts5(
    title,
    transcript_text,
    content='',
    tokenize='unicode61'
);

-- Initial index population for existing active meetings.
INSERT INTO meetings_fts(rowid, title, transcript_text)
SELECT
    m.id,
    m.title,
    COALESCE((
        SELECT GROUP_CONCAT(t.text, ' ')
        FROM transcripts t
        WHERE t.meeting_id = m.id
        ORDER BY t.segment_index
    ), '')
FROM meetings m
WHERE m.deleted_at IS NULL;
