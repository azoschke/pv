/**
 * rp-api.js — shared client for the RP campaign roll calculator worker.
 *
 * Talks to pv-campaign-rolls-worker, which is SEPARATE from the med worker that
 * PVAdminAPI targets. It reuses the same login session: the worker validates the
 * bearer token against pv-med-database-worker /me via a Service Binding, so we
 * just forward the token PVAdminAPI already stores.
 *
 * Load order on any page that uses this:
 *   <script src="/pv/admin/api.js"></script>   (provides PVAdminAPI session)
 *   <script src="/pv/js/rp-api.js"></script>
 *
 * Exposes a global `PVRollAPI` with { API_BASE, request, getSession }.
 */
(function (global) {
  // ⚠️ Confirm this matches the deployed worker's URL. Every other worker in
  // this project lives on the same workers.dev subdomain, so the convention is:
  var RP_API_BASE = 'https://pv-campaign-rolls-worker.chlorinatorgreen.workers.dev';

  function getSession() {
    return (global.PVAdminAPI && global.PVAdminAPI.getSession()) || null;
  }

  // Every RP route requires a session. We attach the bearer whenever one exists
  // and leave it to the caller (page) to render a locked state on 401 — unlike
  // PVAdminAPI.request, this never force-redirects, so the public tool page can
  // show its own "sign in" panel instead of bouncing to the login form.
  async function request(method, path, body) {
    var headers = { 'Accept': 'application/json' };
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    var s = getSession();
    if (s && s.token) headers['Authorization'] = 'Bearer ' + s.token;

    var res = await fetch(RP_API_BASE + path, {
      method: method,
      headers: headers,
      body: (body === undefined || body === null) ? undefined : JSON.stringify(body)
    });

    var text = await res.text();
    var data = null;
    if (text) { try { data = JSON.parse(text); } catch (_e) { data = { raw: text }; } }

    if (!res.ok) {
      var msg = (data && (data.error || data.message)) || ('Request failed (' + res.status + ')');
      var err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  global.PVRollAPI = {
    API_BASE: RP_API_BASE,
    request: request,
    getSession: getSession
  };
})(window);
