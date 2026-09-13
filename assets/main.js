/* FireWatch. Scroll-scrubbed hero engine, world dashboard, hold instrument, reveals. Plain JS, shared by every page. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  var smoothstep = function (p, e0, e1) { var t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  var reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = function () { return reduceMQ.matches; };
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ------------------------------------------------------------------ */
  /* Environment flecks                                                  */
  /* ------------------------------------------------------------------ */
  (function env() {
    var host = $('.env'); if (!host) return;
    var r = rng(7), frag = document.createDocumentFragment();
    for (var i = 0; i < 40; i++) {
      var f = document.createElement('i'); f.className = 'fleck';
      f.style.left = (r() * 100).toFixed(2) + '%'; f.style.top = (r() * 100).toFixed(2) + '%';
      f.style.setProperty('--d', (8 + r() * 6).toFixed(2) + 's'); f.style.setProperty('--dl', (-r() * 14).toFixed(2) + 's');
      frag.appendChild(f);
    }
    host.appendChild(frag);
  })();

  /* ------------------------------------------------------------------ */
  /* Nav: scrolled state, active page                                    */
  /* ------------------------------------------------------------------ */
  (function nav() {
    var nav = $('.nav'); if (!nav) return;
    var scrolled = false;
    function onS() { var s = scrollY > 40; if (s !== scrolled) { scrolled = s; nav.classList.toggle('scrolled', s); } }
    addEventListener('scroll', onS, { passive: true }); onS();
    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.nav ul a').forEach(function (a) { var f = (a.getAttribute('href') || '').split('#')[0].toLowerCase(); if (f && f === here) { a.classList.add('active'); var g = a.closest('.nav-group'); if (g) g.classList.add('has-active'); } });
    /* Grouped menus: click to open, hover on fine pointers, Escape and outside click to close */
    var groups = $$('.nav-group'), fine = matchMedia('(pointer: fine)').matches;
    function setG(g, on, by) { g.classList.toggle('open', on); g.querySelector('.nav-gbtn').setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) g.setAttribute('data-by', by || 'click'); else g.removeAttribute('data-by'); }
    function closeAll(except) { groups.forEach(function (g) { if (g !== except) setG(g, false); }); }
    groups.forEach(function (g) {
      var b = g.querySelector('.nav-gbtn'), t = null;
      b.addEventListener('click', function () {
        var isOpen = g.classList.contains('open'), byHover = g.getAttribute('data-by') === 'hover';
        closeAll(g);
        if (isOpen && !byHover) setG(g, false); else setG(g, true, 'click');
      });
      if (fine) {
        g.addEventListener('pointerenter', function () { if (innerWidth <= 900) return; clearTimeout(t); if (!g.classList.contains('open')) { closeAll(g); setG(g, true, 'hover'); } });
        g.addEventListener('pointerleave', function () { if (innerWidth <= 900) return; clearTimeout(t); t = setTimeout(function () { if (g.getAttribute('data-by') === 'hover') setG(g, false); }, 220); });
      }
      g.addEventListener('focusout', function (e) { if (!g.contains(e.relatedTarget) && g.getAttribute('data-by') !== 'hover') setG(g, false); });
    });
    document.addEventListener('pointerdown', function (e) { if (!e.target.closest('.nav-group')) closeAll(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
  })();

  /* ------------------------------------------------------------------ */
  /* Menu on small screens                                               */
  /* ------------------------------------------------------------------ */
  (function menu() {
    var tog = $('.navtog'), list = $('#navlinks'); if (!tog || !list) return;
    function set(open) {
      document.body.classList.toggle('nav-open', open);
      tog.setAttribute('aria-expanded', open ? 'true' : 'false');
      tog.setAttribute('aria-label', open ? 'Close the menu' : 'Open the menu');
    }
    tog.addEventListener('click', function () { set(!document.body.classList.contains('nav-open')); });
    $$('a', list).forEach(function (a) { a.addEventListener('click', function () { set(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { set(false); tog.focus(); } });
    var wide = matchMedia('(min-width: 901px)');
    wide.addEventListener('change', function (e) { if (e.matches) set(false); });
  })();

  /* ------------------------------------------------------------------ */
  /* Split text, once at load, seeded                                    */
  /* ------------------------------------------------------------------ */
  function splitEl(el, mode, seed, spread) {
    var text = el.textContent.replace(/\s+/g, ' ').trim();
    var r = rng(seed); var base = parseFloat(el.getAttribute('data-th-base') || '0');
    var sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = text;
    var vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    var words = text.split(' '); var total = 0; words.forEach(function (w) { total += w.length; });
    var ci = 0;
    words.forEach(function (w, wi) {
      var ws = document.createElement('span'); ws.className = 'w';
      if (mode === 'chars') {
        for (var i = 0; i < w.length; i++) {
          var c = document.createElement('span'); c.className = 'c'; c.textContent = w[i];
          if (spread != null) { c.style.setProperty('--th', (base + ci / total * spread + r() * 0.06).toFixed(3)); c.style.setProperty('--jx', (-(18 + r() * 34)).toFixed(1) + 'px'); }
          else { c.style.setProperty('--th', (base + r() * 0.55).toFixed(3)); c.style.setProperty('--jx', ((r() - 0.5) * 70).toFixed(1) + 'px'); c.style.setProperty('--jy', ((r() - 0.5) * 50).toFixed(1) + 'px'); c.style.setProperty('--jr', ((r() - 0.5) * 30).toFixed(1) + 'deg'); }
          ws.appendChild(c); ci++;
        }
      } else {
        ws.textContent = w;
        ws.style.setProperty('--th', (base + wi / words.length * (spread == null ? 0.5 : spread) + r() * 0.04).toFixed(3));
        if (el.getAttribute('data-em') && el.getAttribute('data-em').split('|').indexOf(w.replace(/[.,]/g, '')) > -1) ws.classList.add('big');
      }
      vis.appendChild(ws); if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
    });
    el.textContent = ''; el.appendChild(sr); el.appendChild(vis);
  }
  function dupEl(el) {
    var text = el.textContent.trim();
    var sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = text;
    var soft = document.createElement('span'); soft.className = 'soft'; soft.setAttribute('aria-hidden', 'true'); soft.textContent = text;
    var sharp = document.createElement('span'); sharp.className = 'sharp'; sharp.setAttribute('aria-hidden', 'true'); sharp.textContent = text;
    el.textContent = ''; el.appendChild(sr); el.appendChild(soft); el.appendChild(sharp);
  }
  $$('[data-split]').forEach(function (el, i) {
    var m = el.getAttribute('data-split'); var sp = el.getAttribute('data-spread');
    if (m === 'dup') dupEl(el); else splitEl(el, m, 101 + i * 17, sp != null ? parseFloat(sp) : null);
  });

  /* ------------------------------------------------------------------ */
  /* Hero engine (landing page only)                                     */
  /* ------------------------------------------------------------------ */
  var HERO = $('.hero'), STAGE = $('.stage'), video = $('#hero-video'), posterLayer = $('.poster'), ring = $('.ring');
  var VIDEO_URL = 'assets/hero-scrub.mp4';
  var VIDEO_BYTES = 11029170;   /* the real byte size of the encoded scrub video */
  var POSTER = 'assets/hero-poster.jpg', ENDING = 'assets/hero-ending.jpg';
  var bands = $$('.band').map(function (el) {
    return { el: el, a: parseFloat(el.getAttribute('data-a')), b: parseFloat(el.getAttribute('data-b')), ramp: el.hasAttribute('data-ramp') ? parseFloat(el.getAttribute('data-ramp')) : null, op: -1, k: -1 };
  });
  var reticle = $('.reticle'), chapterEl = $('#hud-chapter'), altEl = $('#hud-alt');
  var target = 0, shown = 0, rafId = null, lastTick = 0, heroOnScreen = true, scrubOn = false, inited = false;
  var seekBusy = false, pendingTime = null;
  var loadK = 0, loadStart = 0;

  function heroProgress() {
    if (!HERO) return 0;
    var range = HERO.offsetHeight - innerHeight; if (range <= 0) return 0;
    var top = HERO.getBoundingClientRect().top; return clamp(-top / range, 0, 1);
  }
  function requestSeek(t) {
    if (!video || !video.duration || !isFinite(t)) return;
    if (seekBusy) { pendingTime = t; return; }
    seekBusy = true; video.currentTime = t;
  }
  if (video) {
    video.addEventListener('seeked', function () { seekBusy = false; if (pendingTime !== null) { var t = pendingTime; pendingTime = null; requestSeek(t); } });
    video.addEventListener('error', function () { seekBusy = false; pendingTime = null; failVideo(); });
  }
  var lastLabel = '', lastLabelAt = 0, lastAlt = '';
  function updateReadouts(p, now) {
    if (!chapterEl) return;
    if (now - lastLabelAt < 100) return; lastLabelAt = now;
    var ch = p < 0.33 ? 'CH 01 · HEAT' : p < 0.66 ? 'CH 02 · PLACE' : 'CH 03 · INTENT';
    if (ch !== lastLabel) { lastLabel = ch; chapterEl.textContent = ch; }
    var alt = 408 * Math.pow(0.4 / 408, p); var s = (alt >= 10 ? Math.round(alt) : alt.toFixed(1)) + ' km';
    if (s !== lastAlt) { lastAlt = s; altEl.textContent = s; }
  }
  var lastRo = -1;
  function updateCaptions(p, now) {
    for (var i = 0; i < bands.length; i++) {
      var B = bands[i], a = B.a, b = B.b;
      var f = Math.min(0.02, (b - a) / 3);
      var op = (i === 0 ? 1 : smoothstep(p, a, a + f)) * (i === bands.length - 1 ? 1 : (1 - smoothstep(p, b - f, b)));
      if (i === 0 && p > b) op = 1 - smoothstep(p, b - f, b);
      if (i === bands.length - 1 && p < a) op = smoothstep(p, a, a + f);
      var ramp = B.ramp || Math.min(0.025, (b - a) * 0.35);
      var k = clamp((p - a) / ramp, 0, 1);
      if (i === 0) k = Math.max(k, loadK);
      if (Math.abs(op - B.op) > 0.005 || (op === 0 && B.op !== 0) || (op === 1 && B.op !== 1)) { B.op = op; B.el.style.opacity = op.toFixed(3); }
      if (Math.abs(k - B.k) > 0.008 || (k === 1 && B.k !== 1) || (k === 0 && B.k !== 0)) { B.k = k; B.el.style.setProperty('--k', k.toFixed(3)); }
    }
    if (reticle && bands.length) {
      var last = bands[bands.length - 1]; var kk = last.k < 0 ? 0 : last.k;
      var ro = clamp(kk * 3, 0, 1), rd = clamp((kk - 0.15) / 0.7, 0, 1);
      var key = Math.round(ro * 100) + ':' + Math.round(rd * 100);
      if (key !== lastRo) { lastRo = key; reticle.style.setProperty('--ro', ro.toFixed(3)); reticle.style.setProperty('--rd', rd.toFixed(3)); }
    }
    updateReadouts(p, now || performance.now());
  }
  function tick(now) {
    var dt = Math.min(100, now - (lastTick || now)); lastTick = now;
    var k = 0.16;
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
    var loadDone = true;
    if (loadStart) { var lk = clamp((now - loadStart) / 1500, 0, 1); loadK = lk * lk * (3 - 2 * lk); loadDone = lk >= 1; if (loadDone) loadStart = 0; }
    if (Math.abs(target - shown) < 0.0005 && loadDone) { shown = target; rafId = null; lastTick = 0; }
    else rafId = requestAnimationFrame(tick);
    if (video && video.duration) requestSeek(shown * video.duration);
    updateCaptions(shown, now);
  }
  function kick() { if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick); }
  function onScroll() { target = heroProgress(); kick(); }
  if ('IntersectionObserver' in window && HERO) {
    new IntersectionObserver(function (es) { heroOnScreen = es[0].isIntersecting; if (heroOnScreen && scrubOn) { target = heroProgress(); kick(); } }).observe(HERO);
  }
  var started = false, failed = false;
  function startBlobFetch() { if (started) return; started = true; loadHeroBlob().catch(failVideo); }
  function loadHeroBlob() {
    if (location.protocol === 'file:') return Promise.reject(new Error('file protocol'));
    var ctrl = new AbortController(); var watchdog = setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal }).then(function (res) {
      if (!res.ok || !res.body) throw new Error('bad response');
      var total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
      var reader = res.body.getReader(); var chunks = []; var got = 0, lastRing = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          clearTimeout(watchdog); watchdog = setTimeout(function () { ctrl.abort(); }, 20000);
          chunks.push(r.value); got += r.value.length;
          var frac = Math.min(1, got / total); var now = performance.now();
          if (now - lastRing > 100 || frac === 1) { lastRing = now; ring.style.setProperty('--ld', Math.round(126 * (1 - frac))); }
          return pump();
        });
      }
      return pump().then(function () {
        clearTimeout(watchdog); ring.style.setProperty('--ld', 0);
        video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' })); video.load();
        video.addEventListener('canplay', function () { requestSeek(heroProgress() * video.duration); STAGE.classList.add('video-ready'); }, { once: true });
      });
    });
  }
  function failVideo() {
    if (failed || !STAGE) return; failed = true;
    if (ring && ring.parentNode) { var cue = document.createElement('div'); cue.className = 'cue'; cue.setAttribute('aria-hidden', 'true'); cue.innerHTML = '<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8l7 7 7-7"/></svg>'; ring.replaceWith(cue); }
    STAGE.classList.add('video-failed');
  }
  function initHeroOnce() {
    if (inited) return; inited = true;
    posterLayer.style.backgroundImage = "url('" + POSTER + "')";
    var img = new Image(); img.onload = startBlobFetch; img.onerror = startBlobFetch; img.src = POSTER;
    setTimeout(startBlobFetch, 4000);
    loadStart = performance.now();
  }
  var GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  function enableScrub() {
    if (scrubOn || !HERO) return; scrubOn = true;
    initHeroOnce();
    posterLayer.style.backgroundImage = "url('" + POSTER + "')";
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(function (b) { b.op = -1; b.k = -1; }); lastRo = -1; lastLabel = ''; lastAlt = '';
    unpinFinalStates();
    target = heroProgress(); if (loadStart === 0 && loadK < 1) loadStart = performance.now();
    updateCaptions(shown, performance.now()); onScroll(); kick();
  }
  function disableScrub() {
    if (!scrubOn) return; scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
  }
  function applyHeroMode() {
    if (!HERO) { if (reduced()) pinToFinalStates(); else unpinFinalStates(); return; }
    var isStatic = GATES.some(function (q) { return matchMedia(q).matches; });
    if (isStatic) {
      disableScrub();
      posterLayer.style.backgroundImage = "url('" + ENDING + "')";
      if (reduced()) pinToFinalStates();
    } else enableScrub();
  }
  var MQLS = GATES.map(function (q) { return matchMedia(q); });
  MQLS.forEach(function (m) { m.addEventListener('change', applyHeroMode); });

  /* ------------------------------------------------------------------ */
  /* Shared detection records: one seeded build, used by every page      */
  /* ------------------------------------------------------------------ */
  var FW_COLORS = { Critical: '#E05252', High: '#E2733B', Medium: '#D9A441', Low: '#4FA97F' };
  var FW_RISK_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  var FW_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FW_ROWS = (function () {
    var D = window.FW_DATA; if (!D) return null;
    var r = rng(42); var today = new Date(); today.setHours(0, 0, 0, 0);
    var rows = D.sites.map(function (s, i) {
      var d = new Date(today.getTime() - Math.floor(r() * 7) * 86400000);
      return { id: 'FW-' + String(i + 1).padStart(4, '0'), lat: s[0], lon: s[1], type: s[2], conf: s[3], risk: s[4], source: s[5], region: s[6], dist: s[7], days: s[8], date: d, dateS: String(d.getDate()).padStart(2, '0') + ' ' + FW_MON[d.getMonth()] + ' ' + d.getFullYear(), india: /India$/.test(s[6]) };
    });
    rows.sort(function (a, b) { return (FW_RISK_ORDER[a.risk] - FW_RISK_ORDER[b.risk]) || (b.conf - a.conf); });
    /* One seeded draw per record so every page shows the same synthetic pass time */
    var r7 = rng(7);
    rows.forEach(function (x) { x.rs = [r7(), r7(), r7(), r7()]; var hh = Math.floor(6 + x.rs[0] * 15), mm = Math.floor(x.rs[1] * 60); x.acqTime = String(hh).padStart(2, '0') + String(mm).padStart(2, '0'); });
    return rows;
  })();
  function fwVerdict(distKm, days, conf) {
    var prox = distKm <= 3, pers = days >= 3;
    if (prox) {
      if (pers && conf >= 85) return { type: 'Industrial Fire', risk: 'Critical', handle: 'Route to the district industrial-safety authority for ground verification within 24 hours.' };
      if (pers || conf >= 65) return { type: 'Industrial Fire', risk: 'High', handle: 'Goes into the next scheduled inspection round.' };
      return { type: 'Industrial Fire', risk: 'Medium', handle: 'Watched. One more pass, or a stronger reading, moves it up the list.' };
    }
    if (conf >= 40) return { type: 'Agricultural Burning', risk: 'Medium', handle: 'Kept for context. Seasonal burning is never escalated to the safety authority.' };
    return { type: 'Other, natural', risk: 'Low', handle: 'Logged and left alone. Nothing here asks for a team.' };
  }
  function fwHaversine(a, b, c, d) {
    var R = 6371, p = Math.PI / 180;
    var dLat = (c - a) * p, dLon = (d - b) * p;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function fwGet(url, opts, ms) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 12000);
    var o = opts || {}; o.signal = ctl.signal;
    return fetch(url, o).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).finally(function () { clearTimeout(t); });
  }
  function fwEsc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fwCount(el, from, to, done) {
    if (!el) return;
    if (reduced() || from === to) { el.textContent = to.toLocaleString('en-IN'); if (done) done(); return; }
    var t0 = performance.now(), dur = 900, last = '';
    (function step(now) {
      var t = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - t, 3);
      var v = Math.round(from + (to - from) * e), str = v.toLocaleString('en-IN');
      if (str !== last) { last = str; el.textContent = str; }
      if (t < 1) requestAnimationFrame(step); else if (done) done();
    })(t0);
  }

  /* Priority trend for every row, available on every page (the dashboard recomputes with live data) */
  if (FW_ROWS) FW_ROWS.forEach(function (x) {
    var traj = []; for (var k = 1; k <= Math.min(x.days, 14); k++) traj.push(fwVerdict(x.dist, k, x.conf).risk);
    var streak = 0; for (var i = traj.length - 1; i >= 0 && (traj[i] === 'Critical' || traj[i] === 'High'); i--) streak++;
    var crit = traj.filter(function (r) { return r === 'Critical'; }).length;
    var score = Math.min(100, (x.risk === 'Critical' ? 40 : x.risk === 'High' ? 25 : x.risk === 'Medium' ? 8 : 0) + Math.min(x.days, 10) * 4 + (streak >= 5 ? 15 : streak >= 3 ? 10 : 0) + (x.conf >= 85 ? 5 : 0));
    x.pri = { score: score, streak: streak, crit: crit, trend: x.risk === 'Critical' && crit >= 4 ? 'sustained' : x.risk === 'Critical' && crit >= 1 ? 'rising' : (x.risk === 'High' && streak >= 3) ? 'holding' : (x.risk === 'High' || x.risk === 'Critical') ? 'emerging' : 'steady', top: (x.risk === 'Critical' && crit >= 3 && x.days >= 5), why: [] };
  });
  /* Shared read-only handle for Therma, the site guide */
  window.FW_API = { rows: FW_ROWS, verdict: fwVerdict, colors: FW_COLORS, mon: FW_MON, haversine: fwHaversine, reduced: reduced, toast: function (m) { if (typeof toast === 'function') toast(m); } };

  /* ------------------------------------------------------------------ */
  /* Dashboard: world map on Leaflet, KPIs, queue, export                */
  /* ------------------------------------------------------------------ */
  var dash = (function () {
    var mapEl = $('#map-leaflet'); if (!FW_ROWS || !mapEl) return null;
    var COLORS = FW_COLORS, MON = FW_MON, rows = FW_ROWS;
    var riskOn = { Critical: true, High: true, Medium: true, Low: true }, typeOn = { 'Industrial Fire': true, 'Agricultural Burning': true, 'Other/Natural': true }, region = 'world';
    var esc = fwEsc;
    function popupHtml(x) {
      return '<div class="pop"><h4>' + esc(x.type) + '</h4><div class="id">' + x.id + ' · ' + x.lat.toFixed(4) + ', ' + x.lon.toFixed(4) + '</div><table>' +
        '<tr><td>Confidence</td><td>' + x.conf + '%</td></tr><tr><td>Nearest industrial site</td><td>' + x.dist.toFixed(1) + ' km</td></tr><tr><td>Distinct days observed</td><td>' + x.days + '</td></tr><tr><td>Region</td><td>' + esc(x.region) + '</td></tr><tr><td>Source</td><td>' + esc(x.source) + '</td></tr><tr><td>Detected</td><td>' + x.dateS + '</td></tr></table>' +
        '<div class="pop-actions"><span class="tag" style="--tc:' + COLORS[x.risk] + '">' + x.risk + '</span><span class="pop-btns"><button type="button" class="btn btn-ghost btn-sm ev-btn" data-evidence="' + x.id + '">Satellite evidence</button><a class="btn btn-ghost btn-sm ev-btn" href="thermal-dna.html?id=' + x.id + '">Thermal DNA</a><a class="btn btn-ghost btn-sm ev-btn" href="thermal-dna.html?id=' + x.id + '#dna-history">7-day threat history</a><a class="btn btn-ghost btn-sm ev-btn" href="regions.html?q=' + encodeURIComponent(x.region) + '">Analyse region</a>' + (x.risk === 'Critical' || x.risk === 'High' ? '<button type="button" class="btn btn-sm ev-btn sos-pop" data-sos="' + x.id + '">Emergency SOS</button><a class="btn btn-ghost btn-sm ev-btn" href="respond.html?id=' + x.id + '">Navigate</a>' : '') + '</span></div></div>';
    }
    var map = null, group = null, evm = null;
    if (window.L) {
      map = L.map(mapEl, { worldCopyJump: true, scrollWheelZoom: false, minZoom: 2, maxZoom: 17 }); map.fitBounds([[-52, -168], [72, 178]], { padding: [6, 6] });
      var esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/{svc}/MapServer/tile/{z}/{y}/{x}';
      var dark = L.layerGroup([
        L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Base'), { maxZoom: 16, attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors' }),
        L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Reference'), { maxZoom: 16 })
      ]);
      var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' });
      var sat = L.layerGroup([
        L.tileLayer(esri.replace('{svc}', 'World_Imagery'), { maxZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
        L.tileLayer(esri.replace('{svc}', 'Reference/World_Boundaries_and_Places'), { maxZoom: 18, pane: 'basemapLabels' })
      ]);
      map.createPane('basemapLabels'); map.getPane('basemapLabels').style.zIndex = 250; map.getPane('basemapLabels').style.pointerEvents = 'none';
      dark.addTo(map);
      L.control.layers({ 'Dark canvas': dark, 'OpenStreetMap': osm, 'Satellite': sat }, null, { position: 'topright', collapsed: true }).addTo(map);
      /* Map / Satellite switch beside the map title. Stays in step with the layers control. */
      var bases = { map: dark, satellite: sat }, bmBtns = $$('.basemap-toggle .bm');
      function markBase(name) {
        $$('.basemap-toggle .bm').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-basemap') === name ? 'true' : 'false'); });
        mapEl.classList.toggle('is-satellite', name === 'satellite');
      }
      bmBtns.forEach(function (b) {
        b.addEventListener('click', function () {
          var name = b.getAttribute('data-basemap'); if (!bases[name] || map.hasLayer(bases[name])) return;
          Object.keys(bases).forEach(function (k) { if (map.hasLayer(bases[k])) map.removeLayer(bases[k]); });
          if (map.hasLayer(osm)) map.removeLayer(osm);
          bases[name].addTo(map); markBase(name);
        });
      });
      map.on('baselayerchange', function (e) { markBase(e.layer === sat ? 'satellite' : e.layer === dark ? 'map' : 'streets'); });
      if (window.FW_EVIDENCE) {
        evm = FW_EVIDENCE.attachMode({ maps: [map], toggle: $('.basemap-toggle'), before: $('.map-l'),
          onEnter: function () { [dark, sat, osm].forEach(function (b) { if (map.hasLayer(b)) map.removeLayer(b); }); markBase('evidence'); },
          onLeave: function () { if (!map.hasLayer(dark) && !map.hasLayer(sat) && !map.hasLayer(osm)) dark.addTo(map); markBase(map.hasLayer(sat) ? 'satellite' : 'map'); } });
        $$('.basemap-toggle .bm[data-basemap="map"],.basemap-toggle .bm[data-basemap="satellite"]').forEach(function (b) { b.addEventListener('click', function () { if (evm && evm.isOn()) evm.leave(); }, true); });
        map.on('baselayerchange', function () { if (evm && evm.isOn()) evm.leave(); });
      }
      group = L.layerGroup().addTo(map);
      rows.forEach(function (x) {
        var rad = 4 + x.conf / 14;
        x.m = L.circleMarker([x.lat, x.lon], { radius: rad, color: 'rgba(4,8,16,.75)', weight: 1, fillColor: COLORS[x.risk], fillOpacity: 0.92 });
        x.m.bindPopup(popupHtml(x), { maxWidth: 320 });
        x.m.on('click', function () { if (evm && evm.isOn()) evm.setDate(x.date); });
        x.m.bindTooltip(x.id + ' · ' + x.type + ' · ' + x.risk, { direction: 'top', offset: [0, -rad - 2], className: 'fw-tip' });
        if (x.risk === 'Critical') x.pulse = L.marker([x.lat, x.lon], { icon: L.divIcon({ className: 'fw-pulse', iconSize: [rad * 2.8, rad * 2.8] }), interactive: false, keyboard: false });
      });
      addEventListener('resize', function () { map.invalidateSize(); if (region === 'world') map.fitBounds([[-52, -168], [72, 178]], { padding: [6, 6] }); });
      setTimeout(function () { map.invalidateSize(); }, 600);
    } else {
      mapEl.innerHTML = '<div class="qempty" style="margin:18px">The map library did not load, so the world map is hidden. The counts and the queue below still work.</div>';
    }
    var kpiEls = { view: $('#kpi-view'), crit: $('#kpi-crit'), high: $('#kpi-high'), ind: $('#kpi-ind'), rec: $('#kpi-rec') };
    var shownV = { view: 0, crit: 0, high: 0, ind: 0, rec: 0 }; var tweens = {};
    function count(key, to) {
      var el = kpiEls[key]; if (!el) return;
      var from = shownV[key]; if (from === to) { el.textContent = to.toLocaleString('en-IN'); return; }
      if (reduced()) { shownV[key] = to; el.textContent = to.toLocaleString('en-IN'); return; }
      if (tweens[key]) cancelAnimationFrame(tweens[key]);
      var t0 = performance.now(), dur = 900, last = '';
      (function step(now) {
        var t = clamp((now - t0) / dur, 0, 1); var e = 1 - Math.pow(1 - t, 3);
        var v = Math.round(from + (to - from) * e); var s = v.toLocaleString('en-IN');
        if (s !== last) { last = s; el.textContent = s; }
        if (t < 1) tweens[key] = requestAnimationFrame(step); else { shownV[key] = to; tweens[key] = null; }
      })(t0);
    }
    var queue = $('#queue-list'), qempty = $('#queue-empty'), statusN = $('#status-n'), statusR = $('#status-regions'), trigA = $('#trig-a'), trigB = $('#trig-b'), trigC = $('#trig-c');
    /* Priority trend: how long a site has sat in the High or Critical zone, and how often it has come back.
       The tier on each observed day is what the rule engine would have said with the recurrence known by then. */
    var order = 'priority';
    function trajectory(x) { var out = []; for (var k = 1; k <= Math.min(x.days, 14); k++) out.push(fwVerdict(x.dist, k, x.conf).risk); return out; }
    function priority(x) {
      var traj = trajectory(x), hot = traj.filter(function (r) { return r === 'Critical' || r === 'High'; }).length, crit = traj.filter(function (r) { return r === 'Critical'; }).length;
      var streak = 0; for (var i = traj.length - 1; i >= 0 && (traj[i] === 'Critical' || traj[i] === 'High'); i--) streak++;
      var score = (x.risk === 'Critical' ? 40 : x.risk === 'High' ? 25 : x.risk === 'Medium' ? 8 : 0) + Math.min(x.days, 10) * 4 + (streak >= 5 ? 15 : streak >= 3 ? 10 : 0) + (x.conf >= 85 ? 5 : 0);
      if (x.live) { if (x.live.days >= 3) score += 10; else if (x.live.days >= 1) score += 4; if (x.live.n >= 2 && x.live.night / x.live.n >= 0.4) score += 5; }
      score = Math.min(100, score);
      var trend = x.risk === 'Critical' && crit >= 4 ? 'sustained' : x.risk === 'Critical' && crit >= 1 ? 'rising' : (x.risk === 'High' && streak >= 3) ? 'holding' : (x.risk === 'High' || x.risk === 'Critical') ? 'emerging' : 'steady';
      var top = (x.risk === 'Critical' && crit >= 3 && x.days >= 5) || (!!x.live && x.live.days >= 3 && streak >= 3 && x.risk !== 'Low');
      var why = [];
      why.push(streak ? streak + ' consecutive observed day' + (streak === 1 ? '' : 's') + ' in the High or Critical zone' : 'not yet in the High or Critical zone');
      if (crit) why.push(crit + ' of those at Critical');
      why.push('returned on ' + x.days + ' distinct day' + (x.days === 1 ? '' : 's'));
      if (x.live) why.push(x.live.days ? 'live feed: ' + x.live.n + ' passes on ' + x.live.days + ' day' + (x.live.days === 1 ? '' : 's') + ' in the last 7 within 1 km' + (x.live.night ? ', ' + x.live.night + ' at night' : '') : 'live feed: quiet at this point in the last 7 days');
      return { score: score, trend: trend, top: top, streak: streak, crit: crit, hot: hot, why: why };
    }
    function scoreAll() { rows.forEach(function (x) { x.pri = priority(x); }); }
    scoreAll();
    /* Live confirmation for the strongest candidates: real VIIRS passes within 1 km over the last 7 days */
    var liveChecked = false;
    function confirmLive() {
      if (liveChecked || !window.fetch) return; liveChecked = true;
      var cand = rows.filter(function (x) { return x.risk === 'Critical' || x.risk === 'High'; }).sort(function (a, b) { return b.pri.score - a.pri.score; }).slice(0, 12);
      var pwLive = $('#pw-live'); if (pwLive) pwLive.textContent = 'Live check running on the top ' + cand.length;
      var done = 0, confirmed = 0;
      cand.forEach(function (x) {
        var km = 1.2, dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(x.lat * Math.PI / 180)));
        var env = (x.lon - dLon).toFixed(4) + ',' + (x.lat - dLat).toFixed(4) + ',' + (x.lon + dLon).toFixed(4) + ',' + (x.lat + dLat).toFixed(4);
        var u = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query?where=1%3D1&geometry=' + env + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=latitude,longitude,acq_date,daynight&returnGeometry=false&resultRecordCount=500&f=json';
        fwGet(u, null, 14000).then(function (j) {
          var days = {}, n = 0, night = 0;
          (j.features || []).forEach(function (f) { var a = f.attributes; if (!a || a.latitude == null || fwHaversine(x.lat, x.lon, a.latitude, a.longitude) > 1) return; n++; if (a.daynight === 'N') night++; if (a.acq_date) days[new Date(a.acq_date).toISOString().slice(0, 10)] = 1; });
          x.live = { n: n, days: Object.keys(days).length, night: night }; if (n) confirmed++;
        }).catch(function () { x.live = null; }).finally(function () { done++; if (done === cand.length) { scoreAll(); update(); if (pwLive) pwLive.textContent = 'Live check: ' + confirmed + ' of ' + cand.length + ' top candidates have VIIRS passes within 1 km in the last 7 days'; } });
      });
    }
    $$('.sg[data-order]').forEach(function (b) { b.addEventListener('click', function () { var o = b.getAttribute('data-order'); if (o === order) return; order = o; $$('.sg[data-order]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); var qc = $('#queue-copy'); if (qc) qc.textContent = o === 'priority' ? 'Critical and High findings only. Priority trend puts sites that have stayed Critical across their observed days and kept returning at the top, automatically: Critical on 3 or more days and back on 5 or more. Click a row to find it on the map.' : 'Critical and High findings only, ordered by severity then confidence. Click a row to find it on the map.'; update(); }); });
    function inView() { return rows.filter(function (x) { return riskOn[x.risk] && typeOn[x.type] && (region === 'world' || x.india); }); }
    function update() {
      var v = inView();
      if (group) { group.clearLayers(); v.slice().reverse().forEach(function (x) { group.addLayer(x.m); if (x.pulse) group.addLayer(x.pulse); }); }
      var crit = v.filter(function (x) { return x.risk === 'Critical'; }).length, high = v.filter(function (x) { return x.risk === 'High'; }).length;
      var ind = v.filter(function (x) { return x.type === 'Industrial Fire'; }).length, rec = v.filter(function (x) { return x.days >= 3; }).length;
      count('view', v.length); count('crit', crit); count('high', high); count('ind', ind); count('rec', rec);
      if (statusN) statusN.textContent = v.length + ' of ' + rows.length;
      if (statusR) { var rs = {}; v.forEach(function (x) { rs[x.region] = 1; }); statusR.textContent = Object.keys(rs).length; }
      var near = v.filter(function (x) { return x.dist <= 3; }).length;
      if (trigA) trigA.textContent = near; if (trigB) trigB.textContent = rec; if (trigC) trigC.textContent = crit + high;
      var q = v.filter(function (x) { return x.risk === 'Critical' || x.risk === 'High'; });
      if (order === 'priority') q = q.slice().sort(function (a, b) { return (b.pri.top - a.pri.top) || (b.pri.score - a.pri.score) || (b.pri.streak - a.pri.streak) || (b.days - a.days) || (FW_RISK_ORDER[a.risk] - FW_RISK_ORDER[b.risk]) || (b.conf - a.conf); });
      var tops = q.filter(function (x) { return x.pri.top; }), pw = $('#pwatch');
      if (pw) { pw.hidden = !q.length; $('#pw-count').textContent = tops.length; var longest = q.slice().sort(function (a, b) { return b.pri.streak - a.pri.streak || b.days - a.days; })[0]; $('#pw-longest').textContent = longest ? 'Longest in the zone: ' + longest.id + ', ' + longest.region + ', ' + longest.pri.streak + ' consecutive observed days' : ''; }
      if (group) { v.forEach(function (x) { if (x.pulse) { var el = x.pulse.getElement(); if (el) el.classList.toggle('top', !!x.pri.top); } }); }
      queue.innerHTML = '';
      if (!q.length) { qempty.hidden = false; } else {
        qempty.hidden = true; var frag = document.createDocumentFragment();
        q.forEach(function (x) {
          var li = document.createElement('li'); li.className = 'qrow'; li.tabIndex = 0; li.setAttribute('role', 'button'); li.setAttribute('aria-label', 'Show ' + x.id + ' on the map');
          li.classList.toggle('is-top', !!x.pri.top);
          li.innerHTML = '<div>' + (x.pri.top ? '<span class="top-ribbon">Top priority · ' + x.pri.trend + '</span>' : '<span class="trend-tag ' + x.pri.trend + '">' + x.pri.trend + '</span>') + '<div class="t">' + esc(x.type) + ' · ' + esc(x.region) + '</div><div class="m">' + x.id + ' · ' + x.lat.toFixed(4) + ', ' + x.lon.toFixed(4) + '<br>' + x.dist.toFixed(1) + ' km from nearest mapped industrial site · seen on ' + x.days + ' separate day' + (x.days === 1 ? '' : 's') + '<br>' + esc(x.source) + ' · ' + x.dateS + '<br><span class="why">' + esc(x.pri.why.join(' · ')) + '</span></div><div class="pbar" title="Priority score ' + x.pri.score + ' of 100"><i style="--w:' + x.pri.score + '%"></i><span class="mono">' + x.pri.score + '</span></div></div>' +
            '<div class="r" style="--tc:' + COLORS[x.risk] + '"><span class="tag" style="--tc:' + COLORS[x.risk] + '">' + x.risk + '</span><div class="conf">' + x.conf + '%</div><div class="cl">Confidence</div><div class="meter"><i style="--w:' + x.conf + '%"></i></div><span class="qrow-acts"><button type="button" class="sos-btn" data-sos="' + x.id + '" aria-label="Draft an emergency SOS for ' + x.id + '">SOS</button><a class="nav-btn" href="respond.html?id=' + x.id + '" aria-label="Navigate to ' + x.id + '">Navigate</a></span></div>';
          var go = function () { if (!map) return; map.flyTo([x.lat, x.lon], Math.max(map.getZoom(), 6), { duration: reduced() ? 0 : 1.2 }); setTimeout(function () { x.m.openPopup(); }, reduced() ? 50 : 1300); mapEl.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); };
          li.addEventListener('click', function (e) { if (e.target.closest('.qrow-acts')) return; go(); }); li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
          frag.appendChild(li);
        });
        queue.appendChild(frag);
      }
    }
    $$('.fchip').forEach(function (c) {
      c.addEventListener('click', function () {
        var k = c.getAttribute('data-risk'), t = c.getAttribute('data-type'), g = c.getAttribute('data-region');
        if (g) {
          if (region === g) return; region = g;
          $$('.fchip[data-region]').forEach(function (o) { o.setAttribute('aria-pressed', o === c ? 'true' : 'false'); });
          if (map) { if (g === 'india') map.flyToBounds([[6.5, 68], [36, 97.5]], { duration: reduced() ? 0 : 1.4 }); else map.flyToBounds([[-52, -168], [72, 178]], { padding: [6, 6], duration: reduced() ? 0 : 1.4 }); }
          update(); return;
        }
        var on = c.getAttribute('aria-pressed') !== 'true'; c.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (k) riskOn[k] = on; if (t) typeOn[t] = on; update();
      });
    });
    var sosTop = $('#sos-top'); if (sosTop) sosTop.addEventListener('click', function () { var q = inView().filter(function (x) { return x.risk === 'Critical' || x.risk === 'High'; }); if (!q.length) { toast('No Critical or High finding in the current filter set.'); return; } if (window.FW_SOS) FW_SOS.open(q[0]); });
    var exp = $('#export'); if (exp) exp.addEventListener('click', function () {
      var v = inView(); var head = ['site_id', 'lat', 'lon', 'type', 'risk_level', 'confidence', 'distance_km', 'days_seen', 'region', 'source', 'detected_on'];
      var lines = [head.join(',')].concat(v.map(function (x) { return [x.id, x.lat, x.lon, '"' + x.type + '"', x.risk, x.conf, x.dist, x.days, '"' + x.region + '"', '"' + x.source + '"', x.date.toISOString().slice(0, 10)].join(','); }));
      var blob = new Blob([lines.join('\n')], { type: 'text/csv' }); var a = document.createElement('a'); var d = new Date();
      a.href = URL.createObjectURL(blob); a.download = 'firewatch_export_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      toast('Export ready: ' + v.length + ' rows, every column in the current filter set.');
    });
    var rendered = $('#status-rendered'); if (rendered) { var n = new Date(); rendered.textContent = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0') + ', ' + String(n.getDate()).padStart(2, '0') + ' ' + MON[n.getMonth()] + ' ' + n.getFullYear(); }
    var win = $('#status-window'); if (win) { var ds = rows.map(function (x) { return x.date.getTime(); }); var a0 = new Date(Math.min.apply(null, ds)), b0 = new Date(Math.max.apply(null, ds)); win.textContent = String(a0.getDate()).padStart(2, '0') + ' ' + MON[a0.getMonth()] + ' to ' + String(b0.getDate()).padStart(2, '0') + ' ' + MON[b0.getMonth()] + ' ' + b0.getFullYear(); }
    return { update: update, rows: rows, confirmLive: confirmLive, priority: priority, finish: function () { Object.keys(kpiEls).forEach(function (k) { if (tweens[k]) cancelAnimationFrame(tweens[k]); }); update(); } };
  })();

  /* ------------------------------------------------------------------ */
  /* Compare: raw feed against screened feed                             */
  /* ------------------------------------------------------------------ */
  var cmp = (function () {
    var stage = $('#cmp-stage'); if (!stage || !FW_ROWS) return null;
    var rows = FW_ROWS, COLORS = FW_COLORS, esc = fwEsc, RAW = '#FFD27A';
    var region = 'world', layout = 'side', which = 'raw', autoT = null;
    var WORLD = [[-52, -168], [72, 178]], INDIA = [[6.5, 68], [36, 97.5]];
    function isoLocal(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

    /* Synthetic raw sensor fields, deterministic per record. Geography is real, readings are not. */
    rows.forEach(function (x, i) {
      var v = x.source.indexOf('VIIRS') >= 0, m = x.source.indexOf('MODIS') >= 0, firms = v || m;
      var a = x.rs[0], b = x.rs[1], c = x.rs[2], d = x.rs[3];
      var frpBase = x.type === 'Industrial Fire' ? 9 + x.conf * 0.55 : x.type === 'Agricultural Burning' ? 3 + x.conf * 0.22 : 1.2 + x.conf * 0.1;
      var hh = Math.floor(6 + a * 15), mm = Math.floor(b * 60);
      x.raw = {
        firms: firms,
        instrument: v ? 'VIIRS' : m ? 'MODIS' : x.source === 'Sentinel-2' ? 'MSI' : 'n/a',
        satellite: v ? (c < 0.5 ? 'N' : c < 0.8 ? 'N20' : 'N21') : m ? (c < 0.5 ? 'Terra' : 'Aqua') : x.source === 'Sentinel-2' ? 'S2A' : 'n/a',
        ti4: (302 + x.conf * 0.72 + d * 18).toFixed(1),
        ti5: (283 + x.conf * 0.12 + a * 9).toFixed(1),
        frp: (frpBase * (0.75 + b * 0.5)).toFixed(1),
        scan: v ? (0.39 + c * 0.2).toFixed(2) : m ? (1 + d * 1.1).toFixed(1) : '0.02',
        track: v ? (0.36 + d * 0.14).toFixed(2) : m ? (1 + c * 0.5).toFixed(1) : '0.02',
        time: String(hh).padStart(2, '0') + String(mm).padStart(2, '0'),
        daynight: hh >= 6 && hh < 18 ? 'D' : 'N',
        conf: v ? (x.conf >= 80 ? 'h' : x.conf >= 50 ? 'n' : 'l') : String(x.conf),
        version: v ? '2.0NRT' : m ? '6.1NRT' : 'L2A'
      };
      x.rank = i + 1;
    });
    var crit = rows.filter(function (x) { return x.risk === 'Critical'; }).length;
    var high = rows.filter(function (x) { return x.risk === 'High'; }).length;
    var near = rows.filter(function (x) { return x.dist <= 3; }).length;
    var rec = rows.filter(function (x) { return x.days >= 3; }).length;
    var act = crit + high, ctx = rows.length - act;

    /* Observation window */
    var ds = rows.map(function (x) { return x.date.getTime(); }), a0 = new Date(Math.min.apply(null, ds)), b0 = new Date(Math.max.apply(null, ds));
    var winTxt = String(a0.getDate()).padStart(2, '0') + ' ' + FW_MON[a0.getMonth()] + ' to ' + String(b0.getDate()).padStart(2, '0') + ' ' + FW_MON[b0.getMonth()] + ' ' + b0.getFullYear();
    $$('#cmp-window,#cmp-window-2').forEach(function (e) { e.textContent = winTxt; });

    function rawPopup(x) {
      var r = x.raw;
      return '<div class="pop"><h4>Thermal anomaly</h4><div class="id">' + x.lat.toFixed(4) + ', ' + x.lon.toFixed(4) + '</div><table>' +
        '<tr><td>bright_ti4</td><td>' + r.ti4 + ' K</td></tr><tr><td>frp</td><td>' + r.frp + ' MW</td></tr><tr><td>confidence</td><td>' + r.conf + '</td></tr>' +
        '<tr><td>acq_date</td><td>' + isoLocal(x.date) + '</td></tr><tr><td>acq_time</td><td>' + r.time + ' UTC</td></tr>' +
        (r.firms ? '<tr><td>satellite</td><td>' + r.satellite + '</td></tr><tr><td>instrument</td><td>' + r.instrument + '</td></tr>' : '<tr><td>source</td><td>' + esc(x.source) + '</td></tr>') + '<tr><td>daynight</td><td>' + r.daynight + '</td></tr></table>' +
        '<div class="pop-actions"><span class="tag" style="--tc:' + RAW + '">no classification</span><span class="pop-btns"><button type="button" class="btn btn-ghost btn-sm ev-btn" data-evidence="' + x.id + '">Satellite evidence</button><a class="btn btn-ghost btn-sm ev-btn" href="thermal-dna.html?id=' + x.id + '">Thermal DNA</a><a class="btn btn-ghost btn-sm ev-btn" href="thermal-dna.html?id=' + x.id + '#dna-history">7-day threat history</a><a class="btn btn-ghost btn-sm ev-btn" href="regions.html?q=' + encodeURIComponent(x.region) + '">Analyse region</a>' + (x.risk === 'Critical' || x.risk === 'High' ? '<button type="button" class="btn btn-sm ev-btn sos-pop" data-sos="' + x.id + '">Emergency SOS</button><a class="btn btn-ghost btn-sm ev-btn" href="respond.html?id=' + x.id + '">Navigate</a>' : '') + '</span></div></div>';
    }
    function fwPopup(x) {
      return '<div class="pop"><h4>' + esc(x.type) + '</h4><div class="id">' + x.id + ' · queue position ' + x.rank + ' of ' + rows.length + '</div><table>' +
        '<tr><td>Confidence</td><td>' + x.conf + '%</td></tr><tr><td>Nearest industrial site</td><td>' + x.dist.toFixed(1) + ' km</td></tr><tr><td>Distinct days observed</td><td>' + x.days + '</td></tr><tr><td>Region</td><td>' + esc(x.region) + '</td></tr><tr><td>Source</td><td>' + esc(x.source) + '</td></tr></table>' +
        '<div class="pop-actions"><span class="tag" style="--tc:' + COLORS[x.risk] + '">' + x.risk + '</span><span class="pop-btns"><button type="button" class="btn btn-ghost btn-sm ev-btn" data-evidence="' + x.id + '">Satellite evidence</button><a class="btn btn-ghost btn-sm ev-btn" href="thermal-dna.html?id=' + x.id + '">Thermal DNA</a><a class="btn btn-ghost btn-sm ev-btn" href="thermal-dna.html?id=' + x.id + '#dna-history">7-day threat history</a><a class="btn btn-ghost btn-sm ev-btn" href="regions.html?q=' + encodeURIComponent(x.region) + '">Analyse region</a>' + (x.risk === 'Critical' || x.risk === 'High' ? '<button type="button" class="btn btn-sm ev-btn sos-pop" data-sos="' + x.id + '">Emergency SOS</button><a class="btn btn-ghost btn-sm ev-btn" href="respond.html?id=' + x.id + '">Navigate</a>' : '') + '</span></div></div>';
    }

    var mapA = null, mapB = null, groups = { raw: null, fw: null }, bases = [];
    var esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/{svc}/MapServer/tile/{z}/{y}/{x}';
    function makeMap(el) {
      var m = L.map(el, { worldCopyJump: true, scrollWheelZoom: false, minZoom: 2, maxZoom: 17, zoomControl: true });
      m.createPane('basemapLabels'); m.getPane('basemapLabels').style.zIndex = 250; m.getPane('basemapLabels').style.pointerEvents = 'none';
      var dark = L.layerGroup([
        L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Base'), { maxZoom: 16, attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors' }),
        L.tileLayer(esri.replace('{svc}', 'Canvas/World_Dark_Gray_Reference'), { maxZoom: 16 })
      ]);
      var sat = L.layerGroup([
        L.tileLayer(esri.replace('{svc}', 'World_Imagery'), { maxZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
        L.tileLayer(esri.replace('{svc}', 'Reference/World_Boundaries_and_Places'), { maxZoom: 18, pane: 'basemapLabels' })
      ]);
      dark.addTo(m); bases.push({ map: m, dark: dark, sat: sat });
      m.fitBounds(WORLD, { padding: [6, 6] });
      return m;
    }
    if (window.L) {
      mapA = makeMap($('#map-raw')); mapB = makeMap($('#map-fw'));
      groups.raw = L.layerGroup().addTo(mapA); groups.fw = L.layerGroup().addTo(mapB);
      /* Keep the two views locked together */
      var syncing = false;
      function follow(src, dst) {
        src.on('move', function () { if (syncing) return; syncing = true; dst.setView(src.getCenter(), src.getZoom(), { animate: false }); syncing = false; });
      }
      follow(mapA, mapB); follow(mapB, mapA);
      rows.forEach(function (x) {
        var frp = parseFloat(x.raw.frp), rr = 4 + Math.min(12, Math.sqrt(frp) * 1.15);
        x.mRaw = L.circleMarker([x.lat, x.lon], { radius: rr, color: 'rgba(4,8,16,.75)', weight: 1, fillColor: RAW, fillOpacity: 0.9, className: 'raw-pt' });
        x.mRaw.bindPopup(rawPopup(x), { maxWidth: 300 });
        x.mRaw.bindTooltip(x.lat.toFixed(2) + ', ' + x.lon.toFixed(2) + ' · ' + x.raw.ti4 + ' K', { direction: 'top', offset: [0, -rr - 2], className: 'fw-tip' });
        var hot = x.risk === 'Critical' || x.risk === 'High', rf = hot ? 5 + x.conf / 12 : 3 + x.conf / 30;
        x.mFw = L.circleMarker([x.lat, x.lon], { radius: rf, color: 'rgba(4,8,16,.75)', weight: 1, fillColor: COLORS[x.risk], fillOpacity: hot ? 0.94 : 0.42 });
        x.mFw.bindPopup(fwPopup(x), { maxWidth: 320 });
        x.mFw.bindTooltip(x.id + ' · ' + x.type + ' · ' + x.risk, { direction: 'top', offset: [0, -rf - 2], className: 'fw-tip' });
        if (x.risk === 'Critical') x.pulseFw = L.marker([x.lat, x.lon], { icon: L.divIcon({ className: 'fw-pulse', iconSize: [rf * 2.8, rf * 2.8] }), interactive: false, keyboard: false });
        /* A click on one side opens the twin on the other, in side-by-side layout */
        var twin = false;
        x.mRaw.on('popupopen', function () { if (twin || layout !== 'side') return; twin = true; x.mFw.openPopup(); twin = false; });
        x.mFw.on('popupopen', function () { if (twin || layout !== 'side') return; twin = true; x.mRaw.openPopup(); twin = false; });
      });
      addEventListener('resize', function () { mapA.invalidateSize(); mapB.invalidateSize(); });
      setTimeout(function () { mapA.invalidateSize(); mapB.invalidateSize(); }, 600);
    } else {
      $$('#map-raw,#map-fw').forEach(function (el) { el.innerHTML = '<div class="qempty" style="margin:18px">The map library did not load, so this map is hidden. The comparison below still works.</div>'; });
    }

    function inRegion() { return rows.filter(function (x) { return region === 'world' || x.india; }); }
    function draw() {
      var v = inRegion();
      if (groups.raw) {
        groups.raw.clearLayers(); groups.fw.clearLayers();
        v.slice().reverse().forEach(function (x) { groups.raw.addLayer(x.mRaw); if (x.risk === 'Medium' || x.risk === 'Low') groups.fw.addLayer(x.mFw); });
        v.slice().reverse().forEach(function (x) { if (x.risk === 'Critical' || x.risk === 'High') { groups.fw.addLayer(x.mFw); if (x.pulseFw) groups.fw.addLayer(x.pulseFw); } });
      }
      var a = v.filter(function (x) { return x.risk === 'Critical' || x.risk === 'High'; }).length;
      $('#cmp-raw-n').textContent = v.length; $('#cmp-raw-act').textContent = v.length;
      $('#cmp-fw-n').textContent = v.length; $('#cmp-fw-act').textContent = a;
    }
    draw();

    /* Controls */
    function press(group, attr, val) { $$('.sg[' + attr + ']', group).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute(attr) === val ? 'true' : 'false'); }); }
    var whichSeg = $('.cmp-which');
    function setWhich(w) {
      which = w; press(whichSeg, 'data-which', w);
      $$('.cmp-map', stage).forEach(function (p) { var on = p.getAttribute('data-side') === w; p.classList.toggle('on', on); });
      if (mapA && mapB) setTimeout(function () { (w === 'raw' ? mapA : mapB).invalidateSize(); }, 40);
    }
    function stopAuto() { if (autoT) { clearInterval(autoT); autoT = null; } var ab = $('#cmp-auto'); if (ab) ab.setAttribute('aria-pressed', 'false'); }
    function setLayout(l) {
      layout = l; press(stage.parentNode, 'data-layout', l);
      stage.classList.toggle('alt', l === 'alt');
      if (whichSeg) whichSeg.hidden = l !== 'alt';
      if (l === 'alt') { setWhich(which); } else { stopAuto(); $$('.cmp-map', stage).forEach(function (p) { p.classList.add('on'); }); }
      if (mapA && mapB) setTimeout(function () { mapA.invalidateSize(); mapB.invalidateSize(); }, 60);
    }
    $$('.sg[data-layout]').forEach(function (b) { b.addEventListener('click', function () { if (layout !== b.getAttribute('data-layout')) setLayout(b.getAttribute('data-layout')); }); });
    $$('.sg[data-which]').forEach(function (b) { b.addEventListener('click', function () { stopAuto(); setWhich(b.getAttribute('data-which')); }); });
    var autoBtn = $('#cmp-auto'); if (autoBtn) autoBtn.addEventListener('click', function () {
      if (autoT) { stopAuto(); return; }
      if (reduced()) { toast('Auto flip stays off while reduced motion is on. Use the Raw and Screened buttons.'); return; }
      autoBtn.setAttribute('aria-pressed', 'true');
      autoT = setInterval(function () { setWhich(which === 'raw' ? 'fw' : 'raw'); }, 2600);
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopAuto(); });
    $$('.sg[data-region]').forEach(function (b) { b.addEventListener('click', function () {
      var g = b.getAttribute('data-region'); if (g === region) return; region = g; press(b.parentNode, 'data-region', g);
      if (mapA) { var lead = (layout === 'alt' && which === 'fw') ? mapB : mapA; lead.flyToBounds(g === 'india' ? INDIA : WORLD, { padding: g === 'india' ? [0, 0] : [6, 6], duration: reduced() ? 0 : 1.4 }); }
      draw();
    }); });
    /* Base map, applied to both maps */
    var bmBtns = $$('#cmp-maps .basemap-toggle .bm'), evmC = null;
    if (window.FW_EVIDENCE && mapA && mapB) {
      evmC = FW_EVIDENCE.attachMode({ maps: [mapA, mapB], toggle: $('#cmp-maps .basemap-toggle'), before: stage,
        onEnter: function () { bases.forEach(function (s) { [s.dark, s.sat].forEach(function (b) { if (s.map.hasLayer(b)) s.map.removeLayer(b); }); }); $$('#cmp-maps .basemap-toggle .bm').forEach(function (o) { o.setAttribute('aria-pressed', o.getAttribute('data-basemap') === 'evidence' ? 'true' : 'false'); }); },
        onLeave: function () { bases.forEach(function (s) { if (!s.map.hasLayer(s.dark) && !s.map.hasLayer(s.sat)) s.dark.addTo(s.map); s.map.getContainer().classList.remove('is-satellite'); }); $$('#cmp-maps .basemap-toggle .bm').forEach(function (o) { o.setAttribute('aria-pressed', o.getAttribute('data-basemap') === 'map' ? 'true' : 'false'); }); } });
      rows.forEach(function (x) { [x.mRaw, x.mFw].forEach(function (m) { m.on('click', function () { if (evmC && evmC.isOn()) evmC.setDate(x.date); }); }); });
    }
    bmBtns.forEach(function (b) { b.addEventListener('click', function () {
      var name = b.getAttribute('data-basemap');
      if (evmC && evmC.isOn()) evmC.leave();
      $$('#cmp-maps .basemap-toggle .bm').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      bases.forEach(function (s) {
        var want = name === 'satellite' ? s.sat : s.dark, drop = name === 'satellite' ? s.dark : s.sat;
        if (s.map.hasLayer(drop)) s.map.removeLayer(drop); if (!s.map.hasLayer(want)) want.addTo(s.map);
        s.map.getContainer().classList.toggle('is-satellite', name === 'satellite');
      });
    }); });

    /* Numbers */
    var nums = { 'raw-total': rows.length, 'fw-total': rows.length, 'raw-act': rows.length, 'fw-act': act, 'fw-near': near, 'fw-rec': rec, 'fw-ctx': ctx };
    var numsFired = false;
    function fireNums() {
      if (numsFired) return; numsFired = true;
      $$('#cmp-pairs [data-n]').forEach(function (el) { fwCount(el, 0, nums[el.getAttribute('data-n')] || 0); });
    }
    var saved = $('#cmp-saved'); if (saved) saved.textContent = (rows.length - act) + ' of ' + rows.length + ' visits not needed, ' + Math.round((rows.length - act) / rows.length * 100) + '%';

    /* Workload bars: one full-width raw bar, one segmented screened bar on the same scale */
    var wb = $('#cmp-wbars'); if (wb) {
      var pct = function (n) { return (n / rows.length * 100).toFixed(2) + '%'; };
      wb.innerHTML =
        '<div class="wbar"><div class="wl">Raw feed<b>' + rows.length + ' to check</b></div><div class="track"><div class="segb" style="width:' + pct(rows.length) + ';background:' + RAW + '"><span>' + rows.length + ' undifferentiated detections</span></div></div></div>' +
        '<div class="wbar"><div class="wl">Screened<b>' + act + ' to check</b></div><div class="track">' +
          '<div class="segb" style="width:' + pct(crit) + ';background:var(--risk-critical);transition-delay:.15s"><span>' + crit + ' Critical</span></div>' +
          '<div class="segb" style="width:' + pct(high) + ';background:var(--risk-high);transition-delay:.3s"><span>' + high + ' High</span></div>' +
          '<div class="segb dim" style="width:' + pct(ctx) + ';background:rgba(51,71,92,.45);transition-delay:.45s"><span>' + ctx + ' kept for context, no visit</span></div>' +
        '</div></div>';
    }

    /* By day: received against escalated */
    var db = $('#cmp-dbars'), dt = $('#cmp-dtable tbody');
    if (db) {
      var days = {}; var order = [];
      rows.forEach(function (x) { var k = isoLocal(x.date); if (!days[k]) { days[k] = { d: x.date, n: 0, e: 0 }; order.push(k); } days[k].n++; if (x.risk === 'Critical' || x.risk === 'High') days[k].e++; });
      order.sort(); var max = 1; order.forEach(function (k) { max = Math.max(max, days[k].n); });
      db.style.gridTemplateColumns = 'repeat(' + order.length + ',1fr)';
      db.innerHTML = order.map(function (k, i) {
        var o = days[k], lab = String(o.d.getDate()).padStart(2, '0') + ' ' + FW_MON[o.d.getMonth()];
        return '<div class="dbar" title="' + lab + ': ' + o.n + ' received, ' + o.e + ' escalated"><div class="cols">' +
          '<div class="col" style="height:' + (o.n / max * 100) + '%;background:' + RAW + ';transition-delay:' + (i * 0.06) + 's"><em>' + o.n + '</em></div>' +
          '<div class="col" style="height:' + (o.e / max * 100) + '%;background:var(--accent);transition-delay:' + (i * 0.06 + 0.08) + 's"><em>' + o.e + '</em></div>' +
          '</div><div class="dl">' + lab + '</div></div>';
      }).join('');
      if (dt) dt.innerHTML = order.map(function (k) { var o = days[k]; return '<tr><td>' + String(o.d.getDate()).padStart(2, '0') + ' ' + FW_MON[o.d.getMonth()] + ' ' + o.d.getFullYear() + '</td><td>' + o.n + '</td><td>' + o.e + '</td><td>' + (o.n - o.e) + '</td></tr>'; }).join('');
    }

    /* One record, both ways */
    var sel = $('#cmp-select'), rawDl = $('#rec-raw'), fwDl = $('#rec-fw');
    var pick = rows.filter(function (x) { return x.raw.firms; });
    var cur = 0;
    function field(k, v, key, muted) { return '<div' + (key === 'added' ? ' class="is-added"' : '') + '><dt>' + k + '</dt><dd' + (muted ? ' class="muted"' : '') + '>' + v + '</dd>' + (key ? '<span class="fkey ' + key + '">' + key + '</span>' : '<span></span>') + '</div>'; }
    function show(i) {
      cur = (i + pick.length) % pick.length; var x = pick[cur], r = x.raw;
      if (sel) sel.value = String(cur);
      rawDl.innerHTML = [
        field('latitude', x.lat.toFixed(4)), field('longitude', x.lon.toFixed(4)),
        field('bright_ti4', r.ti4 + ' K'), field('scan', r.scan), field('track', r.track),
        field('acq_date', isoLocal(x.date)), field('acq_time', r.time),
        field('satellite', r.satellite), field('instrument', r.instrument), field('confidence', r.conf),
        field('version', r.version), field('bright_ti5', r.ti5 + ' K'), field('frp', r.frp + ' MW'), field('daynight', r.daynight)
      ].join('');
      var vd = fwVerdict(x.dist, x.days, x.conf);
      $('#rec-fw-h').textContent = x.type; var tg = $('#rec-fw-tag'); tg.textContent = x.risk; tg.style.setProperty('--tc', COLORS[x.risk]);
      fwDl.innerHTML = [
        field('site_id', x.id, 'added'), field('lat, lon', x.lat.toFixed(4) + ', ' + x.lon.toFixed(4), 'kept'),
        field('region', esc(x.region), 'added'), field('source', esc(x.source) + ' · ' + r.satellite, 'kept'),
        field('detected_on', x.dateS + ', ' + r.time + ' UTC', 'kept'), field('frp', r.frp + ' MW', 'kept'),
        field('confidence', x.conf + '%' + (r.instrument === 'VIIRS' ? ' (from ' + r.conf + ')' : ''), 'normalised'),
        field('distance_km', x.dist.toFixed(1) + ' km to nearest industrial site', 'added'),
        field('days_seen', x.days + ' distinct day' + (x.days === 1 ? '' : 's'), 'added'),
        field('type', esc(x.type), 'added'), field('risk_level', x.risk, 'added'),
        field('queue_position', x.rank + ' of ' + rows.length, 'added')
      ].join('');
      $('#rec-fw-handle').textContent = vd.handle;
    }
    if (sel) {
      sel.innerHTML = pick.map(function (x, i) { return '<option value="' + i + '">' + x.id + ' · ' + esc(x.region) + ' · ' + esc(x.source.replace('NASA FIRMS ', '')) + '</option>'; }).join('');
      sel.addEventListener('change', function () { show(parseInt(sel.value, 10) || 0); });
      $('#cmp-prev').addEventListener('click', function () { show(cur - 1); });
      $('#cmp-next').addEventListener('click', function () { show(cur + 1); });
      $('#cmp-random').addEventListener('click', function () { var n = Math.floor(Math.random() * pick.length); show(n === cur ? n + 1 : n); });
      show(0);
    }
    /* Field-by-field table sits behind a Know more button */
    var ft = $('#fields-toggle'), fb = $('#fields-body');
    if (ft && fb) ft.addEventListener('click', function () { var open = fb.hidden; fb.hidden = !open; ft.setAttribute('aria-expanded', open ? 'true' : 'false'); ft.textContent = open ? 'Show less' : 'Know more'; if (open) setTimeout(function () { fb.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); }, 40); });
    return { fireNums: fireNums };
  })();
  var toastEl = $('.toast'), toastT;
  function toast(msg) { if (!toastEl) return; toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 3200); }

  /* ------------------------------------------------------------------ */
  /* Hold to verify                                                      */
  /* ------------------------------------------------------------------ */
  var hold = (function () {
    var instr = $('.instr'); if (!instr) return null;
    var sigs = $$('.sig:not(.right) li'), verdict = $('.verdict');
    var sigTxt = [$('#sig-1'), $('#sig-2'), $('#sig-3')];
    var vdType = $('#vd-type'), vdRisk = $('#vd-risk'), vdHandle = $('#vd-handle');
    var status = $('#loc-status'), locBtn = $('#loc-btn'), sampleBtn = $('#sample-btn');
    var again = $('#again'), againBtn = $('#again-btn');
    var tgTag = $('#tg-tag'), tgId = $('#tg-id'), tgPlace = $('#tg-place'), tgCoord = $('#tg-coord'),
        tgSrc = $('#tg-src'), tgWhen = $('#tg-when'), tgFrp = $('#tg-frp');
    var p = 0, holding = false, raf = null, last = 0, done = false, userDone = false;
    var target = null, busy = false, sampleIdx = -1;

    var FIRE_URL = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
    var CONF = { high: 90, nominal: 65, low: 35, h: 90, n: 65, l: 35 };
    var MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function say(msg) { if (status) status.textContent = msg; }
    var vdSos = $('#vd-sos'); if (vdSos) vdSos.addEventListener('click', function () { if (!target || !window.FW_SOS) return; var vv = fwVerdict(target.dist, target.days, target.conf); FW_SOS.open({ id: target.id, region: target.place, lat: target.lat, lon: target.lon, date: target.date, source: target.src, type: vv.type, risk: vv.risk, conf: target.conf, dist: target.dist, days: target.days, frp: target.frp }); });
    var tgEv = $('#tg-evidence'); if (tgEv) tgEv.addEventListener('click', function () { if (!target || !window.FW_EVIDENCE) return; FW_EVIDENCE.open({ id: target.id, place: target.place, lat: target.lat, lon: target.lon, date: target.date, source: target.src, type: target.type, risk: target.risk, conf: target.conf, dist: target.dist, days: target.days }); });
    function stamp(d) {
      if (!d) return 'unknown time';
      var t = new Date(d);
      return String(t.getUTCDate()).padStart(2, '0') + ' ' + MONS[t.getUTCMonth()] + ' ' + t.getUTCFullYear() +
        ', ' + String(t.getUTCHours()).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0') + ' UTC';
    }
    function reset() {
      if (raf) cancelAnimationFrame(raf);
      raf = null; holding = false; p = 0; done = false; userDone = false;
      instr.classList.remove('done'); verdict.classList.remove('on');
      instr.setAttribute('aria-pressed', 'false');
      if (again) again.hidden = true;
      apply();
    }
    function paint(t) {
      target = t; var vn = $('#vd-nav'); if (vn) vn.href = 'respond.html?' + (/^FW-\d{4}$/.test(t.id) ? 'id=' + t.id : 'lat=' + t.lat.toFixed(5) + '&lon=' + t.lon.toFixed(5) + '&name=' + encodeURIComponent(t.id) + '&place=' + encodeURIComponent(t.place || ''));
      tgTag.textContent = t.live ? 'Live detection' : 'Sample record';
      tgTag.classList.toggle('is-live', !!t.live);
      tgId.textContent = t.id;
      tgPlace.textContent = t.place;
      tgCoord.textContent = t.lat.toFixed(4) + ', ' + t.lon.toFixed(4);
      tgSrc.textContent = t.src;
      tgWhen.textContent = t.when;
      tgFrp.textContent = t.frp;
      sigTxt[0].textContent = t.confLabel;
      sigTxt[1].textContent = t.distLabel;
      sigTxt[2].textContent = t.daysLabel;
      if (t.distUnknown) {
        vdType.textContent = 'Not screened';
        vdRisk.textContent = 'Rule incomplete';
        vdRisk.style.setProperty('--tc', 'var(--text-secondary)');
        vdHandle.textContent = 'The OpenStreetMap lookup did not answer, so the proximity rule could not run. Nothing is classified on two rules out of three. Try again in a moment.';
      } else {
        var v = fwVerdict(t.dist, t.days, t.conf);
        vdType.textContent = v.type;
        vdRisk.textContent = v.risk;
        vdRisk.style.setProperty('--tc', FW_COLORS[v.risk]);
        vdHandle.textContent = v.handle;
      }
      reset();
    }
    function sample(announce) {
      if (!FW_ROWS || !FW_ROWS.length) return;
      var i; do { i = Math.floor(Math.random() * FW_ROWS.length); } while (FW_ROWS.length > 1 && i === sampleIdx);
      sampleIdx = i; var r = FW_ROWS[i];
      paint({
        live: false, id: r.id, place: r.region, lat: r.lat, lon: r.lon, src: r.source, date: r.date, type: r.type, risk: r.risk,
        when: r.dateS, frp: 'not recorded', conf: r.conf, dist: r.dist, days: r.days,
        confLabel: 'confidence ' + r.conf + '%',
        distLabel: r.dist.toFixed(1) + ' km · ' + (r.dist <= 3 ? 'within 3 km' : 'outside 3 km'),
        daysLabel: 'seen on ' + r.days + ' separate day' + (r.days === 1 ? '' : 's') + ' · ' + (r.days >= 3 ? '3 or more' : 'fewer than 3')
      });
      if (announce) say('Sample record ' + r.id + ', ' + r.region + '. Hold the point to screen it.');
    }
    function fires(lat, lon, km) {
      var dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
      var env = (lon - dLon).toFixed(4) + ',' + (lat - dLat).toFixed(4) + ',' + (lon + dLon).toFixed(4) + ',' + (lat + dLat).toFixed(4);
      var u = FIRE_URL + '?where=1%3D1&geometry=' + env + '&geometryType=esriGeometryEnvelope&inSR=4326' +
        '&spatialRel=esriSpatialRelIntersects&outFields=latitude,longitude,confidence,frp,acq_date,acq_time,satellite,daynight,hours_old' +
        '&returnGeometry=false&resultRecordCount=2000&f=json';
      return fwGet(u, null, 14000).then(function (j) {
        return (j.features || []).map(function (f) { return f.attributes; }).filter(function (a) { return a && a.latitude != null; });
      });
    }
    function bboxSites(lat, lon, km) {
      var dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
      var bb = (lat - dLat).toFixed(3) + ',' + (lon - dLon).toFixed(3) + ',' + (lat + dLat).toFixed(3) + ',' + (lon + dLon).toFixed(3);
      var q = '[out:json][timeout:12];(way["landuse"="industrial"](' + bb + ');relation["landuse"="industrial"](' + bb + ');' +
        'way["man_made"="works"](' + bb + ');way["power"="plant"](' + bb + '););out center 200;';
      return fwGet('https://overpass-api.de/api/interpreter', {
        method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }, 20000).then(function (j) {
        var best = null;
        (j.elements || []).forEach(function (e) {
          var c = e.center || e; if (c.lat == null) return;
          var d = fwHaversine(lat, lon, c.lat, c.lon);
          if (!best || d < best.d) best = { d: d, name: (e.tags && e.tags.name) || null };
        });
        return best ? { status: 'found', d: best.d, name: best.name } : { status: 'none' };
      });
    }
    /* One retry after a pause, then a widened box. A lookup that never answers is
       reported as unknown, never as "no site nearby": those mean opposite things.
       Answers are cached for the tab so a second look never re-queries. */
    var siteCache = {};
    function pause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function nearestSite(lat, lon) {
      var key = lat.toFixed(2) + ',' + lon.toFixed(2);
      if (siteCache[key]) return Promise.resolve(siteCache[key]);
      return bboxSites(lat, lon, 8)
        .catch(function () { return pause(1400).then(function () { return bboxSites(lat, lon, 8); }); })
        .then(function (r) {
          if (r.status !== 'none') return r;
          return pause(900).then(function () { return bboxSites(lat, lon, 30); }).catch(function () { return { status: 'failed' }; });
        })
        .catch(function () { return { status: 'failed' }; })
        .then(function (r) { if (r.status !== 'failed') siteCache[key] = r; return r; });
    }
    function placeName(lat, lon) {
      return fwGet('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=' + lat + '&lon=' + lon, null, 9000)
        .then(function (j) {
          var a = j.address || {};
          var bits = [a.county || a.city || a.town || a.village || a.suburb || a.state_district, a.state, a.country].filter(Boolean);
          return bits.length ? bits.join(', ') : (j.display_name || null);
        }).catch(function () { return null; });
    }
    function live() {
      if (busy) return;
      if (!navigator.geolocation) { say('This browser will not share a location, so the sample record stays.'); return; }
      busy = true; locBtn.disabled = true; say('Asking your browser for your location.');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        say('Located. Pulling the live VIIRS feed around you.');
        var radius = 60;
        fires(lat, lon, radius).then(function (list) {
          if (!list.length) { say('Nothing burning within ' + radius + ' km of you in the last week. Widening the search.'); return fires(lat, lon, 400).then(function (l2) { radius = 400; return l2; }); }
          return list;
        }).then(function (list) {
          if (!list || !list.length) { throw new Error('no detections'); }
          list.forEach(function (a) { a._d = fwHaversine(lat, lon, a.latitude, a.longitude); });
          list.sort(function (a, b) { return a._d - b._d; });
          var t = list[0];
          var days = {};
          list.forEach(function (a) { if (fwHaversine(t.latitude, t.longitude, a.latitude, a.longitude) <= 1) days[a.acq_date] = 1; });
          var nDays = Math.max(1, Object.keys(days).length);
          say('Found ' + list.length + ' live detection' + (list.length === 1 ? '' : 's') + '. Nearest is ' + t._d.toFixed(1) + ' km away. Measuring it against mapped industrial sites.');
          return Promise.all([
            nearestSite(t.latitude, t.longitude),
            placeName(t.latitude, t.longitude)
          ]).then(function (res) {
            var site = res[0], place = res[1];
            var conf = CONF[String(t.confidence).toLowerCase()] != null ? CONF[String(t.confidence).toLowerCase()] : (parseInt(t.confidence, 10) || 50);
            var found = site && site.status === 'found';
            var unknown = !site || site.status === 'failed';
            var dist = found ? site.d : 99;
            paint({
              live: true, date: t.acq_date ? new Date(t.acq_date) : null,
              id: 'VIIRS ' + (t.satellite || 'N') + ' · ' + (t.daynight === 'D' ? 'day pass' : 'night pass'),
              place: place || (t.latitude.toFixed(3) + ', ' + t.longitude.toFixed(3)),
              lat: t.latitude, lon: t.longitude,
              src: 'NASA FIRMS (VIIRS), live',
              when: stamp(t.acq_time || t.acq_date) + (t.hours_old != null ? ' · ' + Math.round(t.hours_old) + ' h old' : ''),
              frp: (t.frp != null ? t.frp.toFixed(2) + ' MW' : 'not reported'),
              conf: conf, dist: dist, days: nDays, distUnknown: unknown,
              confLabel: 'reported ' + String(t.confidence) + ' · read as ' + conf + '%',
              distLabel: unknown ? 'the OpenStreetMap lookup did not answer' :
                (found ? (site.d.toFixed(1) + ' km' + (site.name ? ' from ' + site.name : ' from the nearest mapped site') + ' · ' + (site.d <= 3 ? 'within 3 km' : 'outside 3 km'))
                       : 'no mapped industrial site within 30 km'),
              daysLabel: 'seen on ' + nDays + ' separate day' + (nDays === 1 ? '' : 's') + ' · ' + (nDays >= 3 ? '3 or more' : 'fewer than 3')
            });
            say('Live detection ' + t._d.toFixed(1) + ' km from you, acquired ' + stamp(t.acq_time || t.acq_date) + '. Hold the point to screen it.');
            busy = false; locBtn.disabled = false;
          });
        }).catch(function (e) {
          say('The live feed did not answer (' + (e && e.message ? e.message : 'no response') + '), so a sample record is loaded instead.');
          sample(false); busy = false; locBtn.disabled = false;
        });
      }, function (err) {
        say(err && err.code === 1 ? 'Location permission was declined, so the sample record stays.' : 'Your location could not be read, so the sample record stays.');
        busy = false; locBtn.disabled = false;
      }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    }

    function apply() {
      instr.style.setProperty('--p', p.toFixed(3));
      sigs.forEach(function (li, i) { li.classList.toggle('on', p >= [0.34, 0.67, 0.995][i % 3]); });
      if (p >= 0.995 && !done) {
        done = true; instr.classList.add('done'); verdict.classList.add('on');
        instr.setAttribute('aria-pressed', 'true');
        if (again) again.hidden = false;
      }
    }
    function loop(now) {
      var dt = Math.min(80, now - (last || now)); last = now;
      if (holding) p = Math.min(1, p + dt / 1600); else if (!done) p = Math.max(0, p - dt / 900);
      apply();
      if ((holding && p < 1) || (!holding && !done && p > 0)) raf = requestAnimationFrame(loop); else { raf = null; last = 0; }
    }
    function start(e) { if (done) return; if (e && e.preventDefault) e.preventDefault(); holding = true; if (raf === null) raf = requestAnimationFrame(loop); }
    function stop() { holding = false; if (!done && raf === null && p > 0) raf = requestAnimationFrame(loop); }
    instr.addEventListener('pointerdown', function (e) { try { if (instr.setPointerCapture) instr.setPointerCapture(e.pointerId); } catch (err) { } start(e); });
    instr.addEventListener('pointerup', stop); instr.addEventListener('pointercancel', stop); instr.addEventListener('pointerleave', stop);
    instr.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { start(e); } });
    instr.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') stop(); });
    instr.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    if (locBtn) locBtn.addEventListener('click', live);
    if (sampleBtn) sampleBtn.addEventListener('click', function () { sample(true); });
    if (againBtn) againBtn.addEventListener('click', function () { if (target && target.live) { reset(); say('Same live detection, ready to screen again.'); } else sample(true); });
    sample(false);

    return {
      pin: function () { if (raf) cancelAnimationFrame(raf); raf = null; holding = false; p = 1; apply(); },
      unpin: function () { if (userDone) return; done = false; p = 0; instr.classList.remove('done'); verdict.classList.remove('on'); instr.setAttribute('aria-pressed', 'false'); apply(); },
      markUser: function () { userDone = done; }
    };
  })();

  /* ------------------------------------------------------------------ */
  /* Home: feed ticker, live panel, pixel switch, the screener           */
  /* ------------------------------------------------------------------ */
  (function ticker() {
    var tk = $('#tk'); if (!tk || !FW_ROWS) return;
    var n = $('#ops-n'); if (n) n.textContent = FW_ROWS.length;
    var pick = FW_ROWS.filter(function (x) { return x.risk === 'Critical' || x.risk === 'High'; }).slice(0, 14);
    if (!pick.length) return;
    var rows = pick.map(function (x) {
      var el = document.createElement('div'); el.className = 'tk-row';
      el.innerHTML = '<span class="id">' + x.id + '</span><span class="pl">' + fwEsc(x.region) + '</span><span class="id">' + fwEsc(x.type) + '</span>' +
        '<span class="rk" style="--tc:' + FW_COLORS[x.risk] + '">' + x.risk + '</span>' +
        '<span class="id">' + x.dist.toFixed(1) + ' km · ' + x.days + 'd · ' + x.conf + '%</span>';
      tk.appendChild(el); return el;
    });
    rows[0].classList.add('on');
    var i = 0, timer = null, held = false;
    function step() { if (held) return; rows[i].classList.remove('on'); i = (i + 1) % rows.length; rows[i].classList.add('on'); }
    function start() { clearInterval(timer); if (reduced()) return; timer = setInterval(step, 3600); }
    tk.addEventListener('mouseenter', function () { held = true; });
    tk.addEventListener('mouseleave', function () { held = false; });
    document.addEventListener('visibilitychange', function () { if (document.hidden) clearInterval(timer); else start(); });
    reduceMQ.addEventListener('change', start);
    start();
  })();

  (function homeLive() {
    var ul = $('#h-queue'); if (!ul || !FW_ROWS) return;
    var els = { view: $('#h-view'), crit: $('#h-crit'), high: $('#h-high'), ind: $('#h-ind'), rec: $('#h-rec') };
    var shown = { view: 0, crit: 0, high: 0, ind: 0, rec: 0 };
    var region = 'world', started = false;
    function inView() { return FW_ROWS.filter(function (x) { return region === 'world' || x.india; }); }
    function render(animate) {
      var v = inView();
      var vals = {
        view: v.length,
        crit: v.filter(function (x) { return x.risk === 'Critical'; }).length,
        high: v.filter(function (x) { return x.risk === 'High'; }).length,
        ind: v.filter(function (x) { return x.type === 'Industrial Fire'; }).length,
        rec: v.filter(function (x) { return x.days >= 3; }).length
      };
      Object.keys(els).forEach(function (k) { fwCount(els[k], animate ? shown[k] : vals[k], vals[k]); shown[k] = vals[k]; });
      var q = v.filter(function (x) { return x.risk === 'Critical' || x.risk === 'High'; });
      var qn = $('#h-qn'); if (qn) qn.textContent = q.length;
      var frag = document.createDocumentFragment();
      q.slice(0, 4).forEach(function (x, idx) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="rank">' + String(idx + 1).padStart(2, '0') + '</span>' +
          '<div><div class="t">' + fwEsc(x.type) + ' · ' + fwEsc(x.region) + '</div>' +
          '<div class="m">' + x.id + ' · ' + x.dist.toFixed(1) + ' km from a mapped site · seen on ' + x.days + ' separate day' + (x.days === 1 ? '' : 's') + ' · ' + fwEsc(x.source) + '</div></div>' +
          '<div class="r"><span class="tag" style="--tc:' + FW_COLORS[x.risk] + '">' + x.risk + '</span>' +
          '<div class="conf">' + x.conf + '%</div><div class="meter"><i style="--w:' + x.conf + '%;--tc:' + FW_COLORS[x.risk] + '"></i></div></div>';
        frag.appendChild(li);
      });
      ul.innerHTML = ''; ul.appendChild(frag);
    }
    $$('[data-hregion]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.getAttribute('data-hregion'); if (g === region) return; region = g;
        $$('[data-hregion]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        render(started);
      });
    });
    var sec = $('#live');
    if (sec && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !started) { started = true; render(true); io.disconnect(); } });
      }, { threshold: 0.2 });
      io.observe(sec);
      render(false); ul.innerHTML = '';
      Object.keys(els).forEach(function (k) { if (els[k]) els[k].textContent = '0'; shown[k] = 0; });
    } else { started = true; render(false); }
  })();

  (function pixelSwitch() {
    var a = $('#px-a'), b = $('#px-b'); if (!a || !b) return;
    var out = {
      a: { dist: '14.0 km', days: '1', land: 'Cropland', title: 'Agricultural Burning, Medium', tc: 'var(--risk-medium)', note: 'Kept for context and never escalated. It never reaches the officer\'s queue.' },
      b: { dist: '0.9 km', days: '5', land: 'Industrial, mapped in OpenStreetMap', title: 'Industrial Fire, Critical', tc: 'var(--risk-critical)', note: 'Routed to the district industrial-safety authority for ground verification within 24 hours.' }
    };
    var el = { dist: $('#px-dist'), days: $('#px-days'), land: $('#px-land'), title: $('#px-title'), note: $('#px-note'), box: $('#px-verdict') };
    var cur = 'a';
    function set(k) {
      if (k === cur) return; cur = k;
      a.classList.toggle('on', k === 'a'); b.classList.toggle('on', k === 'b');
      var d = out[k];
      el.dist.textContent = d.dist; el.days.textContent = d.days; el.land.textContent = d.land;
      el.title.textContent = d.title; el.note.textContent = d.note; el.box.style.setProperty('--tc', d.tc);
      $$('[data-px]').forEach(function (o) { o.setAttribute('aria-pressed', o.getAttribute('data-px') === k ? 'true' : 'false'); });
    }
    $$('[data-px]').forEach(function (btn) { btn.addEventListener('click', function () { set(btn.getAttribute('data-px')); }); });
  })();

  (function screener() {
    var dist = $('#s-dist'); if (!dist) return;
    var days = $('#s-days'), conf = $('#s-conf');
    var vD = $('#v-dist'), vY = $('#v-days'), vC = $('#v-conf');
    var rP = $('#r-prox'), rR = $('#r-pers'), rC = $('#r-conf');
    var liP = $('[data-rule="prox"]'), liR = $('[data-rule="pers"]'), liC = $('[data-rule="conf"]');
    var out = $('#s-out'), oType = $('#s-type'), oRisk = $('#s-risk'), oHandle = $('#s-handle');
    var live = $('#s-out .in'); if (live) live.setAttribute('aria-live', 'polite');
    function fill(el) { var p = (el.value - el.min) / (el.max - el.min) * 100; el.style.setProperty('--p', p.toFixed(1) + '%'); }
    function update() {
      var d = dist.value / 10, y = +days.value, c = +conf.value;
      [dist, days, conf].forEach(fill);
      vD.textContent = d.toFixed(1) + ' km';
      vY.textContent = y + (y === 1 ? ' day' : ' days');
      vC.textContent = c + '%';
      dist.setAttribute('aria-valuetext', d.toFixed(1) + ' kilometres');
      days.setAttribute('aria-valuetext', y + (y === 1 ? ' day' : ' days'));
      conf.setAttribute('aria-valuetext', c + ' percent');
      var prox = d <= 3, pers = y >= 3, high = c >= 85;
      liP.classList.toggle('pass', prox); liR.classList.toggle('pass', pers); liC.classList.toggle('pass', high);
      rP.textContent = d.toFixed(1) + ' km, ' + (prox ? 'within the 3 km trigger' : 'outside the 3 km trigger');
      rR.textContent = 'seen on ' + y + ' separate day' + (y === 1 ? '' : 's') + ', ' + (pers ? 'at or over the 3 day trigger' : 'under the 3 day trigger');
      rC.textContent = 'confidence ' + c + '%, ' + (high ? 'at or over 85%' : 'under 85%');
      var v = fwVerdict(d, y, c), type = v.type, risk = v.risk, handle = v.handle;
      if (oType.textContent !== type) oType.textContent = type;
      if (oRisk.textContent !== risk) oRisk.textContent = risk;
      if (oHandle.textContent !== handle) oHandle.textContent = handle;
      oRisk.style.setProperty('--tc', FW_COLORS[risk]); out.style.setProperty('--tc', FW_COLORS[risk]);
    }
    [dist, days, conf].forEach(function (el) { el.addEventListener('input', update); });
    $$('[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.getAttribute('data-preset').split(',');
        dist.value = Math.round(parseFloat(p[0]) * 10); days.value = p[1]; conf.value = p[2]; update();
      });
    });
    update();
  })();

  /* ------------------------------------------------------------------ */
  /* Reveals and living elements                                         */
  /* ------------------------------------------------------------------ */
  var railDraw = $('.rail .draw'), rail = $('.rail');
  var kpiFired = false;
  function fireKpis() { if (kpiFired || !dash) return; kpiFired = true; dash.update(); if (dash.confirmLive) setTimeout(dash.confirmLive, 1200); }
  (function reveals() {
    if (!('IntersectionObserver' in window)) { $$('.rv,.divider').forEach(function (e) { e.classList.add('in', 'done'); }); fireKpis(); if (cmp) cmp.fireNums(); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return; var el = e.target; el.classList.add('in'); io.unobserve(el);
        if (el.id === 'dashboard' || el.classList.contains('kpis')) fireKpis();
        if (cmp && el.id === 'cmp-numbers') cmp.fireNums();
        setTimeout(function () { el.classList.add('done'); }, 1400);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    $$('.rv,.divider,.diptych figure').forEach(function (e) { io.observe(e); });
    var live = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle('live', e.isIntersecting); }); }, { threshold: 0.05 });
    $$('.section,.map-l,.rail').forEach(function (e) { live.observe(e); });
  })();
  (function gsapLayer() {
    if (!window.gsap || !window.ScrollTrigger || reduced()) { if (railDraw) { new IntersectionObserver(function (es) { if (es[0].isIntersecting) railDraw.style.strokeDashoffset = 0; }, { threshold: 0.3 }).observe(rail); railDraw.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.16,1,.3,1)'; } return; }
    gsap.registerPlugin(ScrollTrigger);
    if (railDraw) gsap.fromTo(railDraw, { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: rail, start: 'top 80%', end: 'bottom 55%', scrub: 0.6 } });
    $$('.stk .fig').forEach(function (f) { gsap.fromTo(f, { y: 28 }, { y: -28, ease: 'none', scrollTrigger: { trigger: f, start: 'top bottom', end: 'bottom top', scrub: 0.8 } }); });
    $$('.diptych img').forEach(function (im) { gsap.fromTo(im, { yPercent: -4 }, { yPercent: 4, ease: 'none', scrollTrigger: { trigger: im.parentNode, start: 'top bottom', end: 'bottom top', scrub: 0.8 } }); });
    var kp = $('.kpis'); if (kp) gsap.from($$('.kpi', kp), { y: 24, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: kp, start: 'top 85%', once: true } });
    if ($('.stage-card')) gsap.from($$('.stage-card'), { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.12, scrollTrigger: { trigger: '.stages', start: 'top 80%', once: true } });
    [['.prow', '.p-item'], ['.srcs', '.src'], ['.whorow', '.who-card'], ['.miniq', '.miniq li']].forEach(function (pair) {
      var wrap = $(pair[0]); if (!wrap) return;
      var kids = $$(pair[1], wrap); if (!kids.length) return;
      gsap.from(kids, { y: 22, opacity: 0, duration: .95, ease: 'expo.out', stagger: .07, scrollTrigger: { trigger: wrap, start: 'top 88%', once: true } });
    });
    $$('.limlist li').forEach(function (li, i) { gsap.from(li, { x: -14, opacity: 0, duration: .8, ease: 'expo.out', delay: i * .05, scrollTrigger: { trigger: li, start: 'top 92%', once: true } }); });
  })();

  /* ------------------------------------------------------------------ */
  /* Reduced motion, live, both directions                               */
  /* ------------------------------------------------------------------ */
  var pinned = false;
  function pinToFinalStates() {
    pinned = true;
    $$('.rv,.divider,.diptych figure').forEach(function (e) { e.classList.add('in', 'done'); });
    if (railDraw) railDraw.style.strokeDashoffset = 0;
    if (hold) hold.pin();
    if (dash) dash.finish();
    if (cmp) cmp.fireNums();
    kpiFired = true;
  }
  function unpinFinalStates() {
    if (!pinned) return; pinned = false;
    if (railDraw && !(window.gsap && window.ScrollTrigger)) railDraw.style.strokeDashoffset = '';
    if (hold) hold.unpin();
  }
  reduceMQ.addEventListener('change', function (e) { if (e.matches) pinToFinalStates(); else { if (hold) hold.markUser(); applyHeroMode(); } });
  document.addEventListener('visibilitychange', function () { document.body.classList.toggle('paused', document.hidden); });
  $$('.faq details').forEach(function (d) { d.addEventListener('toggle', function () { if (d.open) $$('.faq details').forEach(function (o) { if (o !== d) o.open = false; }); }); });
  $$('[data-app-link]').forEach(function (a) { if (!a.getAttribute('href') || a.getAttribute('href') === '#') a.hidden = true; });

  applyHeroMode();
  if (reduced()) pinToFinalStates();
  if (dash && location.hash === '#queue') fireKpis();
  requestAnimationFrame(function () { document.body.classList.add('ready'); });
})();
