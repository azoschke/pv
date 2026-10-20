// home.js — the home page: the recruiting line and campaign copy, and the
// signed-in blocks.
(function () {
  "use strict";

  var MED_API       = "https://pv-med-database-worker.chlorinatorgreen.workers.dev";
  var CAMPAIGNS_API = "https://pv-campaigns-worker.chlorinatorgreen.workers.dev";
  var ROLLS_API     = "https://pv-campaign-rolls-worker.chlorinatorgreen.workers.dev";
  var IMAGES        = "https://images.phoenixvanguard-tools.com/";

  var PROFILE_URL = "portal.html?section=my-profile&tab=profile";
  var APPS_URL    = "portal.html?section=my-profile&tab=applications";
  // "Hide for now" on New Aboard lasts for this browser session.
  var HIDE_ONBOARDING_KEY = "pv-home-onboarding-hidden";

  // Shared with the calendar and the boards.
  var EVENT_CATEGORY = {
    "rp": "RP", "rp-campaign": "RP Campaign", "community-event": "Community Event",
    "seasonal": "Seasonal", "pve": "PVE", "collab": "Collab", "event": "Event",
    "fc": "FC", "update": "Update", "uncategorized": "Uncategorized"
  };
  var DIVISION_LABEL = {
    mercenary: "Mercenary", medical: "Medical", pirate: "Pirate",
    house_staff: "House Staff", recon: "Recon", contractor: "Contractor"
  };
  var DIVISION_TONE = { medical: 3, pirate: 5, mercenary: 2, house_staff: 1, recon: 3, contractor: 4 };
  var MISSION_TONE  = { training: 3, investigation: 1, bounty: 2, escort: 5, gathering: 4 };

  var session = window.PVSession ? window.PVSession.get() : null;
  // Keep the page in step with the sign-in.
  document.documentElement.classList.toggle("pv-signed-in", !!session);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Workers store UTC as "YYYY-MM-DD HH:MM:SS"; anything else goes to Date.
  function parseTime(s) {
    if (!s) return null;
    var str = String(s);
    var t = /^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d)?$/.test(str)
      ? Date.parse(str.replace(" ", "T") + "Z")
      : Date.parse(str);
    return isNaN(t) ? null : t;
  }

  // "Fri, Oct 16 · 8:00 PM"
  function fmtWhen(ms) {
    var d = new Date(ms);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function mediaClass(tone) {
    return "media-ph" + (tone > 1 ? " is-tone-" + tone : "");
  }

  // A thumbnail, or the placeholder when there's no image.
  function thumb(url, tone) {
    return '<span class="home-thumb ' + mediaClass(tone) + '" aria-hidden="true">' +
      (url ? '<img src="' + esc(url) + '" alt="" loading="lazy">' : "") + "</span>";
  }

  function dropBrokenImages(root) {
    root.querySelectorAll("img").forEach(function (img) {
      img.addEventListener("error", function () { img.remove(); });
    });
  }

  function muted(text) {
    return '<p class="home-muted">' + esc(text) + "</p>";
  }

  function getJSON(url) {
    return fetch(url, { headers: { "Accept": "application/json" } }).then(function (res) {
      if (!res.ok) {
        var err = new Error("HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
  }

  // A signed-in read. A sign-in the med worker rejects is cleared.
  var reloading = false;
  function memberGet(base, path) {
    return window.PVSession.request(base, "GET", path, undefined, { auth: "optional" })
      .catch(function (err) {
        if (err && err.status === 401 && base === MED_API && !reloading) {
          reloading = true;
          window.PVSession.clear();
          window.location.reload();
        }
        throw err;
      });
  }

  function storageGet(key) {
    try { return sessionStorage.getItem(key); } catch (_e) { return null; }
  }
  function storageSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_e) { /* not kept */ }
  }

  // ── The main campaign (both states) ──────────────────────────────────────
  // The first campaign tagged "main"; null when there is none.
  var mainCampaign = getJSON(CAMPAIGNS_API + "/campaigns").then(function (list) {
    return (Array.isArray(list) ? list : []).filter(function (c) {
      return c && c.slug && c.tag === "main";
    })[0] || null;
  });

  function chapterHref(slug, chapterSlug) {
    return "view.html?c=" + encodeURIComponent(slug) +
      (chapterSlug ? "&ch=" + encodeURIComponent(chapterSlug) : "");
  }

  mainCampaign.then(function (c) {
    if (!c) return;
    if (c.name) {
      document.querySelectorAll("[data-home-campaign-name]").forEach(function (el) { el.textContent = c.name; });
    }
    if (c.blurb) {
      document.querySelectorAll("[data-home-campaign-blurb]").forEach(function (el) { el.textContent = c.blurb; });
    }
    var signin = document.getElementById("home-campaign-signin");
    if (signin) signin.href = "login.html?redirect=" + encodeURIComponent(chapterHref(c.slug));
  }).catch(function () { /* the page's copy stays */ });

  // ── Visitors: recruiting ─────────────────────────────────────────────────
  function loadRecruiting() {
    getJSON(MED_API + "/site/public").then(function (data) {
      var url = data && data.recruitment_url;
      if (!url || !/^https?:\/\//i.test(url)) return;
      document.getElementById("home-recruit-line").textContent = "and we\u2019re currently recruiting.";
      var link = document.getElementById("home-recruit-link");
      link.href = url;
      link.hidden = false;
      document.getElementById("home-officers-recruit-link").href = url;
      document.getElementById("home-officers-recruit").hidden = false;
    }).catch(function () { /* not recruiting */ });
  }

  // ── Members: markup ──────────────────────────────────────────────────────
  var ICON_CALENDAR = '<span class="material-icons home-icon" aria-hidden="true">calendar_month</span>';
  // The portal's Campaigns icon.
  var ICON_BOOK = '<span class="material-icons home-icon" aria-hidden="true">auto_stories</span>';
  // The portal's Combat Toolkit icon.
  var ICON_DICE = '<span class="material-icons home-icon" aria-hidden="true">casino</span>';
  var ICON_CHECK = '<svg class="home-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>';

  function quickCard(icon, title, bodyId, eyebrow, btnId, href, label) {
    return '<article class="home-quick-card tray">' +
        '<div class="home-quick-head">' + icon + "<h2>" + title + "</h2></div>" +
        '<div class="home-quick-body" id="' + bodyId + '"><p class="eyebrow">' + eyebrow + "</p>" + muted("Loading\u2026") + "</div>" +
        '<a class="btn" id="' + btnId + '" href="' + href + '">' + label + "</a>" +
      "</article>";
  }

  function welcomeHtml(name) {
    return '<div class="home-band is-short">' +
        '<div class="home-band-photo media-ph tear">' +
          '<img src="' + IMAGES + 'web-home-banner.jpg" alt="">' +
        "</div>" +
      "</div>" +
      '<section class="home-welcome tear" aria-label="Crew quick access">' +
        '<div class="home-welcome-head">' +
          '<div><p class="app-subtitle">Welcome back,</p><h1 class="app-title">' + esc(name) + "</h1></div>" +
          '<a class="btn is-quiet" href="portal.html">My Dashboard</a>' +
        "</div>" +
        '<div class="home-quick">' +
          quickCard(ICON_CALENDAR, "Calendar", "home-q-calendar", "Next up", "home-q-calendar-btn", "calendar.html", "Open Calendar") +
          quickCard(ICON_BOOK, "Campaigns", "home-q-campaign", "Latest chapter", "home-q-campaign-btn", "campaigns.html", "Continue Reading") +
          quickCard(ICON_DICE, "Roll Calculator", "home-q-roll", "Your session", "home-q-roll-btn", "roll-calculator.html", "Open Roll Calculator") +
        "</div>" +
      "</section>";
  }

  function boardsHtml() {
    return '<div class="home-boards">' +
        '<section class="home-board tear-half" aria-labelledby="home-jobs-title">' +
          '<h2 class="landing-row-title" id="home-jobs-title">Job Board</h2>' +
          '<p class="home-board-intro">Open positions for the company and close allies. Filter by division to find work that suits you.</p>' +
          '<ul class="home-board-list" id="home-jobs"><li class="home-board-row">' + muted("Loading\u2026") + "</li></ul>" +
          '<div class="home-actions">' +
            '<a class="btn" href="job-board.html">Browse Job Board</a>' +
            '<a class="btn is-plain" href="' + APPS_URL + '">My Applications</a>' +
          "</div>" +
        "</section>" +
        '<section class="home-board tear-half" aria-labelledby="home-quests-title">' +
          '<h2 class="landing-row-title" id="home-quests-title">Bounty Board</h2>' +
          '<p class="home-board-intro">Quests and bounties posted by the Phoenix Vanguard and its members. Sign up to join, or express your interest.</p>' +
          '<ul class="home-board-list" id="home-quests"><li class="home-board-row">' + muted("Loading\u2026") + "</li></ul>" +
          '<div class="home-actions">' +
            '<a class="btn" href="bounty-board.html">Browse Bounties</a>' +
            '<a class="btn is-quiet" href="' + APPS_URL + '">Submit a Quest</a>' +
          "</div>" +
        "</section>" +
      "</div>";
  }

  // Starts with the visitor row's copy.
  function campaignRowHtml() {
    var nameEl = document.querySelector("[data-home-campaign-name]");
    var blurbEl = document.querySelector("[data-home-campaign-blurb]");
    return '<section class="landing-row landing-row--campaign" aria-label="The chronicle">' +
        '<div class="landing-row-image landing-row-image--photo media-ph is-tone-2 tear-half">' +
          '<img src="' + IMAGES + 'campaign-symphony-of-the-eclipse-1791402475539.jpg" alt="Campaign art for Symphony of the Eclipse" loading="lazy">' +
        "</div>" +
        '<div class="landing-row-content">' +
          '<p class="eyebrow">A continuing chronicle</p>' +
          '<h2 class="landing-row-title" data-home-campaign-name>' + esc(nameEl ? nameEl.textContent : "") + "</h2>" +
          '<p class="home-meta"><span class="tag">Main campaign</span><span class="home-meta-note" id="home-campaign-latest" hidden></span></p>' +
          '<p class="landing-row-desc" data-home-campaign-blurb>' + esc(blurbEl ? blurbEl.textContent : "") + "</p>" +
          '<div class="home-actions is-tight">' +
            '<a class="btn" id="home-campaign-continue" href="campaigns.html">Continue Reading</a>' +
            '<a class="btn is-quiet" id="home-campaign-tldr" href="campaigns.html" hidden>TL;DR</a>' +
          "</div>" +
          '<p class="home-links">' +
            '<a class="btn is-plain" href="campaigns.html">All Campaigns</a>' +
            '<a class="btn is-plain" href="campaigns.html?tag=oneshot">One-Shots</a>' +
            '<a class="btn is-plain" href="codex.html">The Codex</a>' +
          "</p>" +
        "</div>" +
      "</section>";
  }

  function toolItem(href, name, note) {
    return '<li><a href="' + href + '"><span class="tool-list-name">' + name +
      (note ? '<span class="tool-list-note">' + note + "</span>" : "") +
      '</span><span class="tool-list-arrow">&rarr;</span></a></li>';
  }

  function medicalHtml() {
    return '<section class="landing-row landing-row--medical" aria-label="Medical">' +
        '<div class="landing-row-image landing-row-image--photo media-ph is-tone-4 tear-half">' +
          '<img class="light-only" src="' + IMAGES + 'medical-light.jpg" alt="Medics in the lamplit infirmary, one reading from a book and one holding a glowing vial, beside a patient on a bed" loading="lazy">' +
          '<img class="dark-only" src="' + IMAGES + 'medical-dark.jpg" alt="Medics in the lamplit infirmary, one reading from a book and one holding a glowing vial, beside a patient on a bed" loading="lazy">' +
        "</div>" +
        '<div class="landing-row-content">' +
          '<p class="eyebrow">Patient &amp; staff resources</p>' +
          '<h2 class="landing-row-title">Medical</h2>' +
          '<p class="landing-row-desc">Patient intake, treatment reports, appointment requests, and the records archive for the medical division.</p>' +
          '<div class="home-tool-groups">' +
            '<div><p class="group-label">Patient resources</p><ul class="tool-list">' +
              toolItem("appointment-request.html", "Appointment Request") +
              toolItem("staff-roster.html", "Medical Staff") +
            "</ul></div>" +
            '<div><p class="group-label">Staff</p><ul class="tool-list">' +
              toolItem("med-database.html", "Patient Records", "staff only") +
            "</ul></div>" +
          "</div>" +
        "</div>" +
      "</section>";
  }

  // ── Members: Calendar ────────────────────────────────────────────────────
  // The next event that hasn't finished.
  function loadCalendar() {
    var box = document.getElementById("home-q-calendar");
    var head = '<p class="eyebrow">Next up</p>';
    memberGet(MED_API, "/calendar").then(function (events) {
      var now = Date.now();
      var next = (Array.isArray(events) ? events : []).map(function (e) {
        return { e: e, start: parseTime(e && e.starts_at), end: parseTime(e && e.ends_at) };
      }).filter(function (x) {
        return x.start != null && (x.end != null ? x.end : x.start) >= now;
      }).sort(function (a, b) { return a.start - b.start; })[0];
      if (!next) { box.innerHTML = head + muted("Nothing scheduled yet"); return; }
      var cat = next.e.category || "uncategorized";
      box.innerHTML = head +
        '<p class="home-quick-value">' + esc(next.e.title) + "</p>" +
        '<p class="home-meta"><span class="tag">' + esc(EVENT_CATEGORY[cat] || cat) + "</span>" +
          '<span class="home-meta-note">' + esc(fmtWhen(next.start)) + "</span></p>";
    }).catch(function () {
      box.innerHTML = head + muted("Couldn\u2019t load the calendar.");
    });
  }

  // ── Members: Campaigns (quick card and campaign row) ──────────────────────
  // The latest chapter is the last in the campaign's list.
  function loadCampaign() {
    var box = document.getElementById("home-q-campaign");
    var head = '<p class="eyebrow">Latest chapter</p>';
    mainCampaign.then(function (c) {
      if (!c) { box.innerHTML = head + muted("No campaign yet"); return null; }
      return getJSON(CAMPAIGNS_API + "/campaigns/" + encodeURIComponent(c.slug)).then(function (data) {
        var chapters = data && Array.isArray(data.chapters) ? data.chapters : [];
        var latest = chapters[chapters.length - 1];
        var href = chapterHref(c.slug, latest && latest.slug);
        document.getElementById("home-q-campaign-btn").href = href;
        document.getElementById("home-campaign-continue").href = href;
        var line = latest
          ? esc(latest.title) + (latest.chapter_date ? " \u00b7 " + esc(latest.chapter_date) : "")
          : "No chapters yet";
        box.innerHTML = head +
          '<p class="home-quick-value">' + esc(c.name || "") + "</p>" +
          '<p class="home-meta"><span class="tag">Main campaign</span><span class="home-meta-note">' + line + "</span></p>";
        if (!latest) return;
        var latestEl = document.getElementById("home-campaign-latest");
        latestEl.textContent = "Latest: " + latest.title;
        latestEl.hidden = false;
        if (latest.has_tldr) {
          var tldr = document.getElementById("home-campaign-tldr");
          tldr.href = href + "&tldr=1";
          tldr.hidden = false;
        }
      });
    }).catch(function () {
      box.innerHTML = head + muted("Couldn\u2019t load the campaign.");
    });
  }

  // ── Members: Roll Calculator ─────────────────────────────────────────────
  // Active or Paused with the campaign's name; anything else is Not Active.
  function statusFromActive(d) {
    if (d && d.active) return { status: "active", campaign_name: d.campaign && d.campaign.name };
    if (d && d.reason === "paused") return { status: "paused", campaign_name: d.campaign_name };
    return { status: d && d.reason === "not_linked" ? "not_linked" : "none" };
  }

  function loadRoll() {
    var box = document.getElementById("home-q-roll");
    var head = '<p class="eyebrow">Your session</p>';
    memberGet(ROLLS_API, "/rp/me/status").catch(function (err) {
      if (err && err.status === 404) return memberGet(ROLLS_API, "/rp/me/active").then(statusFromActive);
      throw err;
    }).then(function (s) {
      var status = s && s.status;
      var name = s && s.campaign_name ? '<p class="home-meta"><span class="home-meta-note">' + esc(s.campaign_name) + "</span></p>" : "";
      if (status === "active") {
        box.innerHTML = head + '<p class="status-dot is-brown home-quick-value">Active</p>' + name;
      } else if (status === "paused") {
        box.innerHTML = head + '<p class="status-dot is-gold home-quick-value">Paused</p>' + name;
      } else {
        box.innerHTML = head + '<p class="status-dot is-quiet home-quick-value">Not Active</p>';
      }
    }).catch(function () {
      box.innerHTML = head + muted("Couldn\u2019t load your session.");
    });
  }

  // ── Members: New Aboard ──────────────────────────────────────────────────
  // Two steps: a published profile and an IC rank. Hidden once both are
  // done, and for "NA - No RP" members.
  function loadOnboarding() {
    if (storageGet(HIDE_ONBOARDING_KEY)) return;
    memberGet(MED_API, "/my-profile").then(function (data) {
      var m = data && data.member;
      if (!m) return;
      if ((m.factions || []).indexOf("NA - No RP") !== -1) return;
      var p = data.profile;
      var profile = !p ? "todo" : (p.published ? "done" : "saved");
      var rank = String(m.ic_rank || "").trim();
      if (profile === "done" && rank) return;
      renderOnboarding(profile, rank);
    }).catch(function () { /* no onboarding */ });
  }

  function doneRow(title, note, action) {
    return '<div class="home-step-done tray">' + ICON_CHECK +
      "<strong>" + title + "</strong><span>" + note + "</span>" + action + "</div>";
  }

  function renderOnboarding(profile, rank) {
    var slot = document.getElementById("home-onboarding");
    var done = (profile === "done" ? 1 : 0) + (rank ? 1 : 0);
    // One open step spans the full width.
    var wide = done === 1 ? " is-wide" : "";
    var steps = "";

    if (profile === "done") {
      steps += doneRow("Profile published", "You\u2019re on the Company Roster.",
        '<a class="btn is-plain" href="' + PROFILE_URL + '">Edit profile</a>');
    }
    if (rank) steps += doneRow("Your role: " + esc(rank), "", "");

    if (profile === "todo") {
      steps += '<div class="home-step tray' + wide + '">' +
        '<div class="home-step-top"><span class="home-step-num">1</span><span class="pill">To do</span></div>' +
        "<h3>Set up your profile</h3>" +
        '<p class="home-step-text is-grow">Add your portrait, description and skills under My Profile, then publish it to appear on the public Company Roster.</p>' +
        '<a class="btn" href="' + PROFILE_URL + '">Set Up My Profile</a>' +
      "</div>";
    } else if (profile === "saved") {
      steps += '<div class="home-step tray' + wide + '">' +
        '<div class="home-step-top"><span class="home-step-num">1</span><span class="status-dot is-brown">Saved, not published</span></div>' +
        "<h3>Publish your profile</h3>" +
        '<p class="home-step-text is-grow">Your profile is saved, but it isn\u2019t on the Company Roster yet. Tick \u201cPublish my profile\u201d when you\u2019re happy with it.</p>' +
        '<a class="btn" href="' + PROFILE_URL + '">Publish My Profile</a>' +
      "</div>";
    }

    if (!rank) {
      steps += '<div class="home-step tray' + wide + '">' +
        '<div class="home-step-top"><span class="home-step-num">2</span><span class="pill">To do</span></div>' +
        "<h3>Find your role</h3>" +
        '<p class="home-step-text">Browse the Job Board and filter by division.</p>' +
        '<dl class="home-step-rules">' +
          '<dt><span class="tag">Primary</span></dt><dd>Your main role. Hold one active application or role at a time.</dd>' +
          '<dt><span class="tag">Secondary</span></dt><dd>Side work. Apply to as many as you like.</dd>' +
        "</dl>" +
        '<a class="btn" href="job-board.html">Browse Job Board</a>' +
      "</div>";
    }

    slot.innerHTML = '<section class="home-onboard tear" aria-label="New member onboarding">' +
        '<div class="home-onboard-photo media-ph is-tone-3 tear-half">' +
          '<img src="' + IMAGES + 'onboarding-the-table.jpg" alt="Crew members gathered around a table" loading="lazy">' +
        "</div>" +
        '<div class="home-onboard-body">' +
          '<div class="home-onboard-head">' +
            '<div><p class="eyebrow">Getting started</p><h2 class="landing-row-title">New Aboard? Start Here</h2></div>' +
            '<button type="button" class="btn is-quiet is-small" id="home-onboard-hide">Hide for now</button>' +
          "</div>" +
          '<div class="home-onboard-progress">' +
            '<div class="progress-bar" role="progressbar" aria-label="Getting started" aria-valuemin="0" aria-valuemax="2" aria-valuenow="' + done + '">' +
              '<div class="progress-bar-fill" style="width: ' + (done * 50) + '%"></div>' +
            "</div>" +
            "<span>" + done + " of 2 done</span>" +
          "</div>" +
          '<div class="home-steps">' + steps + "</div>" +
          '<p class="home-onboard-foot">Questions along the way? Send any officer a tell.</p>' +
        "</div>" +
      "</section>";
    dropBrokenImages(slot);
    document.getElementById("home-onboard-hide").addEventListener("click", function () {
      storageSet(HIDE_ONBOARDING_KEY, "1");
      slot.innerHTML = "";
    });
  }

  // ── Members: boards ──────────────────────────────────────────────────────
  // The three newest open jobs.
  function loadJobs() {
    var list = document.getElementById("home-jobs");
    getJSON(MED_API + "/jobs").then(function (jobs) {
      var open = (Array.isArray(jobs) ? jobs : []).filter(function (j) {
        return j && j.status === "open";
      }).sort(function (a, b) {
        return (parseTime(b.created_at) || 0) - (parseTime(a.created_at) || 0);
      }).slice(0, 3);
      if (!open.length) { list.innerHTML = '<li class="home-board-row">' + muted("No open postings") + "</li>"; return; }
      list.innerHTML = open.map(function (j) {
        var division = DIVISION_LABEL[j.category];
        return '<li class="home-board-row">' + thumb(j.image_url, DIVISION_TONE[j.category] || 4) +
          '<div class="home-board-row-body">' +
            '<p class="home-board-row-title">' + esc(j.title || "Untitled") + "</p>" +
            '<p class="home-meta"><span class="tag">' + (j.job_type === "secondary" ? "Secondary" : "Primary") + "</span>" +
              (division ? '<span class="home-meta-note">' + esc(division) + "</span>" : "") + "</p>" +
          "</div>" +
          '<span class="status-dot is-brown home-board-side">Open</span>' +
        "</li>";
      }).join("");
      dropBrokenImages(list);
    }).catch(function () {
      list.innerHTML = '<li class="home-board-row">' + muted("Couldn\u2019t load the job board.") + "</li>";
    });
  }

  // The three soonest quests: dated ones first, then undated, newest first.
  function questSchedule(q, t) {
    if (q.schedule_mode === "tbd") return "Date TBD";
    if (q.schedule_mode === "repeatable") return t != null ? "Repeatable \u00b7 " + fmtWhen(t) : "Repeatable";
    return t != null ? fmtWhen(t) : "Scheduled";
  }

  function loadQuests() {
    var list = document.getElementById("home-quests");
    getJSON(MED_API + "/quests").then(function (quests) {
      var now = Date.now();
      var soonest = (Array.isArray(quests) ? quests : []).filter(Boolean).map(function (q) {
        var t = parseTime(q.scheduled_at);
        return { q: q, t: q.schedule_mode !== "tbd" && t != null && t >= now ? t : null, raw: t };
      }).filter(function (x) {
        return !(x.q.schedule_mode === "scheduled" && x.raw != null && x.raw < now);
      }).sort(function (a, b) {
        if (a.t != null && b.t != null) return a.t - b.t;
        if (a.t != null) return -1;
        if (b.t != null) return 1;
        return (parseTime(b.q.created_at) || 0) - (parseTime(a.q.created_at) || 0);
      }).slice(0, 3);
      if (!soonest.length) { list.innerHTML = '<li class="home-board-row">' + muted("No open quests") + "</li>"; return; }
      list.innerHTML = soonest.map(function (x) {
        var q = x.q;
        var type = String(q.mission_type || "");
        var count = (q.signups || []).length;
        return '<li class="home-board-row">' + thumb(q.image_url, MISSION_TONE[type.toLowerCase()] || 4) +
          '<div class="home-board-row-body">' +
            '<p class="home-board-row-title">' + esc(q.title || "Untitled") + "</p>" +
            '<p class="home-meta">' + (type ? '<span class="tag">' + esc(type) + "</span>" : "") +
              '<span class="home-meta-note">' + esc(questSchedule(q, x.t)) + "</span></p>" +
          "</div>" +
          '<span class="home-board-side">' + count + " signed up</span>" +
        "</li>";
      }).join("");
      dropBrokenImages(list);
    }).catch(function () {
      list.innerHTML = '<li class="home-board-row">' + muted("Couldn\u2019t load the bounty board.") + "</li>";
    });
  }

  // ── Start ────────────────────────────────────────────────────────────────
  if (!session) {
    loadRecruiting();
    return;
  }

  var name = String(session.display_name || session.username || "").trim() || "Crew member";
  var top = document.getElementById("home-member-top");
  var bottom = document.getElementById("home-member-bottom");
  top.innerHTML = welcomeHtml(name) + '<div id="home-onboarding"></div>' + boardsHtml() + campaignRowHtml();
  bottom.innerHTML = medicalHtml();
  dropBrokenImages(top);
  dropBrokenImages(bottom);

  loadCalendar();
  loadCampaign();
  loadRoll();
  loadOnboarding();
  loadJobs();
  loadQuests();
})();
