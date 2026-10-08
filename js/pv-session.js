// ============================================================================
//  PVSession — the signed-in account, shared by every page
//
//  The management portal and the public pages share one sign-in, stored in
//  localStorage under "pv.admin.session" ({ token, username, display_name,
//  avatar_url, roles, permissions, is_root, expires_at }). This file reads
//  and writes it, answers permission checks, signs out, and sends requests to
//  the workers.
//
//  Load it before js/api.js, js/rp-api.js, js/nav.js and any page script
//  that uses the sign-in:
//    <script src="js/pv-session.js"></script>
//
//  On the live site the edge renderer (pv-site-renderer) keeps its own copy
//  of the sign-in as a cookie: it draws each visitor's nav and decides who
//  may open each page. handoff() gives it the browser's sign-in, clear()
//  drops it, and every page it served (window.PV_EDGE) is checked once on
//  load so the two always agree. Elsewhere (GitHub Pages, local files) these
//  do nothing.
// ============================================================================

(function (global) {
  var SESSION_KEY = 'pv.admin.session';
  // Every page sits at the top level, so the login page is a sibling of the
  // current page (under /pv on GitHub Pages, at the root on the live site).
  var LOGIN_PAGE = 'login.html';

  // The stored session, or null when signed out or past expires_at.
  function get() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      // One-time migration: carry over a session left by the old
      // sessionStorage-based build so active users aren't logged out.
      if (!raw) {
        var legacy = sessionStorage.getItem(SESSION_KEY);
        if (legacy) {
          localStorage.setItem(SESSION_KEY, legacy);
          sessionStorage.removeItem(SESSION_KEY);
          raw = legacy;
        }
      }
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.token) return null;
      if (s.expires_at) {
        var exp = new Date(s.expires_at).getTime();
        if (!isNaN(exp) && exp <= Date.now()) return null;
      }
      return s;
    } catch (_e) {
      return null;
    }
  }

  function set(s) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  function clear() {
    localStorage.removeItem(SESSION_KEY);
    // Also drop any leftover from the old sessionStorage-based build.
    sessionStorage.removeItem(SESSION_KEY);
    dropEdge();
  }

  // ── Signing out ──────────────────────────────────────────────────────────
  var MED_API = 'https://pv-med-database-worker.chlorinatorgreen.workers.dev';
  var SIGN_OUT_WAIT_MS = 4000;

  // Ends the sign-in everywhere: the session at the med worker, this
  // browser's copy and the edge renderer's. Resolves once the renderer has
  // let go of it (or after a few seconds at most), so a reload shows the
  // page signed out.
  function signOut() {
    var s = get();
    var server = s
      ? fetch(MED_API + '/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.token },
          body: '{}'
        }).catch(function () {})
      : Promise.resolve();
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    var edge = edgeHost()
      ? fetch(EDGE_SESSION_PATH, { method: 'DELETE', credentials: 'same-origin' }).catch(function () {})
      : Promise.resolve();
    var wait = new Promise(function (resolve) { setTimeout(resolve, SIGN_OUT_WAIT_MS); });
    return Promise.race([Promise.all([server, edge]), wait]).then(function () {});
  }

  // ── Edge renderer sign-in ────────────────────────────────────────────────
  var EDGE_HOSTS = ['phoenixvanguard-tools.com'];
  var EDGE_SESSION_PATH = '/_pv/session';
  var EDGE_SYNC_KEY = 'pv.edge.synced';

  function edgeHost() {
    return EDGE_HOSTS.indexOf(global.location.hostname) !== -1;
  }

  // Gives the renderer this browser's sign-in. Resolves true when it took it,
  // false when the sign-in was turned down (no longer valid), and null when
  // there is nothing to hand over or the renderer can't be reached.
  function handoff() {
    var s = get();
    if (!edgeHost() || !s) return Promise.resolve(null);
    return fetch(EDGE_SESSION_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: s.token })
    }).then(function (res) {
      if (res.ok) return true;
      return res.status === 401 ? false : null;
    }, function () { return null; });
  }

  function dropEdge() {
    if (!edgeHost()) return;
    try {
      fetch(EDGE_SESSION_PATH, { method: 'DELETE', credentials: 'same-origin', keepalive: true })
        .catch(function () {});
    } catch (_e) { /* ignore */ }
  }

  // A page the renderer drew for a different sign-in than this browser holds
  // (signed in before the renderer existed, signed out elsewhere, or another
  // account) hands over or drops the renderer's copy and reloads, so the nav
  // matches. At most once every 30 seconds, so it can never loop.
  function syncEdge() {
    var edge = global.PV_EDGE;
    if (!edge || !edgeHost()) return;
    // The login page does its own handover (and would race this one).
    if (/\/login(\.html)?$/.test(global.location.pathname)) return;
    var s = get();
    var mine = s ? String(s.username || '').toLowerCase() : '';
    var theirs = edge.signedIn ? String(edge.username || '').toLowerCase() : '';
    if (mine === theirs) return;
    try {
      var last = Number(sessionStorage.getItem(EDGE_SYNC_KEY) || 0);
      if (Date.now() - last < 30000) return;
      sessionStorage.setItem(EDGE_SYNC_KEY, String(Date.now()));
    } catch (_e) { return; }
    if (!s) {
      fetch(EDGE_SESSION_PATH, { method: 'DELETE', credentials: 'same-origin' })
        .then(function () { global.location.reload(); }, function () {});
      return;
    }
    handoff().then(function (ok) {
      if (ok === false) clear();       // the browser's sign-in has expired
      if (ok !== null) global.location.reload();
    });
  }

  // Permission keys from the permission grid (Admin Settings → Permissions),
  // stored with the session at sign-in and refreshed from /me by the portal.
  // The root admin's list has every key. A session saved before permissions
  // existed has no list; can() then returns `ifUnknown` (false unless given).
  function can(key, ifUnknown) {
    var s = get();
    if (!s) return false;
    if (!Array.isArray(s.permissions)) return !!ifUnknown;
    return s.permissions.indexOf(key) !== -1;
  }

  // Any one of the keys is enough.
  function canAny(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (can(keys[i])) return true;
    }
    return false;
  }

  function redirectToLogin() {
    if (!/\/login(\.html)?$/.test(window.location.pathname)) {
      window.location.replace(LOGIN_PAGE);
    }
  }

  // One request helper for every worker. `body` is sent as JSON, or as-is
  // when it is FormData (uploads). opts:
  //   auth        true: send the session token, and go to the login page when
  //               signed out. 'optional': send the token when signed in.
  //   loginOn401  a 401 clears the session and goes to the login page.
  //   failText    start of the fallback error message ('Request failed').
  // Errors carry .status and .data.
  async function request(base, method, path, body, opts) {
    opts = opts || {};
    var isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    var headers = { 'Accept': 'application/json' };
    if (body !== undefined && body !== null && !isForm) headers['Content-Type'] = 'application/json';
    var s = opts.auth ? get() : null;
    if (opts.auth === true && !s) {
      redirectToLogin();
      throw new Error('Session expired. Please sign in again.');
    }
    if (opts.auth && s) headers['Authorization'] = 'Bearer ' + s.token;

    var res = await fetch(base + path, {
      method: method,
      headers: headers,
      body: (body === undefined || body === null) ? undefined : (isForm ? body : JSON.stringify(body))
    });

    if (res.status === 401 && opts.loginOn401) {
      clear();
      redirectToLogin();
      throw new Error('Your session is no longer valid. Please sign in again.');
    }

    var text = await res.text();
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_e) { data = { raw: text }; }
    }

    if (!res.ok) {
      var msg = (data && (data.error || data.message)) ||
        ((opts.failText || 'Request failed') + ' (' + res.status + ')');
      var err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  global.PVSession = {
    get: get,
    set: set,
    clear: clear,
    can: can,
    canAny: canAny,
    redirectToLogin: redirectToLogin,
    request: request,
    handoff: handoff,
    signOut: signOut
  };

  syncEdge();
})(window);
