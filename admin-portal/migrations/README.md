# D1 migrations — pv-med-database

Apply these SQL scripts **in order** to the `pv-med-database` D1 database
via the Cloudflare dashboard (D1 → Console) or `wrangler d1 execute`.

| # | File | Purpose |
|---|---|---|
| 01 | `01_roles.sql` | Create `roles` lookup + seed the 5 portal roles. |
| 02 | `02_user_roles.sql` | Create `user_roles` join table + seed current users. |
| 03 | `03_fc_members.sql` | Create `fc_members` directory table. |
| 04 | `04_announcements.sql` | Create `announcements` table with nullable author FK. |
| 05 | `05_security_tables.sql` | Add `admin_users.password_salt` + create `login_attempts`. |

## Order matters

`02_user_roles.sql` references `roles` (via slug) so it must run after
`01_roles.sql`. Everything else is independent of the others.

## Verification

After applying all five:

```sql
-- 5 rows
SELECT slug FROM roles;

-- Should return at least Fiora (admin), Astares (medical + officer),
-- and one row per other admin_user (medical).
SELECT u.username, r.slug
  FROM admin_users u
  JOIN user_roles ur ON ur.user_id = u.id
  JOIN roles r       ON r.id = ur.role_id
 ORDER BY u.username, r.slug;

-- Should list password_salt as a column.
PRAGMA table_info(admin_users);
```

## Rollback

These migrations are additive. To roll back, drop the new tables / column:

```sql
DROP TABLE IF EXISTS login_attempts;
ALTER TABLE admin_users DROP COLUMN password_salt;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS fc_members;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
```

The existing `admin_users`, `sessions`, `patients`, and `visits` tables
are never touched by these scripts.
