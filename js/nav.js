/**
 * nav.js — Shared navigation injector and theme manager
 *
 * Add to every page, just before </body>:
 *   <div id="nav-placeholder"></div>
 *   <script src="/pv-project/js/nav.js"></script>
 *
 * The script:
 *  1. Fetches <base>/components/nav.html and injects it into #nav-placeholder
 *  2. Marks the current page's nav link as .active
 *  3. Manages light/dark theme toggle with localStorage persistence
 *
 * Base path is derived dynamically from this script's own src, so it works
 * whether the site is served at the domain root or under a project subpath
 * (e.g. GitHub Pages at /pv-project/).
 */

(function () {
  // ── 0. Derive base path from this script's own src ─────────────────────────
  // Captured immediately: document.currentScript is only available during
  // initial script execution.
  const BASE_PATH = (function () {
    const script = document.currentScript;
    if (script && script.src) {
      try {
        const path = new URL(script.src).pathname; // e.g. /pv-project/js/nav.js
        const match = path.match(/^(.*)\/js\/nav\.js$/);
        if (match) return match[1]; // e.g. /pv-project  (or "" if at root)
      } catch (e) { /* fall through */ }
    }
    return '';
  })();

  // ── 1. Detect current page from URL path ───────────────────────────────────
  // Returns the first path segment *after* BASE_PATH, e.g.
  //   /pv-project/zodiac-weapons/atma.html  →  "zodiac-weapons"
  //   /pv-project/                          →  "home"
  function getCurrentPage() {
    let pathname = window.location.pathname;
    if (BASE_PATH && pathname.indexOf(BASE_PATH) === 0) {
      pathname = pathname.slice(BASE_PATH.length);
    }
    const parts = pathname.split('/').filter(Boolean);
    // If the first segment is an HTML file (root-level page), treat as "home"
    if (!parts.length || /\.html?$/i.test(parts[0])) return 'home';
    return parts[0];
  }

  // ── 2. Theme management ────────────────────────────────────────────────────
  const THEME_KEY = 'crafting-tools-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (icon) icon.innerHTML = theme === 'dark' ? '&#9788;' : '&#9790;';
    if (text) text.textContent = theme === 'dark' ? 'Light' : 'Dark';
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

  // ── 3. Inject nav ──────────────────────────────────────────────────────────
  function initNav(navHTML) {
    const placeholder = document.getElementById('nav-placeholder');
    if (!placeholder) return;

    placeholder.innerHTML = navHTML;

    // Mark active link
    const currentPage = getCurrentPage();
    const links = placeholder.querySelectorAll('.nav-link[data-page]');
    links.forEach(link => {
      if (link.dataset.page === currentPage) {
        link.classList.add('active');
      }
    });

    // Wire up theme toggle
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
      // Sync button text/icon to current theme
      applyTheme(getSavedTheme());
    }
  }

  // ── 4. Fetch nav.html ──────────────────────────────────────────────────────
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
