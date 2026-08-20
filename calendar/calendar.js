// ============================================================================
//  Phoenix Vanguard Calendar — read-only agenda of Discord scheduled events
//
//  Reads GET /calendar from pv-med-database-worker, which live-proxies the
//  guild's Discord scheduled events (prefix parsed into a category, title
//  stripped, times normalized to UTC "YYYY-MM-DD HH:MM:SS"). The route is
//  session-gated, so this page soft-gates: logged-out or expired sessions see
//  a "sign in" panel rather than a redirect (mirrors the roll calculator).
//
//  No storage, no RSVP, no Discord links — the site is the display layer.
//  Events are grouped by local day and rendered as an agenda; a filter sidebar
//  (category + search) mirrors the Bounty Board / Job Board pattern.
//
//  Load order (see calendar.html):
//    <script src="/pv/admin/api.js"></script>   (provides PVAdminAPI session)
//    <script src="/pv/calendar/calendar.js"></script>
// ============================================================================

(function () {
  var API_BASE   = "https://pv-med-database-worker.chlorinatorgreen.workers.dev";
  var SESSION_KEY = "pv.admin.session";
  var FILTER_KEY  = "pv-calendar-filters";
  var SIDEBAR_KEY = "pv-calendar-sidebar-hidden";
  var VIEW_KEY    = "pv-calendar-view";

  // The eight prefixes, kept exactly as they are, plus the catch-all. Order is
  // display order in the sidebar. Slugs match the worker's category slugs.
  var CATEGORIES = [
    { slug: "rp",              label: "RP" },
    { slug: "rp-campaign",     label: "RP Campaign" },
    { slug: "community-event", label: "Community Event" },
    { slug: "seasonal",        label: "Seasonal" },
    { slug: "pve",             label: "PVE" },
    { slug: "collab",          label: "Collab" },
    { slug: "event",           label: "Event" },
    { slug: "fc",              label: "FC" },
    { slug: "uncategorized",   label: "Uncategorized" }
  ];
  var CATEGORY_LABEL = {};
  CATEGORIES.forEach(function (c) { CATEGORY_LABEL[c.slug] = c.label; });

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var statusEl     = document.getElementById("calendar-status");
  var layoutEl     = document.getElementById("calendar-layout");
  var sidebarEl    = document.getElementById("calendar-sidebar");
  var toggleBtn    = document.getElementById("sidebar-toggle-btn");
  var closeBtn     = document.getElementById("sidebar-close-btn");
  var overlay      = document.getElementById("campaign-overlay");
  var searchInput  = document.getElementById("calendar-search");
  var catListEl    = document.getElementById("filter-category-list");
  var resetBtn     = document.getElementById("filter-reset");
  var refreshBtn   = document.getElementById("calendar-refresh");
  var agendaEl     = document.getElementById("calendar-agenda");
  var monthEl      = document.getElementById("calendar-month");
  var countEl      = document.getElementById("calendar-count");
  var viewAgendaBtn= document.getElementById("view-agenda");
  var viewMonthBtn = document.getElementById("view-month");
  var monthNavEl   = document.getElementById("cal-monthnav");
  var monthLabelEl = document.getElementById("cal-month-label");
  var prevBtn      = document.getElementById("cal-prev");
  var nextBtn      = document.getElementById("cal-next");
  var todayBtn     = document.getElementById("cal-today-btn");
  var modalOverlay = document.getElementById("calendar-modal-overlay");
  var modalBody    = document.getElementById("calendar-modal-body");
  var modalClose   = document.getElementById("calendar-modal-close");

  // ── State ──────────────────────────────────────────────────────────────────
  var allEvents = [];
  var filters = { search: "", categories: {} };  // categories: { rp: true, ... }
  var view = "agenda";                            // "agenda" | "month"
  var monthCursor = { year: 0, month: 0 };        // displayed month (month 0-based)

  // ── Session (shared with the management portal) ────────────────────────────
  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
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

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escapeHTML(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function isMobile() { return window.innerWidth <= 768; }

  // Worker sends UTC "YYYY-MM-DD HH:MM:SS"; parse to epoch ms (local render).
  function parseUtc(s) {
    if (!s) return null;
    var t = Date.parse(String(s).replace(" ", "T") + "Z");
    return isNaN(t) ? null : t;
  }

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  // The worker builds the CDN URL at ?size=512 for list thumbnails; the modal
  // shows it much larger, so request a bigger rendition to avoid softness.
  function hiResImage(url) {
    if (!url) return url;
    return /([?&])size=\d+/.test(url)
      ? url.replace(/([?&])size=\d+/, "$1size=1024")
      : url + (url.indexOf("?") === -1 ? "?" : "&") + "size=1024";
  }

  // Local Y-M-D key so events bucket into the viewer's calendar day.
  function dayKey(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function todayKey() { return dayKey(Date.now()); }

  function fmtDayParts(ms) {
    var d = new Date(ms);
    return {
      weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
      date: d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    };
  }

  function loadFilters() {
    try {
      var raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          filters.search = String(saved.search || "");
          filters.categories = (saved.categories && typeof saved.categories === "object") ? saved.categories : {};
        }
      }
    } catch (_e) { /* ignore */ }
  }
  function saveFilters() {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch (_e) { /* ignore */ }
  }

  // ── Status panels ──────────────────────────────────────────────────────────
  function showPanel(html) {
    layoutEl.hidden = true;
    statusEl.innerHTML = html;
  }
  function showLayout() {
    statusEl.innerHTML = "";
    layoutEl.hidden = false;
  }

  function renderLoading() {
    showPanel('<div class="cal-panel"><p>Loading events&hellip;</p></div>');
  }

  function renderGate() {
    var back = encodeURIComponent(window.location.pathname);
    showPanel(
      '<div class="cal-panel">' +
        '<h2>Members only</h2>' +
        '<p>The event calendar is available to signed-in Phoenix Vanguard members.</p>' +
        '<a class="cal-panel-btn" href="/pv/admin/login.html?redirect=' + back + '">Sign in</a>' +
      '</div>'
    );
  }

  function renderError(message) {
    showPanel(
      '<div class="cal-panel">' +
        '<h2>Couldn’t load the calendar</h2>' +
        '<p>' + escapeHTML(message || "Please try again in a moment.") + '</p>' +
        '<button type="button" class="cal-panel-btn" id="cal-retry">Try again</button>' +
      '</div>'
    );
    var retry = document.getElementById("cal-retry");
    if (retry) retry.addEventListener("click", load);
  }

  // ── Sidebar (campaign pattern) ─────────────────────────────────────────────
  function openSidebar() {
    if (isMobile()) {
      sidebarEl.classList.add("sidebar-open");
      overlay.classList.add("active");
      overlay.setAttribute("aria-hidden", "false");
    } else {
      sidebarEl.classList.remove("sidebar-hidden");
      try { localStorage.setItem(SIDEBAR_KEY, "0"); } catch (_) {}
    }
  }
  function closeSidebar() {
    if (isMobile()) {
      sidebarEl.classList.remove("sidebar-open");
      overlay.classList.remove("active");
      overlay.setAttribute("aria-hidden", "true");
    } else {
      sidebarEl.classList.add("sidebar-hidden");
      try { localStorage.setItem(SIDEBAR_KEY, "1"); } catch (_) {}
    }
  }
  function toggleSidebar() {
    if (isMobile()) { openSidebar(); return; }
    sidebarEl.classList.contains("sidebar-hidden") ? openSidebar() : closeSidebar();
  }
  function restoreSidebarState() {
    if (isMobile()) return;
    try { if (localStorage.getItem(SIDEBAR_KEY) === "1") sidebarEl.classList.add("sidebar-hidden"); } catch (_) {}
  }

  // ── Filter UI ──────────────────────────────────────────────────────────────
  // Only categories that actually appear in the data get a checkbox, so the
  // list never shows empty buckets (e.g. "Uncategorized" only when a title
  // failed to match a prefix).
  function buildFilterUI() {
    var present = {};
    allEvents.forEach(function (e) { present[e.category] = true; });

    catListEl.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      if (!present[cat.slug]) { delete filters.categories[cat.slug]; return; }

      var li = document.createElement("li");
      li.className = "venues-filter-item";

      var label = document.createElement("label");
      label.className = "venues-filter-check";

      var input = document.createElement("input");
      input.type = "checkbox";
      input.value = cat.slug;
      input.checked = !!filters.categories[cat.slug];
      input.addEventListener("change", function () {
        if (input.checked) filters.categories[cat.slug] = true;
        else delete filters.categories[cat.slug];
        saveFilters();
        render();
      });

      var text = document.createElement("span");
      text.className = "venues-filter-check-text";
      text.textContent = cat.label;

      var count = document.createElement("span");
      count.className = "venues-filter-count";
      count.dataset.cat = cat.slug;
      count.textContent = "0";

      label.appendChild(input);
      label.appendChild(text);
      label.appendChild(count);
      li.appendChild(label);
      catListEl.appendChild(li);
    });

    searchInput.value = filters.search;
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  function matchesSearch(e, q) {
    if (!q) return true;
    var hay = (e.title + " " + (e.description || "") + " " + (e.location || "")).toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  // Category counts reflect the search-filtered set (not the category
  // selection), so a facet shows how many you'd get by ticking it.
  function updateCounts() {
    var q = filters.search.trim().toLowerCase();
    var counts = {};
    allEvents.forEach(function (e) {
      if (matchesSearch(e, q)) counts[e.category] = (counts[e.category] || 0) + 1;
    });
    catListEl.querySelectorAll(".venues-filter-count").forEach(function (el) {
      el.textContent = String(counts[el.dataset.cat] || 0);
    });
  }

  function applyFilters() {
    var q = filters.search.trim().toLowerCase();
    var cats = Object.keys(filters.categories);
    var anyCat = cats.length > 0;
    return allEvents.filter(function (e) {
      if (anyCat && !filters.categories[e.category]) return false;
      return matchesSearch(e, q);
    });
  }

  // ── Agenda render ──────────────────────────────────────────────────────────
  function eventRowHTML(e) {
    var startMs = parseUtc(e.starts_at);
    var endMs = parseUtc(e.ends_at);
    var cat = e.category || "uncategorized";
    var badge = '<span class="cal-badge" data-cat="' + escapeHTML(cat) + '">'
      + escapeHTML(CATEGORY_LABEL[cat] || cat) + '</span>';

    var timeHTML =
      '<div class="cal-event-time">' +
        '<span class="cal-event-start">' + (startMs ? escapeHTML(fmtTime(startMs)) : "—") + '</span>' +
        (endMs ? '<span class="cal-event-end">to ' + escapeHTML(fmtTime(endMs)) + '</span>' : "") +
      '</div>';

    var meta = [];
    if (e.location) {
      meta.push('<span class="cal-event-loc">📍 ' + escapeHTML(e.location) + '</span>');
    }
    if (e.recurring) {
      meta.push('<span class="cal-recurring">↻ Recurring</span>');
    }
    var metaHTML = meta.length ? '<div class="cal-event-meta">' + meta.join("") + '</div>' : "";

    var thumb = e.image_url
      ? '<img class="cal-event-thumb" src="' + escapeHTML(e.image_url) + '" alt="" loading="lazy" />'
      : "";

    return '<button type="button" class="cal-event" data-id="' + escapeHTML(e.id) + '">' +
        thumb +
        '<div class="cal-event-content">' +
          timeHTML +
          '<div class="cal-event-body">' +
            '<div class="cal-event-title-row">' + badge +
              '<span class="cal-event-title">' + escapeHTML(e.title) + '</span>' +
            '</div>' +
            metaHTML +
          '</div>' +
        '</div>' +
      '</button>';
  }

  function renderAgenda() {
    updateCounts();
    var events = applyFilters().slice().sort(function (a, b) {
      return (parseUtc(a.starts_at) || 0) - (parseUtc(b.starts_at) || 0);
    });

    countEl.textContent = events.length + (events.length === 1 ? " event" : " events");

    if (!events.length) {
      agendaEl.innerHTML = allEvents.length
        ? '<div class="cal-empty">No events match your filters.</div>'
        : '<div class="cal-empty">No upcoming events are scheduled right now.</div>';
      return;
    }

    // Group into days, preserving chronological order.
    var groups = [];
    var index = {};
    var tKey = todayKey();
    events.forEach(function (e) {
      var ms = parseUtc(e.starts_at);
      var key = ms ? dayKey(ms) : "undated";
      if (!(key in index)) {
        index[key] = groups.length;
        groups.push({ key: key, ms: ms, events: [] });
      }
      groups[index[key]].events.push(e);
    });

    var html = groups.map(function (g) {
      var header;
      if (g.ms) {
        var parts = fmtDayParts(g.ms);
        var isToday = g.key === tKey;
        header =
          '<div class="cal-day-header' + (isToday ? " is-today" : "") + '">' +
            '<span class="cal-day-weekday">' + escapeHTML(parts.weekday) + '</span>' +
            '<span class="cal-day-date">' + escapeHTML(parts.date) + '</span>' +
            (isToday ? '<span class="cal-today-tag">Today</span>' : "") +
          '</div>';
      } else {
        header = '<div class="cal-day-header"><span class="cal-day-weekday">Date TBD</span></div>';
      }
      return '<section class="cal-day">' + header + g.events.map(eventRowHTML).join("") + '</section>';
    }).join("");

    agendaEl.innerHTML = html;
  }

  // ── Month grid ─────────────────────────────────────────────────────────────
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function renderMonth() {
    updateCounts();

    // Bucket filtered events by local day, each day sorted by start time.
    var byDay = {};
    applyFilters().forEach(function (e) {
      var ms = parseUtc(e.starts_at);
      if (ms == null) return;
      var k = dayKey(ms);
      (byDay[k] || (byDay[k] = [])).push(e);
    });
    Object.keys(byDay).forEach(function (k) {
      byDay[k].sort(function (a, b) { return (parseUtc(a.starts_at) || 0) - (parseUtc(b.starts_at) || 0); });
    });

    var year = monthCursor.year, month = monthCursor.month;
    var first = new Date(year, month, 1);
    monthLabelEl.textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    // Grid starts on the Sunday on//before the 1st, runs a fixed 6 weeks.
    var gridStart = new Date(year, month, 1 - first.getDay());
    var tKey = todayKey();

    var html = '<div class="cal-month-grid">';
    WEEKDAYS.forEach(function (w) { html += '<div class="cal-dow">' + w + '</div>'; });

    for (var i = 0; i < 42; i++) {
      var d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      var key = dayKey(d.getTime());
      var evs = byDay[key] || [];
      var cls = "cal-cell";
      if (d.getMonth() !== month) cls += " is-out";
      if (key === tKey) cls += " is-today";
      if (evs.length) cls += " has-events";

      // Cell background is the first event's banner (right-slice via CSS).
      var media = (evs.length && evs[0].image_url)
        ? '<div class="cal-cell-media" style="background-image:url(&quot;' + escapeHTML(evs[0].image_url) + '&quot;)"></div>' +
          '<div class="cal-cell-scrim"></div>'
        : "";

      var evHtml = evs.map(function (e) {
        var cat = e.category || "uncategorized";
        return '<button type="button" class="cal-cell-event" data-id="' + escapeHTML(e.id) + '" title="' + escapeHTML(e.title) + '">' +
          '<span class="cal-cell-dot" data-cat="' + escapeHTML(cat) + '"></span>' +
          '<span class="cal-cell-ev-title">' + escapeHTML(e.title) + '</span>' +
        '</button>';
      }).join("");

      html += '<div class="' + cls + '">' + media +
        '<div class="cal-cell-num">' + d.getDate() + '</div>' +
        (evHtml ? '<div class="cal-cell-events">' + evHtml + '</div>' : "") +
      '</div>';
    }
    html += '</div>';
    monthEl.innerHTML = html;
  }

  // Dispatch to the active view (both share filters + the detail modal).
  function render() {
    var isMonth = view === "month";
    agendaEl.hidden = isMonth;
    monthEl.hidden = !isMonth;
    monthNavEl.hidden = !isMonth;
    countEl.hidden = isMonth;
    viewAgendaBtn.setAttribute("aria-pressed", isMonth ? "false" : "true");
    viewMonthBtn.setAttribute("aria-pressed", isMonth ? "true" : "false");
    if (isMonth) renderMonth(); else renderAgenda();
  }

  // ── Detail modal ───────────────────────────────────────────────────────────
  function openModal(e) {
    var startMs = parseUtc(e.starts_at);
    var endMs = parseUtc(e.ends_at);
    var cat = e.category || "uncategorized";

    var when = "—";
    if (startMs) {
      var d = new Date(startMs);
      when = d.toLocaleString(undefined, {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit"
      });
      if (endMs) when += " – " + fmtTime(endMs);
    }

    var rows = "";
    rows += '<div class="cal-modal-meta-row"><span class="cal-modal-meta-label">When</span><span>' + escapeHTML(when) + '</span></div>';
    if (e.location) {
      rows += '<div class="cal-modal-meta-row"><span class="cal-modal-meta-label">Where</span><span>' + escapeHTML(e.location) + '</span></div>';
    }
    if (e.recurring) {
      rows += '<div class="cal-modal-meta-row"><span class="cal-modal-meta-label">Repeats</span><span>Recurring event</span></div>';
    }

    modalBody.innerHTML =
      (e.image_url ? '<img class="cal-modal-media" src="' + escapeHTML(hiResImage(e.image_url)) + '" alt="" />' : "") +
      '<div class="cal-modal-content">' +
        '<span class="cal-badge" data-cat="' + escapeHTML(cat) + '">' + escapeHTML(CATEGORY_LABEL[cat] || cat) + '</span>' +
        '<h2 class="cal-modal-title" id="calendar-modal-title">' + escapeHTML(e.title) + '</h2>' +
        '<div class="cal-modal-meta">' + rows + '</div>' +
        (e.description ? '<div class="cal-modal-desc">' + escapeHTML(e.description) + '</div>' : "") +
      '</div>';

    // styles.css shows the overlay via .is-open (not .active).
    modalOverlay.classList.add("is-open");
    modalOverlay.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    modalOverlay.classList.remove("is-open");
    modalOverlay.setAttribute("aria-hidden", "true");
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  function load() {
    var session = getSession();
    if (!session) { renderGate(); return; }

    renderLoading();

    fetch(API_BASE + "/calendar", {
      headers: { "Accept": "application/json", "Authorization": "Bearer " + session.token }
    }).then(function (res) {
      if (res.status === 401) { renderGate(); return null; }
      return res.text().then(function (text) {
        var data = null;
        if (text) { try { data = JSON.parse(text); } catch (_e) { data = null; } }
        if (!res.ok) {
          var msg = (data && (data.error || data.message)) || ("Request failed (" + res.status + ")");
          throw new Error(msg);
        }
        return data;
      });
    }).then(function (data) {
      if (data === null) return;  // gate already shown
      allEvents = Array.isArray(data) ? data : [];
      showLayout();
      buildFilterUI();
      render();
    }).catch(function (err) {
      renderError(err && err.message);
    });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────
  toggleBtn.addEventListener("click", toggleSidebar);
  closeBtn.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);
  restoreSidebarState();

  searchInput.addEventListener("input", function () {
    filters.search = searchInput.value;
    saveFilters();
    render();
  });

  resetBtn.addEventListener("click", function () {
    filters.search = "";
    filters.categories = {};
    saveFilters();
    searchInput.value = "";
    catListEl.querySelectorAll("input[type=checkbox]").forEach(function (i) { i.checked = false; });
    render();
  });

  refreshBtn.addEventListener("click", load);

  // View toggle + month navigation.
  function setView(v) {
    view = v;
    try { localStorage.setItem(VIEW_KEY, v); } catch (_e) {}
    render();
  }
  viewAgendaBtn.addEventListener("click", function () { setView("agenda"); });
  viewMonthBtn.addEventListener("click", function () { setView("month"); });

  function shiftMonth(delta) {
    var m = monthCursor.month + delta;
    var y = monthCursor.year + Math.floor(m / 12);
    monthCursor = { year: y, month: ((m % 12) + 12) % 12 };
    renderMonth();
  }
  prevBtn.addEventListener("click", function () { shiftMonth(-1); });
  nextBtn.addEventListener("click", function () { shiftMonth(1); });
  todayBtn.addEventListener("click", function () {
    var n = new Date();
    monthCursor = { year: n.getFullYear(), month: n.getMonth() };
    renderMonth();
  });

  // Detail modal opens from either view (agenda rows or month-cell events).
  function onEventClick(ev) {
    var btn = ev.target.closest(".cal-event, .cal-cell-event");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var e = allEvents.find(function (x) { return String(x.id) === String(id); });
    if (e) openModal(e);
  }
  agendaEl.addEventListener("click", onEventClick);
  monthEl.addEventListener("click", onEventClick);

  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", function (ev) {
    if (ev.target === modalOverlay) closeModal();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") closeModal();
  });

  // ── Boot ───────────────────────────────────────────────────────────────────
  loadFilters();
  try { var v = localStorage.getItem(VIEW_KEY); if (v === "month" || v === "agenda") view = v; } catch (_e) {}
  var now = new Date();
  monthCursor = { year: now.getFullYear(), month: now.getMonth() };
  load();
})();
