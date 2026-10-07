// ============================================================================
//  Phoenix Vanguard Menus — public venue menus
//
//  Two states on one page:
//    1. Venue chooser  — cards for every venue with a published menu.
//    2. Menu view      — that venue's menu, grouped by category.
//  A venue must be picked before any menu is shown; ?venue=<id> deep-links
//  straight to the menu view (used by the "View Menu" link in the venue modal).
//
//  Worker endpoints used:
//    GET /menus/venues        -> [{ id, name, size, district, ward, plot,
//                                   room_number, image_url, item_count }]
//    GET /menus?venue_id=<id> -> { venue, categories: [{ id, name, icon,
//                                   sort_order, items: [...] }] }
// ============================================================================

(function () {
  var API_BASE = "https://pv-med-database-worker.chlorinatorgreen.workers.dev";

  var DISTRICT_LABEL = {
    mist: "Mist", lavender_beds: "Lavender Beds", goblet: "Goblet",
    empyreum: "Empyreum", shirogane: "Shirogane"
  };

  var SIZE_PALETTE = {
    room:      { from: "#3a2a3d", to: "#1f1424" },
    apartment: { from: "#3b3727", to: "#211e15" },
    cottage:   { from: "#3a2a25", to: "#1f1612" },
    house:     { from: "#1f3340", to: "#101c25" },
    mansion:   { from: "#3a2c1e", to: "#1f1810" }
  };

  // ── Category icons ───────────────────────────────────────────────────────
  //  Keyed glyphs, not markup: the worker stores only the key, and anything
  //  it does not recognise falls back to DEFAULT_ICON. Paths follow the
  //  .img-slot-icon convention already used on the landing page — 24x24,
  //  no fill, stroked in currentColor.
  var DEFAULT_ICON = "dish";
  var MENU_ICONS = {
    dish:    '<path d="M3 18h18"/><path d="M5 18a7 7 0 0 1 14 0"/><circle cx="12" cy="6" r="1"/>',
    bowl:    '<path d="M3 10h18"/><path d="M4 10a8 8 0 0 0 16 0"/><path d="M11 6c-1-1 0-2 1-3"/>',
    goblet:  '<path d="M7 3h10l-1 6a4 4 0 0 1-8 0z"/><path d="M12 14v6"/><path d="M9 20h6"/>',
    tankard: '<path d="M5 5h11v15H5z"/><path d="M16 8h2.5a2.5 2.5 0 0 1 0 5H16"/><path d="M5 9h11"/>',
    teacup:  '<path d="M4 8h12v4a6 6 0 0 1-12 0z"/><path d="M16 9h2a2 2 0 0 1 0 4h-2"/><path d="M3 20h15"/>',
    bottle:  '<path d="M10 2h4v4l2 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3z"/><path d="M8 13h8"/>',
    bread:   '<path d="M4 12a4 4 0 0 1 4-4h8a4 4 0 0 1 0 8H8a4 4 0 0 1-4-4z"/><path d="M9 8v8"/><path d="M13 8v8"/>',
    fish:    '<path d="M3 12c4-5 9-5 12 0-3 5-8 5-12 0z"/><path d="M15 12l6-4v8z"/><circle cx="7" cy="11" r=".7"/>',
    skewer:  '<circle cx="9" cy="8" r="3"/><circle cx="14" cy="13" r="3"/><path d="M4 20 20 4"/>',
    cake:    '<path d="M4 20h16v-6a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4z"/><path d="M12 6V3"/><path d="M4 16h16"/>',
    fruit:   '<circle cx="12" cy="14" r="6"/><path d="M12 8V4"/><path d="M12 6c2-2 4-2 4-2"/>',
    herb:    '<path d="M20 4C10 4 4 10 4 20c10 0 16-6 16-16z"/><path d="M4 20 14 10"/>',
    flame:   '<path d="M12 3c4 5 6 7 6 11a6 6 0 0 1-12 0c0-2 1-4 3-6 0 2 1 3 2 3 1 0 1-4 1-8z"/>',
    pot:     '<path d="M4 10h16v3a8 8 0 0 1-16 0z"/><path d="M2 10h20"/><path d="M9 6c0-1 1-1 1-2"/><path d="M14 6c0-1 1-1 1-2"/>',
    cheese:  '<path d="M3 16l16-8v8z"/><circle cx="14" cy="13" r="1"/><circle cx="9" cy="14" r="1"/>',
    star:    '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>'
  };

  function iconSvg(key, className) {
    var paths = MENU_ICONS[key] || MENU_ICONS[DEFAULT_ICON];
    return '<svg class="' + className + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  // ── DOM refs ─────────────────────────────────────────────────────────────
  var introEl    = document.getElementById("menus-intro");
  var chooserEl  = document.getElementById("menus-chooser");
  var venueGrid  = document.getElementById("menus-venue-grid");
  var viewEl     = document.getElementById("menus-view");
  var sheetEl    = document.getElementById("menu-sheet");
  var backBtn    = document.getElementById("menu-back-btn");

  // ── State ────────────────────────────────────────────────────────────────
  var allVenues = [];
  // Which venue's menu is on screen, as a string; null while the chooser is
  // showing. Lets popstate tell a real navigation from a fragment jump.
  var currentVenueId = null;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function escapeHTML(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function locationLine(v) {
    var parts = [DISTRICT_LABEL[v.district] || v.district || ""];
    if (v.ward != null) parts.push("Ward " + v.ward);
    if (v.plot != null) parts.push("Plot " + v.plot);
    if (v.room_number != null) parts.push("Room " + v.room_number);
    return parts.filter(Boolean).join(" · ");
  }

  // Gil is stored as a plain integer; null means "no price listed", which is
  // rendered as nothing at all (and suppresses the dot leader).
  function formatCost(cost) {
    if (cost == null || cost === "") return "";
    var n = Number(cost);
    if (!isFinite(n)) return "";
    return n.toLocaleString("en-US") + " gil";
  }

  function venueImage(id) {
    if (id == null) return "";
    for (var i = 0; i < allVenues.length; i++) {
      if (String(allVenues[i].id) === String(id)) return allVenues[i].image_url || "";
    }
    return "";
  }

  function slugForAnchor(name, id) {
    return "cat-" + id + "-" + String(name || "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  // ── Venue chooser ────────────────────────────────────────────────────────
  function venueCardHtml(v) {
    var palette = SIZE_PALETTE[v.size] || SIZE_PALETTE.house;
    var media = v.image_url
      ? '<img class="menu-venue-card-img" src="' + escapeHTML(v.image_url) +
        '" alt="" loading="lazy" decoding="async" />'
      : '<span class="menu-venue-card-sig">' +
        escapeHTML((v.name || "").toLowerCase()) + '</span>';

    return '' +
      '<button type="button" class="menu-venue-card" data-venue-id="' + escapeHTML(v.id) + '">' +
        '<span class="menu-venue-card-media"' +
          (v.image_url ? '' : ' style="background:linear-gradient(135deg,' +
            palette.from + ' 0%,' + palette.to + ' 100%)"') + '>' +
          media +
          // Torn-edge overlay, same as the venue directory cards.
          '<span class="contrast-border-half" aria-hidden="true"></span>' +
        '</span>' +
        '<span class="menu-venue-card-body">' +
          '<span class="menu-venue-card-title">' + escapeHTML(v.name || "Untitled venue") + '</span>' +
          '<span class="menu-venue-card-location">' + escapeHTML(locationLine(v).toUpperCase()) + '</span>' +
        '</span>' +
      '</button>';
  }

  function renderChooser() {
    if (!allVenues.length) {
      venueGrid.innerHTML =
        '<div class="venues-empty"><p>No menus have been published yet.</p>' +
        '<p>Check back once a tavern or restaurant adds their fare.</p></div>';
      return;
    }
    venueGrid.innerHTML = allVenues.map(venueCardHtml).join("");
    Array.prototype.forEach.call(
      venueGrid.querySelectorAll(".menu-venue-card"),
      function (btn) {
        btn.addEventListener("click", function () {
          selectVenue(btn.dataset.venueId, true);
        });
      }
    );
  }

  // ── Menu view ────────────────────────────────────────────────────────────
  function itemHtml(item, icon) {
    var cost = formatCost(item.cost);
    var thumb = item.image_url
      ? '<span class="menu-thumb sketch-wash">' +
          '<img src="' + escapeHTML(item.image_url) + '" alt="" ' +
          'loading="lazy" decoding="async" />' +
        '</span>'
      : '<span class="menu-thumb is-placeholder">' +
          iconSvg(icon, "menu-thumb-icon") +
        '</span>';

    var desc = item.description
      ? '<p class="menu-item-desc">' + escapeHTML(item.description) + '</p>'
      : "";

    // The dot leader only renders alongside a price — a leader running into
    // nothing reads as a mistake. Leader and price are wrapped together so a
    // long name pushes the pair onto its own line intact rather than leaving
    // the leader stranded as a stub beside the first line.
    var priceRun = cost
      ? '<span class="menu-item-price">' +
          '<span class="menu-item-leader" aria-hidden="true"></span>' +
          '<span class="menu-item-cost">' + escapeHTML(cost) + '</span>' +
        '</span>'
      : "";

    return '' +
      '<li class="menu-item">' +
        thumb +
        '<span class="menu-item-body">' +
          '<span class="menu-item-head">' +
            '<span class="menu-item-name">' + escapeHTML(item.name || "Untitled") + '</span>' +
            priceRun +
          '</span>' +
          desc +
        '</span>' +
      '</li>';
  }

  function categoryHtml(cat) {
    var icon = cat.icon || DEFAULT_ICON;
    var items = Array.isArray(cat.items) ? cat.items : [];
    if (!items.length) return "";

    return '' +
      '<section class="menu-category" id="' + escapeHTML(slugForAnchor(cat.name, cat.id)) + '">' +
        '<h2 class="menu-cat-heading">' +
          '<span class="menu-cat-heading-label">' +
            iconSvg(icon, "menu-cat-icon") +
            escapeHTML(cat.name || "Menu") +
          '</span>' +
        '</h2>' +
        '<ul class="menu-items">' + items.map(function (it) {
          return itemHtml(it, icon);
        }).join("") + '</ul>' +
      '</section>';
  }

  function renderMenu(payload) {
    var v = payload.venue || {};
    var cats = (payload.categories || []).filter(function (c) {
      return Array.isArray(c.items) && c.items.length;
    });

    // A category index is only worth the space once a menu has enough
    // sections to be worth jumping around.
    var indexHtml = cats.length > 2
      ? '<nav class="menu-index" aria-label="Menu sections">' +
          cats.map(function (c) {
            return '<a class="menu-index-link" href="#' +
              escapeHTML(slugForAnchor(c.name, c.id)) + '">' +
              escapeHTML(c.name || "Menu") + '</a>';
          }).join("") +
        '</nav>'
      : "";

    var body = cats.length
      ? cats.map(categoryHtml).join("")
      : '<p class="menu-empty">This menu has not been filled in yet.</p>';

    // The venue's own photograph doubles as the masthead backdrop. The chooser
    // payload always carries image_url; the menu payload's venue object may
    // not, so fall back to the card data already in hand.
    var heroUrl = v.image_url || venueImage(v.id != null ? v.id : currentVenueId);

    sheetEl.innerHTML = '' +
      '<header class="menu-sheet-header' + (heroUrl ? ' has-hero' : '') + '">' +
        '<h1 class="menu-sheet-title">' + escapeHTML(v.name || "Menu") + '</h1>' +
        '<p class="menu-sheet-location">' + escapeHTML(locationLine(v)) + '</p>' +
      '</header>' +
      indexHtml +
      body;

    // Set as a custom property rather than inlined into the markup: the URL
    // goes in through the CSSOM, so it can never be read as anything but a
    // value (an invalid one is simply dropped).
    if (heroUrl) {
      var headerEl = sheetEl.querySelector(".menu-sheet-header");
      if (headerEl) {
        headerEl.style.setProperty(
          "--menu-hero-img", 'url("' + String(heroUrl).replace(/["\\]/g, "") + '")'
        );
      }
    }

    fitNames();
    // Stoke arrives from Google Fonts after first paint; the fallback's
    // metrics differ, so measure again once the real face is in.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitNames);
    }
  }

  // A wrapped flex item keeps its full max-width, so a two-line name leaves
  // dead space between its shorter last line and the dots. CSS has no
  // "shrink to the widest rendered line" (fit-content gives the cap back,
  // min-content breaks at the longest word), so measure the line boxes and
  // set the width to the widest of them.
  function fitNames() {
    var names = sheetEl.querySelectorAll(".menu-item-name");
    var range = document.createRange();
    for (var i = 0; i < names.length; i++) {
      var el = names[i];
      el.style.width = "";
      range.selectNodeContents(el);
      var rects = range.getClientRects();
      var widest = 0;
      for (var j = 0; j < rects.length; j++) {
        if (rects[j].width > widest) widest = rects[j].width;
      }
      if (widest) el.style.width = Math.ceil(widest) + "px";
    }
  }

  var fitTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitNames, 120);
  });

  function showChooser(push) {
    currentVenueId = null;
    viewEl.hidden = true;
    chooserEl.hidden = false;
    introEl.hidden = false;
    sheetEl.innerHTML = "";
    document.title = "Phoenix Vanguard Menus";
    // pathname alone drops both ?venue and any #category fragment.
    if (push) history.pushState({ venue: null }, "", location.pathname);
    window.scrollTo(0, 0);
  }

  function showView(push, venueId) {
    currentVenueId = String(venueId);
    chooserEl.hidden = true;
    introEl.hidden = true;
    viewEl.hidden = false;
    var href = location.pathname + "?venue=" + encodeURIComponent(venueId);
    // Deep links arrive with no history state of their own; recording it keeps
    // the entry consistent with the ones pushed below.
    if (push) history.pushState({ venue: venueId }, "", href);
    else history.replaceState({ venue: venueId }, "", href);
    window.scrollTo(0, 0);
  }

  async function selectVenue(venueId, push) {
    showView(push, venueId);
    sheetEl.innerHTML = '<p class="menu-empty">Loading menu&hellip;</p>';
    try {
      var payload = await fetchMenu(venueId);
      renderMenu(payload);
      if (payload.venue && payload.venue.name) {
        document.title = payload.venue.name + " — Menu";
      }
    } catch (err) {
      console.error("Error loading menu:", err);
      sheetEl.innerHTML =
        '<p class="menu-empty venues-empty-error">Could not load this menu. ' +
        'Please try again shortly.</p>';
    }
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  async function getJSON(path) {
    var res = await fetch(API_BASE + path, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    if (!res.ok) throw new Error("Request failed (" + res.status + ")");
    return res.json();
  }

  async function fetchVenues() {
    return getJSON("/menus/venues");
  }

  async function fetchMenu(venueId) {
    return getJSON("/menus?venue_id=" + encodeURIComponent(venueId));
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  backBtn.addEventListener("click", function () { showChooser(true); });

  // Read the target from the URL rather than history.state. Clicking a
  // category jump link pushes a fragment-only entry with null state, which
  // fires popstate in Chrome — trusting state alone read that as "no venue"
  // and threw the reader back to the chooser mid-jump. Comparing the ?venue
  // param against what is already open makes a fragment change a no-op, so
  // the browser's own anchor scroll is left to do its job.
  window.addEventListener("popstate", function () {
    var venueId = new URLSearchParams(location.search).get("venue");
    if (!venueId) {
      if (currentVenueId !== null) showChooser(false);
      return;
    }
    if (venueId !== currentVenueId) selectVenue(venueId, false);
  });

  async function boot() {
    venueGrid.innerHTML = '<div class="venues-empty"><p>Loading menus&hellip;</p></div>';
    try {
      var data = await fetchVenues();
      allVenues = (Array.isArray(data) ? data : []).filter(function (v) {
        return (Number(v.item_count) || 0) > 0;
      });
      renderChooser();
    } catch (err) {
      console.error("Error loading menus:", err);
      venueGrid.innerHTML = '<div class="venues-empty venues-empty-error">' +
        '<p>Could not reach the menu directory. Please try again shortly.</p></div>';
      return;
    }

    // Deep link: ?venue=<id> opens that menu directly.
    var wanted = new URLSearchParams(location.search).get("venue");
    if (wanted) selectVenue(wanted, false);
  }

  boot();
})();
