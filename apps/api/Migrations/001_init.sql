CREATE TABLE IF NOT EXISTS journeys (
    id TEXT PRIMARY KEY,
    oyster_card_id TEXT NOT NULL,
    start_station TEXT NOT NULL,
    end_station TEXT NOT NULL,
    started_at_utc TEXT NOT NULL,
    ended_at_utc TEXT NOT NULL,
    fare REAL NOT NULL,
    raw_source TEXT NOT NULL,
    imported_at_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journeys_started_at ON journeys(started_at_utc DESC);
