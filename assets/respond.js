/* FireWatch Respond: road route from the responder to the incident, distance remaining and an arrival estimate
   adjusted for the hour's traffic profile and current weather, with live GPS follow, off-route re-routing,
   a drive simulation for checking, and a handoff to phone navigation apps that carry live traffic. */
(function () {
  'use strict';
  var root = document.getElementById('respond'); if (!root || !window.L) return;
  var API = window.FW_API || {}, ROWS = API.rows || [], COLORS = API.colors || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var reduced = API.reduced || function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var toast = API.toast || function () { };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function hav(a, b, c, d) { var R = 6371, p = Math.PI / 180, dLat = (c - a) * p, dLon = (d - b) * p; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
  function get(url, ms) { var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 15000); return fetch(url, { signal: ctl.signal }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(function () { clearTimeout(t); }); }

  /* ------------------------------------------------------------------ */
  /* Routing                                                             */
  /* ------------------------------------------------------------------ */
  function osrm(a, b) {
    return get('https://router.project-osrm.org/route/v1/driving/' + a.lon.toFixed(6) + ',' + a.lat.toFixed(6) + ';' + b.lon.toFixed(6) + ',' + b.lat.toFixed(6) + '?overview=full&geometries=geojson&steps=true&alternatives=false', 16000).then(function (j) {
      if (j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error('no route');
      var r = j.routes[0], steps = [];
      r.legs[0].steps.forEach(function (s) { steps.push({ text: instruction(s), dist: s.distance, dur: s.duration, name: s.name || '', type: s.maneuver.type, mod: s.maneuver.modifier || '', loc: [s.maneuver.location[1], s.maneuver.location[0]] }); });
      return { engine: 'OSRM', coords: r.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }), distance: r.distance, duration: r.duration, steps: steps };
    });
  }
  function valhalla(a, b) {
    var q = { locations: [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }], costing: 'auto', units: 'kilometers' };
    return get('https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify(q)), 18000).then(function (j) {
      var t = j.trip, leg = t.legs[0], coords = decodePolyline(leg.shape, 6), steps = [];
      leg.maneuvers.forEach(function (m) { var c = coords[Math.min(m.begin_shape_index, coords.length - 1)]; steps.push({ text: m.instruction, dist: m.length * 1000, dur: m.time, name: (m.street_names || []).join(', '), type: 'valhalla', mod: '', loc: c }); });
      return { engine: 'Valhalla', coords: coords, distance: t.summary.length * 1000, duration: t.summary.time, steps: steps };
    });
  }
  function decodePolyline(str, prec) {
    var index = 0, lat = 0, lng = 0, coords = [], shift, result, byte, f = Math.pow(10, prec || 5);
    while (index < str.length) {
      shift = 0; result = 0; do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20); lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0; do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20); lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      coords.push([lat / f, lng / f]);
    }
    return coords;
  }
  function instruction(s) {
    var t = s.maneuver.type, m = s.maneuver.modifier || '', n = s.name ? ' onto ' + s.name : '';
    var turn = { left: 'Turn left', right: 'Turn right', 'slight left': 'Keep slightly left', 'slight right': 'Keep slightly right', 'sharp left': 'Turn sharply left', 'sharp right': 'Turn sharply right', straight: 'Continue straight', uturn: 'Make a U-turn' }[m] || 'Continue';
    if (t === 'depart') return 'Depart' + (s.name ? ' along ' + s.name : '');
    if (t === 'arrive') return 'Arrive at the incident' + (m ? ', on the ' + m : '');
    if (t === 'roundabout' || t === 'rotary') return 'At the roundabout take exit ' + (s.maneuver.exit || '') + n;
    if (t === 'merge') return 'Merge' + n;
    if (t === 'on ramp') return 'Take the ramp' + n;
    if (t === 'off ramp') return 'Take the exit' + n;
    if (t === 'fork') return (m ? 'Keep ' + m.replace('slight ', '') : 'Keep on') + n;
    if (t === 'end of road') return turn + n;
    if (t === 'new name' || t === 'continue') return 'Continue' + n;
    return turn + n;
  }
  function route(a, b) {
    return osrm(a, b).catch(function () { return valhalla(a, b); });
  }

  /* ------------------------------------------------------------------ */
  /* Factors                                                             */
  /* ------------------------------------------------------------------ */
  function trafficFactor(d) {
    var h = d.getHours(), wd = d.getDay(), we = wd === 0 || wd === 6, f, label;
    if (we) { if (h < 8) { f = 0.9; label = 'weekend, before 08:00'; } else if (h < 11) { f = 1.05; label = 'weekend morning'; } else if (h < 20) { f = 1.2; label = 'weekend daytime'; } else { f = 1.0; label = 'weekend evening'; } }
    else if (h < 6) { f = 0.9; label = 'night, roads clear'; } else if (h < 8) { f = 1.15; label = 'early morning build-up'; } else if (h < 11) { f = 1.45; label = 'morning peak'; } else if (h < 16) { f = 1.2; label = 'midday'; } else if (h < 17) { f = 1.3; label = 'afternoon build-up'; } else if (h < 21) { f = 1.55; label = 'evening peak'; } else { f = 1.0; label = 'late evening'; }
    return { f: f, label: label };
  }
  var WX = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail' };
  function weatherFactor(w) {
    if (!w) return { f: 1, label: 'weather unknown' };
    var c = w.weather_code, f = 1, why = [];
    if (c === 45 || c === 48) { f = 1.25; why.push('fog'); }
    else if (c >= 51 && c <= 55) { f = 1.1; why.push('drizzle'); }
    else if (c === 56 || c === 57 || c === 66 || c === 67) { f = 1.4; why.push('freezing precipitation'); }
    else if (c === 61 || c === 80) { f = 1.15; why.push('light rain'); }
    else if (c === 63 || c === 81) { f = 1.2; why.push('rain'); }
    else if (c === 65 || c === 82) { f = 1.3; why.push('heavy rain'); }
    else if ((c >= 71 && c <= 77) || c === 85 || c === 86) { f = 1.4; why.push('snow'); }
    else if (c >= 95) { f = 1.35; why.push('thunderstorm'); }
    if (w.visibility != null && w.visibility < 1000) { f = Math.max(f, 1.3); why.push('visibility under 1 km'); }
    else if (w.visibility != null && w.visibility < 3000 && f < 1.15) { f = 1.15; why.push('reduced visibility'); }
    if (w.wind_gusts_10m != null && w.wind_gusts_10m >= 60) { f *= 1.1; why.push('strong gusts'); }
    return { f: Math.round(f * 100) / 100, label: why.length ? why.join(', ') : 'clear roads' };
  }
  function weather(lat, lon) {
    return get('https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) + '&current=temperature_2m,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,is_day&hourly=visibility&forecast_days=1&timezone=auto', 12000).then(function (j) {
      var cur = j.current || {}; var vis = null;
      if (j.hourly && j.hourly.time && cur.time) { var hh = cur.time.slice(0, 13); var i = j.hourly.time.findIndex(function (t) { return t.slice(0, 13) === hh; }); if (i >= 0) vis = j.hourly.visibility[i]; }
      cur.visibility = vis; cur.tz = j.timezone; return cur;
    }).catch(function () { return null; });
  }

  /* ------------------------------------------------------------------ */
  /* Geometry helpers                                                    */
  /* ------------------------------------------------------------------ */
  function cumulative(coords) { var c = [0]; for (var i = 1; i < coords.length; i++) c.push(c[i - 1] + hav(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]) * 1000); return c; }
  /* nearest point on the polyline to p: returns {idx, dist (m), along (m)} */
  function project(coords, cum, p) {
    var best = { d: Infinity, idx: 0, along: 0 };
    for (var i = 0; i < coords.length - 1; i++) {
      var a = coords[i], b = coords[i + 1];
      var ax = a[1], ay = a[0], bx = b[1], by = b[0], px = p[1], py = p[0];
      var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy, t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0; t = Math.max(0, Math.min(1, t));
      var qx = ax + t * dx, qy = ay + t * dy, d = hav(py, px, qy, qx) * 1000;
      if (d < best.d) best = { d: d, idx: i, along: cum[i] + t * (cum[i + 1] - cum[i]), q: [qy, qx] };
    }
    return best;
  }
  function pointAt(coords, cum, along) {
    if (along <= 0) return coords[0]; if (along >= cum[cum.length - 1]) return coords[coords.length - 1];
    var i = 1; while (i < cum.length && cum[i] < along) i++;
    var a = coords[i - 1], b = coords[i], t = (along - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : Math.round(m / 10) * 10 + ' m'; }
  function fmtMin(s) { var m = Math.round(s / 60); if (m < 60) return m + ' min'; return Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min'; }
  function clock(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* ------------------------------------------------------------------ */
  /* State and map                                                       */
  /* ------------------------------------------------------------------ */
  var S = { inc: null, pos: null, posSrc: null, route: null, cum: null, wx: null, tf: null, wf: null, pf: 1, watch: null, sim: null, picking: false, lastReroute: 0, rerouting: false, progress: null };
  var esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/{svc}/MapServer/tile/{z}/{y}/{x}';
  var map = L.map($('#rn-mapel'), { scrollWheelZoom: true, minZoom: 2, maxZoom: 18, worldCopyJump: true });
  var dark = L.layerGroup([L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Base'), { maxZoom: 16, attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors' }), L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Reference'), { maxZoom: 16 })]);
  var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' });
  var sat = L.layerGroup([L.tileLayer(esri.replace('{svc}', 'World_Imagery'), { maxZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }), L.tileLayer(esri.replace('{svc}', 'Reference/World_Boundaries_and_Places'), { maxZoom: 18 })]);
  dark.addTo(map); map.fitBounds([[6.5, 68], [36, 97.5]]);
  var bases = { map: dark, streets: osm, satellite: sat };
  document.querySelectorAll('.rn-mappanel .bm').forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-basemap'); Object.keys(bases).forEach(function (n) { if (map.hasLayer(bases[n])) map.removeLayer(bases[n]); }); bases[k].addTo(map); document.querySelectorAll('.rn-mappanel .bm').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); }); map.getContainer().classList.toggle('is-satellite', k === 'satellite'); }); });
  var layers = { dots: L.layerGroup().addTo(map), route: L.layerGroup().addTo(map), marks: L.layerGroup().addTo(map) };
  ROWS.forEach(function (r) { if (r.risk !== 'Critical' && r.risk !== 'High') return; var m = L.circleMarker([r.lat, r.lon], { radius: 5, color: 'rgba(4,8,16,.7)', weight: 1, fillColor: COLORS[r.risk] || '#E05252', fillOpacity: 0.9 }); m.bindTooltip(r.id + ' · ' + r.region + ' · ' + r.risk, { className: 'fw-tip', direction: 'top' }); m.on('click', function () { if (S.picking) return; setIncident(r); }); layers.dots.addLayer(m); });
  setTimeout(function () { map.invalidateSize(); }, 500);
  map.on('click', function (e) { if (!S.picking) return; S.picking = false; $('#rn-pick').textContent = 'Pick on the map'; map.getContainer().classList.remove('is-picking'); setPos({ lat: +e.latlng.lat.toFixed(5), lon: +e.latlng.lng.toFixed(5) }, 'picked on the map'); });

  var sel = $('#rn-select'), status = $('#rn-status');
  sel.innerHTML += ROWS.filter(function (r) { return r.risk === 'Critical' || r.risk === 'High'; }).map(function (r) { return '<option value="' + r.id + '">' + r.id + ' · ' + esc(r.region) + ' · ' + r.risk + '</option>'; }).join('');
  sel.addEventListener('change', function () { var r = ROWS.filter(function (x) { return x.id === sel.value; })[0]; if (r) setIncident(r); });
  function say(m, kind) { status.textContent = m; status.className = 'lc-status mono' + (kind ? ' ' + kind : ''); }
  function ready() { var ok = !!(S.inc && S.pos); $('#rn-go').disabled = !ok; return ok; }

  var incMarker = null, posMarker = null, accCircle = null;
  function setIncident(rec) {
    S.inc = { id: rec.id || 'Incident', lat: +rec.lat, lon: +rec.lon, region: rec.region || rec.place || '', risk: rec.risk || '', type: rec.type || '', conf: rec.conf, dist: rec.dist, days: rec.days, date: rec.date, dateS: rec.dateS };
    if (rec.id) sel.value = rec.id;
    $('#rn-inc-title').textContent = S.inc.id + (S.inc.region ? ' · ' + S.inc.region : '');
    var tag = $('#rn-inc-tag'); tag.textContent = S.inc.risk || 'point'; tag.style.setProperty('--tc', COLORS[S.inc.risk] || 'var(--text-secondary)');
    $('#rn-inc-meta').textContent = S.inc.lat.toFixed(5) + ', ' + S.inc.lon.toFixed(5) + (S.inc.type ? ' · ' + S.inc.type : '') + (S.inc.conf != null ? ' · confidence ' + S.inc.conf + '%' : '') + (S.inc.dist != null ? ' · industry ' + (+S.inc.dist).toFixed(1) + ' km' : '');
    if (incMarker) incMarker.remove();
    incMarker = L.marker([S.inc.lat, S.inc.lon], { icon: L.divIcon({ className: 'rn-inc', iconSize: [30, 30], html: '<i></i>' }), interactive: false }).addTo(layers.marks);
    if (!S.pos) map.flyTo([S.inc.lat, S.inc.lon], 11, { duration: reduced() ? 0 : 0.8 });
    clearRoute(); say(S.pos ? 'Incident set. Press Start navigation.' : 'Incident set. Now share your location, pick a point on the map, or type coordinates.'); ready();
  }
  function setPos(p, src, acc) {
    S.pos = p; S.posSrc = src; $('#rn-lat').value = p.lat; $('#rn-lon').value = p.lon;
    var tag = $('#rn-pos-tag'); tag.textContent = src === 'GPS' ? 'GPS' : 'set'; tag.style.setProperty('--tc', src === 'GPS' ? 'var(--risk-low)' : 'var(--text-secondary)');
    $('#rn-pos-meta').textContent = p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + ' · ' + src + (acc ? ' · ±' + Math.round(acc) + ' m' : '');
    if (!posMarker) { posMarker = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'rn-me', iconSize: [22, 22], html: '<i></i>' }), interactive: false, zIndexOffset: 1000 }).addTo(layers.marks); } else posMarker.setLatLng([p.lat, p.lon]);
    if (acc) { if (!accCircle) accCircle = L.circle([p.lat, p.lon], { radius: acc, color: '#5A9BD8', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(layers.marks); else { accCircle.setLatLng([p.lat, p.lon]); accCircle.setRadius(acc); } }
    if (!S.route) { if (S.inc) map.fitBounds([[S.inc.lat, S.inc.lon], [p.lat, p.lon]], { padding: [40, 40] }); else map.flyTo([p.lat, p.lon], 12, { duration: reduced() ? 0 : 0.8 }); say(S.inc ? 'Position set. Press Start navigation.' : 'Position set. Now choose the incident.'); }
    ready();
  }
  $('#rn-locate').addEventListener('click', function () {
    if (!navigator.geolocation) { say('This browser will not share a location. Pick a point on the map instead.', 'warn'); return; }
    say('Asking your browser for your location.');
    navigator.geolocation.getCurrentPosition(function (g) { setPos({ lat: +g.coords.latitude.toFixed(5), lon: +g.coords.longitude.toFixed(5) }, 'GPS', g.coords.accuracy); }, function (e) { say(e.code === 1 ? 'Location permission was refused. Pick a point on the map or type coordinates.' : 'Location did not arrive. Pick a point on the map or type coordinates.', 'warn'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  });
  $('#rn-pick').addEventListener('click', function () { S.picking = !S.picking; $('#rn-pick').textContent = S.picking ? 'Click the map now' : 'Pick on the map'; map.getContainer().classList.toggle('is-picking', S.picking); if (S.picking) say('Click your starting point on the map.'); });
  ['#rn-lat', '#rn-lon'].forEach(function (id) { $(id).addEventListener('change', function () { var la = parseFloat($('#rn-lat').value), lo = parseFloat($('#rn-lon').value); if (!isNaN(la) && !isNaN(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) setPos({ lat: la, lon: lo }, 'typed'); }); });
  $('#rn-priority').addEventListener('change', function () { S.pf = $('#rn-priority').checked ? 0.85 : 1; if (S.route) paintEstimate(); });
  $('#rn-follow').addEventListener('change', function () { if (!$('#rn-follow').checked) stopWatch(); else if (S.route && S.posSrc === 'GPS') startWatch(); });
  $('#rn-go').addEventListener('click', function () { if (ready()) start(); });
  $('#rn-sim').addEventListener('click', function () { if (S.sim) stopSim(); else startSim(); });
  $('#rn-stop').addEventListener('click', function () { stopWatch(); stopSim(); $('#rn-stop').hidden = true; say('Stopped following. The route stays on the map.'); $('#rn-live-tag').textContent = 'planned'; });

  function clearRoute() { layers.route.clearLayers(); S.route = null; S.cum = null; S.progress = null; $('#rn-results').hidden = true; $('#rn-hud').hidden = true; $('#rn-sim').disabled = true; stopSim(); }
  var routeLine = null, doneLine = null;
  function start() {
    clearRoute(); say('Routing from your position to the incident.', 'busy'); $('#rn-go').disabled = true;
    var a = S.pos, b = S.inc, t0 = performance.now();
    Promise.all([route(a, b).catch(function () { return null; }), weather((a.lat + b.lat) / 2, (a.lon + b.lon) / 2)]).then(function (res) {
      var r = res[0]; S.wx = res[1]; $('#rn-go').disabled = false;
      if (!r) { say('Neither routing service answered. Check the connection, or hand off to a navigation app below.', 'bad'); $('#rn-results').hidden = false; paintHandoff(); return; }
      S.route = r; S.cum = cumulative(r.coords); S.tf = trafficFactor(new Date()); S.wf = weatherFactor(S.wx); S.pf = $('#rn-priority').checked ? 0.85 : 1;
      routeLine = L.polyline(r.coords, { color: '#0B1524', weight: 9, opacity: 0.85, lineJoin: 'round' }).addTo(layers.route);
      L.polyline(r.coords, { color: '#F08A3C', weight: 5, opacity: 0.95, lineJoin: 'round' }).addTo(layers.route);
      doneLine = L.polyline([], { color: '#93A6B8', weight: 5, opacity: 0.9, lineJoin: 'round' }).addTo(layers.route);
      map.fitBounds(L.latLngBounds(r.coords), { padding: [50, 50] });
      S.progress = { along: 0, off: 0 };
      paintEstimate(); paintWeather(); paintSteps(); paintHandoff();
      $('#rn-results').hidden = false; $('#rn-hud').hidden = false; $('#rn-sim').disabled = false; $('#rn-stop').hidden = false;
      say('Route ready via ' + r.engine + ' in ' + Math.round(performance.now() - t0) + ' ms. ' + (S.posSrc === 'GPS' && $('#rn-follow').checked ? 'Following your position.' : 'Share GPS to follow, or run the simulation.'), 'ok');
      if (S.posSrc === 'GPS' && $('#rn-follow').checked) startWatch();
      setTimeout(function () { $('#rn-results').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }, 200);
    });
  }
  function totals() { var r = S.route, base = r.duration, adj = base * S.tf.f * S.wf.f * S.pf; return { base: base, adj: adj }; }
  function remaining() {
    var t = totals(), total = S.cum[S.cum.length - 1], along = S.progress ? S.progress.along : 0, left = Math.max(0, total - along), frac = total ? left / total : 1;
    return { distLeft: left, timeLeft: t.adj * frac, total: total, adj: t.adj, base: t.base, frac: frac };
  }
  function paintEstimate() {
    var rm = remaining(), arrive = new Date(Date.now() + rm.timeLeft * 1000), r = S.route;
    $('#rn-eta-h').textContent = fmtMin(rm.timeLeft) + ' · arrive ' + clock(arrive);
    $('#hud-eta').textContent = Math.max(1, Math.round(rm.timeLeft / 60)); $('#hud-arrive').textContent = 'arrive ' + clock(arrive); $('#hud-dist').textContent = fmtDist(rm.distLeft) + ' left';
    var kv = [['Distance remaining', fmtDist(rm.distLeft) + (rm.distLeft < rm.total ? ' of ' + fmtDist(rm.total) : '')], ['Time remaining', fmtMin(rm.timeLeft)], ['Arrival, local time', clock(arrive) + (rm.timeLeft > 3600 * 6 ? ' (' + pad(arrive.getDate()) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][arrive.getMonth()] + ')' : '')], ['Road engine', r.engine + ', OpenStreetMap roads'], ['Straight-line gap', fmtDist(hav(S.pos.lat, S.pos.lon, S.inc.lat, S.inc.lon) * 1000)]];
    if (S.progress && S.progress.off > 0) kv.push(['Off the line by', Math.round(S.progress.off) + ' m']);
    $('#rn-kv').innerHTML = kv.map(function (p) { return '<div><dt>' + p[0] + '</dt><dd>' + p[1] + '</dd></div>'; }).join('');
    var steps = [['Free-flow drive time', fmtMin(rm.base), '×1.00'], ['Traffic profile, ' + S.tf.label, fmtMin(rm.base * S.tf.f), '×' + S.tf.f.toFixed(2)], ['Weather, ' + S.wf.label, fmtMin(rm.base * S.tf.f * S.wf.f), '×' + S.wf.f.toFixed(2)], [S.pf < 1 ? 'Emergency right of way' : 'No right-of-way allowance', fmtMin(rm.adj), '×' + S.pf.toFixed(2)]];
    $('#rn-break').innerHTML = '<div class="rb-head mono"><span>Stage</span><span>Full trip</span><span>Factor</span></div>' + steps.map(function (s, i) { return '<div class="rb-row' + (i === steps.length - 1 ? ' total' : '') + '"><span>' + esc(s[0]) + '</span><b class="mono">' + s[1] + '</b><span class="mono">' + s[2] + '</span></div>'; }).join('');
    $('#rn-note').textContent = 'Base time is free-flow from ' + r.engine + '. Traffic factor is a typical urban hour-of-day profile at ' + clock(new Date()) + ' local, not live congestion. Weather factor from current conditions at the route midpoint. Right of way assumes a marked vehicle with siren.';
    /* HUD next step */
    var nxt = nextStep(); $('#hud-next').innerHTML = nxt ? '<b>' + esc(nxt.text) + '</b><span class="mono">in ' + fmtDist(nxt.in) + '</span>' : '';
    $('#rn-live-tag').textContent = S.watch ? 'live GPS' : S.sim ? 'simulation' : 'planned'; $('#rn-live-tag').style.setProperty('--tc', S.watch ? 'var(--risk-low)' : S.sim ? 'var(--type-industrial)' : 'var(--text-secondary)');
  }
  function nextStep() {
    if (!S.route || !S.progress) return null; var along = S.progress.along, r = S.route, acc = 0;
    for (var i = 0; i < r.steps.length; i++) { var st = r.steps[i]; var pr = project(r.coords, S.cum, st.loc); if (pr.along > along + 15) return { text: st.text, in: pr.along - along, i: i }; }
    return { text: 'Arrive at the incident', in: Math.max(0, S.cum[S.cum.length - 1] - along), i: r.steps.length - 1 };
  }
  function paintWeather() {
    var w = S.wx, tag = $('#rn-wx-tag');
    if (!w) { tag.textContent = 'no answer'; $('#rn-wx').innerHTML = '<div><dt>Weather</dt><dd>Open-Meteo did not answer; factor ×1.00</dd></div>'; return; }
    tag.textContent = S.wf.f > 1 ? 'slows you' : 'clear'; tag.style.setProperty('--tc', S.wf.f >= 1.3 ? 'var(--risk-critical)' : S.wf.f > 1 ? 'var(--risk-medium)' : 'var(--risk-low)');
    $('#rn-wx').innerHTML = [['Sky', WX[w.weather_code] || 'code ' + w.weather_code], ['Temperature', w.temperature_2m + ' °C'], ['Precipitation now', (w.precipitation || 0) + ' mm/h'], ['Wind', Math.round(w.wind_speed_10m) + ' km/h, gusts ' + Math.round(w.wind_gusts_10m) + ' km/h'], ['Visibility', w.visibility != null ? (w.visibility >= 1000 ? (w.visibility / 1000).toFixed(1) + ' km' : Math.round(w.visibility) + ' m') : 'n/a'], ['Daylight', w.is_day ? 'day' : 'night']].map(function (p) { return '<div><dt>' + p[0] + '</dt><dd>' + esc(p[1]) + '</dd></div>'; }).join('');
    $('#rn-wx-note').textContent = 'Read at the route midpoint, ' + (w.time || '').replace('T', ' ') + ' ' + (w.tz || '') + '. Factor ×' + S.wf.f.toFixed(2) + ': ' + S.wf.label + '.';
  }
  function paintSteps() {
    var r = S.route, nxt = nextStep(), cap = $('#rn-steps-cap');
    $('#rn-steps').innerHTML = r.steps.map(function (s, i) { return '<li class="' + (nxt && i < nxt.i ? 'done' : nxt && i === nxt.i ? 'now' : '') + '"><span class="ic ' + esc((s.mod || s.type).replace(/\s+/g, '-')) + '"></span><div><b>' + esc(s.text) + '</b><span class="mono">' + (s.dist ? fmtDist(s.dist) : '') + (s.dur ? ' · ' + fmtMin(s.dur) : '') + '</span></div></li>'; }).join('');
    cap.textContent = r.steps.length + ' steps · ' + fmtDist(r.distance);
  }
  function paintHandoff() {
    var b = S.inc, a = S.pos, d = b.lat.toFixed(6) + ',' + b.lon.toFixed(6), o = a ? a.lat.toFixed(6) + ',' + a.lon.toFixed(6) : '';
    var links = [
      ['Google Maps', 'https://www.google.com/maps/dir/?api=1&destination=' + d + (o ? '&origin=' + o : '') + '&travelmode=driving&dir_action=navigate'],
      ['Apple Maps', 'https://maps.apple.com/?daddr=' + d + (o ? '&saddr=' + o : '') + '&dirflg=d'],
      ['Waze', 'https://waze.com/ul?ll=' + d + '&navigate=yes'],
      ['OpenStreetMap', 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=' + (o ? o.replace(',', '%2C') + '%3B' : '') + d.replace(',', '%2C')]
    ];
    $('#rn-handoff').innerHTML = links.map(function (l) { return '<a class="btn btn-ghost btn-sm" href="' + l[1] + '" target="_blank" rel="noopener">' + l[0] + '</a>'; }).join('') + '<button type="button" class="btn btn-ghost btn-sm" id="rn-share">Copy route link</button>';
    $('#rn-share').addEventListener('click', function () { var u = location.origin + location.pathname + '?lat=' + b.lat.toFixed(5) + '&lon=' + b.lon.toFixed(5) + (S.inc.id && /^FW-/.test(S.inc.id) ? '&id=' + S.inc.id : ''); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('Route link copied. Anyone opening it gets this incident and can add their own position.'); }).catch(function () { prompt('Copy this link', u); }); });
  }

  /* Live follow */
  function onPosition(lat, lon, acc, src) {
    setPos({ lat: +lat.toFixed(6), lon: +lon.toFixed(6) }, src, acc);
    if (!S.route) return;
    var pr = project(S.route.coords, S.cum, [lat, lon]);
    S.progress = { along: pr.along, off: pr.d };
    var done = S.route.coords.slice(0, pr.idx + 1); done.push(pr.q); doneLine.setLatLngs(done);
    paintEstimate(); paintSteps();
    if (pr.d > 80 && Date.now() - S.lastReroute > 20000 && !S.rerouting && src === 'GPS') {
      S.rerouting = true; S.lastReroute = Date.now(); say('You are ' + Math.round(pr.d) + ' m off the line. Re-routing.', 'busy');
      route({ lat: lat, lon: lon }, S.inc).then(function (r) { S.route = r; S.cum = cumulative(r.coords); layers.route.clearLayers(); routeLine = L.polyline(r.coords, { color: '#0B1524', weight: 9, opacity: 0.85 }).addTo(layers.route); L.polyline(r.coords, { color: '#F08A3C', weight: 5, opacity: 0.95 }).addTo(layers.route); doneLine = L.polyline([], { color: '#93A6B8', weight: 5 }).addTo(layers.route); S.progress = { along: 0, off: 0 }; paintEstimate(); paintSteps(); say('New route via ' + r.engine + '.', 'ok'); }).catch(function () { say('Re-route failed; keeping the old line.', 'warn'); }).finally(function () { S.rerouting = false; });
    }
    if (S.cum[S.cum.length - 1] - pr.along < 40) { say('You have arrived at the incident.', 'ok'); stopWatch(); stopSim(); }
    if ($('#rn-follow').checked && src === 'GPS') map.panTo([lat, lon], { animate: !reduced() });
  }
  function startWatch() {
    if (S.watch || !navigator.geolocation) return;
    S.watch = navigator.geolocation.watchPosition(function (g) { onPosition(g.coords.latitude, g.coords.longitude, g.coords.accuracy, 'GPS'); }, function () { say('GPS updates stopped arriving.', 'warn'); }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
    $('#rn-live-tag').textContent = 'live GPS';
  }
  function stopWatch() { if (S.watch != null) { navigator.geolocation.clearWatch(S.watch); S.watch = null; } }
  /* Simulation: a marker moving along the route at the adjusted average speed */
  function startSim() {
    if (!S.route) return; stopWatch(); var rm = remaining(); var total = S.cum[S.cum.length - 1], speed = total / Math.max(60, rm.adj); /* m per s */
    var along = S.progress ? S.progress.along : 0, last = performance.now(); $('#rn-sim').textContent = 'Stop simulation'; say('Simulating the drive at ' + Math.round(speed * 3.6) + ' km/h average, 20× real time.', 'busy');
    S.sim = setInterval(function () { var now = performance.now(), dt = (now - last) / 1000; last = now; along += speed * dt * 20; if (along >= total) { along = total; } var p = pointAt(S.route.coords, S.cum, along); onPosition(p[0], p[1], null, 'simulation'); if (along >= total) stopSim(); }, 250);
    $('#rn-stop').hidden = false;
  }
  function stopSim() { if (S.sim) { clearInterval(S.sim); S.sim = null; } var b = $('#rn-sim'); if (b) b.textContent = 'Simulate the drive'; if (S.route) paintEstimate(); }
  document.addEventListener('visibilitychange', function () { if (document.hidden && S.sim) stopSim(); });

  /* Deep link */
  var qs = new URLSearchParams(location.search), qid = qs.get('id'), qlat = parseFloat(qs.get('lat')), qlon = parseFloat(qs.get('lon'));
  if (qid) { var r0 = ROWS.filter(function (r) { return r.id === qid; })[0]; if (r0) setIncident(r0); }
  else if (!isNaN(qlat) && !isNaN(qlon)) setIncident({ id: qs.get('name') || 'Incident', lat: qlat, lon: qlon, risk: qs.get('risk') || '', region: qs.get('place') || '' });
  window.FW_RESPOND = { setIncident: setIncident, setPos: setPos, start: start };
})();
