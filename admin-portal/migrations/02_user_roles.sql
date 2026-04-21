-- 02_user_roles.sql
-- Join table mapping admin_users to roles. Multi-role supported.
-- Seeds initial role assignments:
--   Fiora   -> admin only
--   Astares -> medical + officer
--   others  -> medical

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id)       ON DELETE CASCADE
);

-- Fiora -> admin
INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM admin_users u
  JOIN roles r ON r.slug = 'admin'
 WHERE lower(u.username) IN ('fiora', 'fiora acaeus');

-- Everyone else -> medical
INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM admin_users u
  JOIN roles r ON r.slug = 'medical'
 WHERE lower(u.username) NOT IN ('fiora', 'fiora acaeus');

-- Astares -> officer (additive; already has medical from the query above)
INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM admin_users u
  JOIN roles r ON r.slug = 'officer'
 WHERE lower(u.username) IN ('astares', 'astares acaeus');
