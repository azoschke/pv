/**
 * rp-api.js — shared client for the RP campaign roll calculator worker.
 *
 * Talks to pv-campaign-rolls-worker, which is SEPARATE from the med worker that
 * PVAdminAPI targets. It reuses the same login session: the worker validates the
 * bearer token against pv-med-database-worker /me via a Service Binding, so we
 * just forward the token PVAdminAPI already stores.
 *
 * Load order on any page that uses this:
 *   <script src="js/pv-session.js"></script>   (provides the session)
 *   <script src="js/rp-api.js"></script>
 *
 * Exposes a global `PVRollAPI` with { API_BASE, request, getSession }.
 */
(function (global) {
  // ⚠️ Confirm this matches the deployed worker's URL. Every other worker in
  // this project lives on the same workers.dev subdomain, so the convention is:
  var RP_API_BASE = 'https://pv-campaign-rolls-worker.chlorinatorgreen.workers.dev';

  function getSession() {
    return global.PVSession.get();
  }

  // Every RP route requires a session. We attach the bearer whenever one exists
  // and leave it to the caller (page) to render a locked state on 401 — unlike
  // PVAdminAPI.request, this never force-redirects, so the public tool page can
  // show its own "sign in" panel instead of bouncing to the login form.
  async function request(method, path, body) {
    return global.PVSession.request(RP_API_BASE, method, path, body, { auth: 'optional' });
  }

  global.PVRollAPI = {
    API_BASE: RP_API_BASE,
    request: request,
    getSession: getSession
  };
})(window);
