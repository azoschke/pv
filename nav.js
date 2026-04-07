/**
 * nav.js — Shared navigation injector and theme manager
 *
 * Add to every page, just before </body>:
 *   <div id="nav-placeholder"></div>
 *   <script src="/js/nav.js"></script>
 *
 * The script:
 *  1. Fetches /components/nav.html and injects it into #nav-placeholder
 *  2. Marks the current page's nav link as .active
 *  3. Manages light/dark theme toggle with localStorage persistence
 */

(function () {
  // ── 1. Detect current page from URL path ───────────────────────────────────
  // Matches the first path segment, e.g. "/zodiac-weapons/atma.html" → "zodiac-weapons"
  function getCurrentPage() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[0] || 'home';
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
  fetch('/components/nav.html')
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
