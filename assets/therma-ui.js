/* Therma part 3: the widget. */
(function () {
  'use strict';
  var C = window.THERMA_CORE, B = window.THERMA_BRAIN; if (!C || !B) return;
  var esc = C.esc, $ = C.$, reduced = C.reduced;
  var STORE = 'therma.v1';
  var state = { lang: null, auto: true, open: false, msgs: [], scope: null, pending: null, offset: 0, unread: 0 };
  try { var saved = JSON.parse(sessionStorage.getItem(STORE) || 'null'); if (saved && saved.msgs) { state.lang = saved.lang; state.auto = saved.auto !== false; state.msgs = saved.msgs.slice(-40); state.scope = saved.scope || null; state.open = !!saved.open; } } catch (e) { }
  if (!state.lang) state.lang = /^hi\b/i.test(navigator.language || '') ? 'hi' : 'en';
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify({ lang: state.lang, auto: state.auto, msgs: state.msgs.slice(-40), scope: state.scope, open: state.open })); } catch (e) { } }
  var L = function () { return state.lang; };
  var UI = {
    en: { name: 'Therma', role: 'FireWatch guide', open: 'Open Therma, the FireWatch guide', close: 'Close', placeholder: 'Ask about hotspots, risk, regions, or this site', send: 'Send', lang: 'Language', auto: 'Auto', clear: 'Clear chat', typing: 'Therma is typing', hint: 'English or Hindi. Nothing leaves this page.', minimise: 'Minimise' },
    hi: { name: 'Therma', role: 'FireWatch गाइड', open: 'Therma खोलें, FireWatch गाइड', close: 'बंद करें', placeholder: 'हॉटस्पॉट, जोखिम, क्षेत्र या इस साइट के बारे में पूछें', send: 'भेजें', lang: 'भाषा', auto: 'ऑटो', clear: 'चैट साफ़ करें', typing: 'Therma लिख रही है', hint: 'अंग्रेज़ी या हिंदी। कुछ भी इस पेज से बाहर नहीं जाता।', minimise: 'छोटा करें' }
  };
  var ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M16 2.5v4M16 25.5v4M2.5 16h4M25.5 16h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M16 9.5c2.6 2.2 4.2 4.6 4.2 7.1 0 2.5-1.9 4.4-4.2 4.4s-4.2-1.9-4.2-4.4c0-1.5.6-2.7 1.4-3.8.2 1.1.8 1.9 1.6 2.3-.3-2 .3-4 1.2-5.6z" fill="currentColor"/></svg>';

  /* ------------------------------------------------------------------ */
  /* DOM                                                                 */
  /* ------------------------------------------------------------------ */
  var root = document.createElement('div'); root.className = 'therma'; root.setAttribute('data-nosnippet', '');
  root.innerHTML =
    '<button type="button" class="th-launch" aria-haspopup="dialog" aria-expanded="false" aria-controls="th-panel"><span class="th-ico">' + ICON + '</span><span class="th-name">Therma</span><span class="th-badge" hidden>1</span></button>' +
    '<section class="th-panel" id="th-panel" role="dialog" aria-modal="false" aria-label="Therma" hidden>' +
      '<header class="th-head">' +
        '<span class="th-avatar">' + ICON + '</span>' +
        '<div class="th-title"><b>Therma</b><span class="th-role"></span></div>' +
        '<div class="th-langs" role="group"><button type="button" class="th-lang" data-lang="en" aria-pressed="false">EN</button><button type="button" class="th-lang" data-lang="hi" aria-pressed="false">हिं</button></div>' +
        '<button type="button" class="th-x" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>' +
      '</header>' +
      '<div class="th-log" role="log" aria-live="polite" aria-relevant="additions"></div>' +
      '<div class="th-chips" role="group"></div>' +
      '<form class="th-form" autocomplete="off"><label class="sr" for="th-in">Message</label><textarea id="th-in" rows="1" maxlength="400"></textarea><button type="submit" class="th-send" aria-label="Send"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form>' +
      '<div class="th-foot"><span class="th-hint"></span><button type="button" class="th-clear"></button></div>' +
    '</section>';
  document.body.appendChild(root);
  var launch = $('.th-launch', root), panel = $('.th-panel', root), log = $('.th-log', root), chipsEl = $('.th-chips', root), form = $('.th-form', root), input = $('#th-in', root), badge = $('.th-badge', root);

  function applyLang() {
    var u = UI[L()];
    $('.th-role', root).textContent = u.role; launch.setAttribute('aria-label', u.open); launch.title = u.open;
    $('.th-x', root).setAttribute('aria-label', u.close); input.placeholder = u.placeholder; $('.th-send', root).setAttribute('aria-label', u.send);
    $('.th-hint', root).textContent = u.hint; $('.th-clear', root).textContent = u.clear; $('.th-langs', root).setAttribute('aria-label', u.lang);
    Array.prototype.forEach.call(root.querySelectorAll('.th-lang'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === L() ? 'true' : 'false'); });
    input.lang = L();
  }

  /* Light markdown: **bold**, line breaks, bullets */
  function fmt(t) {
    var h = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    return h.split('\n').map(function (line) { return line.replace(/^• /, '<span class="th-dot"></span>'); }).join('<br>');
  }
  function addMsg(m, silent) {
    var el = document.createElement('div'); el.className = 'th-msg ' + (m.who === 'me' ? 'me' : 'bot');
    var html = '<div class="th-b">' + fmt(m.text) + '</div>';
    if (m.links && m.links.length) html += '<div class="th-links">' + m.links.filter(Boolean).map(function (l) { return '<a href="' + esc(l.href) + '">' + esc(l.label) + '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h7M6 3l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></a>'; }).join('') + '</div>';
    el.innerHTML = html;
    log.appendChild(el);
    if (!silent) log.scrollTop = log.scrollHeight;
  }
  function setChips(list) {
    chipsEl.innerHTML = '';
    (list || []).slice(0, 5).forEach(function (c) { var b = document.createElement('button'); b.type = 'button'; b.className = 'th-chip'; b.textContent = c; b.addEventListener('click', function () { send(c); }); chipsEl.appendChild(b); });
    chipsEl.hidden = !list || !list.length;
  }
  function render() { log.innerHTML = ''; state.msgs.forEach(function (m) { addMsg(m, true); }); var last = state.msgs[state.msgs.length - 1]; setChips(last && last.who === 'bot' ? last.chips : []); log.scrollTop = log.scrollHeight; }

  function greet() {
    var lg = L();
    var txt = (lg === 'hi' ? 'नमस्ते, मैं Therma हूँ, FireWatch की गाइड। ' : 'Hello, I am Therma, the FireWatch guide. ') + B.pageContext(lg) + (lg === 'hi' ? '\n\nआप अंग्रेज़ी में भी लिख सकते हैं, मैं उसी भाषा में जवाब दूँगी।' : '\n\nYou can also write in Hindi and I will answer in Hindi.');
    push({ who: 'bot', text: txt, chips: B.CHIPS[lg].start, links: [] });
  }
  function push(m) { state.msgs.push(m); addMsg(m); if (m.who === 'bot') setChips(m.chips); save(); }

  var typingEl = null;
  function typing(on) {
    if (on && !typingEl) { typingEl = document.createElement('div'); typingEl.className = 'th-msg bot th-typing'; typingEl.setAttribute('aria-label', UI[L()].typing); typingEl.innerHTML = '<div class="th-b"><i></i><i></i><i></i></div>'; log.appendChild(typingEl); log.scrollTop = log.scrollHeight; }
    if (!on && typingEl) { typingEl.remove(); typingEl = null; }
  }

  /* Dashboard hook: set the chips on the map when asked to show something */
  function applyOnDashboard(scope, focus) {
    if (C.here !== 'dashboard.html' || !scope) return false;
    var chips = document.querySelectorAll('.fchip'); if (!chips.length) return false;
    var wantRegion = scope.india ? 'india' : 'world';
    chips.forEach(function (c) {
      var g = c.getAttribute('data-region'), k = c.getAttribute('data-risk'), t = c.getAttribute('data-type');
      if (g) { if (g === wantRegion && c.getAttribute('aria-pressed') !== 'true') c.click(); return; }
      var on = k ? (!scope.risks.length || scope.risks.indexOf(k) >= 0) : (!scope.types.length || scope.types.indexOf(t) >= 0);
      if ((c.getAttribute('aria-pressed') === 'true') !== on) c.click();
    });
    var mapEl = $('#map-leaflet'); if (mapEl) mapEl.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    if (focus && focus.m && focus.m._map) { setTimeout(function () { focus.m._map.flyTo([focus.lat, focus.lon], 6, { duration: reduced() ? 0 : 1.2 }); setTimeout(function () { focus.m.openPopup(); }, reduced() ? 50 : 1300); }, 300); }
    return true;
  }

  function send(text) {
    text = String(text || '').trim(); if (!text) return;
    if (state.auto) { var d = C.detectLang(text); if (d !== state.lang) { state.lang = d; applyLang(); } }
    push({ who: 'me', text: text }); input.value = ''; autosize(); setChips([]);
    var mapAsk = /on (the |a )?map|map (par|pe|me|mein)|नक्शे (पर|में)|naksh(a|e)|नक्शा|मानचित्र/.test(text.toLowerCase());
    typing(true);
    var delay = reduced() ? 60 : Math.min(900, 250 + text.length * 12);
    setTimeout(function () {
      var st = { scope: state.scope, pending: state.pending, offset: state.offset, lastFeature: state.lastFeature || null };
      var r;
      try { r = B.respond(text, L(), st); } catch (e) { r = { text: L() === 'hi' ? 'कुछ गड़बड़ हुई। दोबारा पूछें।' : 'Something went wrong on my side. Ask again.', chips: B.CHIPS[L()].start, links: [] }; }
      state.pending = st.pending || null; if (r.scope) state.scope = r.scope; if (r.offset) state.offset = r.offset; if (r.pending) state.pending = r.pending; if (r.lastFeature) state.lastFeature = r.lastFeature;
      if (r.setLang) { state.lang = r.setLang; state.auto = false; applyLang(); }
      typing(false);
      if (mapAsk && state.scope) {
        if (applyOnDashboard(state.scope, r.focus)) {
          r.text = (L() === 'hi' ? 'नक्शे पर फ़िल्टर लगा दिए। ' : 'Filters applied on the map. ') + r.text;
          setTimeout(function () { if (state.open) { setOpen(false); if (C.API.toast) C.API.toast(L() === 'hi' ? 'Therma ने नक्शा फ़िल्टर कर दिया। सूची के लिए Therma फिर खोलें।' : 'Therma filtered the map. Reopen Therma for the list.'); } }, 1400);
        }
        else { r.links = [{ label: L() === 'hi' ? 'डैशबोर्ड नक्शे पर देखें' : 'See it on the dashboard map', href: 'dashboard.html?therma=map' }].concat(r.links || []); }
      }
      push({ who: 'bot', text: r.text, chips: r.chips, links: r.links });
      if (r.openAlerts && window.FW_ALERTS) setTimeout(function () { setOpen(false); window.FW_ALERTS.open(); }, 600);
      if (r.openSos && window.FW_SOS && window.FW_API) { var sRow = window.FW_API.rows.filter(function (x) { return x.id === r.openSos; })[0]; if (sRow) setTimeout(function () { setOpen(false); window.FW_SOS.open(sRow); }, 700); }
      if (r.openEvidence && window.FW_EVIDENCE && window.FW_API) { var evRow = window.FW_API.rows.filter(function (x) { return x.id === r.openEvidence; })[0]; if (evRow) setTimeout(function () { setOpen(false); window.FW_EVIDENCE.open(evRow); }, 700); }
      if (!state.open) { state.unread++; badge.textContent = state.unread; badge.hidden = false; }
    }, delay);
  }

  /* ------------------------------------------------------------------ */
  /* Open, close, events                                                 */
  /* ------------------------------------------------------------------ */
  function setOpen(o) {
    state.open = o; launch.classList.remove('nudge'); panel.hidden = !o; launch.setAttribute('aria-expanded', o ? 'true' : 'false'); root.classList.toggle('open', o);
    if (o) { state.unread = 0; badge.hidden = true; log.scrollTop = log.scrollHeight; setTimeout(function () { input.focus({ preventScroll: true }); }, 60); }
    save();
  }
  launch.addEventListener('click', function () { setOpen(!state.open); });
  /* A click or tap on the page behind the panel closes it, so it never blocks the data underneath */
  document.addEventListener('pointerdown', function (e) { if (state.open && !root.contains(e.target)) setOpen(false); });
  $('.th-x', root).addEventListener('click', function () { setOpen(false); launch.focus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open && panel.contains(document.activeElement)) { setOpen(false); launch.focus(); } });
  Array.prototype.forEach.call(root.querySelectorAll('.th-lang'), function (b) { b.addEventListener('click', function () { state.lang = b.getAttribute('data-lang'); state.auto = false; applyLang(); save(); push({ who: 'bot', text: (L() === 'hi' ? 'ठीक है, हिंदी में। ' : 'Okay, English it is. ') + B.pageContext(L()), chips: B.CHIPS[L()].start, links: [] }); }); });
  $('.th-clear', root).addEventListener('click', function () { state.msgs = []; state.scope = null; state.pending = null; state.offset = 0; log.innerHTML = ''; save(); greet(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; }
  input.addEventListener('input', autosize);
  /* Links inside the log: same-page anchors scroll without a reload, and close on phones */
  log.addEventListener('click', function (e) {
    var a = e.target.closest('a'); if (!a) return;
    var href = a.getAttribute('href') || '', page = href.split('#')[0], hash = href.split('#')[1];
    if ((page === '' || page === C.here) && hash) { var t = document.getElementById(hash); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); if (innerWidth < 720) setOpen(false); } }
  });

  applyLang();
  /* A short nudge label on arrival, once per session, until the chat is opened */
  try { if (!sessionStorage.getItem(STORE + '.nudged')) { setTimeout(function () { if (!state.open) launch.classList.add('nudge'); }, 1800); setTimeout(function () { launch.classList.remove('nudge'); }, 9000); sessionStorage.setItem(STORE + '.nudged', '1'); } } catch (e) { }
  if (state.msgs.length) {
    render();
    /* Arrived on a different page with history: add one line of context for the new page */
    var lastPage = null; try { lastPage = sessionStorage.getItem(STORE + '.page'); } catch (e) { }
    if (lastPage && lastPage !== C.here) push({ who: 'bot', text: B.pageContext(L()), chips: B.CHIPS[L()].start, links: [] });
  } else greet();
  try { sessionStorage.setItem(STORE + '.page', C.here); } catch (e) { }
  if (state.open) setOpen(true);
  /* Arrived from another page with a map request */
  if (/therma=map/.test(location.search) && state.scope) { setTimeout(function () { applyOnDashboard(state.scope); }, 900); }
  /* Keep the launcher clear of the toast while it shows */
  var toastEl = $('.toast'); if (toastEl && 'MutationObserver' in window) new MutationObserver(function () { root.classList.toggle('lift', toastEl.classList.contains('on')); }).observe(toastEl, { attributes: true, attributeFilter: ['class'] });
})();
