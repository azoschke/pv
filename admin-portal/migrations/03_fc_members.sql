-- 03_fc_members.sql
-- FC Member Directory. Separate from admin_users: not every FC member has
-- a portal login, and the directory carries IC-flavored fields that don't
-- belong on an auth row.

CREATE TABLE IF NOT EXISTS fc_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  ooc_rank   TEXT NOT NULL,
  ic_rank    TEXT,
  faction    TEXT NOT NULL,
  interview  TEXT NOT NULL,
  activity   TEXT NOT NULL,
  talked_to  INTEGER NOT NULL DEFAULT 0,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fc_members_name ON fc_members(name);
