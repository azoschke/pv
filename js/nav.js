/**
 * nav.js — Shared navigation injector and theme manager
 *
 * Add to every page, just before </body>:
 *   <div id="nav-placeholder"></div>
 *   <script src="/pv/js/nav.js"></script>
 *
 * The script:
 *  1. Fetches <base>/components/nav.html and injects it into #nav-placeholder
 *  2. Marks the current section's dropdown and sub-link as .active
 *  3. Wires click-to-toggle behavior on dropdown menus
 *  4. Manages light/dark theme toggle with localStorage persistence
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

  // ── 1. Detect current section + page from URL path ────────────────────────
  // Returns { section, page } where:
  //   section = first path segment after BASE_PATH (e.g. "zodiac-weapons")
  //   page    = file name without extension (e.g. "atma")
  function getCurrentLocation() {
    let pathname = window.location.pathname;
    if (BASE_PATH && pathname.indexOf(BASE_PATH) === 0) {
      pathname = pathname.slice(BASE_PATH.length);
    }
    const parts = pathname.split('/').filter(Boolean);
    let section = 'home';
    let page = 'index';
    if (parts.length && !/\.html?$/i.test(parts[0])) {
      section = parts[0];
      const file = parts[parts.length - 1] || '';
      page = file.replace(/\.html?$/i, '') || 'index';
    } else if (parts.length) {
      page = parts[0].replace(/\.html?$/i, '') || 'index';
    }
    return { section: section, page: page };
  }

  // ── 1b. Admin session (shared with the management portal) ──────────────────
  // Public pages don't load admin/api.js, so read the session directly. Mirrors
  // PVAdminAPI.getSession: token must be present and not past expires_at. Falls
  // back to the legacy sessionStorage slot so a pre-migration login still reads.
  const SESSION_KEY = 'pv.admin.session';

  function getAdminSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.token) return null;
      if (s.expires_at) {
        const exp = new Date(s.expires_at).getTime();
        if (!isNaN(exp) && exp <= Date.now()) return null;
      }
      return s;
    } catch (_e) {
      return null;
    }
  }

  // The portal sidebar renders its Dashboard entry with the Material Icons
  // `space_dashboard` glyph. Public pages don't all load that font, so pull it
  // in on demand (idempotently) when we need it for the signed-in nav button.
  function ensureMaterialIconsFont() {
    if (document.querySelector('link[href*="Material+Icons"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
    document.head.appendChild(link);
  }

  // When signed in, the Login button becomes the member's character name and
  // points at the portal dashboard. Logged out, the injected default is left
  // untouched. Both the desktop and the sidebar button carry .nav-login-btn.
  function applyAuthState(placeholder) {
    const session = getAdminSession();
    if (!session) return;
    ensureMaterialIconsFont();
    const name = String(session.display_name || session.username || 'Account').trim();
    const portalUrl = BASE_PATH + '/admin/portal.html';
    placeholder.querySelectorAll('.nav-login-btn').forEach(function (btn) {
      btn.href = portalUrl;
      btn.setAttribute('data-subpage', 'admin-portal');
      btn.setAttribute('aria-label', 'Go to dashboard (' + name + ')');
      btn.setAttribute('title', 'Go to dashboard');
      btn.classList.add('is-authed');
      // "Dashboard" with the same space_dashboard glyph the portal uses, and
      // the character name small beneath — keeps a long name from driving the
      // button width.
      btn.innerHTML =
        '<span class="material-icons nav-login-dash" aria-hidden="true">space_dashboard</span>' +
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

    // Mark active dropdown + sub-link. Exact href matches win — pages can
    // live in a dropdown outside their own URL section (e.g. the Medical
    // staff roster sits under Community) — with the data-page section match
    // as the fallback for anything not linked verbatim.
    const loc = getCurrentLocation();
    const currentPath = window.location.pathname;

    let exactMatched = false;
    placeholder.querySelectorAll('.nav-dropdown[data-page]').forEach(function (dropdown) {
      const sub = dropdown.querySelector('.nav-sublink[href="' + currentPath + '"]');
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
        if (pages.indexOf(loc.section) !== -1) {
          dropdown.classList.add('active');
          const toggle = dropdown.querySelector('.nav-dropdown-toggle');
          if (toggle) toggle.classList.add('active');
          const sub = dropdown.querySelector('.nav-sublink[data-subpage="' + loc.page + '"]');
          if (sub) sub.classList.add('active');
        }
      });
    }

    // Also support any legacy top-level .nav-link[data-page]
    placeholder.querySelectorAll('.nav-link[data-page]').forEach(function (link) {
      if (link.dataset.page === loc.section) link.classList.add('active');
    });

    // Mark active section in sidebar too (same exact-href-first rule)
    let sidebarExactMatched = false;
    document.querySelectorAll('.nav-sidebar-section[data-page]').forEach(function (section) {
      const sub = section.querySelector('.nav-sublink[href="' + currentPath + '"]');
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
        if (pages.indexOf(loc.section) !== -1) {
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

    // Wire up dropdown toggles
    wireDropdowns(placeholder);

    // Wire up hamburger sidebar
    wireSidebar();

    // Wire up theme toggle
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
      applyTheme(getSavedTheme());
    }
  }

  // ── 5. Fetch nav.html ──────────────────────────────────────────────────────
  fetch(BASE_PATH + '/components/nav.html')
    .then(function (res) {
      if (!res.ok) throw new Error('Nav fetch failed: ' + res.status);
      return res.text();
    })
    .then(function (html) {
      initNav(html);
    })
    .catch(function (err) {
      console.warn('[nav.js] Could not load nav:', err);
      // Fail silently — page still works without nav
    });

})();
