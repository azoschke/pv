/**
 * nav.js — Shared navigation injector and theme manager
 *
 * Add to every page, just before </body>:
 *   <div id="nav-placeholder"></div>
 *   <script src="js/pv-session.js"></script>
 *   <script src="js/nav.js"></script>
 *
 * The nav comes from the edge renderer (pv-site-renderer), drawn for this
 * visitor from Admin Settings → Navigation: the links they can open, the
 * current page, campaigns and the sign-in button.
 *  - On the live site it is already in #nav-placeholder (marked data-edge).
 *  - Otherwise (GitHub Pages, or a live page served without it) it is asked
 *    for from the renderer's /_pv/nav, with this browser's sign-in.
 *  - If the renderer can't be reached, the short nav in
 *    components/nav.html is used instead, with the current page marked and
 *    the Login button showing the sign-in.
 * Then the dropdowns, the mobile sidebar and the light/dark theme toggle
 * (kept in localStorage) are wired up.
 *
 * Base path is derived dynamically from this script's own src, so it works
 * whether the site is served at the domain root or under a project subpath
 * (e.g. GitHub Pages at /pv/).
 */

(function () {
  // ── 0. Derive base path from this script's own src ─────────────────────────
  // Captured immediately: document.currentScript is only available during
  // initial script execution.
  const BASE_PATH = (function () {
    const script = document.currentScript;
    if (script && script.src) {
      try {
        const path = new URL(script.src).pathname; // e.g. /pv/js/nav.js
        const match = path.match(/^(.*)\/js\/nav\.js$/);
        if (match) return match[1]; // e.g. /pv  (or "" if at root)
      } catch (e) { /* fall through */ }
    }
    return '';
  })();

  // ── 1. Detect the current page from the URL path ─────────────────────────
  // Every page sits at the top level (<base>/<page>.html), so the file name
  // decides which menu is current: nav.html lists each menu's pages in its
  // data-page attribute. Returns { page }, e.g. { page: "atma" }.
  function getCurrentLocation() {
    let pathname = window.location.pathname;
    if (BASE_PATH && pathname.indexOf(BASE_PATH) === 0) {
      pathname = pathname.slice(BASE_PATH.length);
    }
    const parts = pathname.split('/').filter(Boolean);
    const file = parts[parts.length - 1] || '';
    return { page: file.replace(/\.html?$/i, '') || 'index' };
  }

  // ── 1b. Admin session (shared with the management portal) ──────────────────
  // Read through js/pv-session.js, which every page loads before this file.
  function getAdminSession() {
    return window.PVSession ? window.PVSession.get() : null;
  }

  // When signed in, the Login button becomes the member's character name and
  // points at the portal dashboard. Logged out, the injected default is left
  // untouched. Both the desktop and the sidebar button carry .nav-login-btn.
  function applyAuthState(placeholder) {
    const session = getAdminSession();
    if (!session) return;
    const name = String(session.display_name || session.username || 'Account').trim();
    const portalUrl = BASE_PATH + '/portal.html';
    placeholder.querySelectorAll('.nav-login-btn').forEach(function (btn) {
      btn.href = portalUrl;
      btn.setAttribute('data-subpage', 'admin-portal');
      btn.setAttribute('aria-label', 'Go to dashboard (' + name + ')');
      btn.setAttribute('title', 'Go to dashboard');
      btn.classList.add('is-authed');
      // "Dashboard" with the same user icon the signed-out Login button uses,
      // and the character name small beneath — keeps a long name from driving
      // the button width.
      btn.innerHTML =
        '<svg class="nav-login-icon" viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/>' +
        '</svg>' +
        '<span class="nav-login-stack">' +
          '<span class="nav-login-primary">Dashboard</span>' +
          '<span class="nav-login-name"></span>' +
        '</span>';
      const nameEl = btn.querySelector('.nav-login-name');
      if (nameEl) nameEl.textContent = name; // textContent: never inject the name as HTML
    });
  }

  // ── 2. Theme management ────────────────────────────────────────────────────
  const THEME_KEY = 'crafting-tools-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerHTML = theme === 'dark' ? '&#9788;' : '&#9790;';
  }

  function getSavedTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  // Apply saved theme immediately (before nav loads) to avoid flash
  applyTheme(getSavedTheme());

  // ── 3. Dropdown wiring ─────────────────────────────────────────────────────
  function closeAllDropdowns(except) {
    document.querySelectorAll('.nav-dropdown.open').forEach(function (d) {
      if (d === except) return;
      d.classList.remove('open');
      const btn = d.querySelector('.nav-dropdown-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function wireDropdowns(placeholder) {
    placeholder.querySelectorAll('.nav-dropdown').forEach(function (dropdown) {
      const toggle = dropdown.querySelector('.nav-dropdown-toggle');
      if (!toggle) return;
      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        closeAllDropdowns(dropdown);
      });
    });

    // Close dropdowns on outside click
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.nav-dropdown')) closeAllDropdowns();
    });

    // Close dropdowns on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeAllDropdowns(); closeSidebar(); }
    });
  }

  // ── 3b. Mobile sidebar (hamburger drawer) ─────────────────────────────────
  function openSidebar() {
    const sidebar = document.getElementById('nav-sidebar');
    const overlay = document.getElementById('nav-overlay');
    const hamburger = document.getElementById('nav-hamburger');
    if (!sidebar) return;
    sidebar.classList.add('open');
    sidebar.setAttribute('aria-hidden', 'false');
    if (overlay) overlay.classList.add('visible');
    if (hamburger) hamburger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-sidebar-open');
  }

  function closeSidebar() {
    const sidebar = document.getElementById('nav-sidebar');
    const overlay = document.getElementById('nav-overlay');
    const hamburger = document.getElementById('nav-hamburger');
    if (!sidebar) return;
    sidebar.classList.remove('open');
    sidebar.setAttribute('aria-hidden', 'true');
    if (overlay) overlay.classList.remove('visible');
    if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-sidebar-open');
  }

  function wireSidebar() {
    const hamburger = document.getElementById('nav-hamburger');
    const closeBtn = document.getElementById('nav-sidebar-close');
    const overlay = document.getElementById('nav-overlay');

    if (hamburger) hamburger.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // Sidebar section toggles
    document.querySelectorAll('.nav-sidebar-section').forEach(function (section) {
      const toggle = section.querySelector('.nav-sidebar-toggle');
      const submenu = section.querySelector('.nav-sidebar-submenu');
      if (!toggle || !submenu) return;
      toggle.addEventListener('click', function () {
        const isOpen = section.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    });
  }

  // ── 4. Inject nav ──────────────────────────────────────────────────────────
  function initNav(navHTML) {
    const placeholder = document.getElementById('nav-placeholder');
    if (!placeholder) return;

    placeholder.innerHTML = navHTML;

    // Mark active dropdown + sub-link. Exact href matches win, with the
    // data-page list (the pages each menu covers) as the fallback for pages
    // not linked verbatim, such as a campaign or the Codex.
    const loc = getCurrentLocation();
    const currentPath = window.location.pathname;
    // Menu links are relative, so compare the address each one resolves to.
    function linkTo(container) {
      return Array.prototype.find.call(container.querySelectorAll('.nav-sublink'), function (a) {
        return a.pathname === currentPath;
      }) || null;
    }

    let exactMatched = false;
    placeholder.querySelectorAll('.nav-dropdown[data-page]').forEach(function (dropdown) {
      const sub = linkTo(dropdown);
      if (sub) {
        exactMatched = true;
        dropdown.classList.add('active');
        const toggle = dropdown.querySelector('.nav-dropdown-toggle');
        if (toggle) toggle.classList.add('active');
        sub.classList.add('active');
      }
    });

    if (!exactMatched) {
      placeholder.querySelectorAll('.nav-dropdown[data-page]').forEach(function (dropdown) {
        const pages = dropdown.dataset.page.split(/\s+/).filter(Boolean);
        if (pages.indexOf(loc.page) !== -1) {
          dropdown.classList.add('active');
          const toggle = dropdown.querySelector('.nav-dropdown-toggle');
          if (toggle) toggle.classList.add('active');
          const sub = dropdown.querySelector('.nav-sublink[data-subpage="' + loc.page + '"]');
          if (sub) sub.classList.add('active');
        }
      });
    }

    // Top-level links, each with the pages it covers in data-page
    placeholder.querySelectorAll('.nav-link[data-page]').forEach(function (link) {
      if (link.dataset.page.split(/\s+/).indexOf(loc.page) !== -1) link.classList.add('active');
    });

    // Mark active section in sidebar too (same exact-href-first rule)
    let sidebarExactMatched = false;
    document.querySelectorAll('.nav-sidebar-section[data-page]').forEach(function (section) {
      const sub = linkTo(section);
      if (sub) {
        sidebarExactMatched = true;
        section.classList.add('active', 'open');
        const toggle = section.querySelector('.nav-sidebar-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
        sub.classList.add('active');
      }
    });

    if (!sidebarExactMatched) {
      document.querySelectorAll('.nav-sidebar-section[data-page]').forEach(function (section) {
        const pages = section.dataset.page.split(/\s+/).filter(Boolean);
        if (pages.indexOf(loc.page) !== -1) {
          section.classList.add('active', 'open');
          const toggle = section.querySelector('.nav-sidebar-toggle');
          if (toggle) toggle.setAttribute('aria-expanded', 'true');
          const sub = section.querySelector('.nav-sublink[data-subpage="' + loc.page + '"]');
          if (sub) sub.classList.add('active');
        }
      });
    }

    // Reflect signed-in state on the Login button (name + dashboard link)
    applyAuthState(placeholder);

    wireNav(placeholder);
  }

  // Dropdown toggles, the hamburger sidebar and the theme toggle.
  function wireNav(placeholder) {
    wireDropdowns(placeholder);
    wireSidebar();
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
      applyTheme(getSavedTheme());
    }
  }

  // ── 5. Load the nav ────────────────────────────────────────────────────────
  const EDGE_ORIGIN = 'https://phoenixvanguard-tools.com';
  // Sites the renderer gives its nav to: the live site itself and GitHub
  // Pages. Anywhere else goes straight to components/nav.html.
  const EDGE_NAV_HOSTS = ['phoenixvanguard-tools.com', 'azoschke.github.io'];
  const EDGE_NAV_TIMEOUT_MS = 4000;

  // This visitor's nav from the renderer, as HTML. Rejects when it can't be
  // had (renderer down, too slow, or turned the request away).
  function fetchEdgeNav() {
    const host = window.location.hostname;
    if (EDGE_NAV_HOSTS.indexOf(host) === -1) return Promise.reject(new Error('no renderer here'));
    const live = host === 'phoenixvanguard-tools.com';
    let path = window.location.pathname;
    if (BASE_PATH && path.indexOf(BASE_PATH) === 0) path = path.slice(BASE_PATH.length) || '/';
    let url = (live ? '' : EDGE_ORIGIN) + '/_pv/nav?page=' + encodeURIComponent(path + window.location.search);
    // GitHub Pages serves the .html files, not clean addresses.
    if (!live) url += '&links=html';
    const headers = {};
    const session = getAdminSession();
    if (session) headers['Authorization'] = 'Bearer ' + session.token;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, EDGE_NAV_TIMEOUT_MS) : null;
    return fetch(url, { headers: headers, signal: controller ? controller.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('Renderer nav: ' + res.status);
        return res.text();
      })
      .then(function (html) {
        if (html.indexOf('class="site-nav"') === -1) throw new Error('Renderer nav: not a nav');
        return html;
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function loadNav() {
    const placeholder = document.getElementById('nav-placeholder');
    if (!placeholder) return;

    // Drawn already by the renderer: just wire it.
    if (placeholder.hasAttribute('data-edge')) {
      wireNav(placeholder);
      return;
    }

    fetchEdgeNav()
      .then(function (html) {
        placeholder.innerHTML = html;
        placeholder.setAttribute('data-edge', '');
        wireNav(placeholder);
      })
      .catch(function () {
        return fetch(BASE_PATH + '/components/nav.html')
          .then(function (res) {
            if (!res.ok) throw new Error('Nav fetch failed: ' + res.status);
            return res.text();
          })
          .then(initNav);
      })
      .catch(function (err) {
        console.warn('[nav.js] Could not load nav:', err);
        // Fail silently — page still works without nav
      });
  }

  loadNav();

})();
