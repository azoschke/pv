// ============================================================================
//  pv-med-database-worker (v2)
//  Cloudflare Worker backing the Phoenix Vanguard medical database and the
//  new admin portal at /pv/admin/.
//
//  This file replaces the v1 worker one-to-one. Paste the full contents into
//  the Cloudflare dashboard (Workers -> pv-med-database-worker -> Edit code)
//  or deploy via `wrangler deploy`.
//
//  Requires migrations 01-05 from /admin-portal/migrations/ to have been
//  applied to the bound D1 database.
//
//  Discord-worker shared-secret rotation (Chunk 4): when rotating
//  ANNOUNCEMENTS_WORKER_TOKEN, set the new value on BOTH this worker and
//  pv-announcements-discord-worker in the same deploy window via
//  `wrangler secret put ANNOUNCEMENTS_WORKER_TOKEN` in each project.
// ============================================================================

const ALLOWED_ORIGINS = [
  "https://crafting-tools.github.io",
  "https://azoschke.github.io"
];

// Session lifetime (ms). Sliding: every authed request resets expires_at.
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

// Rate-limit tuning for /auth/login.
const LOGIN_WINDOW_MS     = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES  = 5;
const LOGIN_LOCKOUT_MS    = 15 * 60 * 1000;

// PBKDF2 tuning. Legacy rows (no password_salt) verify against the static
// salt one last time; on success the row is rehashed with a per-user salt
// and PBKDF2_ITERATIONS_NEW.
const PBKDF2_ITERATIONS_NEW    = 300000;
const PBKDF2_ITERATIONS_LEGACY = 100000;
const LEGACY_STATIC_SALT       = "pv-med-static-salt-change-this";

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

async function pbkdf2(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    keyMaterial, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function hashPasswordWithSalt(password, saltB64) {
  const saltBytes = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  return pbkdf2(password, saltBytes, PBKDF2_ITERATIONS_NEW);
}

async function hashPasswordLegacy(password) {
  const saltBytes = new TextEncoder().encode(LEGACY_STATIC_SALT);
  return pbkdf2(password, saltBytes, PBKDF2_ITERATIONS_LEGACY);
}

function randomSaltB64() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

async function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function cors(response, origin) {
  const headers = new Headers(response.headers);
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  headers.set("Access-Control-Allow-Origin", allowed);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, { status: response.status, headers });
}

function json(body, init) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...(init && init.headers), "Content-Type": "application/json" }
  });
}

// ---------------------------------------------------------------------------
// Session + role helpers
// ---------------------------------------------------------------------------

async function loadSessionRoles(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?"
  ).bind(userId).all();
  return results.map(r => r.slug);
}

