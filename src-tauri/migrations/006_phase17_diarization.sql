-- Speaker turn segments (raw diarization output)
CREATE TABLE IF NOT EXISTS speaker_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker_index INTEGER NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Speaker display names (one row per speaker per meeting)
CREATE TABLE IF NOT EXISTS speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker_index INTEGER NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    color_index INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meeting_id, speaker_index)
);

-- Link each transcript segment to its diarized speaker
ALTER TABLE transcripts ADD COLUMN speaker_id INTEGER DEFAULT NULL
    REFERENCES speakers(id);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_speaker_turns_meeting ON speaker_turns(meeting_id);
CREATE INDEX IF NOT EXISTS idx_speakers_meeting ON speakers(meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_speaker ON transcripts(speaker_id);

-- Track diarization status per meeting
ALTER TABLE meetings ADD COLUMN diarization_status TEXT DEFAULT NULL
    CHECK(diarization_status IN ('running', 'complete', 'failed'));
