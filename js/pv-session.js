// ============================================================================
//  PVSession — the signed-in account, shared by every page
//
//  The management portal and the public pages share one sign-in, stored in
//  localStorage under "pv.admin.session" ({ token, username, display_name,
//  avatar_url, roles, permissions, is_root, expires_at }). This file reads
//  and writes it, answers permission checks, signs out, and sends requests to
//  the workers. It also holds the page scroll lock (PVScrollLock) that every
//  popup and drawer shares, lets the mouse drag scrolling tables, draws
//  images that have a dark-mode version (PVThemeImage), and answers which
//  layout step the window is on (PVLayout).
//
//  Load it before js/api.js, js/rp-api.js, js/nav.js and any page script
//  that uses the sign-in or opens a popup:
//    <script src="js/pv-session.js"></script>
//
//  On the live site the edge renderer (pv-site-renderer) keeps its own copy
//  of the sign-in as a cookie: it draws each visitor's nav and decides who
//  may open each page. handoff() gives it the browser's sign-in, clear()
//  drops it, and every page it served (window.PV_EDGE) is checked once on
//  load so the two always agree. Elsewhere (GitHub Pages, local files) these
//  do nothing.
// ============================================================================

(function (global) {
  var SESSION_KEY = 'pv.admin.session';
  // Every page sits at the top level, so the login page is a sibling of the
  // current page (under /pv on GitHub Pages, at the root on the live site).
  var LOGIN_PAGE = 'login.html';

  // The stored session, or null when signed out or past expires_at.
  function get() {
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

  function set(s) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  function clear() {
    localStorage.removeItem(SESSION_KEY);
    // Also drop any leftover from the old sessionStorage-based build.
    sessionStorage.removeItem(SESSION_KEY);
    dropEdge();
  }

  // ── Signing out ──────────────────────────────────────────────────────────
  var MED_API = 'https://pv-med-database-worker.chlorinatorgreen.workers.dev';
  var SIGN_OUT_WAIT_MS = 4000;

  // Ends the sign-in everywhere: the session at the med worker, this
  // browser's copy and the edge renderer's. Resolves once the renderer has
  // let go of it (or after a few seconds at most), so a reload shows the
  // page signed out.
  function signOut() {
    var s = get();
    var server = s
      ? fetch(MED_API + '/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.token },
          body: '{}'
        }).catch(function () {})
      : Promise.resolve();
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    var edge = edgeHost()
      ? fetch(EDGE_SESSION_PATH, { method: 'DELETE', credentials: 'same-origin' }).catch(function () {})
      : Promise.resolve();
    var wait = new Promise(function (resolve) { setTimeout(resolve, SIGN_OUT_WAIT_MS); });
    return Promise.race([Promise.all([server, edge]), wait]).then(function () {});
  }

  // ── Edge renderer sign-in ────────────────────────────────────────────────
  var EDGE_HOSTS = ['phoenixvanguard-tools.com'];
  var EDGE_SESSION_PATH = '/_pv/session';
  var EDGE_SYNC_KEY = 'pv.edge.synced';

  function edgeHost() {
    return EDGE_HOSTS.indexOf(global.location.hostname) !== -1;
  }

  // Gives the renderer this browser's sign-in. Resolves true when it took it,
  // false when the sign-in was turned down (no longer valid), and null when
  // there is nothing to hand over or the renderer can't be reached.
  function handoff() {
    var s = get();
    if (!edgeHost() || !s) return Promise.resolve(null);
    return fetch(EDGE_SESSION_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: s.token })
    }).then(function (res) {
      if (res.ok) return true;
      return res.status === 401 ? false : null;
    }, function () { return null; });
  }

  function dropEdge() {
    if (!edgeHost()) return;
    try {
      fetch(EDGE_SESSION_PATH, { method: 'DELETE', credentials: 'same-origin', keepalive: true })
        .catch(function () {});
    } catch (_e) { /* ignore */ }
  }

  // A page the renderer drew for a different sign-in than this browser holds
  // (signed in before the renderer existed, signed out elsewhere, or another
  // account) hands over or drops the renderer's copy and reloads, so the nav
  // matches. At most once every 30 seconds, so it can never loop.
  function syncEdge() {
    var edge = global.PV_EDGE;
    if (!edge || !edgeHost()) return;
    // The login page does its own handover (and would race this one).
    if (/\/login(\.html)?$/.test(global.location.pathname)) return;
    var s = get();
    var mine = s ? String(s.username || '').toLowerCase() : '';
    var theirs = edge.signedIn ? String(edge.username || '').toLowerCase() : '';
    if (mine === theirs) return;
    try {
      var last = Number(sessionStorage.getItem(EDGE_SYNC_KEY) || 0);
      if (Date.now() - last < 30000) return;
      sessionStorage.setItem(EDGE_SYNC_KEY, String(Date.now()));
    } catch (_e) { return; }
    if (!s) {
      fetch(EDGE_SESSION_PATH, { method: 'DELETE', credentials: 'same-origin' })
        .then(function () { global.location.reload(); }, function () {});
      return;
    }
    handoff().then(function (ok) {
      if (ok === false) clear();       // the browser's sign-in has expired
      if (ok !== null) global.location.reload();
    });
  }

  // Permission keys from the permission grid (Admin Settings → Permissions),
  // stored with the session at sign-in and refreshed from /me by the portal.
  // The root admin's list has every key. A session saved before permissions
  // existed has no list; can() then returns `ifUnknown` (false unless given).
  function can(key, ifUnknown) {
    var s = get();
    if (!s) return false;
    if (!Array.isArray(s.permissions)) return !!ifUnknown;
    return s.permissions.indexOf(key) !== -1;
  }

  // Any one of the keys is enough.
  function canAny(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (can(keys[i])) return true;
    }
    return false;
  }

  // To the sign-in page, which brings the visitor back to this page after
  // signing in.
  function redirectToLogin() {
    var path = window.location.pathname;
    if (/\/login(\.html)?$/.test(path)) return;
    window.location.replace(LOGIN_PAGE + '?redirect=' + encodeURIComponent(path + window.location.search));
  }

  // One request helper for every worker. `body` is sent as JSON, or as-is
  // when it is FormData (uploads). opts:
  //   auth        true: send the session token, and go to the login page when
  //               signed out. 'optional': send the token when signed in.
  //   loginOn401  a 401 clears the session and goes to the login page.
  //   failText    start of the fallback error message ('Request failed').
  // Errors carry .status and .data.
  async function request(base, method, path, body, opts) {
    opts = opts || {};
    var isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    var headers = { 'Accept': 'application/json' };
    if (body !== undefined && body !== null && !isForm) headers['Content-Type'] = 'application/json';
    var s = opts.auth ? get() : null;
    if (opts.auth === true && !s) {
      redirectToLogin();
      throw new Error('Session expired. Please sign in again.');
    }
    if (opts.auth && s) headers['Authorization'] = 'Bearer ' + s.token;

    var res = await fetch(base + path, {
      method: method,
      headers: headers,
      body: (body === undefined || body === null) ? undefined : (isForm ? body : JSON.stringify(body))
    });

    if (res.status === 401 && opts.loginOn401) {
      clear();
      redirectToLogin();
      throw new Error('Your session is no longer valid. Please sign in again.');
    }

    var text = await res.text();
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_e) { data = { raw: text }; }
    }

    if (!res.ok) {
      var msg = (data && (data.error || data.message)) ||
        ((opts.failText || 'Request failed') + ' (' + res.status + ')');
      var err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ── Page scroll lock ─────────────────────────────────────────────────────
  // Popups and drawers stop the page scrolling behind them. The page scrolls
  // on the body, except in the management portal, where the body never
  // scrolls and the main area does (it carries data-scroll-main); that is the
  // element locked. Hiding its overflow takes its scrollbar away, which
  // widens it and shifts the content sideways, so the scrollbar's width goes
  // back on as padding while locked: the page stays put, and a tall popup's
  // own scrollbar lands where the page's was. Each popup locks under its own
  // owner (a name, or a fresh one when none is given) and the page unlocks
  // once every owner has let go. Locking or unlocking the same owner twice is
  // harmless. lock() returns a function that releases that owner, to hand
  // straight back from a React effect. While locked, the scrollbar's width is
  // also on the locked element as --scroll-lock-gap, so the full-bleed bands
  // (styles.css) can still reach the window's edge where the scrollbar was.
  //
  // Three more things hold while locked, all for mobile Safari:
  //  - A locked main area is held where it was. Safari scrolls it to bring a
  //    field in a popup into view (the popup sits inside it in the page),
  //    overflow hidden or not. The body is left alone: snapping the window
  //    back could fight Safari showing a field above the keyboard.
  //  - The visible part of the window (above an on-screen keyboard) is on the
  //    root as --vv-top and --vv-height, so a popup's overlay can fit it
  //    (portal.css). Otherwise the overlay stays the full window height
  //    behind the keyboard and Safari lets the view slide over it.
  //  - A finger drag only goes through when it's over something (in a popup
  //    or drawer) that can scroll further that way; any other drag is
  //    cancelled, so Safari can't slide or bounce the view, which it
  //    otherwise does with the keyboard up. Two-finger gestures (pinch zoom)
  //    are left alone.
  var scrollOwners = [];
  var scrollSaved = null;
  var viewport = global.visualViewport || null;
  var touchLast = null;

  function pageScroller() {
    return document.querySelector('[data-scroll-main]') || document.body;
  }

  function holdScroll() {
    var s = scrollSaved;
    if (s && (s.el.scrollTop !== s.top || s.el.scrollLeft !== s.left)) {
      s.el.scrollTop = s.top;
      s.el.scrollLeft = s.left;
    }
  }

  function trackViewport() {
    var root = document.documentElement.style;
    root.setProperty('--vv-top', viewport.offsetTop + 'px');
    root.setProperty('--vv-height', viewport.height + 'px');
  }

  // Whether el scrolls, along the drag's main axis, in the direction a
  // finger moving by delta would take it (a finger moving down or right
  // scrolls towards the top or left).
  function scrollsFurther(el, vertical, delta) {
    var style = global.getComputedStyle(el);
    var overflow = vertical ? style.overflowY : style.overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll') return false;
    if (vertical) {
      if (el.scrollHeight - el.clientHeight < 1) return false;
      return delta > 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    }
    if (el.scrollWidth - el.clientWidth < 1) return false;
    return delta > 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  }

  function onTouchStart(e) {
    touchLast = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }

  function onTouchMove(e) {
    if (!touchLast || e.touches.length !== 1) return;
    var t = e.touches[0];
    var dx = t.clientX - touchLast.x;
    var dy = t.clientY - touchLast.y;
    touchLast = { x: t.clientX, y: t.clientY };
    if (!dx && !dy) return;
    var vertical = Math.abs(dy) >= Math.abs(dx);
    for (var n = e.target; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      if (scrollsFurther(n, vertical, vertical ? dy : dx)) return;
    }
    if (e.cancelable) e.preventDefault();
  }

  // The width the element's vertical scrollbar takes (0 for overlay
  // scrollbars, or when there's nothing to scroll).
  function scrollbarWidth(el, style) {
    if (el === document.body) return global.innerWidth - document.documentElement.clientWidth;
    return el.offsetWidth - el.clientWidth -
      (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0);
  }

  function lockScroll(owner) {
    if (owner == null) owner = {};
    if (scrollOwners.indexOf(owner) === -1) {
      if (!scrollOwners.length) {
        var el = pageScroller();
        var style = global.getComputedStyle(el);
        var gap = scrollbarWidth(el, style);
        scrollSaved = { el: el, overflow: el.style.overflow, paddingRight: el.style.paddingRight };
        if (gap > 0) {
          el.style.paddingRight = ((parseFloat(style.paddingRight) || 0) + gap) + 'px';
          el.style.setProperty('--scroll-lock-gap', gap + 'px');
        }
        el.style.overflow = 'hidden';
        if (el !== document.body) {
          scrollSaved.top = el.scrollTop;
          scrollSaved.left = el.scrollLeft;
          el.addEventListener('scroll', holdScroll);
        }
        if (viewport) {
          trackViewport();
          viewport.addEventListener('resize', trackViewport);
          viewport.addEventListener('scroll', trackViewport);
        }
        touchLast = null;
        document.addEventListener('touchstart', onTouchStart, { passive: true });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
      }
      scrollOwners.push(owner);
    }
    return function () { unlockScroll(owner); };
  }

  function unlockScroll(owner) {
    var i = scrollOwners.indexOf(owner);
    if (i === -1) return;
    scrollOwners.splice(i, 1);
    if (!scrollOwners.length && scrollSaved) {
      var el = scrollSaved.el;
      el.removeEventListener('scroll', holdScroll);
      el.style.overflow = scrollSaved.overflow;
      el.style.paddingRight = scrollSaved.paddingRight;
      el.style.removeProperty('--scroll-lock-gap');
      if (viewport) {
        viewport.removeEventListener('resize', trackViewport);
        viewport.removeEventListener('scroll', trackViewport);
        document.documentElement.style.removeProperty('--vv-top');
        document.documentElement.style.removeProperty('--vv-height');
      }
      document.removeEventListener('touchstart', onTouchStart, { passive: true });
      document.removeEventListener('touchmove', onTouchMove, { passive: false });
      touchLast = null;
      scrollSaved = null;
    }
  }

  global.PVScrollLock = { lock: lockScroll, unlock: unlockScroll };

  // ── Layout steps ───────────────────────────────────────────────────────────
  // The breakpoints in styles.css: phone up to 640px; tablet up to 900px,
  // where the nav, the portal sidebar and the filter sidebar all become
  // drawers; wide up to 1100px. Scripts ask here instead of repeating the
  // number, so they switch with the stylesheet.
  global.PVLayout = {
    narrow: '(max-width: 900px)',
    isNarrow: function () { return global.matchMedia(this.narrow).matches; }
  };

  // ── Images with a dark-mode version ──────────────────────────────────────
  // A light image, shown in both themes, and an optional dark one. With both,
  // both are drawn and the site's .light-only / .dark-only rules show the one
  // for the current theme, so it swaps with the theme toggle.
  //   PVThemeImage.elements(light, dark, setup)
  //     → [img] or [lightImg, darkImg]; setup(img) adds the page's classes,
  //       lazy loading, error handling and so on
  //   PVThemeImage.html(light, dark, className, attrs)
  //     → the same as markup: <img src class="className light-only" attrs>…
  function themeImageElements(light, dark, setup) {
    var pair = light && dark;
    return (pair ? [[light, 'light-only'], [dark, 'dark-only']] : [[light || dark, '']]).map(function (p) {
      var img = document.createElement('img');
      img.src = p[0];
      img.alt = '';
      if (setup) setup(img);
      if (p[1]) img.classList.add(p[1]);
      return img;
    });
  }
  function escapeAttr(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function themeImageHtml(light, dark, className, attrs) {
    var pair = light && dark;
    return (pair ? [[light, 'light-only'], [dark, 'dark-only']] : [[light || dark, '']]).map(function (p) {
      var cls = [className, p[1]].filter(Boolean).join(' ');
      return '<img src="' + escapeAttr(p[0]) + '" alt=""' + (cls ? ' class="' + cls + '"' : '') +
        (attrs ? ' ' + attrs : '') + '>';
    }).join('');
  }

  global.PVThemeImage = { elements: themeImageElements, html: themeImageHtml };

  // ── Drag to scroll ───────────────────────────────────────────────────────
  // On desktop, a table wider (or taller) than its box can be dragged with
  // the mouse, as a touch screen swipes it. The box shows a hand cursor only
  // while it can actually scroll; links, buttons, fields and labels in it
  // work as usual, and so does a popup drawn inside it. Dragging takes over
  // from selecting text by dragging (a double-click still selects a word),
  // and the click that ends a drag is swallowed so it doesn't also act on
  // the row under the mouse. Touch and pen keep their native scrolling.
  var DRAG_SCROLL = '.portal-table-wrap, .perm-grid-wrap, .site-table-scroll, .atma-scroll';
  var DRAG_SKIP = 'a, button, input, select, textarea, label, summary, [contenteditable], [role="dialog"], .modal-overlay';
  var DRAG_THRESHOLD = 5;
  var drag = null;

  function scrollAxes(box) {
    return { x: box.scrollWidth - box.clientWidth > 1, y: box.scrollHeight - box.clientHeight > 1 };
  }

  function dragBox(target) {
    var box = target && target.closest ? target.closest(DRAG_SCROLL) : null;
    if (!box) return null;
    // A control or popup inside the box keeps the mouse; one the box itself
    // sits inside (a table in a popup) doesn't count.
    var skip = target.closest(DRAG_SKIP);
    return skip && box.contains(skip) ? null : box;
  }

  function swallowClick(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function endDrag() {
    if (!drag) return;
    if (drag.moved) {
      drag.box.classList.remove('is-dragging');
      // The click that follows this mouseup is part of the drag.
      document.addEventListener('click', swallowClick, true);
      setTimeout(function () { document.removeEventListener('click', swallowClick, true); }, 0);
    }
    drag = null;
  }

  document.addEventListener('mouseover', function (e) {
    var box = e.target && e.target.closest ? e.target.closest(DRAG_SCROLL) : null;
    if (!box) return;
    var axes = scrollAxes(box);
    box.classList.toggle('is-drag-scroll', axes.x || axes.y);
  });

  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    var box = dragBox(e.target);
    if (!box) return;
    var axes = scrollAxes(box);
    if (!axes.x && !axes.y) return;
    drag = { box: box, axes: axes, x: e.clientX, y: e.clientY,
             left: box.scrollLeft, top: box.scrollTop, moved: false };
  });

  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!e.buttons) { endDrag(); return; } // released outside the window
    var dx = drag.axes.x ? e.clientX - drag.x : 0;
    var dy = drag.axes.y ? e.clientY - drag.y : 0;
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      drag.box.classList.add('is-dragging');
      var sel = global.getSelection ? global.getSelection() : null;
      if (sel) sel.removeAllRanges();
    }
    drag.box.scrollLeft = drag.left - dx;
    drag.box.scrollTop = drag.top - dy;
  });

  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  // Images in a table would otherwise start the browser's own drag.
  document.addEventListener('dragstart', function (e) {
    if (drag) e.preventDefault();
  });

  global.PVSession = {
    get: get,
    set: set,
    clear: clear,
    can: can,
    canAny: canAny,
    redirectToLogin: redirectToLogin,
    request: request,
    handoff: handoff,
    signOut: signOut
  };

  syncEdge();
})(window);
