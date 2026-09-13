/* KCAA Hub — simple client-side password gate.
   Not a real auth system: there's no server, so this only keeps casual
   visitors out (no plaintext password in the source, just a salted
   SHA-256 hash). A determined, technical person could still brute-force
   the hash offline. Good enough for a small internal board tool; not a
   substitute for real authentication. */
(function () {
  "use strict";

  var SALT = "kcaa-hub-2026-salt";
  var HASH = "523f6ecd35c3bd4f72e1fde8a1372a364e1c18f746f2d7eff7c4180167019410";
  var STORAGE_KEY = "kcaa_hub_authed_v1";

  function reveal() {
    var gate = document.getElementById("kcaa-gate");
    if (gate) gate.remove();
  }

  if (window.localStorage && localStorage.getItem(STORAGE_KEY) === "1") {
    reveal();
    return;
  }

  function sha256Hex(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); })
        .join("");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("kcaa-gate-form");
    var input = document.getElementById("kcaa-gate-pw");
    var err = document.getElementById("kcaa-gate-err");
    if (!form || !input) return;

    input.focus();

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var val = input.value;
      sha256Hex(SALT + val).then(function (hex) {
        if (hex === HASH) {
          try { localStorage.setItem(STORAGE_KEY, "1"); } catch (e) {}
          reveal();
        } else {
          if (err) err.style.display = "block";
          input.value = "";
          input.focus();
        }
      });
    });
  });
})();
