/* FireWatch Report: a print-friendly situation report built in the browser from the feed, the priority trend,
   the alert centre and the SOS dispatch log. Print to paper or PDF, or save as HTML, Word, Excel, CSV, JSON,
   Markdown or plain text. Nothing leaves the machine. */
(function () {
  'use strict';
  var root = document.getElementById('report'); if (!root) return;
  var API = window.FW_API || {}, ROWS = API.rows || [], MON = API.mon || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var toast = API.toast || function () { };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function fmtUtc(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC'; }
  function fmtLocal(d) { return pad(d.getDate()) + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function detUtc(x) { if (!x.acqTime) return fmtUtc(x.date); return x.date.getFullYear() + '-' + pad(x.date.getMonth() + 1) + '-' + pad(x.date.getDate()) + ' ' + x.acqTime.slice(0, 2) + ':' + x.acqTime.slice(2, 4) + ' UTC'; }
  var STORE = 'fw.report.pref';

  /* ------------------------------------------------------------------ */
  /* Controls                                                            */
  /* ------------------------------------------------------------------ */
  var S = { scope: 'all', region: '', record: '', secs: {}, by: '', org: '', to: '', title: '', cls: 'Official use', dark: false, ref: '' };
  try { var sp = JSON.parse(localStorage.getItem(STORE) || 'null'); if (sp) { S.by = sp.by || ''; S.org = sp.org || ''; S.to = sp.to || ''; } } catch (e) { }
  var regions = (function () { var m = {}; ROWS.forEach(function (r) { m[r.region] = (m[r.region] || 0) + 1; }); return Object.keys(m).sort(function (a, b) { var ai = /India$/.test(a), bi = /India$/.test(b); if (ai !== bi) return ai ? -1 : 1; return m[b] - m[a] || a.localeCompare(b); }).map(function (k) { return { name: k, n: m[k] }; }); })();
  $('#rp-region').innerHTML = regions.map(function (r) { return '<option value="' + esc(r.name) + '">' + esc(r.name) + ' · ' + r.n + '</option>'; }).join('');
  $('#rp-record').innerHTML = ROWS.map(function (r) { return '<option value="' + r.id + '">' + r.id + ' · ' + esc(r.region) + ' · ' + r.risk + '</option>'; }).join('');
  $('#rp-by').value = S.by; $('#rp-org').value = S.org; $('#rp-for').value = S.to;
  $$('.sg[data-scope]').forEach(function (b) { b.addEventListener('click', function () { S.scope = b.getAttribute('data-scope'); $$('.sg[data-scope]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); }); $('#rp-region-wrap').hidden = S.scope !== 'region'; $('#rp-record-wrap').hidden = S.scope !== 'record'; build(); }); });
  $('#rp-region').addEventListener('change', build); $('#rp-record').addEventListener('change', build);
  $$('.rp-secs input').forEach(function (c) { c.addEventListener('change', build); });
  ['#rp-by', '#rp-org', '#rp-for', '#rp-title'].forEach(function (id) { $(id).addEventListener('input', function () { S.by = $('#rp-by').value.trim(); S.org = $('#rp-org').value.trim(); S.to = $('#rp-for').value.trim(); S.title = $('#rp-title').value.trim(); try { localStorage.setItem(STORE, JSON.stringify({ by: S.by, org: S.org, to: S.to })); } catch (e) { } debounce(); }); });
  $('#rp-class').addEventListener('change', build);
  $('#rp-dark').addEventListener('change', function () { $('#rp-paperwrap').classList.toggle('dark', $('#rp-dark').checked); });
  $('#rp-build').addEventListener('click', build);
  $$('[data-out]').forEach(function (b) { b.addEventListener('click', function () { output(b.getAttribute('data-out')); }); });
  var dT = null; function debounce() { clearTimeout(dT); dT = setTimeout(build, 350); }

  /* ------------------------------------------------------------------ */
  /* Data                                                                */
  /* ------------------------------------------------------------------ */
  function scopeRows() {
    S.region = $('#rp-region').value; S.record = $('#rp-record').value;
    if (S.scope === 'india') return ROWS.filter(function (r) { return r.india; });
    if (S.scope === 'queue') return ROWS.filter(function (r) { return r.risk === 'Critical' || r.risk === 'High'; });
    if (S.scope === 'region') return ROWS.filter(function (r) { return r.region === S.region; });
    if (S.scope === 'record') return ROWS.filter(function (r) { return r.id === S.record; });
    return ROWS.slice();
  }
  function scopeLabel() { return S.scope === 'india' ? 'India' : S.scope === 'queue' ? 'Escalation queue, Critical and High' : S.scope === 'region' ? S.region : S.scope === 'record' ? 'Record ' + S.record : 'Whole sample feed, world'; }
  function collect() {
    var rows = scopeRows(), now = new Date();
    S.cls = $('#rp-class').value; S.secs = {}; $$('.rp-secs input').forEach(function (c) { S.secs[c.getAttribute('data-sec')] = c.checked; });
    S.ref = 'FW-RPT-' + now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + '-' + pad(now.getUTCHours()) + pad(now.getUTCMinutes());
    var esc_ = rows.filter(function (r) { return r.risk === 'Critical' || r.risk === 'High'; }), crit = rows.filter(function (r) { return r.risk === 'Critical'; }), top = rows.filter(function (r) { return r.pri && r.pri.top; });
    var byRegion = {}; rows.forEach(function (r) { var o = byRegion[r.region] = byRegion[r.region] || { n: 0, esc: 0, crit: 0, top: 0 }; o.n++; if (r.risk === 'Critical' || r.risk === 'High') o.esc++; if (r.risk === 'Critical') o.crit++; if (r.pri && r.pri.top) o.top++; });
    var regionsList = Object.keys(byRegion).map(function (k) { return { region: k, n: byRegion[k].n, esc: byRegion[k].esc, crit: byRegion[k].crit, top: byRegion[k].top }; }).sort(function (a, b) { return b.crit - a.crit || b.esc - a.esc || b.n - a.n; });
    var types = ['Industrial Fire', 'Agricultural Burning', 'Other/Natural'], risks = ['Critical', 'High', 'Medium', 'Low'], matrix = types.map(function (t) { return { type: t, cells: risks.map(function (k) { return rows.filter(function (r) { return r.type === t && r.risk === k; }).length; }), total: rows.filter(function (r) { return r.type === t; }).length }; });
    var days = {}; rows.forEach(function (r) { var k = r.date.getFullYear() + '-' + pad(r.date.getMonth() + 1) + '-' + pad(r.date.getDate()); var o = days[k] = days[k] || { n: 0, esc: 0 }; o.n++; if (r.risk === 'Critical' || r.risk === 'High') o.esc++; });
    var dayList = Object.keys(days).sort().map(function (k) { return { day: k, n: days[k].n, esc: days[k].esc }; });
    var ids = {}; rows.forEach(function (r) { ids[r.id] = 1; });
    var alerts = []; if (window.FW_ALERTS) { var al = window.FW_ALERTS.list(); Object.keys(al).forEach(function (k) { var a = al[k]; if (a.closed) return; if (a.recId && !ids[a.recId] && S.scope !== 'all') return; alerts.push(a); }); alerts.sort(function (a, b) { return b.updatedAt - a.updatedAt; }); }
    var sos = []; try { sos = JSON.parse(localStorage.getItem('fw.sos.log') || '[]'); } catch (e) { }
    if (S.scope !== 'all') sos = sos.filter(function (l) { return Object.keys(ids).some(function (id) { return l.indexOf(id) >= 0; }); });
    var prio = esc_.slice().sort(function (a, b) { return ((b.pri && b.pri.top ? 1 : 0) - (a.pri && a.pri.top ? 1 : 0)) || ((b.pri ? b.pri.score : 0) - (a.pri ? a.pri.score : 0)) || (b.conf - a.conf); });
    var dates = rows.map(function (r) { return r.date.getTime(); }), win = rows.length ? fmtLocal(new Date(Math.min.apply(null, dates))).split(',')[0] + ' to ' + fmtLocal(new Date(Math.max.apply(null, dates))).split(',')[0] : 'n/a';
    var bbox = rows.length ? { s: Math.min.apply(null, rows.map(function (r) { return r.lat; })), n: Math.max.apply(null, rows.map(function (r) { return r.lat; })), w: Math.min.apply(null, rows.map(function (r) { return r.lon; })), e: Math.max.apply(null, rows.map(function (r) { return r.lon; })) } : null;
    return { rows: rows, escalated: esc_, critical: crit, top: top, regions: regionsList, matrix: matrix, types: types, risks: risks, days: dayList, alerts: alerts, sos: sos, prio: prio, window: win, bbox: bbox, now: now, near: rows.filter(function (r) { return r.dist <= 3; }).length, rec: rows.filter(function (r) { return r.days >= 3; }).length, live: rows.filter(function (r) { return r.live && r.live.n; }).length };
  }

  /* ------------------------------------------------------------------ */
  /* Map for paper: Esri light export in plain lat/lon, dots overlaid    */
  /* ------------------------------------------------------------------ */
  function mapBlock(D) {
    if (!D.bbox) return '';
    var b = D.bbox, padLat = Math.max(1.5, (b.n - b.s) * 0.15), padLon = Math.max(1.5, (b.e - b.w) * 0.15);
    var s = Math.max(-60, b.s - padLat), n = Math.min(80, b.n + padLat), w = Math.max(-180, b.w - padLon), e = Math.min(180, b.e + padLon);
    if (D.rows.length === 1) { s = b.s - 1.2; n = b.n + 1.2; w = b.w - 1.6; e = b.e + 1.6; }
    var W = 1000, H = Math.round(W * (n - s) / Math.max(0.01, e - w)); if (H > 700) { H = 700; var span = 700 / W * (e - w), mid = (n + s) / 2; s = mid - span / 2; n = mid + span / 2; }
    var bb = w.toFixed(4) + ',' + s.toFixed(4) + ',' + e.toFixed(4) + ',' + n.toFixed(4);
    var base = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/export?bbox=' + bb + '&bboxSR=4326&imageSR=4326&size=' + W + ',' + H + '&format=png&transparent=false&f=image';
    var ref = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/export?bbox=' + bb + '&bboxSR=4326&imageSR=4326&size=' + W + ',' + H + '&format=png32&transparent=true&f=image';
    var COL = { Critical: '#C93C3C', High: '#D0662B', Medium: '#B88A1F', Low: '#3F8F69' };
    var dots = D.rows.slice().sort(function (a, b) { return ({ Critical: 3, High: 2, Medium: 1, Low: 0 })[a.risk] - ({ Critical: 3, High: 2, Medium: 1, Low: 0 })[b.risk]; }).map(function (r) { var x = (r.lon - w) / (e - w) * W, y = (n - r.lat) / (n - s) * H; var rad = r.risk === 'Critical' ? 7 : r.risk === 'High' ? 6 : 4.5; return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rad + '" fill="' + COL[r.risk] + '" stroke="#fff" stroke-width="1.2"/>' + (r.pri && r.pri.top ? '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="11" fill="none" stroke="' + COL.Critical + '" stroke-width="1.2"/>' : ''); }).join('');
    var labels = D.rows.length <= 12 ? D.rows.map(function (r) { var x = (r.lon - w) / (e - w) * W, y = (n - r.lat) / (n - s) * H; return '<text x="' + (x + 10).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" font-size="12" font-family="IBM Plex Mono, monospace" fill="#222">' + esc(r.id) + '</text>'; }).join('') : '';
    return '<figure class="rp-map"><div class="rp-mapbox" style="aspect-ratio:' + W + '/' + H + '"><img src="' + base + '" alt="" width="' + W + '" height="' + H + '"><img src="' + ref + '" alt="" width="' + W + '" height="' + H + '" class="ref"><svg viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' + dots + labels + '</svg></div><figcaption>Detections in scope on an equirectangular map, ' + s.toFixed(1) + '° to ' + n.toFixed(1) + '° N and ' + w.toFixed(1) + '° to ' + e.toFixed(1) + '° E. Red Critical, orange High, amber Medium, green Low; a ring marks a top-priority site. Map © Esri, HERE, Garmin, OpenStreetMap contributors.</figcaption></figure>';
  }

  /* ------------------------------------------------------------------ */
  /* Report body (HTML)                                                  */
  /* ------------------------------------------------------------------ */
  function table(head, rows, cls) { return '<table class="rp-t' + (cls ? ' ' + cls : '') + '"><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (typeof c === 'number' ? ' class="num"' : '') + '>' + (typeof c === 'string' && c.indexOf('<') === 0 ? c : esc(c)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; }
  function body(D) {
    var h = [], sec = S.secs, n = 1;
    var title = S.title || (S.scope === 'record' ? 'Incident report, ' + S.record : 'Industrial fire situation report');
    h.push('<header class="rp-cover"><div class="rp-brand"><span class="rp-logo"></span><span>FireWatch</span><span class="rp-cls">' + esc(S.cls) + '</span></div><h1>' + esc(title) + '</h1><p class="rp-sub">' + esc(scopeLabel()) + ' · observation window ' + esc(D.window) + '</p>' +
      '<dl class="rp-meta"><div><dt>Reference</dt><dd>' + S.ref + '</dd></div><div><dt>Generated</dt><dd>' + fmtUtc(D.now) + ' · ' + fmtLocal(D.now) + ' local</dd></div><div><dt>Prepared by</dt><dd>' + esc(S.by || '—') + (S.org ? ', ' + esc(S.org) : '') + '</dd></div><div><dt>Prepared for</dt><dd>' + esc(S.to || '—') + '</dd></div><div><dt>Sources</dt><dd>NASA FIRMS VIIRS and MODIS detections; OpenStreetMap industrial sites; FireWatch rule engine v1.0</dd></div></dl></header>');
    if (sec.summary) {
      var v = D.critical.length ? (D.top.length ? D.top.length + ' site' + (D.top.length === 1 ? '' : 's') + ' ' + (D.top.length === 1 ? 'has' : 'have') + ' stayed Critical across repeated passes and should be verified on the ground first.' : D.critical.length + ' Critical finding' + (D.critical.length === 1 ? '' : 's') + ' require ground verification within 24 hours.') : (D.escalated.length ? 'No Critical findings; ' + D.escalated.length + ' High finding' + (D.escalated.length === 1 ? '' : 's') + ' go into the next inspection round.' : 'No escalated findings in scope.');
      h.push('<section><h2>' + (n++) + '. Summary</h2><p class="rp-lead">' + esc(v) + '</p><div class="rp-kpis">' + [[D.rows.length, 'detections in scope'], [D.escalated.length, 'escalated, Critical and High'], [D.critical.length, 'Critical'], [D.top.length, 'top priority, sustained Critical'], [D.near, 'within 3 km of mapped industry'], [D.rec, 'recurring, 3 or more days'], [D.live, 'confirmed by a live pass this session']].map(function (k) { return '<div><b>' + k[0] + '</b><span>' + esc(k[1]) + '</span></div>'; }).join('') + '</div></section>');
    }
    if (sec.map) h.push('<section><h2>' + (n++) + '. Map</h2>' + mapBlock(D) + '</section>');
    if (sec.priority) h.push('<section><h2>' + (n++) + '. Priority list</h2><p>Critical and High findings ordered by the priority trend: top-priority sites first, then priority score, then confidence. Detection time is the satellite pass in UTC.</p>' + (D.prio.length ? table(['#', 'Record', 'Region', 'Type', 'Risk', 'Conf.', 'Days', 'Industry km', 'Priority', 'Trend', 'Detected (UTC)', 'Handling'], D.prio.map(function (r, i) { var vd = API.verdict ? API.verdict(r.dist, r.days, r.conf) : null; return [i + 1, r.id + (r.pri && r.pri.top ? ' ★' : ''), r.region, r.type, r.risk, r.conf + '%', r.days, r.dist.toFixed(1), r.pri ? r.pri.score : '', r.pri ? r.pri.trend : '', detUtc(r), vd ? vd.handle : '']; }), 'small') + '<p class="rp-fn">★ top priority: Critical on 3 or more observed days and returned on 5 or more distinct days.</p>' : '<p class="rp-empty">No Critical or High findings in scope.</p>') + '</section>');
    if (sec.regions) h.push('<section><h2>' + (n++) + '. Regional breakdown</h2>' + table(['Region', 'Detections', 'Escalated', 'Critical', 'Top priority'], D.regions.map(function (r) { return [r.region, r.n, r.esc, r.crit, r.top]; })) + '</section>');
    if (sec.classes) h.push('<section><h2>' + (n++) + '. Classification matrix</h2>' + table(['Cause \\ Risk'].concat(D.risks).concat(['Total']), D.matrix.map(function (m) { return [m.type].concat(m.cells).concat([m.total]); }).concat([['Total'].concat(D.risks.map(function (k) { return D.rows.filter(function (r) { return r.risk === k; }).length; })).concat([D.rows.length])])) + '<p class="rp-fn">Cause follows the proximity rule: within 3 km of a mapped industrial site is Industrial Fire; otherwise confidence 40 or more is Agricultural Burning, below that Other/Natural.</p></section>');
    if (sec.days) h.push('<section><h2>' + (n++) + '. Detections by day</h2>' + table(['Day', 'Received', 'Escalated', 'Held back'], D.days.map(function (d) { return [d.day, d.n, d.esc, d.n - d.esc]; })) + '</section>');
    if (sec.alerts) h.push('<section><h2>' + (n++) + '. Alert log</h2><p>Alerts raised by the FireWatch alert centre in this browser. Detected is the satellite pass; Raised and Updated are local times.</p>' + (D.alerts.length ? table(['Kind', 'Alert', 'Record', 'Level', 'Detected (UTC)', 'Raised (local)', 'Updated (local)', 'Last change', 'Ack.'], D.alerts.map(function (a) { return [a.kind, a.title, a.recId || '', a.level, fmtUtc(new Date(a.detectedAt)), fmtLocal(new Date(a.raisedAt)), fmtLocal(new Date(a.updatedAt)), a.history && a.history.length ? a.history[a.history.length - 1].m : '', a.ack ? 'yes' : 'no']; }), 'small') : '<p class="rp-empty">No alerts recorded in this browser for the scope.</p>') + '</section>');
    if (sec.sos) h.push('<section><h2>' + (n++) + '. SOS dispatch log</h2>' + (D.sos.length ? '<ul class="rp-log">' + D.sos.slice(-60).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '<p class="rp-empty">No SOS actions recorded in this browser for the scope.</p>') + '</section>');
    if (sec.records) h.push('<section><h2>' + (n++) + '. Records</h2>' + table(['Record', 'Lat', 'Lon', 'Region', 'Type', 'Risk', 'Conf.', 'Days', 'Industry km', 'Source', 'Detected (UTC)'], D.rows.map(function (r) { return [r.id, r.lat.toFixed(4), r.lon.toFixed(4), r.region, r.type, r.risk, r.conf + '%', r.days, r.dist.toFixed(1), r.source, detUtc(r)]; }), 'small') + '</section>');
    if (sec.method) h.push('<section class="rp-method"><h2>' + (n++) + '. Method and thresholds</h2><ol><li><b>Proximity.</b> Distance from the detection to the nearest mapped industrial site (OpenStreetMap landuse=industrial, man_made=works, power=plant) is 3 km or less.</li><li><b>Persistence.</b> The same pixel has returned on 3 or more distinct days.</li><li><b>Confidence.</b> The sensor\'s own confidence on one 0 to 100 scale; VIIRS low, nominal and high are read as 35, 65 and 90.</li><li><b>Tiers.</b> Proximity holds: Critical when persistent and confidence 85 or more, High when persistent or confidence 65 or more, otherwise Medium. Proximity fails: Agricultural Burning (Medium) at confidence 40 or more, otherwise Other/Natural (Low).</li><li><b>Handling.</b> Critical: ground verification within 24 hours. High: next scheduled inspection round. Medium: watched. Low: logged.</li><li><b>Priority trend.</b> Score = tier (40/25/8) + 4 per distinct day up to 10 + 10 or 15 for 3 or 5 consecutive observed days in the High or Critical zone + 5 for confidence 85 or more, plus live-pass bonuses; capped at 100. Top priority: Critical on 3 or more observed days and returned on 5 or more, or live passes on 3 of the last 7 days.</li></ol></section>');
    if (sec.signoff) h.push('<section class="rp-sign"><div><span>Prepared by</span><b>' + esc(S.by || ' ') + '</b><i>' + esc(S.org || ' ') + '</i></div><div><span>Reviewed by</span><b>&nbsp;</b><i>Signature and date</i></div><div><span>Received by</span><b>' + esc(S.to || ' ') + '</b><i>Signature and date</i></div></section>');
    h.push('<footer class="rp-foot">' + S.ref + ' · FireWatch release 1.0 · generated ' + fmtUtc(D.now) + '</footer>');
    return h.join('');
  }

  /* ------------------------------------------------------------------ */
  /* Paper CSS for standalone files                                      */
  /* ------------------------------------------------------------------ */
  var PAPER_CSS = 'body{margin:0;background:#fff;color:#111;font-family:"IBM Plex Sans","Segoe UI",Arial,sans-serif;font-size:11pt;line-height:1.5}.rp-paper{max-width:190mm;margin:0 auto;padding:16mm 14mm}.rp-cover{border-bottom:2px solid #111;padding-bottom:10pt;margin-bottom:14pt}.rp-brand{display:flex;align-items:center;gap:8pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:9pt}.rp-logo{width:12pt;height:12pt;border:1.5pt solid #F08A3C;border-radius:50%;display:inline-block;position:relative}.rp-logo::after{content:"";position:absolute;left:3pt;top:3pt;width:3pt;height:3pt;border-radius:50%;background:#F08A3C}.rp-cls{margin-left:auto;border:1pt solid #111;padding:1pt 6pt;border-radius:3pt}h1{font-family:Archivo,"Helvetica Neue",Arial,sans-serif;font-size:22pt;margin:10pt 0 4pt;line-height:1.1}h2{font-family:Archivo,"Helvetica Neue",Arial,sans-serif;font-size:13pt;margin:18pt 0 6pt;border-bottom:1pt solid #ccc;padding-bottom:3pt;page-break-after:avoid}.rp-sub{margin:0;color:#444}.rp-meta{display:grid;grid-template-columns:1fr 1fr;gap:4pt 18pt;margin:10pt 0 0;font-size:9.5pt}.rp-meta div{display:flex;gap:6pt}.rp-meta dt{margin:0;color:#666;min-width:64pt}.rp-meta dd{margin:0}.rp-lead{font-size:12pt;font-weight:500}.rp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6pt;margin-top:8pt}.rp-kpis div{border:1pt solid #ddd;border-radius:4pt;padding:6pt 8pt}.rp-kpis b{display:block;font-family:"IBM Plex Mono",Menlo,monospace;font-size:16pt}.rp-kpis span{font-size:8.5pt;color:#555;text-transform:uppercase;letter-spacing:.06em}.rp-t{width:100%;border-collapse:collapse;font-size:9.5pt;margin-top:6pt;page-break-inside:auto}.rp-t.small{font-size:8.2pt}.rp-t th{text-align:left;background:#f1f1f1;border-bottom:1pt solid #999;padding:4pt 5pt;font-weight:600}.rp-t td{border-bottom:.6pt solid #ddd;padding:3.5pt 5pt;vertical-align:top}.rp-t td.num{text-align:right;font-family:"IBM Plex Mono",Menlo,monospace}.rp-t tr{page-break-inside:avoid}.rp-fn{font-size:8.5pt;color:#555;margin-top:4pt}.rp-empty{color:#666;font-style:italic}.rp-map{margin:8pt 0 0}.rp-mapbox{position:relative;width:100%;border:1pt solid #ccc;overflow:hidden;background:#eee}.rp-mapbox img{position:absolute;inset:0;width:100%;height:100%;display:block}.rp-mapbox svg{position:absolute;inset:0;width:100%;height:100%}.rp-map figcaption{font-size:8.5pt;color:#555;margin-top:4pt}.rp-log{font-family:"IBM Plex Mono",Menlo,monospace;font-size:8.5pt;padding-left:14pt;margin:6pt 0}.rp-method ol{padding-left:16pt}.rp-method li{margin:3pt 0}.rp-sign{display:grid;grid-template-columns:repeat(3,1fr);gap:12pt;margin-top:28pt;page-break-inside:avoid}.rp-sign div{border-top:1pt solid #111;padding-top:6pt;min-height:48pt}.rp-sign span{display:block;font-size:8.5pt;color:#666;text-transform:uppercase;letter-spacing:.06em}.rp-sign b{display:block;margin-top:14pt}.rp-sign i{display:block;font-size:8.5pt;color:#666;font-style:normal}.rp-foot{margin-top:24pt;padding-top:6pt;border-top:1pt solid #ccc;font-size:8pt;color:#666;font-family:"IBM Plex Mono",Menlo,monospace}@page{size:A4;margin:14mm}@media print{.rp-paper{max-width:none;padding:0}}';

  /* ------------------------------------------------------------------ */
  /* Build and outputs                                                   */
  /* ------------------------------------------------------------------ */
  var D = null;
  function build() { D = collect(); $('#rp-paper').innerHTML = body(D); $('#rp-ref').textContent = S.ref + ' · ' + D.rows.length + ' records'; $('#rp-status').textContent = 'Preview refreshed ' + fmtLocal(new Date()) + '. ' + Object.keys(S.secs).filter(function (k) { return S.secs[k]; }).length + ' sections.'; }
  function fileName(ext) { return (S.ref + (S.scope === 'record' ? '-' + S.record : S.scope === 'region' ? '-' + S.region.split(',')[0].replace(/\s+/g, '_') : S.scope === 'india' ? '-India' : S.scope === 'queue' ? '-queue' : '')).replace(/[^A-Za-z0-9_-]/g, '') + '.' + ext; }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); toast('Saved ' + name + ' to your downloads.'); }
  function standaloneHtml() { return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(S.ref) + ' · FireWatch report</title><style>' + PAPER_CSS + '</style></head><body><article class="rp-paper">' + $('#rp-paper').innerHTML + '</article></body></html>'; }
  function wordHtml() { return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(S.ref) + '</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]--><style>' + PAPER_CSS.replace(/@page[^}]*}/g, '').replace(/\.rp-mapbox\{[^}]*\}/, '.rp-mapbox{position:relative;width:100%}') + ' .rp-mapbox img{position:static;width:100%;height:auto} .rp-mapbox img.ref,.rp-mapbox svg{display:none} .rp-kpis,.rp-meta,.rp-sign{display:block} .rp-kpis div{display:inline-block;width:23%;margin:2pt}</style></head><body><article class="rp-paper">' + $('#rp-paper').innerHTML + '</article></body></html>'; }
  function csvText() { var head = ['record', 'lat', 'lon', 'region', 'type', 'risk', 'confidence', 'days_seen', 'distance_km', 'source', 'detected_utc', 'priority_score', 'trend', 'top_priority']; var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }; return [head.join(',')].concat(D.rows.map(function (r) { return [r.id, r.lat, r.lon, q(r.region), q(r.type), r.risk, r.conf, r.days, r.dist, q(r.source), q(detUtc(r)), r.pri ? r.pri.score : '', r.pri ? r.pri.trend : '', r.pri && r.pri.top ? 'yes' : 'no'].join(','); })).join('\r\n'); }
  function xlsHtml() {
    var sheet = function (name, head, rows) { return '<h2>' + esc(name) + '</h2>' + table(head, rows); };
    var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>table{border-collapse:collapse}th{background:#eee;font-weight:bold}td,th{border:1px solid #999;padding:2px 6px;mso-number-format:"\\@"}td.num{mso-number-format:"0";text-align:right}</style></head><body>' +
      '<h1>' + esc(S.ref) + ' · ' + esc(scopeLabel()) + ' · generated ' + fmtUtc(D.now) + '</h1>' +
      sheet('Records', ['Record', 'Lat', 'Lon', 'Region', 'Type', 'Risk', 'Confidence', 'Days seen', 'Industry km', 'Source', 'Detected UTC', 'Priority', 'Trend', 'Top priority'], D.rows.map(function (r) { return [r.id, r.lat, r.lon, r.region, r.type, r.risk, r.conf, r.days, r.dist, r.source, detUtc(r), r.pri ? r.pri.score : 0, r.pri ? r.pri.trend : '', r.pri && r.pri.top ? 'yes' : 'no']; })) +
      sheet('Regions', ['Region', 'Detections', 'Escalated', 'Critical', 'Top priority'], D.regions.map(function (r) { return [r.region, r.n, r.esc, r.crit, r.top]; })) +
      sheet('By day', ['Day', 'Received', 'Escalated', 'Held back'], D.days.map(function (d) { return [d.day, d.n, d.esc, d.n - d.esc]; })) +
      sheet('Alerts', ['Kind', 'Alert', 'Record', 'Level', 'Detected UTC', 'Raised local', 'Updated local', 'Last change', 'Acknowledged'], D.alerts.map(function (a) { return [a.kind, a.title, a.recId || '', a.level, fmtUtc(new Date(a.detectedAt)), fmtLocal(new Date(a.raisedAt)), fmtLocal(new Date(a.updatedAt)), a.history && a.history.length ? a.history[a.history.length - 1].m : '', a.ack ? 'yes' : 'no']; })) +
      '</body></html>';
    return html;
  }
  function mdText() {
    var L = [], sec = S.secs, n = 1, title = S.title || (S.scope === 'record' ? 'Incident report, ' + S.record : 'Industrial fire situation report');
    var row = function (arr) { return '| ' + arr.map(function (c) { return String(c == null ? '' : c).replace(/\|/g, '\\|'); }).join(' | ') + ' |'; }, sepr = function (k) { return '|' + new Array(k + 1).join(' --- |'); };
    L.push('# ' + title, '', '**FireWatch** · ' + S.cls + ' · Reference ' + S.ref, '', '- Scope: ' + scopeLabel(), '- Observation window: ' + D.window, '- Generated: ' + fmtUtc(D.now) + ' (' + fmtLocal(D.now) + ' local)', '- Prepared by: ' + (S.by || '—') + (S.org ? ', ' + S.org : ''), '- Prepared for: ' + (S.to || '—'), '- Sources: NASA FIRMS VIIRS and MODIS; OpenStreetMap industrial sites; FireWatch rule engine v1.0', '');
    if (sec.summary) { L.push('## ' + (n++) + '. Summary', '', row(['Detections', 'Escalated', 'Critical', 'Top priority', 'Within 3 km', 'Recurring', 'Live confirmed']), sepr(7), row([D.rows.length, D.escalated.length, D.critical.length, D.top.length, D.near, D.rec, D.live]), ''); }
    if (sec.priority) { L.push('## ' + (n++) + '. Priority list', '', row(['#', 'Record', 'Region', 'Type', 'Risk', 'Conf', 'Days', 'Industry km', 'Priority', 'Trend', 'Detected UTC']), sepr(11)); D.prio.forEach(function (r, i) { L.push(row([i + 1, r.id + (r.pri && r.pri.top ? ' *' : ''), r.region, r.type, r.risk, r.conf + '%', r.days, r.dist.toFixed(1), r.pri ? r.pri.score : '', r.pri ? r.pri.trend : '', detUtc(r)])); }); L.push(''); }
    if (sec.regions) { L.push('## ' + (n++) + '. Regional breakdown', '', row(['Region', 'Detections', 'Escalated', 'Critical', 'Top priority']), sepr(5)); D.regions.forEach(function (r) { L.push(row([r.region, r.n, r.esc, r.crit, r.top])); }); L.push(''); }
    if (sec.classes) { L.push('## ' + (n++) + '. Classification matrix', '', row(['Cause'].concat(D.risks).concat(['Total'])), sepr(D.risks.length + 2)); D.matrix.forEach(function (m) { L.push(row([m.type].concat(m.cells).concat([m.total]))); }); L.push(''); }
    if (sec.days) { L.push('## ' + (n++) + '. Detections by day', '', row(['Day', 'Received', 'Escalated', 'Held back']), sepr(4)); D.days.forEach(function (d) { L.push(row([d.day, d.n, d.esc, d.n - d.esc])); }); L.push(''); }
    if (sec.alerts) { L.push('## ' + (n++) + '. Alert log', '', row(['Kind', 'Alert', 'Record', 'Level', 'Detected UTC', 'Raised local', 'Updated local', 'Last change']), sepr(8)); D.alerts.forEach(function (a) { L.push(row([a.kind, a.title, a.recId || '', a.level, fmtUtc(new Date(a.detectedAt)), fmtLocal(new Date(a.raisedAt)), fmtLocal(new Date(a.updatedAt)), a.history && a.history.length ? a.history[a.history.length - 1].m : ''])); }); L.push(''); }
    if (sec.sos) { L.push('## ' + (n++) + '. SOS dispatch log', ''); D.sos.slice(-60).forEach(function (l) { L.push('- ' + l); }); L.push(''); }
    if (sec.records) { L.push('## ' + (n++) + '. Records', '', row(['Record', 'Lat', 'Lon', 'Region', 'Type', 'Risk', 'Conf', 'Days', 'Industry km', 'Source', 'Detected UTC']), sepr(11)); D.rows.forEach(function (r) { L.push(row([r.id, r.lat.toFixed(4), r.lon.toFixed(4), r.region, r.type, r.risk, r.conf + '%', r.days, r.dist.toFixed(1), r.source, detUtc(r)])); }); L.push(''); }
    if (sec.method) { L.push('## ' + (n++) + '. Method and thresholds', '', '1. Proximity: nearest mapped industrial site 3 km or less.', '2. Persistence: returned on 3 or more distinct days.', '3. Confidence: 0 to 100; VIIRS low, nominal, high read as 35, 65, 90.', '4. Tiers: proximity holds: Critical if persistent and confidence 85 or more, High if persistent or confidence 65 or more, else Medium. Proximity fails: Agricultural Burning (Medium) at 40 or more, else Other/Natural (Low).', '5. Handling: Critical, ground verification within 24 hours; High, next inspection round; Medium, watched; Low, logged.', '6. Priority trend: tier 40/25/8 + 4 per day up to 10 + 10 or 15 for 3 or 5 consecutive days in zone + 5 for confidence 85 or more, plus live-pass bonuses, capped at 100. Top priority: Critical on 3 or more observed days and returned on 5 or more, or live passes on 3 of the last 7 days.', ''); }
    if (sec.signoff) L.push('---', '', 'Prepared by: ' + (S.by || '________________') + (S.org ? ', ' + S.org : ''), '', 'Reviewed by: ________________  Date: ________', '', 'Received by: ' + (S.to || '________________') + '  Date: ________', '');
    L.push('', S.ref + ' · FireWatch release 1.0');
    return L.join('\n');
  }
  function jsonText() {
    var strip = function (r) { return { id: r.id, lat: r.lat, lon: r.lon, region: r.region, type: r.type, risk: r.risk, confidence: r.conf, days_seen: r.days, distance_km: r.dist, source: r.source, detected_utc: detUtc(r), priority: r.pri ? { score: r.pri.score, trend: r.pri.trend, top: r.pri.top, streak: r.pri.streak } : null, live: r.live || null }; };
    return JSON.stringify({ reference: S.ref, generated_utc: D.now.toISOString(), classification: S.cls, title: S.title || null, scope: scopeLabel(), window: D.window, prepared_by: S.by, organisation: S.org, prepared_for: S.to, sources: ['NASA FIRMS VIIRS/MODIS', 'OpenStreetMap industrial sites', 'FireWatch rule engine v1.0'], summary: { detections: D.rows.length, escalated: D.escalated.length, critical: D.critical.length, top_priority: D.top.length, within_3km: D.near, recurring: D.rec, live_confirmed: D.live }, priority: D.prio.map(strip), regions: D.regions, classification_matrix: { risks: D.risks, rows: D.matrix }, by_day: D.days, alerts: D.alerts.map(function (a) { return { id: a.id, kind: a.kind, title: a.title, record: a.recId || null, level: a.level, detected_utc: new Date(a.detectedAt).toISOString(), raised: new Date(a.raisedAt).toISOString(), updated: new Date(a.updatedAt).toISOString(), acknowledged: !!a.ack, history: a.history }; }), sos_log: D.sos, records: D.rows.map(strip), method: { proximity_km: 3, persistence_days: 3, confidence_bands: { critical: 85, high: 65, agricultural: 40 }, viirs_confidence_map: { l: 35, n: 65, h: 90 } } }, null, 2);
  }
  function output(kind) {
    if (!D) build();
    if (kind === 'print') { $('#rp-paperwrap').classList.remove('dark'); $('#rp-dark').checked = false; document.body.classList.add('rp-printing'); setTimeout(function () { window.print(); setTimeout(function () { document.body.classList.remove('rp-printing'); }, 500); }, 60); return; }
    if (kind === 'html') return download(new Blob([standaloneHtml()], { type: 'text/html;charset=utf-8' }), fileName('html'));
    if (kind === 'doc') return download(new Blob(['\ufeff', wordHtml()], { type: 'application/msword;charset=utf-8' }), fileName('doc'));
    if (kind === 'xls') return download(new Blob(['\ufeff', xlsHtml()], { type: 'application/vnd.ms-excel;charset=utf-8' }), fileName('xls'));
    if (kind === 'csv') return download(new Blob(['\ufeff', csvText()], { type: 'text/csv;charset=utf-8' }), fileName('csv'));
    if (kind === 'json') return download(new Blob([jsonText()], { type: 'application/json;charset=utf-8' }), fileName('json'));
    if (kind === 'md') return download(new Blob([mdText()], { type: 'text/markdown;charset=utf-8' }), fileName('md'));
    if (kind === 'txt') return download(new Blob([mdText().replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/^\|.*---.*\|$/gm, '')], { type: 'text/plain;charset=utf-8' }), fileName('txt'));
  }
  window.addEventListener('afterprint', function () { document.body.classList.remove('rp-printing'); });

  /* Deep links: ?scope=region&q=Punjab, India · ?scope=record&id=FW-0009 · ?scope=queue */
  var qs = new URLSearchParams(location.search), sc = qs.get('scope');
  if (sc && $('.sg[data-scope="' + sc + '"]')) { S.scope = sc; $$('.sg[data-scope]').forEach(function (o) { o.setAttribute('aria-pressed', o.getAttribute('data-scope') === sc ? 'true' : 'false'); }); $('#rp-region-wrap').hidden = sc !== 'region'; $('#rp-record-wrap').hidden = sc !== 'record'; }
  if (qs.get('q')) { var opt = $$('#rp-region option').filter(function (o) { return o.value.toLowerCase().indexOf(qs.get('q').toLowerCase().split(',')[0]) >= 0; })[0]; if (opt) $('#rp-region').value = opt.value; }
  if (qs.get('id')) $('#rp-record').value = qs.get('id');
  if (qs.get('title')) { $('#rp-title').value = qs.get('title'); S.title = qs.get('title'); }
  build();
  window.FW_REPORT = { build: build, output: output, data: function () { return D; }, md: mdText, csv: csvText, json: jsonText, html: standaloneHtml };
})();
