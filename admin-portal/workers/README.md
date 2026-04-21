# Cloudflare Workers — admin portal

Source of truth for the two workers that back the Phoenix Vanguard admin
portal. Paste these into the Cloudflare dashboard or deploy via
`wrangler deploy` from a local checkout that binds each project.

## `pv-med-database-worker.js`

Replaces the existing `pv-med-database-worker`. Backward-compatible with
the live `vanguard-medical/med-admin.html`. Requires D1 migrations 01–05
from `/admin-portal/migrations/` to have been applied.

**Bindings / secrets:**

| Name | Type | Notes |
|---|---|---|
| `DB` | D1 | `pv-med-database` |
| `ANNOUNCEMENTS_WORKER_URL` | var | Optional. Base URL of `pv-announcements-discord-worker` (e.g. `https://pv-announcements-discord-worker.<subdomain>.workers.dev`). If unset, the Discord toggle silently no-ops. |
| `ANNOUNCEMENTS_WORKER_TOKEN` | secret | Optional. Must match the token configured on `pv-announcements-discord-worker`. |

**Deploy order:** apply D1 migrations first, then this worker. Medical
staff continue to use the live page; no client change required.

## `pv-announcements-discord-worker.js`

New standalone worker. Only accepts `POST /post` with a valid
`Authorization: Bearer <ANNOUNCEMENTS_WORKER_TOKEN>` header and forwards
the payload as a Discord embed to `DISCORD_WEBHOOK_URL`.

**Bindings / secrets:**

| Name | Type | Notes |
|---|---|---|
| `ANNOUNCEMENTS_WORKER_TOKEN` | secret | Shared with `pv-med-database-worker`. |
| `DISCORD_WEBHOOK_URL` | secret | Full webhook URL for `#officer-announcements`. |

**No public CORS.** This worker is never called directly from a browser.

## Shared-secret rotation

1. Generate a new random token (e.g. `openssl rand -hex 32`).
2. `wrangler secret put ANNOUNCEMENTS_WORKER_TOKEN` in the
   `pv-announcements-discord-worker` project, paste new value.
3. `wrangler secret put ANNOUNCEMENTS_WORKER_TOKEN` in the
   `pv-med-database-worker` project, paste the same value.
4. Redeploy both (or wait for the automatic propagation).
5. Test posting a bulletin with Discord toggle on; confirm delivery.

The brief window where the two secrets differ will cause Discord posts
to fail closed (`discord_posted = 0`) — bulletins still save to D1, they
just don't appear in Discord. The portal surfaces the failure in its
response so the posting officer sees it immediately.
