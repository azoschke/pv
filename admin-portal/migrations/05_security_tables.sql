-- 05_security_tables.sql
-- Supports the Chunk 1 security hardening of pv-med-database-worker.

-- Per-user PBKDF2 salt. Nullable so existing rows keep working until the
-- user logs in once with the correct password, at which point the worker
-- transparently rehashes with a fresh per-user salt and populates this
-- column.
ALTER TABLE admin_users ADD COLUMN password_salt TEXT;

-- Login rate-limit ledger. One row per (username_lower, ip) pair.
-- The worker consults this table on every /auth/login POST and either
-- returns 429 (if locked_until is in the future) or updates the row
-- based on success/failure.
CREATE TABLE IF NOT EXISTS login_attempts (
  username_lower TEXT NOT NULL,
  ip             TEXT NOT NULL,
  failures       INTEGER NOT NULL DEFAULT 0,
  window_start   TEXT NOT NULL DEFAULT (datetime('now')),
  locked_until   TEXT,
  PRIMARY KEY (username_lower, ip)
);
