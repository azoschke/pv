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
 *    for from the renderer's /_pv/nav, with this browser's sign-in. Links in
 *    the page to pages this visitor can't open are then taken out, and the
 *    footer (#site-footer) filled in, as the renderer does on the pages it
 *    draws.
 *  - If the renderer can't be reached, the short nav in
 *    components/nav.html is used instead, with the current page marked and
 *    the account button showing the sign-in.
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

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const CARET = '<span class="nav-caret" aria-hidden="true">&#9662;</span>';
  const ACCOUNT_PAGES = ['login', 'register', 'reset'];

  // The account's picture in a circle over its initial, shown when there is
  // no picture or it can't be loaded (the edge renderer draws the same).
  function avatarHtml(name, url) {
    const initial = (Array.from(String(name || '').trim())[0] || '?').toUpperCase();
    return '<span class="nav-avatar" aria-hidden="true"><span class="nav-avatar-initial">' + escapeHtml(initial) + '</span>' +
      (url ? '<img class="nav-avatar-img" src="' + escapeHtml(url) + '" alt="">' : '') + '</span>';
  }

  // The account button on the last-resort nav (components/nav.html), as the
  // renderer draws it. Signed out, "Sign In" comes back to this page
  // afterwards. Signed in, it becomes the account's picture and name, opening
  // Dashboard and Sign Out (wired in wireNav).
  function applyAuthState(placeholder) {
    const session = getAdminSession();
    if (!session) {
      if (ACCOUNT_PAGES.indexOf(getCurrentLocation().page) !== -1) return;
      const back = encodeURIComponent(window.location.pathname + window.location.search);
      placeholder.querySelectorAll('.nav-login-btn').forEach(function (a) {
        a.setAttribute('href', 'login.html?redirect=' + back);
      });
      return;
    }
    const name = String(session.display_name || session.username || 'Account').trim();
    const who = avatarHtml(name, session.avatar_url) + '<span class="nav-account-name">' + escapeHtml(name) + '</span>';
    const label = escapeHtml('Account: ' + name);
    const signOut = '<button type="button" class="nav-sublink nav-signout" data-pv-signout>Sign Out</button>';
    const bar = placeholder.querySelector('.site-nav > .nav-login-btn');
    if (bar) {
      bar.outerHTML =
        '<div class="nav-dropdown nav-account">' +
          '<button type="button" class="nav-account-btn nav-dropdown-toggle" aria-expanded="false" aria-haspopup="true" aria-label="' + label + '">' +
            who + CARET + '</button>' +
          '<ul class="nav-submenu nav-account-menu" role="menu">' +
            '<li role="none"><a role="menuitem" href="portal.html" class="nav-sublink">Dashboard</a></li>' +
            '<li role="none">' + signOut.replace('<button ', '<button role="menuitem" ') + '</li>' +
          '</ul>' +
        '</div>';
    }
    const side = placeholder.querySelector('.nav-login-btn-sidebar');
    const section = side && side.closest('.nav-sidebar-section');
    if (section) {
      section.outerHTML =
        '<li class="nav-sidebar-section nav-account-section">' +
          '<button type="button" class="nav-sidebar-toggle nav-account-btn" aria-expanded="false" aria-label="' + label + '">' +
            '<span class="nav-account-who">' + who + '</span> ' + CARET + '</button>' +
          '<ul class="nav-sidebar-submenu">' +
            '<li><a href="portal.html" class="nav-sublink">Dashboard</a></li>' +
            '<li>' + signOut + '</li>' +
          '</ul>' +
        '</li>';
    }
  }

  // ── 2. Theme management ────────────────────────────────────────────────────
  const THEME_KEY = 'crafting-tools-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // The dashboard's icons: a sun to switch to light, a moon to switch to dark.
    const icon = document.getElementById('theme-icon');
    if (icon) {
      icon.classList.add('material-icons');
      icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    }
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

  // Dropdown toggles, the hamburger sidebar, Sign Out, account pictures and
  // the theme toggle.
  function wireNav(placeholder) {
    wireDropdowns(placeholder);
    wireSidebar();
    // Sign Out ends the sign-in, then shows this page again (the renderer
    // sends a page that needs a sign-in on to the sign-in page).
    placeholder.querySelectorAll('[data-pv-signout]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        const reload = function () { window.location.reload(); };
        if (window.PVSession && window.PVSession.signOut) window.PVSession.signOut().then(reload, reload);
        else reload();
      });
    });
    // A picture that can't be loaded gives way to the initial beneath it.
    placeholder.querySelectorAll('.nav-avatar-img').forEach(function (img) {
      const drop = function () { img.remove(); };
      if (img.complete && !img.naturalWidth) drop();
      else img.addEventListener('error', drop);
    });
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

  // This visitor's nav from the renderer: { nav: its HTML, blocked: the
  // pages they can't open (null from a renderer that doesn't list them),
  // footer: the footer's HTML, "" for no footer, or undefined from a renderer
  // that doesn't send it }.
  // Rejects when it can't be had (renderer down, too slow, or turned the
  // request away).
  function fetchEdgeNav() {
    const host = window.location.hostname;
    if (EDGE_NAV_HOSTS.indexOf(host) === -1) return Promise.reject(new Error('no renderer here'));
    const live = host === 'phoenixvanguard-tools.com';
    let path = window.location.pathname;
    if (BASE_PATH && path.indexOf(BASE_PATH) === 0) path = path.slice(BASE_PATH.length) || '/';
    let url = (live ? '' : EDGE_ORIGIN) + '/_pv/nav?format=json&page=' + encodeURIComponent(path + window.location.search);
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
        if ((res.headers.get('Content-Type') || '').indexOf('application/json') !== -1) return res.json();
        return res.text().then(function (html) { return { nav: html, blocked: null, footer: undefined }; });
      })
      .then(function (data) {
        if (!data || typeof data.nav !== 'string' || data.nav.indexOf('class="site-nav"') === -1) {
          throw new Error('Renderer nav: not a nav');
        }
        return {
          nav: data.nav,
          blocked: Array.isArray(data.blocked) ? data.blocked : null,
          footer: typeof data.footer === 'string' ? data.footer : undefined
        };
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  // The page a link on this site points at, as the Pages list stores it
  // ("/job-board"; "/" for home), or null for anything else: other sites,
  // anchors, mailto:, and addresses outside the site's folder.
  function linkedPage(href) {
    if (!href || href.charAt(0) === '#') return null;
    let u;
    try { u = new URL(href, window.location.href); } catch (_e) { return null; }
    if (u.origin !== window.location.origin) return null;
    let p = u.pathname;
    if (BASE_PATH) {
      if (p !== BASE_PATH && p.indexOf(BASE_PATH + '/') !== 0) return null;
      p = p.slice(BASE_PATH.length);
    }
    try { p = decodeURIComponent(p); } catch (_e) { /* keep it as is */ }
    p = p.replace(/\/+$/, '').replace(/\.html?$/i, '');
    return (p === '' || p === '/index') ? '/' : p;
  }

  // Takes links to the pages in `blocked` out of the page (never the nav),
  // by the renderer's rules (lib/links.js): a list item holding such a link
  // goes entirely; such a link anywhere else keeps its text but stops being a
  // link; a section that collapses when empty (the home page's .landing-row
  // sections, or anything marked data-pv-collapse) goes when every link in it
  // went.
  function hideClosedLinks(blocked, nav) {
    const SECTIONS = '.landing-row, [data-pv-collapse]';
    const closed = new Set(blocked);
    const counts = new Map(); // section → { links, closed }
    const drop = [];
    const unlink = [];
    document.querySelectorAll('a[href]').forEach(function (a) {
      if (nav.contains(a)) return;
      const section = a.closest(SECTIONS);
      if (section) {
        if (!counts.has(section)) counts.set(section, { links: 0, closed: 0 });
        counts.get(section).links++;
      }
      const target = linkedPage(a.getAttribute('href'));
      if (!target || !closed.has(target)) return;
      if (section) counts.get(section).closed++;
      const item = a.closest('li');
      if (item) drop.push(item);
      else unlink.push(a);
    });
    counts.forEach(function (c, section) { if (c.links === c.closed) drop.push(section); });
    unlink.forEach(function (a) {
      while (a.firstChild) a.parentNode.insertBefore(a.firstChild, a);
      a.remove();
    });
    drop.forEach(function (el) { el.remove(); });
  }

  // The footer from Admin Settings → Pages → Site Defaults, as the renderer
  // sends it: its HTML, or "" when there is none. Pages without a footer
  // (#site-footer) are left alone.
  function applyFooter(html) {
    const footer = document.getElementById('site-footer');
    if (!footer) return;
    if (html) footer.innerHTML = html;
    else footer.remove();
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
      .then(function (edge) {
        placeholder.innerHTML = edge.nav;
        placeholder.setAttribute('data-edge', '');
        wireNav(placeholder);
        if (edge.footer !== undefined) applyFooter(edge.footer);
        if (!edge.blocked || !edge.blocked.length) return;
        // Kept apart from the fallback below: a problem here never swaps
        // the renderer's nav for the last-resort one.
        try {
          hideClosedLinks(edge.blocked, placeholder);
        } catch (err) {
          console.warn('[nav.js] Could not hide closed links:', err);
        }
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
