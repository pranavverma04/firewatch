/* FireWatch satellite evidence: dated, real imagery of a hotspot from NASA GIBS (the tiles behind NASA Worldview),
   plus live VIIRS fire pixels from the Esri/NASA Living Atlas feed. Keyless, no server of our own. */
(function () {
  'use strict';
  if (!window.L) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var reduced = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/{tms}/{z}/{y}/{x}.{ext}';
  var FIRE_URL = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';

  /* Sensors. native = the finest zoom GIBS serves; the map overzooms beyond it. */
  var SENSORS = [
    { id: 'n20', name: 'VIIRS NOAA-20', res: '375 m', pass: 'daily, about 13:30 local', layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', native: 9 },
    { id: 'snpp', name: 'VIIRS Suomi NPP', res: '375 m', pass: 'daily, about 13:30 local', layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', native: 9 },
    { id: 'n21', name: 'VIIRS NOAA-21', res: '375 m', pass: 'daily, about 13:30 local', layer: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', native: 9 },
    { id: 'terra', name: 'MODIS Terra', res: '250 m', pass: 'daily, about 10:30 local', layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', native: 9 },
    { id: 'aqua', name: 'MODIS Aqua', res: '250 m', pass: 'daily, about 13:30 local', layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', native: 9 },
    { id: 'swir', name: 'VIIRS NOAA-20 fire bands', res: '375 m', pass: 'shortwave infrared, active fire glows red', layer: 'VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', native: 9, fire: true },
    { id: 'swir7', name: 'MODIS Terra fire bands', res: '250 m', pass: 'bands 7-2-1, burn scars dark red', layer: 'MODIS_Terra_CorrectedReflectance_Bands721', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', native: 9, fire: true },
    { id: 'hls', name: 'Sentinel-2 (HLS)', res: '30 m', pass: 'every 5 days, 2 to 3 days late', layer: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance', tms: 'GoogleMapsCompatible_Level12', ext: 'png', native: 12, sparse: true },
    { id: 'hlsl', name: 'Landsat 8/9 (HLS)', res: '30 m', pass: 'every 8 days, 2 to 3 days late', layer: 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance', tms: 'GoogleMapsCompatible_Level12', ext: 'png', native: 12, sparse: true },
    { id: 's2c', name: 'Sentinel-2 mosaic 2024', res: '10 m', pass: 'cloud-free yearly mosaic, undated', url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg', native: 16, undated: true }
  ];
  var byId = {}; SENSORS.forEach(function (s) { byId[s.id] = s; });

  function isoLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function iso(d) { return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  function fromIso(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function addDays(s, n) { var d = fromIso(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function pretty(s) { var d = fromIso(s); return String(d.getUTCDate()).padStart(2, '0') + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function todayUtc() { return iso(new Date()); }
  function clampDate(s) { var t = todayUtc(); return s > t ? t : s; }
  function tileUrl(sensor, date) {
    if (sensor.url) return sensor.url;
    return GIBS.replace('{layer}', sensor.layer).replace('{date}', date).replace('{tms}', sensor.tms).replace('{ext}', sensor.ext);
  }
  function tileXY(lat, lon, z) {
    var n = Math.pow(2, z), x = Math.floor((lon + 180) / 360 * n), r = lat * Math.PI / 180;
    var y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    return { x: x, y: y };
  }
  /* Does this sensor have a tile over the point on this date? A HEAD on the centre tile at the sensor's native zoom. */
  var probeCache = {};
  function probe(sensor, date, lat, lon) {
    if (sensor.undated) return Promise.resolve(true);
    var z = sensor.sparse ? 11 : Math.min(sensor.native, 8), t = tileXY(lat, lon, z);
    var u = tileUrl(sensor, date).replace('{z}', z).replace('{y}', t.y).replace('{x}', t.x);
    if (probeCache[u] !== undefined) return Promise.resolve(probeCache[u]);
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 9000);
    return fetch(u, { method: 'HEAD', signal: ctl.signal }).then(function (r) { probeCache[u] = r.ok; return r.ok; }).catch(function () { return false; }).finally(function () { clearTimeout(tm); });
  }
  /* Walk back from a date until a sensor has imagery. Returns {date} or null. */
  function findDate(sensor, from, lat, lon, maxBack) {
    var d = clampDate(from), i = 0, limit = maxBack || (sensor.sparse ? 16 : 6);
    return (function step() {
      if (i > limit) return Promise.resolve(null);
      var cur = addDays(d, -i); i++;
      return probe(sensor, cur, lat, lon).then(function (ok) { return ok ? { date: cur, back: i - 1 } : step(); });
    })();
  }
  /* Cloud hint: fraction of bright, grey pixels in the centre tile. */
  function cloudHint(sensor, date, lat, lon) {
    if (sensor.undated || sensor.fire) return Promise.resolve(null);
    var z = Math.min(sensor.native, 8), t = tileXY(lat, lon, z);
    var u = tileUrl(sensor, date).replace('{z}', z).replace('{y}', t.y).replace('{x}', t.x);
    return new Promise(function (res) {
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = 64; c.height = 64; var g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 64);
          var px = g.getImageData(0, 0, 64, 64).data, bright = 0, dark = 0, n = 64 * 64;
          for (var i = 0; i < px.length; i += 4) { var r = px[i], gg = px[i + 1], b = px[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); if (mx > 190 && mx - mn < 40) bright++; if (mx < 18) dark++; }
          res({ cloud: bright / n, dark: dark / n });
        } catch (e) { res(null); }
      };
      img.onerror = function () { res(null); };
      img.src = u;
    });
  }
  function makeLayer(sensor, date, pane) {
    var opt = { maxNativeZoom: sensor.native, maxZoom: 16, minZoom: 1, errorTileUrl: BLANK, crossOrigin: true, attribution: sensor.undated ? 'Sentinel-2 cloudless by EOX, © Copernicus data' : 'Imagery NASA GIBS / Worldview, ' + sensor.name + ' ' + pretty(date), className: 'ev-tiles' };
    if (pane) opt.pane = pane;
    var l = L.tileLayer(tileUrl(sensor, date), opt);
    l.evStat = { total: 0, err: 0 };
    l.on('loading', function () { l.evStat = { total: 0, err: 0 }; });
    l.on('tileloadstart', function () { l.evStat.total++; });
    l.on('tileerror', function () { l.evStat.err++; });
    return l;
  }
  function labelsLayer(pane) { var o = { maxZoom: 18, opacity: 0.9 }; if (pane) o.pane = pane; return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', o); }
  function firePixels(lat, lon, km) {
    var dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    var env = (lon - dLon).toFixed(4) + ',' + (lat - dLat).toFixed(4) + ',' + (lon + dLon).toFixed(4) + ',' + (lat + dLat).toFixed(4);
    var u = FIRE_URL + '?where=1%3D1&geometry=' + env + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=latitude,longitude,confidence,frp,acq_date,acq_time,satellite,daynight,hours_old&returnGeometry=false&resultRecordCount=2000&f=json';
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 14000);
    return fetch(u, { signal: ctl.signal }).then(function (r) { return r.json(); }).then(function (j) { return (j.features || []).map(function (f) { return f.attributes; }).filter(function (a) { return a && a.latitude != null; }); }).finally(function () { clearTimeout(tm); });
  }

  /* ------------------------------------------------------------------ */
  /* The viewer                                                          */
  /* ------------------------------------------------------------------ */
  var V = null;
  function build() {
    var root = document.createElement('div'); root.className = 'ev'; root.hidden = true;
    root.innerHTML =
      '<div class="ev-backdrop"></div>' +
      '<div class="ev-dialog" role="dialog" aria-modal="true" aria-labelledby="ev-title">' +
        '<header class="ev-head">' +
          '<div class="ev-titles"><span class="eyebrow">Satellite evidence</span><h3 id="ev-title">Hotspot</h3><p class="ev-sub mono"></p></div>' +
          '<div class="ev-headr"><span class="ev-status mono" role="status" aria-live="polite">Looking for imagery</span><button type="button" class="ev-close" aria-label="Close the evidence viewer"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>' +
        '</header>' +
        '<div class="ev-body">' +
          '<div class="ev-mapwrap">' +
            '<div class="ev-map" id="ev-map" aria-label="Satellite imagery around the hotspot"></div>' +
            '<div class="ev-split" hidden><div class="ev-handle" role="slider" tabindex="0" aria-label="Compare slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><i></i></div><span class="ev-tag l"></span><span class="ev-tag r"></span></div>' +
            '<div class="ev-cloud mono" hidden></div>' +
          '</div>' +
          '<aside class="ev-rail">' +
            '<section class="ev-sec ev-dates"><span class="eyebrow">Date</span>' +
              '<div class="ev-daterow"><button type="button" class="ev-nav" data-d="-1" aria-label="Previous day">‹</button><input type="date" class="ev-date" aria-label="Imagery date"><button type="button" class="ev-nav" data-d="1" aria-label="Next day">›</button><button type="button" class="ev-jump btn btn-ghost btn-sm" title="Jump back to the detection date">Detection day</button></div>' +
              '<label class="ev-check"><input type="checkbox" class="ev-cmp"> Compare with an earlier day</label>' +
              '<div class="ev-daterow ev-before" hidden><span class="mono ev-lbl">Before</span><button type="button" class="ev-nav" data-b="-1" aria-label="Earlier">‹</button><input type="date" class="ev-date2" aria-label="Comparison date"><button type="button" class="ev-nav" data-b="1" aria-label="Later">›</button></div>' +
              '<p class="ev-note mono"></p>' +
            '</section>' +
            '<section class="ev-sec"><span class="eyebrow">Sensor</span><div class="ev-sensors" role="radiogroup" aria-label="Sensor"></div></section>' +
            '<section class="ev-sec"><span class="eyebrow">Overlays</span>' +
              '<label class="ev-check"><input type="checkbox" class="ev-ov" data-ov="fires" checked> Live VIIRS fire pixels, last 7 days</label>' +
              '<label class="ev-check"><input type="checkbox" class="ev-ov" data-ov="rings" checked> Hotspot, 1 km and 3 km rings</label>' +
              '<label class="ev-check"><input type="checkbox" class="ev-ov" data-ov="labels" checked> Place names</label>' +
              '<p class="ev-fires mono"></p>' +
            '</section>' +
            '<section class="ev-sec ev-rec"><span class="eyebrow">Record</span><dl class="ev-dl"></dl></section>' +
            '<section class="ev-sec ev-ext"><span class="eyebrow">Open elsewhere</span><div class="ev-links"></div></section>' +
          '</aside>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    var map = L.map($('#ev-map', root), { zoomControl: true, minZoom: 3, maxZoom: 16, scrollWheelZoom: true, attributionControl: true });
    map.createPane('evA'); map.getPane('evA').style.zIndex = 200;
    map.createPane('evB'); map.getPane('evB').style.zIndex = 210;
    map.createPane('evLabels'); map.getPane('evLabels').style.zIndex = 300; map.getPane('evLabels').style.pointerEvents = 'none';
    V = { root: root, map: map, rec: null, sensor: byId.n20, date: null, before: null, cmp: false, layerA: null, layerB: null, labels: labelsLayer('evLabels'), rings: L.layerGroup(), fires: L.layerGroup(), fireRows: null, split: 0.5, ov: { fires: true, rings: true, labels: true }, lastFocus: null };
    V.labels.addTo(map); V.rings.addTo(map); V.fires.addTo(map);

    /* Sensor radios */
    var sens = $('.ev-sensors', root);
    sens.innerHTML = SENSORS.map(function (s) { return '<button type="button" class="ev-sensor" role="radio" aria-checked="false" data-id="' + s.id + '"><b>' + esc(s.name) + '</b><span>' + esc(s.res) + ' · ' + esc(s.pass) + '</span><i class="ev-avail"></i></button>'; }).join('');
    sens.addEventListener('click', function (e) { var b = e.target.closest('.ev-sensor'); if (!b) return; setSensor(byId[b.getAttribute('data-id')], true); });
    /* Dates */
    var dateIn = $('.ev-date', root), date2In = $('.ev-date2', root);
    dateIn.addEventListener('change', function () { if (dateIn.value) setDate(clampDate(dateIn.value)); });
    date2In.addEventListener('change', function () { if (date2In.value) setBefore(clampDate(date2In.value)); });
    $$('.ev-nav', root).forEach(function (b) { b.addEventListener('click', function () { if (b.hasAttribute('data-d')) setDate(clampDate(addDays(V.date, +b.getAttribute('data-d')))); else setBefore(clampDate(addDays(V.before, +b.getAttribute('data-b')))); }); });
    $('.ev-jump', root).addEventListener('click', function () { setDate(V.rec.date0, true); });
    $('.ev-cmp', root).addEventListener('change', function (e) { setCompare(e.target.checked); });
    $$('.ev-ov', root).forEach(function (c) { c.addEventListener('change', function () { V.ov[c.getAttribute('data-ov')] = c.checked; applyOverlays(); }); });
    /* Split handle */
    var splitEl = $('.ev-split', root), handle = $('.ev-handle', root), dragging = false;
    function setSplit(px) { var w = map.getSize().x; V.split = Math.min(0.96, Math.max(0.04, px / w)); handle.style.left = (V.split * 100) + '%'; handle.setAttribute('aria-valuenow', Math.round(V.split * 100)); clip(); }
    handle.addEventListener('pointerdown', function (e) { dragging = true; try { handle.setPointerCapture(e.pointerId); } catch (err) { } map.dragging.disable(); e.preventDefault(); });
    handle.addEventListener('pointermove', function (e) { if (!dragging) return; var r = map.getContainer().getBoundingClientRect(); setSplit(e.clientX - r.left); });
    handle.addEventListener('pointerup', function () { dragging = false; map.dragging.enable(); });
    handle.addEventListener('keydown', function (e) { var w = map.getSize().x; if (e.key === 'ArrowLeft') setSplit(V.split * w - 20); if (e.key === 'ArrowRight') setSplit(V.split * w + 20); });
    map.on('move zoom resize', clip);
    /* Close */
    $('.ev-close', root).addEventListener('click', close); $('.ev-backdrop', root).addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !root.hidden) close(); });
  }
  function clip() {
    if (!V || !V.cmp || !V.layerB) { if (V && V.map.getPane('evB')) V.map.getPane('evB').style.clip = ''; return; }
    var map = V.map, nw = map.containerPointToLayerPoint([0, 0]), se = map.containerPointToLayerPoint(map.getSize());
    var x = nw.x + V.split * map.getSize().x;
    map.getPane('evB').style.clip = 'rect(' + nw.y + 'px, ' + se.x + 'px, ' + se.y + 'px, ' + x + 'px)';
  }
  function status(msg, kind) { var s = $('.ev-status', V.root); s.textContent = msg; s.className = 'ev-status mono' + (kind ? ' ' + kind : ''); }
  function note(msg) { $('.ev-note', V.root).textContent = msg; }

  function setSensor(s, user) {
    V.sensor = s; V.autoBack = false;
    $$('.ev-sensor', V.root).forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-id') === s.id ? 'true' : 'false'); });
    $('.ev-dates', V.root).classList.toggle('is-undated', !!s.undated);
    if (user) { findDate(s, V.date, V.rec.lat, V.rec.lon).then(function (r) { if (V.sensor !== s) return; if (r && r.date !== V.date) { note(s.name + ' has no pass on ' + pretty(V.date) + ' here. Showing ' + pretty(r.date) + ', the nearest earlier day with imagery.'); setDate(r.date); } else if (!r) { note('No ' + s.name + ' imagery found within ' + (s.sparse ? 16 : 6) + ' days before ' + pretty(V.date) + '. Try another sensor.'); refresh(); } else { note(''); refresh(); } }); }
    else refresh();
  }
  function setDate(d, silent) { V.date = d; $('.ev-date', V.root).value = d; if (!silent) { note(''); V.autoBack = false; } refresh(); }
  function setBefore(d) { V.before = d; $('.ev-date2', V.root).value = d; refresh(); }
  function setCompare(on) {
    V.cmp = on; $('.ev-cmp', V.root).checked = on; $('.ev-before', V.root).hidden = !on; $('.ev-split', V.root).hidden = !on;
    if (on && !V.before) { var s = V.sensor; findDate(s, addDays(V.date, -1), V.rec.lat, V.rec.lon).then(function (r) { setBefore(r ? r.date : addDays(V.date, -1)); }); } else refresh();
  }
  function refresh() {
    var map = V.map, s = V.sensor;
    if (V.layerA) { map.removeLayer(V.layerA); V.layerA = null; }
    if (V.layerB) { map.removeLayer(V.layerB); V.layerB = null; }
    if (V.cmp && !s.undated) {
      V.layerA = makeLayer(s, V.before || addDays(V.date, -1), 'evA').addTo(map);
      V.layerB = makeLayer(s, V.date, 'evB').addTo(map);
      $('.ev-tag.l', V.root).textContent = 'Before · ' + pretty(V.before || addDays(V.date, -1));
      $('.ev-tag.r', V.root).textContent = 'Detection day · ' + pretty(V.date);
      $('.ev-split', V.root).hidden = false;
    } else {
      V.layerA = makeLayer(s, V.date, 'evA').addTo(map);
      $('.ev-split', V.root).hidden = true;
    }
    map.getPane('evB').style.clip = '';
    var lead = V.layerB || V.layerA;
    status('Loading ' + s.name + (s.undated ? '' : ', ' + pretty(V.date)), 'busy');
    lead.once('load', function () {
      var st = lead.evStat;
      if (st.total && st.err >= st.total) {
        status('No ' + s.name + ' tiles here for ' + pretty(V.date) + '. The satellite did not pass, or the day is not processed yet.', 'bad'); $('.ev-cloud', V.root).hidden = true;
        if (!V.autoBack) { V.autoBack = true; findDate(s, addDays(V.date, -1), V.rec.lat, V.rec.lon).then(function (r) { if (V.sensor !== s) return; if (r) { note('Nearest earlier ' + s.name + ' pass with tiles here: ' + pretty(r.date) + '. Showing it.'); setDate(r.date, true); } else note('No ' + s.name + ' tiles within ' + (s.sparse ? 16 : 6) + ' days before ' + pretty(V.date) + ' at this spot.'); }); }
      }
      else if (st.err > 0) status(s.name + (s.undated ? '' : ', ' + pretty(V.date)) + ' · partial coverage at this zoom', 'warn');
      else status(s.name + (s.undated ? ', cloud-free mosaic' : ', ' + pretty(V.date)) + ' · imagery loaded', 'ok');
      clip();
    });
    cloudHint(s, V.date, V.rec.lat, V.rec.lon).then(function (h) {
      var el = $('.ev-cloud', V.root); if (!h) { el.hidden = true; return; }
      if (h.dark > 0.9) { el.textContent = 'Centre tile is dark: no daylight pass captured here on this date.'; el.hidden = false; }
      else if (h.cloud > 0.55) { el.textContent = 'Heavy cloud over the centre tile, about ' + Math.round(h.cloud * 100) + '%. Try the day before or after, or the fire bands.'; el.hidden = false; }
      else if (h.cloud > 0.2) { el.textContent = 'Some cloud over the centre tile, about ' + Math.round(h.cloud * 100) + '%.'; el.hidden = false; }
      else { el.textContent = 'Centre tile mostly clear.'; el.hidden = false; }
    });
    updateLinks(); paintFires();
  }
  function applyOverlays() {
    var map = V.map;
    if (V.ov.labels) { if (!map.hasLayer(V.labels)) V.labels.addTo(map); } else if (map.hasLayer(V.labels)) map.removeLayer(V.labels);
    if (V.ov.rings) { if (!map.hasLayer(V.rings)) V.rings.addTo(map); } else if (map.hasLayer(V.rings)) map.removeLayer(V.rings);
    if (V.ov.fires) { if (!map.hasLayer(V.fires)) V.fires.addTo(map); } else if (map.hasLayer(V.fires)) map.removeLayer(V.fires);
  }
  function paintFires() {
    V.fires.clearLayers(); var rows = V.fireRows, el = $('.ev-fires', V.root);
    if (!rows) { el.textContent = 'Fetching live VIIRS fire pixels around the hotspot.'; return; }
    if (!rows.length) { el.textContent = 'No VIIRS fire pixels within 60 km in the last 7 days.'; return; }
    var day = 0;
    rows.forEach(function (a) {
      var d = a.acq_date ? iso(new Date(a.acq_date)) : null, same = d === V.date; if (same) day++;
      var m = L.circleMarker([a.latitude, a.longitude], { radius: same ? 6 : 4, color: same ? '#FFF1D6' : 'rgba(255,241,214,.5)', weight: 1, fillColor: same ? '#FF4D2E' : '#E2733B', fillOpacity: same ? 0.95 : 0.55, pane: 'markerPane' });
      m.bindTooltip('VIIRS ' + (a.satellite || '') + ' · ' + (d ? pretty(d) : '') + (a.acq_time != null ? ' ' + String(a.acq_time).padStart(4, '0') + ' UTC' : '') + ' · FRP ' + (a.frp != null ? a.frp : '?') + ' MW · conf ' + (a.confidence || '?'), { className: 'fw-tip', direction: 'top' });
      V.fires.addLayer(m);
    });
    el.textContent = rows.length + ' live fire pixels within 60 km in the last 7 days, ' + day + ' on ' + pretty(V.date) + '. Red = selected day.';
  }
  function updateLinks() {
    var r = V.rec, s = V.sensor, d = V.date, box = [(r.lon - 0.6).toFixed(3), (r.lat - 0.4).toFixed(3), (r.lon + 0.6).toFixed(3), (r.lat + 0.4).toFixed(3)].join(',');
    var wvLayers = ['Reference_Labels_15m', 'VIIRS_NOAA20_Thermal_Anomalies_375m_Day', 'VIIRS_NOAA20_Thermal_Anomalies_375m_Night', s.layer || 'VIIRS_NOAA20_CorrectedReflectance_TrueColor'].join(',');
    var links = [
      { l: 'Navigate to this incident', h: 'respond.html?' + (/^FW-\d{4}$/.test(r.id) ? 'id=' + r.id : 'lat=' + r.lat.toFixed(5) + '&lon=' + r.lon.toFixed(5)), same: true },
      { l: 'Thermal DNA of this spot', h: 'thermal-dna.html?' + (/^FW-\d{4}$/.test(r.id) ? 'id=' + r.id : 'lat=' + r.lat.toFixed(4) + '&lon=' + r.lon.toFixed(4)), same: true },
      { l: 'NASA Worldview, this view', h: 'https://worldview.earthdata.nasa.gov/?v=' + box + '&t=' + d + '&l=' + wvLayers },
      { l: 'NASA FIRMS fire map', h: 'https://firms.modaps.eosdis.nasa.gov/map/#d:' + d + '..' + d + ';@' + r.lon.toFixed(3) + ',' + r.lat.toFixed(3) + ',10z' },
      { l: 'Copernicus Browser, Sentinel-2', h: 'https://browser.dataspace.copernicus.eu/?zoom=12&lat=' + r.lat.toFixed(4) + '&lng=' + r.lon.toFixed(4) + '&themeId=DEFAULT-THEME&toTime=' + d + 'T23%3A59%3A59.999Z' },
      { l: 'Google Maps satellite', h: 'https://www.google.com/maps/@' + r.lat.toFixed(5) + ',' + r.lon.toFixed(5) + ',3000m/data=!3m1!1e3' }
    ];
    $('.ev-links', V.root).innerHTML = ((r.risk === 'Critical' || r.risk === 'High') && /^FW-\d{4}$/.test(r.id) ? '<button type="button" class="sos-inline" data-sos="' + r.id + '">Emergency SOS for this incident</button>' : '') + links.map(function (x) { return '<a href="' + x.h + '"' + (x.same ? '' : ' target="_blank" rel="noopener"') + '>' + esc(x.l) + '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h7M6 3l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></a>'; }).join('');
  }

  function open(rec) {
    if (!V) build();
    V.lastFocus = document.activeElement;
    rec = rec || {}; var lat = +rec.lat, lon = +rec.lon; if (isNaN(lat) || isNaN(lon)) return;
    var d0 = rec.date ? (rec.date instanceof Date ? isoLocal(rec.date) : iso(new Date(rec.date))) : addDays(todayUtc(), -1);
    if (d0 > todayUtc() || d0 === 'NaN-NaN-NaN') d0 = addDays(todayUtc(), -1);
    V.rec = { id: rec.id || 'Hotspot', place: rec.place || rec.region || '', lat: lat, lon: lon, date0: d0, type: rec.type || '', risk: rec.risk || '', conf: rec.conf, dist: rec.dist, days: rec.days, source: rec.source || '' };
    V.date = d0; V.before = null; V.cmp = false; V.fireRows = null; $('.ev-cmp', V.root).checked = false; $('.ev-before', V.root).hidden = true;
    $('#ev-title', V.root).textContent = (V.rec.id ? V.rec.id + ' · ' : '') + (V.rec.place || lat.toFixed(4) + ', ' + lon.toFixed(4));
    $('.ev-sub', V.root).textContent = lat.toFixed(4) + ', ' + lon.toFixed(4) + ' · detected ' + pretty(d0) + (V.rec.source ? ' · ' + V.rec.source : '');
    var dl = [['Type', V.rec.type], ['Risk', V.rec.risk], ['Confidence', V.rec.conf != null ? V.rec.conf + '%' : ''], ['Nearest industrial site', V.rec.dist != null ? (+V.rec.dist).toFixed(1) + ' km' : ''], ['Days seen', V.rec.days != null ? V.rec.days : '']].filter(function (p) { return p[1] !== '' && p[1] != null; });
    $('.ev-dl', V.root).innerHTML = dl.map(function (p) { return '<div><dt>' + p[0] + '</dt><dd>' + esc(p[1]) + '</dd></div>'; }).join('') || '<div><dt>Position</dt><dd>' + lat.toFixed(4) + ', ' + lon.toFixed(4) + '</dd></div>';
    $('.ev-date', V.root).value = d0; $('.ev-date', V.root).max = todayUtc(); $('.ev-date2', V.root).max = todayUtc();
    /* Rings */
    V.rings.clearLayers();
    V.rings.addLayer(L.circle([lat, lon], { radius: 3000, color: '#F08A3C', weight: 1.2, dashArray: '4 4', fill: false, interactive: false }));
    V.rings.addLayer(L.circle([lat, lon], { radius: 1000, color: '#F08A3C', weight: 1, fill: false, interactive: false }));
    V.rings.addLayer(L.marker([lat, lon], { icon: L.divIcon({ className: 'ev-pin', iconSize: [26, 26], html: '<i></i>' }), interactive: false, keyboard: false }));
    V.root.hidden = false; document.body.classList.add('ev-open');
    setTimeout(function () { V.map.invalidateSize(); V.map.setView([lat, lon], 10, { animate: false }); }, 30);
    $$('.ev-avail', V.root).forEach(function (i) { i.className = 'ev-avail'; });
    /* Pick the first sensor that actually has a pass on the detection day, in order of preference */
    status('Looking for imagery on ' + pretty(d0), 'busy');
    var order = ['n20', 'snpp', 'n21', 'terra', 'aqua'];
    (function pick(i) {
      if (i >= order.length) {
        return findDate(byId.n20, d0, lat, lon).then(function (r) {
          if (r) { note('No sensor has imagery for ' + pretty(d0) + ' here yet. Showing the nearest earlier day, ' + pretty(r.date) + '.'); V.date = r.date; $('.ev-date', V.root).value = r.date; }
          else note('No daily imagery found within 6 days of ' + pretty(d0) + '. Try the Sentinel-2 mosaic or an earlier date.');
          setSensor(byId.n20);
        });
      }
      var s = byId[order[i]];
      return probe(s, d0, lat, lon).then(function (ok) { markAvail(s.id, ok); if (ok) { note(''); setSensor(s); probeRest(d0, lat, lon); } else return pick(i + 1); });
    })(0);
    firePixels(lat, lon, 60).then(function (rows) { V.fireRows = rows; paintFires(); }).catch(function () { V.fireRows = []; $('.ev-fires', V.root).textContent = 'The live fire-pixel feed did not answer. Imagery still works.'; });
    setTimeout(function () { $('.ev-close', V.root).focus(); }, 80);
  }
  function markAvail(id, ok) { var b = $('.ev-sensor[data-id="' + id + '"] .ev-avail', V.root); if (b) b.className = 'ev-avail ' + (ok ? 'yes' : 'no'); }
  function probeRest(d, lat, lon) { SENSORS.forEach(function (s) { if (s.undated) { markAvail(s.id, true); return; } probe(s, d, lat, lon).then(function (ok) { markAvail(s.id, ok); }); }); }
  function close() {
    if (!V || V.root.hidden) return;
    V.root.hidden = true; document.body.classList.remove('ev-open');
    if (V.lastFocus && V.lastFocus.focus) V.lastFocus.focus();
  }

  /* ------------------------------------------------------------------ */
  /* In-map "Evidence" base: dated VIIRS imagery on the dashboard and compare maps */
  /* ------------------------------------------------------------------ */
  function attachMode(opts) {
    /* opts: { maps: [L.Map], toggle: element with .bm buttons, host: element to append the date bar to, onEnter(fn), onLeave(fn) } */
    var maps = opts.maps, toggle = opts.toggle; if (!maps.length || !toggle) return null;
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'bm'; btn.setAttribute('data-basemap', 'evidence'); btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 10.5l3.5-3 3 2.5 2.5-2 4 3.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="11" cy="6" r="1.3" fill="currentColor"/></svg>Evidence';
    toggle.appendChild(btn);
    var bar = document.createElement('div'); bar.className = 'evbar'; bar.hidden = true;
    bar.innerHTML = '<span class="mono evbar-l">Dated imagery</span><select class="evbar-sensor" aria-label="Sensor">' + SENSORS.filter(function (s) { return !s.sparse; }).map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + ' · ' + esc(s.res) + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="ev-nav" data-d="-1" aria-label="Previous day">‹</button><input type="date" class="evbar-date" aria-label="Imagery date"><button type="button" class="ev-nav" data-d="1" aria-label="Next day">›</button>' +
      '<span class="mono evbar-status" role="status" aria-live="polite"></span><span class="mono evbar-hint">Click a hotspot to jump to its detection day. Open its popup for the full evidence viewer.</span>';
    if (opts.before && opts.before.parentNode) opts.before.parentNode.insertBefore(bar, opts.before); else (opts.host || toggle.parentNode).appendChild(bar);
    var state = { on: false, sensor: byId.n20, date: addDays(todayUtc(), -1), layers: [] };
    var sel = $('.evbar-sensor', bar), dateIn = $('.evbar-date', bar), stat = $('.evbar-status', bar);
    dateIn.max = todayUtc(); dateIn.value = state.date;
    function paint() {
      state.layers.forEach(function (l) { l.remove(); }); state.layers = [];
      maps.forEach(function (m) {
        if (!m.getPane('evBase')) { m.createPane('evBase'); m.getPane('evBase').style.zIndex = 205; }
        var l = makeLayer(state.sensor, state.date, 'evBase').addTo(m); state.layers.push(l);
        l.once('load', function () { var s = l.evStat; if (s.total && s.err >= s.total) stat.textContent = 'No ' + state.sensor.name + ' imagery for ' + pretty(state.date) + ' in view.'; else stat.textContent = state.sensor.name + ' · ' + pretty(state.date); stat.className = 'mono evbar-status ' + (s.total && s.err >= s.total ? 'bad' : 'ok'); });
        m.getContainer().classList.add('is-evidence');
      });
      stat.textContent = 'Loading ' + state.sensor.name + ', ' + pretty(state.date); stat.className = 'mono evbar-status';
      dateIn.value = state.date;
    }
    function enter() { state.on = true; bar.hidden = false; btn.setAttribute('aria-pressed', 'true'); if (opts.onEnter) opts.onEnter(); paint(); }
    function leave() { if (!state.on) return; state.on = false; bar.hidden = true; btn.setAttribute('aria-pressed', 'false'); state.layers.forEach(function (l) { l.remove(); }); state.layers = []; maps.forEach(function (m) { m.getContainer().classList.remove('is-evidence'); }); if (opts.onLeave) opts.onLeave(); }
    btn.addEventListener('click', function () { if (state.on) return; enter(); });
    sel.addEventListener('change', function () { state.sensor = byId[sel.value]; if (state.on) paint(); });
    dateIn.addEventListener('change', function () { if (dateIn.value) { state.date = clampDate(dateIn.value); if (state.on) paint(); } });
    $$('.ev-nav', bar).forEach(function (b) { b.addEventListener('click', function () { state.date = clampDate(addDays(state.date, +b.getAttribute('data-d'))); if (state.on) paint(); }); });
    return { enter: enter, leave: leave, isOn: function () { return state.on; }, setDate: function (d) { if (!d) return; state.date = clampDate(typeof d === 'string' ? d : iso(d)); if (state.on) paint(); }, button: btn };
  }

  /* Buttons inside popups call this via a delegated click */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-evidence]'); if (!b) return;
    e.preventDefault();
    var raw = b.getAttribute('data-evidence'); var rec;
    try { rec = JSON.parse(raw); } catch (err) { rec = null; }
    if (!rec && window.FW_API && window.FW_API.rows) { rec = window.FW_API.rows.filter(function (r) { return r.id === raw; })[0]; }
    if (rec) open(rec);
  });

  window.FW_EVIDENCE = { open: open, close: close, attachMode: attachMode, SENSORS: SENSORS, probe: probe, findDate: findDate, iso: iso };
})();
