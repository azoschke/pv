// ============================================================================
//  Phoenix Vanguard Venues — public directory
//
//  Mirrors the campaign-style sidebar pattern from med-database.html, but with
//  filter controls (search / size / type / district / featured) instead of a
//  list of patient names. Card grid + click-to-expand modal.
//
//  Worker endpoints used:
//    GET /venues          -> list
// ============================================================================

(function () {
  var API_BASE = "https://pv-med-database-worker.chlorinatorgreen.workers.dev";
  var SIDEBAR_KEY = "pv-venues-sidebar-hidden";
  var FILTER_KEY  = "pv-venues-filters";
  var SORT_KEY    = "pv-venues-sort";

  // Display order for size — also used by size_asc / size_desc sorting.
  var SIZE_ORDER = ["room", "apartment", "cottage", "house", "mansion"];
  var SIZE_LABEL = {
    room: "Room", apartment: "Apartment", cottage: "Cottage",
    house: "House", mansion: "Mansion"
  };
  var DISTRICT_LABEL = {
    mist: "Mist", lavender_beds: "Lavender Beds", goblet: "Goblet",
    empyreum: "Empyreum", shirogane: "Shirogane"
  };
  var DISTRICT_ORDER = ["mist", "lavender_beds", "goblet", "empyreum", "shirogane"];

  // Type filter list — matches the fixed VENUE_TAGS in the worker.
  var TYPE_ORDER = ["tavern","clinic","inn","lounge","restaurant","fight_club","shop","other"];
  var TYPE_LABEL = {
    tavern: "Tavern", clinic: "Clinic", inn: "Inn", lounge: "Lounge",
    restaurant: "Restaurant", fight_club: "Fight Club", shop: "Shop", other: "Other"
  };

  // Per-size palette for the colored card backdrop (used when no image_url).
  var SIZE_PALETTE = {
    room:      { from: "#3a2a3d", to: "#1f1424" },
    apartment: { from: "#3b3727", to: "#211e15" },
    cottage:   { from: "#3a2a25", to: "#1f1612" },
    house:     { from: "#1f3340", to: "#101c25" },
    mansion:   { from: "#3a2c1e", to: "#1f1810" }
  };

  // ── DOM refs ─────────────────────────────────────────────────────────────
  var sidebarEl    = document.getElementById("venues-sidebar");
  var toggleBtn    = document.getElementById("sidebar-toggle-btn");
  var closeBtn     = document.getElementById("sidebar-close-btn");
  var overlay      = document.getElementById("campaign-overlay");
  var searchInput  = document.getElementById("venues-search");
  var sizeListEl   = document.getElementById("filter-size-list");
  var typeListEl   = document.getElementById("filter-type-list");
  var districtSel  = document.getElementById("filter-district");
  var featuredChk  = document.getElementById("filter-featured");
  var resetBtn     = document.getElementById("filter-reset");
  var sortSelect   = document.getElementById("venues-sort-select");
  var gridEl       = document.getElementById("venues-grid");
  var countEl      = document.getElementById("venues-count");
  var modalOverlay = document.getElementById("venue-modal-overlay");
  var modalBody    = document.getElementById("venue-modal-body");
  var modalClose   = document.getElementById("venue-modal-close");

  if (window.marked && marked.use) marked.use({ breaks: true });

  // ── State ────────────────────────────────────────────────────────────────
  var allVenues = [];
  var filters = {
    search: "",
    sizes: {},     // { room: true, ... }
    types: {},     // { tavern: true, ... }
    district: "",
    featured: false
  };
  var sort = "featured";
  var VALID_SORTS = { featured: 1, size_asc: 1, size_desc: 1 };

  // ── Helpers ──────────────────────────────────────────────────────────────
  function escapeHTML(str) {
    if (str == null) return "";
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function isMobile() { return window.innerWidth <= 768; }

  function loadFilters() {
    try {
      var raw = localStorage.getItem(FILTER_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        filters.search   = String(saved.search || "");
        filters.sizes    = saved.sizes && typeof saved.sizes === "object" ? saved.sizes : {};
        filters.types    = saved.types && typeof saved.types === "object" ? saved.types : {};
        filters.district = String(saved.district || "");
        filters.featured = !!saved.featured;
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
      try { localStorage.setItem(SIDEBAR_KEY, "0"); } catch(_) {}
    }
  }
  function closeSidebar() {
    if (isMobile()) {
      sidebarEl.classList.remove("sidebar-open");
      overlay.classList.remove("active");
      overlay.setAttribute("aria-hidden", "true");
    } else {
      sidebarEl.classList.add("sidebar-hidden");
      try { localStorage.setItem(SIDEBAR_KEY, "1"); } catch(_) {}
    }
  }
  function toggleSidebar() {
    if (isMobile()) { openSidebar(); return; }
    sidebarEl.classList.contains("sidebar-hidden") ? openSidebar() : closeSidebar();
  }
  function restoreSidebarState() {
    if (isMobile()) return;
    try { if (localStorage.getItem(SIDEBAR_KEY) === "1") sidebarEl.classList.add("sidebar-hidden"); } catch(_) {}
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
      sizeListEl,
      SIZE_ORDER.map(function (s) { return { value: s, label: SIZE_LABEL[s] }; }),
      "sizes"
    );
    renderCheckboxList(
      typeListEl,
      TYPE_ORDER.map(function (t) { return { value: t, label: TYPE_LABEL[t] }; }),
      "types"
    );

    searchInput.value = filters.search;
    districtSel.value = filters.district;
    featuredChk.checked = filters.featured;
    sortSelect.value = sort;

    searchInput.addEventListener("input", function () {
      filters.search = searchInput.value;
      saveFilters();
      renderGrid();
    });
    districtSel.addEventListener("change", function () {
      filters.district = districtSel.value;
      saveFilters();
      renderGrid();
    });
    featuredChk.addEventListener("change", function () {
      filters.featured = featuredChk.checked;
      saveFilters();
      renderGrid();
    });
    sortSelect.addEventListener("change", function () {
      sort = sortSelect.value;
      saveFilters();
      renderGrid();
    });

    resetBtn.addEventListener("click", function () {
      filters = { search: "", sizes: {}, types: {}, district: "", featured: false };
      sort = "featured";
      saveFilters();
      // Re-sync inputs.
      searchInput.value = "";
      districtSel.value = "";
      featuredChk.checked = false;
      sortSelect.value = sort;
      sizeListEl.querySelectorAll('input[type="checkbox"]').forEach(function (i) { i.checked = false; });
      typeListEl.querySelectorAll('input[type="checkbox"]').forEach(function (i) { i.checked = false; });
      renderGrid();
    });
  }

  // ── Filtering / sorting ──────────────────────────────────────────────────
  function matchesFilters(v) {
    if (filters.featured && !v.featured) return false;
    if (filters.district && v.district !== filters.district) return false;

    var sizeKeys = Object.keys(filters.sizes);
    if (sizeKeys.length && !filters.sizes[v.size]) return false;

    var typeKeys = Object.keys(filters.types);
    if (typeKeys.length) {
      var vt = Array.isArray(v.tags) ? v.tags : [];
      var any = false;
      for (var i = 0; i < typeKeys.length; i++) {
        if (vt.indexOf(typeKeys[i]) !== -1) { any = true; break; }
      }
      if (!any) return false;
    }

    var q = (filters.search || "").trim().toLowerCase();
    if (q) {
      var hay = [
        v.name || "",
        v.description || "",
        DISTRICT_LABEL[v.district] || "",
        SIZE_LABEL[v.size] || "",
        (Array.isArray(v.tags) ? v.tags : []).join(" "),
        (Array.isArray(v.extra_tags) ? v.extra_tags : []).join(" ")
      ].join(" ").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function nullableNum(n) {
    // Sort nulls/undefined to the end within a tier.
    return n == null ? Number.POSITIVE_INFINITY : Number(n);
  }

  function locationCompare(a, b) {
    return DISTRICT_ORDER.indexOf(a.district) - DISTRICT_ORDER.indexOf(b.district)
      || nullableNum(a.ward) - nullableNum(b.ward)
      || nullableNum(a.plot) - nullableNum(b.plot)
      || nullableNum(a.room_number) - nullableNum(b.room_number)
      || (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
  }

  function sortVenues(list) {
    var copy = list.slice();
    copy.sort(function (a, b) {
      // Featured always pinned to the top, regardless of sort mode.
      var fa = a.featured ? 0 : 1;
      var fb = b.featured ? 0 : 1;
      if (fa !== fb) return fa - fb;

      switch (sort) {
        case "size_asc":
          return SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size)
            || locationCompare(a, b);
        case "size_desc":
          return SIZE_ORDER.indexOf(b.size) - SIZE_ORDER.indexOf(a.size)
            || locationCompare(a, b);
        case "featured":
        default:
          return locationCompare(a, b);
      }
    });
    return copy;
  }

  // ── Counts on filter checkboxes ──────────────────────────────────────────
  function updateCounts() {
    // Counts reflect what would match the OTHER active filters (so users see
    // how many venues each individual checkbox would add).
    function countForFacet(kind, value) {
      return allVenues.reduce(function (acc, v) {
        var temp = {
          search: filters.search,
          sizes: kind === "sizes" ? {} : filters.sizes,
          types: kind === "types" ? {} : filters.types,
          district: filters.district,
          featured: filters.featured
        };
        var saved = filters;
        filters = temp;
        var ok = matchesFilters(v);
        filters = saved;
        if (!ok) return acc;

        if (kind === "sizes") return acc + (v.size === value ? 1 : 0);
        if (kind === "types") {
          var vt = Array.isArray(v.tags) ? v.tags : [];
          return acc + (vt.indexOf(value) !== -1 ? 1 : 0);
        }
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
  function locationLine(v) {
    var parts = [DISTRICT_LABEL[v.district] || ""];
    if (v.ward != null) parts.push("Ward " + v.ward);
    if (v.plot != null && v.size !== "apartment") parts.push("Plot " + v.plot);
    if (v.room_number != null) parts.push("Room " + v.room_number);
    return parts.filter(Boolean).join(", ");
  }

  // Collect primary + up to three gallery images. Field name mirrors what the
  // worker is expected to return: `gallery_images` as an array of strings
  // (full URLs or paths under /pv/assets/venues/). Falls back to legacy
  // `gallery_image_1/2/3` shape if the worker exposes those instead.
  function venueImages(v) {
    var imgs = [];
    if (v.image_url) imgs.push(v.image_url);
    var gal = Array.isArray(v.gallery_images)
      ? v.gallery_images
      : [v.gallery_image_1, v.gallery_image_2, v.gallery_image_3];
    gal.forEach(function (g) {
      if (g && typeof g === "string" && g.trim()) imgs.push(g.trim());
    });
    return imgs;
  }

  function truncate(str, n) {
    if (!str) return "";
    var s = String(str).trim();
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "…";
  }

  function buildCardEl(v) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "venue-card" + (v.featured ? " is-featured" : "");
    card.setAttribute("aria-label", v.name);

    var palette = SIZE_PALETTE[v.size] || SIZE_PALETTE.house;
    var media = document.createElement("div");
    media.className = "venue-card-media";

    if (v.image_url) {
      var img = document.createElement("img");
      img.src = v.image_url;
      img.alt = "";
      img.loading = "lazy";
      img.className = "venue-card-img";
      img.addEventListener("error", function () {
        img.remove();
        media.style.background =
          "linear-gradient(135deg, " + palette.from + " 0%, " + palette.to + " 100%)";
      });
      media.appendChild(img);
    } else {
      media.style.background =
        "linear-gradient(135deg, " + palette.from + " 0%, " + palette.to + " 100%)";
      var sig = document.createElement("span");
      sig.className = "venue-card-sig";
      sig.textContent = (v.name || "").toLowerCase();
      media.appendChild(sig);
    }

    if (v.featured) {
      var fb = document.createElement("span");
      fb.className = "venue-badge venue-badge-featured";
      fb.innerHTML = '<span aria-hidden="true">&#9733;</span> FEATURED';
      media.appendChild(fb);
    }
    var sb = document.createElement("span");
    sb.className = "venue-badge venue-badge-size";
    sb.textContent = (SIZE_LABEL[v.size] || "").toUpperCase();
    media.appendChild(sb);

    card.appendChild(media);

    var body = document.createElement("div");
    body.className = "venue-card-body";

    var titleRow = document.createElement("div");
    titleRow.className = "venue-card-title-row";
    var title = document.createElement("h3");
    title.className = "venue-card-title";
    title.textContent = v.name || "Untitled venue";
    titleRow.appendChild(title);
    body.appendChild(titleRow);

    var loc = document.createElement("p");
    loc.className = "venue-card-location";
    loc.textContent = locationLine(v).toUpperCase();
    body.appendChild(loc);

    var desc = document.createElement("p");
    desc.className = "venue-card-desc";
    desc.textContent = truncate(v.description, 140);
    body.appendChild(desc);

    var tagWrap = document.createElement("div");
    tagWrap.className = "venue-card-tags";
    var tags = (Array.isArray(v.tags) ? v.tags : []).slice();
    tags.forEach(function (t) {
      var sp = document.createElement("span");
      sp.className = "venue-card-tag";
      sp.textContent = "#" + t.replace(/_/g, " ");
      tagWrap.appendChild(sp);
    });
    body.appendChild(tagWrap);

    card.appendChild(body);

    card.addEventListener("click", function () { openModal(v); });
    return card;
  }

  function renderGrid() {
    updateCounts();

    var filtered = allVenues.filter(matchesFilters);
    var sorted = sortVenues(filtered);

    countEl.textContent = sorted.length === 1
      ? "1 venue"
      : sorted.length + " venues";

    gridEl.innerHTML = "";

    if (!sorted.length) {
      var empty = document.createElement("div");
      empty.className = "venues-empty";
      empty.innerHTML = '<p>No venues match these filters.</p>' +
        '<p style="font-size:0.95rem; color:var(--text-secondary);">Try clearing a filter or two.</p>';
      gridEl.appendChild(empty);
      return;
    }

    sorted.forEach(function (v) {
      gridEl.appendChild(buildCardEl(v));
    });
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  function buildGalleryHtml(v) {
    var palette = SIZE_PALETTE[v.size] || SIZE_PALETTE.house;
    var imgs = venueImages(v);

    if (!imgs.length) {
      return '<div class="venue-modal-img venue-modal-img-fallback" style="background:linear-gradient(135deg, ' +
        palette.from + ' 0%, ' + palette.to + ' 100%);">' +
        '<span class="venue-card-sig">' + escapeHTML((v.name || "").toLowerCase()) + '</span>' +
        '</div>';
    }

    if (imgs.length === 1) {
      return '<img src="' + escapeHTML(imgs[0]) + '" alt="" class="venue-modal-img">';
    }

    var slides = imgs.map(function (src, i) {
      return '<img src="' + escapeHTML(src) + '" alt="" ' +
        'class="venue-gallery-slide' + (i === 0 ? ' is-active' : '') + '" ' +
        'data-index="' + i + '">';
    }).join("");

    var dots = imgs.map(function (_, i) {
      return '<button type="button" class="venue-gallery-dot' + (i === 0 ? ' is-active' : '') +
        '" data-index="' + i + '" aria-label="Image ' + (i + 1) + '"></button>';
    }).join("");

    return '<div class="venue-gallery" data-count="' + imgs.length + '">' +
      '<div class="venue-gallery-track">' + slides + '</div>' +
      '<button type="button" class="venue-gallery-nav venue-gallery-prev" aria-label="Previous image">&#10094;</button>' +
      '<button type="button" class="venue-gallery-nav venue-gallery-next" aria-label="Next image">&#10095;</button>' +
      '<div class="venue-gallery-dots">' + dots + '</div>' +
      '</div>';
  }

  function wireGallery(root) {
    var gallery = root.querySelector(".venue-gallery");
    if (!gallery) return;
    var slides = gallery.querySelectorAll(".venue-gallery-slide");
    var dots   = gallery.querySelectorAll(".venue-gallery-dot");
    if (!slides.length) return;
    var idx = 0;

    function show(i) {
      idx = (i + slides.length) % slides.length;
      slides.forEach(function (s, j) { s.classList.toggle("is-active", j === idx); });
      dots.forEach(function (d, j) { d.classList.toggle("is-active", j === idx); });
    }

    var prev = gallery.querySelector(".venue-gallery-prev");
    var next = gallery.querySelector(".venue-gallery-next");
    if (prev) prev.addEventListener("click", function () { show(idx - 1); });
    if (next) next.addEventListener("click", function () { show(idx + 1); });
    dots.forEach(function (d) {
      d.addEventListener("click", function () { show(Number(d.dataset.index) || 0); });
    });
  }

  function openModal(v) {
    var imgHtml = buildGalleryHtml(v);

    var descHtml = v.description
      ? (window.marked && marked.parse ? marked.parse(escapeHTML(v.description)) : "<p>" + escapeHTML(v.description) + "</p>")
      : '<p style="color:var(--text-secondary);"><em>No description provided.</em></p>';

    var allTags = []
      .concat(Array.isArray(v.tags) ? v.tags.map(function (t) { return "#" + t.replace(/_/g, " "); }) : [])
      .concat(Array.isArray(v.extra_tags) ? v.extra_tags.map(function (t) { return "#" + t; }) : []);
    var tagsHtml = allTags.length
      ? '<div class="venue-card-tags venue-modal-tags">' +
        allTags.map(function (t) {
          return '<span class="venue-card-tag">' + escapeHTML(t) + '</span>';
        }).join("") +
        '</div>'
      : "";

    var badges =
      (v.featured ? '<span class="venue-badge venue-badge-featured" style="position:static;"><span aria-hidden="true">&#9733;</span> FEATURED</span>' : "") +
      '<span class="venue-badge venue-badge-size" style="position:static;">' + escapeHTML((SIZE_LABEL[v.size] || "").toUpperCase()) + '</span>';

    modalBody.innerHTML =
      imgHtml +
      '<div class="venue-modal-content">' +
        '<div class="venue-modal-badges">' + badges + '</div>' +
        '<h2 class="venue-modal-title" id="venue-modal-title">' + escapeHTML(v.name || "Untitled venue") + '</h2>' +
        '<p class="venue-modal-location">' + escapeHTML(locationLine(v).toUpperCase()) + '</p>' +
        '<div class="venue-modal-desc">' + descHtml + '</div>' +
        tagsHtml +
      '</div>';

    wireGallery(modalBody);

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
  async function loadVenues() {
    gridEl.innerHTML = '<div class="venues-empty"><p>Loading venues&hellip;</p></div>';
    try {
      var res = await fetch(API_BASE + "/venues", {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) throw new Error("Request failed (" + res.status + ")");
      var data = await res.json();
      allVenues = Array.isArray(data) ? data : [];
      renderGrid();
    } catch (err) {
      console.error("Error loading venues:", err);
      gridEl.innerHTML = '<div class="venues-empty venues-empty-error">' +
        '<p>Could not reach the venue directory. Please try again shortly.</p></div>';
      countEl.textContent = "";
    }
  }

  loadFilters();
  buildFilterUI();
  loadVenues();
})();
