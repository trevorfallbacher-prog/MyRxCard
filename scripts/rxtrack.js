/* ============================================================================
   MyRxCard — Unified Session Tracking  ·  CDN (jsDelivr)
   ----------------------------------------------------------------------------
   ONE row per session in Xano search_events. The first tracked action of a
   session creates the row; everything after PATCHes that same row. So a
   session that searches, prints, and saves the card is a SINGLE row with
   drug/pharmacy fields + printed=true + wallet_saved=true. A session that only
   downloads the card is one row with blank search fields + wallet_saved=true.

   Load on every page (before main.js if the page also runs the search engine):
     <script src="https://cdn.jsdelivr.net/gh/trevorfallbacher-prog/MyRxCard@REF/scripts/rxtrack.js"></script>

   API:
     window.rxTrack.log(fields)     -> create-or-PATCH the session row with fields
     window.rxTrack.sessionId()     -> the persistent session id
     window.rxTrack.recordId()      -> current session row id (or null)

   Built-in (no wiring needed): Apple/Google wallet badges (#rxWalletBtn /
   #rxGWalletBtn) and print buttons (#print / #rxPrintBtn) are tracked via
   click-delegation. The search engine (main.js / the home block) calls
   window.rxTrack.log(...) with the drug/pharmacy fields.
   ========================================================================== */
