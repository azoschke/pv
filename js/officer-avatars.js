// officer-avatars.js — officers' profile pictures in their initials circles,
// from the public roster; the initials stay when there's no picture.
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
