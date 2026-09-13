/* FireWatch SOS: a structured emergency resource request for one incident, drafted automatically from the
   record, the live VIIRS feed and OpenStreetMap, then delivered through channels the operator controls.
   What is real: nearest fire stations, hospitals and police with phone numbers; the brief; email, WhatsApp, SMS,
   webhook, print and call links. What is not: direct dispatch into a government control room, which needs an
   official integration. The confirmation step exists so nothing leaves by accident. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FIRE_URL = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
  var STORE_HOOK = 'fw.sos.webhook', STORE_OP = 'fw.sos.operator', STORE_LOG = 'fw.sos.log';

  /* National emergency numbers, by ISO country code. */
  var NUMS = {
    in: [['112', 'All emergencies'], ['101', 'Fire'], ['108', 'Ambulance'], ['100', 'Police']],
    us: [['911', 'All emergencies']], ca: [['911', 'All emergencies']], gb: [['999', 'All emergencies']], au: [['000', 'All emergencies']],
    de: [['112', 'Fire and ambulance'], ['110', 'Police']], it: [['112', 'All emergencies'], ['115', 'Fire']], gr: [['112', 'All emergencies'], ['199', 'Fire']], ua: [['112', 'All emergencies'], ['101', 'Fire']], ru: [['112', 'All emergencies'], ['101', 'Fire']], kz: [['112', 'All emergencies'], ['101', 'Fire']],
    jp: [['119', 'Fire and ambulance'], ['110', 'Police']], kr: [['119', 'Fire and ambulance'], ['112', 'Police']], cn: [['119', 'Fire'], ['120', 'Ambulance'], ['110', 'Police']], tw: [['119', 'Fire and ambulance'], ['110', 'Police']], sg: [['995', 'Fire and ambulance'], ['999', 'Police']], id: [['112', 'All emergencies'], ['113', 'Fire']], th: [['199', 'Fire'], ['1669', 'Medical'], ['191', 'Police']], kh: [['118', 'Fire'], ['119', 'Ambulance'], ['117', 'Police']],
    br: [['193', 'Fire'], ['192', 'SAMU ambulance'], ['190', 'Police']], co: [['123', 'All emergencies']], ng: [['112', 'All emergencies']], zw: [['993', 'Fire'], ['994', 'Ambulance'], ['995', 'Police']], bf: [['18', 'Fire'], ['17', 'Police']],
    iq: [['115', 'Fire'], ['122', 'Ambulance'], ['104', 'Police']], kw: [['112', 'All emergencies']], qa: [['999', 'All emergencies']], bh: [['999', 'All emergencies']], ir: [['125', 'Fire'], ['115', 'Ambulance'], ['110', 'Police']], pk: [['16', 'Fire'], ['1122', 'Rescue'], ['15', 'Police']], bd: [['999', 'All emergencies']]
  };
  var COUNTRY_CODE = { india: 'in', usa: 'us', 'united states': 'us', canada: 'ca', australia: 'au', 'western australia': 'au', germany: 'de', italy: 'it', greece: 'gr', ukraine: 'ua', russia: 'ru', kazakhstan: 'kz', japan: 'jp', 'south korea': 'kr', china: 'cn', taiwan: 'tw', singapore: 'sg', indonesia: 'id', thailand: 'th', cambodia: 'kh', brazil: 'br', colombia: 'co', nigeria: 'ng', zimbabwe: 'zw', 'burkina faso': 'bf', iraq: 'iq', kuwait: 'kw', qatar: 'qa', bahrain: 'bh', iran: 'ir', pakistan: 'pk', bangladesh: 'bd' };

  function hav(a, b, c, d) { var R = 6371, p = Math.PI / 180, dLat = (c - a) * p, dLon = (d - b) * p; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
  function dms(v, pos, neg) { var a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 3600 - m * 60).toFixed(1); return d + '°' + String(m).padStart(2, '0') + '\'' + s + '" ' + (v >= 0 ? pos : neg); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function stampUtc(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC'; }
  function stampLocal(d) { return pad(d.getDate()) + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' local'; }
  function get(url, opt, ms) { var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 15000); var o = opt || {}; o.signal = ctl.signal; return fetch(url, o).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(function () { clearTimeout(t); }); }

  /* Lookups */
  function responders(lat, lon) {
    var km = 15, dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    var bb = (lat - dLat).toFixed(3) + ',' + (lon - dLon).toFixed(3) + ',' + (lat + dLat).toFixed(3) + ',' + (lon + dLon).toFixed(3);
    var k2 = 2, dLat2 = k2 / 111, dLon2 = k2 / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    var bb2 = (lat - dLat2).toFixed(3) + ',' + (lon - dLon2).toFixed(3) + ',' + (lat + dLat2).toFixed(3) + ',' + (lon + dLon2).toFixed(3);
    var q = '[out:json][timeout:20];(nwr["amenity"="fire_station"](' + bb + ');nwr["amenity"="hospital"](' + bb + ');nwr["amenity"="police"](' + bb + ');nwr["amenity"="school"](' + bb2 + ');nwr["landuse"="residential"](' + bb2 + '););out center tags 400;';
    return get('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 24000).then(function (j) {
      var out = { fire: [], hospital: [], police: [], schools: 0, residential: 0, ok: true };
      (j.elements || []).forEach(function (e) {
        var c = e.center || e, t = e.tags || {}; if (c.lat == null) return;
        var d = hav(lat, lon, c.lat, c.lon);
        if (t.amenity === 'school') { if (d <= 2) out.schools++; return; }
        if (t.landuse === 'residential') { if (d <= 2) out.residential++; return; }
        var rec = { name: t.name || t['name:en'] || (t.amenity === 'fire_station' ? 'Fire station (unnamed)' : t.amenity === 'hospital' ? 'Hospital (unnamed)' : 'Police station (unnamed)'), phone: t.phone || t['contact:phone'] || t.emergency_telephone || '', email: t.email || t['contact:email'] || '', d: d, lat: c.lat, lon: c.lon, beds: t.beds || '', emergency: t.emergency || '' };
        if (t.amenity === 'fire_station') out.fire.push(rec); else if (t.amenity === 'hospital') out.hospital.push(rec); else if (t.amenity === 'police') out.police.push(rec);
      });
      ['fire', 'hospital', 'police'].forEach(function (k) { out[k].sort(function (a, b) { var ea = (a.emergency === 'yes' ? 0 : 1) - (b.emergency === 'yes' ? 0 : 1); if (k === 'hospital' && ea) return ea; return a.d - b.d; }); out[k] = out[k].slice(0, 3); });
      return out;
    }).catch(function () { return { ok: false, fire: [], hospital: [], police: [], schools: null, residential: null }; });
  }
  function place(lat, lon) {
    return get('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=' + lat + '&lon=' + lon, null, 9000).then(function (j) {
      var a = j.address || {}; return { label: j.display_name || '', short: [a.suburb || a.village || a.town || a.city_district, a.city || a.county || a.state_district, a.state, a.country].filter(Boolean).join(', '), cc: (a.country_code || '').toLowerCase(), country: a.country || '', state: a.state || '', district: a.state_district || a.county || '' };
    }).catch(function () { return null; });
  }
  function pixels(lat, lon) {
    var km = 3, dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    var env = (lon - dLon).toFixed(4) + ',' + (lat - dLat).toFixed(4) + ',' + (lon + dLon).toFixed(4) + ',' + (lat + dLat).toFixed(4);
    return get(FIRE_URL + '?where=1%3D1&geometry=' + env + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=latitude,longitude,confidence,frp,acq_date,acq_time,satellite,daynight&returnGeometry=false&resultRecordCount=1000&f=json', null, 14000)
      .then(function (j) { var rows = (j.features || []).map(function (f) { return f.attributes; }).filter(function (a) { return a && a.latitude != null && hav(lat, lon, a.latitude, a.longitude) <= 1; }); var days = {}; var night = 0, frp = 0, latest = null; rows.forEach(function (a) { if (a.acq_date) { var k = new Date(a.acq_date).toISOString().slice(0, 10); days[k] = 1; if (!latest || a.acq_date > latest.acq_date) latest = a; } if (a.daynight === 'N') night++; frp = Math.max(frp, +a.frp || 0); }); return { n: rows.length, days: Object.keys(days).length, night: night, frpMax: frp, latest: latest, ok: true }; })
      .catch(function () { return { ok: false }; });
  }

  /* ------------------------------------------------------------------ */
  /* Brief                                                               */
  /* ------------------------------------------------------------------ */
  function resourceRequest(rec) {
    var r = rec.risk, t = rec.type || '', ind = /Industrial/.test(t);
    if (r === 'Critical' && ind) return [
      ['Fire tenders', '2, foam-capable if the site handles fuel or chemicals'], ['HAZMAT unit', '1, with gas detection'], ['Ambulance', '1 on standby at the cordon, burns and inhalation readiness'],
      ['Police', 'traffic and a 500 m cordon on the downwind side'], ['District industrial-safety officer', 'on site for entry authorisation and plant isolation'], ['Pollution control board', 'notification for air-quality monitoring'], ['Response window', 'ground verification within 24 hours; treat as live incident if the site confirms']];
    if (r === 'Critical') return [['Fire tenders', '2'], ['Ambulance', '1 on standby'], ['Police', 'cordon and access control'], ['Local authority', 'incident officer on site'], ['Response window', 'verification within 24 hours']];
    if (r === 'High') return [['Fire tender', '1, on standby'], ['Inspection team', 'district industrial-safety officer, next scheduled round brought forward'], ['Ambulance', 'not requested; alert the nearest hospital emergency desk'], ['Response window', 'inspection within the current week']];
    return [['Field visit', 'not requested at this tier'], ['Monitoring', 'kept on watch; escalate if it returns on 3 separate days or shows night passes'], ['Response window', 'none']];
  }
  function build(S) {
    var r = S.rec, now = S.created, L = [], p = S.place, rp = S.resp, px = S.px, ops = S.operator || '';
    var placeLine = p ? (p.short || p.label) : (S.placeStatus === 'pending' ? 'place name pending' : 'place name unavailable, use coordinates');
    var mapsUrl = 'https://www.google.com/maps?q=' + r.lat.toFixed(5) + ',' + r.lon.toFixed(5), osmUrl = 'https://www.openstreetmap.org/?mlat=' + r.lat.toFixed(5) + '&mlon=' + r.lon.toFixed(5) + '#map=15/' + r.lat.toFixed(5) + '/' + r.lon.toFixed(5);
    L.push('EMERGENCY RESOURCE REQUEST · ' + S.ref);
    L.push('Issued ' + stampUtc(now) + ' (' + stampLocal(now) + ') by FireWatch screening layer' + (ops ? ', operator ' + ops : ''));
    L.push('Priority: ' + (r.risk === 'Critical' ? 'P1 IMMEDIATE' : r.risk === 'High' ? 'P2 URGENT' : 'P3 ADVISORY') + ' · ' + (r.type || 'Thermal anomaly') + ' · ' + r.risk + ' · confidence ' + (r.conf != null ? r.conf + '%' : 'n/a'));
    L.push('');
    L.push('1. LOCATION');
    L.push('   ' + placeLine);
    L.push('   Coordinates ' + r.lat.toFixed(5) + ', ' + r.lon.toFixed(5) + ' (' + dms(r.lat, 'N', 'S') + ' ' + dms(r.lon, 'E', 'W') + ')');
    L.push('   Map ' + mapsUrl);
    L.push('   OSM ' + osmUrl);
    if (r.dist != null) L.push('   Nearest mapped industrial site ' + (+r.dist).toFixed(1) + ' km');
    L.push('');
    L.push('2. INCIDENT');
    L.push('   Record ' + r.id + ' · detected ' + (r.dateS || (r.date ? pad(r.date.getDate()) + ' ' + MON[r.date.getMonth()] + ' ' + r.date.getFullYear() : 'date n/a')) + ' · source ' + (r.source || 'NASA FIRMS'));
    L.push('   Classification ' + (r.type || 'n/a') + ' · risk tier ' + r.risk + ' · sensor confidence ' + (r.conf != null ? r.conf + '%' : 'n/a'));
    L.push('   Rule trace: proximity ' + (r.dist != null ? ((+r.dist) <= 3 ? 'HOLDS' : 'fails') + ' (' + (+r.dist).toFixed(1) + ' km, threshold 3 km)' : 'unknown') + ' · persistence ' + (r.days != null ? ((r.days >= 3 ? 'HOLDS' : 'fails') + ' (' + r.days + ' distinct days, threshold 3)') : 'unknown') + ' · confidence ' + (r.conf != null ? (r.conf >= 85 ? 'HIGH band' : r.conf >= 65 ? 'MID band' : 'LOW band') + ' (' + r.conf + '%)' : 'n/a'));
    L.push('');
    L.push('3. EVIDENCE');
    if (px && px.ok) L.push('   Live VIIRS, last 7 days within 1 km: ' + px.n + ' passes on ' + px.days + ' days, ' + px.night + ' at night, peak radiative power ' + px.frpMax.toFixed(1) + ' MW' + (px.latest ? ', latest ' + new Date(px.latest.acq_date).toISOString().slice(0, 10) + (px.latest.acq_time != null ? ' ' + String(px.latest.acq_time).padStart(4, '0') + ' UTC' : '') : ''));
    else if (px && !px.ok) L.push('   Live VIIRS feed did not answer at drafting time');
    else L.push('   Live VIIRS check pending');
    L.push('   Record recurrence: ' + (r.days != null ? r.days + ' distinct days' : 'n/a') + (r.frp ? ' · radiative power ' + r.frp : ''));
    L.push('   Satellite imagery: https://worldview.earthdata.nasa.gov/?v=' + (r.lon - 0.6).toFixed(3) + ',' + (r.lat - 0.4).toFixed(3) + ',' + (r.lon + 0.6).toFixed(3) + ',' + (r.lat + 0.4).toFixed(3) + '&t=' + S.dateIso + '&l=Reference_Labels_15m,VIIRS_NOAA20_Thermal_Anomalies_375m_Day,VIIRS_NOAA20_Thermal_Anomalies_375m_Night,VIIRS_NOAA20_CorrectedReflectance_TrueColor');
    L.push('   Fire map: https://firms.modaps.eosdis.nasa.gov/map/#d:' + S.dateIso + '..' + S.dateIso + ';@' + r.lon.toFixed(3) + ',' + r.lat.toFixed(3) + ',10z');
    if (S.extra) L.push('   ' + S.extra);
    L.push('');
    L.push('4. EXPOSURE WITHIN 2 KM');
    if (rp && rp.ok) L.push('   Schools ' + rp.schools + ' · residential areas mapped ' + rp.residential + (rp.residential ? ' (populated surroundings, plan the cordon downwind)' : ''));
    else if (rp && !rp.ok) L.push('   OpenStreetMap lookup did not answer; assume populated surroundings until confirmed');
    else L.push('   Lookup pending');
    L.push('');
    L.push('5. RESOURCES REQUESTED');
    resourceRequest(r).forEach(function (q) { L.push('   ' + q[0] + ': ' + q[1]); });
    L.push('');
    L.push('6. NEAREST RESPONDERS (OpenStreetMap, ' + (rp && rp.ok ? 'live' : 'unavailable') + ')');
    ['fire', 'hospital', 'police'].forEach(function (k) {
      var label = k === 'fire' ? 'Fire' : k === 'hospital' ? 'Hospital' : 'Police';
      if (!rp || !rp.ok) { L.push('   ' + label + ': lookup ' + (rp ? 'failed' : 'pending')); return; }
      if (!rp[k].length) { L.push('   ' + label + ': none mapped within 15 km'); return; }
      rp[k].forEach(function (x, i) { L.push('   ' + (i === 0 ? label + ': ' : '        ') + x.name + ' · ' + x.d.toFixed(1) + ' km' + (x.phone ? ' · ' + x.phone : ' · no phone tagged') + (x.email ? ' · ' + x.email : '')); });
    });
    var nums = NUMS[S.cc] || null;
    L.push('   National: ' + (nums ? nums.map(function (n) { return n[0] + ' ' + n[1]; }).join(' · ') : '112 in most countries, confirm locally'));
    L.push('');
    L.push('7. REQUESTED ACTION');
    L.push('   ' + (r.risk === 'Critical' ? 'Dispatch to verify on the ground within 24 hours; treat as a live industrial fire if the site or a second pass confirms. Acknowledge to the issuing officer.' : r.risk === 'High' ? 'Bring the next inspection forward; place one tender on standby; acknowledge receipt.' : 'Advisory only. No dispatch requested.'));
    L.push('   Contact back: ' + (S.contact || 'operator contact not provided'));
    return L.join('\n');
  }
  function shortText(S) {
    var r = S.rec, p = S.place;
    return 'FireWatch SOS ' + S.ref + ' · ' + (r.risk === 'Critical' ? 'P1' : r.risk === 'High' ? 'P2' : 'P3') + ' ' + (r.type || 'thermal anomaly') + ' · ' + (p ? (p.short || p.label) : 'place pending') + ' · ' + r.lat.toFixed(5) + ',' + r.lon.toFixed(5) + ' · conf ' + (r.conf != null ? r.conf + '%' : 'n/a') + ' · seen ' + (r.days != null ? r.days + 'd' : '?') + (r.dist != null ? ' · industry ' + (+r.dist).toFixed(1) + 'km' : '') + ' · map https://www.google.com/maps?q=' + r.lat.toFixed(5) + ',' + r.lon.toFixed(5) + (S.contact ? ' · contact ' + S.contact : '');
  }

  /* ------------------------------------------------------------------ */
  /* Modal                                                               */
  /* ------------------------------------------------------------------ */
  var V = null, S = null;
  function buildDom() {
    var root = document.createElement('div'); root.className = 'sos'; root.hidden = true;
    root.innerHTML =
      '<div class="sos-backdrop"></div>' +
      '<div class="sos-dialog" role="dialog" aria-modal="true" aria-labelledby="sos-title">' +
        '<header class="sos-head"><div><span class="eyebrow">Emergency SOS</span><h3 id="sos-title">Resource request</h3><p class="sos-sub mono"></p></div><div class="sos-headr"><span class="sos-pri mono"></span><button type="button" class="sos-x" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div></header>' +
        '<div class="sos-body">' +
          '<section class="sos-brief">' +
            '<div class="sos-toolbar"><span class="sos-status mono" role="status" aria-live="polite">Drafting</span><div class="sos-tools"><button type="button" class="btn btn-ghost btn-sm" data-act="copy">Copy brief</button><button type="button" class="btn btn-ghost btn-sm" data-act="print">Print / PDF</button></div></div>' +
            '<pre class="sos-text" id="sos-text" tabindex="0" aria-label="The SOS brief"></pre>' +
          '</section>' +
          '<aside class="sos-rail">' +
            '<section class="sos-sec"><span class="eyebrow">Operator</span><label class="sos-f"><span>Name and role</span><input type="text" class="sos-op" placeholder="e.g. R. Mehta, District Fire Officer" autocomplete="name"></label><label class="sos-f"><span>Contact back</span><input type="text" class="sos-contact" placeholder="phone or email responders should call" autocomplete="tel"></label><label class="sos-f"><span>Note to responders (optional)</span><input type="text" class="sos-extra" placeholder="access road, gas storage, wind direction" maxlength="160"></label></section>' +
            '<section class="sos-sec"><span class="eyebrow">Recipients</span><div class="sos-recips"><p class="small">Looking up the nearest fire stations, hospitals and police.</p></div><label class="sos-f"><span>Extra emails, comma separated</span><input type="text" class="sos-emails" placeholder="control.room@district.gov.in" inputmode="email"></label><label class="sos-f"><span>Extra phones for SMS or WhatsApp</span><input type="text" class="sos-phones" placeholder="+91 98xxxxxxxx" inputmode="tel"></label></section>' +
            '<section class="sos-sec"><span class="eyebrow">Webhook (optional)</span><label class="sos-f"><span>Control-room, Slack, Teams or Discord incoming webhook URL</span><input type="url" class="sos-hook" placeholder="https://hooks.slack.com/services/..."></label><p class="small">The brief is posted as JSON {text, ref, incident}. Stored only in this browser.</p></section>' +
            '<section class="sos-sec sos-send"><label class="sos-confirm"><input type="checkbox" class="sos-ok"> I confirm this is a genuine request and I am authorised to send it.</label>' +
              '<div class="sos-channels"><button type="button" class="btn btn-primary" data-send="email" disabled>Email brief</button><button type="button" class="btn btn-ghost" data-send="whatsapp" disabled>WhatsApp</button><button type="button" class="btn btn-ghost" data-send="sms" disabled>SMS</button><button type="button" class="btn btn-ghost" data-send="hook" disabled>Post to webhook</button><button type="button" class="btn btn-ghost" data-send="share" disabled>Share sheet</button></div>' +
              '<div class="sos-calls"></div>' +
              '<div class="sos-nav"><a class="btn btn-ghost btn-sm" id="sos-navigate" href="respond.html">Navigate to the incident</a></div>' +
              '<p class="sos-warn small">Direct dispatch into a government control room needs an official integration; the webhook above is where that connects. Until then, email, WhatsApp, SMS and the call buttons reach real people, and the print copy is the record.</p>' +
            '</section>' +
            '<section class="sos-sec"><span class="eyebrow">Dispatch log</span><ul class="sos-log"></ul></section>' +
          '</aside>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    V = { root: root };
    $('.sos-x', root).addEventListener('click', close); $('.sos-backdrop', root).addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !root.hidden) close(); });
    ['.sos-op', '.sos-contact', '.sos-extra'].forEach(function (sel) { $(sel, root).addEventListener('input', function () { S.operator = $('.sos-op', root).value.trim(); S.contact = $('.sos-contact', root).value.trim(); S.extra = $('.sos-extra', root).value.trim(); try { localStorage.setItem(STORE_OP, JSON.stringify({ op: S.operator, contact: S.contact })); } catch (e) { } render(); }); });
    $('.sos-hook', root).addEventListener('change', function () { try { localStorage.setItem(STORE_HOOK, $('.sos-hook', root).value.trim()); } catch (e) { } });
    $('.sos-ok', root).addEventListener('change', gate);
    $$('[data-act]', root).forEach(function (b) { b.addEventListener('click', function () { act(b.getAttribute('data-act')); }); });
    $$('[data-send]', root).forEach(function (b) { b.addEventListener('click', function () { send(b.getAttribute('data-send')); }); });
    $('.sos-recips', root).addEventListener('change', function () { render(); gate(); });
    $('.sos-emails', root).addEventListener('input', gate); $('.sos-phones', root).addEventListener('input', gate);
  }
  function gate() {
    var ok = $('.sos-ok', V.root).checked && (S.operator || '').length >= 2;
    $$('[data-send]', V.root).forEach(function (b) { b.disabled = !ok; });
    $('.sos-send', V.root).classList.toggle('armed', ok);
  }
  function selectedRecips() {
    var out = { emails: [], phones: [], names: [] };
    $$('.sos-recips input[type=checkbox]:checked', V.root).forEach(function (c) { out.names.push(c.getAttribute('data-name')); if (c.getAttribute('data-phone')) out.phones.push(c.getAttribute('data-phone')); if (c.getAttribute('data-email')) out.emails.push(c.getAttribute('data-email')); });
    ($('.sos-emails', V.root).value || '').split(/[,;\s]+/).forEach(function (e) { if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) out.emails.push(e); });
    ($('.sos-phones', V.root).value || '').split(/[,;]+/).forEach(function (p) { p = p.replace(/[^\d+]/g, ''); if (p.length >= 7) out.phones.push(p); });
    return out;
  }
  function render() {
    if (!S) return;
    S.text = build(S);
    $('#sos-text', V.root).textContent = S.text;
  }
  function status(m, kind) { var s = $('.sos-status', V.root); s.textContent = m; s.className = 'sos-status mono' + (kind ? ' ' + kind : ''); }
  function log(msg) {
    var d = new Date(), line = stampLocal(d) + ' · ' + msg; S.log.push(line);
    try { document.dispatchEvent(new CustomEvent('fw:sos', { detail: { ref: S.ref, recId: S.rec.id, place: S.place ? (S.place.short || S.place.label) : (S.rec.id), lat: S.rec.lat, lon: S.rec.lon, risk: S.rec.risk, action: msg, detectedAt: S.rec.date ? (S.rec.acqTime ? Date.UTC(S.rec.date.getFullYear(), S.rec.date.getMonth(), S.rec.date.getDate(), +S.rec.acqTime.slice(0, 2), +S.rec.acqTime.slice(2, 4)) : S.rec.date.getTime()) : Date.now() } })); } catch (e) { }
    try { var all = JSON.parse(localStorage.getItem(STORE_LOG) || '[]'); all.push(S.ref + ' · ' + line); localStorage.setItem(STORE_LOG, JSON.stringify(all.slice(-100))); } catch (e) { }
    $('.sos-log', V.root).innerHTML = S.log.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
  }
  function paintRecips() {
    var rp = S.resp, box = $('.sos-recips', V.root), calls = $('.sos-calls', V.root);
    if (!rp) { box.innerHTML = '<p class="small">Looking up the nearest fire stations, hospitals and police.</p>'; return; }
    if (!rp.ok) { box.innerHTML = '<p class="small">The OpenStreetMap lookup did not answer. Use the national numbers below and add contacts by hand.</p>'; }
    else {
      var html = '';
      [['fire', 'Fire'], ['hospital', 'Hospital'], ['police', 'Police']].forEach(function (k) {
        if (!rp[k[0]].length) { html += '<div class="sos-rgroup"><b>' + k[1] + '</b><span class="small">none mapped within 15 km</span></div>'; return; }
        html += '<div class="sos-rgroup"><b>' + k[1] + '</b>' + rp[k[0]].map(function (x, i) { return '<label class="sos-r"><input type="checkbox"' + (i === 0 ? ' checked' : '') + ' data-name="' + esc(x.name) + '" data-phone="' + esc(x.phone.replace(/[^\d+]/g, '')) + '" data-email="' + esc(x.email) + '"><span><span class="n">' + esc(x.name) + '</span><span class="m mono">' + x.d.toFixed(1) + ' km' + (x.phone ? ' · <a href="tel:' + esc(x.phone.replace(/[^\d+]/g, '')) + '">' + esc(x.phone) + '</a>' : ' · no phone tagged') + (x.email ? ' · ' + esc(x.email) : '') + '</span></span></label>'; }).join('') + '</div>';
      });
      box.innerHTML = html;
    }
    var nums = NUMS[S.cc] || [['112', 'Most countries, confirm locally']];
    calls.innerHTML = '<span class="eyebrow">Call now</span>' + nums.map(function (n) { return '<a class="sos-call" href="tel:' + n[0] + '" data-num="' + n[0] + '"><b>' + n[0] + '</b><span>' + esc(n[1]) + '</span></a>'; }).join('');
    $$('.sos-call', calls).forEach(function (a) { a.addEventListener('click', function () { log('Call placed to ' + a.getAttribute('data-num')); }); });
  }
  function act(k) {
    if (k === 'copy') { var t = S.text; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { status('Brief copied to the clipboard', 'ok'); log('Brief copied'); }).catch(function () { var ta = $('#sos-text', V.root); var rng = document.createRange(); rng.selectNodeContents(ta); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(rng); status('Select-all done; press copy', 'warn'); }); }
    if (k === 'print') { log('Print / PDF opened'); window.print(); }
  }
  function send(ch) {
    var rc = selectedRecips(), subject = 'FireWatch SOS ' + S.ref + ' · ' + S.rec.risk + ' ' + (S.rec.type || 'thermal anomaly') + ' · ' + S.rec.lat.toFixed(4) + ', ' + S.rec.lon.toFixed(4);
    if (ch === 'email') {
      var body = S.text; var url = 'mailto:' + encodeURIComponent(rc.emails.join(',')) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      if (url.length > 1900) url = 'mailto:' + encodeURIComponent(rc.emails.join(',')) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(shortText(S) + '\n\nFull brief follows in the attachment or paste (copied to clipboard).');
      if (navigator.clipboard) navigator.clipboard.writeText(S.text).catch(function () { });
      location.href = url; log('Email drafted' + (rc.emails.length ? ' to ' + rc.emails.join(', ') : ' (no address selected, fill in the mail client)') + '; full brief copied to clipboard'); status('Mail client opened', 'ok');
    }
    if (ch === 'whatsapp') { var txt = shortText(S) + '\n\n' + S.text.split('\n').slice(0, 24).join('\n'); var target = rc.phones[0]; var w = 'https://wa.me/' + (target ? target.replace('+', '') : '') + '?text=' + encodeURIComponent(txt); window.open(w, '_blank', 'noopener'); log('WhatsApp opened' + (target ? ' to ' + target : '')); status('WhatsApp opened', 'ok'); }
    if (ch === 'sms') { var s = 'sms:' + rc.phones.join(',') + '?&body=' + encodeURIComponent(shortText(S)); location.href = s; log('SMS drafted' + (rc.phones.length ? ' to ' + rc.phones.join(', ') : '')); status('Messages app opened', 'ok'); }
    if (ch === 'share') { if (!navigator.share) { status('This browser has no share sheet; use email or copy.', 'warn'); return; } navigator.share({ title: subject, text: S.text }).then(function () { log('Shared via the system share sheet'); status('Shared', 'ok'); }).catch(function () { status('Share cancelled', 'warn'); }); }
    if (ch === 'hook') {
      var hook = $('.sos-hook', V.root).value.trim(); if (!/^https:\/\//.test(hook)) { status('Enter an https webhook URL first', 'warn'); return; }
      status('Posting to the webhook', 'busy');
      var payload = JSON.stringify({ text: S.text, ref: S.ref, incident: { id: S.rec.id, lat: S.rec.lat, lon: S.rec.lon, risk: S.rec.risk, type: S.rec.type, confidence: S.rec.conf, days_seen: S.rec.days, distance_km: S.rec.dist, place: S.place ? (S.place.short || S.place.label) : null, issued_utc: S.created.toISOString(), operator: S.operator, contact: S.contact }, recipients: rc.names });
      var c1 = new AbortController(), t1 = setTimeout(function () { c1.abort(); }, 10000);
      fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, signal: c1.signal }).then(function (r) { clearTimeout(t1); if (!r.ok) throw new Error('HTTP ' + r.status); status('Webhook accepted the brief (HTTP ' + r.status + ')', 'ok'); log('Posted to webhook, HTTP ' + r.status); })
        .catch(function (e1) { clearTimeout(t1); if (e1 && e1.name === 'AbortError') { status('The webhook did not answer within 10 seconds', 'bad'); log('Webhook post timed out'); return; } var c2 = new AbortController(), t2 = setTimeout(function () { c2.abort(); }, 10000); return fetch(hook, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: payload, signal: c2.signal }).then(function () { clearTimeout(t2); status('Posted to the webhook (the service did not allow a readable reply, check the channel)', 'warn'); log('Posted to webhook (opaque response)'); }).catch(function () { clearTimeout(t2); status('The webhook did not accept the post', 'bad'); log('Webhook post failed'); }); });
    }
  }
  function open(rec) {
    if (!V) buildDom();
    rec = rec || {}; var lat = +rec.lat, lon = +rec.lon; if (isNaN(lat) || isNaN(lon)) return;
    var now = new Date(), d0 = rec.date instanceof Date ? rec.date : (rec.date ? new Date(rec.date) : now);
    var op = {}; try { op = JSON.parse(localStorage.getItem(STORE_OP) || '{}'); } catch (e) { }
    S = { rec: { id: rec.id || 'POINT', lat: lat, lon: lon, type: rec.type || '', risk: rec.risk || 'High', conf: rec.conf != null ? rec.conf : null, dist: rec.dist != null ? rec.dist : null, days: rec.days != null ? rec.days : null, source: rec.source || '', dateS: rec.dateS || '', date: d0, frp: rec.frp || '', acqTime: rec.acqTime || '' },
      created: now, ref: 'FW-SOS-' + now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + '-' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + '-' + String(rec.id || 'PT').replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase(),
      dateIso: d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate()), place: null, placeStatus: 'pending', resp: null, px: null, cc: '', operator: op.op || '', contact: op.contact || '', extra: '', log: [], text: '' };
    /* Country from the record's region when we have it */
    if (rec.region) { var c = rec.region.split(',').pop().trim().toLowerCase(); if (COUNTRY_CODE[c]) S.cc = COUNTRY_CODE[c]; else if (/india$/i.test(rec.region)) S.cc = 'in'; }
    var root = V.root;
    var navA = $('#sos-navigate', root); if (navA) navA.href = 'respond.html?' + (/^FW-\d{4}$/.test(S.rec.id) ? 'id=' + S.rec.id : 'lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5) + '&name=' + encodeURIComponent(S.rec.id) + '&risk=' + encodeURIComponent(S.rec.risk));
    $('#sos-title', root).textContent = (S.rec.id !== 'POINT' ? S.rec.id + ' · ' : '') + (rec.region || rec.place || lat.toFixed(4) + ', ' + lon.toFixed(4));
    $('.sos-sub', root).textContent = S.ref + ' · ' + stampUtc(now);
    var pri = $('.sos-pri', root); pri.textContent = S.rec.risk === 'Critical' ? 'P1 immediate' : S.rec.risk === 'High' ? 'P2 urgent' : 'P3 advisory'; pri.className = 'sos-pri mono ' + (S.rec.risk === 'Critical' ? 'p1' : S.rec.risk === 'High' ? 'p2' : 'p3');
    $('.sos-op', root).value = S.operator; $('.sos-contact', root).value = S.contact; $('.sos-extra', root).value = ''; $('.sos-emails', root).value = ''; $('.sos-phones', root).value = ''; $('.sos-ok', root).checked = false;
    try { $('.sos-hook', root).value = localStorage.getItem(STORE_HOOK) || ''; } catch (e) { }
    $('.sos-log', root).innerHTML = ''; $('.sos-recips', root).innerHTML = '<p class="small">Looking up the nearest fire stations, hospitals and police.</p>'; $('.sos-calls', root).innerHTML = '';
    root.hidden = false; document.body.classList.add('sos-open'); gate(); render();
    status(S.rec.risk === 'Critical' || S.rec.risk === 'High' ? 'Drafting from live sources' : 'Note: this record is ' + S.rec.risk + '; SOS is meant for Critical and High', S.rec.risk === 'Critical' || S.rec.risk === 'High' ? 'busy' : 'warn');
    if (S.rec.region && S.cc) paintRecips();
    place(lat, lon).then(function (p) { S.place = p; S.placeStatus = p ? 'ok' : 'failed'; if (p && p.cc) S.cc = p.cc; render(); paintRecips(); });
    pixels(lat, lon).then(function (px) { S.px = px; render(); });
    responders(lat, lon).then(function (rp) { S.resp = rp; render(); paintRecips(); status(rp.ok ? 'Brief ready. Fill in the operator line, tick the confirmation, then send.' : 'Brief ready without the OpenStreetMap responder list. Fill in the operator line, then send.', rp.ok ? 'ok' : 'warn'); log('Brief drafted for ' + S.rec.id); });
    setTimeout(function () { $('.sos-op', root).focus(); }, 80);
  }
  function close() { if (!V || V.root.hidden) return; V.root.hidden = true; document.body.classList.remove('sos-open'); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sos]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = b.getAttribute('data-sos'), rec = null;
    if (window.FW_API && window.FW_API.rows) rec = window.FW_API.rows.filter(function (r) { return r.id === id; })[0];
    if (!rec) { try { rec = JSON.parse(id); } catch (err) { rec = null; } }
    if (rec) open(rec);
  }, true);
  window.FW_SOS = { open: open, close: close, build: function (rec) { return rec; } };
})();