(function () {
  "use strict";

  var BASE = "https://xy2f-yrzu-6a37.n7d.xano.io/api:w59maQEh/search_events";
  var SESSION_WINDOW = 30 * 60 * 1000; // 30 min sliding window = one "session"

  // ---- identity + environment ----------------------------------------------
  function sessionId() {
    var id = ls('myrxcard_session_id');
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      lsSet('myrxcard_session_id', id);
    }
    return id;
  }
  function ls(k)      { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k,v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var ua = navigator.userAgent || '';
  var DEVICE  = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop';
  var BROWSER = /Edg/i.test(ua) ? 'Edge'
              : /Chrome/i.test(ua) ? 'Chrome'
              : (/Safari/i.test(ua) && !/Chrome/i.test(ua)) ? 'Safari'
              : /Firefox/i.test(ua) ? 'Firefox' : 'Other';

  function partnerSlug() {
    var m = (location.pathname || '').match(/\/[sp]\/([^\/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // ---- current search row id: IN MEMORY, per page load ----------------------
  // Deliberately NOT persisted. Every fresh (static) page load starts with no
  // current row, so a print/save can only attach to a search made on THIS load,
  // never one carried over from a previous page view.
  var _recordId = null;
  function recordId()      { return _recordId; }
  function setRecordId(id) { _recordId = id ? String(id) : null; if (!id) { _pending = null; _platforms = []; } }
  function touch()         { /* no-op: id is page-load scoped, nothing to refresh */ }

  // While a create (POST) is in flight, _pending resolves to the new row id.
  // A print/save fired right after a search waits on this so it patches the
  // search row instead of racing ahead and creating its own row.
  var _pending = null;

  // Card actions taken on the CURRENT row, accumulated so `platform` reads e.g.
  // "physical, apple, google" when the user does more than one. Reset per row.
  var _platforms = [];

  // Base fields written when the row is first created.
  function baseFields() {
    return {
      session_id:    sessionId(),
      source_url:    location.href,
      source_domain: location.hostname,
      source_path:   location.pathname,
      device_type:   DEVICE,
      browser:       BROWSER,
      partner_slug:  partnerSlug(),
      city:  ls('userCity'),
      state: ls('userState'),
      zip:   ls('userZip')
    };
  }

  function form(obj) {
    var p = new URLSearchParams();
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) p.set(k, obj[k]);
    return p;
  }

  // ---- the core: create-or-PATCH the session row ----------------------------
  // opts.nav = true  -> caller is about to navigate away (Apple badge); use a
  //                     transport that survives unload.
  // opts.newRow = true  -> always create a fresh row (used by every drug search;
  //                        we want each search tracked separately).
  // default (no newRow)  -> PATCH the CURRENT search row (used by print / card
  //                        save). Only if there's no current row at all (card
  //                        saved with no prior search) do we create one.
  // PATCH the current row (JSON — the PATCH endpoint 500s on form-encoded).
  function patchRow(id, fields) {
    try {
      fetch(BASE + '/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
        keepalive: true
      });
    } catch (e) {}
  }

  // Create a new row. Returns a Promise<id|null> (or null when fired via the
  // unload-surviving sendBeacon path, where we can't read the id back).
  function createRow(fields, opts) {
    var payload = baseFields();
    for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) payload[k] = fields[k];
    var params = form(payload);
    // Always fetch + keepalive, never sendBeacon: keepalive survives navigation
    // just as well, AND returns the new row id. The old beacon path was
    // fire-and-forget, so when the page survived the Apple click (desktop = a
    // pass DOWNLOAD, no navigation) the id was lost and the next card action
    // created a second row instead of patching this one.
    // POST form-encoded (CORS-simple, no preflight); read the id back.
    try {
      return fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        keepalive: true
      }).then(function (r) { return r.json(); })
        .then(function (row) { var id = (row && row.id) ? String(row.id) : null; if (id) _recordId = id; return id; })
        .catch(function () { return null; });
    } catch (e) { return null; }
  }

  function log(fields, opts) {
    opts = opts || {};
    fields = fields || {};

    // Accumulate card-action platforms on the current row: a physical print +
    // an Apple save + a Google save become platform "physical, apple, google"
    // instead of overwriting each other. (Reset when a new search starts a row.)
    if (fields.platform) {
      var pl = String(fields.platform).toLowerCase().trim();
      if (pl && _platforms.indexOf(pl) === -1) _platforms.push(pl);
      var merged = {};
      for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) merged[k] = fields[k];
      merged.platform = _platforms.join(', ');
      fields = merged;
    }

    // Every drug search starts a NEW row and becomes the current row.
    if (opts.newRow) {
      _recordId  = null;                   // the new search supersedes the prior row
      _platforms = [];                     // fresh card-action list for the new row
      _pending   = createRow(fields, opts);
      return;
    }
    // Print / card save -> attach to the CURRENT search row if we have its id.
    if (_recordId) { patchRow(_recordId, fields); return; }
    // The search may still be creating its row (the 2ms race) — wait for its id,
    // then patch it instead of racing ahead and making a separate row.
    if (_pending) {
      _pending.then(function (id) { if (id) patchRow(id, fields); else { _pending = createRow(fields, opts); } });
      return;
    }
    // No search on this page load -> this action gets its own row.
    _pending = createRow(fields, opts);
  }

  // ---- built-in wallet + print handling via delegation ----------------------
  var lastFire = { key: null, t: 0 };
  function debounced(key) {
    var now = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
    if (lastFire.key === key && now - lastFire.t < 500) return true;
    lastFire = { key: key, t: now };
    return false;
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;

    // Wallet badges
    var badge = t.closest('#rxWalletBtn, #rxGWalletBtn, [data-wallet]');
    if (badge) {
      var dw = (badge.getAttribute('data-wallet') || '').toLowerCase();
      var platform = (badge.id === 'rxGWalletBtn' || dw === 'google') ? 'google' : 'apple';
      if (debounced('wallet:' + platform)) return;

      // Apple badge navigates same-tab -> intercept, log, then navigate so the
      // request (and any PATCH preflight) has time to leave. Google opens a new
      // tab, so the page stays and a normal log() is fine.
      var isSameTabNav = badge.tagName === 'A' && badge.href &&
                         badge.getAttribute('target') !== '_blank';
      if (isSameTabNav) {
        e.preventDefault();
        var href = badge.href;
        log({ wallet_saved: true, platform: platform });
        setTimeout(function () { window.location.href = href; }, 350);
      } else {
        log({ wallet_saved: true, platform: platform });
      }
      return;
    }

    // Savings-card print (#rxPrintBtn). The pharmacy-result print (#print) is
    // handled by main.js with richer fields, so it's deliberately NOT caught
    // here — that would double-log.
    var printBtn = t.closest('#rxPrintBtn, [data-rxprint]');
    if (printBtn) {
      if (debounced('print')) return;
      log({ printed: true, platform: 'physical' });
      return;
    }
  }, true);

  // ---- public API -----------------------------------------------------------
  window.rxTrack = {
    log: log,
    sessionId: sessionId,
    recordId: recordId,
    setRecordId: setRecordId
  };
})();
