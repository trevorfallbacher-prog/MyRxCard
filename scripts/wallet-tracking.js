/* ============================================================================
   MyRxCard — Digital Wallet Save Tracking  ·  CDN (jsDelivr)
   ----------------------------------------------------------------------------
   Drop-in tracker for the "Add to Apple Wallet" / "Add to Google Wallet"
   badges. Add ONE tag to any page that shows the savings card:

     <script src="https://cdn.jsdelivr.net/gh/trevorfallbacher-prog/MyRxCard@REF/scripts/wallet-tracking.js"></script>

   It records each save in Xano's search_events table with
   event_type:'wallet_save' and platform:'apple'|'google', alongside the same
   session/source/partner fields used by search + card-print tracking.

   Uses click delegation (capture phase) so it works no matter when the badges
   render, and sendBeacon so the POST survives the navigation Apple/Google
   trigger. Binds by id (#rxWalletBtn / #rxGWalletBtn) or a data-wallet="apple|
   google" attribute, so it also works on custom buttons.
   ========================================================================== */
(function () {
  "use strict";

  var XANO = "https://xy2f-yrzu-6a37.n7d.xano.io/api:w59maQEh/search_events";

  function sessionId() {
    var id = localStorage.getItem('myrxcard_session_id');
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      localStorage.setItem('myrxcard_session_id', id);
    }
    return id;
  }

  function ls(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

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

  // Guard against double-firing if the same click bubbles twice.
  var lastFire = { platform: null, t: 0 };

  function track(platform) {
    var now = (window.performance && window.performance.now) ? window.performance.now() : 0;
    if (lastFire.platform === platform && now - lastFire.t < 400) return;
    lastFire = { platform: platform, t: now };

    // Send FORM-ENCODED, not JSON. An application/x-www-form-urlencoded body is
    // a CORS-"simple" request, so it fires with no preflight and survives the
    // same-tab navigation the Apple badge triggers. A JSON beacon needs a CORS
    // preflight, which the browser drops mid-navigation — so those saves never
    // landed. Xano parses form fields the same as JSON.
    var params = new URLSearchParams();
    params.set('event_type',    'wallet_save');
    params.set('platform',      platform);
    params.set('session_id',    sessionId());
    params.set('source_url',    location.href);
    params.set('source_domain', location.hostname);
    params.set('source_path',   location.pathname);
    params.set('partner_slug',  partnerSlug());
    params.set('device_type',   DEVICE);
    params.set('browser',       BROWSER);
    // Enrich with the location main.js detects on load and stores in
    // localStorage — so a wallet save carries the user's city/state/zip even
    // when no drug search was run. (ndc/gpi/drug stay empty: a save isn't a search.)
    params.set('zip',   ls('userZip'));
    params.set('city',  ls('userCity'));
    params.set('state', ls('userState'));
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(XANO, params);
      } else {
        fetch(XANO, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          keepalive: true
        });
      }
    } catch (e) {}
  }

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest
      ? e.target.closest('#rxWalletBtn, #rxGWalletBtn, [data-wallet]')
      : null;
    if (!el) return;
    var dw = (el.getAttribute('data-wallet') || '').toLowerCase();
    var platform = (el.id === 'rxGWalletBtn' || dw === 'google') ? 'google' : 'apple';
    track(platform);
  }, true);
})();
