/* Therma part 2: understanding and answering. */
(function () {
  'use strict';
  var C = window.THERMA_CORE; if (!C) return;
  var ROWS = C.ROWS, KB = C.KB, SITE = C.SITE, n2 = C.n2, pl = C.pl, riskName = C.riskName, typeName = C.typeName, regionName = C.regionName, dateS = C.dateS, esc = C.esc;

  /* ------------------------------------------------------------------ */
  /* Text normalisation and fuzzy matching                               */
  /* ------------------------------------------------------------------ */
  var DEV_DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
  function norm(t) {
    return String(t).toLowerCase().replace(/[०-९]/g, function (d) { return DEV_DIGITS[d]; }).replace(/[?!.,;:()"'`]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    var v0 = [], v1 = [], i, j; for (j = 0; j <= b.length; j++) v0[j] = j;
    for (i = 0; i < a.length; i++) { v1[0] = i + 1; for (j = 0; j < b.length; j++) { v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + (a[i] === b[j] ? 0 : 1)); } v0 = v1.slice(); }
    return v0[b.length];
  }
  /* Does phrase p occur in text t? Exact for short words, one typo allowed for words of 6+ letters. */
  var reCache = {};
  function has(t, p) {
    if (/^[a-z0-9 _'-]+$/.test(p)) {
      var re = reCache[p] || (reCache[p] = new RegExp('(^|[^a-z0-9])' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])'));
      if (re.test(t)) return true;
    } else if (t.indexOf(p) >= 0) return true;
    if (p.indexOf(' ') >= 0 || p.length < 6 || /[ऀ-ॿ]/.test(p)) return false;
    var toks = t.split(' ');
    for (var i = 0; i < toks.length; i++) { if (Math.abs(toks[i].length - p.length) <= 1 && lev(toks[i], p) <= 1) return true; }
    return false;
  }
  function any(t, list) { for (var i = 0; i < list.length; i++) if (has(t, list[i])) return list[i]; return null; }

  /* ------------------------------------------------------------------ */
  /* Vocabulary                                                          */
  /* ------------------------------------------------------------------ */
  var V = {
    risk: { Critical: ['critical', 'crit', 'severe', 'gambhir', 'गंभीर', 'क्रिटिकल', 'khatarnak', 'खतरनाक', 'urgent', 'emergency'], High: ['high risk', 'high', 'uchch', 'उच्च', 'हाई', 'ऊँचा'], Medium: ['medium', 'moderate', 'madhyam', 'मध्यम', 'मीडियम'], Low: ['low risk', 'low', 'nimn', 'निम्न', 'लो', 'kam khatra', 'कम जोखिम'] },
    type: { 'Industrial Fire': ['industrial', 'industry', 'industries', 'factory', 'factories', 'plant', 'furnace', 'refinery', 'udyog', 'audyogik', 'औद्योगिक', 'फैक्ट्री', 'फ़ैक्ट्री', 'कारखाना', 'कारखाने', 'उद्योग', 'karkhana'], 'Agricultural Burning': ['agricultural', 'agriculture', 'agri', 'farm', 'crop', 'stubble', 'paddy', 'parali', 'पराली', 'खेत', 'कृषि', 'किसान', 'kheti', 'खेती', 'residue'], 'Other/Natural': ['natural', 'nature', 'forest', 'wildfire', 'jungle', 'prakritik', 'प्राकृतिक', 'जंगल', 'वन', 'other'] },
    source: { VIIRS: ['viirs', 'suomi', 'noaa'], MODIS: ['modis', 'terra', 'aqua'], 'Sentinel-2': ['sentinel'], 'OSM cross-check': ['osm cross', 'cross-check', 'cross check'] },
    count: ['how many', 'how much', 'number of', 'count', 'total', 'kitne', 'kitni', 'kitna', 'कितने', 'कितनी', 'कितना', 'sankhya', 'संख्या', 'गिनती', 'ginti'],
    list: ['list', 'show me', 'show', 'display', 'which ones', 'which sites', 'name them', 'dikhao', 'dikhaiye', 'दिखाओ', 'दिखाइए', 'batao', 'bataiye', 'बताओ', 'बताइए', 'suchi', 'सूची', 'give me'],
    top: ['top', 'highest', 'most', 'biggest', 'largest', 'worst', 'strongest', 'maximum', 'max', 'sabse', 'सबसे', 'zyada', 'jyada', 'ज़्यादा', 'ज्यादा', 'adhik', 'अधिक', 'rank', 'first', 'pehla', 'पहला'],
    least: ['least', 'lowest', 'smallest', 'fewest', 'minimum', 'sabse kam', 'सबसे कम'],
    near: ['nearest', 'near', 'nearby', 'closest', 'close to', 'distance', 'how far', 'km from', 'paas', 'पास', 'nazdeek', 'नज़दीक', 'नजदीक', 'doori', 'दूरी', 'kitni door', 'कितनी दूर', 'around'],
    recur: ['recur', 'recurring', 'recurrence', 'repeat', 'repeated', 'persistent', 'persistence', 'again', 'days seen', 'how many days', 'kitne din', 'कितने दिन', 'baar', 'बार', 'dobara', 'दोबारा', 'lagatar', 'लगातार', 'punaravritti', 'पुनरावृत्ति'],
    conf: ['confidence', 'confident', 'how sure', 'certainty', 'bharosa', 'भरोसा', 'विश्वास', 'कॉन्फिडेंस', 'nishchit', 'निश्चित', 'sure'],
    trend: ['trend', 'trends', 'over time', 'per day', 'by day', 'daily', 'each day', 'timeline', 'pattern', 'busiest', 'rujhan', 'रुझान', 'din ke hisab', 'दिन के हिसाब', 'roz', 'रोज़', 'रोज', 'increase', 'decrease', 'growth', 'history', 'when'],
    byregion: ['by region', 'by state', 'per state', 'per region', 'region wise', 'state wise', 'which region', 'which state', 'which country', 'where are most', 'kaun sa rajya', 'कौन सा राज्य', 'kis rajya', 'किस राज्य', 'kahan sabse', 'कहाँ सबसे', 'kaunsa area', 'kaunse area', 'kis kshetra', 'किस क्षेत्र', 'distribution', 'breakdown', 'spread'],
    bytype: ['by type', 'by cause', 'per type', 'type wise', 'classification', 'classify', 'classified', 'categories', 'category', 'kinds', 'types of', 'prakar', 'प्रकार', 'vargikaran', 'वर्गीकरण', 'shreni', 'श्रेणी', 'kis tarah', 'किस तरह'],
    byrisk: ['by risk', 'risk wise', 'per risk', 'risk breakdown', 'risk levels', 'risk tiers', 'tiers', 'jokhim star', 'जोखिम स्तर', 'risk distribution'],
    rules: ['how does it decide', 'how do you decide', 'how it decides', 'decide', 'decision', 'rule', 'rules', 'threshold', 'thresholds', 'logic', 'criteria', 'algorithm', 'how does it work', 'how it works', 'kaise kaam', 'कैसे काम', 'kaise tay', 'कैसे तय', 'niyam', 'नियम', 'kaise pata', 'कैसे पता', 'kaise decide', 'faisla', 'फैसला', 'निर्णय'],
    handling: ['what to do', 'what should', 'action', 'handle', 'handling', 'respond', 'response', 'next step', 'kya karna', 'क्या करना', 'kya kare', 'क्या करें', 'kadam', 'कदम', 'karyavahi', 'कार्रवाई', 'inspection', 'verification', 'verify', 'satyapan', 'सत्यापन'],
    what: ['what is firewatch', 'what is this', 'kya hai', 'kya h', 'what is the site', 'about firewatch', 'about this', 'kya hai firewatch', 'firewatch kya', 'yeh kya hai', 'ye kya hai', 'यह क्या है', 'ये क्या है', 'क्या है', 'overview', 'introduce', 'explain firewatch', 'purpose', 'uddeshya', 'उद्देश्य', 'tell me about firewatch', 'tell me about this'],
    self: ['who are you', 'what are you', 'your name', 'therma', 'tum kaun', 'तुम कौन', 'aap kaun', 'आप कौन', 'tumhara naam', 'तुम्हारा नाम', 'apka naam', 'आपका नाम', 'are you a bot', 'are you human', 'chatbot'],
    help: ['help', 'what can you do', 'what can i ask', 'options', 'menu', 'madad', 'मदद', 'sahayata', 'सहायता', 'kya kar sakte', 'क्या कर सकते', 'kya puch', 'क्या पूछ', 'guide me', 'start'],
    nav: ['where is', 'where can i', 'where do i', 'find', 'go to', 'take me', 'open', 'navigate', 'section', 'page', 'explore', 'kahan hai', 'कहाँ है', 'कहां है', 'kahan milega', 'कहाँ मिलेगा', 'kaise jaun', 'कैसे जाऊँ', 'le chalo', 'ले चलो', 'kholo', 'खोलो', 'dhundho', 'ढूंढो', 'show me the page', 'sections', 'what is on this site', 'site tour', 'tour'],
    sources: ['data source', 'data sources', 'source of data', 'where does the data', 'where is the data from', 'which satellite', 'satellites', 'nasa', 'firms', 'sensor', 'sensors', 'openstreetmap', 'data kahan se', 'डेटा कहाँ से', 'srot', 'स्रोत', 'upgrah', 'उपग्रह', 'kaun sa satellite', 'कौन सा उपग्रह'],
    pipeline: ['pipeline', 'architecture', 'stages', 'stack', 'technology', 'tech', 'built with', 'streamlit', 'folium', 'plotly', 'backend', 'system', 'design', 'kaise bana', 'कैसे बना', 'takneek', 'तकनीक', 'sanrachna', 'संरचना'],
    contract: ['csv contract', 'contract', 'handover', 'integration', 'integrate', 'file format', 'input format', 'required columns', 'which columns', 'schema', 'plug in', 'anubandh', 'अनुबंध', 'jodna', 'जोड़ना'],
    export: ['export', 'download', 'csv file', 'save the list', 'nikalo', 'निकालो', 'download karo', 'डाउनलोड'],
    limits: ['limit', 'limits', 'limitation', 'limitations', 'accuracy', 'accurate', 'reliable', 'false positive', 'false alarm', 'wrong', 'mistake', 'sample data', 'is it real', 'real data', 'live data', 'fake', 'synthetic', 'seema', 'सीमा', 'kami', 'कमी', 'sahi hai', 'सही है', 'galat', 'ग़लत', 'गलत', 'asli', 'असली', 'sateek', 'सटीक', 'bharosemand', 'भरोसेमंद'],
    punjab: ['punjab visit', 'punjab figure', '40,557', '40557', '17,832', '17832', 'alert fatigue', 'no fire', 'wasted visit', 'wasted', 'tribune', 'thakan', 'थकान', 'khali', 'खाली'],
    frp: ['frp', 'radiative power', 'brightness', 'bright_ti4', 'bright_ti5', 'temperature', 'kelvin', 'how hot', 'taapman', 'तापमान', 'garmi', 'गर्मी', 'kitna garam', 'कितना गरम'],
    confmap: ['low nominal high', 'nominal', 'l n h', 'letters', '35 65 90', 'confidence scale', 'confidence mapping', 'normalise', 'normalize', 'normalised', 'normalized'],
    offline: ['offline', 'internet', 'without net', 'no internet', 'bina internet', 'बिना इंटरनेट', 'ऑफ़लाइन', 'ऑफलाइन', 'connectivity'],
    speed: ['how fast', 'how quick', 'latency', 'real time', 'realtime', 'real-time', 'delay', 'kitni jaldi', 'कितनी जल्दी', 'kitna time', 'कितना समय', 'turnaround'],
    coverage: ['whole world', 'only india', 'global', 'worldwide', 'coverage', 'outside india', 'other countries', 'poori duniya', 'पूरी दुनिया', 'sirf bharat', 'सिर्फ़ भारत', 'सिर्फ भारत', 'videsh', 'विदेश'],
    whyrules: ['why rules', 'why not ml', 'machine learning', 'ai model', 'trained model', 'neural', 'deep learning', 'not a model', 'why not a model', 'black box', 'ml kyun', 'model kyun', 'मॉडल क्यों', 'explainable', 'explainability'],
    team: ['team', 'who made', 'who built', 'who developed', 'developers', 'authors', 'kisne banaya', 'किसने बनाया', 'टीम', 'banane wale', 'बनाने वाले', 'hackathon', 'sih'],
    satellite: ['satellite view', 'satellite map', 'imagery', 'aerial', 'satellite image', 'upgrah drishya', 'उपग्रह दृश्य', 'satellite mode', 'basemap', 'base map', 'toggle map'],
    queue: ['queue', 'escalation', 'escalate', 'escalated', 'worklist', 'work list', 'katar', 'कतार', 'priority list', 'to visit', 'visit list', 'field team', 'send a team', 'team bhejna', 'टीम भेजना'],
    compare: ['compare', 'comparison', 'raw vs', 'raw feed', 'before and after', 'before after', 'difference between', 'what changes', 'what does firewatch add', 'tulna', 'तुलना', 'farak', 'फ़र्क', 'फर्क', 'antar', 'अंतर', 'kya badla', 'क्या बदला'],
    justfirms: ['just nasa firms', 'just firms', 'only firms', 'firms on a map', 'sirf firms', 'different from firms', 'difference from firms', 'firms se alag', 'firms से अलग', 'why not firms', 'firms already'],
    livefeed: ['live feed arrives', 'when the live feed', 'feed arrives', 'live data arrives', 'real feed', 'asli feed', 'असली फ़ीड', 'when live', 'plug the feed', 'connect the feed', 'switch to live'],
    who: ['who is this for', 'who is it for', 'built for', 'who uses', 'who will use', 'target user', 'end user', 'kiske liye', 'किसके लिए', 'kaun use', 'कौन इस्तेमाल', 'customers', 'stakeholders'],
    evidence: ['evidence', 'imagery', 'satellite image', 'satellite images', 'satellite photo', 'satellite picture', 'satellite view of', 'proof', 'saboot', 'सबूत', 'photo', 'picture', 'tasveer', 'तस्वीर', 'from space', 'actual image', 'real image', 'see the fire', 'aag dikhao', 'आग दिखाओ', 'worldview', 'sentinel image', 'image of'],
    report: ['report', 'reports', 'print', 'printable', 'print friendly', 'pdf', 'export report', 'save as', 'download report', 'word file', 'excel file', 'docx', 'presentation', 'briefing document', 'situation report', 'sitrep', 'summary document', 'file for', 'rapport', 'riport', 'रिपोर्ट', 'प्रिंट', 'chhapo', 'छापो', 'print karo'],
    alerts: ['alert', 'alerts', 'alert centre', 'alert center', 'notification', 'notifications', 'bell', 'what is new', 'whats new', 'anything new', 'latest alert', 'unread', 'chetavani', 'चेतावनी', 'alert dikhao', 'naya kya', 'नया क्या', 'soochna', 'सूचना'],
    regionpage: ['analyse', 'analyze', 'analysis', 'and around', 'area around', 'vishleshan', 'विश्लेषण', 'analyse region', 'analyze region', 'analyse the region', 'region analysis', 'area analysis', 'neighbourhood', 'neighborhood', 'around it', 'surrounding', 'bordering', 'nearby areas', 'aas paas', 'आस पास', 'आसपास', 'padosi', 'पड़ोसी', 'kshetra vishleshan', 'क्षेत्र विश्लेषण', 'inside and around', 'in and around'],
    priority: ['top priority', 'priority', 'priorities', 'most urgent', 'urgent', 'which first', 'what first', 'attend first', 'first to visit', 'sustained', 'continuously', 'keeps returning', 'repeatedly', 'again and again', 'baar baar', 'बार बार', 'sabse pehle', 'सबसे पहले', 'pehle kahan', 'पहले कहाँ', 'prathmikta', 'प्राथमिकता', 'lagatar critical', 'लगातार क्रिटिकल', 'priority trend'],
    navigate: ['navigate', 'navigation', 'route to', 'route', 'directions', 'how do i get', 'how to reach', 'eta', 'how long to reach', 'drive to', 'take me there', 'raasta', 'रास्ता', 'kaise pahunche', 'कैसे पहुँचें', 'कैसे पहुंचे', 'pahunchne mein', 'पहुँचने में', 'kitna time lagega', 'कितना समय लगेगा', 'way to', 'go to the incident', 'get there'],
    sos: ['sos', 'emergency', 'send help', 'alert the fire', 'call fire', 'fire brigade', 'fire service', 'ambulance', 'hospital', 'police', 'resource request', 'dispatch', 'raise an alarm', 'madad bhejo', 'मदद भेजो', 'aapatkal', 'आपातकाल', 'emergency bhejo', 'fire brigade bulao', 'बुलाओ', 'sos bhejo'],
    history: ['threat history', 'history of', '7 day history', 'seven day history', 'past 7 days', 'last 7 days', 'past week', 'last week', 'trend for', 'trend of', 'increasing', 'decreasing', 'getting worse', 'getting better', 'escalating', 'easing', 'badh raha', 'बढ़ रहा', 'ghat raha', 'घट रहा', 'itihas', 'इतिहास', 'pichle 7 din', 'पिछले 7 दिन', 'pichle hafte', 'पिछले हफ़्ते', 'track'],
    dna: ['thermal dna', 'dna', 'abnormal', 'anomaly', 'anomalies', 'is this normal', 'normal for', 'normal here', 'unusual', 'usual for', 'baseline', 'thermal pattern', 'heat pattern', 'signature', 'asamanya', 'असामान्य', 'samanya hai', 'सामान्य है', 'normal hai', 'temperature history', 'climate here', 'burning season', 'fire season', 'in season', 'off season', 'mausam', 'मौसम', 'pattern'],
    faq: ['faq', 'faqs', 'frequently asked', 'common questions', 'aam sawal', 'आम सवाल', 'सामान्य प्रश्न'],
    greet: ['hello', 'hi', 'hey', 'hii', 'hiii', 'namaste', 'namaskar', 'नमस्ते', 'नमस्कार', 'good morning', 'good evening', 'good afternoon', 'salaam', 'hola', 'suprabhat', 'सुप्रभात'],
    thanks: ['thank', 'thanks', 'thx', 'dhanyavad', 'dhanyawad', 'धन्यवाद', 'shukriya', 'शुक्रिया', 'great', 'awesome', 'nice', 'perfect', 'badhiya', 'बढ़िया', 'accha', 'अच्छा', 'shandar', 'शानदार'],
    bye: ['bye', 'goodbye', 'see you', 'alvida', 'अलविदा', 'phir milenge', 'फिर मिलेंगे', 'chalta hun', 'ok bye'],
    yes: ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'haan', 'han', 'ha', 'हाँ', 'हां', 'ji', 'जी', 'theek', 'ठीक', 'bilkul', 'बिल्कुल', 'please', 'go ahead'],
    no: ['no', 'nope', 'nah', 'nahi', 'nahin', 'नहीं', 'na', 'ना', 'mat', 'मत', 'cancel', 'never mind', 'nevermind'],
    langEn: ['english', 'in english', 'angrezi', 'अंग्रेज़ी', 'अंग्रेजी', 'switch to english', 'english mein', 'english me'],
    langHi: ['hindi', 'in hindi', 'हिंदी', 'हिन्दी', 'hindi mein', 'hindi me', 'switch to hindi', 'hindi bolo', 'हिंदी में'],
    world: ['world', 'global', 'worldwide', 'everywhere', 'all regions', 'duniya', 'दुनिया', 'vishwa', 'विश्व', 'poore', 'पूरे', 'international', 'abroad', 'outside india'],
    india: ['india', 'indian', 'bharat', 'भारत', 'हिंदुस्तान', 'hindustan', 'desh', 'देश', 'भारतीय'],
    hotspot: ['hotspot', 'hotspots', 'hot spot', 'detection', 'detections', 'fire', 'fires', 'site', 'sites', 'record', 'records', 'point', 'points', 'alert', 'alerts', 'anomaly', 'anomalies', 'aag', 'आग', 'hot', 'jagah', 'जगह', 'sthal', 'स्थल', 'ghatna', 'घटना', 'entries', 'cases', 'incidents', 'location', 'locations']
  };

  /* Regions present in the data, with Hindi aliases */
  var REGIONS = (function () {
    var seen = {}, out = [];
    ROWS.forEach(function (x) {
      if (seen[x.region]) return; seen[x.region] = 1;
      var parts = x.region.split(',').map(function (p) { return p.trim().toLowerCase(); });
      var aliases = parts.slice();
      parts.forEach(function (p) { if (C.REGION_HI[p]) aliases.push(C.REGION_HI[p]); });
      var extra = { 'delhi ncr': ['delhi', 'ncr', 'दिल्ली', 'new delhi', 'gurgaon', 'noida'], 'tamil nadu': ['tamilnadu', 'chennai'], 'maharashtra': ['mumbai', 'pune', 'मुंबई'], 'karnataka': ['bengaluru', 'bangalore', 'बैंगलोर'], 'telangana': ['hyderabad', 'हैदराबाद'], 'west bengal': ['bengal', 'kolkata', 'कोलकाता', 'बंगाल'], 'gujarat': ['ahmedabad', 'surat', 'अहमदाबाद'], 'uttar pradesh': ['up', 'lucknow', 'kanpur', 'यूपी'], 'madhya pradesh': ['mp', 'bhopal', 'indore'], 'andhra pradesh': ['andhra', 'vizag', 'visakhapatnam'], 'california': ['la', 'los angeles', 'san francisco'], 'texas': ['houston'], 'são paulo': ['sao paulo'], 'north rhine-westphalia': ['germany', 'nrw', 'ruhr'], 'khyber pakhtunkhwa': ['pakistan', 'peshawar'], 'rajshahi': ['bangladesh'] };
      parts.forEach(function (p) { if (extra[p]) aliases = aliases.concat(extra[p]); });
      out.push({ name: x.region, aliases: aliases, country: parts[parts.length - 1] });
    });
    return out;
  })();
  function findRegions(t) {
    var hits = [];
    REGIONS.forEach(function (r) {
      for (var i = 0; i < r.aliases.length; i++) {
        var a = r.aliases[i];
        if (a.length <= 2) { if (new RegExp('(^| )' + a + '( |$)').test(t)) { hits.push({ r: r, a: a }); break; } }
        else if (has(t, a)) { hits.push({ r: r, a: a }); break; }
      }
    });
    /* A country alias like "india" or "usa" matches many regions; collapse to the country */
    return hits;
  }

  /* ------------------------------------------------------------------ */
  /* Understanding                                                       */
  /* ------------------------------------------------------------------ */
  function parse(raw) {
    var t = norm(raw), q = { text: t, risks: [], types: [], sources: [], regions: [], country: null, india: false, world: false, id: null, latlon: null, topN: null, flags: {} };
    Object.keys(V.risk).forEach(function (k) { if (any(t, V.risk[k])) q.risks.push(k); });
    Object.keys(V.type).forEach(function (k) { if (any(t, V.type[k])) q.types.push(k); });
    Object.keys(V.source).forEach(function (k) { if (any(t, V.source[k])) q.sources.push(k); });
    ['count', 'list', 'top', 'least', 'near', 'recur', 'conf', 'trend', 'byregion', 'bytype', 'byrisk', 'rules', 'handling', 'what', 'self', 'help', 'nav', 'sources', 'pipeline', 'contract', 'export', 'limits', 'punjab', 'frp', 'confmap', 'offline', 'speed', 'coverage', 'whyrules', 'team', 'satellite', 'queue', 'compare', 'greet', 'thanks', 'bye', 'yes', 'no', 'langEn', 'langHi', 'world', 'india', 'hotspot', 'justfirms', 'livefeed', 'who', 'faq', 'evidence', 'dna', 'history', 'sos', 'navigate', 'priority', 'regionpage', 'alerts', 'report'].forEach(function (k) { if (any(t, V[k])) q.flags[k] = true; });
    var idm = t.match(/fw[\s-]?0*(\d{1,4})/); if (idm) q.id = 'FW-' + String(idm[1]).padStart(4, '0');
    var ll = t.match(/(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)/); if (ll && !idm) { var la = parseFloat(ll[1]), lo = parseFloat(ll[2]); if (Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (t.indexOf('.') >= 0 || q.flags.near)) q.latlon = [la, lo]; }
    var tn = t.match(/top\s*(\d{1,2})|(\d{1,2})\s*(?:sabse|सबसे|biggest|highest|worst|hotspots|sites|records)/); if (tn) q.topN = parseInt(tn[1] || tn[2], 10);
    var regs = findRegions(t);
    if (q.flags.india) { q.india = true; }
    regs.forEach(function (h) { if (h.a === h.r.country && (h.r.country === 'india' || h.r.country === 'usa' || h.r.country === 'canada' || h.r.country === 'brazil' || h.r.country === 'russia' || h.r.country === 'nigeria' || h.r.country === 'indonesia' || h.r.country === 'australia')) { q.country = h.r.country; } else { q.regions.push(h.r.name); } });
    if (q.country === 'india') { q.india = true; q.country = null; }
    if (q.flags.world && !q.india) q.world = true;
    /* "high" is also an ordinary word; drop the High risk when the sentence is clearly about confidence or FRP */
    if (q.risks.indexOf('High') >= 0 && /high(est)? (confidence|frp|temperature|brightness)/.test(t)) q.risks.splice(q.risks.indexOf('High'), 1);
    if (q.risks.indexOf('Low') >= 0 && /low(est)? (confidence|frp|temperature|brightness)/.test(t)) q.risks.splice(q.risks.indexOf('Low'), 1);
    q.hasFilter = q.risks.length || q.types.length || q.sources.length || q.regions.length || q.country || q.india || q.world;
    return q;
  }

  /* ------------------------------------------------------------------ */
  /* Data helpers                                                        */
  /* ------------------------------------------------------------------ */
  function filter(q) {
    return ROWS.filter(function (x) {
      if (q.risks.length && q.risks.indexOf(x.risk) < 0) return false;
      if (q.types.length && q.types.indexOf(x.type) < 0) return false;
      if (q.sources.length && !q.sources.some(function (s) { return x.source.indexOf(s) >= 0; })) return false;
      if (q.regions.length && q.regions.indexOf(x.region) < 0) return false;
      if (q.country && x.region.toLowerCase().split(',').pop().trim() !== q.country) return false;
      if (q.india && !x.india) return false;
      return true;
    });
  }
  function scopeLabel(q, L) {
    var bits = [];
    if (q.risks.length) bits.push(q.risks.map(function (r) { return riskName(r, L); }).join(L === 'hi' ? ' या ' : ' or '));
    if (q.types.length) bits.push(q.types.map(function (r) { return typeName(r, L); }).join(L === 'hi' ? ' या ' : ' or '));
    if (q.sources.length) bits.push(q.sources.join(', '));
    if (q.regions.length) bits.push(q.regions.map(function (r) { return regionName(r, L); }).join(', '));
    else if (q.country) bits.push(q.country.toUpperCase() === 'USA' ? 'USA' : q.country.charAt(0).toUpperCase() + q.country.slice(1));
    else if (q.india) bits.push(L === 'hi' ? 'भारत' : 'India');
    return bits.join(L === 'hi' ? ', ' : ', ');
  }
  function rowLine(x, L) {
    if (L === 'hi') return '**' + x.id + '** · ' + regionName(x.region, L) + ' · ' + typeName(x.type, L) + ' · ' + riskName(x.risk, L) + ' · कॉन्फिडेंस ' + x.conf + '% · निकटतम औद्योगिक स्थल ' + x.dist.toFixed(1) + ' किमी · ' + x.days + ' दिन देखा गया';
    return '**' + x.id + '** · ' + x.region + ' · ' + x.type + ' · ' + x.risk + ' · confidence ' + x.conf + '% · ' + x.dist.toFixed(1) + ' km from nearest industrial site · seen on ' + x.days + ' ' + pl(x.days, 'day', 'days');
  }
  function breakdown(rows, key, L) {
    var m = {}; rows.forEach(function (x) { m[x[key]] = (m[x[key]] || 0) + 1; });
    var order = key === 'risk' ? ['Critical', 'High', 'Medium', 'Low'] : Object.keys(m).sort(function (a, b) { return m[b] - m[a]; });
    return order.filter(function (k) { return m[k]; }).map(function (k) { return (key === 'risk' ? riskName(k, L) : key === 'type' ? typeName(k, L) : regionName(k, L)) + ' ' + n2(m[k], L); });
  }
  function byDay(rows) {
    var d = {}; rows.forEach(function (x) { var k = x.date.getFullYear() + '-' + x.date.getMonth() + '-' + x.date.getDate(); if (!d[k]) d[k] = { date: x.date, n: 0, e: 0, c: 0 }; d[k].n++; if (x.risk === 'Critical' || x.risk === 'High') d[k].e++; if (x.risk === 'Critical') d[k].c++; });
    return Object.keys(d).map(function (k) { return d[k]; }).sort(function (a, b) { return a.date - b.date; });
  }

  /* ------------------------------------------------------------------ */
  /* Reply builder                                                       */
  /* ------------------------------------------------------------------ */
  function R(text, chips, links, extra) { var o = { text: text, chips: chips || [], links: links || [] }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
  function link(key, L) { var s = SITE.filter(function (p) { return p.key === key; })[0]; return s ? { label: s[L], href: s.href } : null; }
  function T(L, en, hi) { return L === 'hi' ? hi : en; }

  var CHIPS = {
    en: { start: ['Which hotspots are top priority?', 'How many Critical hotspots?', 'Show hotspots in India', 'How does it decide?', 'Where is the escalation queue?'], after: ['Break it down by region', 'Which region has the most?', 'Only Industrial fires', 'Explain the rules'], nav: ['Take me to the dashboard', 'Open the compare page', 'Show the FAQ'] },
    hi: { start: ['कौन से हॉटस्पॉट शीर्ष प्राथमिकता हैं?', 'कितने क्रिटिकल हॉटस्पॉट हैं?', 'भारत के हॉटस्पॉट दिखाओ', 'यह कैसे तय करता है?', 'एस्केलेशन कतार कहाँ है?'], after: ['क्षेत्र के हिसाब से बताओ', 'किस क्षेत्र में सबसे ज़्यादा?', 'सिर्फ़ औद्योगिक आग', 'नियम समझाओ'], nav: ['डैशबोर्ड पर ले चलो', 'तुलना पेज खोलो', 'FAQ दिखाओ'] }
  };

  function answerSummary(q, L, rows) {
    var sc = scopeLabel(q, L), n = rows.length;
    if (!n) return R(T(L, 'I found no records for ' + sc + ' in the sample feed. Try widening the filter, for example drop the risk tier or the region.', sc + ' के लिए नमूना फ़ीड में कोई रिकॉर्ड नहीं मिला। फ़िल्टर थोड़ा खोलें, जैसे जोखिम स्तर या क्षेत्र हटा दें।'), CHIPS[L].after);
    var crit = rows.filter(function (x) { return x.risk === 'Critical'; }).length, hi = rows.filter(function (x) { return x.risk === 'High'; }).length;
    var top = rows.slice(0, 3).map(function (x) { return rowLine(x, L); }).join('\n');
    var head = T(L,
      '**' + n2(n, L) + '** ' + pl(n, 'record', 'records') + (sc ? ' for ' + sc : ' in the sample feed') + '. ' + n2(crit + hi, L) + ' would enter the escalation queue (' + n2(crit, L) + ' Critical, ' + n2(hi, L) + ' High).',
      (sc ? sc + ' के लिए ' : 'नमूना फ़ीड में ') + '**' + n2(n, L) + '** रिकॉर्ड। ' + n2(crit + hi, L) + ' एस्केलेशन कतार में जाएँगे (' + n2(crit, L) + ' क्रिटिकल, ' + n2(hi, L) + ' हाई)।');
    var more = n > 3 ? T(L, '\n\nTop 3 by severity, then confidence:\n', '\n\nगंभीरता, फिर कॉन्फिडेंस के क्रम में शीर्ष 3:\n') + top : '\n\n' + top;
    var chips = L === 'hi' ? ['पूरी सूची दिखाओ', 'क्षेत्र के हिसाब से', 'प्रकार के हिसाब से', 'नक्शे पर दिखाओ'] : ['Show the full list', 'By region', 'By type', 'Show on the map'];
    return R(head + more, chips, [link('dashboard', L)], { scope: q });
  }
  function answerList(q, L, rows) {
    var sc = scopeLabel(q, L), n = rows.length, N = Math.min(q.topN || 10, n);
    if (!n) return answerSummary(q, L, rows);
    var lines = rows.slice(0, N).map(function (x, i) { return (i + 1) + '. ' + rowLine(x, L); }).join('\n');
    var head = T(L, n2(n, L) + ' ' + pl(n, 'record', 'records') + (sc ? ' for ' + sc : '') + '. Showing ' + N + ', ordered by severity then confidence.', (sc ? sc + ' के लिए ' : '') + n2(n, L) + ' रिकॉर्ड। ' + N + ' दिखा रही हूँ, गंभीरता फिर कॉन्फिडेंस के क्रम में।');
    var chips = n > N ? (L === 'hi' ? ['अगले ' + Math.min(10, n - N) + ' दिखाओ', 'क्षेत्र के हिसाब से', 'नक्शे पर दिखाओ'] : ['Show the next ' + Math.min(10, n - N), 'By region', 'Show on the map']) : CHIPS[L].after;
    return R(head + '\n\n' + lines, chips, [link('queue', L)], { scope: q, offset: N });
  }
  function answerCount(q, L, rows) {
    var sc = scopeLabel(q, L), n = rows.length;
    var brk = breakdown(rows, q.risks.length === 1 ? 'type' : 'risk', L).join(', ');
    var txt = T(L, '**' + n2(n, L) + '** ' + pl(n, 'record', 'records') + (sc ? ' for ' + sc : ' in the sample feed') + (n ? '. Breakdown: ' + brk + '.' : '.'), (sc ? sc + ' के लिए ' : 'नमूना फ़ीड में ') + '**' + n2(n, L) + '** रिकॉर्ड' + (n ? '। विभाजन: ' + brk + '।' : '।'));
    if (n && !q.india && !q.world && !q.regions.length && !q.country) { var ind = rows.filter(function (x) { return x.india; }).length; txt += T(L, ' ' + n2(ind, L) + ' of them are in India.', ' इनमें से ' + n2(ind, L) + ' भारत में हैं।'); }
    return R(txt, L === 'hi' ? ['सूची दिखाओ', 'सिर्फ़ भारत', 'क्षेत्र के हिसाब से'] : ['List them', 'Only India', 'By region'], [], { scope: q });
  }
  function answerTop(q, L, rows) {
    var sc = scopeLabel(q, L); if (!rows.length) return answerSummary(q, L, rows);
    if (!q.flags.conf && !q.flags.recur && !q.flags.near && /confiden|कॉन्फिडेंस|bharosa|भरोसा/.test(q.text)) q.flags.conf = true;
    var N = q.topN || 5, by = q.flags.conf ? 'conf' : q.flags.recur ? 'days' : q.flags.near ? 'dist' : null, asc = !!q.flags.least;
    var sorted = rows.slice();
    if (by === 'dist') sorted.sort(function (a, b) { return asc ? b.dist - a.dist : a.dist - b.dist; }); else if (by) sorted.sort(function (a, b) { return asc ? a[by] - b[by] : b[by] - a[by]; }); else if (asc) sorted.reverse();
    var what = by === 'conf' ? T(L, asc ? 'lowest confidence' : 'highest confidence', asc ? 'सबसे कम कॉन्फिडेंस' : 'सबसे ऊँचा कॉन्फिडेंस') : by === 'days' ? T(L, asc ? 'fewest days seen' : 'most days seen', asc ? 'सबसे कम दिन' : 'सबसे ज़्यादा दिन') : by === 'dist' ? T(L, asc ? 'farthest from a mapped industrial site' : 'closest to a mapped industrial site', asc ? 'औद्योगिक स्थल से सबसे दूर' : 'औद्योगिक स्थल के सबसे पास') : T(L, asc ? 'least severe' : 'most severe', asc ? 'सबसे कम गंभीर' : 'सबसे गंभीर');
    var lines = sorted.slice(0, N).map(function (x, i) { return (i + 1) + '. ' + rowLine(x, L); }).join('\n');
    return R(T(L, 'Top ' + Math.min(N, sorted.length) + ' by ' + what + (sc ? ', ' + sc : '') + ':\n\n', (sc ? sc + ', ' : '') + what + ' के हिसाब से शीर्ष ' + Math.min(N, sorted.length) + ':\n\n') + lines, CHIPS[L].after, [link('queue', L)], { scope: q });
  }
  function answerByRegion(q, L, rows) {
    if (!rows.length) return answerSummary(q, L, rows);
    var m = {}; rows.forEach(function (x) { var k = x.region; if (!m[k]) m[k] = { n: 0, e: 0 }; m[k].n++; if (x.risk === 'Critical' || x.risk === 'High') m[k].e++; });
    var keys = Object.keys(m).sort(function (a, b) { return (m[b].e - m[a].e) || (m[b].n - m[a].n); });
    var N = Math.min(q.topN || 8, keys.length);
    var lines = keys.slice(0, N).map(function (k, i) { return (i + 1) + '. ' + regionName(k, L) + ': ' + n2(m[k].n, L) + T(L, pl(m[k].n, ' record', ' records') + ', ' + n2(m[k].e, L) + ' escalated', ' रिकॉर्ड, ' + n2(m[k].e, L) + ' एस्केलेट'); });
    var sc = scopeLabel(q, L), ind = rows.filter(function (x) { return x.india; }).length;
    var head = T(L, 'By region' + (sc ? ' for ' + sc : '') + ', ordered by escalations. ' + n2(keys.length, L) + ' regions in play, ' + n2(ind, L) + ' of ' + n2(rows.length, L) + ' records in India.', 'क्षेत्र के हिसाब से' + (sc ? ' (' + sc + ')' : '') + ', एस्केलेशन के क्रम में। ' + n2(keys.length, L) + ' क्षेत्र, ' + n2(rows.length, L) + ' में से ' + n2(ind, L) + ' रिकॉर्ड भारत में।');
    return R(head + '\n\n' + lines, L === 'hi' ? ['सिर्फ़ भारत', 'सिर्फ़ क्रिटिकल', 'प्रकार के हिसाब से'] : ['Only India', 'Only Critical', 'By type'], [link('dashboard', L)], { scope: q });
  }
  function answerByType(q, L, rows) {
    if (!rows.length) return answerSummary(q, L, rows);
    var sc = scopeLabel(q, L), types = ['Industrial Fire', 'Agricultural Burning', 'Other/Natural'];
    var lines = types.map(function (t) { var r = rows.filter(function (x) { return x.type === t; }); if (!r.length) return null; var b = breakdown(r, 'risk', L).join(', '); return '**' + typeName(t, L) + '**: ' + n2(r.length, L) + ' (' + b + ')'; }).filter(Boolean).join('\n');
    var head = T(L, 'Classification' + (sc ? ' for ' + sc : '') + ', ' + n2(rows.length, L) + ' records. Cause is decided by the proximity rule: within 3 km of a mapped industrial site is Industrial Fire; otherwise confidence 40 or more is Agricultural Burning, below that Other/Natural.', 'वर्गीकरण' + (sc ? ' (' + sc + ')' : '') + ', ' + n2(rows.length, L) + ' रिकॉर्ड। कारण निकटता नियम से तय होता है: दर्ज औद्योगिक स्थल के 3 किमी के भीतर औद्योगिक आग; वरना कॉन्फिडेंस 40 या अधिक पर कृषि अवशेष, उससे नीचे अन्य/प्राकृतिक।');
    return R(head + '\n\n' + lines, L === 'hi' ? ['जोखिम के हिसाब से', 'नियम समझाओ', 'सिर्फ़ औद्योगिक'] : ['By risk', 'Explain the rules', 'Only Industrial'], [link('pixel', L)], { scope: q });
  }
  function answerByRisk(q, L, rows) {
    if (!rows.length) return answerSummary(q, L, rows);
    var sc = scopeLabel(q, L), lines = ['Critical', 'High', 'Medium', 'Low'].map(function (r) { var s = rows.filter(function (x) { return x.risk === r; }); if (!s.length) return null; return '**' + riskName(r, L) + '**: ' + n2(s.length, L) + ' · ' + breakdown(s, 'type', L).join(', '); }).filter(Boolean).join('\n');
    return R(T(L, 'Risk tiers' + (sc ? ' for ' + sc : '') + ', ' + n2(rows.length, L) + ' records.\n\n', 'जोखिम स्तर' + (sc ? ' (' + sc + ')' : '') + ', ' + n2(rows.length, L) + ' रिकॉर्ड।\n\n') + lines + '\n\n' + KB.handling[L], L === 'hi' ? ['सिर्फ़ क्रिटिकल दिखाओ', 'क्षेत्र के हिसाब से', 'कतार खोलो'] : ['Show only Critical', 'By region', 'Open the queue'], [link('queue', L)], { scope: q });
  }
  function answerTrend(q, L, rows) {
    if (!rows.length) return answerSummary(q, L, rows);
    var d = byDay(rows), sc = scopeLabel(q, L);
    var busiest = d.slice().sort(function (a, b) { return b.n - a.n; })[0], hottest = d.slice().sort(function (a, b) { return b.e - a.e; })[0];
    var lines = d.map(function (o) { return dateS(o.date, L) + ': ' + n2(o.n, L) + T(L, ' received, ' + n2(o.e, L) + ' escalated', ' प्राप्त, ' + n2(o.e, L) + ' एस्केलेट'); }).join('\n');
    var rec = rows.filter(function (x) { return x.days >= 3; }).length;
    var head = T(L,
      'Trend by day' + (sc ? ' for ' + sc : '') + ', ' + dateS(d[0].date, L) + ' to ' + dateS(d[d.length - 1].date, L) + '. Busiest day for the raw feed: ' + dateS(busiest.date, L) + ' (' + n2(busiest.n, L) + '). Most escalations: ' + dateS(hottest.date, L) + ' (' + n2(hottest.e, L) + '). ' + n2(rec, L) + ' of ' + n2(rows.length, L) + ' sites are recurring, seen on 3 or more separate days, which is the persistence signal.',
      'दिन के हिसाब से रुझान' + (sc ? ' (' + sc + ')' : '') + ', ' + dateS(d[0].date, L) + ' से ' + dateS(d[d.length - 1].date, L) + '। कच्चे फ़ीड का सबसे व्यस्त दिन: ' + dateS(busiest.date, L) + ' (' + n2(busiest.n, L) + ')। सबसे ज़्यादा एस्केलेशन: ' + dateS(hottest.date, L) + ' (' + n2(hottest.e, L) + ')। ' + n2(rows.length, L) + ' में से ' + n2(rec, L) + ' स्थल बार-बार लौटे हैं, 3 या अधिक अलग दिनों में, यही निरंतरता संकेत है।');
    var note = T(L, '\n\nThe sample window is one week, so read this as a shape, not a forecast. The compare page draws the same numbers as paired bars.', '\n\nनमूना अवधि एक हफ़्ता है, इसे आकार समझें, पूर्वानुमान नहीं। तुलना पेज यही संख्याएँ जोड़ीदार बार में दिखाता है।');
    return R(head + '\n\n' + lines + note, L === 'hi' ? ['बार-बार लौटने वाले स्थल', 'क्षेत्र के हिसाब से', 'तुलना पेज खोलो'] : ['Recurring sites', 'By region', 'Open the compare page'], [{ label: T(L, 'By-day chart on the compare page', 'तुलना पेज पर दिन-वार चार्ट'), href: 'compare.html#cmp-numbers' }], { scope: q });
  }
  function answerRecur(q, L, rows) {
    var r = rows.filter(function (x) { return x.days >= 3; }).sort(function (a, b) { return b.days - a.days; }), sc = scopeLabel(q, L);
    if (!r.length) return R(T(L, 'No recurring sites' + (sc ? ' for ' + sc : '') + '. Recurring means the same pixel returned on 3 or more separate days.', (sc ? sc + ' में ' : '') + 'कोई बार-बार लौटने वाला स्थल नहीं। बार-बार का मतलब वही पिक्सेल 3 या अधिक अलग दिनों में लौटा।'), CHIPS[L].after);
    var lines = r.slice(0, q.topN || 6).map(function (x, i) { return (i + 1) + '. ' + rowLine(x, L); }).join('\n');
    return R(T(L, n2(r.length, L) + ' recurring ' + pl(r.length, 'site', 'sites') + (sc ? ' for ' + sc : '') + ' out of ' + n2(rows.length, L) + ', seen on 3 or more separate days. Longest-running first:\n\n', n2(rows.length, L) + ' में से ' + n2(r.length, L) + ' स्थल बार-बार लौटे' + (sc ? ' (' + sc + ')' : '') + ', 3 या अधिक अलग दिनों में। सबसे लंबे समय से पहले:\n\n') + lines, L === 'hi' ? ['सिर्फ़ औद्योगिक', 'दिन के हिसाब से रुझान', 'नियम समझाओ'] : ['Only Industrial', 'Trend by day', 'Explain the rules'], [], { scope: q });
  }
  function answerNear(q, L, rows) {
    var pt = q.latlon, label = null;
    if (!pt && q.regions.length) { var rr = rows.length ? rows : ROWS; var inR = rr.filter(function (x) { return x.region === q.regions[0]; }); if (inR.length) { pt = [inR.reduce(function (s, x) { return s + x.lat; }, 0) / inR.length, inR.reduce(function (s, x) { return s + x.lon; }, 0) / inR.length]; label = regionName(q.regions[0], L); } }
    if (!pt) return R(T(L, 'Nearest to which place? Give me a state or city from the feed, or a coordinate like 28.66, 77.45.', 'किस जगह के पास? फ़ीड से कोई राज्य या शहर बताएँ, या 28.66, 77.45 जैसा निर्देशांक।'), L === 'hi' ? ['दिल्ली के पास', 'मुंबई के पास', 'पंजाब के पास'] : ['Near Delhi', 'Near Mumbai', 'Near Punjab'], [], { pending: { slot: 'place', q: q } });
    var pool = ROWS.filter(function (x) { return (!q.risks.length || q.risks.indexOf(x.risk) >= 0) && (!q.types.length || q.types.indexOf(x.type) >= 0); });
    var s = pool.map(function (x) { return { x: x, d: C.API.haversine ? C.API.haversine(pt[0], pt[1], x.lat, x.lon) : 0 }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, q.topN || 5);
    var lines = s.map(function (o, i) { return (i + 1) + '. ' + rowLine(o.x, L) + ' · ' + T(L, Math.round(o.d) + ' km away', Math.round(o.d) + ' किमी दूर'); }).join('\n');
    return R(T(L, 'Closest detections to ' + (label || pt[0].toFixed(2) + ', ' + pt[1].toFixed(2)) + ':\n\n', (label || pt[0].toFixed(2) + ', ' + pt[1].toFixed(2)) + ' के सबसे पास के हॉटस्पॉट:\n\n') + lines + T(L, '\n\nThe distance in each line is to the nearest mapped industrial site, the trailing figure is from your point.', '\n\nहर पंक्ति की दूरी निकटतम औद्योगिक स्थल से है, आख़िरी आँकड़ा आपके बिंदु से।'), CHIPS[L].after, [link('dashboard', L)], { scope: q });
  }
  function answerId(q, L) {
    var x = ROWS.filter(function (r) { return r.id === q.id; })[0];
    if (!x) return R(T(L, 'There is no record ' + q.id + ' in the sample feed. Ids run from FW-0001 to FW-' + String(ROWS.length).padStart(4, '0') + '.', 'नमूना फ़ीड में ' + q.id + ' नाम का कोई रिकॉर्ड नहीं। आईडी FW-0001 से FW-' + String(ROWS.length).padStart(4, '0') + ' तक हैं।'), CHIPS[L].start);
    var vd = C.API.verdict ? C.API.verdict(x.dist, x.days, x.conf) : null, pos = ROWS.indexOf(x) + 1;
    var txt = rowLine(x, L) + '\n' + T(L, 'Coordinates ' + x.lat.toFixed(4) + ', ' + x.lon.toFixed(4) + ' · detected ' + x.dateS + ' · source ' + x.source + ' · queue position ' + pos + ' of ' + ROWS.length + '.', 'निर्देशांक ' + x.lat.toFixed(4) + ', ' + x.lon.toFixed(4) + ' · पता चला ' + x.dateS + ' · स्रोत ' + x.source + ' · कतार में स्थान ' + pos + '/' + ROWS.length + '।');
    if (vd) txt += '\n\n' + T(L, 'Why this verdict: ', 'यह फैसला क्यों: ') + T(L, (x.dist <= 3 ? 'within 3 km of a mapped industrial site' : 'more than 3 km from any mapped industrial site') + ', ' + (x.days >= 3 ? 'returned on ' + x.days + ' separate days' : 'seen on only ' + x.days + ' ' + pl(x.days, 'day', 'days')) + ', confidence ' + x.conf + '%. ', (x.dist <= 3 ? 'दर्ज औद्योगिक स्थल के 3 किमी के भीतर' : 'किसी दर्ज औद्योगिक स्थल से 3 किमी से दूर') + ', ' + (x.days >= 3 ? x.days + ' अलग दिनों में लौटा' : 'सिर्फ़ ' + x.days + ' दिन देखा गया') + ', कॉन्फिडेंस ' + x.conf + '%। ') + vd.handle;
    return R(txt, L === 'hi' ? ['उपग्रह सबूत दिखाओ', 'नक्शे पर दिखाओ', 'इसी क्षेत्र के और'] : ['Show satellite evidence', 'Show on the map', 'More in this region'], [{ label: T(L, 'Compare this record raw and processed', 'इस रिकॉर्ड की कच्ची और प्रोसेस्ड तुलना'), href: 'compare.html#cmp-record' }], { scope: q, focus: x });
  }
  var TIER = {
    Critical: ['Critical means all three signals agree: within 3 km of a mapped industrial site, returned on 3 or more separate days, and confidence 85 or higher. Handling: route to the district industrial-safety authority for ground verification within 24 hours.', 'क्रिटिकल का मतलब तीनों संकेत एक साथ: दर्ज औद्योगिक स्थल के 3 किमी के भीतर, 3 या अधिक अलग दिनों में लौटा, और कॉन्फिडेंस 85 या अधिक। कार्रवाई: 24 घंटे के भीतर ज़मीनी सत्यापन के लिए ज़िला औद्योगिक-सुरक्षा प्राधिकरण को भेजें।'],
    High: ['High means the site is within 3 km of a mapped industrial site and either it has returned on 3 or more days or confidence is 65 or higher, but not both at Critical strength. Handling: goes into the next scheduled inspection round.', 'हाई का मतलब स्थल दर्ज औद्योगिक स्थल के 3 किमी के भीतर है और या तो 3 या अधिक दिनों में लौटा है या कॉन्फिडेंस 65 या अधिक है, पर क्रिटिकल जितनी ताक़त से दोनों नहीं। कार्रवाई: अगले निर्धारित निरीक्षण दौर में।'],
    Medium: ['Medium is either an industrial-adjacent detection that is neither persistent nor confident yet, or agricultural burning with confidence 40 or higher. Handling: watched, kept for context, not escalated.', 'मीडियम या तो उद्योग के पास का ऐसा हॉटस्पॉट है जो अभी न लगातार है न पक्का, या 40 या अधिक कॉन्फिडेंस वाला कृषि अवशेष जलाना। कार्रवाई: निगरानी में, संदर्भ के लिए, एस्केलेट नहीं।'],
    Low: ['Low means no mapped industrial site within 3 km and confidence below 40: other or natural sources. Handling: logged and left alone.', 'लो का मतलब 3 किमी के भीतर कोई दर्ज औद्योगिक स्थल नहीं और कॉन्फिडेंस 40 से कम: अन्य या प्राकृतिक स्रोत। कार्रवाई: दर्ज करके छोड़ दिया जाता है।']
  };
  function answerTier(q, L) {
    var txt = q.risks.map(function (r) { return TIER[r][L === 'hi' ? 1 : 0].replace(/^([^ ]+ [^ ]+)/, '**$1**'); }).join('\n\n');
    var n = filter(q).length;
    txt += T(L, '\n\n' + n2(n, L) + ' such ' + pl(n, 'record', 'records') + ' in the sample feed right now.', '\n\nअभी नमूना फ़ीड में ऐसे ' + n2(n, L) + ' रिकॉर्ड हैं।');
    return R(txt, L === 'hi' ? ['इन्हें सूचीबद्ध करो', 'पूरे नियम', 'कतार खोलो'] : ['List them', 'Full rules', 'Open the queue'], [link('decides', L)], { scope: q });
  }
  function answerNav(q, L) {
    var t = q.text, hits = SITE.filter(function (p) { return p.words.some(function (w) { return has(t, w); }); });
    if (!hits.length && q.flags.compare) hits = SITE.filter(function (p) { return p.key === 'compare'; });
    if (!hits.length && q.flags.queue) hits = SITE.filter(function (p) { return p.key === 'queue'; });
    if (!hits.length) {
      var all = SITE.filter(function (p) { return ['home', 'dashboard', 'compare', 'problem', 'decides', 'architecture', 'faq'].indexOf(p.key) >= 0; });
      return R(T(L, 'Here is the site. Tell me what you are looking for and I will point at the exact section.', 'यह साइट का नक्शा है। बताइए क्या ढूँढ रहे हैं, मैं सटीक अनुभाग बता दूँगी।'), L === 'hi' ? ['नक्शा कहाँ है?', 'नियम कहाँ पढ़ूँ?', 'CSV कहाँ से निकालूँ?', 'टीम कौन है?'] : ['Where is the map?', 'Where do I read the rules?', 'Where do I export a CSV?', 'Who is the team?'], all.map(function (p) { return { label: p[L], href: p.href }; }));
    }
    var same = hits.filter(function (p) { return p.href.split('#')[0] === C.here; });
    var intro = hits.length === 1 ? T(L, 'That is here: ', 'वह यहाँ है: ') : T(L, 'A few places match. Pick one:', 'कुछ जगहें मेल खाती हैं। एक चुनें:');
    var txt = intro + (hits.length === 1 ? '**' + hits[0][L] + '**' : '') + (same.length ? T(L, '\n\nYou are already on this page, so the link scrolls you straight to it.', '\n\nआप इसी पेज पर हैं, लिंक सीधे वहाँ स्क्रॉल कर देगा।') : '');
    return R(txt, CHIPS[L].nav, hits.slice(0, 4).map(function (p) { return { label: p[L], href: p.href }; }));
  }
  function answerHelp(L) {
    return R(T(L, 'Ask me in English or Hindi. I can:\n• explain any page, option or button on this site ("what does the Evidence button do", "how do I make a report")\n• count or list hotspots by risk, cause, region, source or id ("critical in Gujarat", "FW-0009")\n• rank them, read trends and the seven-day history, and say which sites are top priority\n• explain the three rules, the data sources, privacy and limits\n• open things for you: satellite evidence, SOS, navigation, region analysis, the alert centre, the report builder', 'अंग्रेज़ी या हिंदी में पूछें। मैं कर सकती हूँ:\n• जोखिम, कारण, क्षेत्र, स्रोत या आईडी से हॉटस्पॉट गिनना या सूचीबद्ध करना ("गुजरात में क्रिटिकल" या "FW-0009" आज़माएँ)\n• क्रम लगाना: सबसे ऊँचा कॉन्फिडेंस, सबसे ज़्यादा दिन, कारखाने के सबसे पास\n• दिन के हिसाब से रुझान और बार-बार लौटने वाले स्थल\n• तीन नियम, हर स्तर की कार्रवाई, डेटा स्रोत और पाइपलाइन समझाना\n• किसी भी पेज या अनुभाग तक ले जाना'), CHIPS[L].start);
  }
  function answerGreet(L, ctx) {
    return R(T(L, 'Hello. ' + ctx, 'नमस्ते। ' + ctx), CHIPS[L].start);
  }

  /* Page-aware context line used in greetings */
  function pageContext(L) {
    var n = ROWS.length, act = ROWS.filter(function (x) { return x.risk === 'Critical' || x.risk === 'High'; }).length, crit = ROWS.filter(function (x) { return x.risk === 'Critical'; }).length;
    var k = C.PAGE_KEY[C.here] || 'home';
    var m = {
      home: [n + ' sample detections are loaded, ' + act + ' of them would go to a field team. Ask me about any hotspot, region or risk tier, or where to find something on this site.', n + ' नमूना हॉटस्पॉट लोड हैं, इनमें से ' + act + ' फ़ील्ड टीम के पास जाएँगे। किसी हॉटस्पॉट, क्षेत्र या जोखिम स्तर के बारे में पूछें, या इस साइट पर कुछ ढूँढना हो तो बताएँ।'],
      dashboard: ['You are on the dashboard: ' + n + ' detections on the map, ' + crit + ' Critical, ' + act + ' in the escalation queue. Ask for a region or a risk tier and I can set the filters for you.', 'आप डैशबोर्ड पर हैं: नक्शे पर ' + n + ' हॉटस्पॉट, ' + crit + ' क्रिटिकल, ' + act + ' एस्केलेशन कतार में। कोई क्षेत्र या जोखिम स्तर बताएँ, मैं फ़िल्टर लगा दूँगी।'],
      compare: ['You are on the compare page: the raw NASA FIRMS feed against the screened result. Ask what FireWatch adds to a record, or how many visits the screening saves.', 'आप तुलना पेज पर हैं: कच्चा NASA FIRMS फ़ीड बनाम स्क्रीन किया नतीजा। पूछें कि FireWatch एक रिकॉर्ड में क्या जोड़ता है, या स्क्रीनिंग कितने दौरे बचाती है।'],
      problem: ['You are on the problem page. Ask me about alert fatigue, the Punjab figures, or why a field and a furnace look alike from orbit.', 'आप समस्या पेज पर हैं। अलर्ट थकान, पंजाब के आंकड़े, या खेत और भट्टी कक्षा से एक जैसे क्यों दिखते हैं, पूछें।'],
      decides: ['You are on How it decides. Press and hold the point to screen a record, or ask me to explain the three rules and the thresholds.', 'आप How it decides पर हैं। रिकॉर्ड स्क्रीन करने के लिए बिंदु दबाकर रखें, या मुझसे तीन नियम और थ्रेशोल्ड समझने को कहें।'],
      architecture: ['You are on the architecture page. Ask about the three stages, the CSV contract, or what the app needs to run offline.', 'आप आर्किटेक्चर पेज पर हैं। तीन चरण, CSV अनुबंध, या ऐप को ऑफ़लाइन चलाने की ज़रूरतें पूछें।'],
      faq: ['You are on the FAQ. Ask me anything the page does not cover, or ask for a hotspot count.', 'आप FAQ पर हैं। जो पेज पर न हो वह पूछें, या किसी हॉटस्पॉट की गिनती माँगें।']
    };
    return T(L, m[k][0], m[k][1]);
  }

  /* ------------------------------------------------------------------ */
  /* Dispatcher with clarification                                       */
  /* ------------------------------------------------------------------ */
  function respond(raw, L, state) {
    var q = parse(raw), f = q.flags;
    state = state || {};
    /* Continue a pending clarification */
    if (state.pending && !(q.text.split(' ').length <= 5 || f.yes || f.no) ) state.pending = null;
    if (state.pending) {
      var p = state.pending; state.pending = null;
      if (p.slot === 'scope') {
        if (f.no) return R(T(L, 'No problem. Ask me anything else.', 'कोई बात नहीं। कुछ और पूछें।'), CHIPS[L].start);
        var merged = mergeScope(p.q, q); if (p.metric) merged.flags[p.metric] = true; if (q.id) merged.id = q.id; return dispatch(merged, L, state);
      }
      if (p.slot === 'place') { if (q.regions.length || q.latlon) { var m2 = mergeScope(p.q, q); m2.flags.near = true; return dispatch(m2, L, state); } }
      if (p.slot === 'dimension') { var m3 = p.q; if (any(q.text, V.byregion) || /region|kshetra|क्षेत्र|state|rajya|राज्य/.test(q.text)) m3.flags.byregion = true; else if (any(q.text, V.bytype) || /type|cause|prakar|प्रकार|kaaran|कारण/.test(q.text)) m3.flags.bytype = true; else if (any(q.text, V.byrisk) || /risk|jokhim|जोखिम/.test(q.text)) m3.flags.byrisk = true; else if (any(q.text, V.trend) || /day|din|दिन|time|samay|समय/.test(q.text)) m3.flags.trend = true; else if (any(q.text, V.recur)) m3.flags.recur = true; else return dispatch(q, L, state); delete m3.flags.ambiguous; return dispatch(m3, L, state); }
      if (p.slot === 'feature') { var chosen = null; p.ids.forEach(function (id) { var ff = byId(id); if (ff && (has(q.text, norm(ff.en.t)) || has(q.text, norm(ff.hi.t)) || featureScore(q.text, toks(q.text)).filter(function (e) { return e.f.id === id; }).length)) chosen = chosen || ff; }); if (chosen) return featureAnswer(chosen, L, 'what'); }
      if (p.slot === 'confirm') { if (f.yes) { return dispatch(p.q, L, state); } if (f.no) return R(T(L, 'Okay. Tell me in other words and I will try again.', 'ठीक है। दूसरे शब्दों में बताएँ, मैं फिर कोशिश करूँगी।'), CHIPS[L].start); }
      if (p.slot === 'more' && (f.yes || /next|more|aur|और|agla|अगला/.test(q.text))) { var mq = p.q; mq.topN = (p.offset || 10) + 10; mq.flags.list = true; return answerList(mq, L, filter(mq)); }
    }
    /* Follow-ups on the last feature I described */
    if (state.lastFeature && state.lastFeature !== 'overview' && !q.id && !q.hasFilter) {
      var lf = byId(state.lastFeature);
      if (lf && /^(how do i use (it|this|that)|how (do i|to) use (it|this)|how does (it|this) work|kaise istemal( karu| karun)?|kaise use karu|इसे कैसे इस्तेमाल करूँ|यह कैसे काम करता है)\??$/.test(q.text)) return featureAnswer(lf, L, 'how');
      if (lf && /^(where|kahan|कहाँ|कहां)/.test(q.text) && q.text.split(' ').length <= 4) return featureAnswer(lf, L, 'where');
      if (lf && /^(what are its limits|its limits|limits\?*$|limitations|इसकी सीमाएँ|seema)/.test(q.text)) { var lim = byId('limits'); return R('**' + (L === 'hi' ? lf.hi.t : lf.en.t) + '**\n' + (L === 'hi' ? lim.hi.what : lim.en.what), CHIPS[L].start, [], { lastFeature: lf.id }); }
      if (lf && /^(open it|open|take me there|go there|le chalo|kholo|खोलो|ले चलो)$/.test(q.text)) return R(T(L, 'Here it is.', 'यह रहा।'), CHIPS[L].nav, [{ label: L === 'hi' ? lf.hi.t : lf.en.t, href: lf.href }], { lastFeature: lf.id });
      if (lf && /^(tell me more|more|aur batao|और बताओ|details|detail)$/.test(q.text)) return featureAnswer(lf, L, 'what');
    }
    /* Follow-ups that refine the last scope: "only India", "by region", "show the full list" */
    if (state.scope && !q.id && (f.byregion || f.bytype || f.byrisk || f.trend || f.recur || f.list || f.count || f.top || ((q.hasFilter) && !f.rules && !f.nav && !f.what && q.text.split(' ').length <= 5))) {
      var words = q.text.split(' ').length;
      var isRefine = /^(only|just|sirf|सिर्फ़|सिर्फ|and |aur |और |now |ab |अब |bas |बस )/.test(q.text) || (!f.hotspot && !f.top && !f.least && !q.topN && words <= 3 && (f.byregion || f.bytype || f.byrisk || f.trend || f.list)) || /full list|poori list|पूरी सूची|next \d+|अगले/.test(q.text);
      if (isRefine) { var nq = mergeScope(state.scope, q); if (/full list|poori list|पूरी सूची/.test(q.text)) { nq.flags.list = true; nq.topN = 20; } if (/next (\d+)|अगले (\d+)/.test(q.text)) { var mm = q.text.match(/(\d+)/); nq.flags.list = true; nq.topN = (state.offset || 10) + (mm ? parseInt(mm[1], 10) : 10); } return dispatch(nq, L, state); }
    }
    return dispatch(q, L, state);
  }
  function mergeScope(base, q) {
    var m = JSON.parse(JSON.stringify(base)); m.text = q.text; m.flags = q.flags; m.topN = q.topN || m.topN; m.latlon = q.latlon || m.latlon; m.id = q.id || null;
    if (q.risks.length) m.risks = q.risks; if (q.types.length) m.types = q.types; if (q.sources.length) m.sources = q.sources;
    if (q.regions.length) { m.regions = q.regions; m.india = false; m.country = null; m.world = false; }
    if (q.india) { m.india = true; m.regions = []; m.country = null; m.world = false; }
    if (q.world) { m.world = true; m.india = false; m.regions = []; m.country = null; }
    if (q.country) { m.country = q.country; m.regions = []; m.india = false; }
    if (/^(all|sab|सब|everything|reset|clear|साफ़)/.test(q.text)) { m.risks = []; m.types = []; m.sources = []; m.regions = []; m.india = false; m.country = null; m.world = false; }
    m.hasFilter = m.risks.length || m.types.length || m.sources.length || m.regions.length || m.country || m.india || m.world;
    return m;
  }
  /* ------------------------------------------------------------------ */
  /* Feature catalogue retrieval                                         */
  /* ------------------------------------------------------------------ */
  var FEATURES = window.THERMA_FEATURES || [];
  var STOP = { the: 1, a: 1, an: 1, is: 1, are: 1, of: 1, to: 1, in: 1, on: 1, for: 1, and: 1, or: 1, it: 1, this: 1, that: 1, what: 1, whats: 1, how: 1, do: 1, does: 1, i: 1, me: 1, my: 1, can: 1, you: 1, tell: 1, about: 1, explain: 1, please: 1, show: 1, with: 1, there: 1, where: 1, which: 1, use: 1, using: 1, option: 1, button: 1, feature: 1, page: 1, tool: 1, thing: 1, mean: 1, means: 1, work: 1, works: 1, hai: 1, kya: 1, ka: 1, 'क्या': 1, 'है': 1, 'हैं': 1, 'का': 1, 'की': 1, 'के': 1, 'में': 1, 'से': 1, 'को': 1, 'कैसे': 1, 'कहाँ': 1, 'कहां': 1, 'बताओ': 1, 'यह': 1, 'ये': 1, 'और': 1, 'पर': 1, 'हो': 1, 'होता': 1, 'करता': 1, 'मुझे': 1, 'कोई': 1, 'कौन': 1, 'सा': 1, 'वाला': 1, 'क्यों': 1, ki: 1, ke: 1, mein: 1, se: 1, ko: 1, kaise: 1, kahan: 1, batao: 1, karta: 1, karte: 1, hota: 1, wala: 1, ye: 1, yeh: 1, kaun: 1, sa: 1, be: 1, site: 1, website: 1, firewatch: 1 };
  function stem(w) { return w.length > 4 ? w.replace(/(ings?|ers?|ed|es|s)$/, '') : w; }
  function toks(t) { return norm(t).split(' ').filter(function (w) { return w && !STOP[w] && (w.length > 1 || /[\u0900-\u097F]/.test(w)); }).map(stem); }
  var FIDX = FEATURES.map(function (f) {
    var words = {}; var addW = function (w, wgt) { w = stem(w); if (!w || STOP[w]) return; words[w] = Math.max(words[w] || 0, wgt); };
    f.keys.forEach(function (k) { norm(k).split(' ').forEach(function (w) { addW(w, 1); }); });
    norm(f.en.t).split(' ').forEach(function (w) { addW(w, 1.6); }); norm(f.hi.t).split(' ').forEach(function (w) { addW(w, 1.6); });
    norm(f.en.what).split(' ').forEach(function (w) { if (w.length > 4) addW(w, 0.25); });
    return { f: f, words: words, phrases: f.keys.map(function (k) { return norm(k); }) };
  });
  function featureScore(text, tk) {
    var out = [];
    FIDX.forEach(function (e) {
      var sc = 0;
      e.phrases.forEach(function (p) { if (p.indexOf(' ') > 0 && has(text, p)) sc += 3 + p.length / 12; else if (p.indexOf(' ') < 0 && has(text, p)) sc += p.length > 4 ? 1.5 : 1; });
      tk.forEach(function (w) { if (e.words[w]) sc += e.words[w]; else if (w.length >= 6) { for (var k in e.words) { if (Math.abs(k.length - w.length) <= 1 && lev(k, w) <= 1) { sc += e.words[k] * 0.7; break; } } } });
      if (sc > 0) out.push({ f: e.f, sc: sc });
    });
    return out.sort(function (a, b) { return b.sc - a.sc; });
  }
  var FQ = /what (is|are|does|do)|what'?s|how (do|does|to|can|is|are)|where (is|are|do|can)|explain|tell me about|describe|purpose of|use of|meaning of|option|button|feature|toggle|switch|mode|page|section|tool|panel|kya (hai|hota|karta|karte)|क्या (है|होता|करता)|kaise (kaam|use|chalta|istemal)|कैसे (काम|इस्तेमाल|चलता)|kahan (hai|milega)|कहाँ (है|मिलेगा)|samjhao|समझाओ|batao|बताओ|matlab|मतलब|kis liye|किस लिए/;
  function featureAnswer(f, L, mode) {
    var d = L === 'hi' ? f.hi : f.en, txt;
    if (mode === 'how') txt = '**' + d.t + '**\n' + T(L, 'How to use it: ', 'कैसे इस्तेमाल करें: ') + d.how + '\n' + T(L, 'Where: ', 'कहाँ: ') + d.where;
    else if (mode === 'where') txt = '**' + d.t + '**\n' + T(L, 'Where: ', 'कहाँ: ') + d.where + '\n' + T(L, 'How: ', 'कैसे: ') + d.how;
    else txt = '**' + d.t + '**\n' + d.what + '\n\n' + T(L, 'How: ', 'कैसे: ') + d.how + '\n' + T(L, 'Where: ', 'कहाँ: ') + d.where;
    var same = f.href.split('#')[0] === C.here;
    var chips = L === 'hi' ? ['इसे कैसे इस्तेमाल करूँ?', 'इसकी सीमाएँ?', 'और क्या है साइट पर?'] : ['How do I use it?', 'What are its limits?', 'What else is on the site?'];
    return R(txt, chips, [{ label: T(L, same ? 'Go to it on this page' : 'Open ' + f.en.t, same ? 'इसी पेज पर जाएँ' : d.t + ' खोलें'), href: f.href }], { lastFeature: f.id });
  }
  function featureAmbiguous(list, L) {
    var chips = list.slice(0, 4).map(function (e) { return (L === 'hi' ? e.f.hi.t : e.f.en.t); });
    return R(T(L, 'A few things match. Which one do you mean?', 'कई चीज़ें मेल खाती हैं। कौन सी?'), chips, list.slice(0, 4).map(function (e) { return { label: L === 'hi' ? e.f.hi.t : e.f.en.t, href: e.f.href }; }), { pending: { slot: 'feature', ids: list.slice(0, 4).map(function (e) { return e.f.id; }) } });
  }
  function byId(id) { return FEATURES.filter(function (f) { return f.id === id; })[0]; }

  function dispatch(q, L, state) {
    var f = q.flags, ctx = pageContext(L);
    if (f.langHi && !f.hotspot) return R('ठीक है, अब से हिंदी में। ' + pageContext('hi'), CHIPS.hi.start, [], { setLang: 'hi' });
    if (f.langEn && !f.hotspot) return R('Switching to English. ' + pageContext('en'), CHIPS.en.start, [], { setLang: 'en' });
    /* Questions about the site itself come first, before any action intent, when the sentence is shaped like a question about a thing */
    var tk0 = toks(q.text), fs0 = featureScore(q.text, tk0), b0 = fs0[0], s0 = fs0[1];
    var actionish = /^(open|send|draft|raise|start|launch|take me|navigate|route|go to|analy[sz]e|kholo|खोलो|bhejo|भेजो|le chalo|ले चलो)\b|\b(for|of|to) fw-?\d|sos for|evidence for|report for|dna (of|for)|history (of|for)/.test(q.text);
    var dataish0 = (f.count || f.list || f.top || f.least || f.near || f.trend || f.recur || f.byregion || f.bytype || f.byrisk) && (q.hasFilter || f.hotspot);
    if (b0 && !q.id && !actionish && !dataish0 && FQ.test(q.text)) {
      if (b0.sc >= 2.5 && (!s0 || b0.sc - s0.sc >= 0.8)) {
        var mode0 = /\bhow (do|to|can)\b|\bkaise\b|कैसे|\buse it\b|istemal/.test(q.text) ? 'how' : /\bwhere\b|\bkahan\b|कहाँ|कहां|\bfind\b|milega/.test(q.text) ? 'where' : 'what';
        if (b0.f.id !== 'overview') return featureAnswer(b0.f, L, mode0);
      }
      if (b0.sc >= 2 && s0 && b0.sc - s0.sc < 0.8 && b0.f.id !== 'overview') return featureAmbiguous(fs0, L);
    }
    if (b0 && b0.f.id === 'overview' && b0.sc >= 2.5 || /what can (this|the|your) (site|website|app|project) do|what does (this|the) (site|website) do|what (is|are) (on|in) (this|the) (site|website)|all (the )?(features|options|pages)|site tour|क्या क्या है|kya kya hai/.test(q.text)) { var ov = byId('overview'); if (ov) return R((L === 'hi' ? ov.hi.what : ov.en.what) + '\n\n' + T(L, 'Ask me about any of them by name, or say "open the Regions page".', 'किसी का नाम लेकर पूछें, या कहें "Regions पेज खोलो"।'), L === 'hi' ? ['डैशबोर्ड क्या है?', 'Thermal DNA क्या करता है?', 'SOS कैसे काम करता है?', 'रिपोर्ट कैसे बनाऊँ?'] : ['What is the dashboard?', 'What does Thermal DNA do?', 'How does SOS work?', 'How do I make a report?'], FEATURES.filter(function (x) { return ['dash-map', 'regions', 'compare', 'dna', 'respond', 'report', 'evidence', 'sos', 'alerts'].indexOf(x.id) >= 0; }).map(function (x) { return { label: L === 'hi' ? x.hi.t : x.en.t, href: x.href }; }), { lastFeature: 'overview' }); }
    if (f.report) {
      var rpHref = q.id ? 'report.html?scope=record&id=' + q.id : q.regions.length ? 'report.html?scope=region&q=' + encodeURIComponent(q.regions[0].split(',')[0]) : q.india ? 'report.html?scope=india' : (/queue|escalat|priority|katar|कतार/.test(q.text) ? 'report.html?scope=queue' : 'report.html');
      return R(T(L, 'The Report page builds a print-friendly situation report: summary, map, priority list, regions, classification, by-day table, the alert log with timestamps, the SOS log, records, method and a sign-off block. Print it or save it as PDF, HTML, Word, Excel, CSV, JSON, Markdown or plain text.' + (q.id || q.regions.length || q.india ? ' Opening it with your scope preselected.' : ''), 'Report पेज प्रिंट-योग्य स्थिति रिपोर्ट बनाता है: सारांश, नक्शा, प्राथमिकता सूची, क्षेत्र, वर्गीकरण, दिन-वार तालिका, टाइमस्टैम्प के साथ अलर्ट लॉग, SOS लॉग, रिकॉर्ड, विधि और हस्ताक्षर ब्लॉक। इसे प्रिंट करें या PDF, HTML, Word, Excel, CSV, JSON, Markdown या सादा पाठ में सहेजें।'), CHIPS[L].nav, [{ label: T(L, 'Open the report builder', 'रिपोर्ट बिल्डर खोलें'), href: rpHref }], { scope: q.hasFilter ? q : state.scope });
    }
    if (f.alerts && !q.id) {
      var al = window.FW_ALERTS ? window.FW_ALERTS.list() : {}, arr = Object.keys(al).map(function (k) { return al[k]; }).filter(function (a) { return !a.closed; }), un = arr.filter(function (a) { return !a.ack; }).length;
      var latest = arr.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).slice(0, 3).map(function (a) { var d = new Date(a.detectedAt); return '• ' + a.title + ' · detected ' + d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC'; }).join('\n');
      return R(T(L, n2(arr.length, L) + ' alerts in the centre, ' + n2(un, L) + ' unread. Each carries the satellite detection time, when it was raised here and when it last changed. Newest:\n' + latest + '\n\nOpening the bell.', 'केंद्र में ' + n2(arr.length, L) + ' अलर्ट, ' + n2(un, L) + ' अपठित। हर एक में उपग्रह पहचान समय, यहाँ उठाए जाने का समय और आख़िरी बदलाव का समय है। सबसे नए:\n' + latest + '\n\nघंटी खोल रही हूँ।'), CHIPS[L].after, [], { openAlerts: true });
    }
    if (f.regionpage) {
      var rgName = q.regions.length ? q.regions[0] : (q.india ? 'India' : (q.country ? q.country : null));
      if (rgName) return R(T(L, 'Opening the Regions page for **' + rgName + '**: its real boundary, every incident inside it, the incidents pressing on it from the neighbourhood band, and the live VIIRS passes of the last 7 days for both.', '**' + regionName(rgName, L) + '** के लिए Regions पेज खोल रही हूँ: उसकी असली सीमा, उसके अंदर की हर घटना, पड़ोस की पट्टी से दबाव डालती घटनाएँ, और दोनों के लिए पिछले 7 दिनों के लाइव VIIRS पास।'), CHIPS[L].after, [{ label: T(L, 'Analyse ' + rgName, regionName(rgName, L) + ' का विश्लेषण'), href: 'regions.html?q=' + encodeURIComponent(rgName) }], { scope: q.hasFilter ? q : state.scope });
      return R(T(L, 'Which area? Name a state, district or city, for example "analyse Punjab" or "Bengaluru and around".', 'कौन सा क्षेत्र? कोई राज्य, ज़िला या शहर बताएँ, जैसे "पंजाब का विश्लेषण" या "बेंगलुरु और आसपास"।'), L === 'hi' ? ['पंजाब का विश्लेषण', 'महाराष्ट्र और आसपास', 'दिल्ली क्षेत्र'] : ['Analyse Punjab', 'Maharashtra and around', 'Delhi region'], [link('regions', L)]);
    }
    if (f.priority && !q.id) {
      var pr = (q.hasFilter ? filter(q) : ROWS).filter(function (r) { return r.pri && (r.risk === 'Critical' || r.risk === 'High'); }).sort(function (a, b) { return (b.pri.top - a.pri.top) || (b.pri.score - a.pri.score); });
      if (pr.length) {
        var tops = pr.filter(function (r) { return r.pri.top; }), N = Math.min(q.topN || 5, pr.length);
        var lines = pr.slice(0, N).map(function (x, i) { return (i + 1) + '. **' + x.id + '** · ' + (L === 'hi' ? regionName(x.region, L) : x.region) + ' · ' + riskName(x.risk, L) + ' · ' + T(L, 'priority ' + x.pri.score + '/100, ' + x.pri.trend + ', ' + x.pri.streak + ' consecutive days in zone, seen ' + x.days + ' days', 'प्राथमिकता ' + x.pri.score + '/100, ' + x.pri.streak + ' लगातार दिन ज़ोन में, ' + x.days + ' दिन देखा') + (x.pri.top ? T(L, ' · TOP PRIORITY', ' · शीर्ष प्राथमिकता') : ''); }).join('\n');
        return R(T(L, n2(tops.length, L) + ' top-priority ' + pl(tops.length, 'site', 'sites') + (scopeLabel(q, L) ? ' for ' + scopeLabel(q, L) : '') + ': sites that have been Critical on 3 or more observed days and returned on 5 or more distinct days, or confirmed by live passes on 3 of the last 7 days. Ordered by priority:\n\n', (scopeLabel(q, L) ? scopeLabel(q, L) + ' के लिए ' : '') + n2(tops.length, L) + ' शीर्ष-प्राथमिकता स्थल: जो 3 या अधिक देखे गए दिनों में क्रिटिकल रहे और 5 या अधिक अलग दिनों में लौटे, या पिछले 7 में से 3 दिनों के लाइव पास से पुष्ट। प्राथमिकता के क्रम में:\n\n') + lines, L === 'hi' ? ['कतार खोलो', 'सिर्फ़ भारत', 'FW-0009 का SOS'] : ['Open the queue', 'Only India', 'SOS for the top one'], [link('queue', L)], { scope: q.hasFilter ? q : null });
      }
    }
    if (f.navigate && (q.id || q.regions.length || /incident|hotspot|site|there|wahan|वहाँ|वहां/.test(q.text))) {
      var nRows = q.id ? ROWS.filter(function (r) { return r.id === q.id; }) : (q.hasFilter ? filter(q).filter(function (r) { return r.risk === 'Critical' || r.risk === 'High'; }) : (state.scope ? filter(state.scope).filter(function (r) { return r.risk === 'Critical' || r.risk === 'High'; }) : []));
      if (nRows.length) { var nx = nRows[0]; return R(T(L, 'Opening Respond for **' + nx.id + '**, ' + nx.region + '. Share your location there and it draws the road route, the distance left and an arrival time adjusted for the hour\'s traffic and the weather, then follows you and re-routes. One tap hands off to Google Maps, Apple Maps or Waze with live traffic.', '**' + nx.id + '**, ' + regionName(nx.region, L) + ' के लिए Respond खोल रही हूँ। वहाँ अपनी लोकेशन साझा करें, यह सड़क मार्ग, बची दूरी और ट्रैफ़िक व मौसम के हिसाब से पहुँचने का समय दिखाता है, फिर आपके साथ चलता है और रास्ता बदलने पर नया मार्ग देता है। एक टैप से Google Maps, Apple Maps या Waze पर लाइव ट्रैफ़िक के साथ भेजता है।'), CHIPS[L].after, [{ label: T(L, 'Open Respond for ' + nx.id, nx.id + ' के लिए Respond खोलें'), href: 'respond.html?id=' + nx.id }], { scope: q.hasFilter ? q : state.scope }); }
      return R(T(L, 'Which incident do you want to drive to? Give me a Critical or High record id, like FW-0009, or a region.', 'किस घटना तक जाना है? FW-0009 जैसी क्रिटिकल या हाई आईडी, या कोई क्षेत्र बताएँ।'), L === 'hi' ? ['FW-0009 तक रास्ता', 'सबसे गंभीर तक रास्ता'] : ['Route to FW-0009', 'Route to the top Critical'], [link('respond', L)]);
    }
    if (f.sos) {
      var sRows = q.id ? ROWS.filter(function (r) { return r.id === q.id; }) : (q.hasFilter ? filter(q).filter(function (r) { return r.risk === 'Critical' || r.risk === 'High'; }) : (state.scope ? filter(state.scope).filter(function (r) { return r.risk === 'Critical' || r.risk === 'High'; }) : []));
      if (sRows.length) { var sx = sRows[0]; return R(T(L, 'Opening the emergency SOS for **' + sx.id + '**, ' + sx.region + ' (' + sx.risk + '). It drafts a structured resource request from the record, the live VIIRS feed and OpenStreetMap, finds the nearest fire stations, hospitals and police with phone numbers, and sends by email, WhatsApp, SMS, webhook or print once you confirm as the operator.', '**' + sx.id + '**, ' + regionName(sx.region, L) + ' (' + riskName(sx.risk, L) + ') के लिए आपातकालीन SOS खोल रही हूँ। यह रिकॉर्ड, लाइव VIIRS फ़ीड और OpenStreetMap से संरचित संसाधन अनुरोध बनाता है, निकटतम दमकल, अस्पताल और पुलिस फ़ोन नंबर सहित ढूँढता है, और ऑपरेटर की पुष्टि के बाद ईमेल, WhatsApp, SMS, वेबहुक या प्रिंट से भेजता है।'), CHIPS[L].after, [], { scope: q.hasFilter ? q : state.scope, openSos: sx.id }); }
      return R(T(L, 'Which incident? Give me a Critical or High record id, like FW-0009, or a region. SOS drafts are meant for those two tiers; the dashboard queue has an SOS button on every row.', 'कौन सी घटना? FW-0009 जैसी क्रिटिकल या हाई आईडी, या कोई क्षेत्र बताएँ। SOS इन्हीं दो स्तरों के लिए है; डैशबोर्ड कतार की हर पंक्ति पर SOS बटन है।'), L === 'hi' ? ['FW-0009 के लिए SOS', 'सबसे गंभीर के लिए SOS', 'कतार खोलो'] : ['SOS for FW-0009', 'SOS for the top Critical', 'Open the queue'], [link('queue', L)]);
    }
    if (f.history && (q.id || q.regions.length || /this|isko|इसका|iska|site|spot|point|hotspot/.test(q.text))) {
      var hRows = q.id ? ROWS.filter(function (r) { return r.id === q.id; }) : (q.hasFilter ? filter(q) : (state.scope ? filter(state.scope) : []));
      if (hRows.length) { var hx = hRows[0]; return R(T(L, 'The seven-day threat history for **' + hx.id + '**, ' + hx.region + ' lives on the Thermal DNA page: every satellite pass scored with the three rules, day by day, with a direction badge that says increasing, decreasing or stable. Opening it.', '**' + hx.id + '**, ' + regionName(hx.region, L) + ' का सात-दिन का ख़तरा इतिहास थर्मल DNA पेज पर है: हर उपग्रह पास तीन नियमों से दिन-ब-दिन स्कोर, और बढ़ता, घटता या स्थिर बताने वाला बैज। खोल रही हूँ।'), CHIPS[L].after, [{ label: T(L, 'Open the 7-day threat history', '7-दिन का ख़तरा इतिहास खोलें'), href: 'thermal-dna.html?id=' + hx.id + '#dna-history' }], { scope: q.hasFilter ? q : state.scope }); }
    }
    if (f.dna) {
      var dnaRows = q.id ? ROWS.filter(function (r) { return r.id === q.id; }) : (q.hasFilter ? filter(q) : (state.scope && /this|isko|इसका|iska|us|उस/.test(q.text) ? filter(state.scope) : []));
      if (dnaRows.length) { var dx = dnaRows[0]; return R(T(L, 'Thermal DNA reads whether the heat at **' + dx.id + '**, ' + dx.region + ' is abnormal for that place: ten-year temperature baseline, live fire pixels around it, and the local burning season. Opening the reading.', 'थर्मल DNA बताता है कि **' + dx.id + '**, ' + regionName(dx.region, L) + ' की गर्मी उस जगह के लिए असामान्य है या नहीं: दस साल का तापमान बेसलाइन, आसपास के लाइव फ़ायर पिक्सेल, और स्थानीय जलाने का मौसम। रीडिंग खोल रही हूँ।'), CHIPS[L].after, [{ label: T(L, 'Open the Thermal DNA reading', 'थर्मल DNA रीडिंग खोलें'), href: 'thermal-dna.html?id=' + dx.id }], { scope: q.hasFilter ? q : state.scope }); }
      return R(KB.dna[L], L === 'hi' ? ['FW-0009 का थर्मल DNA', 'दिल्ली का थर्मल DNA', 'नियम समझाओ'] : ['Thermal DNA of FW-0009', 'Thermal DNA of Delhi', 'Explain the rules'], [link('dna', L)]);
    }
    if (f.evidence) {
      var evRows = q.id ? ROWS.filter(function (r) { return r.id === q.id; }) : (q.hasFilter ? filter(q) : (state.scope ? filter(state.scope) : []));
      if (evRows.length) { var ex = evRows[0]; return R(T(L, 'Opening the satellite evidence viewer for **' + ex.id + '**, ' + ex.region + ': dated NASA imagery for ' + ex.dateS + ', live VIIRS fire pixels, and a before-and-after slider. Close it to come back here.', '**' + ex.id + '**, ' + regionName(ex.region, L) + ' के लिए उपग्रह सबूत व्यूअर खोल रही हूँ: ' + ex.dateS + ' की NASA इमेजरी, लाइव VIIRS फ़ायर पिक्सेल, और पहले-बाद स्लाइडर। वापस आने के लिए इसे बंद करें।'), L === 'hi' ? ['इसी क्षेत्र के और', 'नियम समझाओ'] : ['More in this region', 'Explain the rules'], [], { scope: q.hasFilter ? q : state.scope, openEvidence: ex.id }); }
      state.pending = { slot: 'scope', q: q, metric: 'evidence' };
      return R(T(L, 'Which hotspot? Give me a record id like FW-0009, or a place, and I will open dated satellite imagery of it with the live fire pixels on top.', 'कौन सा हॉटस्पॉट? FW-0009 जैसी आईडी या कोई जगह बताएँ, मैं उसकी दिनांकित उपग्रह इमेजरी लाइव फ़ायर पिक्सेल के साथ खोल दूँगी।'), L === 'hi' ? ['FW-0009 का सबूत', 'दिल्ली का सबूत', 'सबसे गंभीर वाले का सबूत'] : ['Evidence for FW-0009', 'Evidence for Delhi', 'Evidence for the top Critical'], []);
    }
    if (q.id) return answerId(q, L);
    if (f.self && !f.hotspot) return R(KB.self[L], CHIPS[L].start);
    if (f.help && !q.hasFilter && !f.hotspot) return answerHelp(L);
    if (f.greet && q.text.split(' ').length <= 3) return answerGreet(L, ctx);
    if (f.thanks && q.text.split(' ').length <= 4) return R(T(L, 'Glad it helped. Anything else on the feed or the site?', 'खुशी हुई कि काम आया। फ़ीड या साइट पर और कुछ?'), CHIPS[L].start);
    /* Feature and option questions: the catalogue answers first when the question is about the site itself */
    var tk = toks(q.text), fs = featureScore(q.text, tk), best = fs[0], second = fs[1];
    var featureish = FQ.test(q.text) || /site|website|firewatch/.test(q.text);
    var dataish = (f.count || f.list || f.top || f.least || f.near || f.trend || f.recur || f.byregion || f.bytype || f.byrisk) && q.hasFilter;
    if (best && !q.id && !dataish) {
      var strong = best.sc >= 4 && (!second || best.sc - second.sc >= 1.2);
      var okay = best.sc >= 2.5 && featureish && (!second || best.sc - second.sc >= 0.8);
      if ((strong || okay) && /^(open|go to|take me to|kholo|खोलो|le chalo|ले चलो)\b/.test(q.text) && best.f.id !== 'overview') return R(T(L, 'Here it is: **' + best.f.en.t + '**.', 'यह रहा: **' + best.f.hi.t + '**।'), CHIPS[L].nav, [{ label: L === 'hi' ? best.f.hi.t : best.f.en.t, href: best.f.href }], { lastFeature: best.f.id });
      if (strong || okay) {
        var mode = /\bhow (do|to|can)\b|\bkaise\b|कैसे|\buse it\b|istemal/.test(q.text) ? 'how' : /\bwhere\b|\bkahan\b|कहाँ|कहां|\bfind\b|milega/.test(q.text) ? 'where' : 'what';
        if (best.f.id === 'overview') return R((L === 'hi' ? best.f.hi.what : best.f.en.what) + '\n\n' + T(L, 'Ask me about any of them by name, or say "open the Regions page".', 'किसी का नाम लेकर पूछें, या कहें "Regions पेज खोलो"।'), L === 'hi' ? ['डैशबोर्ड क्या है?', 'Thermal DNA क्या करता है?', 'SOS कैसे काम करता है?', 'रिपोर्ट कैसे बनाऊँ?'] : ['What is the dashboard?', 'What does Thermal DNA do?', 'How does SOS work?', 'How do I make a report?'], FEATURES.filter(function (x) { return ['dash-map', 'regions', 'compare', 'dna', 'respond', 'report', 'evidence', 'sos', 'alerts'].indexOf(x.id) >= 0; }).map(function (x) { return { label: L === 'hi' ? x.hi.t : x.en.t, href: x.href }; }), { lastFeature: 'overview' });
        return featureAnswer(best.f, L, mode);
      }
      if (featureish && best.sc >= 2 && second && best.sc - second.sc < 0.8) return featureAmbiguous(fs, L);
    }
    var navish = f.nav && /page|section|kahan|kaha\b|कहाँ|कहां|where|take me|le chalo|ले चलो|open|kholo|खोलो|go to|find|dhundh|ढूंढ|explore|tour|sections/.test(q.text) && !f.count && !f.list && !f.top;
    if (navish && !(q.hasFilter && f.hotspot)) return answerNav(q, L);
    if (q.risks.length && (/what does .* mean|what is (a |an )?(critical|high|medium|low)|meaning|matlab|मतलब|define|definition|kya hota|क्या होता|kise kehte|किसे कहते/.test(q.text) || (f.handling && !f.count && !f.list))) return answerTier(q, L);
    if (f.bye && q.text.split(' ').length <= 3) return R(T(L, 'Goodbye. Therma stays in the corner if you need a number later.', 'अलविदा। बाद में कोई आँकड़ा चाहिए तो Therma कोने में रहेगी।'), []);
    /* Knowledge questions, before data questions */
    if (f.justfirms) return R(KB.justfirms[L], CHIPS[L].after, [link('compare', L)]);
    if (f.livefeed) return R(KB.livefeed[L], CHIPS[L].after, [link('contract', L)]);
    if (f.who && !q.hasFilter) return R(KB.who[L], CHIPS[L].start, [link('who', L)]);
    if (f.faq && !f.count && !f.list) return R(KB.faqlist[L], L === 'hi' ? ['क्या यह सिर्फ़ नक्शे पर FIRMS है?', 'मॉडल की जगह नियम क्यों?', 'लाइव फ़ीड आने पर क्या होगा?', 'बिना इंटरनेट चलता है?', 'कितनी जल्दी अलर्ट बनता है?', 'पूरी दुनिया या सिर्फ़ भारत?', 'यह किसके लिए बना है?'] : ['Is this just FIRMS on a map?', 'Why rules instead of a model?', 'What happens when the live feed arrives?', 'Does it work offline?', 'How fast is an alert?', 'Whole world or only India?', 'Who is this built for?'], [link('faq', L)]);
    if (f.punjab) return R(KB.punjab[L], L === 'hi' ? ['समस्या पेज खोलो', 'यह कैसे तय करता है?'] : ['Open the problem page', 'How does it decide?'], [link('problem', L)]);
    if (f.confmap || (f.conf && /scale|map|read|convert|letter|l n h|nominal/.test(q.text))) return R(KB.confidence[L], CHIPS[L].after, [link('decides', L)]);
    if (f.whyrules) return R(KB.whyrules[L], L === 'hi' ? ['नियम समझाओ', 'FAQ दिखाओ'] : ['Explain the rules', 'Show the FAQ'], [link('faq', L)]);
    if (f.frp) return R(KB.frp[L], CHIPS[L].after, [link('compare-record', L)]);
    if (f.offline) return R(KB.offline[L], CHIPS[L].after, [link('faq', L)]);
    if (f.speed) return R(KB.speed[L], CHIPS[L].after, [link('faq', L)]);
    if (f.coverage && !f.count && !f.list) return R(KB.coverage[L], L === 'hi' ? ['भारत के हॉटस्पॉट', 'दुनिया के हॉटस्पॉट'] : ['Hotspots in India', 'Hotspots worldwide'], [link('dashboard', L)]);
    if (f.contract) return R(KB.contract[L], CHIPS[L].after, [link('contract', L)]);
    if (f.pipeline && !f.nav) return R(KB.pipeline[L], CHIPS[L].after, [link('architecture', L)]);
    if (f.sources && !f.count && !f.list && !q.sources.length) return R(KB.sources[L], L === 'hi' ? ['VIIRS वाले कितने?', 'MODIS वाले दिखाओ'] : ['How many from VIIRS?', 'Show MODIS records'], [link('architecture', L)]);
    if (f.export) return R(KB.export[L], CHIPS[L].nav, [link('queue', L)]);
    if (f.satellite) return R(KB.satellite[L], CHIPS[L].nav, [link('dashboard', L), link('compare', L)]);
    if (f.team) return R(KB.about[L], CHIPS[L].start, [link('what', L)]);
    if (f.limits && !q.hasFilter) return R(KB.limits[L], CHIPS[L].after, [link('decides', L)]);
    if (f.rules && !f.count && !f.list && !f.top) return R(KB.rules[L] + '\n\n' + KB.handling[L], L === 'hi' ? ['खुद स्क्रीन करके देखो', 'कॉन्फिडेंस पैमाना', 'क्रिटिकल कितने हैं?'] : ['Try it yourself', 'Confidence scale', 'How many Critical?'], [link('decides', L), link('screen', L)]);
    if (f.handling && !f.count && !f.list && !q.hasFilter) return R(KB.handling[L], CHIPS[L].after, [link('queue', L)]);
    if (f.compare && !f.count && !f.list && !q.hasFilter) { var act = ROWS.filter(function (x) { return x.risk === 'Critical' || x.risk === 'High'; }).length; return R(T(L, 'The raw NASA FIRMS feed and the screened feed hold the same ' + ROWS.length + ' records. Raw, every point asks for a decision. Screened, ' + act + ' enter the queue and ' + (ROWS.length - act) + ' are kept for context, which is ' + Math.round((ROWS.length - act) / ROWS.length * 100) + ' percent fewer visits. FireWatch adds cause, distance to the nearest industrial site, days seen, risk tier, handling and queue position; it drops nothing.', 'कच्चे NASA FIRMS फ़ीड और स्क्रीन किए फ़ीड में वही ' + ROWS.length + ' रिकॉर्ड हैं। कच्चे में हर बिंदु फैसला माँगता है। स्क्रीन के बाद ' + act + ' कतार में जाते हैं और ' + (ROWS.length - act) + ' संदर्भ के लिए रहते हैं, यानी ' + Math.round((ROWS.length - act) / ROWS.length * 100) + ' प्रतिशत कम दौरे। FireWatch कारण, निकटतम औद्योगिक स्थल की दूरी, दिन, जोखिम स्तर, कार्रवाई और कतार स्थान जोड़ता है; कुछ हटाता नहीं।'), CHIPS[L].after, [link('compare', L)]); }
    if (f.what && !q.hasFilter) return R(KB.about[L], CHIPS[L].start, [link('what', L), link('dashboard', L)]);
    if (f.queue && !q.hasFilter && !f.count && !f.list) { var qa = ROWS.filter(function (x) { return x.risk === 'Critical' || x.risk === 'High'; }); return R(T(L, 'The escalation queue holds Critical and High findings only, ordered by severity then confidence: ' + qa.length + ' sites right now. Critical ones go for ground verification within 24 hours, High ones into the next inspection round.', 'एस्केलेशन कतार में सिर्फ़ क्रिटिकल और हाई नतीजे हैं, गंभीरता फिर कॉन्फिडेंस के क्रम में: अभी ' + qa.length + ' स्थल। क्रिटिकल 24 घंटे में ज़मीनी सत्यापन के लिए, हाई अगले निरीक्षण दौर में।'), L === 'hi' ? ['कतार की सूची दिखाओ', 'कतार खोलो'] : ['List the queue', 'Open the queue'], [link('queue', L)], { scope: mergeScope(q, parse('critical high')) }); }
    if (f.nav && !f.count && !f.list && !f.top && !(q.hasFilter && f.hotspot)) return answerNav(q, L);

    /* Data questions */
    var rows = filter(q);
    if (f.near) return answerNear(q, L, rows);
    if (f.trend) return answerTrend(q, L, rows);
    if (f.recur && !f.count) return answerRecur(q, L, rows);
    if (f.byregion || ((f.top || f.count) && /where|kahan|kaha\b|कहाँ|कहां|which (state|region|country|place)|kaun ?sa (rajya|kshetra|ilaka|area)|कौन ?सा (राज्य|क्षेत्र|इलाका)/.test(q.text))) return answerByRegion(q, L, rows);
    if (f.bytype) return answerByType(q, L, rows);
    if (f.byrisk) return answerByRisk(q, L, rows);
    if (f.top || f.least) return answerTop(q, L, rows);
    if (f.count) return answerCount(q, L, rows);
    if (f.list) return answerList(q, L, rows);
    if (q.hasFilter) return answerSummary(q, L, rows);
    /* Ambiguous single-word asks: cross-check before guessing */
    if (f.conf && !q.hasFilter) return answerTop(q, L, ROWS.slice());
    if (f.hotspot && !q.hasFilter) { state.pending = { slot: 'scope', q: q, metric: 'count' }; return R(T(L, 'Happy to. Which slice do you want: everything, only India, or a risk tier?', 'ज़रूर। कौन सा हिस्सा: सब कुछ, सिर्फ़ भारत, या कोई जोखिम स्तर?'), L === 'hi' ? ['सब कुछ', 'सिर्फ़ भारत', 'सिर्फ़ क्रिटिकल', 'सिर्फ़ औद्योगिक'] : ['Everything', 'Only India', 'Only Critical', 'Only Industrial'], []); }
    if (/risk|jokhim|जोखिम|khatra|खतरा/.test(q.text)) { state.pending = { slot: 'dimension', q: q }; return R(T(L, 'Do you want the risk breakdown of the feed, or how a risk tier is decided?', 'फ़ीड का जोखिम विभाजन चाहिए, या जोखिम स्तर कैसे तय होता है?'), L === 'hi' ? ['जोखिम के हिसाब से विभाजन', 'नियम समझाओ'] : ['Breakdown by risk', 'Explain the rules'], []); }
    /* A section name on its own: point at it */
    if (SITE.some(function (p) { return p.words.some(function (w) { return has(q.text, w); }); })) return answerNav(q, L);
    /* Nothing matched: try the catalogue softly, then offer the closest guesses */
    if (best && best.sc >= 1.5) {
      if (!second || best.sc - second.sc >= 1) return featureAnswer(best.f, L, 'what');
      return featureAmbiguous(fs, L);
    }
    var guesses = L === 'hi' ? ['साइट पर क्या क्या है?', 'कितने क्रिटिकल हॉटस्पॉट हैं?', 'यह कैसे तय करता है?', 'Thermal DNA क्या है?'] : ['What can this site do?', 'How many Critical hotspots?', 'How does it decide?', 'What is Thermal DNA?'];
    return R(T(L, 'I did not catch that. I answer about the hotspot feed and this site, in English or Hindi. Did you mean one of these?', 'यह समझ नहीं आया। मैं हॉटस्पॉट फ़ीड और इस साइट के बारे में बताती हूँ, अंग्रेज़ी या हिंदी में। क्या आपका मतलब इनमें से कोई था?'), guesses, [], { unsure: true });
  }

  window.THERMA_BRAIN = { respond: respond, parse: parse, pageContext: pageContext, CHIPS: CHIPS, filter: filter, features: FEATURES, featureScore: function (t) { return featureScore(norm(t), toks(t)); } };
})();
