/**
 * nav.js — Shared navigation injector and theme manager
 *
 * Add to every page, just before </body>:
 *   <div id="nav-placeholder"></div>
 *   <script src="/pv-project/js/nav.js"></script>
 *
 * The script:
 *  1. Fetches <base>/components/nav.html and injects it into #nav-placeholder
 *  2. Marks the current section's dropdown and sub-link as .active
 *  3. Wires click-to-toggle behavior on dropdown menus
 *  4. Manages light/dark theme toggle with localStorage persistence
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
      if (e.key === 'Escape') closeAllDropdowns();
    });
  }

  // ── 4. Inject nav ──────────────────────────────────────────────────────────
  function initNav(navHTML) {
    const placeholder = document.getElementById('nav-placeholder');
    if (!placeholder) return;

    placeholder.innerHTML = navHTML;

    // Mark active dropdown + sub-link
    const loc = getCurrentLocation();
    placeholder.querySelectorAll('.nav-dropdown[data-page]').forEach(function (dropdown) {
      if (dropdown.dataset.page === loc.section) {
        dropdown.classList.add('active');
        const toggle = dropdown.querySelector('.nav-dropdown-toggle');
        if (toggle) toggle.classList.add('active');
        const sub = dropdown.querySelector('.nav-sublink[data-subpage="' + loc.page + '"]');
        if (sub) sub.classList.add('active');
      }
    });

    // Also support any legacy top-level .nav-link[data-page]
    placeholder.querySelectorAll('.nav-link[data-page]').forEach(function (link) {
      if (link.dataset.page === loc.section) link.classList.add('active');
    });

    // Wire up dropdown toggles
    wireDropdowns(placeholder);

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
