-- 01_roles.sql
-- Lookup table for the five portal roles. Slugs are the stable identifiers
-- used by the worker and the frontend (see ROLE_ACCESS in portal.js).

CREATE TABLE IF NOT EXISTS roles (
  id    INTEGER PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

INSERT OR IGNORE INTO roles (id, slug, label) VALUES
  (1, 'medical',   'Medical Division'),
  (2, 'mercenary', 'Mercenary Division'),
  (3, 'pirate',    'Pirate Division'),
  (4, 'officer',   'Officer / Leadership'),
  (5, 'admin',     'Admin');
