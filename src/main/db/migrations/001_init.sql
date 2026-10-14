-- CommunityCast initial schema
-- Simple daily-playlist scheduling model (no recurring templates in MVP).

CREATE TABLE IF NOT EXISTS media_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  file_path      TEXT NOT NULL,
  media_type     TEXT NOT NULL CHECK (media_type IN ('program','commercial','promo','announcement','bumper')),
  duration_ms    INTEGER,
  resolution     TEXT,
  codec          TEXT,
  thumbnail_path TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS daily_schedules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL UNIQUE, -- ISO date, e.g. 2026-07-10
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published'))
);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_schedule_id INTEGER NOT NULL REFERENCES daily_schedules(id) ON DELETE CASCADE,
  media_item_id     INTEGER NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  order_index       INTEGER NOT NULL,
  start_time        TEXT -- HH:MM:SS, computed on publish
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_daily_schedule
  ON schedule_blocks(daily_schedule_id, order_index);

-- Singleton table: the Playout Engine's durable state, so a relaunch mid-block
-- can resume at the correct item and offset instead of restarting the day.
CREATE TABLE IF NOT EXISTS playout_state (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  current_block_id  INTEGER REFERENCES schedule_blocks(id) ON DELETE SET NULL,
  block_started_at  TEXT,
  offset_ms         INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','playing','paused'))
);

INSERT OR IGNORE INTO playout_state (id, status, offset_ms) VALUES (1, 'idle', 0);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
