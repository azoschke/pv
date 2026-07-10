// ============================================================================
//  Phoenix Vanguard Job Board — public directory
//
//  Mirrors the Venues directory pattern: a campaign-style filter sidebar plus
//  a card grid with click-to-expand modal. Filters by division (category) and
//  a toggle to reveal closed/filled postings. Open jobs always float to top.
//
//  Logged-in members (session shared with the management portal) can apply to
//  open postings from the detail modal and withdraw while still unreviewed.
//
//  Worker endpoints used:
//    GET    /jobs                     -> list
//    GET    /my/applications  (auth)  -> own applications
//    POST   /jobs/:id/apply   (auth)
//    DELETE /my/applications/:id (auth, stage 'new' only)
// ============================================================================

(function () {
  var API_BASE = "https://pv-med-database-worker.chlorinatorgreen.workers.dev";
  var SESSION_KEY = "pv.admin.session";
  var SIDEBAR_KEY = "pv-jobs-sidebar-hidden";
  var FILTER_KEY  = "pv-jobs-filters";
  var SORT_KEY    = "pv-jobs-sort";

  var CATEGORY_ORDER = ["mercenary", "medical", "pirate", "house_staff", "contractor"];
  var CATEGORY_LABEL = {
    mercenary: "Mercenary", medical: "Medical", pirate: "Pirate",
    house_staff: "House Staff", contractor: "Contractor"
  };

  var STATUS_LABEL = { open: "Open", closed: "Closed", filled: "Filled" };

  // Primary postings are main positions (a member may hold an active
  // application to only one at a time); secondary postings are unlimited.
  var JOB_TYPE_ORDER = ["primary", "secondary"];
  var JOB_TYPE_LABEL = { primary: "Primary", secondary: "Secondary" };
  function jobTypeOf(j) { return j.job_type === "secondary" ? "secondary" : "primary"; }

  // The on-image division badge folds in the job type so it reads, e.g.,
  // "Primary · Mercenary" — one tag instead of two.
  function jobBadgeLabel(j) {
    return (JOB_TYPE_LABEL[jobTypeOf(j)] + " · " + (CATEGORY_LABEL[j.category] || "")).trim();
  }

  // Per-category palette for the colored card backdrop (used when no image_url).
  var CATEGORY_PALETTE = {
    medical:     { from: "#1f3a2e", to: "#10201a" },
    pirate:      { from: "#1f3340", to: "#101c25" },
    mercenary:   { from: "#3a2225", to: "#1f1214" },
    house_staff: { from: "#2e1f3a", to: "#170f20" },
    contractor:  { from: "#3a2c1e", to: "#1f1810" }
  };

  // ── DOM refs ─────────────────────────────────────────────────────────────
  var sidebarEl    = document.getElementById("jobs-sidebar");
  var toggleBtn    = document.getElementById("sidebar-toggle-btn");
  var closeBtn     = document.getElementById("sidebar-close-btn");
  var overlay      = document.getElementById("campaign-overlay");
  var searchInput  = document.getElementById("jobs-search");
  var catListEl    = document.getElementById("filter-category-list");
  var typeListEl   = document.getElementById("filter-type-list");
  var showClosedChk = document.getElementById("filter-show-closed");
  var resetBtn     = document.getElementById("filter-reset");
  var sortSelect   = document.getElementById("jobs-sort-select");
  var gridEl       = document.getElementById("jobs-grid");
  var countEl      = document.getElementById("jobs-count");
  var modalOverlay = document.getElementById("job-modal-overlay");
  var modalBody    = document.getElementById("job-modal-body");
  var modalClose   = document.getElementById("job-modal-close");

  if (window.marked && marked.use) marked.use({ breaks: true });

  // ── Session (shared with the management portal) ──────────────────────────
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

  async function authedRequest(method, path) {
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

  // ── State ────────────────────────────────────────────────────────────────
  var allJobs = [];
  var myApplications = [];   // own applications, loaded when logged in
  var filters = {
    search: "",
    categories: {},   // { medical: true, ... }
    jobTypes: {},     // { primary: true, secondary: true }
    showClosed: false
  };
  var sort = "newest";
  var VALID_SORTS = { newest: 1, oldest: 1, title: 1 };

  // ── Helpers ──────────────────────────────────────────────────────────────
  function escapeHTML(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function isMobile() { return window.innerWidth <= 768; }

  function timeOf(j) {
    var t = Date.parse(j.created_at || "");
    return isNaN(t) ? 0 : t;
  }

  function loadFilters() {
    try {
      var raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          filters.search     = String(saved.search || "");
          filters.categories = saved.categories && typeof saved.categories === "object" ? saved.categories : {};
          filters.jobTypes   = saved.jobTypes && typeof saved.jobTypes === "object" ? saved.jobTypes : {};
          filters.showClosed = !!saved.showClosed;
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
      catListEl,
      CATEGORY_ORDER.map(function (c) { return { value: c, label: CATEGORY_LABEL[c] }; }),
      "categories"
    );

    renderCheckboxList(
      typeListEl,
      JOB_TYPE_ORDER.map(function (t) { return { value: t, label: JOB_TYPE_LABEL[t] }; }),
      "jobTypes"
    );

    searchInput.value = filters.search;
    showClosedChk.checked = filters.showClosed;
    sortSelect.value = sort;

    searchInput.addEventListener("input", function () {
      filters.search = searchInput.value;
      saveFilters();
      renderGrid();
    });
    showClosedChk.addEventListener("change", function () {
      filters.showClosed = showClosedChk.checked;
      saveFilters();
      renderGrid();
    });
    sortSelect.addEventListener("change", function () {
      sort = sortSelect.value;
      saveFilters();
      renderGrid();
    });

    resetBtn.addEventListener("click", function () {
      filters = { search: "", categories: {}, jobTypes: {}, showClosed: false };
      sort = "newest";
      saveFilters();
      searchInput.value = "";
      showClosedChk.checked = false;
      sortSelect.value = sort;
      catListEl.querySelectorAll('input[type="checkbox"]').forEach(function (i) { i.checked = false; });
      typeListEl.querySelectorAll('input[type="checkbox"]').forEach(function (i) { i.checked = false; });
      renderGrid();
    });
  }

  // ── Filtering / sorting ──────────────────────────────────────────────────
  function matchesFilters(j) {
    if (!filters.showClosed && j.status !== "open") return false;

    var catKeys = Object.keys(filters.categories);
    if (catKeys.length && !filters.categories[j.category]) return false;

    var typeKeys = Object.keys(filters.jobTypes);
    if (typeKeys.length && !filters.jobTypes[jobTypeOf(j)]) return false;

    var q = (filters.search || "").trim().toLowerCase();
    if (q) {
      var hay = [
        j.title || "",
        j.description || "",
        j.contact || "",
        CATEGORY_LABEL[j.category] || "",
        JOB_TYPE_LABEL[jobTypeOf(j)] || "",
        STATUS_LABEL[j.status] || ""
      ].join(" ").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function sortJobs(list) {
    var copy = list.slice();
    copy.sort(function (a, b) {
      // Open jobs always pinned to the top, regardless of sort mode.
      var oa = a.status === "open" ? 0 : 1;
      var ob = b.status === "open" ? 0 : 1;
      if (oa !== ob) return oa - ob;

      switch (sort) {
        case "oldest":
          return timeOf(a) - timeOf(b)
            || (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
        case "title":
          return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
        case "newest":
        default:
          return timeOf(b) - timeOf(a)
            || (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
      }
    });
    return copy;
  }

  // ── Counts on filter checkboxes ──────────────────────────────────────────
  function updateCounts() {
    function countForFacet(kind, value) {
      return allJobs.reduce(function (acc, j) {
        var temp = {
          search: filters.search,
          categories: kind === "categories" ? {} : filters.categories,
          jobTypes: kind === "jobTypes" ? {} : filters.jobTypes,
          showClosed: filters.showClosed
        };
        var saved = filters;
        filters = temp;
        var ok = matchesFilters(j);
        filters = saved;
        if (!ok) return acc;
        if (kind === "categories") return acc + (j.category === value ? 1 : 0);
        if (kind === "jobTypes") return acc + (jobTypeOf(j) === value ? 1 : 0);
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

  function buildCardEl(j) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "job-card job-cat-" + j.category + (j.status !== "open" ? " is-inactive" : "");
    card.setAttribute("aria-label", j.title);

    var palette = CATEGORY_PALETTE[j.category] || CATEGORY_PALETTE.contractor;
    var media = document.createElement("div");
    media.className = "job-card-media";

    if (j.image_url) {
      var img = document.createElement("img");
      img.src = j.image_url;
      img.alt = "";
      img.loading = "lazy";
      img.className = "job-card-img";
      var cardBorder = document.createElement("span");
      cardBorder.className = "contrast-border-half";
      cardBorder.setAttribute("aria-hidden", "true");
      img.addEventListener("error", function () {
        img.remove();
        cardBorder.remove();
        media.style.background =
          "linear-gradient(135deg, " + palette.from + " 0%, " + palette.to + " 100%)";
      });
      media.appendChild(img);
      media.appendChild(cardBorder);
    } else {
      media.style.background =
        "linear-gradient(135deg, " + palette.from + " 0%, " + palette.to + " 100%)";
      var sig = document.createElement("span");
      sig.className = "job-card-sig";
      sig.textContent = (j.title || "").toLowerCase();
      media.appendChild(sig);
    }

    var catBadge = document.createElement("span");
    catBadge.className = "job-badge job-badge-category job-cat-" + j.category;
    catBadge.textContent = jobBadgeLabel(j).toUpperCase();
    media.appendChild(catBadge);

    var statusBadge = document.createElement("span");
    statusBadge.className = "job-badge job-badge-status job-status-" + j.status;
    statusBadge.textContent = (STATUS_LABEL[j.status] || "").toUpperCase();
    media.appendChild(statusBadge);

    card.appendChild(media);

    var body = document.createElement("div");
    body.className = "job-card-body";

    var title = document.createElement("h3");
    title.className = "job-card-title";
    title.textContent = j.title || "Untitled posting";
    body.appendChild(title);

    if (j.contact) {
      var meta = document.createElement("p");
      meta.className = "job-card-meta";
      meta.textContent = "Contact: " + j.contact;
      body.appendChild(meta);
    }

    var desc = document.createElement("p");
    desc.className = "job-card-desc";
    desc.textContent = truncate(j.description, 140);
    body.appendChild(desc);

    card.appendChild(body);

    card.addEventListener("click", function () { openModal(j); });
    return card;
  }

  function renderGrid() {
    updateCounts();

    var filtered = allJobs.filter(matchesFilters);
    var sorted = sortJobs(filtered);

    countEl.textContent = sorted.length === 1 ? "1 posting" : sorted.length + " postings";

    gridEl.innerHTML = "";

    if (!sorted.length) {
      var empty = document.createElement("div");
      empty.className = "venues-empty";
      empty.innerHTML = '<p>No postings match these filters.</p>' +
        '<p style="font-size:0.95rem; color:var(--text-secondary);">Try clearing a filter or showing closed postings.</p>';
      gridEl.appendChild(empty);
      return;
    }

    sorted.forEach(function (j) { gridEl.appendChild(buildCardEl(j)); });
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  function buildImageHtml(j) {
    var palette = CATEGORY_PALETTE[j.category] || CATEGORY_PALETTE.contractor;
    if (j.image_url) {
      return '<div class="contrast-media">' +
        '<img src="' + escapeHTML(j.image_url) + '" alt="" class="job-modal-img">' +
        '<span class="contrast-border" aria-hidden="true"></span>' +
        '</div>';
    }
    return '<div class="job-modal-img job-modal-img-fallback" style="background:linear-gradient(135deg, ' +
      palette.from + ' 0%, ' + palette.to + ' 100%);">' +
      '<span class="job-card-sig">' + escapeHTML((j.title || "").toLowerCase()) + '</span>' +
      '</div>';
  }

  function openModal(j) {
    var imgHtml = buildImageHtml(j);

    var descHtml = j.description
      ? (window.marked && marked.parse ? marked.parse(escapeHTML(j.description)) : "<p>" + escapeHTML(j.description) + "</p>")
      : '<p style="color:var(--text-secondary);"><em>No description provided.</em></p>';

    var badges =
      '<span class="job-badge job-badge-category job-cat-' + j.category + '" style="position:static;">' +
        escapeHTML(jobBadgeLabel(j).toUpperCase()) + '</span>' +
      '<span class="job-badge job-badge-status job-status-' + j.status + '" style="position:static;">' +
        escapeHTML((STATUS_LABEL[j.status] || "").toUpperCase()) + '</span>';

    var contactHtml = j.contact
      ? '<p class="job-modal-contact"><span class="job-modal-contact-label">Contact</span>' +
        escapeHTML(j.contact) + '</p>'
      : "";

    modalBody.innerHTML =
      imgHtml +
      '<div class="job-modal-content">' +
        '<div class="job-modal-badges">' + badges + '</div>' +
        '<h2 class="job-modal-title" id="job-modal-title">' + escapeHTML(j.title || "Untitled posting") + '</h2>' +
        contactHtml +
        '<div class="job-modal-desc">' + descHtml + '</div>' +
        applyHtml(j) +
        '<p id="job-action-error" class="quest-action-error" style="display:none;"></p>' +
      '</div>';

    wireApplyActions(j);

    modalOverlay.classList.add("is-open");
    modalOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  // ── Apply / withdraw ─────────────────────────────────────────────────────
  var STAGE_LABEL = { new: "Submitted", scheduled: "Interview scheduled", accepted: "Accepted", declined: "Declined" };

  function myApplicationFor(j) {
    for (var i = 0; i < myApplications.length; i++) {
      var a = myApplications[i];
      if (a.job_id === j.id && a.stage !== "declined") return a;
    }
    return null;
  }

  function jobById(id) {
    for (var i = 0; i < allJobs.length; i++) {
      if (allJobs[i].id === id) return allJobs[i];
    }
    return null;
  }

  // The active (non-declined) application this member already holds to a primary
  // posting other than j, if any. Used to mirror the worker's one-primary rule
  // in the UI so applying is blocked before the request is sent.
  function activePrimaryElsewhere(j) {
    for (var i = 0; i < myApplications.length; i++) {
      var a = myApplications[i];
      if (a.stage === "declined") continue;
      if (a.job_id === j.id) continue;
      var other = jobById(a.job_id);
      if (other && jobTypeOf(other) === "primary") return other;
    }
    return null;
  }

  function applyHtml(j) {
    if (j.status !== "open") return "";
    if (!getSession()) {
      // Round-trip through login and come back to the board to finish applying.
      return '<div class="quest-modal-actions">' +
        '<a class="quest-action-btn" href="/pv/admin/login.html?redirect=' +
        encodeURIComponent(window.location.pathname) + '">Log in to apply</a>' +
        '</div>';
    }
    var app = myApplicationFor(j);
    if (!app) {
      if (jobTypeOf(j) === "primary") {
        var conflict = activePrimaryElsewhere(j);
        if (conflict) {
          return '<div class="quest-modal-actions">' +
            '<button type="button" class="quest-action-btn" id="job-apply-btn" disabled>Apply</button>' +
            '<span class="quest-action-note">You already have an active application for a primary position (' +
            escapeHTML(conflict.title) + '). Withdraw it before applying to another primary position. ' +
            'Secondary positions have no limit.</span>' +
            '</div>';
        }
      }
      return '<div class="quest-modal-actions">' +
        '<button type="button" class="quest-action-btn" id="job-apply-btn">Apply</button>' +
        '</div>';
    }
    if (app.stage === "new") {
      return '<div class="quest-modal-actions">' +
        '<button type="button" class="quest-action-btn is-ghost" id="job-withdraw-btn" data-app-id="' + app.id + '">Withdraw application</button>' +
        '<span class="quest-action-note">Application submitted.</span>' +
        '</div>';
    }
    return '<div class="quest-modal-actions">' +
      '<span class="quest-action-note">Application status: ' + escapeHTML(STAGE_LABEL[app.stage] || app.stage) + '</span>' +
      '</div>';
  }

  function wireApplyActions(j) {
    var applyBtn = document.getElementById("job-apply-btn");
    var withdrawBtn = document.getElementById("job-withdraw-btn");
    var errEl = document.getElementById("job-action-error");

    function showError(msg) {
      if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; }
    }

    async function act(btn, fn) {
      btn.disabled = true;
      try {
        await fn();
        await loadMyApplications();
        openModal(j);
      } catch (e) {
        btn.disabled = false;
        showError(e.message || "Something went wrong.");
      }
    }

    if (applyBtn) applyBtn.addEventListener("click", function () {
      act(applyBtn, function () { return authedRequest("POST", "/jobs/" + j.id + "/apply"); });
    });
    if (withdrawBtn) withdrawBtn.addEventListener("click", function () {
      var appId = withdrawBtn.dataset.appId;
      act(withdrawBtn, function () { return authedRequest("DELETE", "/my/applications/" + appId); });
    });
  }

  async function loadMyApplications() {
    if (!getSession()) { myApplications = []; return; }
    try {
      var data = await authedRequest("GET", "/my/applications");
      myApplications = Array.isArray(data) ? data : [];
    } catch (_e) {
      myApplications = [];
    }
  }

  function closeModal() {
    // Move focus out before hiding: leaving focus inside an aria-hidden subtree
    // trips Chrome's "Blocked aria-hidden on a focused element" warning.
    if (document.activeElement && modalOverlay.contains(document.activeElement)) {
      document.activeElement.blur();
    }
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
  async function loadJobs() {
    gridEl.innerHTML = '<div class="venues-empty"><p>Loading postings&hellip;</p></div>';
    try {
      var res = await fetch(API_BASE + "/jobs", {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) throw new Error("Request failed (" + res.status + ")");
      var data = await res.json();
      allJobs = Array.isArray(data) ? data : [];
      renderGrid();
    } catch (err) {
      console.error("Error loading jobs:", err);
      gridEl.innerHTML = '<div class="venues-empty venues-empty-error">' +
        '<p>Could not reach the job board. Please try again shortly.</p></div>';
      countEl.textContent = "";
    }
  }

  loadFilters();
  buildFilterUI();
  loadMyApplications().then(loadJobs);
})();
