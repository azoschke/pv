// ============================================================================
//  Phoenix Vanguard Staff Roster — public directory
//
//  Mirrors the venues / job-board pattern: a campaign-style filter sidebar plus
//  a card grid with click-to-expand modal. Filters by Position and Specialty
//  (tag). Roster is sourced from FC members whose Faction includes "Medical"
//  AND who have a saved Medical Division profile (the worker enforces both;
//  members without a profile are hidden from this page).
//
//  Worker endpoint used:
//    GET /medical-staff
//      -> [{ member_id, name, positions: [...], tags: [...], description }]
// ============================================================================

(function () {
  var API_BASE = "https://pv-med-database-worker.chlorinatorgreen.workers.dev";
  var SIDEBAR_KEY = "pv-staff-sidebar-hidden";
  var FILTER_KEY  = "pv-staff-filters";

  // Authoritative position order — used for the filter list and for sorting
  // cards on the page. Must mirror admin/medical-staff.js POSITIONS.
  var POSITION_ORDER = [
    "Medical Lead",
    "Assistant Medical Lead",
    "Secretary",
    "Staff Medic",
    "Therapist",
    "Physical Therapist",
    "Nutritionist",
    "Supply Coordinator",
    "Student Medic"
  ];

  var TAG_ORDER = [
    "Surgery",
    "Aetherology",
    "Alchemy",
    "Herbal Remedies",
    "Research",
    "Scheduling",
    "Physical Check-up",
    "Counseling",
    "Physical Therapy",
    "Nutrition",
    "Stock Management"
  ];

  // Backdrop palette for the colored card header (cards have no images).
  // Picked per primary position so the grid reads at a glance.
  var POSITION_PALETTE = {
    "Medical Lead":           { from: "#3a2225", to: "#1f1214" },
    "Assistant Medical Lead": { from: "#3a2c1e", to: "#1f1810" },
    "Secretary":              { from: "#2e1f3a", to: "#170f20" },
    "Staff Medic":            { from: "#1f3a2e", to: "#10201a" },
    "Therapist":              { from: "#1f3340", to: "#101c25" },
    "Physical Therapist":     { from: "#1f2f3a", to: "#101820" },
    "Nutritionist":           { from: "#3a3522", to: "#1f1c12" },
    "Supply Coordinator":     { from: "#2a2f3a", to: "#141820" },
    "Student Medic":          { from: "#33363f", to: "#1a1c22" }
  };
  var FALLBACK_PALETTE = { from: "#33363f", to: "#1a1c22" };

  // ── DOM refs ─────────────────────────────────────────────────────────────
  var sidebarEl     = document.getElementById("staff-sidebar");
  var toggleBtn     = document.getElementById("sidebar-toggle-btn");
  var closeBtn      = document.getElementById("sidebar-close-btn");
  var overlay       = document.getElementById("campaign-overlay");
  var searchInput   = document.getElementById("staff-search");
  var positionListEl = document.getElementById("filter-position-list");
  var tagListEl     = document.getElementById("filter-tag-list");
  var resetBtn      = document.getElementById("filter-reset");
  var gridEl        = document.getElementById("staff-grid");
  var countEl       = document.getElementById("staff-count");
  var modalOverlay  = document.getElementById("staff-modal-overlay");
  var modalBody     = document.getElementById("staff-modal-body");
  var modalClose    = document.getElementById("staff-modal-close");

  if (window.marked && marked.use) marked.use({ breaks: true });

  // ── State ────────────────────────────────────────────────────────────────
  var allStaff = [];
  var filters = {
    search: "",
    positions: {},   // { "Medical Lead": true, ... }
    tags: {}         // { Surgery: true, ... }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  function escapeHTML(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function isMobile() { return window.innerWidth <= 768; }

  // Coerces a string-or-array field into a clean array of strings.
  function asList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(function (s) { return String(s).trim(); }).filter(Boolean);
    }
    return String(value)
      .split(",")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function primaryPosition(positions) {
    var ranks = positions.map(function (p) {
      var i = POSITION_ORDER.indexOf(p);
      return { p: p, i: i === -1 ? POSITION_ORDER.length : i };
    });
    ranks.sort(function (a, b) { return a.i - b.i; });
    return ranks.length ? ranks[0].p : "";
  }

  function positionRank(positions) {
    if (!positions || !positions.length) return POSITION_ORDER.length;
    var min = POSITION_ORDER.length;
    for (var i = 0; i < positions.length; i++) {
      var idx = POSITION_ORDER.indexOf(positions[i]);
      if (idx !== -1 && idx < min) min = idx;
    }
    return min;
  }

  function loadFilters() {
    try {
      var raw = localStorage.getItem(FILTER_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        filters.search    = String(saved.search || "");
        filters.positions = saved.positions && typeof saved.positions === "object" ? saved.positions : {};
        filters.tags      = saved.tags && typeof saved.tags === "object" ? saved.tags : {};
      }
    } catch (_e) { /* ignore */ }
  }

  function saveFilters() {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); }
    catch (_e) { /* ignore */ }
  }

  // ── Sidebar (campaign pattern) ───────────────────────────────────────────
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

  toggleBtn.addEventListener("click", toggleSidebar);
  closeBtn.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);
  restoreSidebarState();

  // ── Build filter checkboxes (with live counts) ───────────────────────────
  function renderCheckboxList(listEl, items, kind) {
    listEl.innerHTML = "";
    items.forEach(function (it) {
      var li = document.createElement("li");
      li.className = "venues-filter-item";

      var label = document.createElement("label");
      label.className = "venues-filter-check";

      var input = document.createElement("input");
      input.type = "checkbox";
      input.value = it.value;
      input.checked = !!filters[kind][it.value];
      input.addEventListener("change", function () {
        if (input.checked) filters[kind][it.value] = true;
        else delete filters[kind][it.value];
        saveFilters();
        renderGrid();
      });

      var text = document.createElement("span");
      text.className = "venues-filter-check-text";
      text.textContent = it.label;

      var count = document.createElement("span");
      count.className = "venues-filter-count";
      count.dataset.kind = kind;
      count.dataset.value = it.value;
      count.textContent = "0";

      label.appendChild(input);
      label.appendChild(text);
      label.appendChild(count);
      li.appendChild(label);
      listEl.appendChild(li);
    });
  }

  function buildFilterUI() {
    renderCheckboxList(
      positionListEl,
      POSITION_ORDER.map(function (p) { return { value: p, label: p }; }),
      "positions"
    );
    renderCheckboxList(
      tagListEl,
      TAG_ORDER.map(function (t) { return { value: t, label: t }; }),
      "tags"
    );

    searchInput.value = filters.search;

    searchInput.addEventListener("input", function () {
      filters.search = searchInput.value;
      saveFilters();
      renderGrid();
    });

    resetBtn.addEventListener("click", function () {
      filters = { search: "", positions: {}, tags: {} };
      saveFilters();
      searchInput.value = "";
      positionListEl.querySelectorAll('input[type="checkbox"]').forEach(function (i) { i.checked = false; });
      tagListEl.querySelectorAll('input[type="checkbox"]').forEach(function (i) { i.checked = false; });
      renderGrid();
    });
  }

  // ── Filtering / sorting ──────────────────────────────────────────────────
  function matchesFilters(s) {
    var positions = s._positions;
    var tags = s._tags;

    var posKeys = Object.keys(filters.positions);
    if (posKeys.length) {
      var hit = false;
      for (var i = 0; i < posKeys.length; i++) {
        if (positions.indexOf(posKeys[i]) !== -1) { hit = true; break; }
      }
      if (!hit) return false;
    }

    var tagKeys = Object.keys(filters.tags);
    if (tagKeys.length) {
      var thit = false;
      for (var j = 0; j < tagKeys.length; j++) {
        if (tags.indexOf(tagKeys[j]) !== -1) { thit = true; break; }
      }
      if (!thit) return false;
    }

    var q = (filters.search || "").trim().toLowerCase();
    if (q) {
      var hay = [
        s.name || "",
        s.description || "",
        positions.join(" "),
        tags.join(" ")
      ].join(" ").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function sortStaff(list) {
    var copy = list.slice();
    copy.sort(function (a, b) {
      var ra = positionRank(a._positions);
      var rb = positionRank(b._positions);
      if (ra !== rb) return ra - rb;
      return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
    });
    return copy;
  }

  // ── Counts on filter checkboxes ──────────────────────────────────────────
  function updateCounts() {
    function countForFacet(kind, value) {
      return allStaff.reduce(function (acc, s) {
        var temp = {
          search: filters.search,
          positions: kind === "positions" ? {} : filters.positions,
          tags:      kind === "tags"      ? {} : filters.tags
        };
        var saved = filters;
        filters = temp;
        var ok = matchesFilters(s);
        filters = saved;
        if (!ok) return acc;
        if (kind === "positions") return acc + (s._positions.indexOf(value) !== -1 ? 1 : 0);
        if (kind === "tags")      return acc + (s._tags.indexOf(value)      !== -1 ? 1 : 0);
        return acc;
      }, 0);
    }

    document.querySelectorAll(".venues-filter-count").forEach(function (el) {
      var kind = el.dataset.kind;
      var value = el.dataset.value;
      if (!kind || !value) return;
      el.textContent = String(countForFacet(kind, value));
    });
  }

  // ── Card rendering ───────────────────────────────────────────────────────
  function truncate(str, n) {
    if (!str) return "";
    var s = String(str).trim();
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "…";
  }

  function buildCardEl(s) {
    var primary = primaryPosition(s._positions);
    var palette = POSITION_PALETTE[primary] || FALLBACK_PALETTE;

    var card = document.createElement("button");
    card.type = "button";
    card.className = "venue-card";
    card.setAttribute("aria-label", s.name);

    var media = document.createElement("div");
    media.className = "venue-card-media";
    media.style.background = "linear-gradient(135deg, " + palette.from + " 0%, " + palette.to + " 100%)";

    var sig = document.createElement("span");
    sig.className = "venue-card-sig";
    sig.textContent = (s.name || "").toLowerCase();
    media.appendChild(sig);

    if (primary) {
      var posBadge = document.createElement("span");
      posBadge.className = "venue-badge venue-badge-size";
      posBadge.textContent = primary.toUpperCase();
      media.appendChild(posBadge);
    }

    card.appendChild(media);

    var body = document.createElement("div");
    body.className = "venue-card-body";

    var titleRow = document.createElement("div");
    titleRow.className = "venue-card-title-row";
    var title = document.createElement("h3");
    title.className = "venue-card-title";
    title.textContent = s.name || "Unnamed";
    titleRow.appendChild(title);
    body.appendChild(titleRow);

    if (s._positions.length) {
      var loc = document.createElement("p");
      loc.className = "venue-card-location";
      loc.textContent = s._positions.join(" · ").toUpperCase();
      body.appendChild(loc);
    }

    var desc = document.createElement("p");
    desc.className = "venue-card-desc";
    desc.textContent = truncate(s.description, 160) ||
      "Refer to the full profile for specialties and notes.";
    body.appendChild(desc);

    if (s._tags.length) {
      var tagWrap = document.createElement("div");
      tagWrap.className = "venue-card-tags";
      s._tags.forEach(function (t) {
        var sp = document.createElement("span");
        sp.className = "venue-card-tag";
        sp.textContent = "#" + t;
        tagWrap.appendChild(sp);
      });
      body.appendChild(tagWrap);
    }

    card.appendChild(body);

    card.addEventListener("click", function () { openModal(s); });
    return card;
  }

  function renderGrid() {
    updateCounts();

    var filtered = allStaff.filter(matchesFilters);
    var sorted = sortStaff(filtered);

    countEl.textContent = sorted.length === 1 ? "1 medic" : sorted.length + " medics";

    gridEl.innerHTML = "";

    if (!sorted.length) {
      var empty = document.createElement("div");
      empty.className = "venues-empty";
      empty.innerHTML = '<p>No medics match these filters.</p>' +
        '<p style="font-size:0.95rem; color:var(--text-secondary);">Try clearing a filter or two.</p>';
      gridEl.appendChild(empty);
      return;
    }

    sorted.forEach(function (s) { gridEl.appendChild(buildCardEl(s)); });
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  function openModal(s) {
    var primary = primaryPosition(s._positions);
    var palette = POSITION_PALETTE[primary] || FALLBACK_PALETTE;

    var imgHtml = '<div class="venue-modal-img venue-modal-img-fallback" style="background:linear-gradient(135deg, ' +
      palette.from + ' 0%, ' + palette.to + ' 100%);">' +
      '<span class="venue-card-sig">' + escapeHTML((s.name || "").toLowerCase()) + '</span>' +
      '</div>';

    var descHtml = s.description
      ? (window.marked && marked.parse ? marked.parse(escapeHTML(s.description)) : "<p>" + escapeHTML(s.description) + "</p>")
      : '<p style="color:var(--text-secondary);"><em>No description provided.</em></p>';

    var badges = s._positions.map(function (p) {
      return '<span class="venue-badge venue-badge-size" style="position:static;">' +
        escapeHTML(p.toUpperCase()) + '</span>';
    }).join("");

    var tagsHtml = s._tags.length
      ? '<div class="venue-card-tags venue-modal-tags">' +
        s._tags.map(function (t) {
          return '<span class="venue-card-tag">' + escapeHTML("#" + t) + '</span>';
        }).join("") +
        '</div>'
      : "";

    modalBody.innerHTML =
      imgHtml +
      '<div class="venue-modal-content">' +
        '<div class="venue-modal-badges">' + badges + '</div>' +
        '<h2 class="venue-modal-title" id="staff-modal-title">' + escapeHTML(s.name || "Unnamed") + '</h2>' +
        '<div class="venue-modal-desc">' + descHtml + '</div>' +
        tagsHtml +
      '</div>';

    modalOverlay.classList.add("is-open");
    modalOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modalOverlay.classList.remove("is-open");
    modalOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    modalBody.innerHTML = "";
  }

  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("mousedown", function (e) {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modalOverlay.classList.contains("is-open")) closeModal();
  });

  // ── Boot ─────────────────────────────────────────────────────────────────
  function normalise(rows) {
    return rows.map(function (r) {
      var positions = asList(r.positions);
      var tags = asList(r.tags);
      return Object.assign({}, r, {
        _positions: positions,
        _tags: tags
      });
    });
  }

  async function loadStaff() {
    gridEl.innerHTML = '<div class="venues-empty"><p>Loading roster&hellip;</p></div>';
    try {
      var res = await fetch(API_BASE + "/medical-staff", {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) throw new Error("Request failed (" + res.status + ")");
      var data = await res.json();
      allStaff = normalise(Array.isArray(data) ? data : []);
      renderGrid();
    } catch (err) {
      console.error("Error loading medical staff:", err);
      gridEl.innerHTML = '<div class="venues-empty venues-empty-error">' +
        '<p>Could not reach the staff roster. Please try again shortly.</p></div>';
      countEl.textContent = "";
    }
  }

  loadFilters();
  buildFilterUI();
  loadStaff();
})();
