/* FireWatch Regions: one named area, analysed inside its real boundary and in the immediate neighbourhood band. */
(function () {
  'use strict';
  var root = document.getElementById('regions'); if (!root || !window.L) return;
  var API = window.FW_API || {}, ROWS = API.rows || [], COLORS = API.colors || {}, MON = API.mon || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var reduced = API.reduced || function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var FIRE_URL = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
  function hav(a, b, c, d) { var R = 6371, p = Math.PI / 180, dLat = (c - a) * p, dLon = (d - b) * p; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
  function bearing(a, b, c, d) { var p = Math.PI / 180, y = Math.sin((d - b) * p) * Math.cos(c * p), x = Math.cos(a * p) * Math.sin(c * p) - Math.sin(a * p) * Math.cos(c * p) * Math.cos((d - b) * p); var br = (Math.atan2(y, x) / p + 360) % 360; return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(br / 45) % 8]; }
  function get(url, ms) { var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 15000); return fetch(url, { signal: ctl.signal }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(function () { clearTimeout(t); }); }

  /* Point in polygon (GeoJSON Polygon or MultiPolygon, [lon,lat]) */
  function inRing(pt, ring) { var x = pt[0], y = pt[1], inside = false; for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) { var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; var hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi); if (hit) inside = !inside; } return inside; }
  function inPoly(pt, poly) { if (!inRing(pt, poly[0])) return false; for (var h = 1; h < poly.length; h++) if (inRing(pt, poly[h])) return false; return true; }
  function inside(geo, lat, lon) {
    var pt = [lon, lat];
    if (!geo) return false;
    if (geo.type === 'Polygon') return inPoly(pt, geo.coordinates);
    if (geo.type === 'MultiPolygon') { for (var i = 0; i < geo.coordinates.length; i++) if (inPoly(pt, geo.coordinates[i])) return true; return false; }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Lookups                                                             */
  /* ------------------------------------------------------------------ */
  function geocode(q) {
    return get('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=jsonv2&polygon_geojson=1&polygon_threshold=0.004&limit=5&addressdetails=1', 16000).then(function (list) {
      if (!list || !list.length) throw new Error('not found');
      /* Prefer administrative areas with a polygon */
      var pick = list.filter(function (r) { return r.geojson && (r.geojson.type === 'Polygon' || r.geojson.type === 'MultiPolygon'); })[0] || list[0];
      var bb = pick.boundingbox.map(Number); /* south, north, west, east */
      var geo = pick.geojson && (pick.geojson.type === 'Polygon' || pick.geojson.type === 'MultiPolygon') ? pick.geojson : null;
      if (!geo) { /* point result: use a 25 km box as the area */
        var la = +pick.lat, lo = +pick.lon, dLat = 25 / 111, dLon = 25 / (111 * Math.max(0.2, Math.cos(la * Math.PI / 180))); bb = [la - dLat, la + dLat, lo - dLon, lo + dLon];
        geo = { type: 'Polygon', coordinates: [[[bb[2], bb[0]], [bb[3], bb[0]], [bb[3], bb[1]], [bb[2], bb[1]], [bb[2], bb[0]]]] };
      }
      return { name: pick.display_name, short: pick.name || q, type: pick.type || pick.addresstype || 'area', bbox: { s: bb[0], n: bb[1], w: bb[2], e: bb[3] }, geo: geo, lat: +pick.lat, lon: +pick.lon, address: pick.address || {}, synthetic: !pick.geojson || !(pick.geojson.type === 'Polygon' || pick.geojson.type === 'MultiPolygon') };
    });
  }
  function fires(bb) {
    var env = bb.w.toFixed(4) + ',' + bb.s.toFixed(4) + ',' + bb.e.toFixed(4) + ',' + bb.n.toFixed(4);
    return get(FIRE_URL + '?where=1%3D1&geometry=' + env + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=latitude,longitude,confidence,frp,acq_date,acq_time,daynight&returnGeometry=false&resultRecordCount=2000&f=json', 20000)
      .then(function (j) { var rows = (j.features || []).map(function (f) { return f.attributes; }).filter(function (a) { return a && a.latitude != null; }); return { rows: rows, capped: !!j.exceededTransferLimit || rows.length >= 2000 }; })
      .catch(function () { return null; });
  }

  /* ------------------------------------------------------------------ */
  /* Map                                                                 */
  /* ------------------------------------------------------------------ */
  var esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/{svc}/MapServer/tile/{z}/{y}/{x}';
  var map = L.map($('#rg-mapel'), { scrollWheelZoom: false, minZoom: 2, maxZoom: 17, worldCopyJump: true });
  var dark = L.layerGroup([L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Base'), { maxZoom: 16, attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors' }), L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Reference'), { maxZoom: 16 })]);
  var sat = L.layerGroup([L.tileLayer(esri.replace('{svc}', 'World_Imagery'), { maxZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }), L.tileLayer(esri.replace('{svc}', 'Reference/World_Boundaries_and_Places'), { maxZoom: 18 })]);
  dark.addTo(map); map.fitBounds([[6.5, 68], [36, 97.5]]);
  document.querySelectorAll('.rg-mappanel .bm').forEach(function (b) { b.addEventListener('click', function () { var k = b.getAttribute('data-basemap'); [dark, sat].forEach(function (l) { if (map.hasLayer(l)) map.removeLayer(l); }); (k === 'satellite' ? sat : dark).addTo(map); document.querySelectorAll('.rg-mappanel .bm').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); }); map.getContainer().classList.toggle('is-satellite', k === 'satellite'); }); });
  var layers = { area: L.layerGroup().addTo(map), band: L.layerGroup().addTo(map), live: L.layerGroup().addTo(map), recs: L.layerGroup().addTo(map) };
  setTimeout(function () { map.invalidateSize(); }, 500);

  /* ------------------------------------------------------------------ */
  /* Picker                                                              */
  /* ------------------------------------------------------------------ */
  var sel = $('#rg-select'), q = $('#rg-q'), statusEl = $('#rg-status'), busy = false;
  var regionNames = (function () { var seen = {}, out = []; ROWS.forEach(function (r) { var parts = r.region.split(',').map(function (p) { return p.trim(); }); [parts[0], parts.length > 1 ? parts[parts.length - 1] : null].forEach(function (n) { if (n && !seen[n]) { seen[n] = 1; out.push(n); } }); }); return out.sort(function (a, b) { var ai = /India$/.test(ROWS.filter(function (r) { return r.region.indexOf(a) >= 0; })[0].region), bi = /India$/.test(ROWS.filter(function (r) { return r.region.indexOf(b) >= 0; })[0].region); if (ai !== bi) return ai ? -1 : 1; return a.localeCompare(b); }); })();
  sel.innerHTML += regionNames.map(function (n) { var c = ROWS.filter(function (r) { return r.region.indexOf(n) >= 0; }).length; return '<option value="' + esc(n) + '">' + esc(n) + ' · ' + c + (c === 1 ? ' record' : ' records') + '</option>'; }).join('');
  sel.addEventListener('change', function () { if (!sel.value) return; var full = ROWS.filter(function (r) { return r.region.split(',')[0].trim() === sel.value; })[0]; analyse(full && full.region.indexOf(',') > 0 ? full.region : sel.value); });
  $('#rg-form').addEventListener('submit', function (e) { e.preventDefault(); var v = q.value.trim(); if (v) analyse(v); });
  function say(m) { statusEl.textContent = m; }

  /* ------------------------------------------------------------------ */
  /* Analysis                                                            */
  /* ------------------------------------------------------------------ */
  function analyse(query) {
    if (busy) return; busy = true; q.value = query; say('Looking up the boundary for ' + query);
    geocode(query).then(function (area) {
      var w = area.bbox.e - area.bbox.w, h = area.bbox.n - area.bbox.s, cLat = (area.bbox.n + area.bbox.s) / 2;
      var padLat = Math.max(0.3 * h, 50 / 111), padLon = Math.max(0.3 * w, 50 / (111 * Math.max(0.2, Math.cos(cLat * Math.PI / 180))));
      var outer = { s: area.bbox.s - padLat, n: area.bbox.n + padLat, w: area.bbox.w - padLon, e: area.bbox.e + padLon };
      var inRecs = [], nbRecs = [];
      ROWS.forEach(function (r) { if (inside(area.geo, r.lat, r.lon)) inRecs.push(r); else if (r.lat >= outer.s && r.lat <= outer.n && r.lon >= outer.w && r.lon <= outer.e) nbRecs.push(r); });
      say('Boundary found. Fetching live passes.');
      return fires(outer).then(function (live) { paint(area, outer, inRecs, nbRecs, live, query); busy = false; });
    }).catch(function () { say('No boundary found for "' + query + '". Try a state, district or city name, with the country if it is ambiguous.'); busy = false; });
  }
  function paint(area, outer, inRecs, nbRecs, live, query) {
    var res = $('#rg-result'); var wasHidden = res.hidden; res.hidden = false; res.classList.add('in');
    if (wasHidden) map.invalidateSize();
    var ad = area.address, nm = (area.short || '').toLowerCase(), kind;
    if (area.type === 'administrative') { if ((ad.city && ad.city.toLowerCase() === nm) || (ad.town && ad.town.toLowerCase() === nm)) kind = 'City'; else if ((ad.county && ad.county.toLowerCase() === nm) || (ad.state_district && ad.state_district.toLowerCase() === nm)) kind = /county/i.test(area.short) ? 'County' : 'District'; else if (ad.state && ad.state.toLowerCase() === nm) kind = 'State or province'; else if (ad.country && ad.country.toLowerCase() === nm) kind = 'Country'; else kind = ad.state && !ad.county && !ad.city ? 'State or province' : 'Administrative area'; } else kind = area.type.charAt(0).toUpperCase() + area.type.slice(1);
    $('#rg-kicker').textContent = kind + (area.synthetic ? ', 25 km box around the point' : '');
    $('#rg-title').textContent = area.short; $('#rg-map-h').textContent = area.short;
    var sizeKm = Math.round(hav(area.bbox.s, area.bbox.w, area.bbox.s, area.bbox.e)) + ' × ' + Math.round(hav(area.bbox.s, area.bbox.w, area.bbox.n, area.bbox.w)) + ' km';
    say('Analysed ' + area.short + '.');
    var rl = $('#rg-report'); if (rl) { var known = ROWS.some(function (r) { return r.region.split(',')[0].trim().toLowerCase() === area.short.toLowerCase(); }); rl.href = known ? 'report.html?scope=region&q=' + encodeURIComponent(area.short) + '&title=' + encodeURIComponent('Situation report, ' + area.short) : 'report.html?scope=all&title=' + encodeURIComponent('Situation report, ' + area.short + ' and surroundings'); }
    /* Live split */
    var liveIn = [], liveNb = [], capped = false;
    if (live) { capped = live.capped; live.rows.forEach(function (a) { if (inside(area.geo, a.latitude, a.longitude)) liveIn.push(a); else liveNb.push(a); }); }
    var escIn = inRecs.filter(function (r) { return r.risk === 'Critical' || r.risk === 'High'; }), escNb = nbRecs.filter(function (r) { return r.risk === 'Critical' || r.risk === 'High'; });
    var topIn = inRecs.filter(function (r) { return r.pri && r.pri.top; });
    $('#rg-lede').textContent = area.name + '. Boundary about ' + sizeKm + '. ' + inRecs.length + ' sample ' + (inRecs.length === 1 ? 'record' : 'records') + ' inside, ' + nbRecs.length + ' in the neighbourhood band' + (live ? '; ' + liveIn.length + ' live VIIRS passes inside and ' + liveNb.length + ' around it in the last 7 days' + (capped ? ' (query cap of 2,000 reached, counts are a floor)' : '') : '; the live feed did not answer') + '.';
    /* Pressure verdict */
    var pres = $('#rg-pressure'), pnote = $('#rg-pressure-note'), pv, ptxt;
    var ratio = (escNb.length + liveNb.length / 20) / Math.max(1, escIn.length + liveIn.length / 20);
    if (escIn.length === 0 && escNb.length === 0 && liveIn.length + liveNb.length === 0) { pv = 'quiet'; ptxt = 'Nothing escalated inside or around, and no live passes.'; }
    else if (escNb.length > escIn.length && escNb.length >= 2) { pv = 'from outside'; ptxt = escNb.length + ' escalated sites press on the edge against ' + escIn.length + ' inside. Watch the borders.'; }
    else if (escIn.length >= 3 || topIn.length >= 1) { pv = 'from inside'; ptxt = escIn.length + ' escalated inside' + (topIn.length ? ', ' + topIn.length + ' sustained Critical' : '') + '. The load is the area\'s own.'; }
    else if (ratio > 1.5) { pv = 'edges busier'; ptxt = 'More live passes in the band than inside. Activity is around, not in.'; }
    else { pv = 'balanced'; ptxt = 'Inside and around carry similar loads.'; }
    pres.textContent = pv; pnote.textContent = ptxt; $('#rg-verdict').className = 'rg-verdict ' + pv.replace(/\s+/g, '-');
    /* KPIs */
    $('#k-in').textContent = inRecs.length; $('#k-esc').textContent = escIn.length; $('#k-top').textContent = topIn.length; $('#k-nb').textContent = nbRecs.length; $('#k-live').textContent = live ? liveIn.length + (capped ? '+' : '') : 'n/a';
    /* Map */
    ['area', 'band', 'live', 'recs'].forEach(function (k) { layers[k].clearLayers(); });
    var outerRing = [[outer.s, outer.w], [outer.s, outer.e], [outer.n, outer.e], [outer.n, outer.w]];
    L.rectangle([[outer.s, outer.w], [outer.n, outer.e]], { color: 'rgba(147,166,184,.7)', weight: 1, dashArray: '6 5', fill: true, fillColor: '#93A6B8', fillOpacity: 0.05, interactive: false }).addTo(layers.band);
    var gj = L.geoJSON(area.geo, { style: { color: '#F08A3C', weight: 2, fillColor: '#F08A3C', fillOpacity: 0.08 }, interactive: false }).addTo(layers.area);
    liveIn.forEach(function (a) { L.circleMarker([a.latitude, a.longitude], { radius: 3, color: 'rgba(4,8,16,.6)', weight: 0.5, fillColor: '#FFD27A', fillOpacity: 0.85, interactive: false }).addTo(layers.live); });
    liveNb.forEach(function (a) { L.circleMarker([a.latitude, a.longitude], { radius: 2.5, color: 'rgba(4,8,16,.5)', weight: 0.5, fillColor: '#FFD27A', fillOpacity: 0.35, interactive: false }).addTo(layers.live); });
    function recMarker(r, dim) { var m = L.circleMarker([r.lat, r.lon], { radius: 5 + r.conf / 16, color: 'rgba(4,8,16,.75)', weight: 1, fillColor: COLORS[r.risk] || '#E05252', fillOpacity: dim ? 0.4 : 0.95 }); m.bindTooltip(r.id + ' · ' + r.type + ' · ' + r.risk + (dim ? ' · neighbourhood' : ''), { className: 'fw-tip', direction: 'top' }); m.bindPopup('<div class="pop"><h4>' + esc(r.type) + '</h4><div class="id">' + r.id + ' · ' + esc(r.region) + '</div><table><tr><td>Risk</td><td>' + r.risk + '</td></tr><tr><td>Confidence</td><td>' + r.conf + '%</td></tr><tr><td>Days seen</td><td>' + r.days + '</td></tr><tr><td>Nearest industry</td><td>' + r.dist.toFixed(1) + ' km</td></tr></table><div class="pop-actions"><span class="tag" style="--tc:' + (COLORS[r.risk] || '#E05252') + '">' + r.risk + '</span><span class="pop-btns"><button type="button" class="btn btn-ghost btn-sm ev-btn" data-evidence="' + r.id + '">Satellite evidence</button>' + (r.risk === 'Critical' || r.risk === 'High' ? '<button type="button" class="btn btn-sm ev-btn sos-pop" data-sos="' + r.id + '">Emergency SOS</button><a class="btn btn-ghost btn-sm ev-btn" href="respond.html?id=' + r.id + '">Navigate</a>' : '') + '</span></div></div>', { maxWidth: 320 }); return m; }
    nbRecs.forEach(function (r) { recMarker(r, true).addTo(layers.recs); }); inRecs.forEach(function (r) { recMarker(r, false).addTo(layers.recs); });
    map.invalidateSize(); map.fitBounds([[outer.s, outer.w], [outer.n, outer.e]], { padding: [20, 20] });
    setTimeout(function () { map.invalidateSize(); map.fitBounds([[outer.s, outer.w], [outer.n, outer.e]], { padding: [20, 20] }); }, 450);
    $('#rg-map-hint').textContent = 'Orange outline is the boundary OpenStreetMap holds for ' + area.short + '. The dashed box is the neighbourhood band. Bright points are the sample records; small amber dots are live VIIRS passes, brighter inside the boundary.';
    /* Inside against around */
    function brk(list, key, order) { var m = {}; list.forEach(function (r) { m[r[key]] = (m[r[key]] || 0) + 1; }); return order.map(function (k) { return [k, m[k] || 0]; }); }
    var riskIn = brk(inRecs, 'risk', ['Critical', 'High', 'Medium', 'Low']), riskNb = brk(nbRecs, 'risk', ['Critical', 'High', 'Medium', 'Low']);
    var typeIn = brk(inRecs, 'type', ['Industrial Fire', 'Agricultural Burning', 'Other/Natural']), typeNb = brk(nbRecs, 'type', ['Industrial Fire', 'Agricultural Burning', 'Other/Natural']);
    var nightIn = liveIn.filter(function (a) { return a.daynight === 'N'; }).length, nightNb = liveNb.filter(function (a) { return a.daynight === 'N'; }).length;
    var rowsHtml = '<div class="rc-head mono"><span></span><span>Inside</span><span>Around</span></div>';
    rowsHtml += '<div class="rc-row"><span>Records</span><b>' + inRecs.length + '</b><b>' + nbRecs.length + '</b></div>';
    riskIn.forEach(function (p, i) { rowsHtml += '<div class="rc-row"><span><i style="background:' + COLORS[p[0]] + '"></i>' + p[0] + '</span><b>' + p[1] + '</b><b>' + riskNb[i][1] + '</b></div>'; });
    typeIn.forEach(function (p, i) { rowsHtml += '<div class="rc-row"><span>' + p[0] + '</span><b>' + p[1] + '</b><b>' + typeNb[i][1] + '</b></div>'; });
    rowsHtml += '<div class="rc-row"><span>Top priority</span><b>' + topIn.length + '</b><b>' + nbRecs.filter(function (r) { return r.pri && r.pri.top; }).length + '</b></div>';
    rowsHtml += '<div class="rc-row"><span>Live passes, 7 days</span><b>' + (live ? liveIn.length : '–') + '</b><b>' + (live ? liveNb.length : '–') + '</b></div>';
    rowsHtml += '<div class="rc-row"><span>Night passes</span><b>' + (live ? nightIn : '–') + '</b><b>' + (live ? nightNb : '–') + '</b></div>';
    $('#rg-compare').innerHTML = rowsHtml;
    /* By day */
    var days = []; for (var i = 6; i >= 0; i--) { var d = new Date(); d.setUTCDate(d.getUTCDate() - i); days.push(d.toISOString().slice(0, 10)); }
    var perIn = {}, perNb = {}; liveIn.forEach(function (a) { if (a.acq_date) { var k = new Date(a.acq_date).toISOString().slice(0, 10); perIn[k] = (perIn[k] || 0) + 1; } }); liveNb.forEach(function (a) { if (a.acq_date) { var k = new Date(a.acq_date).toISOString().slice(0, 10); perNb[k] = (perNb[k] || 0) + 1; } });
    var mx = 1; days.forEach(function (k) { mx = Math.max(mx, perIn[k] || 0, perNb[k] || 0); });
    $('#rg-dbars').innerHTML = days.map(function (k, i) { var a = perIn[k] || 0, b = perNb[k] || 0; return '<div class="dbar" title="' + k + ': ' + a + ' inside, ' + b + ' around"><div class="cols"><div class="col" style="height:' + (a / mx * 100) + '%;background:#FFD27A;transition-delay:' + (i * 0.05) + 's"><em>' + (a || '') + '</em></div><div class="col" style="height:' + (b / mx * 100) + '%;background:rgba(147,166,184,.7);transition-delay:' + (i * 0.05 + 0.06) + 's"><em>' + (b || '') + '</em></div></div><div class="dl">' + k.slice(8) + ' ' + MON[+k.slice(5, 7) - 1] + '</div></div>'; }).join('');
    /* Clusters: 0.05° cells inside */
    var cells = {}; liveIn.forEach(function (a) { var k = (Math.round(a.latitude / 0.05) * 0.05).toFixed(2) + ',' + (Math.round(a.longitude / 0.05) * 0.05).toFixed(2); cells[k] = cells[k] || { n: 0, night: 0, frp: 0, days: {}, lat: 0, lon: 0 }; var c = cells[k]; c.n++; if (a.daynight === 'N') c.night++; c.frp = Math.max(c.frp, +a.frp || 0); if (a.acq_date) c.days[new Date(a.acq_date).toISOString().slice(0, 10)] = 1; c.lat += a.latitude; c.lon += a.longitude; });
    var cl = Object.keys(cells).map(function (k) { var c = cells[k]; return { n: c.n, night: c.night, frp: c.frp, days: Object.keys(c.days).length, lat: c.lat / c.n, lon: c.lon / c.n }; }).sort(function (a, b) { return b.days - a.days || b.n - a.n; }).slice(0, 5);
    $('#rg-clusters').innerHTML = cl.length ? cl.map(function (c, i) { var near = inRecs.concat(nbRecs).map(function (r) { return { r: r, d: hav(c.lat, c.lon, r.lat, r.lon) }; }).sort(function (a, b) { return a.d - b.d; })[0]; return '<li><span class="rank">' + (i + 1) + '</span><div><b>' + c.lat.toFixed(3) + ', ' + c.lon.toFixed(3) + '</b><span class="mono">' + c.n + ' passes on ' + c.days + ' day' + (c.days === 1 ? '' : 's') + (c.night ? ', ' + c.night + ' at night' : '') + ' · peak ' + c.frp.toFixed(0) + ' MW' + (near && near.d < 5 ? ' · ' + near.r.id + ' ' + near.d.toFixed(1) + ' km away' : '') + '</span></div><span class="cl-acts"><a class="nav-btn" href="thermal-dna.html?lat=' + c.lat.toFixed(4) + '&lon=' + c.lon.toFixed(4) + '">DNA</a><a class="nav-btn" href="respond.html?lat=' + c.lat.toFixed(4) + '&lon=' + c.lon.toFixed(4) + '&name=' + encodeURIComponent('Cluster ' + (i + 1) + ', ' + area.short) + '">Navigate</a></span></li>'; }).join('') : '<li class="small">' + (live ? 'No live passes inside the boundary in the last 7 days.' : 'The live feed did not answer.') + '</li>';
    /* Neighbours: regions of neighbourhood records, with direction */
    var nbNames = {}; nbRecs.forEach(function (r) { var n = r.region; if (!nbNames[n]) nbNames[n] = { n: 0, esc: 0, dir: bearing(area.lat, area.lon, r.lat, r.lon) }; nbNames[n].n++; if (r.risk === 'Critical' || r.risk === 'High') nbNames[n].esc++; });
    var nbKeys = Object.keys(nbNames).sort(function (a, b) { return nbNames[b].esc - nbNames[a].esc || nbNames[b].n - nbNames[a].n; });
    $('#rg-neighbours').innerHTML = nbKeys.length ? nbKeys.map(function (k) { var same = k.toLowerCase().indexOf(area.short.toLowerCase()) >= 0; return '<span class="nb-chip"><b>' + esc(k) + (same ? ' (labelled, outside the boundary)' : '') + '</b> ' + nbNames[k].dir + ' · ' + nbNames[k].n + (nbNames[k].n === 1 ? ' record' : ' records') + (nbNames[k].esc ? ', ' + nbNames[k].esc + ' escalated' : '') + '</span>'; }).join('') : 'No sample records in the neighbourhood band, so no bordering areas to name from the feed.';
    /* Lists */
    function rowHtml(r, dim) {
      var dir = bearing(area.lat, area.lon, r.lat, r.lon), dk = hav(area.lat, area.lon, r.lat, r.lon);
      var sameName = dim && r.region.toLowerCase().indexOf(area.short.toLowerCase()) >= 0;
      return '<li class="qrow' + (r.pri && r.pri.top ? ' is-top' : '') + (dim ? ' is-nb' : '') + '" tabindex="0" role="button" aria-label="Show ' + r.id + ' on the map" data-id="' + r.id + '"><div>' + (r.pri && r.pri.top ? '<span class="top-ribbon">Top priority · ' + r.pri.trend + '</span>' : '') + '<div class="t">' + esc(r.type) + ' · ' + esc(r.region) + '</div><div class="m">' + r.id + ' · ' + r.lat.toFixed(4) + ', ' + r.lon.toFixed(4) + ' · ' + dir + ' ' + Math.round(dk) + ' km from the centre' + (sameName ? '<br><span class="why">Labelled ' + esc(r.region.split(',')[0]) + ' in the feed, but its coordinates fall just outside the OpenStreetMap boundary, so it is counted as neighbourhood.</span>' : '') + '<br>' + r.dist.toFixed(1) + ' km from nearest mapped industrial site · seen on ' + r.days + ' separate day' + (r.days === 1 ? '' : 's') + '<br>' + esc(r.source) + ' · ' + r.dateS + '</div></div>' +
        '<div class="r" style="--tc:' + COLORS[r.risk] + '"><span class="tag" style="--tc:' + COLORS[r.risk] + '">' + r.risk + '</span><div class="conf">' + r.conf + '%</div><div class="cl">Confidence</div><div class="meter"><i style="--w:' + r.conf + '%"></i></div>' + (r.risk === 'Critical' || r.risk === 'High' ? '<span class="qrow-acts"><button type="button" class="sos-btn" data-sos="' + r.id + '">SOS</button><a class="nav-btn" href="respond.html?id=' + r.id + '">Navigate</a></span>' : '') + '</div></li>';
    }
    var sortF = function (a, b) { return ((b.pri && b.pri.top ? 1 : 0) - (a.pri && a.pri.top ? 1 : 0)) || ((b.pri ? b.pri.score : 0) - (a.pri ? a.pri.score : 0)) || (b.conf - a.conf); };
    var inS = inRecs.slice().sort(sortF), nbS = nbRecs.slice().sort(sortF);
    $('#rg-in-list').innerHTML = inS.map(function (r) { return rowHtml(r, false); }).join(''); $('#rg-in-empty').hidden = !!inS.length; $('#rg-in-cap').textContent = inS.length + (inS.length === 1 ? ' record' : ' records') + ', ' + escIn.length + ' escalated';
    $('#rg-nb-list').innerHTML = nbS.map(function (r) { return rowHtml(r, true); }).join(''); $('#rg-nb-empty').hidden = !!nbS.length; $('#rg-nb-cap').textContent = nbS.length + (nbS.length === 1 ? ' record' : ' records') + ', ' + escNb.length + ' escalated';
    document.querySelectorAll('#rg-in-list .qrow, #rg-nb-list .qrow').forEach(function (li) {
      var go = function () { var r = ROWS.filter(function (x) { return x.id === li.getAttribute('data-id'); })[0]; if (!r) return; map.flyTo([r.lat, r.lon], Math.max(map.getZoom(), 9), { duration: reduced() ? 0 : 1 }); $('#rg-mapel').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); layers.recs.eachLayer(function (m) { if (m.getLatLng && m.getLatLng().lat === r.lat && m.getLatLng().lng === r.lon) setTimeout(function () { m.openPopup(); }, reduced() ? 50 : 1100); }); };
      li.addEventListener('click', function (e) { if (e.target.closest('.qrow-acts')) return; go(); }); li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    setTimeout(function () { $('.rg-head').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }, 120);
    try { history.replaceState(null, '', location.pathname + '?q=' + encodeURIComponent(query)); } catch (e) { }
  }

  var qs = new URLSearchParams(location.search), q0 = qs.get('q'); if (q0) setTimeout(function () { analyse(q0); }, 300);
  window.FW_REGIONS = { analyse: analyse };
})();
