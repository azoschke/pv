// ============================================================================
//  pv-announcements-discord-worker
//
//  Narrow-purpose worker: receives bulletin POSTs from pv-med-database-worker
//  (server-to-server, authenticated with a shared secret) and forwards them
//  to the Discord webhook configured in DISCORD_WEBHOOK_URL.
//
//  This worker is NOT called directly by the portal frontend. The frontend
//  POSTs to pv-med-database-worker's /announcements route, which then calls
//  /post here when post_to_discord is true. Keeping Discord out of the
//  browser means the webhook URL never touches a public client.
//
//  Required bindings / secrets:
//    ANNOUNCEMENTS_WORKER_TOKEN  — shared secret; must match the value set
//                                  on pv-med-database-worker.
//    DISCORD_WEBHOOK_URL         — full Discord webhook URL for
//                                  #officer-announcements.
//
//  Secret rotation: when rotating ANNOUNCEMENTS_WORKER_TOKEN, run
//  `wrangler secret put ANNOUNCEMENTS_WORKER_TOKEN` in BOTH worker projects
//  during the same deploy window so neither side has a stale value.
// ============================================================================

const DISCORD_EMBED_COLOR_DEFAULT = 0x8B6F47; // accent-brown
const DISCORD_EMBED_COLOR_PINNED  = 0xA54D44; // accent-red

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

function buildEmbed({ title, body, author, pinned }) {
  return {
    title: (pinned ? "📌 " : "") + title,
    description: body,
    color: pinned ? DISCORD_EMBED_COLOR_PINNED : DISCORD_EMBED_COLOR_DEFAULT,
    footer: { text: "Posted by " + (author || "Unknown") },
    timestamp: new Date().toISOString()
  };
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }
    const url = new URL(request.url);
    if (url.pathname !== "/post") {
      return json({ ok: false, error: "Not found" }, 404);
    }

    const auth = request.headers.get("Authorization") || "";
    const token = auth.replace("Bearer ", "").trim();
    if (!env.ANNOUNCEMENTS_WORKER_TOKEN || token !== env.ANNOUNCEMENTS_WORKER_TOKEN) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    if (!env.DISCORD_WEBHOOK_URL) {
      return json({ ok: false, error: "Worker not configured (DISCORD_WEBHOOK_URL missing)" }, 500);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (_e) {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const { title, body, author, pinned } = payload || {};
    if (!title || !body) {
      return json({ ok: false, error: "title and body required" }, 400);
    }

    const embed = buildEmbed({ title, body, author, pinned });

    try {
      const res = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return json({ ok: false, error: "Discord " + res.status + ": " + text.slice(0, 200) }, 502);
      }
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: e.message }, 502);
    }
  }
};
