/*!
 * Commodity Hub embeddable price widget — free, no key required.
 * Usage: <div data-commodity-hub-widget="wti-crude-oil"></div>
 *        <script src="https://commodity-hub.eu/embed/widget.js" defer></script>
 * Docs: https://commodity-hub.eu/embed
 *
 * Pulls the same public price feed the main site's commodity pages use
 * client-side (public anon key — safe to read, not a secret).
 */
(function () {
  var SUPABASE_URL = 'https://kcxhsmlqqyarhlmcapmj.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjeGhzbWxxcXlhcmhsbWNhcG1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3ODM0MDcsImV4cCI6MjA2MTM1OTQwN30.qC25iAjNhbPVotryl7GONMgYkvg0DzEYp8uxioWzkfs';

  var SYMBOLS = {
    'wti-crude-oil': { symbol: 'CL=F', label: 'WTI Crude' },
    'brent-crude-oil': { symbol: 'BZ=F', label: 'Brent Crude' },
    'natural-gas': { symbol: 'NG=F', label: 'Natural Gas' },
    'gold': { symbol: 'GC=F', label: 'Gold' },
    'silver': { symbol: 'SI=F', label: 'Silver' },
    'copper': { symbol: 'HG=F', label: 'Copper' },
    'corn': { symbol: 'ZC=F', label: 'Corn' },
    'wheat': { symbol: 'ZW=F', label: 'Wheat' },
  };

  function fmt(p) {
    if (typeof p !== 'number' || !isFinite(p)) return '—';
    return p >= 100 ? p.toFixed(2) : p.toFixed(p >= 10 ? 2 : 3);
  }

  function css() {
    return (
      '.chub-widget{font-family:ui-monospace,"IBM Plex Mono",monospace;' +
      'border:1px solid #2a2a2e;border-radius:8px;padding:10px 14px;' +
      'background:#111113;color:#ede9df;display:inline-flex;align-items:baseline;' +
      'gap:8px;font-size:14px;text-decoration:none;line-height:1.4}' +
      '.chub-widget:hover{border-color:#d9a44a}' +
      '.chub-widget .chub-label{color:#9b988e;font-size:12px}' +
      '.chub-widget .chub-price{font-weight:600}' +
      '.chub-widget .chub-change.up{color:#4d8b6c}' +
      '.chub-widget .chub-change.down{color:#c05a4a}' +
      '.chub-widget .chub-credit{color:#706d66;font-size:10px;margin-left:6px}'
    );
  }

  function injectStyle() {
    if (document.getElementById('chub-widget-style')) return;
    var style = document.createElement('style');
    style.id = 'chub-widget-style';
    style.textContent = css();
    document.head.appendChild(style);
  }

  function render(el, data) {
    var commodity = el.getAttribute('data-commodity-hub-widget');
    var meta = SYMBOLS[commodity];
    if (!meta) {
      el.textContent = 'Unknown commodity: ' + commodity;
      return;
    }
    var c = (data.commodities || []).filter(function (x) { return x && x.symbol === meta.symbol; })[0];
    var a = document.createElement('a');
    a.className = 'chub-widget';
    a.href = 'https://commodity-hub.eu/commodities/' + commodity;
    a.target = '_blank';
    a.rel = 'noopener';

    if (!c) {
      a.innerHTML = '<span class="chub-label">' + meta.label + '</span><span class="chub-price">—</span>';
    } else {
      var pct = typeof c.changePercent === 'number' ? c.changePercent : 0;
      var dir = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
      var arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '—';
      var pctText = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
      a.innerHTML =
        '<span class="chub-label">' + meta.label + '</span>' +
        '<span class="chub-price">$' + fmt(c.price) + '</span>' +
        '<span class="chub-change ' + dir + '">' + arrow + ' ' + pctText + '</span>' +
        '<span class="chub-credit">via Commodity Hub</span>';
    }
    el.innerHTML = '';
    el.appendChild(a);
  }

  function init() {
    var els = document.querySelectorAll('[data-commodity-hub-widget]');
    if (!els.length) return;
    injectStyle();
    els.forEach(function (el) { el.textContent = 'Loading…'; });

    fetch(SUPABASE_URL + '/functions/v1/fetch-all-commodities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ dataDelay: 'realtime' }),
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) { els.forEach(function (el) { render(el, data); }); })
      .catch(function () {
        els.forEach(function (el) { el.textContent = 'Price unavailable — see commodity-hub.eu'; });
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
