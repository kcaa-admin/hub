/* KCAA Hub — persistent navigation bar.
   One shared script, included on every gated page right after gate.js, so
   there's a single source of truth for the link list instead of duplicating
   nav markup everywhere. Sits underneath the gate overlay until gate.js
   reveals the page (no visible flash), then uses window.kcaaFirebaseReady /
   window.kcaaSignOut (both exposed by gate.js) for the signed-in indicator
   and sign-out control — no separate auth code here. */
(function () {
  "use strict";

  var PRIMARY = [
    { href: "meeting-minutes.html", label: "Meeting Minutes" },
    { href: "outreach-tracker.html", label: "Outreach Tracker" },
    { href: "coffee-pickup-schedule.html", label: "Coffee Pickup" },
    { href: "attendance-tracker.html", label: "Attendance Tracker" }
  ];
  var MORE = [
    { group: "Social Media", items: [
      { href: "social-media-posts.html", label: "Social Media Posts" }
    ] },
    { group: "Reference Material", items: [
      { href: "brand-guide.html", label: "Brand Guide" },
      { href: "volunteer-program.html", label: "Volunteer Program Plan" },
      { href: "recruitment-intro.html", label: "Recruitment Intro Material" }
    ] }
  ];

  var currentFile = location.pathname.split("/").pop() || "index.html";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function linkHtml(item, extraClass) {
    var active = item.href === currentFile;
    return '<a href="' + esc(item.href) + '" class="kcaa-nav-link' + (extraClass ? " " + extraClass : "") + (active ? " active" : "") + '"' +
      (active ? ' aria-current="page"' : "") + ">" + esc(item.label) + "</a>";
  }

  function morePanelHtml() {
    return MORE.map(function (section) {
      return '<div class="kcaa-nav-group"><div class="kcaa-nav-group-label">' + esc(section.group) + "</div>" +
        section.items.map(function (item) { return linkHtml(item, "kcaa-nav-panel-link"); }).join("") +
        "</div>";
    }).join("");
  }

  function injectStyles() {
    if (document.getElementById("kcaa-nav-style")) return;
    var style = document.createElement("style");
    style.id = "kcaa-nav-style";
    style.textContent =
      "#kcaa-nav{position:sticky;top:0;z-index:8000;background:var(--surface);border-bottom:1px solid var(--line);font-family:-apple-system,'Segoe UI',ui-sans-serif,system-ui,sans-serif;}" +
      "#kcaa-nav .kcaa-nav-row{max-width:1100px;margin:0 auto;display:flex;align-items:center;gap:6px;padding:10px 16px;}" +
      "#kcaa-nav .kcaa-nav-home{font-size:14px;font-weight:800;color:var(--ink);text-decoration:none;margin-right:10px;white-space:nowrap;}" +
      "#kcaa-nav .kcaa-nav-link{font-size:13px;font-weight:700;color:var(--ink-soft);text-decoration:none;padding:7px 10px;border-radius:7px;white-space:nowrap;}" +
      "#kcaa-nav .kcaa-nav-link:hover,#kcaa-nav .kcaa-nav-link:focus-visible{background:var(--bg);color:var(--ink);}" +
      "#kcaa-nav .kcaa-nav-link.active{background:var(--blue-soft);color:var(--blue);}" +
      "#kcaa-nav .kcaa-nav-primary{display:flex;gap:2px;flex:1 1 auto;}" +
      "#kcaa-nav .kcaa-nav-right{display:flex;align-items:center;gap:8px;position:relative;}" +
      "#kcaa-nav .kcaa-nav-email{font-size:12px;color:var(--ink-faint);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      "#kcaa-nav .kcaa-nav-btn{font:inherit;font-size:12.5px;font-weight:700;padding:7px 12px;border-radius:7px;border:1px solid var(--line);background:var(--bg);color:var(--ink-soft);cursor:pointer;}" +
      "#kcaa-nav .kcaa-nav-btn:hover{color:var(--blue);border-color:var(--blue);}" +
      "#kcaa-nav .kcaa-nav-panel{position:absolute;top:calc(100% + 6px);right:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:10px;min-width:220px;display:none;}" +
      "#kcaa-nav .kcaa-nav-panel.open{display:block;}" +
      "#kcaa-nav .kcaa-nav-group+.kcaa-nav-group{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);}" +
      "#kcaa-nav .kcaa-nav-group-label{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-faint);padding:4px 10px 4px;}" +
      "#kcaa-nav .kcaa-nav-panel-link{display:block;}" +
      "#kcaa-nav .kcaa-nav-menu-btn{display:none;}" +
      "@media (max-width: 760px){" +
        "#kcaa-nav .kcaa-nav-primary{display:none;}" +
        "#kcaa-nav .kcaa-nav-more-btn{display:none;}" +
        "#kcaa-nav .kcaa-nav-menu-btn{display:inline-block;}" +
      "}" +
      "@media print{#kcaa-nav{display:none;}}";
    document.head.appendChild(style);
  }

  function build() {
    injectStyles();
    var nav = document.createElement("div");
    nav.id = "kcaa-nav";
    nav.innerHTML =
      '<div class="kcaa-nav-row">' +
        '<a class="kcaa-nav-home" href="index.html"' + (currentFile === "index.html" ? ' aria-current="page"' : "") + '>KCAA Hub</a>' +
        '<div class="kcaa-nav-primary">' + PRIMARY.map(function (i) { return linkHtml(i); }).join("") + "</div>" +
        '<button type="button" class="kcaa-nav-btn kcaa-nav-more-btn" id="kcaa-nav-more-btn">More</button>' +
        '<button type="button" class="kcaa-nav-btn kcaa-nav-menu-btn" id="kcaa-nav-menu-btn">Menu</button>' +
        '<div class="kcaa-nav-right">' +
          '<span class="kcaa-nav-email" id="kcaa-nav-email"></span>' +
          '<button type="button" class="kcaa-nav-btn" id="kcaa-nav-signout">Sign out</button>' +
          '<div class="kcaa-nav-panel" id="kcaa-nav-panel"></div>' +
        "</div>" +
      "</div>";

    var gate = document.getElementById("kcaa-gate");
    if (gate && gate.parentNode) gate.parentNode.insertBefore(nav, gate);
    else document.body.insertBefore(nav, document.body.firstChild);

    var panel = document.getElementById("kcaa-nav-panel");
    var moreBtn = document.getElementById("kcaa-nav-more-btn");
    var menuBtn = document.getElementById("kcaa-nav-menu-btn");

    function panelContent(includePrimary) {
      var html = "";
      if (includePrimary) {
        html += '<div class="kcaa-nav-group"><div class="kcaa-nav-group-label">Live Tools</div>' +
          PRIMARY.map(function (i) { return linkHtml(i, "kcaa-nav-panel-link"); }).join("") + "</div>";
      }
      html += morePanelHtml();
      return html;
    }

    function togglePanel(includePrimary) {
      panel.innerHTML = panelContent(includePrimary);
      panel.classList.toggle("open");
    }

    moreBtn.addEventListener("click", function (ev) { ev.stopPropagation(); togglePanel(false); });
    menuBtn.addEventListener("click", function (ev) { ev.stopPropagation(); togglePanel(true); });
    document.addEventListener("click", function (ev) {
      if (panel.classList.contains("open") && !panel.contains(ev.target) && ev.target !== moreBtn && ev.target !== menuBtn) {
        panel.classList.remove("open");
      }
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") panel.classList.remove("open");
    });

    document.getElementById("kcaa-nav-signout").addEventListener("click", function () {
      if (window.kcaaSignOut) window.kcaaSignOut();
    });

    if (window.kcaaFirebaseReady) {
      window.kcaaFirebaseReady.then(function (shared) {
        var email = shared.auth.currentUser && shared.auth.currentUser.email;
        if (email) document.getElementById("kcaa-nav-email").textContent = email;
      }).catch(function () { /* gate.js already shows its own fatal error */ });
    }
  }

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
