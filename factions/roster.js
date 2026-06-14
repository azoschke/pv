// ============================================================================
//  Phoenix Vanguard Faction Roster — public directory (Mercenary / Pirate)
//
//  Shared by /pv/factions/mercenary.html and /pv/factions/pirate.html; the
//  page declares its faction via <body data-faction="..." data-faction-label>.
//
//  Mirrors the venues / staff-roster pattern: a campaign-style filter sidebar
//  plus a card grid with click-to-expand modal. The skill filter list is built
//  from whatever skills published members actually have.
//
//  Roster entries are member-edited profiles (portal → My Profile) that the
//  member has opted to publish, joined against the FC roster's faction field.
//
//  Worker endpoint used:
//    GET /roster?faction=<slug>
//      -> [{ member_id, name, description, skills: [...], rp_hooks, url,
//            image_url, updated_at }]
// ============================================================================

(function () {
  var API_BASE = "https://pv-med-database-worker.chlorinatorgreen.workers.dev";

  var FACTION = (document.body.dataset.faction || "mercenary").toLowerCase();
  var FACTION_LABEL = document.body.dataset.factionLabel || "Mercenary";

  var SIDEBAR_KEY = "pv-roster-" + FACTION + "-sidebar-hidden";
  var FILTER_KEY  = "pv-roster-" + FACTION + "-filters";

  // Card backdrop when a member has no portrait — one palette per faction so
  // the two roster pages read differently at a glance.
  var FACTION_PALETTE = {
    mercenary: { from: "#3a2225", to: "#1f1214" },
    pirate:    { from: "#1f3340", to: "#101c25" }
  };
  var palette = FACTION_PALETTE[FACTION] || FACTION_PALETTE.mercenary;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  var sidebarEl    = document.getElementById("roster-sidebar");
  var toggleBtn    = document.getElementById("sidebar-toggle-btn");
  var closeBtn     = document.getElementById("sidebar-close-btn");
  var overlay      = document.getElementById("campaign-overlay");
  var searchInput  = document.getElementById("roster-search");
  var skillListEl  = document.getElementById("filter-skill-list");
  var skillGroupEl = document.getElementById("filter-skill-group");
  var resetBtn     = document.getElementById("filter-reset");
  var gridEl       = document.getElementById("roster-grid");
  var countEl      = document.getElementById("roster-count");
  var modalOverlay = document.getElementById("roster-modal-overlay");
  var modalBody    = document.getElementById("roster-modal-body");
  var modalClose   = document.getElementById("roster-modal-close");

  if (window.marked && marked.use) marked.use({ breaks: true });

  // ── State ────────────────────────────────────────────────────────────────
  var allMembers = [];
  var filters = {
    search: "",
    skills: {}    // { "Swordplay": true, ... }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  function escapeHTML(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function isMobile() { return window.innerWidth <= 768; }

  function loadFilters() {
    try {
      var raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          filters.search = String(saved.search || "");
          filters.skills = saved.skills && typeof saved.skills === "object" ? saved.skills : {};
        }
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

  // ── Skill filter list (derived from the loaded roster) ──────────────────
  function allSkills() {
    var seen = {};
    allMembers.forEach(function (m) {
      (m.skills || []).forEach(function (s) { if (s) seen[s] = true; });
    });
    return Object.keys(seen).sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  }

  function buildSkillFilter() {
    var skills = allSkills();
    skillGroupEl.style.display = skills.length ? "" : "none";
    skillListEl.innerHTML = "";

    // Drop saved filters that no longer correspond to a published skill.
    Object.keys(filters.skills).forEach(function (k) {
      if (skills.indexOf(k) === -1) delete filters.skills[k];
    });

    skills.forEach(function (skill) {
      var li = document.createElement("li");
      li.className = "venues-filter-item";

      var label = document.createElement("label");
      label.className = "venues-filter-check";

      var input = document.createElement("input");
      input.type = "checkbox";
      input.value = skill;
      input.checked = !!filters.skills[skill];
      input.addEventListener("change", function () {
        if (input.checked) filters.skills[skill] = true;
        else delete filters.skills[skill];
        saveFilters();
        renderGrid();
      });

      var text = document.createElement("span");
      text.className = "venues-filter-check-text";
      text.textContent = skill;

      var count = document.createElement("span");
      count.className = "venues-filter-count";
      count.dataset.value = skill;
      count.textContent = "0";

      label.appendChild(input);
      label.appendChild(text);
      label.appendChild(count);
      li.appendChild(label);
      skillListEl.appendChild(li);
    });
  }

  function buildFilterUI() {
    searchInput.value = filters.search;

    searchInput.addEventListener("input", function () {
      filters.search = searchInput.value;
      saveFilters();
      renderGrid();
    });

    resetBtn.addEventListener("click", function () {
      filters = { search: "", skills: {} };
      saveFilters();
      searchInput.value = "";
      skillListEl.querySelectorAll('input[type="checkbox"]').forEach(function (i) { i.checked = false; });
      renderGrid();
    });
  }

  // ── Filtering ────────────────────────────────────────────────────────────
  function matchesFilters(m) {
    var skillKeys = Object.keys(filters.skills);
    if (skillKeys.length) {
      var hit = false;
      for (var i = 0; i < skillKeys.length; i++) {
        if ((m.skills || []).indexOf(skillKeys[i]) !== -1) { hit = true; break; }
      }
      if (!hit) return false;
    }

    var q = (filters.search || "").trim().toLowerCase();
    if (q) {
      var hay = [
        m.name || "",
        m.ic_rank || "",
        m.description || "",
        m.rp_hooks || "",
        (m.skills || []).join(" ")
      ].join(" ").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  // ── Counts on filter checkboxes ──────────────────────────────────────────
  function updateCounts() {
    function countForSkill(value) {
      return allMembers.reduce(function (acc, m) {
        var temp = { search: filters.search, skills: {} };
        var saved = filters;
        filters = temp;
        var ok = matchesFilters(m);
        filters = saved;
        if (!ok) return acc;
        return acc + ((m.skills || []).indexOf(value) !== -1 ? 1 : 0);
      }, 0);
    }

    document.querySelectorAll(".venues-filter-count").forEach(function (el) {
      var value = el.dataset.value;
      if (!value) return;
      el.textContent = String(countForSkill(value));
    });
  }

  // ── Card rendering ───────────────────────────────────────────────────────
  function truncate(str, n) {
    if (!str) return "";
    var s = String(str).trim();
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "…";
  }

  function buildCardEl(m) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "venue-card";
    card.setAttribute("aria-label", m.name);

    var media = document.createElement("div");
    media.className = "venue-card-media";

    if (m.image_url) {
      var img = document.createElement("img");
      img.src = m.image_url;
      img.alt = "";
      img.loading = "lazy";
      img.className = "venue-card-img";
      img.addEventListener("error", function () {
        img.remove();
        media.style.background =
          "linear-gradient(135deg, " + palette.from + " 0%, " + palette.to + " 100%)";
        var sig2 = document.createElement("span");
        sig2.className = "venue-card-sig";
        sig2.textContent = (m.name || "").toLowerCase();
        media.appendChild(sig2);
      });
      media.appendChild(img);
    } else {
      media.style.background =
        "linear-gradient(135deg, " + palette.from + " 0%, " + palette.to + " 100%)";
      var sig = document.createElement("span");
      sig.className = "venue-card-sig";
      sig.textContent = (m.name || "").toLowerCase();
      media.appendChild(sig);
    }

    var badge = document.createElement("span");
    badge.className = "venue-badge venue-badge-size";
    badge.textContent = FACTION_LABEL.toUpperCase();
    media.appendChild(badge);

    card.appendChild(media);

    var body = document.createElement("div");
    body.className = "venue-card-body";

    var titleRow = document.createElement("div");
    titleRow.className = "venue-card-title-row";
    var title = document.createElement("h3");
    title.className = "venue-card-title";
    title.textContent = m.name || "Unnamed";
    titleRow.appendChild(title);
    body.appendChild(titleRow);

    // IC rank under the name, mirroring the medical roster's position line.
    // Blank when the member has no IC rank assigned.
    if (m.ic_rank) {
      var rank = document.createElement("p");
      rank.className = "venue-card-location";
      rank.textContent = String(m.ic_rank).toUpperCase();
      body.appendChild(rank);
    }

    var desc = document.createElement("p");
    desc.className = "venue-card-desc";
    desc.textContent = truncate(m.description, 160) ||
      "Open the full profile for details and RP hooks.";
    body.appendChild(desc);

    if ((m.skills || []).length) {
      var tagWrap = document.createElement("div");
      tagWrap.className = "venue-card-tags";
      m.skills.forEach(function (s) {
        var sp = document.createElement("span");
        sp.className = "venue-card-tag";
        sp.textContent = "#" + s;
        tagWrap.appendChild(sp);
      });
      body.appendChild(tagWrap);
    }

    card.appendChild(body);

    card.addEventListener("click", function () { openModal(m); });
    return card;
  }

  function renderGrid() {
    updateCounts();

    var filtered = allMembers.filter(matchesFilters);
    filtered.sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
    });

    countEl.textContent = filtered.length === 1 ? "1 member" : filtered.length + " members";

    gridEl.innerHTML = "";

    if (!filtered.length) {
      var empty = document.createElement("div");
      empty.className = "venues-empty";
      empty.innerHTML = allMembers.length
        ? '<p>No members match these filters.</p>'
        : '<p>No published profiles yet.</p>' +
          '<p style="font-size:0.95rem; color:var(--text-secondary);">' + escapeHTML(FACTION_LABEL) +
          ' members can publish a profile from the portal’s My Profile section.</p>';
      gridEl.appendChild(empty);
      return;
    }

    filtered.forEach(function (m) { gridEl.appendChild(buildCardEl(m)); });
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  function md(text) {
    if (!text) return "";
    return (window.marked && marked.parse)
      ? marked.parse(escapeHTML(text))
      : "<p>" + escapeHTML(text) + "</p>";
  }

  function buildImageHtml(m) {
    if (m.image_url) {
      return '<img src="' + escapeHTML(m.image_url) + '" alt="" class="venue-modal-img">';
    }
    return '<div class="venue-modal-img venue-modal-img-fallback" style="background:linear-gradient(135deg, ' +
      palette.from + ' 0%, ' + palette.to + ' 100%);">' +
      '<span class="venue-card-sig">' + escapeHTML((m.name || "").toLowerCase()) + '</span>' +
      '</div>';
  }

  function openModal(m) {
    // In the open modal, skills get their own labeled section as plain text
    // (no hashtag styling). The overview cards keep the # tags.
    var skillsHtml = (m.skills || []).length
      ? '<p class="venue-modal-location" style="margin-top:1rem;">SKILLS</p>' +
        '<div class="venue-modal-desc"><p>' +
          m.skills.map(function (s) { return escapeHTML(s); }).join(", ") +
        '</p></div>'
      : "";

    var descHtml = m.description
      ? '<div class="venue-modal-desc">' + md(m.description) + '</div>'
      : '<div class="venue-modal-desc"><p style="color:var(--text-secondary);"><em>No description provided.</em></p></div>';

    var hooksHtml = m.rp_hooks
      ? '<p class="venue-modal-location" style="margin-top:1rem;">RP HOOKS</p>' +
        '<div class="venue-modal-desc">' + md(m.rp_hooks) + '</div>'
      : "";

    var urlHtml = m.url
      ? '<p style="margin-top:1rem;">' +
        '<a href="' + escapeHTML(m.url) + '" class="venue-modal-btn" target="_blank" rel="noopener noreferrer">Character page &nearr;</a></p>'
      : "";

    modalBody.innerHTML =
      buildImageHtml(m) +
      '<div class="venue-modal-content">' +
        '<div class="venue-modal-badges">' +
          '<span class="venue-badge venue-badge-size" style="position:static;">' +
            escapeHTML(FACTION_LABEL.toUpperCase()) + '</span>' +
          (m.ic_rank
            ? '<span class="venue-badge venue-badge-size" style="position:static;">' +
                escapeHTML(String(m.ic_rank).toUpperCase()) + '</span>'
            : '') +
        '</div>' +
        '<h2 class="venue-modal-title" id="roster-modal-title">' + escapeHTML(m.name || "Unnamed") + '</h2>' +
        descHtml +
        hooksHtml +
        skillsHtml +
        urlHtml +
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
  async function loadRoster() {
    gridEl.innerHTML = '<div class="venues-empty"><p>Loading roster&hellip;</p></div>';
    try {
      var res = await fetch(API_BASE + "/roster?faction=" + encodeURIComponent(FACTION), {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) throw new Error("Request failed (" + res.status + ")");
      var data = await res.json();
      allMembers = Array.isArray(data) ? data : [];
      buildSkillFilter();
      renderGrid();
    } catch (err) {
      console.error("Error loading roster:", err);
      gridEl.innerHTML = '<div class="venues-empty venues-empty-error">' +
        '<p>Could not reach the roster. Please try again shortly.</p></div>';
      countEl.textContent = "";
    }
  }

  loadFilters();
  buildFilterUI();
  loadRoster();
})();