async function verifySession(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return null;

  const session = await env.DB.prepare(
    `SELECT s.token, s.user_id, s.expires_at, u.username, u.display_name
       FROM sessions s
       JOIN admin_users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  if (!session) return null;

  // Sliding refresh: every authed request bumps expires_at.
  const newExpires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    "UPDATE sessions SET expires_at = ? WHERE token = ?"
  ).bind(newExpires, token).run();
  session.expires_at = newExpires;

  session.roles = await loadSessionRoles(env, session.user_id);
  return session;
}

function hasAnyRole(session, roles) {
  if (!session || !session.roles) return false;
  for (const r of roles) if (session.roles.includes(r)) return true;
  return false;
}

function requireRole(session, ...roles) {
  if (!hasAnyRole(session, roles)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Login rate limit
// ---------------------------------------------------------------------------

async function checkLoginLock(env, usernameLower, ip) {
  const row = await env.DB.prepare(
    "SELECT failures, window_start, locked_until FROM login_attempts WHERE username_lower = ? AND ip = ?"
  ).bind(usernameLower, ip).first();
  if (!row) return { locked: false, row: null };

  const now = Date.now();
  const lockedUntilMs = row.locked_until ? Date.parse(row.locked_until) : 0;
  if (lockedUntilMs > now) {
    return { locked: true, retryAfterSec: Math.ceil((lockedUntilMs - now) / 1000), row };
  }
  return { locked: false, row };
}

async function recordLoginFailure(env, usernameLower, ip, existingRow) {
  const now = Date.now();
  const windowStartMs = existingRow ? Date.parse(existingRow.window_start) : 0;
  const withinWindow = existingRow && (now - windowStartMs) < LOGIN_WINDOW_MS;

  const failures = withinWindow ? (existingRow.failures + 1) : 1;
  const windowStart = withinWindow ? existingRow.window_start : new Date(now).toISOString();
  const lockedUntil = failures >= LOGIN_MAX_FAILURES
    ? new Date(now + LOGIN_LOCKOUT_MS).toISOString()
    : null;

  await env.DB.prepare(
    `INSERT INTO login_attempts (username_lower, ip, failures, window_start, locked_until)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(username_lower, ip) DO UPDATE SET
       failures = excluded.failures,
       window_start = excluded.window_start,
       locked_until = excluded.locked_until`
  ).bind(usernameLower, ip, failures, windowStart, lockedUntil).run();
}

async function clearLoginAttempts(env, usernameLower, ip) {
  await env.DB.prepare(
    "DELETE FROM login_attempts WHERE username_lower = ? AND ip = ?"
  ).bind(usernameLower, ip).run();
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), origin);
    }

    try {
      // ===================================================================
      // Auth routes (public)
      // ===================================================================

      if (url.pathname === "/auth/login" && request.method === "POST") {
        const { username, password } = await request.json();
        if (!username || !password) {
          return cors(json({ error: "Missing credentials" }, { status: 400 }), origin);
        }
        const usernameLower = String(username).trim().toLowerCase();
        const ip = request.headers.get("cf-connecting-ip") || "unknown";

        const lock = await checkLoginLock(env, usernameLower, ip);
        if (lock.locked) {
          return cors(new Response(
            JSON.stringify({ error: "Too many attempts. Try again later." }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": String(lock.retryAfterSec)
              }
            }
          ), origin);
        }

        const user = await env.DB.prepare(
          "SELECT id, username, display_name, password_hash, password_salt FROM admin_users WHERE lower(username) = ?"
        ).bind(usernameLower).first();

        let verified = false;
        let needsRehash = false;
        if (user) {
          if (user.password_salt) {
            const h = await hashPasswordWithSalt(password, user.password_salt);
            verified = (h === user.password_hash);
          } else {
            // Legacy static-salt path. One-time verification; rehash on success.
            const h = await hashPasswordLegacy(password);
            verified = (h === user.password_hash);
            needsRehash = verified;
          }
        }

        if (!verified) {
          await recordLoginFailure(env, usernameLower, ip, lock.row);
          return cors(json({ error: "Invalid credentials" }, { status: 401 }), origin);
        }

        if (needsRehash) {
          const newSalt = randomSaltB64();
          const newHash = await hashPasswordWithSalt(password, newSalt);
          await env.DB.prepare(
            "UPDATE admin_users SET password_hash = ?, password_salt = ? WHERE id = ?"
          ).bind(newHash, newSalt, user.id).run();
        }

        await clearLoginAttempts(env, usernameLower, ip);

        const token = await generateToken();
        const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        await env.DB.prepare(
          "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
        ).bind(token, user.id, expires).run();
        await env.DB.prepare(
          "UPDATE admin_users SET last_login = datetime('now') WHERE id = ?"
        ).bind(user.id).run();

        const roles = await loadSessionRoles(env, user.id);

        return cors(json({
          token,
          username: user.username,
          display_name: user.display_name,
          roles,
          expires_at: expires
        }), origin);
      }

      if (url.pathname === "/auth/logout" && request.method === "POST") {
        const auth = request.headers.get("Authorization") || "";
        const token = auth.replace("Bearer ", "").trim();
        if (token) {
          await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
        }
        return cors(json({ ok: true }), origin);
      }

      // ===================================================================
      // Every route below requires a valid session.
      // ===================================================================

      const session = await verifySession(request, env);
      if (!session) {
        return cors(json({ error: "Unauthorized" }, { status: 401 }), origin);
      }

      // /me — session self-check for the portal.
      if (url.pathname === "/me" && request.method === "GET") {
        return cors(json({
          username: session.username,
          display_name: session.display_name,
          roles: session.roles,
          expires_at: session.expires_at
        }), origin);
      }

      // ==== Patients ======================================================

      if (url.pathname === "/patients" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT patient_id, patient_name FROM patients ORDER BY patient_name"
        ).all();
        return cors(json(results), origin);
      }

      if (url.pathname.match(/^\/patients\/\d+$/) && request.method === "GET") {
        const id = url.pathname.split("/")[2];
        const patient = await env.DB.prepare(
          "SELECT * FROM patients WHERE patient_id = ?"
        ).bind(id).first();
        const { results: visits } = await env.DB.prepare(
          "SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_id DESC"
        ).bind(id).all();
        return cors(json({ patient, visits }), origin);
      }

      if (url.pathname === "/patients" && request.method === "POST") {
        const data = await request.json();
        await env.DB.prepare(`
          INSERT INTO patients (patient_id, patient_name, race, gender, age, vanguard_position,
            date_updated, emergency_contact_name, emergency_contact_relationship,
            emergency_contact_method, chronic_illness, previous_injuries,
            known_allergies, current_medications, aetheric_abnormalities)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          data.patient_id, data.patient_name, data.race, data.gender, data.age,
          data.vanguard_position, data.emergency_contact_name,
          data.emergency_contact_relationship, data.emergency_contact_method,
          data.chronic_illness, data.previous_injuries, data.known_allergies,
          data.current_medications, data.aetheric_abnormalities
        ).run();
        return cors(json({ ok: true }, { status: 201 }), origin);
      }

      if (url.pathname.match(/^\/patients\/\d+$/) && request.method === "PUT") {
        const id = url.pathname.split("/")[2];
        const data = await request.json();
        await env.DB.prepare(`
          UPDATE patients SET patient_name=?, race=?, gender=?, age=?, vanguard_position=?,
            date_updated=datetime('now'), emergency_contact_name=?,
            emergency_contact_relationship=?, emergency_contact_method=?,
            chronic_illness=?, previous_injuries=?, known_allergies=?,
            current_medications=?, aetheric_abnormalities=?
          WHERE patient_id=?
        `).bind(
          data.patient_name, data.race, data.gender, data.age, data.vanguard_position,
          data.emergency_contact_name, data.emergency_contact_relationship,
          data.emergency_contact_method, data.chronic_illness, data.previous_injuries,
          data.known_allergies, data.current_medications, data.aetheric_abnormalities, id
        ).run();
        return cors(json({ ok: true }), origin);
      }

      // ==== Visits ========================================================

      if (url.pathname === "/visits" && request.method === "POST") {
        const data = await request.json();
        await env.DB.prepare(`
          INSERT INTO visits (patient_id, patient_name, visit_date, sort_date,
            presenting_complaint, current_symptoms, recent_exposures,
            attending_medic, clinical_summary, diagnosis, procedures_performed,
            treatment_plan, follow_up, discharge_status, additional_notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          data.patient_id, data.patient_name, data.visit_date, data.sort_date || null,
          data.presenting_complaint, data.current_symptoms, data.recent_exposures,
          data.attending_medic, data.clinical_summary, data.diagnosis,
          data.procedures_performed, data.treatment_plan, data.follow_up,
          data.discharge_status, data.additional_notes
        ).run();
        return cors(json({ ok: true }, { status: 201 }), origin);
      }

      if (url.pathname.match(/^\/visits\/\d+$/) && request.method === "PUT") {
        const id = url.pathname.split("/")[2];
        const data = await request.json();
        await env.DB.prepare(`
          UPDATE visits SET visit_date=?, sort_date=?, presenting_complaint=?,
            current_symptoms=?, recent_exposures=?, attending_medic=?,
            clinical_summary=?, diagnosis=?, procedures_performed=?,
            treatment_plan=?, follow_up=?, discharge_status=?, additional_notes=?
          WHERE visit_id=?
        `).bind(
          data.visit_date, data.sort_date || null, data.presenting_complaint,
          data.current_symptoms, data.recent_exposures, data.attending_medic,
          data.clinical_summary, data.diagnosis, data.procedures_performed,
          data.treatment_plan, data.follow_up, data.discharge_status,
          data.additional_notes, id
        ).run();
        return cors(json({ ok: true }), origin);
      }

      if (url.pathname.match(/^\/visits\/\d+$/) && request.method === "DELETE") {
        const denied = requireRole(session, "admin");
        if (denied) return cors(denied, origin);
        const id = url.pathname.split("/")[2];
        await env.DB.prepare("DELETE FROM visits WHERE visit_id = ?").bind(id).run();
        return cors(json({ ok: true }), origin);
      }

      // ==== FC Member Directory ===========================================

      if (url.pathname === "/members" && request.method === "GET") {
        const denied = requireRole(session, "officer", "admin");
        if (denied) return cors(denied, origin);
        const { results } = await env.DB.prepare(
          "SELECT * FROM fc_members ORDER BY name"
        ).all();
        return cors(json(results), origin);
      }

      if (url.pathname === "/members" && request.method === "POST") {
        const denied = requireRole(session, "officer", "admin");
        if (denied) return cors(denied, origin);
        const d = await request.json();
        const result = await env.DB.prepare(`
          INSERT INTO fc_members (name, ooc_rank, ic_rank, faction, interview,
            activity, talked_to, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          d.name, d.ooc_rank, d.ic_rank || null, d.faction, d.interview,
          d.activity, d.talked_to ? 1 : 0, d.notes || null
        ).run();
        return cors(json({ ok: true, id: result.meta.last_row_id }, { status: 201 }), origin);
      }

      {
        const m = url.pathname.match(/^\/members\/(\d+)$/);
        if (m && request.method === "PATCH") {
          const denied = requireRole(session, "officer", "admin");
          if (denied) return cors(denied, origin);
          const id = m[1];
          const d = await request.json();
          await env.DB.prepare(`
            UPDATE fc_members SET
              name = COALESCE(?, name),
              ooc_rank = COALESCE(?, ooc_rank),
              ic_rank = ?,
              faction = COALESCE(?, faction),
              interview = COALESCE(?, interview),
              activity = COALESCE(?, activity),
              talked_to = COALESCE(?, talked_to),
              notes = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `).bind(
            d.name ?? null,
            d.ooc_rank ?? null,
            d.ic_rank ?? null,
            d.faction ?? null,
            d.interview ?? null,
            d.activity ?? null,
            d.talked_to === undefined ? null : (d.talked_to ? 1 : 0),
            d.notes ?? null,
            id
          ).run();
          return cors(json({ ok: true }), origin);
        }
        if (m && request.method === "DELETE") {
          const denied = requireRole(session, "admin");
          if (denied) return cors(denied, origin);
          await env.DB.prepare("DELETE FROM fc_members WHERE id = ?").bind(m[1]).run();
          return cors(json({ ok: true }), origin);
        }
      }

      // ==== Announcements =================================================

      if (url.pathname === "/announcements" && request.method === "GET") {
        const { results } = await env.DB.prepare(`
          SELECT a.id, a.title, a.body, a.pinned, a.discord_posted, a.created_at,
                 u.display_name AS author_display_name, u.username AS author_username
            FROM announcements a
            LEFT JOIN admin_users u ON u.id = a.author_user_id
           ORDER BY a.pinned DESC, a.created_at DESC
        `).all();
        return cors(json(results), origin);
      }

      if (url.pathname === "/announcements" && request.method === "POST") {
        const denied = requireRole(session, "officer", "admin");
        if (denied) return cors(denied, origin);
        const d = await request.json();
        if (!d.title || !d.body) {
          return cors(json({ error: "Title and body required" }, { status: 400 }), origin);
        }
        const pinned = d.pinned ? 1 : 0;
        const postToDiscord = !!d.post_to_discord;

        let discordPosted = 0;
        let discordError = null;
        if (postToDiscord && env.ANNOUNCEMENTS_WORKER_URL && env.ANNOUNCEMENTS_WORKER_TOKEN) {
          try {
            const res = await fetch(env.ANNOUNCEMENTS_WORKER_URL + "/post", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + env.ANNOUNCEMENTS_WORKER_TOKEN
              },
              body: JSON.stringify({
                title: d.title,
                body: d.body,
                author: session.display_name || session.username,
                pinned: !!pinned
              })
            });
            const body = await res.json().catch(() => ({}));
            discordPosted = (res.ok && body.ok) ? 1 : 0;
            if (!discordPosted) discordError = body.error || ("HTTP " + res.status);
          } catch (e) {
            discordError = e.message;
          }
        }

        const result = await env.DB.prepare(`
          INSERT INTO announcements (title, body, author_user_id, pinned, discord_posted)
          VALUES (?, ?, ?, ?, ?)
        `).bind(d.title, d.body, session.user_id, pinned, discordPosted).run();

        return cors(json({
          ok: true,
          id: result.meta.last_row_id,
          discord_posted: !!discordPosted,
          discord_error: discordError
        }, { status: 201 }), origin);
      }

      {
        const m = url.pathname.match(/^\/announcements\/(\d+)$/);
        if (m && request.method === "DELETE") {
          const denied = requireRole(session, "admin");
          if (denied) return cors(denied, origin);
          await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(m[1]).run();
          return cors(json({ ok: true }), origin);
        }
      }

      return cors(new Response("Not found", { status: 404 }), origin);

    } catch (err) {
      return cors(json({ error: err.message }, { status: 500 }), origin);
    }
  }
};
