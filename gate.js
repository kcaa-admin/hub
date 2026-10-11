/* KCAA Hub — Google sign-in gate (@kcaa.ca accounts only).
   This is the one place that initializes the shared Firebase App + Auth for
   the whole page. Other scripts on the page (the Live Tools) await
   window.kcaaFirebaseReady and call getApp() to reuse the SAME app instance,
   rather than calling initializeApp() themselves — Firestore only attaches a
   user's ID token to requests made from an app that also has Auth wired up
   on it, so sharing one app per page is what makes signed-in reads/writes
   actually work. */
(function () {
  "use strict";

  var firebaseConfig = {
    apiKey: "AIzaSyCTI8_wse6mW5O5KVP362eNQFpHQRiz_64",
    authDomain: "kcaa-hub.firebaseapp.com",
    projectId: "kcaa-hub",
    storageBucket: "kcaa-hub.firebasestorage.app",
    messagingSenderId: "36937011424",
    appId: "1:36937011424:web:825b1d1a1b23e82d514085"
  };
  var ALLOWED_DOMAIN = "kcaa.ca";
  var DOMAIN_RE = new RegExp("@" + ALLOWED_DOMAIN.replace(/\./g, "\\.") + "$", "i");

  var gate = document.getElementById("kcaa-gate");
  var authApi = null, auth = null;
  var resolveReady, rejectReady;
  window.kcaaFirebaseReady = new Promise(function (res, rej) { resolveReady = res; rejectReady = rej; });
  window.kcaaSignOut = function () { if (authApi && auth) authApi.signOut(auth); };

  function ensureGate() {
    if (document.getElementById("kcaa-gate")) { gate = document.getElementById("kcaa-gate"); return; }
    gate = document.createElement("div");
    gate.id = "kcaa-gate";
    gate.style.cssText = "position:fixed;inset:0;z-index:99999;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px;";
    document.body.appendChild(gate);
  }

  function reveal() {
    var g = document.getElementById("kcaa-gate");
    if (g) g.remove();
  }

  function paint(inner) {
    ensureGate();
    gate.innerHTML =
      '<div style="background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:28px 26px;box-shadow:var(--shadow);width:100%;max-width:320px;box-sizing:border-box;font-family:-apple-system,\'Segoe UI\',ui-sans-serif,system-ui,sans-serif;text-align:center;">' +
        '<p style="font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--blue);margin:0 0 8px;">KCAA Hub</p>' +
        '<h1 style="font-size:19px;font-weight:800;margin:0 0 16px;color:var(--ink);">Sign in required</h1>' +
        inner +
      "</div>";
  }

  function paintChecking() {
    paint('<p style="font-size:13px;color:var(--ink-soft);margin:0;">Checking sign-in&hellip;</p>');
  }

  function paintSignIn(errorMsg) {
    paint(
      '<button type="button" id="kcaa-gate-signin" style="width:100%;font:inherit;font-size:14px;font-weight:700;padding:10px 16px;border-radius:8px;border:none;background:var(--blue);color:#fff;cursor:pointer;">Sign in with Google</button>' +
      (errorMsg ? '<p style="color:var(--red);font-size:13px;margin:12px 0 0;">' + errorMsg + "</p>" : "")
    );
    var btn = document.getElementById("kcaa-gate-signin");
    if (btn) btn.addEventListener("click", doSignIn);
  }

  function paintFatalError(msg) {
    paint('<p style="color:var(--red);font-size:13px;margin:0;">' + msg + "</p>");
  }

  function isAllowed(user) {
    return !!user && !!user.email && !!user.emailVerified && DOMAIN_RE.test(user.email);
  }

  function doSignIn() {
    if (!authApi || !auth) return;
    var provider = new authApi.GoogleAuthProvider();
    provider.setCustomParameters({ hd: ALLOWED_DOMAIN });
    paintChecking();
    authApi.signInWithPopup(auth, provider).catch(function (e) {
      console.error("gate: sign-in failed", e);
      paintSignIn("Sign-in failed &mdash; try again.");
    });
  }

  paintChecking();

  Promise.all([
    import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js")
  ]).then(function (mods) {
    var appApi = mods[0];
    authApi = mods[1];
    var app = appApi.initializeApp(firebaseConfig);
    auth = authApi.getAuth(app);

    authApi.onAuthStateChanged(auth, function (user) {
      if (isAllowed(user)) {
        reveal();
        resolveReady({ app: app, auth: auth });
      } else if (user) {
        // Signed in, but not an @kcaa.ca account — kick them back out.
        authApi.signOut(auth);
        paintSignIn("Only @" + ALLOWED_DOMAIN + " accounts can access the Hub. Signed out &mdash; try a different account.");
      } else {
        paintSignIn();
      }
    });
  }).catch(function (e) {
    console.error("gate: could not load Firebase Auth", e);
    paintFatalError("Couldn&rsquo;t reach Google sign-in &mdash; check your connection and reload.");
    rejectReady(e);
  });
})();
