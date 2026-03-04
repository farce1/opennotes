ALTER TABLE meetings ADD COLUMN post_processing_status TEXT
    CHECK(post_processing_status IN ('processing', 'failed', 'complete'))
    DEFAULT NULL;
