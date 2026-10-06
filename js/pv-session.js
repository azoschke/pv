// ============================================================================
//  PVSession — the signed-in account, shared by every page
//
//  The management portal and the public pages share one sign-in, stored in
//  localStorage under "pv.admin.session" ({ token, username, display_name,
//  roles, permissions, is_root, expires_at }). This file reads and writes it,
//  answers permission checks, and sends requests to the workers.
//
//  Load it before admin/api.js, js/rp-api.js, js/nav.js and any page script
//  that uses the sign-in:
//    <script src="/pv/js/pv-session.js"></script>
// ============================================================================

(function (global) {
  var SESSION_KEY = 'pv.admin.session';
  var LOGIN_PATH = '/pv/admin/login.html';

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
    if (window.location.pathname !== LOGIN_PATH) {
      window.location.replace(LOGIN_PATH);
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
    request: request
  };
})(window);
