/* FireWatch Thermal DNA: is the current heat abnormal for this location?
   Three strands, read live: a ten-year climate baseline (ERA5 via Open-Meteo), a seven-day VIIRS fire fingerprint,
   and the regional burning season. Every threshold is printed beside the number it judges. */
(function () {
  'use strict';
  var pick = document.getElementById('dna-pick'); if (!pick) return;
  var API = window.FW_API || {}, ROWS = API.rows || [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var reduced = API.reduced || function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FIRE_URL = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
  var YEARS = 10, WINDOW = 10;

  /* ------------------------------------------------------------------ */
  /* Burning-season calendar, Indian states. [startMonth,startDay,endMonth,endDay,label] */
  /* ------------------------------------------------------------------ */
  var PADDY = [10, 10, 11, 30, 'Paddy stubble'], WHEAT = [4, 15, 5, 20, 'Wheat residue'], FOREST_C = [3, 1, 5, 31, 'Forest fire months'], FOREST_S = [2, 1, 4, 30, 'Forest fire months'], CANE = [11, 15, 2, 28, 'Sugarcane trash, paddy'], FOREST_H = [4, 1, 6, 15, 'Forest fire months'];
  var SEASONS = {
    'punjab': [PADDY, WHEAT], 'haryana': [PADDY, WHEAT], 'delhi ncr': [PADDY, WHEAT], 'uttar pradesh': [PADDY, WHEAT],
    'madhya pradesh': [WHEAT, [10, 15, 11, 30, 'Soybean and paddy residue'], FOREST_C], 'rajasthan': [WHEAT, [10, 15, 11, 20, 'Kharif residue']],
    'bihar': [[11, 1, 12, 15, 'Paddy stubble'], [4, 1, 4, 30, 'Wheat residue']], 'west bengal': [[11, 15, 12, 31, 'Paddy stubble'], FOREST_S],
    'maharashtra': [CANE, FOREST_S], 'karnataka': [CANE, FOREST_S], 'telangana': [CANE, FOREST_S], 'andhra pradesh': [CANE, FOREST_S], 'tamil nadu': [[1, 1, 2, 28, 'Paddy stubble'], FOREST_S],
    'gujarat': [WHEAT, [11, 1, 12, 15, 'Cotton and paddy residue']], 'odisha': [FOREST_C, [11, 15, 12, 31, 'Paddy stubble']], 'chhattisgarh': [FOREST_C, [11, 15, 12, 31, 'Paddy stubble']],
    'kerala': [FOREST_S], 'goa': [FOREST_S], 'uttarakhand': [FOREST_H], 'himachal pradesh': [FOREST_H]
  };
  function seasonsFor(region) {
    if (!region) return null;
    var raw = region.split(',').map(function (p) { return p.trim(); }), parts = raw.map(function (p) { return p.toLowerCase(); });
    for (var i = 0; i < parts.length; i++) if (SEASONS[parts[i]]) return { name: raw[i], windows: SEASONS[parts[i]] };
    return parts[parts.length - 1] === 'india' ? { name: raw[0], windows: [] } : null;
  }
  function inWindow(w, m, d) {
    var a = w[0] * 100 + w[1], b = w[2] * 100 + w[3], x = m * 100 + d;
    return a <= b ? (x >= a && x <= b) : (x >= a || x <= b);
  }

  /* ------------------------------------------------------------------ */
  /* Fetch helpers                                                       */
  /* ------------------------------------------------------------------ */
  function get(url, ms) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 15000);
    return fetch(url, { signal: ctl.signal }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(function () { clearTimeout(t); });
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function hav(a, b, c, d) { var R = 6371, p = Math.PI / 180, dLat = (c - a) * p, dLon = (d - b) * p; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
  function climate(lat, lon) {
    var end = new Date(); end.setDate(end.getDate() - 6); var start = new Date(end); start.setFullYear(start.getFullYear() - YEARS);
    return get('https://archive-api.open-meteo.com/v1/archive?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) + '&start_date=' + iso(start) + '&end_date=' + iso(end) + '&daily=temperature_2m_max,temperature_2m_mean&timezone=auto', 25000);
  }
  function recent(lat, lon) {
    return get('https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) + '&daily=temperature_2m_max,temperature_2m_mean&past_days=14&forecast_days=1&timezone=auto', 15000);
  }
  function fires(lat, lon, km) {
    var dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    var env = (lon - dLon).toFixed(4) + ',' + (lat - dLat).toFixed(4) + ',' + (lon + dLon).toFixed(4) + ',' + (lat + dLat).toFixed(4);
    return get(FIRE_URL + '?where=1%3D1&geometry=' + env + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=latitude,longitude,confidence,frp,acq_date,acq_time,satellite,daynight,hours_old&returnGeometry=false&resultRecordCount=2000&f=json', 15000)
      .then(function (j) { return (j.features || []).map(function (f) { return f.attributes; }).filter(function (a) { return a && a.latitude != null; }); });
  }
  var siteCache = {};
  function industryDistance(lat, lon) {
    var key = lat.toFixed(2) + ',' + lon.toFixed(2); if (siteCache[key]) return Promise.resolve(siteCache[key]);
    var km = 30, dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    var bb = (lat - dLat).toFixed(3) + ',' + (lon - dLon).toFixed(3) + ',' + (lat + dLat).toFixed(3) + ',' + (lon + dLon).toFixed(3);
    var q = '[out:json][timeout:12];(way["landuse"="industrial"](' + bb + ');relation["landuse"="industrial"](' + bb + ');way["man_made"="works"](' + bb + ');way["power"="plant"](' + bb + '););out center 200;';
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 20000);
    return fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { var best = null; (j.elements || []).forEach(function (e) { var c = e.center || e; if (c.lat == null) return; var d = hav(lat, lon, c.lat, c.lon); if (best === null || d < best) best = d; }); var out = { status: 'ok', km: best }; siteCache[key] = out; return out; })
      .catch(function () { return { status: 'failed' }; }).finally(function () { clearTimeout(tm); });
  }
  function placeName(lat, lon) {
    return get('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=' + lat + '&lon=' + lon, 9000).then(function (j) {
      var a = j.address || {}; var bits = [a.state_district || a.county || a.city || a.town, a.state, a.country].filter(Boolean);
      return { label: bits.length ? bits.join(', ') : (j.display_name || null), state: a.state || '', country: a.country || '' };
    }).catch(function () { return null; });
  }

  /* ------------------------------------------------------------------ */
  /* Statistics                                                          */
  /* ------------------------------------------------------------------ */
  function stats(arr) { var n = arr.length; if (!n) return null; var m = arr.reduce(function (s, v) { return s + v; }, 0) / n; var v = arr.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / Math.max(1, n - 1); var sorted = arr.slice().sort(function (a, b) { return a - b; }); return { n: n, mean: m, sd: Math.sqrt(v), min: sorted[0], max: sorted[n - 1], p10: q(sorted, 0.1), p50: q(sorted, 0.5), p90: q(sorted, 0.9), p98: q(sorted, 0.98), sorted: sorted }; }
  function q(sorted, p) { var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
  function pctile(sorted, v) { var c = 0; for (var i = 0; i < sorted.length; i++) if (sorted[i] <= v) c++; return c / sorted.length; }
  function doy(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000); }

  function readBaseline(cl, rc, refDate) {
    var t = cl.daily.time, mx = cl.daily.temperature_2m_max, mn = cl.daily.temperature_2m_mean;
    var ref = doy(refDate), win = [], monthly = {}, thisYear = {}, yr = new Date().getFullYear();
    for (var i = 0; i < t.length; i++) {
      if (mx[i] == null) continue; var d = new Date(t[i] + 'T00:00:00'); var dd = doy(d), diff = Math.abs(dd - ref); if (diff > 182) diff = 365 - diff;
      if (diff <= WINDOW) win.push(mx[i]);
      var m = d.getMonth(); if (d.getFullYear() === yr) { (thisYear[m] = thisYear[m] || []).push(mx[i]); } else { (monthly[m] = monthly[m] || []).push(mx[i]); }
    }
    var rec7 = [], rt = rc.daily.time, rx = rc.daily.temperature_2m_max, today = iso(new Date());
    for (var k = 0; k < rt.length; k++) { if (rx[k] == null || rt[k] > today) continue; rec7.push({ date: rt[k], max: rx[k] }); }
    rec7 = rec7.slice(-7);
    /* Recent days also belong to this year's month bucket */
    rec7.forEach(function (r) { var m = +r.date.slice(5, 7) - 1; (thisYear[m] = thisYear[m] || []).push(r.max); });
    var base = stats(win), recentMax = rec7.length ? Math.max.apply(null, rec7.map(function (r) { return r.max; })) : null, recentMean = rec7.length ? rec7.reduce(function (s, r) { return s + r.max; }, 0) / rec7.length : null;
    var z = base && recentMax != null && base.sd > 0 ? (recentMax - base.mean) / base.sd : null;
    var pc = base && recentMax != null ? pctile(base.sorted, recentMax) : null;
    var months = []; for (var m2 = 0; m2 < 12; m2++) { var s = stats(monthly[m2] || []); var ty = thisYear[m2] && thisYear[m2].length ? thisYear[m2].reduce(function (a, b) { return a + b; }, 0) / thisYear[m2].length : null; months.push({ m: m2, normal: s ? s.mean : null, ty: ty }); }
    return { base: base, rec7: rec7, recentMax: recentMax, recentMean: recentMean, z: z, pct: pc, months: months, years: YEARS, tz: cl.timezone || '' };
  }
  function readFingerprint(rows, lat, lon) {
    /* Same seven UTC days as the history strand, so both strands count the same passes */
    var cut = new Date(); cut.setUTCDate(cut.getUTCDate() - 6); var cutIso = cut.toISOString().slice(0, 10);
    rows = rows.filter(function (a) { return !a.acq_date || new Date(a.acq_date).toISOString().slice(0, 10) >= cutIso; });
    var near1 = [], near5 = [];
    rows.forEach(function (a) { var d = hav(lat, lon, a.latitude, a.longitude); a._d = d; if (d <= 1) near1.push(a); if (d <= 5) near5.push(a); });
    function days(list) { var s = {}; list.forEach(function (a) { if (a.acq_date) s[new Date(a.acq_date).toISOString().slice(0, 10)] = 1; }); return Object.keys(s).sort(); }
    var night1 = near1.filter(function (a) { return a.daynight === 'N'; }).length;
    var frp = near1.map(function (a) { return +a.frp || 0; }); var frpMean = frp.length ? frp.reduce(function (a, b) { return a + b; }, 0) / frp.length : 0, frpMax = frp.length ? Math.max.apply(null, frp) : 0;
    var spread = 0; if (near1.length > 1) { var cy = near1.reduce(function (s, a) { return s + a.latitude; }, 0) / near1.length, cx = near1.reduce(function (s, a) { return s + a.longitude; }, 0) / near1.length; spread = near1.reduce(function (s, a) { return s + hav(cy, cx, a.latitude, a.longitude); }, 0) / near1.length; }
    var byDay = {}; near1.forEach(function (a) { var k = a.acq_date ? new Date(a.acq_date).toISOString().slice(0, 10) : '?'; byDay[k] = byDay[k] || { d: 0, n: 0 }; byDay[k][a.daynight === 'N' ? 'n' : 'd']++; });
    return { n1: near1.length, n5: near5.length, days1: days(near1), days5: days(near5), night1: night1, nightShare: near1.length ? night1 / near1.length : 0, frpMean: frpMean, frpMax: frpMax, spreadKm: spread, byDay: byDay, all: rows.length };
  }

  /* Seven-day threat history: the three rules applied pass by pass, with recurrence accumulating */
  var TIER = { none: 0, Low: 1, Medium: 2, High: 3, Critical: 4 }, TIER_NAME = ['none', 'Low', 'Medium', 'High', 'Critical'];
  function confPct(c) { if (c == null) return 0; var s = String(c).toLowerCase(); if (s === 'h' || s === 'high') return 90; if (s === 'n' || s === 'nominal') return 65; if (s === 'l' || s === 'low') return 35; var n = parseFloat(s); return isNaN(n) ? 0 : Math.max(0, Math.min(100, n)); }
  function readHistory(rows, lat, lon, dist) {
    var radius = null; [1, 3, 5].some(function (r) { if (rows.some(function (a) { return a._d <= r; })) { radius = r; return true; } return false; });
    var days = []; for (var i = 6; i >= 0; i--) { var d = new Date(); d.setUTCDate(d.getUTCDate() - i); days.push({ date: d.toISOString().slice(0, 10), n: 0, night: 0, frpMax: 0, confMax: 0, cum: 0, tier: 0, risk: 'none' }); }
    var idx = {}; days.forEach(function (o) { idx[o.date] = o; });
    if (radius) rows.forEach(function (a) { if (a._d > radius || !a.acq_date) return; var k = new Date(a.acq_date).toISOString().slice(0, 10), o = idx[k]; if (!o) return; o.n++; if (a.daynight === 'N') o.night++; o.frpMax = Math.max(o.frpMax, +a.frp || 0); o.confMax = Math.max(o.confMax, confPct(a.confidence)); });
    var cum = 0, persistedOn = null, verdictFn = API.verdict;
    days.forEach(function (o) {
      if (o.n) { cum++; o.cum = cum; if (cum === 3 && !persistedOn) persistedOn = o.date; var v = verdictFn ? verdictFn(dist != null ? dist : 999, cum, o.confMax) : null; o.risk = v ? v.risk : 'none'; o.tier = TIER[o.risk] || 0; } else { o.cum = cum; }
    });
    var xs = [], ys = [], cs = []; days.forEach(function (o, i) { xs.push(i); ys.push(o.tier); cs.push(o.n); });
    function slope(y) { var n = y.length, mx = (n - 1) / 2, my = y.reduce(function (a, b) { return a + b; }, 0) / n, num = 0, den = 0; for (var i = 0; i < n; i++) { num += (i - mx) * (y[i] - my); den += (i - mx) * (i - mx); } return den ? num / den : 0; }
    var active = days.filter(function (o) { return o.n; }).length, sT = slope(ys), sC = slope(cs);
    var dir = active === 0 ? 'no activity' : active === 1 ? 'not enough data' : sT >= 0.15 ? 'increasing' : sT <= -0.15 ? 'decreasing' : 'stable';
    var countDir = active <= 1 ? dir : sC >= 0.3 ? 'increasing' : sC <= -0.3 ? 'decreasing' : 'stable';
    var last = null, peak = days[0]; days.forEach(function (o) { if (o.n) last = o; if (o.tier > peak.tier) peak = o; });
    var quietSince = last ? Math.round((Date.now() - new Date(last.date + 'T12:00:00Z')) / 86400000) : null;
    return { radius: radius, days: days, active: active, dir: dir, slope: sT, countDir: countDir, countSlope: sC, last: last, peak: peak, persistedOn: persistedOn, quietSince: quietSince, distKnown: dist != null };
  }

  /* ------------------------------------------------------------------ */
  /* Verdict. Deterministic, printed thresholds.                          */
  /* ------------------------------------------------------------------ */
  function verdict(ctx) {
    var b = ctx.baseline, f = ctx.fp, rec = ctx.rec, season = ctx.season, dist = ctx.dist;
    var why = [], score = 0;
    /* Persistence: live days within 1 km, or the record's own days_seen when live is silent */
    var liveDays = f ? f.days1.length : 0, recDays = rec && rec.days != null ? rec.days : null;
    var persist = Math.max(liveDays, recDays || 0), persistSrc = liveDays >= (recDays || 0) ? 'live feed' : 'the record';
    if (persist >= 3) { score += 35; why.push('Heat has returned on ' + persist + ' separate days within 1 km (' + persistSrc + '). Threshold for persistence: 3 days.'); }
    else if (persist === 2) { score += 15; why.push('Heat seen on 2 separate days within 1 km (' + persistSrc + '). One more day meets the persistence threshold of 3.'); }
    else if (persist === 1) { why.push('A single day of heat within 1 km (' + persistSrc + '). Below the persistence threshold of 3 days.'); }
    else why.push('No fire pixels within 1 km in the last 7 days from the live feed' + (f && f.n5 ? ', though ' + f.n5 + ' within 5 km on ' + f.days5.length + ' ' + (f.days5.length === 1 ? 'day' : 'days') + ': activity nearby, not at this point' : '') + '.');
    /* Night share */
    if (f && f.n1 >= 2) {
      if (f.nightShare >= 0.4) { score += 20; why.push(Math.round(f.nightShare * 100) + '% of nearby pixels come from night passes. Fields are not burnt at night; furnaces and flares run through it. Threshold: 40%.'); }
      else if (f.nightShare > 0) { score += 8; why.push(Math.round(f.nightShare * 100) + '% of nearby pixels are night passes, below the 40% industrial threshold.'); }
      else why.push('All nearby pixels are daytime passes, the pattern of open burning.');
    }
    /* Tightness */
    if (f && f.n1 >= 3) {
      if (f.spreadKm <= 0.5) { score += 15; why.push('Pixels cluster within ' + Math.round(f.spreadKm * 1000) + ' m of each other: a fixed point source. Threshold: 500 m.'); }
      else if (f.spreadKm <= 2) { score += 6; why.push('Pixels spread over about ' + f.spreadKm.toFixed(1) + ' km: a moving or patchy source.'); }
      else why.push('Pixels spread over ' + f.spreadKm.toFixed(1) + ' km: scattered burning, not one source.');
    }
    /* Season */
    var inSeason = null;
    if (season) {
      var d = ctx.date, m = d.getMonth() + 1, dd = d.getDate(), hit = season.windows.filter(function (w) { return inWindow(w, m, dd); });
      if (hit.length) { inSeason = hit[0][4]; why.push('This date falls inside the ' + hit[0][4].toLowerCase() + ' window for ' + cap(season.name) + '. Open burning is expected now.'); }
      else if (season.windows.length) { inSeason = false; score += 15; why.push('Outside every known burning window for ' + cap(season.name) + '. Heat now is not seasonal.'); }
      else why.push('No burning calendar on file for ' + cap(season.name) + '.');
    } else why.push('No regional burning calendar outside India; the season strand is left blank rather than guessed.');
    /* Industry */
    if (dist != null) {
      if (dist <= 3) { score += 15; why.push('A mapped industrial site sits ' + (+dist).toFixed(1) + ' km away. Threshold: 3 km.'); }
      else why.push('Nearest mapped industrial site is ' + (+dist).toFixed(1) + ' km away, beyond the 3 km rule.');
    }
    /* Climate: unusual background heat lowers trust in a lone, low-confidence pixel and is reported as such */
    var heat = 'unknown';
    if (b && b.z != null) {
      if (b.z >= 3) heat = 'extreme'; else if (b.z >= 2) heat = 'unusually hot'; else if (b.z >= 1) heat = 'warm'; else if (b.z <= -1) heat = 'cool'; else heat = 'normal';
      why.push('Background air temperature over the last 7 days peaked at ' + b.recentMax.toFixed(1) + ' °C against a ten-year normal of ' + b.base.mean.toFixed(1) + ' °C for these dates, ' + (b.z >= 0 ? '+' : '') + (b.recentMax - b.base.mean).toFixed(1) + ' °C, the ' + ord(Math.round(b.pct * 100)) + ' percentile: ' + heat + '. Bands: within 1 standard deviation normal, 1 to 2 warm, 2 to 3 unusually hot, above 3 extreme.');
    } else why.push('The climate service did not answer, so the background-heat strand is blank.');
    /* Direction over the last 7 days */
    var h = ctx.history;
    if (h && h.active >= 2) {
      if (h.dir === 'increasing') { score += 10; why.push('Threat level over the last 7 days is increasing (slope +' + h.slope.toFixed(2) + ' levels per day, threshold 0.15). ' + (h.persistedOn ? 'Persistence was reached on ' + pretty(h.persistedOn) + '.' : '')); }
      else if (h.dir === 'decreasing') { score = Math.max(0, score - 5); why.push('Threat level over the last 7 days is decreasing (slope ' + h.slope.toFixed(2) + ' levels per day).' + (h.quietSince >= 1 ? ' Quiet for ' + h.quietSince + ' ' + (h.quietSince === 1 ? 'day' : 'days') + '.' : '')); }
      else why.push('Threat level over the last 7 days is stable (slope ' + (h.slope >= 0 ? '+' : '') + h.slope.toFixed(2) + ' levels per day, within ±0.15).');
    } else if (h && h.active === 1) why.push('Only one active day in the last 7, so no direction can be read yet.');
    score = Math.min(100, score);
    /* Label */
    var label, lede, change;
    var lowConf = rec && rec.conf != null && rec.conf < 50;
    if (persist >= 3 && (f && (f.nightShare >= 0.4 || f.spreadKm <= 0.5) || (dist != null && dist <= 3))) {
      label = 'Abnormal for this location'; lede = 'Heat that has returned on ' + persist + ' days' + (f && f.spreadKm <= 0.5 && f.n1 >= 3 ? ' at one fixed point' : '') + (f && f.nightShare >= 0.4 ? ', through the night' : '') + (dist != null && dist <= 3 ? ', beside a mapped industrial site' : '') + (inSeason === false ? ', outside the burning season' : '') + '. This is not the thermal pattern of the land around it.';
      change = 'If the returns stop for 3 consecutive days, or the pixels spread out and go daytime-only, this drops to Watch.';
    } else if (persist >= 3 && inSeason === false) {
      label = 'Abnormal for this location'; lede = 'Heat has returned on ' + persist + ' days at a time of year when this region does not burn. No mapped industry explains it. It needs a ground check.';
      change = 'A mapped industrial polygon within 3 km would classify it as industrial; entering a burning window would soften it to Watch.';
    } else if (inSeason && persist <= 2 && (!f || f.nightShare < 0.4)) {
      label = 'Expected for this location'; lede = 'Daytime heat, short-lived, inside the ' + inSeason.toLowerCase() + ' window. This is what the region does every year at this time.';
      change = 'Night passes, or the same pixel returning on 3 or more days, would make it abnormal even in season.';
    } else if (persist === 0 && !rec) {
      label = 'No fire signal here'; lede = 'Nothing within 1 km in the last 7 days of VIIRS passes.' + (heat === 'extreme' || heat === 'unusually hot' ? ' The background is running well above its ten-year normal, so a lone weak pixel here would deserve suspicion before a team is sent.' : ' Background heat is ' + heat + ' for these dates.') + (f && f.n5 ? ' The ' + f.n5 + ' pixels within 5 km belong to somewhere else.' : ''); change = 'A pixel within 1 km starts the count; 3 days of returns, night passes or a tight cluster would make it abnormal.';
    } else if (heat === 'extreme' || heat === 'unusually hot') {
      if (persist <= 1 && (lowConf || (f && f.n1 && f.frpMax < 5))) { label = 'Heat, probably not fire'; lede = 'The whole area is running far above its ten-year normal and the only signal is a single weak pixel. Sun-heated ground trips the sensor in weather like this.'; change = 'A second day, a night pass, or a stronger reading would move this to Watch.'; }
      else { label = 'Watch'; lede = 'The background is unusually hot for these dates, which raises false alarms, but the detection itself is not yet persistent.'; change = 'Persistence of 3 days, or night passes, would make it abnormal.'; }
    } else if (persist === 2) {
      label = 'Watch'; lede = 'Two days of heat at the same spot. Normal background, no seasonal explanation' + (dist != null && dist > 3 ? ', no industry within 3 km' : '') + '. One more return makes it abnormal.'; change = 'A third day within 1 km triggers persistence.';
    } else if (persist <= 1) {
      label = 'Not abnormal yet'; lede = 'A single pass, normal background heat' + (inSeason ? ', inside a burning window' : '') + '. Most such pixels never return.'; change = 'Return on 3 days, night passes or a tight cluster would change the reading.';
    } else {
      label = 'Watch'; lede = 'Persistent heat with a mixed signature. Not clearly seasonal, not clearly industrial.'; change = 'Night passes or a mapped industrial site within 3 km would make it abnormal.';
    }
    return { label: label, lede: lede, change: change, why: why, score: score, heat: heat, inSeason: inSeason, persist: persist };
  }
  function cap(s) { return s; }
  function pretty(k) { return k.slice(8) + ' ' + MON[+k.slice(5, 7) - 1]; }
  function ord(n) { var v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][Math.min(n % 10, 4)] || 'th'); }

  /* ------------------------------------------------------------------ */
  /* UI                                                                  */
  /* ------------------------------------------------------------------ */
  var sel = $('#dna-select'), latIn = $('#dna-lat'), lonIn = $('#dna-lon'), status = $('#dna-status'), coordEl = $('#dna-coord'), result = $('#dna-result');
  var cur = null, busy = false, map = null, pin = null;
  function say(m) { status.textContent = m; }
  if (ROWS.length) sel.innerHTML += ROWS.map(function (r, i) { return '<option value="' + i + '">' + r.id + ' · ' + esc(r.region) + ' · ' + esc(r.risk) + '</option>'; }).join('');
  /* Mini map */
  var esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/{svc}/MapServer/tile/{z}/{y}/{x}';
  map = L.map($('#dna-map'), { scrollWheelZoom: false, minZoom: 2, maxZoom: 17, worldCopyJump: true });
  L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Base'), { maxZoom: 16, attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors' }).addTo(map);
  L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Reference'), { maxZoom: 16 }).addTo(map);
  map.fitBounds([[6.5, 68], [36, 97.5]]);
  var dots = L.layerGroup().addTo(map);
  ROWS.forEach(function (r) { var m = L.circleMarker([r.lat, r.lon], { radius: 4, color: 'rgba(4,8,16,.7)', weight: 1, fillColor: (API.colors || {})[r.risk] || '#F08A3C', fillOpacity: 0.9 }); m.bindTooltip(r.id + ' · ' + r.region, { className: 'fw-tip', direction: 'top' }); m.on('click', function () { choose({ lat: r.lat, lon: r.lon, rec: r }); }); dots.addLayer(m); });
  map.on('click', function (e) { choose({ lat: +e.latlng.lat.toFixed(4), lon: +e.latlng.lng.toFixed(4) }); });
  setTimeout(function () { map.invalidateSize(); }, 500);
  function choose(o, run) {
    cur = o; latIn.value = o.lat; lonIn.value = o.lon;
    if (o.rec) sel.value = String(ROWS.indexOf(o.rec)); else sel.value = '';
    coordEl.textContent = (o.rec ? o.rec.id + ' · ' : '') + o.lat.toFixed(4) + ', ' + o.lon.toFixed(4);
    if (pin) pin.remove(); pin = L.marker([o.lat, o.lon], { icon: L.divIcon({ className: 'ev-pin', iconSize: [26, 26], html: '<i></i>' }), interactive: false }).addTo(map);
    map.flyTo([o.lat, o.lon], Math.max(map.getZoom(), 7), { duration: reduced() ? 0 : 0.9 });
    say(o.rec ? 'Ready to read ' + o.rec.id + ', ' + o.rec.region + '.' : 'Ready to read ' + o.lat.toFixed(4) + ', ' + o.lon.toFixed(4) + '.');
    if (run !== false) read();
  }
  sel.addEventListener('change', function () { if (sel.value === '') return; var r = ROWS[+sel.value]; choose({ lat: r.lat, lon: r.lon, rec: r }); });
  $('#dna-run').addEventListener('click', function () { var la = parseFloat(latIn.value), lo = parseFloat(lonIn.value); if (isNaN(la) || isNaN(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) { say('Enter a latitude between -90 and 90 and a longitude between -180 and 180, or pick a record.'); return; } var r = (cur && cur.rec && cur.rec.lat === la && cur.rec.lon === lo) ? cur.rec : null; choose({ lat: la, lon: lo, rec: r }); });
  $('#dna-loc').addEventListener('click', function () {
    if (!navigator.geolocation) { say('This browser will not share a location.'); return; }
    say('Asking your browser for your location.');
    navigator.geolocation.getCurrentPosition(function (p) { choose({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }); }, function (e) { say(e.code === 1 ? 'Location permission was refused. Pick a record or click the map instead.' : 'Location did not arrive. Pick a record or click the map instead.'); }, { timeout: 12000, maximumAge: 300000 });
  });

  function read() {
    if (busy || !cur) return; busy = true;
    var lat = cur.lat, lon = cur.lon, rec = cur.rec || null, date = rec ? rec.date : new Date();
    result.hidden = false; result.classList.add('in'); resetCards();
    say('Reading. Climate baseline, live fire pixels and place name are being fetched.');
    var pClimate = climate(lat, lon).catch(function () { return null; }), pRecent = recent(lat, lon).catch(function () { return null; }), pFires = fires(lat, lon, 12).catch(function () { return null; }), pPlace = rec ? Promise.resolve({ label: rec.region, state: rec.region.split(',')[0], country: /India$/.test(rec.region) ? 'India' : rec.region.split(',').pop().trim() }) : placeName(lat, lon), pInd = rec ? Promise.resolve({ status: 'record', km: rec.dist }) : industryDistance(lat, lon);
    Promise.all([pClimate, pRecent, pFires, pPlace, pInd]).then(function (res) {
      var cl = res[0], rc = res[1], fr = res[2], pl = res[3], ind = res[4];
      var baseline = cl && rc && cl.daily && rc.daily ? readBaseline(cl, rc, date) : null;
      var fp = fr ? readFingerprint(fr, lat, lon) : null;
      var regionLabel = pl ? pl.label : (lat.toFixed(3) + ', ' + lon.toFixed(3));
      var season = seasonsFor(rec ? rec.region : (pl ? (pl.state + ', ' + pl.country) : ''));
      var dist = rec ? rec.dist : (ind && ind.status === 'ok' ? ind.km : null);
      var history = fr ? readHistory(fr.filter(function (a) { return a._d != null; }), lat, lon, dist) : null;
      var v = verdict({ baseline: baseline, fp: fp, rec: rec, season: season, dist: dist, date: date, history: history });
      paintVerdict(v, rec, regionLabel, lat, lon, date);
      paintClimate(baseline, date, v);
      paintFingerprint(fp, rec);
      paintSeason(season, date, rec, dist, regionLabel, v);
      paintStrand(baseline, date);
      paintHistory(history, dist, ind, rec);
      say('Reading complete for ' + regionLabel + '.' + (!cl ? ' The climate service did not answer.' : '') + (!fr ? ' The live fire feed did not answer.' : '') + (ind && ind.status === 'failed' ? ' The OpenStreetMap lookup did not answer, so industry distance is unknown here.' : ''));
      busy = false;
      setTimeout(function () { var target = location.hash === '#dna-history' ? $('#dna-history') : $('#dna-verdict'); target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }, 80);
    }).catch(function () { say('Something failed while reading. Try again in a moment.'); busy = false; });
  }
  function resetCards() { var hb = $('#h-trend'); if (hb) { hb.className = 'trend-badge mono'; hb.querySelector('span').textContent = 'reading'; } ['h-kv', 'h-chart', 'h-days'].forEach(function (k) { var e = $('#' + k); if (e) e.innerHTML = ''; }); var hn = $('#h-note'); if (hn) hn.textContent = ''; ['c1', 'c2', 'c3'].forEach(function (k) { $('#' + k + '-tag').textContent = 'reading'; $('#' + k + '-tag').style.setProperty('--tc', 'var(--text-secondary)'); $('#' + k + '-kv').innerHTML = ''; $('#' + k + '-note').textContent = ''; }); $('#c1-gauge').innerHTML = ''; $('#c2-strip').innerHTML = ''; $('#c3-season').innerHTML = ''; $('#dna-chart').innerHTML = ''; $('#dv-title').textContent = 'Reading'; $('#dv-lede').textContent = ''; $('#dv-why').innerHTML = ''; $('#dv-bar-fill').style.width = '0%'; $('#dv-index').textContent = '0'; }
  function kv(pairs) { return pairs.map(function (p) { return '<div><dt>' + p[0] + '</dt><dd>' + p[1] + '</dd></div>'; }).join(''); }
  var COL = { 'Abnormal for this location': 'var(--risk-critical)', 'Watch': 'var(--risk-medium)', 'Expected for this location': 'var(--risk-low)', 'Not abnormal yet': 'var(--text-secondary)', 'Heat, probably not fire': 'var(--type-agri)', 'No fire signal here': 'var(--text-secondary)' };
  function paintVerdict(v, rec, place, lat, lon, date) {
    $('#dv-title').textContent = v.label; $('#dv-lede').textContent = v.lede; $('#dv-change').textContent = v.change;
    $('#dv-why').innerHTML = v.why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('');
    var fill = $('#dv-bar-fill'); fill.style.background = COL[v.label] || 'var(--accent)'; requestAnimationFrame(function () { fill.style.width = v.score + '%'; });
    $('#dv-index').textContent = v.score; $('#dna-verdict').style.setProperty('--vc', COL[v.label] || 'var(--accent)');
    var ev = $('#dv-evidence'); ev.onclick = function () { if (window.FW_EVIDENCE) FW_EVIDENCE.open({ id: rec ? rec.id : 'Thermal DNA point', place: place, lat: lat, lon: lon, date: date, type: rec ? rec.type : '', risk: rec ? rec.risk : v.label, conf: rec ? rec.conf : null, dist: rec ? rec.dist : null, days: rec ? rec.days : null, source: rec ? rec.source : 'Chosen on the Thermal DNA page' }); };
    $('#dv-dash').href = rec ? 'dashboard.html#queue' : 'dashboard.html';
    var nv = $('#dv-nav'); if (nv) nv.href = 'respond.html?' + (rec ? 'id=' + rec.id : 'lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5));
    var sb = $('#dv-sos'); if (sb) { var show = !!rec && (rec.risk === 'Critical' || rec.risk === 'High' || v.label === 'Abnormal for this location'); sb.hidden = !show; sb.onclick = function () { if (window.FW_SOS && rec) FW_SOS.open(rec); }; }
  }
  function paintClimate(b, date, v) {
    var tag = $('#c1-tag');
    if (!b || !b.base) { tag.textContent = 'no answer'; $('#c1-kv').innerHTML = kv([['Baseline', 'The climate service did not answer']]); return; }
    tag.textContent = v.heat; tag.style.setProperty('--tc', v.heat === 'extreme' ? 'var(--risk-critical)' : v.heat === 'unusually hot' ? 'var(--risk-high)' : v.heat === 'warm' ? 'var(--risk-medium)' : 'var(--risk-low)');
    $('#c1-kv').innerHTML = kv([
      ['Normal max, these dates', b.base.mean.toFixed(1) + ' °C ± ' + b.base.sd.toFixed(1)],
      ['Ten-year range', b.base.min.toFixed(1) + ' to ' + b.base.max.toFixed(1) + ' °C'],
      ['Recent 7-day peak', (b.recentMax != null ? b.recentMax.toFixed(1) + ' °C' : 'n/a')],
      ['Difference', (b.recentMax != null ? ((b.recentMax - b.base.mean) >= 0 ? '+' : '') + (b.recentMax - b.base.mean).toFixed(1) + ' °C, z ' + b.z.toFixed(2) : 'n/a')],
      ['Percentile', b.pct != null ? ord(Math.round(b.pct * 100)) + ' of ' + b.base.n + ' days' : 'n/a']
    ]);
    /* Gauge: distribution band with marker */
    var lo = b.base.min, hi = b.base.max, span = Math.max(0.1, hi - lo), pos = function (x) { return Math.min(100, Math.max(0, (x - lo) / span * 100)); };
    $('#c1-gauge').innerHTML = '<div class="g-track"><i class="g-band" style="left:' + pos(b.base.p10) + '%;width:' + (pos(b.base.p90) - pos(b.base.p10)) + '%"></i><i class="g-mid" style="left:' + pos(b.base.p50) + '%"></i>' + (b.recentMax != null ? '<b class="g-now" style="left:' + pos(b.recentMax) + '%"><span>now ' + b.recentMax.toFixed(1) + '°</span></b>' : '') + '</div><div class="g-axis mono"><span>' + lo.toFixed(0) + '°</span><span>10th to 90th percentile band, median tick</span><span>' + hi.toFixed(0) + '°</span></div>';
    $('#c1-note').textContent = 'ERA5 two-metre air temperature, ' + b.years + ' years, window ±' + WINDOW + ' days around ' + String(date.getDate()).padStart(2, '0') + ' ' + MON[date.getMonth()] + '. Time zone ' + b.tz + '.';
  }
  function paintFingerprint(f, rec) {
    var tag = $('#c2-tag');
    if (!f) { tag.textContent = 'no answer'; $('#c2-kv').innerHTML = kv([['Live feed', 'did not answer']] .concat(rec ? [['Record says', rec.days + ' distinct days, ' + rec.conf + '% confidence']] : [])); return; }
    var kind = f.n1 === 0 ? 'quiet' : f.days1.length >= 3 && (f.nightShare >= 0.4 || f.spreadKm <= 0.5) ? 'fixed source' : f.days1.length >= 3 ? 'persistent' : f.nightShare >= 0.4 ? 'night heat' : 'open burning';
    tag.textContent = kind; tag.style.setProperty('--tc', kind === 'fixed source' ? 'var(--risk-critical)' : kind === 'persistent' || kind === 'night heat' ? 'var(--risk-high)' : kind === 'open burning' ? 'var(--type-agri)' : 'var(--text-secondary)');
    var pairs = [
      ['Pixels within 1 km, 7 days', f.n1 + ' on ' + f.days1.length + ' ' + (f.days1.length === 1 ? 'day' : 'days')],
      ['Pixels within 5 km', f.n5 + ' on ' + f.days5.length + ' ' + (f.days5.length === 1 ? 'day' : 'days')],
      ['Night passes, 1 km', f.n1 ? f.night1 + ' of ' + f.n1 + ' (' + Math.round(f.nightShare * 100) + '%)' : 'none'],
      ['Radiative power, 1 km', f.n1 ? 'mean ' + f.frpMean.toFixed(1) + ' MW, max ' + f.frpMax.toFixed(1) + ' MW' : 'none'],
      ['Cluster spread', f.n1 > 1 ? Math.round(f.spreadKm * 1000) + ' m' : 'n/a']
    ];
    if (rec) pairs.push(['Record says', rec.days + ' distinct days, ' + rec.dist.toFixed(1) + ' km to industry, ' + rec.conf + '% confidence']);
    $('#c2-kv').innerHTML = kv(pairs);
    /* 7-day strip */
    var days = []; for (var i = 6; i >= 0; i--) { var d = new Date(); d.setUTCDate(d.getUTCDate() - i); days.push(d.toISOString().slice(0, 10)); }
    var mx = 1; days.forEach(function (k) { var o = f.byDay[k]; if (o) mx = Math.max(mx, o.d + o.n); });
    $('#c2-strip').innerHTML = days.map(function (k) { var o = f.byDay[k] || { d: 0, n: 0 }; var t = o.d + o.n; return '<div class="s-day" title="' + k + ': ' + o.d + ' day, ' + o.n + ' night"><div class="s-col"><i class="s-n" style="height:' + (o.n / mx * 100) + '%"></i><i class="s-d" style="height:' + (o.d / mx * 100) + '%"></i></div><span class="mono">' + (t || '') + '</span><small class="mono">' + k.slice(8) + ' ' + MON[+k.slice(5, 7) - 1] + '</small></div>'; }).join('') + '<div class="s-key mono"><span><i class="s-d"></i>day</span><span><i class="s-n"></i>night</span></div>';
    $('#c2-note').textContent = 'Live VIIRS 375 m detections from NASA, last 7 days, ' + f.all + ' in the 12 km search box.';
  }
  function paintSeason(season, date, rec, dist, place, v) {
    var tag = $('#c3-tag'); var m = date.getMonth() + 1, dd = date.getDate();
    var pairs = [['Place', esc(place)], ['Date judged', String(dd).padStart(2, '0') + ' ' + MON[m - 1] + ' ' + date.getFullYear()]];
    if (dist != null) pairs.push(['Nearest mapped industry', (+dist).toFixed(1) + ' km' + (dist <= 3 ? ', inside the 3 km rule' : '') + (rec ? '' : ' (OpenStreetMap, 30 km search)')]); else if (!rec) pairs.push(['Nearest mapped industry', 'unknown, the OpenStreetMap lookup did not answer or found nothing within 30 km']);
    if (rec) pairs.push(['Feed classification', esc(rec.type) + ', ' + esc(rec.risk)]);
    if (season && season.windows.length) {
      var hit = season.windows.filter(function (w) { return inWindow(w, m, dd); });
      tag.textContent = hit.length ? 'in season' : 'off season'; tag.style.setProperty('--tc', hit.length ? 'var(--type-agri)' : 'var(--risk-high)');
      pairs.push(['Burning calendar', cap(season.name)]);
      season.windows.forEach(function (w) { pairs.push([w[4], String(w[1]).padStart(2, '0') + ' ' + MON[w[0] - 1] + ' to ' + String(w[3]).padStart(2, '0') + ' ' + MON[w[2] - 1]]); });
      $('#c3-note').textContent = hit.length ? 'Inside the ' + hit[0][4].toLowerCase() + ' window. Open burning here now is the regional norm.' : 'No window covers this date. Sustained heat here now is not what the season produces.';
    } else { tag.textContent = season ? 'no calendar' : 'outside India'; tag.style.setProperty('--tc', 'var(--text-secondary)'); pairs.push(['Burning calendar', season ? 'none on file for ' + cap(season.name) : 'not available outside India']); $('#c3-note').textContent = 'The season strand does not vote when no calendar exists.'; }
    $('#c3-kv').innerHTML = kv(pairs);
    /* 12-month calendar strip */
    var cells = ''; for (var mm = 1; mm <= 12; mm++) { var on = season && season.windows.some(function (w) { return inWindow(w, mm, 15) || inWindow(w, mm, 1) || inWindow(w, mm, 28); }); cells += '<div class="sc' + (on ? ' on' : '') + (mm === m ? ' now' : '') + '"><span class="mono">' + MON[mm - 1] + '</span></div>'; }
    $('#c3-season').innerHTML = cells;
  }
  function paintStrand(b, date) {
    var el = $('#dna-chart'), cap = $('#strand-cap'), tb = $('#dna-table tbody'); if (!b) { el.innerHTML = '<div class="qempty">The climate service did not answer, so the strand cannot be drawn.</div>'; cap.textContent = ''; return; }
    var W = 960, H = 260, P = { l: 44, r: 16, t: 18, b: 34 }, vals = []; b.months.forEach(function (o) { if (o.normal != null) vals.push(o.normal); if (o.ty != null) vals.push(o.ty); }); if (b.recentMax != null) vals.push(b.recentMax);
    var lo = Math.floor(Math.min.apply(null, vals) - 3), hi = Math.ceil(Math.max.apply(null, vals) + 3), y = function (v) { return P.t + (hi - v) / (hi - lo) * (H - P.t - P.b); }, x = function (i) { return P.l + (i + 0.5) * (W - P.l - P.r) / 12; }, bw = (W - P.l - P.r) / 12 * 0.42;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">';
    for (var g = lo; g <= hi; g += 5) s += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(g) + '" y2="' + y(g) + '" class="grid"/><text x="' + (P.l - 8) + '" y="' + (y(g) + 4) + '" class="ax" text-anchor="end">' + g + '°</text>';
    var pathN = '', pathT = '';
    b.months.forEach(function (o, i) {
      if (o.normal != null) { s += '<rect x="' + (x(i) - bw / 2) + '" y="' + y(o.normal) + '" width="' + bw + '" height="' + (H - P.b - y(o.normal)) + '" rx="3" class="bar' + (i === date.getMonth() ? ' now' : '') + '"><title>' + MON[i] + ': normal ' + o.normal.toFixed(1) + ' °C</title></rect>'; pathN += (pathN ? 'L' : 'M') + x(i) + ',' + y(o.normal); }
      if (o.ty != null) { pathT += (pathT ? 'L' : 'M') + x(i) + ',' + y(o.ty); s += '<circle cx="' + x(i) + '" cy="' + y(o.ty) + '" r="4.5" class="pt"><title>' + MON[i] + ' ' + new Date().getFullYear() + ': ' + o.ty.toFixed(1) + ' °C</title></circle>'; }
      s += '<text x="' + x(i) + '" y="' + (H - 12) + '" class="ax" text-anchor="middle">' + MON[i] + '</text>';
    });
    s += '<path d="' + pathT + '" class="ty"/>';
    if (b.recentMax != null) { var xi = x(date.getMonth()); s += '<line x1="' + (xi - bw) + '" x2="' + (xi + bw) + '" y1="' + y(b.recentMax) + '" y2="' + y(b.recentMax) + '" class="rec"/><text x="' + (xi + bw + 6) + '" y="' + (y(b.recentMax) + 4) + '" class="ax rec-l">7-day peak ' + b.recentMax.toFixed(1) + '°</text>'; }
    s += '</svg>';
    el.innerHTML = s;
    cap.textContent = 'Ten-year monthly normal of the daily maximum, this year overlaid';
    tb.innerHTML = b.months.map(function (o, i) { return '<tr><td>' + MON[i] + '</td><td>' + (o.normal != null ? o.normal.toFixed(1) : '') + '</td><td>' + (o.ty != null ? o.ty.toFixed(1) : '') + '</td><td>' + (o.normal != null && o.ty != null ? ((o.ty - o.normal) >= 0 ? '+' : '') + (o.ty - o.normal).toFixed(1) : '') + '</td></tr>'; }).join('');
  }

  var TCOL = { none: 'var(--line-strong)', Low: 'var(--risk-low)', Medium: 'var(--risk-medium)', High: 'var(--risk-high)', Critical: 'var(--risk-critical)' };
  function paintHistory(h, dist, ind, rec) {
    var badge = $('#h-trend'), kvEl = $('#h-kv'), chart = $('#h-chart'), daysEl = $('#h-days'), note = $('#h-note'), tb = $('#h-table tbody'); if (!badge) return;
    if (!h) { badge.className = 'trend-badge mono off'; badge.querySelector('span').textContent = 'feed did not answer'; kvEl.innerHTML = kv([['Live feed', 'did not answer, no history can be drawn']]); return; }
    var dirCls = h.dir === 'increasing' ? 'up' : h.dir === 'decreasing' ? 'down' : h.dir === 'stable' ? 'flat' : 'off';
    badge.className = 'trend-badge mono ' + dirCls; badge.querySelector('span').textContent = h.dir;
    var pairs = [
      ['Site radius used', h.radius ? h.radius + ' km' + (h.radius === 1 ? ', the same pixel footprint' : ', widened because 1 km was quiet') : 'no passes within 5 km'],
      ['Active days of 7', h.active],
      ['Current level', h.last ? h.last.risk + ' as of ' + pretty(h.last.date) + (h.quietSince >= 1 ? ', quiet since' : '') : 'none'],
      ['Peak level', h.peak.tier ? h.peak.risk + ' on ' + pretty(h.peak.date) : 'none'],
      ['Persistence reached', h.persistedOn ? pretty(h.persistedOn) + ' (third distinct day)' : 'not in this window'],
      ['Direction of level', h.dir + (h.active >= 2 ? ' (' + (h.slope >= 0 ? '+' : '') + h.slope.toFixed(2) + ' per day)' : '')],
      ['Direction of pass count', h.countDir + (h.active >= 2 ? ' (' + (h.countSlope >= 0 ? '+' : '') + h.countSlope.toFixed(2) + ' per day)' : '')],
      ['Industry distance used', dist != null ? (+dist).toFixed(1) + ' km' : 'unknown, scored without the proximity rule']
    ];
    if (rec) pairs.push(['Record says', rec.days + ' distinct ' + (rec.days === 1 ? 'day' : 'days') + ' over its own window, ' + rec.risk + (h.active ? '' : '. The live feed shows no pass here in the last 7 days, so the chart stays empty rather than borrowing the record')]);
    kvEl.innerHTML = kv(pairs);
    /* Step chart: tier line over 7 days with pass bars beneath */
    var W = 700, H = 170, P = { l: 58, r: 16, t: 14, b: 30 }, n = h.days.length, cw = (W - P.l - P.r) / n, mx = Math.max(1, Math.max.apply(null, h.days.map(function (o) { return o.n; })));
    var yT = function (t) { return P.t + (4 - t) / 4 * (H - P.t - P.b - 34); }, yB = H - P.b, x = function (i) { return P.l + i * cw; };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">';
    for (var t = 0; t <= 4; t++) svg += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + yT(t) + '" y2="' + yT(t) + '" class="grid"/><text x="' + (P.l - 8) + '" y="' + (yT(t) + 4) + '" class="ax" text-anchor="end">' + TIER_NAME[t] + '</text>';
    var path = '';
    h.days.forEach(function (o, i) {
      var bh = o.n / mx * 26; svg += '<rect x="' + (x(i) + cw * 0.3) + '" y="' + (yB - bh) + '" width="' + (cw * 0.4) + '" height="' + bh + '" rx="2" class="cnt"><title>' + o.date + ': ' + o.n + ' passes</title></rect>';
      if (o.n) { svg += '<circle cx="' + (x(i) + cw / 2) + '" cy="' + yT(o.tier) + '" r="6" style="fill:' + TCOL[o.risk] + '" class="tp"><title>' + o.date + ': ' + o.risk + '</title></circle>'; path += (path ? 'L' : 'M') + (x(i) + cw / 2) + ',' + yT(o.tier); }
      svg += '<text x="' + (x(i) + cw / 2) + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + pretty(o.date) + '</text>';
    });
    svg += '<path d="' + path + '" class="tl"/></svg>';
    chart.innerHTML = svg;
    daysEl.innerHTML = h.days.map(function (o) { return '<div class="hd' + (o.n ? ' on' : '') + '" style="--tc:' + TCOL[o.risk] + '"><span class="mono d">' + pretty(o.date) + '</span><b>' + (o.n ? o.risk : 'quiet') + '</b><span class="mono m">' + (o.n ? o.n + (o.n === 1 ? ' pass' : ' passes') + (o.night ? ', ' + o.night + ' night' : '') + ' · ' + o.frpMax.toFixed(0) + ' MW · seen ' + o.cum + 'd' : 'no pass within ' + (h.radius || 5) + ' km') + '</span></div>'; }).join('');
    note.textContent = 'Level per day = FireWatch rules on that day\'s best pass: proximity ' + (dist != null ? ((+dist) <= 3 ? 'holds' : 'fails') + ' at ' + (+dist).toFixed(1) + ' km' : 'unknown') + ', recurrence = distinct days seen so far in the window, confidence from VIIRS l/n/h read as 35/65/90. Direction = least-squares slope of the daily level; ±0.15 per day is the stable band. Quiet days score none but keep the recurrence count.';
    tb.innerHTML = h.days.map(function (o) { return '<tr><td>' + o.date + '</td><td>' + o.n + '</td><td>' + o.night + '</td><td>' + (o.n ? o.frpMax.toFixed(1) + ' MW' : '') + '</td><td>' + (o.n ? o.confMax + '%' : '') + '</td><td>' + o.cum + '</td><td>' + (o.n ? o.risk : 'quiet') + '</td></tr>'; }).join('');
  }

  /* Deep link: ?id=FW-0009 or ?lat=..&lon=.. */
  var qs = new URLSearchParams(location.search), qid = qs.get('id'), qlat = parseFloat(qs.get('lat')), qlon = parseFloat(qs.get('lon'));
  if (qid) { var r0 = ROWS.filter(function (r) { return r.id === qid; })[0]; if (r0) setTimeout(function () { choose({ lat: r0.lat, lon: r0.lon, rec: r0 }); }, 400); }
  else if (!isNaN(qlat) && !isNaN(qlon)) setTimeout(function () { choose({ lat: qlat, lon: qlon }); }, 400);

  window.FW_THERMAL = { read: function (o) { choose(o); }, verdict: verdict, seasonsFor: seasonsFor };
})();
