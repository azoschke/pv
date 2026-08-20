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
    { slug: "update",          label: "Update" },
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
  var weekEl       = document.getElementById("calendar-week");
  var monthEl      = document.getElementById("calendar-month");
  var countEl      = document.getElementById("calendar-count");
  var viewAgendaBtn= document.getElementById("view-agenda");
  var viewWeekBtn  = document.getElementById("view-week");
  var viewMonthBtn = document.getElementById("view-month");
  var monthNavEl   = document.getElementById("cal-monthnav");
  var periodLabelEl= document.getElementById("cal-period-label");
  var prevBtn      = document.getElementById("cal-prev");
  var nextBtn      = document.getElementById("cal-next");
  var todayBtn     = document.getElementById("cal-today-btn");
  var modalOverlay = document.getElementById("calendar-modal-overlay");
  var modalBody    = document.getElementById("calendar-modal-body");
  var modalClose   = document.getElementById("calendar-modal-close");

  // ── State ──────────────────────────────────────────────────────────────────
  var allEvents = [];
  var filters = { search: "", categories: {} };  // categories: { rp: true, ... }
  var view = "agenda";                            // "agenda" | "week" | "month"
  var monthCursor = { year: 0, month: 0 };        // displayed month (month 0-based)
  var weekCursor = null;                           // a Date within the displayed week

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

  // ── Discord markdown ───────────────────────────────────────────────────────
  // Render the subset Discord uses in event descriptions to safe HTML. Input is
  // HTML-escaped FIRST, so every tag we emit below is one we control — the
  // markdown source can never inject markup.
  function fmtRelative(ms) {
    var diff = ms - Date.now();
    var future = diff >= 0;
    var s = Math.round(Math.abs(diff) / 1000);
    var units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
    for (var i = 0; i < units.length; i++) {
      var n = Math.floor(s / units[i][1]);
      if (n >= 1) {
        var label = n + " " + units[i][0] + (n === 1 ? "" : "s");
        return future ? "in " + label : label + " ago";
      }
    }
    return "just now";
  }

  function fmtDiscordTs(unixSec, style) {
    var ms = unixSec * 1000;
    var d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    switch (style) {
      case "t": return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      case "T": return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
      case "d": return d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
      case "D": return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      case "F": return d.toLocaleString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
      case "R": return fmtRelative(ms);
      default:  return d.toLocaleString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
  }

  function renderMarkdown(text) {
    if (text == null) return "";
    var s = escapeHTML(String(text));
    s = s.replace(/```([\s\S]*?)```/g, function (_m, c) { return "<pre><code>" + c.replace(/^\n+|\n+$/g, "") + "</code></pre>"; });
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^\n]+?)__/g, "<u>$1</u>");
    s = s.replace(/~~([^\n]+?)~~/g, "<s>$1</s>");
    s = s.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
    s = s.replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s).,!?])/g, "$1<em>$2</em>");
    // Masked links [text](url) before bare-URL autolinking.
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Discord timestamps <t:unix[:style]> — angle brackets are escaped.
    s = s.replace(/&lt;t:(\d+)(?::([tTdDfFR]))?&gt;/g, function (_m, ts, style) { return fmtDiscordTs(Number(ts), style || "f"); });
    // Bare URLs not already inside an href.
    s = s.replace(/(^|[^"'>=])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    s = s.replace(/\n/g, "<br>");
    return s;
  }

  // Local Y-M-D key so events bucket into the viewer's calendar day.
  function dayKey(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function todayKey() { return dayKey(Date.now()); }

  // Sunday-anchored start of the week containing `date`, at local midnight.
  function startOfWeek(date) {
    var d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  }

  // Compact date range label, e.g. "Aug 17 – 23, 2026" or "Aug 31 – Sep 6".
  function fmtRange(start, end) {
    var sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    var sameYear = start.getFullYear() === end.getFullYear();
    var sMonth = start.toLocaleDateString(undefined, { month: "short" });
    var eMonth = end.toLocaleDateString(undefined, { month: "short" });
    if (sameMonth) return sMonth + " " + start.getDate() + " – " + end.getDate() + ", " + end.getFullYear();
    if (sameYear)  return sMonth + " " + start.getDate() + " – " + eMonth + " " + end.getDate() + ", " + end.getFullYear();
    return sMonth + " " + start.getDate() + ", " + start.getFullYear() + " – " + eMonth + " " + end.getDate() + ", " + end.getFullYear();
  }

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

  // Group a sorted event list into day sections (header + rows). Shared by the
  // Agenda and Week views so they render identically.
  function agendaSectionsHTML(events) {
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

    return groups.map(function (g) {
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
  }

  function byStart(a, b) { return (parseUtc(a.starts_at) || 0) - (parseUtc(b.starts_at) || 0); }

  function renderAgenda() {
    updateCounts();
    var events = applyFilters().slice().sort(byStart);
    countEl.textContent = events.length + (events.length === 1 ? " event" : " events");

    agendaEl.innerHTML = events.length
      ? agendaSectionsHTML(events)
      : (allEvents.length
          ? '<div class="cal-empty">No events match your filters.</div>'
          : '<div class="cal-empty">No upcoming events are scheduled right now.</div>');
  }

  // ── Month + week grids ─────────────────────────────────────────────────────
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Filtered events bucketed by local day, each day sorted by start time.
  function bucketByDay() {
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
    return byDay;
  }

  function cellMediaHTML(ev) {
    return '<div class="cal-cell-media" style="background-image:url(&quot;' + escapeHTML(ev.image_url) + '&quot;)"></div>' +
           '<div class="cal-cell-scrim"></div>';
  }
  function cellEventChip(e) {
    var cat = e.category || "uncategorized";
    return '<button type="button" class="cal-cell-event" data-id="' + escapeHTML(e.id) + '" title="' + escapeHTML(e.title) + '">' +
      '<span class="cal-cell-dot" data-cat="' + escapeHTML(cat) + '"></span>' +
      '<span class="cal-cell-ev-title">' + escapeHTML(e.title) + '</span>' +
    '</button>';
  }

  function renderMonth() {
    updateCounts();
    var byDay = bucketByDay();

    var year = monthCursor.year, month = monthCursor.month;
    var first = new Date(year, month, 1);
    periodLabelEl.textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    // Grid starts on the Sunday on/before the 1st. Render only the weeks the
    // month actually touches (no trailing all-next-month week).
    var startDow = first.getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var weeks = Math.ceil((startDow + daysInMonth) / 7);
    var gridStart = new Date(year, month, 1 - startDow);
    var tKey = todayKey();

    var html = '<div class="cal-month-grid">';
    WEEKDAYS.forEach(function (w) { html += '<div class="cal-dow">' + w + '</div>'; });

    for (var i = 0; i < weeks * 7; i++) {
      var d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      var evs = byDay[dayKey(d.getTime())] || [];
      var cls = "cal-cell";
      if (d.getMonth() !== month) cls += " is-out";
      if (dayKey(d.getTime()) === tKey) cls += " is-today";
      if (evs.length) cls += " has-events";

      // A single-event day is clickable anywhere; multi-event days use chips.
      var single = evs.length === 1 ? ' data-single-id="' + escapeHTML(evs[0].id) + '"' : "";
      var media = (evs.length && evs[0].image_url) ? cellMediaHTML(evs[0]) : "";
      var evHtml = evs.map(cellEventChip).join("");

      html += '<div class="' + cls + '"' + single + '>' + media +
        '<div class="cal-cell-num">' + d.getDate() + '</div>' +
        (evHtml ? '<div class="cal-cell-events">' + evHtml + '</div>' : "") +
      '</div>';
    }
    html += '</div>';
    monthEl.innerHTML = html;
  }

  // Week view reuses the agenda's day-section styling, scoped to the seven days
  // of the displayed week.
  function renderWeek() {
    updateCounts();
    var start = startOfWeek(weekCursor);
    var startMs = start.getTime();
    var endMs = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime();
    periodLabelEl.textContent = fmtRange(start, new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));

    var events = applyFilters().filter(function (e) {
      var ms = parseUtc(e.starts_at);
      return ms != null && ms >= startMs && ms < endMs;
    }).sort(byStart);

    weekEl.innerHTML = events.length
      ? agendaSectionsHTML(events)
      : '<div class="cal-empty">No events this week.</div>';
  }

  // Dispatch to the active view (all three share filters + the detail modal).
  function render() {
    agendaEl.hidden = view !== "agenda";
    weekEl.hidden = view !== "week";
    monthEl.hidden = view !== "month";
    monthNavEl.hidden = view === "agenda";
    countEl.hidden = view !== "agenda";
    viewAgendaBtn.setAttribute("aria-pressed", view === "agenda" ? "true" : "false");
    viewWeekBtn.setAttribute("aria-pressed", view === "week" ? "true" : "false");
    viewMonthBtn.setAttribute("aria-pressed", view === "month" ? "true" : "false");
    if (view === "month") renderMonth();
    else if (view === "week") renderWeek();
    else renderAgenda();
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
        (e.description ? '<div class="cal-modal-desc">' + renderMarkdown(e.description) + '</div>' : "") +
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

  // View toggle.
  function setView(v) {
    view = v;
    try { localStorage.setItem(VIEW_KEY, v); } catch (_e) {}
    render();
  }
  viewAgendaBtn.addEventListener("click", function () { setView("agenda"); });
  viewWeekBtn.addEventListener("click", function () { setView("week"); });
  viewMonthBtn.addEventListener("click", function () { setView("month"); });

  // Period navigation — steps by month or by week depending on the active view.
  function shiftPeriod(delta) {
    if (view === "week") {
      var s = startOfWeek(weekCursor);
      weekCursor = new Date(s.getFullYear(), s.getMonth(), s.getDate() + delta * 7);
      renderWeek();
    } else {
      var m = monthCursor.month + delta;
      monthCursor = { year: monthCursor.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
      renderMonth();
    }
  }
  prevBtn.addEventListener("click", function () { shiftPeriod(-1); });
  nextBtn.addEventListener("click", function () { shiftPeriod(1); });
  todayBtn.addEventListener("click", function () {
    var n = new Date();
    monthCursor = { year: n.getFullYear(), month: n.getMonth() };
    weekCursor = n;
    if (view === "week") renderWeek(); else renderMonth();
  });

  // Detail modal opens from any view: an explicit event chip/row/card, or
  // clicking anywhere on a day that has exactly one event.
  function openById(id) {
    var e = allEvents.find(function (x) { return String(x.id) === String(id); });
    if (e) openModal(e);
  }
  function onEventClick(ev) {
    var btn = ev.target.closest(".cal-event, .cal-cell-event");
    if (btn) { openById(btn.getAttribute("data-id")); return; }
    var cell = ev.target.closest(".cal-cell[data-single-id]");
    if (cell) openById(cell.getAttribute("data-single-id"));
  }
  agendaEl.addEventListener("click", onEventClick);
  weekEl.addEventListener("click", onEventClick);
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
  try { var v = localStorage.getItem(VIEW_KEY); if (v === "month" || v === "week" || v === "agenda") view = v; } catch (_e) {}
  var now = new Date();
  monthCursor = { year: now.getFullYear(), month: now.getMonth() };
  weekCursor = now;
  load();
})();
