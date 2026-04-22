// ============================================================================
//  PVAdminAPI — shared client helpers for /pv/admin/*.html
//
//  Exposes a global `PVAdminAPI` object used by login.html, portal.js, and
//  the section modules. Deliberately plain JS (no modules, no build step)
//  so it can be dropped into a <script> tag on any admin page.
//
//  Backs onto the same Cloudflare worker as the existing med-admin.html,
//  but keeps its own sessionStorage key so the two UIs never share a token.
// ============================================================================

(function (global) {
  var API_BASE = 'https://pv-med-database-worker.chlorinatorgreen.workers.dev';
  var SESSION_KEY = 'pv.admin.session';
  var LOGIN_PATH = '/pv/admin/login.html';

  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
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
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  function clearSession() {
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
    redirectToLogin();
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
