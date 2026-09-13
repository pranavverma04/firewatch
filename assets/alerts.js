/* FireWatch Alerts: a site-wide alert centre. Raises an alert for every Critical detection, every sustained-Critical
   priority site, every live VIIRS pass confirmed at a Critical or High site, and every SOS dispatch. Each alert carries
   the detection time (satellite pass, UTC and local), the time it was raised here, and the time it was last updated.
   State lives in this browser (localStorage). Desktop notifications and a sound are opt-in. */
(function () {
  'use strict';
  var API = window.FW_API || {}, ROWS = API.rows || [], COLORS = API.colors || {}, MON = API.mon || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var reduced = API.reduced || function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var toast = API.toast || function () { };
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var STORE = 'fw.alerts.v1', PREF = 'fw.alerts.pref', FIRE_URL = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function tzName() { try { return new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(new Date()).filter(function (p) { return p.type === 'timeZoneName'; })[0].value; } catch (e) { return 'local'; } }
  var TZ = tzName();
  function fmtUtc(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC'; }
  function fmtLocal(d) { return pad(d.getDate()) + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ' + TZ; }
  function fmtLocalMin(d) { return pad(d.getDate()) + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' ' + TZ; }
  function ago(ms) { var s = Math.max(0, Math.round((Date.now() - ms) / 1000)); if (s < 60) return s + ' s ago'; var m = Math.round(s / 60); if (m < 60) return m + ' min ago'; var h = Math.round(m / 60); if (h < 48) return h + ' h ago'; return Math.round(h / 24) + ' d ago'; }
  function hav(a, b, c, d) { var R = 6371, p = Math.PI / 180, dLat = (c - a) * p, dLon = (d - b) * p; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2); return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  var state = { alerts: {}, lastVisit: 0, open: false, filter: 'all' }, pref = { notify: false, sound: false };
  try { var saved = JSON.parse(localStorage.getItem(STORE) || 'null'); if (saved && saved.alerts) { state.alerts = saved.alerts; state.lastVisit = saved.lastVisit || 0; } } catch (e) { }
  try { var sp = JSON.parse(localStorage.getItem(PREF) || 'null'); if (sp) pref = sp; } catch (e) { }
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ alerts: state.alerts, lastVisit: state.lastVisit })); } catch (e) { } }
  function savePref() { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch (e) { } }
  function detectedAt(x) { var d = new Date(x.date.getTime()); if (x.acqTime) { var hh = +x.acqTime.slice(0, 2), mm = +x.acqTime.slice(2, 4); d = new Date(Date.UTC(x.date.getFullYear(), x.date.getMonth(), x.date.getDate(), hh, mm)); } return d; }

  /* Raise or update. Returns true when something changed. */
  var newlyRaised = [];
  function raise(id, fields) {
    var now = Date.now(), a = state.alerts[id], changed = false;
    if (!a) { a = state.alerts[id] = { id: id, raisedAt: now, updatedAt: now, ack: false, history: [] }; changed = true; newlyRaised.push(id); a.history.push({ t: now, m: 'Raised' }); }
    Object.keys(fields).forEach(function (k) {
      if (k === 'note') return;
      if (JSON.stringify(a[k]) !== JSON.stringify(fields[k])) { if (a[k] !== undefined && k !== 'detectedAt') { changed = true; a.updatedAt = now; a.history.push({ t: now, m: fields.note || ('Updated ' + k) }); if (a.ack && (k === 'lastPass' || k === 'level')) a.ack = false; } a[k] = fields[k]; }
    });
    return changed;
  }

  function seedFromRows() {
    ROWS.forEach(function (x) {
      var det = detectedAt(x);
      if (x.risk === 'Critical') raise('crit:' + x.id, { kind: 'critical', level: 'Critical', recId: x.id, title: 'Critical ' + x.type.toLowerCase() + ' · ' + x.region, detectedAt: det.getTime(), lat: x.lat, lon: x.lon, conf: x.conf, days: x.days, dist: x.dist, source: x.source, note: 'Record updated' });
      if (x.pri && x.pri.top) raise('top:' + x.id, { kind: 'priority', level: 'Critical', recId: x.id, title: 'Sustained Critical · ' + x.region, detectedAt: det.getTime(), lat: x.lat, lon: x.lon, conf: x.conf, days: x.days, dist: x.dist, source: x.source, streak: x.pri.streak, score: x.pri.score, note: 'Priority changed' });
      else if (state.alerts['top:' + x.id] && !state.alerts['top:' + x.id].closed) { state.alerts['top:' + x.id].closed = true; state.alerts['top:' + x.id].updatedAt = Date.now(); state.alerts['top:' + x.id].history.push({ t: Date.now(), m: 'No longer top priority' }); }
    });
    save();
  }

  /* Live confirmation: newest VIIRS pass within 1 km of each Critical and top-priority site */
  var liveTimer = null, lastLiveRun = 0;
  function pollLive(force) {
    if (!window.fetch) return; if (!force && Date.now() - lastLiveRun < 4 * 60 * 1000) return; lastLiveRun = Date.now();
    var cand = ROWS.filter(function (x) { return x.risk === 'Critical' || (x.pri && x.pri.top); }).slice(0, 14);
    var pending = cand.length, changedAny = false; if (!pending) return;
    setStatus('Checking live passes at ' + pending + ' sites');
    cand.forEach(function (x) {
      var km = 1.2, dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(x.lat * Math.PI / 180)));
      var env = (x.lon - dLon).toFixed(4) + ',' + (x.lat - dLat).toFixed(4) + ',' + (x.lon + dLon).toFixed(4) + ',' + (x.lat + dLat).toFixed(4);
      var u = FIRE_URL + '?where=1%3D1&geometry=' + env + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=latitude,longitude,acq_date,acq_time,daynight,frp,confidence,hours_old&returnGeometry=false&resultRecordCount=300&f=json';
      var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 14000);
      fetch(u, { signal: ctl.signal }).then(function (r) { return r.json(); }).then(function (j) {
        var latest = null, n = 0;
        (j.features || []).forEach(function (f) { var a = f.attributes; if (!a || a.latitude == null || hav(x.lat, x.lon, a.latitude, a.longitude) > 1) return; n++; var t = passTime(a); if (t && (!latest || t > latest.t)) latest = { t: t, a: a }; });
        if (latest) {
          var id = 'live:' + x.id, before = state.alerts[id] ? state.alerts[id].lastPass : null;
          var ch = raise(id, { kind: 'live', level: x.risk === 'Critical' ? 'Critical' : 'High', recId: x.id, title: 'Live satellite pass confirmed · ' + x.region, detectedAt: latest.t, lastPass: latest.t, passes: n, lat: x.lat, lon: x.lon, frp: +latest.a.frp || 0, sat: latest.a.satellite || 'VIIRS', night: latest.a.daynight === 'N', conf: x.conf, days: x.days, dist: x.dist, note: 'New pass ' + fmtUtc(new Date(latest.t)) });
          if (ch && before && latest.t > before) changedAny = true; else if (ch && !before) changedAny = true;
        }
      }).catch(function () { }).finally(function () { clearTimeout(tm); pending--; if (!pending) { save(); render(); setStatus('Live check ' + fmtLocal(new Date())); if (changedAny) announce(); } });
    });
  }
  function passTime(a) { if (!a.acq_date) return null; var d = new Date(a.acq_date); if (a.acq_time != null) { var s = String(a.acq_time).padStart(4, '0'); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +s.slice(0, 2), +s.slice(2, 4))); } return d.getTime(); }

  /* SOS dispatches feed the centre */
  document.addEventListener('fw:sos', function (e) {
    var d = e.detail || {}; var id = 'sos:' + (d.ref || Date.now());
    raise(id, { kind: 'sos', level: d.risk || 'Critical', recId: d.recId || '', title: 'SOS ' + (d.action || 'drafted') + ' · ' + (d.place || d.recId || ''), detectedAt: d.detectedAt || Date.now(), lat: d.lat, lon: d.lon, ref: d.ref, action: d.action, note: d.action || 'SOS' });
    save(); render(); announce();
  });

  /* ------------------------------------------------------------------ */
  /* Notifications and sound                                             */
  /* ------------------------------------------------------------------ */
  var audioCtx = null;
  function beep() { if (!pref.sound) return; try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); var o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.0001; o.connect(g); g.connect(audioCtx.destination); var t = audioCtx.currentTime; g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.start(t); o.stop(t + 0.4); setTimeout(function () { var o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain(); o2.frequency.value = 1175; g2.gain.value = 0.0001; o2.connect(g2); g2.connect(audioCtx.destination); var t2 = audioCtx.currentTime; g2.gain.exponentialRampToValueAtTime(0.2, t2 + 0.02); g2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.35); o2.start(t2); o2.stop(t2 + 0.4); }, 180); } catch (e) { } }
  function announce() {
    var fresh = newlyRaised.splice(0).map(function (id) { return state.alerts[id]; }).filter(Boolean);
    var updated = Object.keys(state.alerts).map(function (k) { return state.alerts[k]; }).filter(function (a) { return !a.ack && a.updatedAt > lastAnnounce; });
    lastAnnounce = Date.now();
    var items = fresh.length ? fresh : updated; if (!items.length) { render(); return; }
    var top = items.sort(function (a, b) { return b.updatedAt - a.updatedAt; })[0];
    toast('Alert: ' + top.title + ' · ' + fmtUtc(new Date(top.detectedAt)) + (items.length > 1 ? ' · +' + (items.length - 1) + ' more' : ''));
    beep();
    if (pref.notify && 'Notification' in window && Notification.permission === 'granted' && document.hidden) { try { new Notification('FireWatch alert', { body: top.title + '\nDetected ' + fmtUtc(new Date(top.detectedAt)), tag: top.id }); } catch (e) { } }
    render();
  }
  var lastAnnounce = Date.now();

  /* ------------------------------------------------------------------ */
  /* UI                                                                  */
  /* ------------------------------------------------------------------ */
  var nav = $('.nav'), bell = null, drawer = null, statusEl = null;
  function build() {
    if (!nav) return;
    bell = document.createElement('button'); bell.type = 'button'; bell.className = 'al-bell'; bell.setAttribute('aria-haspopup', 'dialog'); bell.setAttribute('aria-expanded', 'false'); bell.setAttribute('aria-label', 'Alerts');
    bell.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5v2.6c0 .9-.3 1.7-.8 2.4L3.5 13.7h13l-1.2-1.7a4 4 0 0 1-.8-2.4V7A4.5 4.5 0 0 0 10 2.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 16a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span class="al-count" hidden>0</span>';
    var tog = $('.navtog', nav); nav.insertBefore(bell, tog || $('.btn', nav));
    drawer = document.createElement('aside'); drawer.className = 'al-drawer'; drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-label', 'Alerts'); drawer.hidden = true;
    drawer.innerHTML =
      '<header class="al-head"><div><span class="eyebrow">Alert centre</span><h3>Alerts</h3><p class="al-clock mono"><span class="al-now"></span></p></div><button type="button" class="al-x" aria-label="Close alerts"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></header>' +
      '<div class="al-tools"><div class="seg" role="group" aria-label="Filter"><button type="button" class="sg" data-f="all" aria-pressed="true">All</button><button type="button" class="sg" data-f="critical" aria-pressed="false">Critical</button><button type="button" class="sg" data-f="priority" aria-pressed="false">Priority</button><button type="button" class="sg" data-f="live" aria-pressed="false">Live</button><button type="button" class="sg" data-f="sos" aria-pressed="false">SOS</button></div><button type="button" class="al-readall">Mark all read</button></div>' +
      '<div class="al-prefs"><label class="ev-check"><input type="checkbox" class="al-notify"> Desktop notifications when this tab is in the background</label><label class="ev-check"><input type="checkbox" class="al-sound"> Sound on a new or updated alert</label><button type="button" class="al-refresh">Check live passes now</button><span class="al-status mono"></span></div>' +
      '<div class="al-list" role="list" aria-live="polite"></div>' +
      '<footer class="al-foot mono">Detection time is the satellite pass (UTC, with your local time). Raised is when this browser first saw the alert. Updated changes when a newer pass, a priority change or an SOS action arrives. Alerts persist in this browser only.</footer>';
    document.body.appendChild(drawer);
    statusEl = $('.al-status', drawer);
    bell.addEventListener('click', function () { setOpen(!state.open); });
    $('.al-x', drawer).addEventListener('click', function () { setOpen(false); bell.focus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) { setOpen(false); bell.focus(); } });
    document.addEventListener('pointerdown', function (e) { if (state.open && !drawer.contains(e.target) && !bell.contains(e.target)) setOpen(false); });
    $$('.sg[data-f]', drawer).forEach(function (b) { b.addEventListener('click', function () { state.filter = b.getAttribute('data-f'); $$('.sg[data-f]', drawer).forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); }); render(); }); });
    $('.al-readall', drawer).addEventListener('click', function () { Object.keys(state.alerts).forEach(function (k) { state.alerts[k].ack = true; }); save(); render(); });
    var nb = $('.al-notify', drawer), sb = $('.al-sound', drawer); nb.checked = pref.notify; sb.checked = pref.sound;
    nb.addEventListener('change', function () { if (nb.checked) { if (!('Notification' in window)) { nb.checked = false; toast('This browser has no desktop notifications.'); return; } Notification.requestPermission().then(function (p) { pref.notify = p === 'granted'; nb.checked = pref.notify; savePref(); if (!pref.notify) toast('Notification permission was not granted.'); }); } else { pref.notify = false; savePref(); } });
    sb.addEventListener('change', function () { pref.sound = sb.checked; savePref(); if (pref.sound) beep(); });
    $('.al-refresh', drawer).addEventListener('click', function () { pollLive(true); });
    drawer.addEventListener('click', function (e) { var b = e.target.closest('[data-ack]'); if (b) { var a = state.alerts[b.getAttribute('data-ack')]; if (a) { a.ack = !a.ack; save(); render(); } } });
    setInterval(function () { var n = $('.al-now', drawer); if (n && state.open) n.textContent = 'Now ' + fmtLocal(new Date()) + ' · ' + fmtUtc(new Date()); }, 1000);
  }
  function setStatus(m) { if (statusEl) statusEl.textContent = m; }
  function setOpen(o) { state.open = o; drawer.hidden = !o; bell.setAttribute('aria-expanded', o ? 'true' : 'false'); document.body.classList.toggle('al-open', o); if (o) { $('.al-now', drawer).textContent = 'Now ' + fmtLocal(new Date()) + ' · ' + fmtUtc(new Date()); render(); state.lastVisit = Date.now(); save(); } }
  function list() { return Object.keys(state.alerts).map(function (k) { return state.alerts[k]; }).filter(function (a) { return !a.closed && (state.filter === 'all' || a.kind === state.filter); }).sort(function (a, b) { return (a.ack - b.ack) || (b.updatedAt - a.updatedAt); }); }
  function render() {
    if (!drawer) return;
    var all = Object.keys(state.alerts).map(function (k) { return state.alerts[k]; }).filter(function (a) { return !a.closed; }), unread = all.filter(function (a) { return !a.ack; }).length;
    var c = $('.al-count', bell); c.textContent = unread > 99 ? '99+' : unread; c.hidden = !unread; bell.classList.toggle('has-new', unread > 0); bell.title = unread ? unread + ' unread alerts' : 'Alerts';
    if (!state.open) return;
    var items = list(), el = $('.al-list', drawer);
    if (!items.length) { el.innerHTML = '<div class="qempty" style="margin:16px">No alerts in this view.</div>'; return; }
    var sinceVisit = state.lastVisit;
    el.innerHTML = items.map(function (a) {
      var det = new Date(a.detectedAt), col = COLORS[a.level] || 'var(--risk-critical)', isNew = a.raisedAt > sinceVisit || a.updatedAt > sinceVisit;
      var kindLabel = { critical: 'Critical detection', priority: 'Top priority', live: 'Live confirmation', sos: 'SOS' }[a.kind] || a.kind;
      var extra = a.kind === 'live' ? (a.passes + ' pass' + (a.passes === 1 ? '' : 'es') + ' within 1 km in 7 days · latest ' + (a.night ? 'night' : 'day') + ' pass · ' + (a.frp ? a.frp.toFixed(0) + ' MW' : 'FRP n/a')) : a.kind === 'priority' ? (a.streak + ' consecutive observed days in zone · priority ' + a.score + '/100') : a.kind === 'sos' ? ('Ref ' + a.ref) : ('confidence ' + a.conf + '% · seen ' + a.days + ' d · industry ' + (+a.dist).toFixed(1) + ' km');
      var links = '';
      if (a.recId && /^FW-/.test(a.recId)) links = '<a href="dashboard.html#queue">Queue</a><button type="button" data-evidence="' + a.recId + '">Evidence</button>' + (a.kind !== 'sos' ? '<button type="button" data-sos="' + a.recId + '">SOS</button>' : '') + '<a href="respond.html?id=' + a.recId + '">Navigate</a><a href="thermal-dna.html?id=' + a.recId + '#dna-history">History</a>';
      else if (a.lat != null) links = '<a href="respond.html?lat=' + a.lat + '&lon=' + a.lon + '">Navigate</a>';
      return '<article class="al-item' + (a.ack ? ' ack' : '') + (isNew ? ' fresh' : '') + '" role="listitem" style="--ac:' + col + '">' +
        '<div class="al-top"><span class="al-kind mono">' + kindLabel + (isNew && !a.ack ? ' · new' : '') + '</span><span class="tag" style="--tc:' + col + '">' + esc(a.level) + '</span></div>' +
        '<h4>' + esc(a.title) + '</h4>' +
        '<div class="al-meta mono">' + esc(a.recId || '') + (a.recId ? ' · ' : '') + esc(extra) + '</div>' +
        '<dl class="al-times"><div><dt>Detected</dt><dd>' + fmtUtc(det) + '<span>' + fmtLocalMin(det) + ' · ' + ago(a.detectedAt) + '</span></dd></div>' +
        '<div><dt>Raised</dt><dd>' + fmtLocal(new Date(a.raisedAt)) + '<span>' + ago(a.raisedAt) + '</span></dd></div>' +
        '<div><dt>Updated</dt><dd>' + fmtLocal(new Date(a.updatedAt)) + '<span>' + (a.history.length ? esc(a.history[a.history.length - 1].m) : '') + ' · ' + ago(a.updatedAt) + '</span></dd></div></dl>' +
        '<div class="al-acts">' + links + '<button type="button" class="al-ack" data-ack="' + a.id + '">' + (a.ack ? 'Mark unread' : 'Acknowledge') + '</button></div>' +
      '</article>';
    }).join('');
  }

  /* Dashboard alert bar */
  function dashBar() {
    var kp = $('#dashboard .kpis'); if (!kp) return;
    var bar = document.createElement('div'); bar.className = 'al-bar'; bar.id = 'al-bar';
    kp.parentNode.insertBefore(bar, kp);
    function paint() {
      var all = Object.keys(state.alerts).map(function (k) { return state.alerts[k]; }).filter(function (a) { return !a.closed; });
      var crit = all.filter(function (a) { return a.kind === 'critical'; }).length, live = all.filter(function (a) { return a.kind === 'live'; }), unread = all.filter(function (a) { return !a.ack; }).length;
      var latest = all.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; })[0];
      bar.innerHTML = '<div class="al-bar-l"><span class="al-dot"></span><b>' + crit + ' critical alert' + (crit === 1 ? '' : 's') + '</b><span class="mono">' + live.length + ' live-confirmed · ' + unread + ' unread</span></div><div class="al-bar-r mono">' + (latest ? 'Last update ' + fmtLocal(new Date(latest.updatedAt)) + ' · ' + esc(latest.title) : 'No alerts yet') + '</div><button type="button" class="btn btn-ghost btn-sm al-open">Open alerts</button>';
      $('.al-open', bar).addEventListener('click', function () { setOpen(true); });
    }
    paint(); document.addEventListener('fw:alerts', paint);
  }
  var origRender = render; render = function () { origRender(); try { document.dispatchEvent(new CustomEvent('fw:alerts')); } catch (e) { } };

  build(); seedFromRows(); render(); dashBar();
  if (newlyRaised.length) { var fresh = newlyRaised.length; setTimeout(function () { announce(); if (fresh > 3) toast(fresh + ' alerts raised from the feed. Open the bell to see detection and update times.'); }, 1500); }
  setTimeout(function () { pollLive(true); }, 2500);
  liveTimer = setInterval(function () { if (!document.hidden) pollLive(false); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pollLive(false); });
  window.FW_ALERTS = { open: function () { setOpen(true); }, raise: raise, list: function () { return state.alerts; }, poll: function () { pollLive(true); } };
})();
