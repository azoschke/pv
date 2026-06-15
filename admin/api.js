// ============================================================================
//  PVAdminAPI — shared client helpers for /pv/admin/*.html
//
//  Exposes a global `PVAdminAPI` object used by login.html, portal.js, and
//  the section modules. Deliberately plain JS (no modules, no build step)
//  so it can be dropped into a <script> tag on any admin page.
//
//  Backs onto the same Cloudflare worker as the existing med-admin.html,
//  but keeps its own storage key so the two UIs never share a token.
//
//  The session lives in localStorage (not sessionStorage) so a sign-in
//  survives new tabs and browser restarts up to the token's expires_at;
//  the expiry check below still invalidates stale tokens, and logout()
//  clears the key explicitly.
// ============================================================================

(function (global) {
  var API_BASE = 'https://pv-med-database-worker.chlorinatorgreen.workers.dev';
  var SESSION_KEY = 'pv.admin.session';
  var LOGIN_PATH = '/pv/admin/login.html';

  function getSession() {
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

  function setSession(s) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    // Also drop any leftover from the old sessionStorage-based build.
    sessionStorage.removeItem(SESSION_KEY);
  }

  function hasRole(role) {
    var s = getSession();
    if (!s || !Array.isArray(s.roles)) return false;
    return s.roles.indexOf(role) !== -1;
  }

  function hasAnyRole(roles) {
    if (!roles || !roles.length) return true;
    for (var i = 0; i < roles.length; i++) {
      if (hasRole(roles[i])) return true;
    }
    return false;
  }

  function redirectToLogin() {
    if (window.location.pathname !== LOGIN_PATH) {
      window.location.replace(LOGIN_PATH);
    }
  }

  async function request(method, path, body, authed) {
    var headers = { 'Accept': 'application/json' };
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    if (authed) {
      var s = getSession();
      if (!s) {
        redirectToLogin();
        throw new Error('Session expired. Please sign in again.');
      }
      headers['Authorization'] = 'Bearer ' + s.token;
    }

    var res = await fetch(API_BASE + path, {
      method: method,
      headers: headers,
      body: (body === undefined || body === null) ? undefined : JSON.stringify(body)
    });

    if (res.status === 401) {
      clearSession();
      redirectToLogin();
      throw new Error('Your session is no longer valid. Please sign in again.');
    }

    var text = await res.text();
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_e) { data = { raw: text }; }
    }

    if (!res.ok) {
      var msg = (data && (data.error || data.message)) || ('Request failed (' + res.status + ')');
      var err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function me() {
    return request('GET', '/me', undefined, true);
  }

  async function logout() {
    try {
      await request('POST', '/auth/logout', {}, true);
    } catch (_e) {
      // Even if the server call fails (network, expired token), clear locally.
    }
    clearSession();
    // Deliberate sign-outs land on the public home page; only expired/invalid
    // sessions (401s above) bounce to the login form.
    window.location.replace('/pv/index.html');
  }

  global.PVAdminAPI = {
    API_BASE: API_BASE,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    hasRole: hasRole,
    hasAnyRole: hasAnyRole,
    redirectToLogin: redirectToLogin,
    request: request,
    me: me,
    logout: logout
  };
})(window);
