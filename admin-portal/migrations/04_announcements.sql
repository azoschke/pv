-- 04_announcements.sql
-- Officer Announcements. author_user_id is nullable with ON DELETE SET NULL
-- so deleting an admin_user doesn't orphan or break bulletins.

CREATE TABLE IF NOT EXISTS announcements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  author_user_id  INTEGER,
  pinned          INTEGER NOT NULL DEFAULT 0,
  discord_posted  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (author_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_pinned_created
  ON announcements(pinned DESC, created_at DESC);
