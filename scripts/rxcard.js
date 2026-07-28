/* ============================================================================
   MyRxCard — Prescription Savings Card  ·  CDN ENGINE (jsDelivr)
   ----------------------------------------------------------------------------
   Self-contained: injects its own <link> (fonts), <style>, and markup, then
   wires the flip/print/wallet behavior and wallet-save tracking. The Webflow
   page supplies ONLY the per-partner {{wf:}} values + a mount point:

     <div id="rx-card-mount"></div>
     <script>
       window.RX_CARD_CONFIG = {
         logoUrl:    "{{wf:Partner/Card Logo|Dynamo}}",
         brandColor: "{{wf:Partner/Wallet BG|Dynamo}}",
         brandName:  "{{wf:Partner/Name|Dynamo}}",
         grp:        "{{wf:Partner/groupNum|Dynamo}}",
         cardSlug:   "{{wf:Partner/Slug|Dynamo}}"
       };
     </script>
     <script src="https://cdn.jsdelivr.net/gh/trevorfallbacher-prog/MyRxCard@REF/scripts/rxcard.js"></script>

   Anything left blank in RX_CARD_CONFIG falls back to the DEFAULTS below.
   ========================================================================== */
(function(){
  "use strict";

  // ---- Config: page {{wf:}} values override these defaults ------------------
  var DEFAULTS = {
    triggerLabel: "View my prescription savings card",
    walletUrl: "https://myrxcard-wallet.vercel.app/api/pass",
    googleWalletUrl: "https://myrxcard-wallet.vercel.app/api/google",
    logoUrl: "https://cdn.prod.website-files.com/655a8e6434bc8a8976bdb2f3/67cf0bcf32a377ac4bc7652e_MyRxCard%20Logo%20Colored.svg",
    brandColor: "",
    brandName: "MyRxCard",
    cardTitle: ["Prescription", "Savings Card"],
    bin: "018877",
    pcn: "AHC001",
    grp: "TPD001",
    cardSlug: "",
    memberId: "10 digit phone #",
    memberServices: "844.636.4566",
    helpHours: "9AM – 6PM EST",
    saveHeadline: "Save Up to 75%",
    saveSub: "On FDA-Approved Prescriptions",
    readyLine: "This card is ready to use.",
    notInsurance: "This is NOT Insurance",
    cardholder: [
      "Present Card to Pharmacist every time you pick up a prescription.",
      "Use Card at participating pharmacies. It works for your family, even your pets.",
      "Have insurance? Ask your Pharmacist to run both and use whichever costs you least out of pocket.",
      "E-prescribe? Ask your MD to submit this Card's BIN/PCN/Group information along with your Rx."
    ],
    pharmacist: "This Card entitles the user to all prescription medication benefits associated with the BIN, PCN, and Group codes on front (as per state and federal law). Contact us if you need help using this Card.",
    benefits: [
      "Save up to 75% of retail cost",
      "Card is 100% free for you and your family",
      "Ready to use",
      "Works on human meds for pets",
      "For use with any medication",
      "No deductibles, no limitations"
    ],
    faqTitle: "Frequently Asked Questions",
    faq: [
      { q:"What are MyRxCard coupons?",
        a:"MyRxCard coupons enable you to pay a lower price than the retail cost for your prescription medications. These coupons are free and accepted at participating pharmacies across all states and Puerto Rico." },
      { q:"How do I use a MyRxCard coupon?",
        a:"Using a MyRxCard coupon is similar to using a grocery store coupon. Present the coupon to the pharmacist when you pick up your prescription. The pharmacist will input the coupon details into their system to apply the discount." },
      { q:"What if my pharmacy cannot process this coupon?",
        a:"MyRxCard coupons are valid at participating pharmacies in all states and Puerto Rico. If your pharmacy is part of the network but encounters issues processing the coupon, ask the pharmacist to call the number provided on the coupon for assistance." },
      { q:"Can I use this coupon if I have health insurance?",
        a:"The price offered by the MyRxCard coupon may be lower than your insurance co-pay. However, the coupon cannot reduce your co-pay amount. Consult your pharmacist to determine the best price available." }
    ],
    helpTitle: "Help",
    help: [
      { h:"Customer Help",
        p:"For assistance using this coupon, contact our friendly Avalon Assist." },
      { h:"For the pharmacist",
        p:"Thank you for helping your patients save money on their prescriptions! This coupon displays a contracted rate based on agreements between your pharmacy or purchasing group and a Pharmacy Benefit Manager (PBM). Please use the BIN, PCN and Group number to adjudicate." }
    ]
  };

  // Shallow-merge, but ignore empty-string {{wf:}} values so blanks fall back.
  var CONFIG = {};
  (function(){
    var k, o = (window.RX_CARD_CONFIG || {});
    for (k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) CONFIG[k] = DEFAULTS[k];
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) {
      var v = o[k];
      if (v === "" || v === null || v === undefined) continue;
      CONFIG[k] = v;
    }
  })();

  // ---- Fonts + styles (injected once) --------------------------------------
  var FONT_HREF = "https://use.typekit.net/rff1rai.css";

  var CSS = [
":root{",
"  --rx-primary:#0f6490; --rx-primary-d:#0a4c70; --rx-primary-l:#2f8fbf;",
"  --rx-btn:#2f8fbf; --rx-btn-d:#0f6490; --rx-btn-fg:#fff; --rx-ink:#fff;",
"  --ink:#1d2d36; --muted:#5d6f78;",
"  --card-w:560px; --card-h:356px; --face-radius:20px;",
"  --rx-head:\"sofia-pro-soft\",\"Sofia Pro Soft\",\"Avenir Next\",\"Segoe UI\",system-ui,-apple-system,sans-serif;",
"  --rx-body:\"sofia-pro-soft\",\"Sofia Pro Soft\",\"Avenir Next\",\"Segoe UI\",system-ui,-apple-system,sans-serif;",
"}",
".rx-open-btn,.rx-modal,.rx-modal *,.rx-print,.rx-print *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}",
".rx-open-btn{appearance:none;border:0;cursor:pointer;font-family:var(--rx-head);font-weight:700;font-size:16px;max-width:100%;color:var(--rx-btn-fg);background:linear-gradient(180deg,var(--rx-btn),var(--rx-btn-d));padding:15px 26px;border-radius:12px;letter-spacing:.02em;box-shadow:0 6px 16px rgba(0,0,0,.18);transition:transform .12s ease,box-shadow .12s ease;}",
".rx-open-btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(0,0,0,.22);}",
".rx-open-btn:active{transform:translateY(0);}",
".rx-modal{position:fixed;inset:0;z-index:99999;overflow:hidden;display:none;align-items:center;justify-content:center;flex-direction:column;gap:26px;padding:28px 16px;background:rgba(6,16,22,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font-family:var(--rx-body);color:var(--ink);}",
".rx-modal.is-open{display:flex;animation:rxFade .22s ease both;}",
"@keyframes rxFade{from{opacity:0;}to{opacity:1;}}",
".rx-close{position:absolute;top:18px;right:20px;width:42px;height:42px;border-radius:50%;cursor:pointer;border:1.5px solid rgba(127,168,189,.45);background:rgba(255,255,255,.06);color:#dce8f0;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .12s ease,transform .12s ease;}",
".rx-close:hover{background:rgba(255,255,255,.14);transform:scale(1.05);}",
".rx-fit{position:relative;}",
".rx-stage{perspective:1600px;perspective-origin:50% 30%;transform-origin:top left;transform:scale(var(--rx-scale,1));}",
".rx-tilt{transform-style:preserve-3d;transform:rotateX(var(--tx,0deg)) rotateY(var(--ty,0deg));transition:transform .18s ease-out;will-change:transform;}",
".rx-entrance{transform-style:preserve-3d;animation:rxCardIn 950ms cubic-bezier(.2,.72,.18,1) both;}",
"@keyframes rxCardIn{0%{transform:rotateY(-96deg) translateZ(-170px) scale(.9);opacity:0;filter:blur(7px);}60%{opacity:1;filter:blur(0);}100%{transform:rotateY(0) translateZ(0) scale(1);opacity:1;filter:blur(0);}}",
".rx-card{position:relative;width:var(--card-w);height:var(--card-h);transform-style:preserve-3d;transition:transform .82s cubic-bezier(.2,.82,.2,1);cursor:pointer;}",
".rx-card.is-flipped{transform:rotateY(180deg);}",
".rx-face{position:absolute;inset:0;-webkit-backface-visibility:hidden;backface-visibility:hidden;border-radius:var(--face-radius);overflow:hidden;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.28),0 2px 0 rgba(255,255,255,.5) inset;}",
".rx-face--back{transform:rotateY(180deg);}",
".fi-pad{position:absolute;left:30px;top:28px;right:30px;}",
".fi-logo{position:absolute;right:30px;top:26px;width:150px;height:auto;}",
".fi-logo-fallback{position:absolute;right:30px;top:30px;text-align:right;line-height:1;}",
".fi-logo-fallback b{color:var(--rx-primary);font-size:22px;letter-spacing:-.5px;}",
".fi-logo-fallback span{display:block;color:var(--rx-primary-l);font-size:13px;font-weight:600;}",
".fi-title{font-family:var(--rx-head);color:var(--rx-primary);font-weight:700;font-size:23px;line-height:1.14;letter-spacing:-.5px;max-width:344px;}",
".fi-rule{width:300px;height:3px;background:var(--rx-primary);border-radius:2px;margin:9px 0 16px;opacity:.95;}",
".fi-fields{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;}",
".frow{display:contents;}",
".flabel{color:var(--rx-primary);font-weight:700;font-size:14px;}",
".fval{font-family:var(--rx-body);font-size:14px;color:var(--ink);letter-spacing:.4px;}",
".rx-face--front .frow > *{animation:rxRowUp .55s cubic-bezier(.2,.8,.2,1) both;}",
".rx-face--front .frow:nth-child(1) > *{animation-delay:.30s;}",
".rx-face--front .frow:nth-child(2) > *{animation-delay:.38s;}",
".rx-face--front .frow:nth-child(3) > *{animation-delay:.46s;}",
".rx-face--front .frow:nth-child(4) > *{animation-delay:.54s;}",
"@keyframes rxRowUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}",
".fi-band{position:absolute;left:0;right:0;bottom:0;height:150px;}",
".fi-wave{position:absolute;inset:0;width:100%;height:100%;display:block;}",
".fi-band-rows{position:absolute;left:30px;right:28px;bottom:18px;top:56px;display:flex;justify-content:space-between;align-items:flex-end;color:var(--rx-ink);}",
".bl-ms{font-size:14px;}",
".bl-ms b{font-weight:700;}",
".bl-ni{font-weight:700;font-size:14px;margin-top:7px;}",
".br{text-align:right;}",
".br-save{font-weight:700;font-size:19px;}",
".br-fda{font-weight:700;font-size:13px;border-bottom:2px solid currentColor;padding-bottom:5px;display:inline-block;}",
".br-ready{font-size:12.5px;margin-top:7px;opacity:.95;}",
".holo{position:absolute;inset:0;pointer-events:none;mix-blend-mode:soft-light;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.50) 47%,rgba(190,235,255,.28) 50%,rgba(255,255,255,.50) 53%,transparent 62%);background-size:260% 100%;animation:rxSheen 6s ease-in-out 0.7s infinite;}",
"@keyframes rxSheen{0%{background-position:160% 0;opacity:0;}5%{opacity:.9;}16%{background-position:-60% 0;opacity:.9;}22%{opacity:0;}100%{background-position:-60% 0;opacity:0;}}",
".bk{position:absolute;inset:0;padding:24px 30px;color:var(--ink);display:flex;flex-direction:column;justify-content:center;}",
".bk-h{font-family:var(--rx-head);color:var(--rx-primary);font-weight:700;font-size:13px;letter-spacing:.2px;margin:0 0 5px;}",
".bk-ol{margin:0 0 12px;padding-left:18px;}",
".bk-ol li{font-size:9.3px;line-height:1.32;margin-bottom:3px;}",
".bk-p{font-size:9.3px;line-height:1.34;margin:0 0 10px;}",
".bk-rule{height:1.5px;background:var(--rx-primary);opacity:.85;border-radius:2px;margin:8px 0;}",
".bk-svc{display:flex;justify-content:space-between;gap:12px;color:var(--rx-primary);font-weight:700;font-size:12px;}",
".bk-bullets{list-style:none;padding:0;margin:8px 0 0;columns:2;column-gap:22px;}",
".bk-bullets li{font-size:9px;line-height:1.4;margin-bottom:3px;position:relative;padding-left:11px;break-inside:avoid;}",
".bk-bullets li::before{content:\"\";position:absolute;left:0;top:5px;width:4px;height:4px;border-radius:50%;background:var(--rx-primary);}",
".rx-hint{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7fa8bd;opacity:.8;}",
".rx-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:center;max-width:100%;}",
".rx-btn{appearance:none;border:0;cursor:pointer;font-family:var(--rx-head);font-weight:700;color:var(--rx-btn-fg);background:linear-gradient(180deg,var(--rx-btn),var(--rx-btn-d));padding:13px 22px;border-radius:12px;letter-spacing:.02em;font-size:15px;box-shadow:0 6px 16px rgba(0,0,0,.18);transition:transform .12s ease,box-shadow .12s ease;}",
".rx-btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(0,0,0,.22);}",
".rx-btn:active{transform:translateY(0);}",
".rx-btn--ghost{background:transparent;border:1.5px solid rgba(127,168,189,.5);color:#cfe2ee;box-shadow:none;}",
".rx-wallet-badge{display:inline-flex;align-items:center;text-decoration:none;line-height:0;border-radius:8px;transition:transform .12s ease;}",
".rx-wallet-badge:hover{transform:translateY(-1px);}",
".rx-wallet-badge img{height:46px;width:auto;display:block;}",
".rx-wallet-badge[hidden]{display:none;}",
".rx-print{display:none;}",
"@media print{",
"  @page{margin:0.5in;}",
"  .rx-print{display:block !important;}",
"  .rx-print-cards{display:flex;gap:0.35in;justify-content:center;align-items:flex-start;margin:0 0 4px;}",
"  .rx-print-card{position:relative;width:3.375in;height:2.125in;page-break-inside:avoid;break-inside:avoid;}",
"  .rx-print-scale{position:absolute;top:0;left:0;width:560px;height:356px;background:#fff;border:1px solid #cfd8dd;border-radius:20px;overflow:hidden;transform-origin:top left;transform:scale(0.578571,0.573034);}",
"  .rx-print-note{text-align:center;color:#8a99a1;font-size:9px;letter-spacing:.12em;text-transform:uppercase;margin:6px 0 26px;}",
"  .rx-print-faq{display:grid;grid-template-columns:1.7fr 1fr;gap:40px;color:var(--ink);}",
"  .rx-print-faq h2{font-family:var(--rx-head);font-size:20px;color:var(--rx-primary);margin:0 0 12px;font-weight:700;}",
"  .pf-q{font-family:var(--rx-head);font-weight:700;font-size:14px;margin:15px 0 3px;}",
"  .pf-a{font-size:12.5px;line-height:1.5;margin:0;}",
"  .ph-h{font-family:var(--rx-head);font-weight:700;font-size:14px;margin:15px 0 3px;color:var(--rx-primary);}",
"  .ph-p{font-size:12.5px;line-height:1.5;margin:0 0 10px;}",
"}",
"@media (prefers-reduced-motion: reduce){",
"  .rx-modal.is-open{animation:none;}",
"  .rx-entrance{animation:none;}",
"  .holo{display:none;}",
"  .rx-face--front .frow > *{animation:none;}",
"  .rx-card{transition:none;}",
"  .rx-tilt{transition:none;}",
"}"
  ].join("\n");

  var MARKUP =
    '<button class="rx-open-btn" id="rxOpenBtn" type="button">View my prescription savings card</button>' +
    '<div class="rx-modal" id="rxModal" role="dialog" aria-modal="true" aria-label="MyRxCard Prescription Savings Card" hidden>' +
      '<button class="rx-close" id="rxCloseBtn" type="button" aria-label="Close">&times;</button>' +
      '<div class="rx-fit" id="rxFit"><div class="rx-stage" id="rxStage"><div class="rx-tilt" id="rxTilt"><div class="rx-entrance" id="rxEntrance">' +
        '<div class="rx-card" id="rxCard" role="button" tabindex="0" aria-label="Savings card — activate to flip">' +
          '<div class="rx-face rx-face--front" id="rxFront"></div>' +
          '<div class="rx-face rx-face--back" id="rxBack"></div>' +
          '<div class="holo" aria-hidden="true"></div>' +
        '</div>' +
      '</div></div></div></div>' +
      '<div class="rx-hint">Tap card to flip</div>' +
      '<div class="rx-controls">' +
        '<button class="rx-btn" id="rxFlipBtn" type="button">Flip card</button>' +
        '<button class="rx-btn rx-btn--ghost" id="rxPrintBtn" type="button">Print card</button>' +
        '<a class="rx-wallet-badge" id="rxWalletBtn" hidden aria-label="Add to Apple Wallet">' +
          '<img src="https://cdn.prod.website-files.com/655a8e6434bc8a8976bdb2f3/6a277ec7d93e492e271390b0_US-UK_Add_to_Apple_Wallet_RGB_101421.svg" alt="Add to Apple Wallet">' +
        '</a>' +
        '<a class="rx-wallet-badge" id="rxGWalletBtn" hidden target="_blank" rel="noopener" aria-label="Add to Google Wallet">' +
          '<img src="https://cdn.prod.website-files.com/655a8e6434bc8a8976bdb2f3/6a277e7e42f32eab367bedfc_enUS_add_to_google_wallet_add-wallet-badge.svg" alt="Add to Google Wallet">' +
        '</a>' +
      '</div>' +
    '</div>' +
    '<div class="rx-print" id="rxPrint" aria-hidden="true">' +
      '<div class="rx-print-cards">' +
        '<div class="rx-print-card"><div class="rx-print-scale" id="rxPrintFront"></div></div>' +
        '<div class="rx-print-card"><div class="rx-print-scale" id="rxPrintBack"></div></div>' +
      '</div>' +
      '<div class="rx-print-note">Cut out and carry — front &amp; back (3.375&quot; × 2.125&quot;)</div>' +
      '<div class="rx-print-faq" id="rxPrintFaq"></div>' +
    '</div>';

  // ---- Renderers ------------------------------------------------------------
  function field(label, value){
    return '<div class="frow"><span class="flabel">'+label+'</span><span class="fval">'+value+'</span></div>';
  }

  function renderFront(sfx){
    var C = CONFIG;
    var logo =
      '<img class="fi-logo" src="'+C.logoUrl+'" alt="'+C.brandName+'"' +
      ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\';">' +
      '<div class="fi-logo-fallback" style="display:none"><b>MyRx</b><span>Card</span></div>';

    return '' +
      logo +
      '<div class="fi-pad">' +
        '<div class="fi-title">'+C.cardTitle[0]+'<br>'+C.cardTitle[1]+'</div>' +
        '<div class="fi-rule"></div>' +
        '<div class="fi-fields">' +
          field("BIN:", C.bin) +
          field("PCN:", C.pcn) +
          field("GRP:", C.grp) +
          field("Member ID:", C.memberId) +
        '</div>' +
      '</div>' +
      '<div class="fi-band">' +
        '<svg class="fi-wave" viewBox="0 0 560 150" preserveAspectRatio="none">' +
          '<defs><linearGradient id="rxBandGrad'+sfx+'" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" style="stop-color:var(--rx-primary-l)"/>' +
            '<stop offset="1" style="stop-color:var(--rx-primary-d)"/>' +
          '</linearGradient></defs>' +
          '<path d="M0,54 C150,90 360,6 560,32 L560,150 L0,150 Z" fill="url(#rxBandGrad'+sfx+')"/>' +
        '</svg>' +
        '<div class="fi-band-rows">' +
          '<div class="bl">' +
            '<div class="bl-ms"><b>Member Services:</b> '+C.memberServices+'</div>' +
            '<div class="bl-ni">'+C.notInsurance+'</div>' +
          '</div>' +
          '<div class="br">' +
            '<div class="br-save">'+C.saveHeadline+'</div>' +
            '<div class="br-fda">'+C.saveSub+'</div>' +
            '<div class="br-ready">'+C.readyLine+'</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderBack(){
    var C = CONFIG;
    var ol = C.cardholder.map(function(t){ return '<li>'+t+'</li>'; }).join('');
    var bl = C.benefits.map(function(t){ return '<li>'+t+'</li>'; }).join('');
    return '' +
      '<div class="bk">' +
        '<div class="bk-h">Cardholder Instructions</div>' +
        '<ol class="bk-ol">'+ol+'</ol>' +
        '<div class="bk-h">Pharmacist Instructions</div>' +
        '<p class="bk-p">'+C.pharmacist+'</p>' +
        '<div class="bk-rule"></div>' +
        '<div class="bk-svc"><span>Member Services: '+C.memberServices+'</span>' +
          '<span>Help Line Hours: '+C.helpHours+'</span></div>' +
        '<div class="bk-rule"></div>' +
        '<ul class="bk-bullets">'+bl+'</ul>' +
      '</div>';
  }

  function renderFaq(){
    var C = CONFIG;
    var q = C.faq.map(function(f){
      return '<div class="pf-q">'+f.q+'</div><p class="pf-a">'+f.a+'</p>';
    }).join('');
    var h = C.help.map(function(x){
      return '<div class="ph-h">'+x.h+'</div><p class="ph-p">'+x.p+'</p>';
    }).join('');
    return '<div class="pf-col"><h2>'+C.faqTitle+'</h2>'+q+'</div>' +
           '<div class="ph-col"><h2>'+C.helpTitle+'</h2>'+h+'</div>';
  }

  // ---- Wallet-save tracking → Xano search_events (event_type:'wallet_save') --
  function sessionId(){
    var id = localStorage.getItem('myrxcard_session_id');
    if(!id){
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
        var r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16);
      });
      localStorage.setItem('myrxcard_session_id', id);
    }
    return id;
  }
  function trackWalletSave(platform){
    var XANO = "https://xy2f-yrzu-6a37.n7d.xano.io/api:w59maQEh/search_events";
    var ua = navigator.userAgent || '';
    var device  = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop';
    var browser = /Edg/i.test(ua) ? 'Edge'
                : /Chrome/i.test(ua) ? 'Chrome'
                : (/Safari/i.test(ua) && !/Chrome/i.test(ua)) ? 'Safari'
                : /Firefox/i.test(ua) ? 'Firefox' : 'Other';
    var m = (location.pathname || '').match(/\/[sp]\/([^\/?#]+)/i);
    var slug = CONFIG.cardSlug || (m ? decodeURIComponent(m[1]) : '');
    var payload = JSON.stringify({
      event_type: 'wallet_save', platform: platform, session_id: sessionId(),
      source_url: location.href, source_domain: location.hostname, source_path: location.pathname,
      partner_slug: slug, device_type: device, browser: browser
    });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(XANO, new Blob([payload], { type:'application/json' }));
      else fetch(XANO, { method:'POST', headers:{'Content-Type':'application/json'}, body:payload, keepalive:true });
    } catch(e){}
  }

  // ---- Brand-color theming from CONFIG.brandColor --------------------------
  function applyBrandColor(){
    function parseHex(hex){ var mm=/^#?([0-9a-fA-F]{6})$/.exec(hex||""); if(!mm) return null;
      var n=parseInt(mm[1],16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
    function relLum(c){ function f(x){ x/=255; return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);}
      return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); }
    function contrastWhite(c){ return 1.05/(relLum(c)+0.05); }
    function clamp(x){ return Math.max(0,Math.min(255,Math.round(x))); }
    function mix(c,k){ return "rgb("+clamp(c.r*k)+","+clamp(c.g*k)+","+clamp(c.b*k)+")"; }
    function str(c){ return "rgb("+c.r+","+c.g+","+c.b+")"; }

    var fill = parseHex(CONFIG.brandColor);
    if (!fill) return;
    var onFill = relLum(fill) <= 0.5 ? "rgb(255,255,255)" : "rgb(29,45,54)";
    var accent = contrastWhite(fill) >= 3 ? str(fill) : "rgb(29,45,54)";
    var r = document.documentElement;
    r.style.setProperty("--rx-card-bg",  str(fill));
    r.style.setProperty("--rx-ink",      onFill);
    r.style.setProperty("--rx-primary",  accent);
    r.style.setProperty("--rx-primary-l", mix(fill, 0.97));
    r.style.setProperty("--rx-primary-d", mix(fill, 0.88));
    r.style.setProperty("--rx-btn",    str(fill));
    r.style.setProperty("--rx-btn-d",  mix(fill, 0.85));
    r.style.setProperty("--rx-btn-fg", onFill);
  }

  // ---- Boot: inject assets, render, wire behavior --------------------------
  function boot(){
    // fonts
    if (!document.querySelector('link[href="'+FONT_HREF+'"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = FONT_HREF;
      document.head.appendChild(link);
    }
    // styles
    if (!document.getElementById('rxStyles')) {
      var st = document.createElement('style');
      st.id = 'rxStyles'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    // markup → mount point (or appended to body if none provided)
    var mount = document.getElementById('rx-card-mount');
    if (!mount) { mount = document.createElement('div'); mount.id = 'rx-card-mount'; document.body.appendChild(mount); }
    mount.innerHTML = MARKUP;

    applyBrandColor();

    var back = renderBack();
    document.getElementById("rxFront").innerHTML      = renderFront("s");
    document.getElementById("rxBack").innerHTML       = back;
    document.getElementById("rxPrintFront").innerHTML = renderFront("p");
    document.getElementById("rxPrintBack").innerHTML  = back;
    document.getElementById("rxPrintFaq").innerHTML   = renderFaq();
    document.getElementById("rxOpenBtn").textContent  = CONFIG.triggerLabel;

    // wallet buttons — Apple on iOS, Google on Android, both on desktop
    (function(){
      var slug = CONFIG.cardSlug || "";
      var q = slug ? "?card=" + encodeURIComponent(slug) : "";
      var ua = navigator.userAgent || "";
      var isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      var isAndroid = /Android/.test(ua);
      var aBtn = document.getElementById("rxWalletBtn");
      var gBtn = document.getElementById("rxGWalletBtn");
      if (CONFIG.walletUrl && aBtn && !isAndroid) { aBtn.href = CONFIG.walletUrl + q; aBtn.hidden = false; }
      if (CONFIG.googleWalletUrl && gBtn && !isIOS) { gBtn.href = CONFIG.googleWalletUrl + q; gBtn.hidden = false; }
      if (aBtn) aBtn.addEventListener('click', function(){ trackWalletSave('apple'); });
      if (gBtn) gBtn.addEventListener('click', function(){ trackWalletSave('google'); });
    })();

    // fit the 560px card to narrow screens
    var rxFit = document.getElementById("rxFit");
    var rxStageEl = document.getElementById("rxStage");
    function rxFitCard(){
      var avail = (document.documentElement.clientWidth || window.innerWidth) - 40;
      var s = Math.min(1, avail / 560);
      rxStageEl.style.setProperty("--rx-scale", s);
      rxFit.style.width  = (560 * s) + "px";
      rxFit.style.height = (356 * s) + "px";
    }
    rxFitCard();
    window.addEventListener("resize", rxFitCard);

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fine = window.matchMedia("(pointer: fine)").matches;

    var card = document.getElementById("rxCard");
    function flip(){ card.classList.toggle("is-flipped"); }
    card.addEventListener("click", flip);
    card.addEventListener("keydown", function(e){
      if(e.key === "Enter" || e.key === " "){ e.preventDefault(); flip(); }
    });
    document.getElementById("rxFlipBtn").addEventListener("click", flip);

    var openBtn  = document.getElementById("rxOpenBtn");
    var modal    = document.getElementById("rxModal");
    var closeBtn = document.getElementById("rxCloseBtn");
    var entrance = document.getElementById("rxEntrance");
    var lastFocus = null;

    function openModal(){
      lastFocus = document.activeElement;
      modal.hidden = false;
      modal.classList.add("is-open");
      document.documentElement.style.overflow = "hidden";
      card.classList.remove("is-flipped");
      rxFitCard();
      if(!reduce){
        entrance.classList.remove("rx-entrance");
        void entrance.offsetWidth;
        entrance.classList.add("rx-entrance");
      }
      closeBtn.focus();
    }
    function closeModal(){
      modal.classList.remove("is-open");
      modal.hidden = true;
      document.documentElement.style.overflow = "";
      if(lastFocus && lastFocus.focus) lastFocus.focus();
    }

    openBtn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", function(e){ if(e.target === modal) closeModal(); });
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });

    var tilt = document.getElementById("rxTilt");
    var stage = document.getElementById("rxStage");
    if(!reduce && fine){
      stage.addEventListener("pointermove", function(e){
        var rr = stage.getBoundingClientRect();
        var px = (e.clientX - rr.left) / rr.width  - .5;
        var py = (e.clientY - rr.top)  / rr.height - .5;
        tilt.style.setProperty("--ty", ( px * 12).toFixed(2) + "deg");
        tilt.style.setProperty("--tx", (-py * 9 ).toFixed(2) + "deg");
      });
      stage.addEventListener("pointerleave", function(){
        tilt.style.setProperty("--ty","0deg");
        tilt.style.setProperty("--tx","0deg");
      });
    }

    document.getElementById("rxPrintBtn").addEventListener("click", function(){
      var printNode = document.getElementById("rxPrint").cloneNode(true);
      var styleNode = document.getElementById("rxStyles");

      var ifr = document.createElement("iframe");
      ifr.setAttribute("aria-hidden","true");
      ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      document.body.appendChild(ifr);

      var d = ifr.contentDocument || ifr.contentWindow.document;
      d.open();
      d.write('<!doctype html><html><head><meta charset="utf-8">' +
              '<link rel="stylesheet" href="'+FONT_HREF+'"></head><body></body></html>');
      d.close();

      if(styleNode) d.head.appendChild(styleNode.cloneNode(true));
      var force = d.createElement("style");
      force.textContent = "html,body{margin:0;background:#fff;color:var(--ink);font-family:var(--rx-body);} .rx-print{display:block !important;}";
      d.head.appendChild(force);
      d.body.appendChild(printNode);

      // carry the brand CSS variables into the isolated print document
      var rootStyle = document.documentElement.getAttribute("style");
      if (rootStyle) d.documentElement.setAttribute("style", rootStyle);

      var win = ifr.contentWindow;
      var printed = false;
      function doPrint(){
        if(printed) return; printed = true;
        win.focus(); win.print();
        setTimeout(function(){ ifr.remove(); }, 800);
      }
      if(d.fonts && d.fonts.ready){ d.fonts.ready.then(function(){ setTimeout(doPrint, 80); }); }
      setTimeout(doPrint, 1200);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
