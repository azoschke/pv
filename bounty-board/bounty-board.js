// ============================================================================
//  Phoenix Vanguard Bounty Board — public quest directory
//
//  Mirrors the Job Board pattern: a campaign-style filter sidebar plus a card
//  grid with click-to-expand modal. Filters by schedule mode and a toggle to
//  reveal past-dated quests.
//
//  Schedule modes:
//    scheduled  -> has a concrete date/time (stored UTC, shown in local time)
//    tbd        -> no date yet; sign up to express interest
//    repeatable -> runs more than once; optional next-run date + cadence note
//
//  Logged-in members (session shared with the management portal) can sign up
//  for quests and withdraw anytime. Quest submission lives in the portal's
//  My Profile section.
//
//  Worker endpoints used:
//    GET    /quests                       -> listed quests incl. signups
//    POST   /quests/:id/signups   (auth)
//    DELETE /quests/:id/signups   (auth)
// ============================================================================

(function () {
  var API_BASE = "https://pv-med-database-worker.chlorinatorgreen.workers.dev";
  var SESSION_KEY = "pv.admin.session";
  var SIDEBAR_KEY = "pv-quests-sidebar-hidden";
  var FILTER_KEY  = "pv-quests-filters";
  var SORT_KEY    = "pv-quests-sort";

  var SCHEDULE_ORDER = ["scheduled", "tbd", "repeatable"];
  var SCHEDULE_LABEL = {
    scheduled: "Scheduled",
    tbd: "Date TBD",
    repeatable: "Repeatable"
  };

  // Card backdrop when a quest has no image.
  var QUEST_PALETTE = { from: "#3a2c1e", to: "#1f1810" };

  // ── DOM refs ─────────────────────────────────────────────────────────────
  var sidebarEl    = document.getElementById("quests-sidebar");
  var toggleBtn    = document.getElementById("sidebar-toggle-btn");
  var closeBtn     = document.getElementById("sidebar-close-btn");
  var overlay      = document.getElementById("campaign-overlay");
  var searchInput  = document.getElementById("quests-search");
  var schedListEl  = document.getElementById("filter-schedule-list");
  var showPastChk  = document.getElementById("filter-show-past");
  var resetBtn     = document.getElementById("filter-reset");
  var sortSelect   = document.getElementById("quests-sort-select");
  var submitBtn    = document.getElementById("quest-submit-btn");
  var gridEl       = document.getElementById("quests-grid");
  var countEl      = document.getElementById("quests-count");
  var modalOverlay = document.getElementById("quest-modal-overlay");
  var modalBody    = document.getElementById("quest-modal-body");
  var modalClose   = document.getElementById("quest-modal-close");

  if (window.marked && marked.use) marked.use({ breaks: true });

  // ── Session (shared with the management portal) ──────────────────────────
  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
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

  // Logged-out users get sent to the login page instead of the portal.
  (function () {
    if (!getSession() && submitBtn) {
      submitBtn.href = "/pv/admin/login.html";
      submitBtn.title = "Log in to submit a quest";
    }
  })();

  // ── State ────────────────────────────────────────────────────────────────
  var allQuests = [];
  var filters = {
    search: "",
    schedules: {},   // { scheduled: true, ... }
    showPast: false
  };
  var sort = "soonest";
  var VALID_SORTS = { soonest: 1, newest: 1, title: 1 };
  var openQuestId = null;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function escapeHTML(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function isMobile() { return window.innerWidth <= 768; }

  // scheduled_at is stored as UTC "YYYY-MM-DD HH:MM:SS".
  function parseQuestDate(q) {
    if (!q.scheduled_at) return null;
    var t = Date.parse(String(q.scheduled_at).replace(" ", "T") + "Z");
    return isNaN(t) ? null : t;
  }

  function isPast(q) {
    if (q.schedule_mode !== "scheduled") return false;
    var t = parseQuestDate(q);
    return t != null && t < Date.now();
  }

  function formatLocal(ms) {
    var d = new Date(ms);
    return d.toLocaleString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit"
    });
  }

  function formatBadgeDate(ms) {
    var d = new Date(ms);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    }).toUpperCase();
  }

  function createdTime(q) {
    var t = Date.parse(q.created_at || "");
    return isNaN(t) ? 0 : t;
  }

  function loadFilters() {
    try {
      var raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          filters.search    = String(saved.search || "");
          filters.schedules = saved.schedules && typeof saved.schedules === "object" ? saved.schedules : {};
          filters.showPast  = !!saved.showPast;
        }
      }
      var savedSort = localStorage.getItem(SORT_KEY);
      if (savedSort && VALID_SORTS[savedSort]) sort = savedSort;
    } catch (_e) { /* ignore */ }
  }

  function saveFilters() {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
      localStorage.setItem(SORT_KEY, sort);
    } catch (_e) { /* ignore */ }
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
      schedListEl,
      SCHEDULE_ORDER.map(function (s) { return { value: s, label: SCHEDULE_LABEL[s] }; }),
      "schedules"
    );

    searchInput.value = filters.search;
    showPastChk.checked = filters.showPast;
    sortSelect.value = sort;

    searchInput.addEventListener("input", function () {
      filters.search = searchInput.value;
      saveFilters();
      renderGrid();
    });
    showPastChk.addEventListener("change", function () {
      filters.showPast = showPastChk.checked;
      saveFilters();
      renderGrid();
    });
    sortSelect.addEventListener("change", function () {
      sort = sortSelect.value;
      saveFilters();
      renderGrid();
    });

    resetBtn.addEventListener("click", function () {
      filters = { search: "", schedules: {}, showPast: false };
      sort = "soonest";
      saveFilters();
      searchInput.value = "";
      showPastChk.checked = false;
      sortSelect.value = sort;
      schedListEl.querySelectorAll('input[type="checkbox"]').forEach(function (i) { i.checked = false; });
      renderGrid();
    });
  }

  // ── Filtering / sorting ──────────────────────────────────────────────────
  function matchesFilters(q) {
    if (!filters.showPast && isPast(q)) return false;

    var schedKeys = Object.keys(filters.schedules);
    if (schedKeys.length && !filters.schedules[q.schedule_mode]) return false;

    var s = (filters.search || "").trim().toLowerCase();
    if (s) {
      var hay = [
        q.title || "",
        q.description || "",
        q.reward || "",
        q.contact || "",
        q.submitted_by_name || "",
        q.cadence_note || "",
        SCHEDULE_LABEL[q.schedule_mode] || ""
      ].join(" ").toLowerCase();
      if (hay.indexOf(s) === -1) return false;
    }
    return true;
  }

  // "Soonest": upcoming dated quests first (ascending), then undated (TBD /
  // repeatable without a next run) newest-first, then past quests latest-first.
  function sortQuests(list) {
    var copy = list.slice();
    copy.sort(function (a, b) {
      if (sort === "title") {
        return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
      }
      if (sort === "newest") {
        return createdTime(b) - createdTime(a)
          || (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
      }
      // soonest
      var now = Date.now();
      function bucket(q) {
        var t = parseQuestDate(q);
        if (t != null && t >= now) return 0;  // upcoming dated
        if (t == null) return 1;              // undated
        return 2;                             // past dated
      }
      var ba = bucket(a), bb = bucket(b);
      if (ba !== bb) return ba - bb;
      var ta = parseQuestDate(a), tb = parseQuestDate(b);
      if (ba === 0) return ta - tb;
      if (ba === 2) return tb - ta;
      return createdTime(b) - createdTime(a);
    });
    return copy;
  }

  // ── Counts on filter checkboxes ──────────────────────────────────────────
  function updateCounts() {
    function countForFacet(value) {
      return allQuests.reduce(function (acc, q) {
        var temp = { search: filters.search, schedules: {}, showPast: filters.showPast };
        var saved = filters;
        filters = temp;
        var ok = matchesFilters(q);
        filters = saved;
        if (!ok) return acc;
        return acc + (q.schedule_mode === value ? 1 : 0);
      }, 0);
    }

    document.querySelectorAll(".venues-filter-count").forEach(function (el) {
      var value = el.dataset.value;
      if (!value) return;
      el.textContent = String(countForFacet(value));
    });
  }

  // ── Card rendering ───────────────────────────────────────────────────────
  function truncate(str, n) {
    if (!str) return "";
    var s = String(str).trim();
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "…";
  }

  function scheduleBadgeText(q) {
    if (q.schedule_mode === "tbd") return "DATE TBD";
    var t = parseQuestDate(q);
    if (q.schedule_mode === "repeatable") {
      return t != null ? "REPEATABLE · " + formatBadgeDate(t) : "REPEATABLE";
    }
    if (t == null) return "SCHEDULED";
    return (isPast(q) ? "PAST · " : "") + formatBadgeDate(t);
  }

  function buildCardEl(q) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "job-card quest-card" + (isPast(q) ? " is-inactive" : "");
    card.setAttribute("aria-label", q.title);

    var media = document.createElement("div");
    media.className = "job-card-media";

    if (q.image_url) {
      var img = document.createElement("img");
      img.src = q.image_url;
      img.alt = "";
      img.loading = "lazy";
      img.className = "job-card-img";
      img.addEventListener("error", function () {
        img.remove();
        media.style.background =
          "linear-gradient(135deg, " + QUEST_PALETTE.from + " 0%, " + QUEST_PALETTE.to + " 100%)";
      });
      media.appendChild(img);
    } else {
      media.style.background =
        "linear-gradient(135deg, " + QUEST_PALETTE.from + " 0%, " + QUEST_PALETTE.to + " 100%)";
      var sig = document.createElement("span");
      sig.className = "job-card-sig";
      sig.textContent = (q.title || "").toLowerCase();
      media.appendChild(sig);
    }

    var schedBadge = document.createElement("span");
    schedBadge.className = "job-badge job-badge-status quest-sched-" + q.schedule_mode +
      (isPast(q) ? " quest-sched-past" : "");
    schedBadge.textContent = scheduleBadgeText(q);
    media.appendChild(schedBadge);

    card.appendChild(media);

    var body = document.createElement("div");
    body.className = "job-card-body";

    var title = document.createElement("h3");
    title.className = "job-card-title";
    title.textContent = q.title || "Untitled quest";
    body.appendChild(title);

    if (q.reward) {
      var meta = document.createElement("p");
      meta.className = "job-card-meta";
      meta.textContent = "Reward: " + q.reward;
      body.appendChild(meta);
    }

    var desc = document.createElement("p");
    desc.className = "job-card-desc";
    desc.textContent = truncate(q.description, 140);
    body.appendChild(desc);

    var signups = q.signups || [];
    var signupMeta = document.createElement("p");
    signupMeta.className = "job-card-meta quest-card-signups";
    signupMeta.textContent = signups.length === 1
      ? "1 member signed up"
      : signups.length + " members signed up";
    body.appendChild(signupMeta);

    card.appendChild(body);

    card.addEventListener("click", function () { openModal(q.id); });
    return card;
  }

  function renderGrid() {
    updateCounts();

    var filtered = allQuests.filter(matchesFilters);
    var sorted = sortQuests(filtered);

    countEl.textContent = sorted.length === 1 ? "1 quest" : sorted.length + " quests";

    gridEl.innerHTML = "";

    if (!sorted.length) {
      var empty = document.createElement("div");
      empty.className = "venues-empty";
      empty.innerHTML = '<p>No quests match these filters.</p>' +
        '<p style="font-size:0.95rem; color:var(--text-secondary);">Try clearing a filter or showing past quests.</p>';
      gridEl.appendChild(empty);
      return;
    }

    sorted.forEach(function (q) { gridEl.appendChild(buildCardEl(q)); });
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  function buildImageHtml(q) {
    if (q.image_url) {
      return '<img src="' + escapeHTML(q.image_url) + '" alt="" class="job-modal-img">';
    }
    return '<div class="job-modal-img job-modal-img-fallback" style="background:linear-gradient(135deg, ' +
      QUEST_PALETTE.from + ' 0%, ' + QUEST_PALETTE.to + ' 100%);">' +
      '<span class="job-card-sig">' + escapeHTML((q.title || "").toLowerCase()) + '</span>' +
      '</div>';
  }

  function scheduleDetailHtml(q) {
    var t = parseQuestDate(q);
    var parts = [];
    if (q.schedule_mode === "tbd") {
      parts.push("Date TBD — sign up to express interest.");
    } else if (q.schedule_mode === "repeatable") {
      parts.push(t != null ? "Next run: " + formatLocal(t) : "Repeatable quest");
      if (q.cadence_note) parts.push(q.cadence_note);
    } else if (t != null) {
      parts.push(formatLocal(t) + " (your local time)" + (isPast(q) ? " — this date has passed" : ""));
    }
    if (!parts.length) return "";
    return '<p class="job-modal-contact"><span class="job-modal-contact-label">When</span>' +
      escapeHTML(parts.join(" · ")) + '</p>';
  }

  function metaRow(label, value) {
    if (!value) return "";
    return '<p class="job-modal-contact"><span class="job-modal-contact-label">' +
      escapeHTML(label) + '</span>' + escapeHTML(value) + '</p>';
  }

  function findQuest(id) {
    for (var i = 0; i < allQuests.length; i++) {
      if (allQuests[i].id === id) return allQuests[i];
    }
    return null;
  }

  function mySignup(q) {
    var session = getSession();
    if (!session || !session.display_name) return null;
    var me = session.display_name.trim().toLowerCase();
    var signups = q.signups || [];
    for (var i = 0; i < signups.length; i++) {
      if ((signups[i].member_name || "").trim().toLowerCase() === me) return signups[i];
    }
    return null;
  }

  function participantsHtml(q) {
    var signups = q.signups || [];
    var html = '<div class="quest-participants">' +
      '<p class="job-modal-contact-label" style="display:block; margin-bottom:0.4rem;">Signed up (' + signups.length + ')</p>';
    if (!signups.length) {
      html += '<p style="color:var(--text-secondary); margin:0;"><em>No one yet — be the first.</em></p>';
    } else {
      html += '<div class="venue-card-tags">' + signups.map(function (s) {
        return '<span class="venue-card-tag">' + escapeHTML(s.member_name) + '</span>';
      }).join("") + '</div>';
    }
    html += '</div>';
    return html;
  }

  function actionHtml(q) {
    var session = getSession();
    if (!session) {
      return '<div class="quest-modal-actions">' +
        '<a class="quest-action-btn" href="/pv/admin/login.html">Log in to sign up</a>' +
        '</div>';
    }
    var mine = mySignup(q);
    if (mine) {
      return '<div class="quest-modal-actions">' +
        '<button type="button" class="quest-action-btn is-ghost" id="quest-withdraw-btn">Withdraw signup</button>' +
        '<span class="quest-action-note">You are signed up for this quest.</span>' +
        '</div>';
    }
    return '<div class="quest-modal-actions">' +
      '<button type="button" class="quest-action-btn" id="quest-signup-btn">Sign up</button>' +
      '</div>';
  }

  async function authedFetch(method, path) {
    var session = getSession();
    if (!session) throw new Error("You are no longer logged in.");
    var res = await fetch(API_BASE + path, {
      method: method,
      headers: {
        "Accept": "application/json",
        "Authorization": "Bearer " + session.token
      }
    });
    var text = await res.text();
    var data = null;
    if (text) { try { data = JSON.parse(text); } catch (_e) { data = null; } }
    if (!res.ok) {
      throw new Error((data && data.error) || ("Request failed (" + res.status + ")"));
    }
    return data;
  }

  function wireModalActions(q) {
    var signupBtn = document.getElementById("quest-signup-btn");
    var withdrawBtn = document.getElementById("quest-withdraw-btn");
    var errEl = document.getElementById("quest-action-error");

    function showError(msg) {
      if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; }
    }

    async function act(method, btn) {
      btn.disabled = true;
      try {
        await authedFetch(method, "/quests/" + q.id + "/signups");
        await loadQuests({ keepModal: true });
      } catch (e) {
        btn.disabled = false;
        showError(e.message || "Something went wrong.");
      }
    }

    if (signupBtn) signupBtn.addEventListener("click", function () { act("POST", signupBtn); });
    if (withdrawBtn) withdrawBtn.addEventListener("click", function () { act("DELETE", withdrawBtn); });
  }

  function openModal(id) {
    var q = findQuest(id);
    if (!q) { closeModal(); return; }
    openQuestId = id;

    var imgHtml = buildImageHtml(q);

    var descHtml = q.description
      ? (window.marked && marked.parse ? marked.parse(escapeHTML(q.description)) : "<p>" + escapeHTML(q.description) + "</p>")
      : '<p style="color:var(--text-secondary);"><em>No description provided.</em></p>';

    var badge =
      '<span class="job-badge job-badge-status quest-sched-' + q.schedule_mode +
      (isPast(q) ? " quest-sched-past" : "") + '" style="position:static;">' +
      escapeHTML(scheduleBadgeText(q)) + '</span>';

    modalBody.innerHTML =
      imgHtml +
      '<div class="job-modal-content">' +
        '<div class="job-modal-badges">' + badge + '</div>' +
        '<h2 class="job-modal-title" id="quest-modal-title">' + escapeHTML(q.title || "Untitled quest") + '</h2>' +
        scheduleDetailHtml(q) +
        metaRow("Reward", q.reward) +
        metaRow("Contact", q.contact) +
        metaRow("Posted by", q.submitted_by_name) +
        '<div class="job-modal-desc">' + descHtml + '</div>' +
        participantsHtml(q) +
        actionHtml(q) +
        '<p id="quest-action-error" class="quest-action-error" style="display:none;"></p>' +
      '</div>';

    wireModalActions(q);

    modalOverlay.classList.add("is-open");
    modalOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    openQuestId = null;
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
  async function loadQuests(opts) {
    var keepModal = opts && opts.keepModal;
    if (!keepModal) {
      gridEl.innerHTML = '<div class="venues-empty"><p>Loading quests&hellip;</p></div>';
    }
    try {
      var res = await fetch(API_BASE + "/quests", {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) throw new Error("Request failed (" + res.status + ")");
      var data = await res.json();
      allQuests = Array.isArray(data) ? data : [];
      renderGrid();
      if (keepModal && openQuestId != null) openModal(openQuestId);
    } catch (err) {
      console.error("Error loading quests:", err);
      gridEl.innerHTML = '<div class="venues-empty venues-empty-error">' +
        '<p>Could not reach the bounty board. Please try again shortly.</p></div>';
      countEl.textContent = "";
    }
  }

  loadFilters();
  buildFilterUI();
  loadQuests();
})();
