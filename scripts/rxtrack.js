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

  // ---- session row id (localStorage, sliding 30-min window) -----------------
  function recordId() {
    var id = ls('rx_record_id');
    var t  = parseInt(ls('rx_record_ts') || '0', 10);
    if (!id) return null;
    if (Date.now() - t > SESSION_WINDOW) return null; // stale -> next action starts a new row
    return id;
  }
  function setRecordId(id) { lsSet('rx_record_id', String(id)); touch(); }
  function touch()         { lsSet('rx_record_ts', String(Date.now())); }

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
  function log(fields, opts) {
    opts = opts || {};
    var id = recordId();

    if (id) {
      // PATCH the existing session row with just the delta.
      // PATCH is a non-simple method (needs CORS preflight); keepalive lets it
      // finish across an unload, and the Apple handler delays nav to be safe.
      touch();
      // The PATCH endpoint requires JSON (form-encoded returns "Unable to decode
      // input"). JSON is a non-simple request so it triggers a CORS preflight —
      // fine for search/print (page stays); for the Apple save the click handler
      // delays navigation so the preflight + PATCH have time to leave.
      try {
        fetch(BASE + '/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
          keepalive: true
        });
      } catch (e) {}
      return;
    }

    // No row yet -> create one. POST form-encoded is a CORS-simple request, so
    // it needs no preflight and survives navigation via sendBeacon.
    var payload = baseFields();
    for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) payload[k] = fields[k];
    var params = form(payload);

    if (opts.nav && navigator.sendBeacon) {
      // Terminal action (e.g. Apple save with no prior search): fire-and-forget.
      try { navigator.sendBeacon(BASE, params); } catch (e) {}
      return;
    }
    // Normal case: read the new id back so later events PATCH the same row.
    try {
      fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        keepalive: true
      }).then(function (r) { return r.json(); })
        .then(function (row) { if (row && row.id) setRecordId(row.id); })
        .catch(function () {});
    } catch (e) {}
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
        log({ wallet_saved: true, platform: platform }, { nav: !recordId() });
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
      log({ printed: true });
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
