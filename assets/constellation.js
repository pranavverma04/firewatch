/* FireWatch constellation. Eight satellites, one evidence engine, no keys and no server of our own.
   Polar orbiters (VIIRS on Suomi NPP, NOAA-20, NOAA-21; MODIS on Terra and Aqua) come from the NASA FIRMS
   feed on the Esri Living Atlas. Sentinel-3A/3B SLSTR fire radiative power, the Meteosat-9 Indian Ocean
   fire product (every 15 min) and the MTG-I1 FCI fire radiative power (every 10 min) come from EUMETSAT
   EUMETView. Geostationary layers are images, so fire pixels are read straight off the PNG on a canvas.
   Every check is written down with the weight it carries, so an officer can defend the number. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ESRI = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/';
  var VIIRS_URL = ESRI + 'Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
  var MODIS_URL = ESRI + 'MODIS_Thermal_v1/FeatureServer/1/query';
  var EUM = 'https://view.eumetsat.int/geoserver/ows';
  var METEO = 'https://api.open-meteo.com/v1/forecast';
  var MIN = 60000, HOUR = 3600000;

  /* ------------------------------------------------------------------ */
  /* The constellation                                                   */
  /* ------------------------------------------------------------------ */
  var SOURCES = [
    { id: 'n21', name: 'NOAA-21', inst: 'VIIRS', fam: 'VIIRS', kind: 'polar', res: '375 m', every: '2 passes a day', op: 'NOAA / NASA', key: 'N21', color: '#FFB15C', lr: { high: 6, nominal: 3.5, low: 1.6 } },
    { id: 'n20', name: 'NOAA-20', inst: 'VIIRS', fam: 'VIIRS', kind: 'polar', res: '375 m', every: '2 passes a day', op: 'NOAA / NASA', key: 'N20', color: '#F59A45', lr: { high: 6, nominal: 3.5, low: 1.6 } },
    { id: 'snpp', name: 'Suomi NPP', inst: 'VIIRS', fam: 'VIIRS', kind: 'polar', res: '375 m', every: '2 passes a day', op: 'NOAA / NASA', key: 'N', color: '#E2733B', lr: { high: 6, nominal: 3.5, low: 1.6 } },
    { id: 'terra', name: 'Terra', inst: 'MODIS', fam: 'MODIS', kind: 'polar', res: '1 km', every: '2 passes a day', op: 'NASA', key: 'T', color: '#5A9BD8' },
    { id: 'aqua', name: 'Aqua', inst: 'MODIS', fam: 'MODIS', kind: 'polar', res: '1 km', every: '2 passes a day', op: 'NASA', key: 'A', color: '#7FB6E8' },
    { id: 's3', name: 'Sentinel-3A / 3B', inst: 'SLSTR', fam: 'SLSTR', kind: 'polar', res: '1 km', every: '2 to 4 passes a day', op: 'ESA / EUMETSAT', layers: ['copernicus:sentinel3a_slstr_level2_frp', 'copernicus:sentinel3b_slstr_level2_frp'], color: '#B48CF0', lr: 4 },
    { id: 'msg', name: 'Meteosat-9 (45.5° E)', inst: 'SEVIRI', fam: 'SEVIRI', kind: 'geo', res: '3 to 5 km', every: 'every 15 min', op: 'EUMETSAT', layer: 'msg_iodc:fire', step: 15, lon: 45.5, color: '#4FA97F', lr: { fire: 5, possible: 2 } },
    { id: 'mtg', name: 'MTG-I1 (0°)', inst: 'FCI', fam: 'FCI', kind: 'geo', res: '2 km', every: 'every 10 min', op: 'EUMETSAT', layer: 'mtg_fd:frp', step: 10, lon: 0, color: '#6FD0B0', lr: { fire: 5, possible: 2 } }
  ];
  var BY = {}; SOURCES.forEach(function (s) { BY[s.id] = s; });
  var VIIRS_KEY = { N: 'snpp', N20: 'n20', N21: 'n21' }, MODIS_KEY = { T: 'terra', A: 'aqua' };

  /* Disk coverage of a geostationary satellite: usable while the view angle stays under about 70 degrees */
  function geoCovers(src, lat, lon) {
    var p = Math.PI / 180, dl = Math.abs(((lon - src.lon + 540) % 360) - 180);
    var c = Math.cos(lat * p) * Math.cos(dl * p);
    return c > 0.34; /* great-circle angle from the sub-satellite point under about 70 degrees */
  }

  /* ------------------------------------------------------------------ */
  /* Network helpers                                                     */
  /* ------------------------------------------------------------------ */
  function get(url, ms, as) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 15000);
    return fetch(url, { signal: ctl.signal }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return as === 'blob' ? r.blob() : as === 'text' ? r.text() : r.json();
    }).finally(function () { clearTimeout(t); });
  }
  /* A small pool so a check never fires thirty requests at once */
  var active = 0, waiting = [];
  function pooled(fn) {
    return new Promise(function (res, rej) {
      function run() { active++; fn().then(res, rej).finally(function () { active--; if (waiting.length) waiting.shift()(); }); }
      if (active < 6) run(); else waiting.push(run);
    });
  }
  function hav(a, b, c, d) {
    var R = 6371, p = Math.PI / 180, dLat = (c - a) * p, dLon = (d - b) * p;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function box(lat, lon, km) {
    var dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
  }
  function isoMin(t) { var d = new Date(t); d.setUTCSeconds(0, 0); return d.toISOString().replace('.000Z', 'Z'); }
  function ago(ms) {
    if (ms == null || !isFinite(ms)) return 'unknown';
    var m = Math.max(0, Math.round(ms / MIN));
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    if (h < 48) return h + ' h' + (r ? ' ' + String(r).padStart(2, '0') + ' min' : '');
    return Math.round(h / 24) + ' days';
  }
  function stamp(t) { var d = new Date(t); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC, ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]; }

  /* ------------------------------------------------------------------ */
  /* Polar orbiters: VIIRS and MODIS points from FIRMS                   */
  /* ------------------------------------------------------------------ */
  function esriQuery(url, b, fields, extra) {
    var u = url + '?where=' + encodeURIComponent((extra && extra.where) || '1=1') + '&geometry=' + b.map(function (v) { return v.toFixed(4); }).join(',') +
      '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=' + fields +
      '&returnGeometry=true&outSR=4326&resultRecordCount=' + ((extra && extra.n) || 2000) + '&f=json';
    return pooled(function () { return get(u, 16000); }).then(function (j) {
      if (j.error) throw new Error(j.error.message || 'query error');
      return { list: (j.features || []).map(function (f) { var a = f.attributes || {}; a._lat = f.geometry ? f.geometry.y : a.latitude; a._lon = f.geometry ? f.geometry.x : a.longitude; return a; }), capped: !!j.exceededTransferLimit };
    });
  }
  function viirsIn(b, n) {
    return esriQuery(VIIRS_URL, b, 'latitude,longitude,confidence,frp,acq_time,satellite,daynight', { n: n }).then(function (r) {
      r.list = r.list.map(function (a) { return { src: VIIRS_KEY[a.satellite] || 'n20', lat: a._lat, lon: a._lon, t: a.acq_time, conf: String(a.confidence || '').toLowerCase(), frp: a.frp, night: a.daynight === 'N' }; });
      return r;
    });
  }
  function modisIn(b, n) {
    return esriQuery(MODIS_URL, b, 'CONFIDENCE,FRP,ACQ_DATE,SATELLITE,DAYNIGHT', { n: n }).then(function (r) {
      r.list = r.list.map(function (a) { var c = +a.CONFIDENCE; return { src: MODIS_KEY[a.SATELLITE] || 'terra', lat: a._lat, lon: a._lon, t: a.ACQ_DATE, conf: c >= 80 ? 'high' : c >= 50 ? 'nominal' : 'low', confN: c, frp: a.FRP, night: a.DAYNIGHT === 'N' }; });
      return r;
    });
  }

  /* ------------------------------------------------------------------ */
  /* EUMETSAT rasters read off a canvas                                  */
  /* ------------------------------------------------------------------ */
  /* b = [west, south, east, north]; deg = degrees per pixel (0.02 is about 2 km) */
  function rasterHits(layer, b, time, deg) {
    deg = deg || 0.02;
    var w = Math.max(4, Math.min(1400, Math.round((b[2] - b[0]) / deg))), h = Math.max(4, Math.min(1400, Math.round((b[3] - b[1]) / deg)));
    var u = EUM + '?service=WMS&version=1.3.0&request=GetMap&layers=' + layer + '&styles=&crs=CRS:84&bbox=' + b.map(function (v) { return v.toFixed(4); }).join(',') +
      '&width=' + w + '&height=' + h + '&format=image/png&transparent=true' + (time ? '&time=' + isoMin(time) : '');
    return pooled(function () { return get(u, 20000, 'blob'); }).then(function (blob) {
      if (!/image/.test(blob.type)) throw new Error('not an image');
      return createImageBitmap(blob);
    }).then(function (bmp) {
      var c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
      var d = g.getImageData(0, 0, c.width, c.height).data, out = [];
      var dx = (b[2] - b[0]) / c.width, dy = (b[3] - b[1]) / c.height;
      for (var y = 0; y < c.height; y++) for (var x = 0; x < c.width; x++) {
        var i = (y * c.width + x) * 4; if (d[i + 3] < 90) continue;
        var r = d[i], gg = d[i + 1], bl = d[i + 2];
        if (r < 150 || bl > 140) continue; /* fire products are drawn in yellow to red only */
        out.push({ lat: b[3] - (y + 0.5) * dy, lon: b[0] + (x + 0.5) * dx, cls: gg > 170 ? 'possible' : 'fire', a: d[i + 3] });
      }
      return out;
    });
  }
  /* Newest time step per EUMETSAT layer, from the capabilities document. Cached for ten minutes. */
  var capsP = null, capsAt = 0;
  function eumTimes() {
    if (capsP && Date.now() - capsAt < 10 * MIN) return capsP;
    capsAt = Date.now();
    capsP = get(EUM + '?service=WMS&request=GetCapabilities&version=1.3.0', 30000, 'text').then(function (x) {
      var want = ['msg_iodc:fire', 'mtg_fd:frp', 'msg_iodc:clm', 'copernicus:sentinel3a_slstr_level2_frp', 'copernicus:sentinel3b_slstr_level2_frp'], out = {};
      want.forEach(function (n) {
        var i = x.indexOf('<Name>' + n + '</Name>'); if (i < 0) return;
        var m = /<Dimension name="time" default="([^"]+)"/.exec(x.slice(i, i + 4000)); if (m) out[n] = Date.parse(m[1]);
      });
      return out;
    }).catch(function () { capsP = null; return {}; });
    return capsP;
  }
  /* Geostationary look-back: newest slot and the slots before it */
  function geoSlots(src, newest, hours) {
    var n = Math.round(hours * 60 / src.step), every = src.id === 'mtg' ? 2 : 1, out = [];
    for (var k = 0; k < n; k += every) out.push(newest - k * src.step * MIN);
    return out;
  }
  /* Cloud over a point: Meteosat-9 cloud mask where it reaches, Open-Meteo everywhere */
  function cloudAt(lat, lon, times) {
    var mask = Promise.resolve(null);
    if (geoCovers(BY.msg, lat, lon) && times['msg_iodc:clm']) {
      var b = box(lat, lon, 4), u = EUM + '?service=WMS&version=1.3.0&request=GetFeatureInfo&layers=msg_iodc:clm&query_layers=msg_iodc:clm&styles=&crs=CRS:84&bbox=' + b.map(function (v) { return v.toFixed(4); }).join(',') + '&width=9&height=9&i=4&j=4&info_format=application/json&time=' + isoMin(times['msg_iodc:clm']);
      mask = pooled(function () { return get(u, 12000); }).then(function (j) {
        var p = j.features && j.features[0] && j.features[0].properties; if (!p) return null;
        var r = p.RED_BAND, g = p.GREEN_BAND, bl = p.BLUE_BAND;
        if (r > 200 && g > 200 && bl > 200) return 'cloudy';
        if (g > 150 && r < 60) return 'clear land';
        if (bl > 150 && r < 60) return 'clear water';
        return null;
      }).catch(function () { return null; });
    }
    var meteo = pooled(function () { return get(METEO + '?latitude=' + lat.toFixed(3) + '&longitude=' + lon.toFixed(3) + '&current=cloud_cover&hourly=cloud_cover&past_hours=6&forecast_hours=1&timezone=UTC', 12000); })
      .then(function (j) { var h = (j.hourly && j.hourly.cloud_cover) || []; return { now: j.current ? j.current.cloud_cover : null, past: h.length ? Math.round(h.reduce(function (a, b) { return a + (b || 0); }, 0) / h.length) : null }; })
      .catch(function () { return null; });
    return Promise.all([mask, meteo]).then(function (r) { return { mask: r[0], meteo: r[1] }; });
  }

  /* ------------------------------------------------------------------ */
  /* Newest data per satellite                                           */
  /* ------------------------------------------------------------------ */
  function stat(url, field, group) {
    var s = encodeURIComponent(JSON.stringify([{ statisticType: 'max', onStatisticField: field, outStatisticFieldName: 'mx' }, { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]));
    return get(url + '?where=1%3D1&outStatistics=' + s + '&groupByFieldsForStatistics=' + group + '&f=json', 20000).then(function (j) {
      var o = {}; (j.features || []).forEach(function (f) { o[f.attributes[group]] = { t: f.attributes.mx, n: f.attributes.n }; }); return o;
    });
  }
  var freshP = null, freshAt = 0;
  function freshness() {
    if (freshP && Date.now() - freshAt < 5 * MIN) return freshP;
    freshAt = Date.now();
    freshP = Promise.all([
      stat(VIIRS_URL, 'acq_time', 'satellite').catch(function () { return {}; }),
      stat(ESRI + 'MODIS_Thermal_v1/FeatureServer/0/query', 'ACQ_DATE', 'SATELLITE').catch(function () { return {}; }),
      eumTimes()
    ]).then(function (r) {
      var v = r[0], m = r[1], e = r[2], now = Date.now(), out = {};
      Object.keys(VIIRS_KEY).forEach(function (k) { if (v[k]) out[VIIRS_KEY[k]] = { t: v[k].t, n: v[k].n }; });
      Object.keys(MODIS_KEY).forEach(function (k) { if (m[k]) out[MODIS_KEY[k]] = { t: m[k].t, n: m[k].n }; });
      var s3 = Math.max(e['copernicus:sentinel3a_slstr_level2_frp'] || 0, e['copernicus:sentinel3b_slstr_level2_frp'] || 0); if (s3) out.s3 = { t: s3 };
      if (e['msg_iodc:fire']) out.msg = { t: e['msg_iodc:fire'] };
      if (e['mtg_fd:frp']) out.mtg = { t: e['mtg_fd:frp'] };
      Object.keys(out).forEach(function (k) { out[k].age = now - out[k].t; });
      var viirsBest = Math.min.apply(null, ['n21', 'n20', 'snpp'].map(function (k) { return out[k] ? out[k].age : Infinity; }));
      var all = Math.min.apply(null, Object.keys(out).map(function (k) { return out[k].age; }));
      var fresh = Object.keys(out).sort(function (a, b) { return out[a].age - out[b].age; })[0];
      return { at: now, src: out, viirsAge: viirsBest, bestAge: all, bestId: fresh, eum: e };
    }).catch(function () { freshP = null; return { at: Date.now(), src: {}, viirsAge: null, bestAge: null }; });
    return freshP;
  }

  /* ------------------------------------------------------------------ */
  /* The check: every sensor, every rule, one evidence-weighted number    */
  /* ------------------------------------------------------------------ */
  var PRIOR = 0.35; /* a point flagged by one raw satellite alert, before any cross-check */
  function logit(p) { return Math.log(p / (1 - p)); }
  function inv(l) { return 1 / (1 + Math.exp(-l)); }
  var checkCache = {};

  /* opts: { conf, dist, days } from the rule engine when known; { hoursGeo } look-back for geostationary */
  function check(lat, lon, opts) {
    opts = opts || {};
    var key = lat.toFixed(3) + ',' + lon.toFixed(3);
    if (checkCache[key] && Date.now() - checkCache[key].at < 8 * MIN) return checkCache[key].p;
    var p = eumTimes().then(function (times) {
      var now = Date.now(), hoursGeo = opts.hoursGeo || 3;
      var pb = box(lat, lon, 1.4), mb = box(lat, lon, 2.2), gb = box(lat, lon, 6);
      var jobs = {
        viirs: viirsIn(pb, 500).catch(function (e) { return { err: e }; }),
        modis: modisIn(mb, 500).catch(function (e) { return { err: e }; }),
        cloud: cloudAt(lat, lon, times),
        msg: null, mtg: null, s3: null
      };
      ['msg', 'mtg'].forEach(function (id) {
        var src = BY[id], newest = times[src.layer];
        if (!newest || !geoCovers(src, lat, lon)) { jobs[id] = Promise.resolve({ na: true }); return; }
        var slots = geoSlots(src, newest, hoursGeo);
        jobs[id] = Promise.all(slots.map(function (t) {
          return rasterHits(src.layer, gb, t, 0.02).then(function (h) { return { t: t, ok: true, hits: h.filter(function (q) { return hav(lat, lon, q.lat, q.lon) <= 5; }) }; }).catch(function () { return { t: t, ok: false, hits: [] }; });
        })).then(function (r) { return { slots: r, newest: newest }; });
      });
      /* Sentinel-3: one global granule per orbit, about 100 minutes apart. Walk back twelve hours on each. */
      var s3times = [];
      BY.s3.layers.forEach(function (ly) { var n0 = times[ly]; if (!n0) return; for (var k = 0; k < 7; k++) s3times.push({ ly: ly, t: n0 - k * 100 * MIN }); });
      jobs.s3 = s3times.length ? Promise.all(s3times.map(function (o) {
        return rasterHits(o.ly, box(lat, lon, 4), o.t, 0.01).then(function (h) { return { t: o.t, ly: o.ly, ok: true, hits: h.filter(function (q) { return hav(lat, lon, q.lat, q.lon) <= 2.5; }) }; }).catch(function () { return { t: o.t, ok: false, hits: [] }; });
      })).then(function (r) { return { granules: r }; }) : Promise.resolve({ na: true });
      var names = Object.keys(jobs);
      return Promise.all(names.map(function (k) { return jobs[k]; })).then(function (vals) {
        var R = {}; names.forEach(function (k, i) { R[k] = vals[i]; });
        return fuse(lat, lon, R, opts, now);
      });
    });
    checkCache[key] = { at: Date.now(), p: p };
    p.catch(function () { delete checkCache[key]; });
    return p;
  }

  function fuse(lat, lon, R, opts, now) {
    var L = logit(PRIOR), checks = [], sensorsHit = {}, fams = {}, lanes = {}, newestHit = null, newestLook = null;
    function add(c) { if (c.lr && c.lr !== 1) L += Math.log(c.lr); checks.push(c); }
    function hitAt(id, t) { (lanes[id] = lanes[id] || []).push(t); if (t && (!newestHit || t > newestHit.t)) newestHit = { t: t, id: id }; }

    /* 1-5. Each polar satellite on its own: they fly different orbits at different hours, so each is an independent look */
    var polar = [];
    if (!R.viirs.err) polar = polar.concat(R.viirs.list.filter(function (a) { return hav(lat, lon, a.lat, a.lon) <= 1.2; }));
    if (!R.modis.err) polar = polar.concat(R.modis.list.filter(function (a) { return hav(lat, lon, a.lat, a.lon) <= 2; }));
    ['n21', 'n20', 'snpp', 'terra', 'aqua'].forEach(function (id) {
      var src = BY[id], fam = src.inst, err = fam === 'VIIRS' ? R.viirs.err : R.modis.err;
      if (err) { add({ id: id, name: src.name + ' ' + src.inst, state: 'na', text: 'Feed did not answer, so this satellite is left out.', lr: 1 }); return; }
      var mine = polar.filter(function (a) { return a.src === id; });
      if (!mine.length) { add({ id: id, name: src.name + ' ' + src.inst, state: 'no', text: 'No fire pixel within ' + (fam === 'VIIRS' ? '1.2' : '2') + ' km in 7 days.', lr: 1 }); return; }
      mine.sort(function (a, b) { return b.t - a.t; });
      var best = mine.some(function (a) { return a.conf === 'high'; }) ? 'high' : mine.some(function (a) { return a.conf === 'nominal'; }) ? 'nominal' : 'low';
      var lr = fam === 'VIIRS' ? src.lr[best] : (best === 'high' ? 5 : best === 'nominal' ? 3 : 1.5);
      var days = {}; mine.forEach(function (a) { days[new Date(a.t).toISOString().slice(0, 10)] = 1; hitAt(id, a.t); });
      sensorsHit[id] = 1; fams[fam] = 1;
      var frp = Math.max.apply(null, mine.map(function (a) { return a.frp || 0; }));
      add({ id: id, name: src.name + ' ' + src.inst, state: 'yes', text: mine.length + ' pixel' + (mine.length === 1 ? '' : 's') + ' on ' + Object.keys(days).length + ' day' + (Object.keys(days).length === 1 ? '' : 's') + ', best confidence ' + best + ', peak ' + frp.toFixed(1) + ' MW. Newest ' + ago(now - mine[0].t) + ' ago.', lr: lr });
    });

    /* 6. Sentinel-3 SLSTR */
    if (R.s3.na) add({ id: 's3', name: 'Sentinel-3 SLSTR', state: 'na', text: 'EUMETSAT did not list a recent granule.', lr: 1 });
    else {
      var g = R.s3.granules, gOk = g.filter(function (x) { return x.ok; }), gHit = gOk.filter(function (x) { return x.hits.length; });
      gHit.forEach(function (x) { hitAt('s3', x.t); });
      if (!gOk.length) add({ id: 's3', name: 'Sentinel-3 SLSTR', state: 'na', text: 'Granules did not load.', lr: 1 });
      else if (gHit.length) { sensorsHit.s3 = 1; fams.SLSTR = 1; add({ id: 's3', name: 'Sentinel-3 SLSTR', state: 'yes', text: 'Fire radiative power pixel within 2.5 km on ' + gHit.length + ' of ' + gOk.length + ' orbits in the last 12 hours.', lr: BY.s3.lr }); }
      else add({ id: 's3', name: 'Sentinel-3 SLSTR', state: 'no', text: 'No FRP pixel on ' + gOk.length + ' orbits in the last 12 hours (most orbits miss a given point).', lr: 1 });
    }

    /* 7-8. Geostationary: the satellites that never look away */
    var cloud = R.cloud || {}, cloudy = cloud.mask === 'cloudy' || (cloud.meteo && cloud.meteo.now != null && cloud.meteo.now >= 70);
    ['msg', 'mtg'].forEach(function (id) {
      var src = BY[id], r = R[id];
      if (!r || r.na) { add({ id: id, name: src.name + ' ' + src.inst, state: 'na', text: 'This point is outside its disk.', lr: 1 }); return; }
      var ok = r.slots.filter(function (s) { return s.ok; }), hit = ok.filter(function (s) { return s.hits.length; });
      if (r.newest && (!newestLook || r.newest > newestLook.t)) newestLook = { t: r.newest, id: id };
      if (!ok.length) { add({ id: id, name: src.name + ' ' + src.inst, state: 'na', text: 'Images did not load.', lr: 1 }); return; }
      if (hit.length) {
        hit.forEach(function (s) { hitAt(id, s.t); });
        var anyFire = hit.some(function (s) { return s.hits.some(function (q) { return q.cls === 'fire'; }); });
        var lr = (anyFire ? src.lr.fire : src.lr.possible) * (hit.length >= 3 ? 1.5 : 1);
        sensorsHit[id] = 1; fams[src.inst] = 1;
        add({ id: id, name: src.name + ' ' + src.inst, state: 'yes', text: (anyFire ? 'Fire' : 'Possible fire') + ' flagged within 5 km in ' + hit.length + ' of ' + ok.length + ' images, newest ' + ago(now - hit[0].t) + ' ago' + (hit.length >= 3 ? '. Holding over time.' : '.'), lr: lr });
      } else if (cloudy) {
        add({ id: id, name: src.name + ' ' + src.inst, state: 'cloud', text: 'Nothing flagged in ' + ok.length + ' images, but cloud covers the point. Under cloud, silence is not evidence.', lr: 1 });
      } else {
        add({ id: id, name: src.name + ' ' + src.inst, state: 'no', text: 'Clear view, nothing flagged in ' + ok.length + ' images over ' + Math.round(ok.length * src.step * (id === 'mtg' ? 2 : 1) / 60) + ' h. It only sees fires above about 20 to 50 MW, so this weighs lightly.', lr: 0.8 });
      }
    });

    /* 9. Cloud context */
    var ctext = [];
    if (cloud.mask) ctext.push('Meteosat-9 cloud mask: ' + cloud.mask);
    if (cloud.meteo && cloud.meteo.now != null) ctext.push('cloud cover now ' + cloud.meteo.now + '%' + (cloud.meteo.past != null ? ', ' + cloud.meteo.past + '% over 6 h' : ''));
    add({ id: 'cloud', name: 'Cloud check', state: cloudy ? 'cloud' : (ctext.length ? 'info' : 'na'), text: ctext.length ? ctext.join(' · ') + (cloudy ? '. Missing passes are not counted against the site.' : '. Sky is open, so missing passes count.') : 'Cloud data did not answer.', lr: 1 });

    /* 10. Physical consistency */
    var nights = polar.filter(function (a) { return a.night; }).length, lowDay = polar.length && polar.every(function (a) { return !a.night && a.conf === 'low' && (a.frp || 0) < 2; });
    if (nights) add({ id: 'night', name: 'Night pixels', state: 'yes', text: nights + ' of ' + polar.length + ' polar pixels at night. No sunglint or hot roofs at night, so these are real heat.', lr: 1.4 });
    if (lowDay) add({ id: 'glint', name: 'Weak daytime only', state: 'warn', text: 'Every pixel is low confidence, daytime, under 2 MW: the signature of sunglint or a hot roof.', lr: 0.7 });
    if (!polar.length && !R.viirs.err && !R.modis.err) {
      var clearish = !cloudy;
      add({ id: 'silent', name: 'Seven days of polar silence', state: clearish ? 'no' : 'cloud', text: clearish ? 'Five polar satellites have flown over about seventy times this week and none saw heat here.' : 'No polar pixel this week, but the sky has been cloudy.', lr: clearish ? 0.4 : 0.75 });
    }
    if (newestHit && now - newestHit.t > 72 * HOUR) add({ id: 'stale', name: 'Old evidence', state: 'warn', text: 'The newest detection is ' + ago(now - newestHit.t) + ' old. Heat may have stopped.', lr: 0.7 });

    /* 11. Agreement across instrument families */
    var nf = Object.keys(fams).length;
    if (nf >= 2) add({ id: 'agree', name: 'Cross-instrument agreement', state: 'yes', text: nf + ' different instruments (' + Object.keys(fams).join(', ') + ') saw the same spot. Independent hardware, independent errors.', lr: 1 });

    /* 12. Rule engine, when the record carries it */
    if (opts.dist != null || opts.days != null) {
      var bits = [];
      if (opts.dist != null) bits.push(opts.dist <= 3 ? 'within 3 km of a mapped industrial site' : 'not at a mapped industrial site');
      if (opts.days != null) bits.push('seen on ' + opts.days + ' day' + (opts.days === 1 ? '' : 's'));
      add({ id: 'rules', name: 'FireWatch rules', state: 'info', text: 'Record is ' + bits.join(', ') + '. The rules set the risk tier; this check only says how sure we are the heat is real.', lr: 1 });
    }

    var pr = Math.min(0.97, Math.max(0.03, inv(L))), n = Object.keys(sensorsHit).length;
    var label = pr >= 0.85 ? 'Confirmed' : pr >= 0.6 ? 'Likely' : pr >= 0.35 ? 'Unconfirmed' : 'Doubtful';
    var tone = pr >= 0.85 ? 'var(--risk-critical)' : pr >= 0.6 ? 'var(--risk-high)' : pr >= 0.35 ? 'var(--risk-medium)' : 'var(--text-secondary)';
    return { lat: lat, lon: lon, p: pr, pct: Math.round(pr * 100), label: label, tone: tone, sensors: n, families: nf, checks: checks, lanes: lanes, newestHit: newestHit, newestLook: newestLook, cloudy: cloudy, at: now };
  }

  /* ------------------------------------------------------------------ */
  /* Batch: many points, shared geostationary images                     */
  /* ------------------------------------------------------------------ */
  function batch(points, opts) {
    return Promise.all(points.map(function (pt) {
      return check(pt.lat, pt.lon, { conf: pt.conf, dist: pt.dist, days: pt.days, hoursGeo: (opts && opts.hoursGeo) || 2 }).catch(function () { return null; });
    }));
  }

  /* ------------------------------------------------------------------ */
  /* Rendering, shared by the dialog and the Satellites page              */
  /* ------------------------------------------------------------------ */
  var ICON = {
    yes: '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    no: '<svg viewBox="0 0 16 16"><path d="M4 8h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    cloud: '<svg viewBox="0 0 16 16"><path d="M4.5 12h7a2.8 2.8 0 0 0 .3-5.6A3.8 3.8 0 0 0 4.6 7.3 2.4 2.4 0 0 0 4.5 12Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 16 16"><path d="M8 2.5 14 13H2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.5v3M8 11.2v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.2v4M8 4.9v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    na: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2.2"/></svg>'
  };
  function renderResult(r) {
    var lanes = SOURCES.map(function (s) {
      var hits = r.lanes[s.id] || [], span = 24 * HOUR;
      var dots = hits.filter(function (t) { return r.at - t <= span; }).map(function (t) { return '<i style="left:' + (100 - (r.at - t) / span * 100).toFixed(2) + '%;--c:' + s.color + '" title="' + esc(s.name + ' ' + s.inst + ', ' + stamp(t)) + '"></i>'; }).join('');
      return '<div class="sx-lane"><span class="mono">' + esc(s.inst + ' ' + s.name.split(' (')[0]) + '</span><div class="sx-track">' + dots + '</div></div>';
    }).join('');
    var rows = r.checks.map(function (c) {
      var w = c.lr && c.lr !== 1 ? (c.lr > 1 ? '×' + (Math.round(c.lr * 10) / 10) : '×' + (Math.round(c.lr * 100) / 100)) : '·';
      return '<li class="sx-row s-' + c.state + '"><span class="sx-ic" aria-hidden="true">' + (ICON[c.state] || ICON.info) + '</span><div><b>' + esc(c.name) + '</b><span>' + esc(c.text) + '</span></div><span class="sx-w mono" title="Weight on the odds">' + w + '</span></li>';
    }).join('');
    var fresh = r.newestHit ? 'Newest heat seen ' + ago(r.at - r.newestHit.t) + ' ago by ' + (BY[r.newestHit.id] ? BY[r.newestHit.id].name + ' ' + BY[r.newestHit.id].inst : r.newestHit.id) : 'No sensor has seen heat here recently';
    var look = r.newestLook ? '. Newest geostationary look ' + ago(r.at - r.newestLook.t) + ' ago.' : '.';
    return '<div class="sx-head" style="--tc:' + r.tone + '">' +
      '<div class="sx-gauge"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" class="trk"/><circle cx="60" cy="60" r="50" class="val" style="stroke-dasharray:' + (r.p * 314.16).toFixed(1) + ' 314.16"/></svg><div><b class="mono">' + r.pct + '%</b><span>evidence-weighted</span></div></div>' +
      '<div class="sx-sum"><span class="tag" style="--tc:' + r.tone + '">' + r.label + '</span><h4>' + (r.sensors ? r.sensors + ' of 8 satellites agree' : 'No satellite agrees yet') + (r.families > 1 ? ', ' + r.families + ' instrument types' : '') + '</h4><p>' + esc(fresh + look) + (r.cloudy ? ' Cloud is over the point, so missing looks are not held against it.' : '') + '</p></div></div>' +
      '<div class="sx-lanes"><div class="sx-lanes-h mono"><span>Last 24 hours</span><span>now</span></div>' + lanes + '</div>' +
      '<ol class="sx-list">' + rows + '</ol>' +
      '<p class="sx-foot small">Starts from ' + Math.round(PRIOR * 100) + '% for one raw alert. Each check multiplies the odds by its weight, shown on the right. Capped at 97%: no stack of satellites replaces a ground visit.</p>';
  }

  /* Dialog */
  var dlg = null;
  function openCheck(rec) {
    if (!rec || rec.lat == null) return;
    if (!dlg) {
      dlg = document.createElement('div'); dlg.className = 'sx-modal'; dlg.hidden = true;
      dlg.innerHTML = '<div class="sx-backdrop" data-close></div><div class="sx-dialog" role="dialog" aria-modal="true" aria-labelledby="sx-title"><div class="sx-top"><div><span class="eyebrow mono">Multi-satellite check</span><h3 id="sx-title"></h3><p class="mono small" id="sx-sub"></p></div><button type="button" class="sx-x" data-close aria-label="Close">×</button></div><div class="sx-body" id="sx-body"></div><div class="sx-acts"><a class="btn btn-ghost btn-sm" id="sx-page" href="satellites.html">Open on the Satellites page</a><button type="button" class="btn btn-ghost btn-sm" id="sx-again">Run again</button></div></div>';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dlg && !dlg.hidden) close(); });
    }
    var body = $('#sx-body', dlg);
    $('#sx-title', dlg).textContent = (rec.id ? rec.id + ' · ' : '') + (rec.place || rec.region || 'Selected point');
    $('#sx-sub', dlg).textContent = rec.lat.toFixed(4) + ', ' + rec.lon.toFixed(4);
    $('#sx-page', dlg).href = 'satellites.html?lat=' + rec.lat.toFixed(5) + '&lon=' + rec.lon.toFixed(5) + (rec.id ? '&id=' + encodeURIComponent(rec.id) : '');
    function run(force) {
      if (force) delete checkCache[rec.lat.toFixed(3) + ',' + rec.lon.toFixed(3)];
      body.innerHTML = loading();
      check(rec.lat, rec.lon, { conf: rec.conf, dist: rec.dist, days: rec.days }).then(function (r) { body.innerHTML = renderResult(r); if (rec.onResult) rec.onResult(r); })
        .catch(function (e) { body.innerHTML = '<p class="small">The check could not finish (' + esc(e && e.message || 'no response') + '). Try again in a moment.</p>'; });
    }
    $('#sx-again', dlg).onclick = function () { run(true); };
    dlg.hidden = false; document.documentElement.classList.add('sx-open');
    run(false);
  }
  function close() { if (dlg) dlg.hidden = true; document.documentElement.classList.remove('sx-open'); }
  function loading() {
    return '<div class="sx-load"><div class="sx-orbit" aria-hidden="true"><i></i><i></i><i></i></div><p class="mono small">Asking eight satellites: five polar feeds, two Sentinel-3 orbits, two geostationary disks, plus the cloud mask.</p></div>';
  }

  /* Delegated buttons: any element with data-satcheck="lat,lon" (and optional data-id, data-place) */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-satcheck]'); if (!b) return;
    e.preventDefault();
    var ll = b.getAttribute('data-satcheck').split(',').map(Number);
    var extra = {};
    if (b.getAttribute('data-id') && window.FW_API && FW_API.rows) { FW_API.rows.forEach(function (x) { if (x.id === b.getAttribute('data-id')) extra = x; }); }
    openCheck({ lat: ll[0], lon: ll[1], id: b.getAttribute('data-id') || extra.id, place: b.getAttribute('data-place') || extra.region, conf: extra.conf, dist: extra.dist, days: extra.days, onResult: extra.id ? function (r) { extra.multi = r; } : null });
  });

  /* ------------------------------------------------------------------ */
  /* Leaflet overlays                                                    */
  /* ------------------------------------------------------------------ */
  function wmsLayer(layer, time, opts) {
    if (!window.L) return null;
    return L.tileLayer.wms(EUM, Object.assign({ layers: layer, format: 'image/png', transparent: true, version: '1.3.0', time: time ? isoMin(time) : undefined, attribution: 'EUMETSAT, Copernicus', opacity: 1, className: 'sx-wms' }, opts || {}));
  }
  /* Live polar points inside map bounds, coloured per satellite */
  function polarLayer(map, which) {
    var g = L.layerGroup(), token = 0;
    function load() {
      if (!map.hasLayer(g)) return;
      var bb = map.getBounds(), b = [Math.max(-180, bb.getWest()), Math.max(-85, bb.getSouth()), Math.min(180, bb.getEast()), Math.min(85, bb.getNorth())], me = ++token;
      (which === 'modis' ? modisIn(b, 2000) : viirsIn(b, 2000)).then(function (r) {
        if (me !== token) return; g.clearLayers();
        r.list.forEach(function (a) {
          var s = BY[a.src];
          L.circleMarker([a.lat, a.lon], { radius: which === 'modis' ? 3.2 : 2.4, weight: which === 'modis' ? 1 : 0, color: s.color, fillColor: which === 'modis' ? 'transparent' : s.color, fillOpacity: 0.85, interactive: true })
            .bindTooltip(s.inst + ' ' + s.name + ' · ' + stamp(a.t) + ' · ' + (a.frp != null ? a.frp.toFixed(1) + ' MW' : '') + (a.night ? ' · night' : ''), { className: 'fw-tip', direction: 'top' }).addTo(g);
        });
        g.fire('sx:loaded', { n: r.list.length, capped: r.capped });
      }).catch(function () { g.fire('sx:loaded', { n: 0, err: true }); });
    }
    g.on('add', load); map.on('moveend', function () { if (map.hasLayer(g)) load(); });
    g.reload = load;
    return g;
  }

  window.FW_SAT = { SOURCES: SOURCES, BY: BY, freshness: freshness, check: check, batch: batch, openCheck: openCheck, render: renderResult, loading: loading, wms: wmsLayer, polarLayer: polarLayer, eumTimes: eumTimes, viirsIn: viirsIn, modisIn: modisIn, rasterHits: rasterHits, geoCovers: geoCovers, ago: ago, stamp: stamp, PRIOR: PRIOR };
})();
