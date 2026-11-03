/* FireWatch constellation views: the freshness cards on the dashboard and the Satellites page.
   Needs constellation.js (window.FW_SAT). */
(function () {
  'use strict';
  if (!window.FW_SAT) return;
  var S = window.FW_SAT;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var HOUR = 3600000;

  /* Freshness cards, used on the dashboard and the Satellites page */
  function cards() {
    var grid = $('#sx-grid'); if (!grid) return;
    grid.innerHTML = S.SOURCES.map(function (s) {
      return '<div class="sx-card" id="sxc-' + s.id + '" style="--c:' + s.color + '"><span class="k">' + esc(s.inst) + ' · ' + (s.kind === 'geo' ? 'geostationary' : 'polar') + '</span><h5>' + esc(s.name) + '</h5><div class="age"><span class="dot"></span><span class="a">reading</span></div><div class="m">' + esc(s.res) + ' · ' + esc(s.every) + '<br>' + esc(s.op) + '</div></div>';
    }).join('');
    S.freshness().then(function (f) {
      S.SOURCES.forEach(function (s) {
        var el = $('#sxc-' + s.id); if (!el) return; var o = f.src[s.id];
        if (!o) { el.querySelector('.a').textContent = 'no answer'; return; }
        el.classList.add(o.age < 3 * HOUR ? 'ok' : 'slow');
        el.querySelector('.a').textContent = S.ago(o.age) + ' ago';
        el.title = 'Newest data: ' + S.stamp(o.t) + (o.n ? ' · ' + o.n.toLocaleString('en-IN') + ' detections in the feed' : '');
      });
      var b = $('#sx-best'), v = $('#sx-viirs'), g = $('#sx-gain'), bi = $('#sx-best-id');
      if (b && f.bestAge != null) b.textContent = S.ago(f.bestAge);
      if (bi && f.bestId) bi.textContent = '(' + S.BY[f.bestId].name + ')';
      if (v && f.viirsAge != null && isFinite(f.viirsAge)) v.textContent = S.ago(f.viirsAge);
      if (g && f.bestAge != null && isFinite(f.viirsAge)) g.textContent = S.ago(Math.max(0, f.viirsAge - f.bestAge));
      board(f);
    });
  }

  /* Satellites page: latency board */
  function board(f) {
    var el = $('#sx-board'); if (!el) return;
    var list = S.SOURCES.map(function (s) { return { s: s, o: f.src[s.id] }; }).sort(function (a, b) { return (a.o ? a.o.age : 9e15) - (b.o ? b.o.age : 9e15); });
    var mx = Math.max.apply(null, list.map(function (x) { return x.o ? Math.min(x.o.age, 12 * HOUR) : 0; })) || 1;
    el.innerHTML = list.map(function (x) {
      var w = x.o ? Math.max(2, Math.min(x.o.age, 12 * HOUR) / mx * 100) : 0;
      return '<div class="sx-bar" style="--c:' + x.s.color + '"><div class="nm">' + esc(x.s.inst + ' · ' + x.s.name) + '<small>' + esc(x.s.every + ' · ' + x.s.res) + '</small></div><div class="tr"><i data-w="' + w.toFixed(1) + '"></i></div><div class="v">' + (x.o ? S.ago(x.o.age) : 'no answer') + '</div></div>';
    }).join('');
    requestAnimationFrame(function () { el.querySelectorAll('.tr i').forEach(function (i) { i.style.width = i.getAttribute('data-w') + '%'; }); });
  }

  /* Satellites page: real passes over India in the last 24 hours, per satellite, and the longest blind gap */
  function passes() {
    var host = $('#sx-pass'); if (!host) return;
    var b = [68, 6, 97.5, 36], now = Date.now(), span = 24 * HOUR;
    host.innerHTML = '<p class="small">Reading pass times from the live feeds.</p>';
    Promise.all([
      S.viirsIn(b, 2000, 25).catch(function () { return { list: [] }; }),
      S.modisIn(b, 2000, 25).catch(function () { return { list: [] }; }),
      S.eumTimes()
    ]).then(function (r) {
      var times = {};
      r[0].list.concat(r[1].list).forEach(function (a) { if (now - a.t <= span) (times[a.src] = times[a.src] || {})[a.t] = 1; });
      var e = r[2], lanes = [];
      S.SOURCES.forEach(function (s) {
        var t = [];
        if (s.kind === 'geo') {
          if (!e[s.layer] || !S.geoCovers(s, 22, 80)) { lanes.push({ s: s, t: [], note: 'disk does not reach India' }); return; }
          for (var k = 0; k * s.step * 60000 < span; k++) t.push(e[s.layer] - k * s.step * 60000);
        } else if (s.id === 's3') {
          ['copernicus:sentinel3a_slstr_level2_frp', 'copernicus:sentinel3b_slstr_level2_frp'].forEach(function (ly) { if (e[ly]) for (var k = 0; k < 15; k++) t.push(e[ly] - k * 100 * 60000); });
          lanes.push({ s: s, t: t, note: 'orbit times, global' }); return;
        } else t = Object.keys(times[s.id] || {}).map(Number);
        lanes.push({ s: s, t: t.sort() });
      });
      function gap(list) {
        var t = list.filter(function (x) { return now - x <= span; }).sort(function (a, b) { return a - b; });
        if (!t.length) return span; var g = 0; /* gaps between looks, and since the newest; the feed cap can hide the oldest hours */
        for (var i = 1; i < t.length; i++) g = Math.max(g, t[i] - t[i - 1]);
        return Math.max(g, now - t[t.length - 1]);
      }
      var viirsT = [], allT = [];
      lanes.forEach(function (l) { if (l.s.inst === 'VIIRS') viirsT = viirsT.concat(l.t); if (l.s.id !== 's3') allT = allT.concat(l.t); });
      var gv = gap(viirsT), ga = gap(allT);
      var gEl = $('#sx-gap-v'), aEl = $('#sx-gap-a'); if (gEl) gEl.textContent = S.ago(gv); if (aEl) aEl.textContent = S.ago(ga);
      host.innerHTML = '<div class="sx-lanes sx-pass"><div class="sx-lanes-h mono"><span>24 hours ago</span><span>now</span></div>' + lanes.map(function (l) {
        var dots = l.s.kind === 'geo' && l.t.length ? '<b style="left:' + (100 - (now - Math.min.apply(null, l.t)) / span * 100).toFixed(2) + '%;right:' + ((now - Math.max.apply(null, l.t)) / span * 100).toFixed(2) + '%;--c:' + l.s.color + '"></b>'
          : l.t.filter(function (t) { return now - t <= span; }).map(function (t) { return '<i style="left:' + (100 - (now - t) / span * 100).toFixed(2) + '%;--c:' + l.s.color + '" title="' + esc(l.s.name + ', ' + S.stamp(t)) + '"></i>'; }).join('');
        return '<div class="sx-lane"><span class="mono">' + esc(l.s.inst + ' ' + l.s.name.split(' (')[0]) + (l.note ? ' *' : '') + '</span><div class="sx-track">' + dots + '</div></div>';
      }).join('') + '</div><p class="small" style="margin-top:8px">Polar ticks are real pass times with a fire detection over India in the last 24 hours, read from the feed. The geostationary bars are continuous: an image every 10 to 15 minutes. * Sentinel-3 shows its global orbit times; MTG-I1 sits at 0° and does not reach India.</p>';
    });
  }

  /* Satellites page: verify any point */
  function verify() {
    var mapEl = $('#sx-map'), out = $('#sx-out'); if (!mapEl || !out || !window.L) return;
    var map = L.map(mapEl, { worldCopyJump: true, minZoom: 2, maxZoom: 16, scrollWheelZoom: false }).setView([23, 79], 4);
    var esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/{svc}/MapServer/tile/{z}/{y}/{x}';
    L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Base'), { maxZoom: 16, attribution: '© Esri, © OpenStreetMap contributors · EUMETSAT, Copernicus, NASA FIRMS' }).addTo(map);
    L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Reference'), { maxZoom: 16 }).addTo(map);
    var geo = L.layerGroup([S.wms('msg_iodc:fire'), S.wms('mtg_fd:frp')]).addTo(map);
    var viirs = S.polarLayer(map, 'viirs').addTo(map);
    var modis = S.polarLayer(map, 'modis');
    L.control.layers(null, { 'VIIRS, 3 satellites': viirs, 'MODIS, Terra and Aqua': modis, 'Geostationary fire, newest frame': geo, 'Sentinel-3 SLSTR, newest orbit': L.layerGroup([S.wms('copernicus:sentinel3a_slstr_level2_frp'), S.wms('copernicus:sentinel3b_slstr_level2_frp')]) }, { collapsed: false, position: 'topright' }).addTo(map);
    var pin = null;
    function run(lat, lon, id, place) {
      if (pin) map.removeLayer(pin);
      pin = L.marker([lat, lon], { icon: L.divIcon({ className: 'ev-pin', html: '<i></i>', iconSize: [22, 22] }) }).addTo(map);
      out.innerHTML = '<div class="panel-head"><div><span class="eyebrow">Result</span><h3>' + esc(id ? id + ' · ' : '') + esc(place || (lat.toFixed(4) + ', ' + lon.toFixed(4))) + '</h3></div></div>' + S.loading();
      var rec = {}; if (id && window.FW_API && FW_API.rows) FW_API.rows.forEach(function (x) { if (x.id === id) rec = x; });
      S.check(lat, lon, { conf: rec.conf, dist: rec.dist, days: rec.days }).then(function (r) {
        out.innerHTML = '<div class="panel-head"><div><span class="eyebrow">Result</span><h3>' + esc(id ? id + ' · ' : '') + esc(place || (lat.toFixed(4) + ', ' + lon.toFixed(4))) + '</h3></div></div><div style="margin-top:14px">' + S.render(r, { demo: S.isDemo(id) }) + '</div>';
      }).catch(function (e) { out.innerHTML = '<p class="small">The check could not finish (' + esc(e && e.message) + ').</p>'; });
      try { history.replaceState(null, '', '?lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5) + (id ? '&id=' + encodeURIComponent(id) : '')); } catch (e) { }
    }
    map.on('click', function (e) { var ll = e.latlng.wrap(); run(ll.lat, ll.lng); });
    var f = $('#sx-form'); if (f) f.addEventListener('submit', function (e) {
      e.preventDefault(); var v = $('#sx-ll').value.split(/[ ,]+/).map(Number);
      if (v.length >= 2 && isFinite(v[0]) && isFinite(v[1]) && Math.abs(v[0]) <= 90 && Math.abs(v[1]) <= 180) { map.setView([v[0], v[1]], 8); run(v[0], v[1]); }
      else if (window.FW_API) FW_API.toast('Type a latitude and a longitude, for example 24.52, 71.30');
    });
    var ex = $('#sx-examples'); if (ex && window.FW_API && FW_API.rows) {
      ex.innerHTML = FW_API.rows.filter(function (x) { return x.risk === 'Critical'; }).slice(0, 6).map(function (x) { return '<button type="button" class="nav-btn" data-ex="' + x.id + '">' + x.id + ' · ' + esc(x.region.split(',')[0]) + '</button>'; }).join('');
      ex.addEventListener('click', function (e) { var b = e.target.closest('[data-ex]'); if (!b) return; FW_API.rows.forEach(function (x) { if (x.id === b.getAttribute('data-ex')) { map.setView([x.lat, x.lon], 8); run(x.lat, x.lon, x.id, x.region); } }); });
    }
    var q = new URLSearchParams(location.search), lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon')), id = q.get('id');
    if (isFinite(lat) && isFinite(lon)) { map.setView([lat, lon], 8); var place; if (id && window.FW_API && FW_API.rows) FW_API.rows.forEach(function (x) { if (x.id === id) place = x.region; }); run(lat, lon, id, place); }
    setTimeout(function () { map.invalidateSize(); }, 500);
  }

  function boot() { cards(); passes(); verify(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
