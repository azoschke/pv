// ============================================================================
//  officer-avatars.js — profile pictures in the officers' initials circles
//  (index.html's Officer Core, about.html's Officer Core)
// ----------------------------------------------------------------------------
//  Each .avatar with data-avatar-name shows that member's My Profile picture
//  from the public roster (GET /roster, published profiles only), matched on
//  the name. Without one, or if it fails to load, it keeps its initials.
// ============================================================================
(function () {
  "use strict";

  var API_BASE = "https://pv-med-database-worker.chlorinatorgreen.workers.dev";
  var circles = document.querySelectorAll("[data-avatar-name]");
  if (!circles.length) return;

  function key(name) { return String(name || "").trim().toLowerCase(); }

  fetch(API_BASE + "/roster", { headers: { "Accept": "application/json" } })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (rows) {
      var pictures = {};
      (Array.isArray(rows) ? rows : []).forEach(function (r) {
        if (r && r.name && r.image_url) pictures[key(r.name)] = r.image_url;
      });
      circles.forEach(function (circle) {
        var url = pictures[key(circle.getAttribute("data-avatar-name"))];
        if (!url) return;
        // Swapped in once loaded, so a broken picture never replaces the initials.
        var img = new Image();
        img.alt = "";
        img.addEventListener("load", function () {
          circle.textContent = "";
          circle.appendChild(img);
        });
        img.src = url;
      });
    })
    .catch(function () { /* initials stay */ });
})();
