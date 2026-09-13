/* Therma: the FireWatch site guide. Rule-based, bilingual (English, Hindi), no network.
   Answers from the sample detection feed in window.FW_API and a written knowledge base. */
(function () {
  'use strict';
  var API = window.FW_API || {};
  var ROWS = API.rows || [];
  var MON = API.mon || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var reduced = API.reduced || function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  /* ------------------------------------------------------------------ */
  /* Language                                                            */
  /* ------------------------------------------------------------------ */
  var STRONG_HI = ['kitne', 'kitna', 'kitni', 'kya', 'kaha', 'kahan', 'kaun', 'kaunsa', 'kaunse', 'kyun', 'kyu', 'kaise', 'batao', 'bataiye', 'dikhao', 'dikhaiye', 'hai', 'hain', 'mein', 'sabse', 'zyada', 'jyada', 'namaste', 'namaskar', 'dhanyavad', 'dhanyawad', 'shukriya', 'madad', 'chahiye', 'mujhe', 'kripya', 'nahi', 'nahin', 'haan', 'theek', 'matlab', 'samjhao', 'jagah', 'ilaka', 'kshetra', 'aag', 'khatra', 'khatarnak', 'jaanch', 'bhi', 'karo', 'wala', 'wale', 'hamare', 'yahan', 'kaam', 'raha', 'rahi', 'dikha', 'bata'];
  var WEAK_HI = ['ka', 'ki', 'ke', 'aur', 'kam', 'me', 'se', 'par', 'mai', 'main', 'ho', 'kar', 'kyon', 'to', 'ye', 'yeh', 'wo', 'woh'];
  function detectLang(t) {
    if (/[\u0900-\u097F]/.test(t)) return 'hi';
    var toks = t.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean), strong = 0, weak = 0;
    toks.forEach(function (w) { if (STRONG_HI.indexOf(w) >= 0) strong++; else if (WEAK_HI.indexOf(w) >= 0) weak++; });
    return strong >= 1 || weak >= 3 ? 'hi' : 'en';
  }
  var RISK_HI = { Critical: 'क्रिटिकल (गंभीर)', High: 'हाई (उच्च)', Medium: 'मीडियम (मध्यम)', Low: 'लो (कम)' };
  var TYPE_HI = { 'Industrial Fire': 'औद्योगिक आग', 'Agricultural Burning': 'कृषि अवशेष जलाना (पराली)', 'Other/Natural': 'अन्य या प्राकृतिक स्रोत' };
  var REGION_HI = { 'delhi ncr': 'दिल्ली एनसीआर', 'punjab': 'पंजाब', 'haryana': 'हरियाणा', 'maharashtra': 'महाराष्ट्र', 'gujarat': 'गुजरात', 'tamil nadu': 'तमिलनाडु', 'karnataka': 'कर्नाटक', 'telangana': 'तेलंगाना', 'west bengal': 'पश्चिम बंगाल', 'bihar': 'बिहार', 'rajasthan': 'राजस्थान', 'madhya pradesh': 'मध्य प्रदेश', 'uttar pradesh': 'उत्तर प्रदेश', 'goa': 'गोवा', 'chhattisgarh': 'छत्तीसगढ़', 'odisha': 'ओडिशा', 'andhra pradesh': 'आंध्र प्रदेश', 'kerala': 'केरल', 'india': 'भारत' };
  function riskName(r, L) { return L === 'hi' ? RISK_HI[r] || r : r; }
  function typeName(t, L) { return L === 'hi' ? TYPE_HI[t] || t : t; }
  function regionName(reg, L) {
    if (L !== 'hi') return reg;
    var parts = reg.split(',').map(function (p) { return p.trim(); });
    return parts.map(function (p) { return REGION_HI[p.toLowerCase()] || p; }).join(', ');
  }
  function n2(n, L) { return Number(n).toLocaleString(L === 'hi' ? 'hi-IN' : 'en-IN'); }
  function pl(n, one, many) { return n === 1 ? one : many; }
  function dateS(d, L) {
    if (L === 'hi') { var HM = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']; return d.getDate() + ' ' + HM[d.getMonth()]; }
    return String(d.getDate()).padStart(2, '0') + ' ' + MON[d.getMonth()];
  }

  /* ------------------------------------------------------------------ */
  /* Site map                                                            */
  /* ------------------------------------------------------------------ */
  var SITE = [
    { key: 'home', href: 'index.html', en: 'Home', hi: 'होम', words: ['home', 'landing', 'start', 'main page', 'homepage', 'होम', 'मुख्य', 'shuru'] },
    { key: 'what', href: 'index.html#what', en: 'What FireWatch is (home)', hi: 'FireWatch क्या है (होम)', words: ['what it is', 'overview', 'intro', 'parichay', 'परिचय'] },
    { key: 'live', href: 'index.html#live', en: 'Live screening panel (home)', hi: 'लाइव स्क्रीनिंग पैनल (होम)', words: ['live panel', 'kpi', 'counts', 'stats', 'statistics', 'आंकड़े', 'ankde'] },
    { key: 'pixel', href: 'index.html#pixel', en: 'Two fires, one pixel (home)', hi: 'दो आग, एक पिक्सेल (होम)', words: ['pixel', 'two fires', 'image switch', 'do aag'] },
    { key: 'screen', href: 'index.html#screen', en: 'Screen a hotspot with sliders (home)', hi: 'स्लाइडर से हॉटस्पॉट स्क्रीन करें (होम)', words: ['slider', 'sliders', 'preset', 'try the rules', 'screener'] },
    { key: 'does', href: 'index.html#does', en: 'Five capabilities (home)', hi: 'पाँच क्षमताएँ (होम)', words: ['capabilities', 'features', 'what it does', 'jobs', 'kya karta', 'क्षमता', 'सुविधा'] },
    { key: 'who', href: 'index.html#who', en: 'Who it is for (home)', hi: 'किसके लिए है (होम)', words: ['who for', 'users', 'audience', 'officer', 'kiske liye', 'किसके लिए'] },
    { key: 'dashboard', href: 'dashboard.html', en: 'Dashboard, world map', hi: 'डैशबोर्ड, विश्व मानचित्र', words: ['dashboard', 'map', 'world map', 'naksha', 'नक्शा', 'मानचित्र', 'डैशबोर्ड', 'map page'] },
    { key: 'queue', href: 'dashboard.html#queue', en: 'Escalation queue', hi: 'एस्केलेशन कतार', words: ['queue', 'escalation', 'worklist', 'work list', 'katar', 'कतार', 'list of sites', 'intervention', 'export', 'csv', 'download'] },
    { key: 'compare', href: 'compare.html', en: 'Compare, raw feed against screened feed', hi: 'तुलना, कच्चा फ़ीड बनाम स्क्रीन किया फ़ीड', words: ['compare', 'comparison', 'raw', 'before after', 'before and after', 'difference', 'tulna', 'तुलना', 'farak', 'फ़र्क', 'फर्क', 'अंतर', 'side by side'] },
    { key: 'compare-record', href: 'compare.html#cmp-record', en: 'One record, before and after (compare)', hi: 'एक रिकॉर्ड, पहले और बाद (तुलना)', words: ['record card', 'single record', 'one record', 'firms columns', 'raw row'] },
    { key: 'compare-fields', href: 'compare.html#cmp-fields', en: 'Field by field table (compare)', hi: 'फ़ील्ड दर फ़ील्ड तालिका (तुलना)', words: ['fields', 'columns', 'field by field', 'table of fields'] },
    { key: 'dna', href: 'thermal-dna.html', en: 'Thermal DNA, is this heat normal here', hi: 'थर्मल DNA, क्या यह गर्मी यहाँ सामान्य है', words: ['thermal dna', 'dna', 'anomaly', 'anomalies', 'abnormal', 'baseline', 'normal for', 'usual', 'unusual', 'asamanya', 'असामान्य', 'samanya', 'सामान्य', 'pattern', 'signature', 'fingerprint', 'climate', 'temperature history', 'burning season', 'season'] },
    { key: 'report', href: 'report.html', en: 'Report, print or save a situation report', hi: 'Report, स्थिति रिपोर्ट प्रिंट या सहेजें', words: ['report page', 'report builder', 'print page', 'export page'] },
    { key: 'regions', href: 'regions.html', en: 'Regions, one area inside and around', hi: 'Regions, एक क्षेत्र अंदर और आसपास', words: ['regions page', 'regions', 'region page', 'area page'] },
    { key: 'respond', href: 'respond.html', en: 'Respond, route and arrival time to an incident', hi: 'Respond, घटना तक मार्ग और पहुँचने का समय', words: ['respond', 'respond page', 'navigation page', 'route page', 'directions'] },
    { key: 'sos', href: 'dashboard.html#queue', en: 'Emergency SOS, from any queue row', hi: 'आपातकालीन SOS, कतार की किसी भी पंक्ति से', words: ['sos button', 'emergency button', 'resource request'] },
    { key: 'history', href: 'thermal-dna.html#dna-history', en: 'Seven-day threat history (Thermal DNA)', hi: 'सात-दिन का ख़तरा इतिहास (थर्मल DNA)', words: ['threat history', 'history', 'trend badge', 'increasing decreasing', 'itihas', 'इतिहास'] },
    { key: 'problem', href: 'problem.html', en: 'The problem, two fires one pixel', hi: 'समस्या, दो आग एक पिक्सेल', words: ['problem', 'why', 'samasya', 'समस्या', 'stakes', 'alert fatigue', 'punjab visits', 'false alerts', 'background'] },
    { key: 'decides', href: 'how-it-decides.html', en: 'How it decides, hold to verify', hi: 'कैसे तय करता है, दबाकर सत्यापित करें', words: ['how it decides', 'decides', 'hold', 'verify', 'rules page', 'rules', 'thresholds', 'rule engine', 'my location', 'live feed', 'geolocation', 'location', 'kaise tay', 'फैसला', 'निर्णय', 'सत्यापन', 'sthan', 'स्थान'] },
    { key: 'architecture', href: 'architecture.html', en: 'Architecture, the pipeline', hi: 'आर्किटेक्चर, पाइपलाइन', words: ['architecture', 'pipeline', 'stages', 'system design', 'tech stack', 'streamlit', 'folium', 'plotly', 'वास्तुकला', 'संरचना', 'dhancha'] },
    { key: 'contract', href: 'architecture.html#contract', en: 'The CSV handover contract', hi: 'CSV हैंडओवर अनुबंध', words: ['contract', 'csv contract', 'handover', 'integration', 'columns required', 'file format', 'anubandh'] },
    { key: 'faq', href: 'faq.html', en: 'FAQ', hi: 'सामान्य प्रश्न', words: ['faq', 'questions', 'frequently', 'sawal', 'सवाल', 'प्रश्न'] }
  ];
  var PAGE_KEY = { 'index.html': 'home', 'dashboard.html': 'dashboard', 'compare.html': 'compare', 'problem.html': 'problem', 'how-it-decides.html': 'decides', 'architecture.html': 'architecture', 'faq.html': 'faq' };

  /* ------------------------------------------------------------------ */
  /* Knowledge base (verbatim facts from the site)                       */
  /* ------------------------------------------------------------------ */
  var KB = {
    about: {
      en: 'FireWatch is a screening layer for satellite thermal anomalies. It takes every NASA FIRMS hotspot, measures it against industrial sites mapped in OpenStreetMap, counts how many separate days it has returned, and turns heat into a verdict: what is burning, how serious it is, and whether a team should go. Built for Smart India Hackathon 2026, for the district industrial-safety authority and the pollution control board.',
      hi: 'FireWatch उपग्रह से मिले थर्मल हॉटस्पॉट के लिए एक स्क्रीनिंग परत है। यह NASA FIRMS के हर हॉटस्पॉट को OpenStreetMap में दर्ज औद्योगिक स्थलों से मापता है, गिनता है कि वह कितने अलग दिनों में लौटा, और गर्मी को फैसले में बदलता है: क्या जल रहा है, कितना गंभीर है, और क्या टीम भेजनी चाहिए। इसे स्मार्ट इंडिया हैकाथॉन 2026 के लिए बनाया गया है, ज़िला औद्योगिक-सुरक्षा प्राधिकरण और प्रदूषण नियंत्रण बोर्ड के लिए।'
    },
    rules: {
      en: 'Three written rules, no black box.\n1. Proximity: distance to the nearest mapped industrial site is 3 km or less.\n2. Persistence: the pixel has returned on 3 or more separate days.\n3. Confidence: the sensor\'s own confidence, on one 0 to 100 scale.\n\nIf proximity holds, it is an Industrial Fire: Critical when persistent and confidence is 85 or more, High when persistent or confidence is 65 or more, otherwise Medium. If proximity fails, confidence 40 or more is Agricultural Burning (Medium), below that it is Other/Natural (Low).',
      hi: 'तीन लिखित नियम, कोई ब्लैक बॉक्स नहीं।\n1. निकटता: निकटतम दर्ज औद्योगिक स्थल की दूरी 3 किमी या कम।\n2. निरंतरता: पिक्सेल 3 या अधिक अलग दिनों में लौटा हो।\n3. विश्वास: सेंसर का अपना कॉन्फिडेंस, एक ही 0 से 100 पैमाने पर।\n\nअगर निकटता सही है तो यह औद्योगिक आग है: निरंतर और कॉन्फिडेंस 85 या अधिक हो तो क्रिटिकल, निरंतर या कॉन्फिडेंस 65 या अधिक हो तो हाई, वरना मीडियम। अगर निकटता नहीं है तो कॉन्फिडेंस 40 या अधिक पर कृषि अवशेष जलाना (मीडियम), उससे नीचे अन्य/प्राकृतिक (लो)।'
    },
    handling: {
      en: 'Critical: route to the district industrial-safety authority for ground verification within 24 hours.\nHigh: goes into the next scheduled inspection round.\nMedium: watched; one more pass or a stronger reading moves it up.\nLow: logged and left alone.\nAgricultural and natural detections are kept for context and never escalated.',
      hi: 'क्रिटिकल: 24 घंटे के भीतर ज़मीनी सत्यापन के लिए ज़िला औद्योगिक-सुरक्षा प्राधिकरण को भेजें।\nहाई: अगले निर्धारित निरीक्षण दौर में जाता है।\nमीडियम: निगरानी में; एक और पास या मज़बूत रीडिंग इसे ऊपर ले जाती है।\nलो: दर्ज करके छोड़ दिया जाता है।\nकृषि और प्राकृतिक हॉटस्पॉट संदर्भ के लिए रखे जाते हैं, कभी एस्केलेट नहीं होते।'
    },
    confidence: {
      en: 'VIIRS reports confidence as low, nominal or high. FireWatch reads those as 35, 65 and 90 percent so one scale runs through the whole system. MODIS already reports 0 to 100.',
      hi: 'VIIRS कॉन्फिडेंस को low, nominal या high बताता है। FireWatch इन्हें 35, 65 और 90 प्रतिशत पढ़ता है ताकि पूरे सिस्टम में एक ही पैमाना चले। MODIS पहले से 0 से 100 देता है।'
    },
    sources: {
      en: 'Data comes from NASA FIRMS (VIIRS on Suomi NPP, NOAA-20 and NOAA-21, plus MODIS on Terra and Aqua), Sentinel-2 for a set of records, OpenStreetMap industrial polygons for distance, and Nominatim for place names. Basemaps are Esri dark canvas, OpenStreetMap streets and Esri satellite imagery, all keyless.',
      hi: 'डेटा NASA FIRMS (Suomi NPP, NOAA-20 और NOAA-21 पर VIIRS, और Terra व Aqua पर MODIS), कुछ रिकॉर्ड के लिए Sentinel-2, दूरी के लिए OpenStreetMap के औद्योगिक बहुभुज, और जगह के नाम के लिए Nominatim से आता है। बेसमैप Esri डार्क कैनवास, OpenStreetMap सड़कें और Esri उपग्रह इमेजरी हैं, सब बिना key के।'
    },
    pipeline: {
      en: 'Three stages, one CSV between each.\nStage 01 Acquisition: FIRMS hotspots, OpenStreetMap industrial polygons, distance to nearest site, recurrence count.\nStage 02 Rule engine: deterministic thresholds assign fire type and risk band.\nStage 03 Delivery: map, ranked queue, CSV export. Runs offline on one machine with Streamlit, Folium and Plotly.',
      hi: 'तीन चरण, हर दो के बीच एक CSV।\nचरण 01 अधिग्रहण: FIRMS हॉटस्पॉट, OpenStreetMap औद्योगिक बहुभुज, निकटतम स्थल की दूरी, पुनरावृत्ति गिनती।\nचरण 02 नियम इंजन: निश्चित थ्रेशोल्ड आग का प्रकार और जोखिम बैंड तय करते हैं।\nचरण 03 वितरण: नक्शा, क्रमबद्ध कतार, CSV निर्यात। एक मशीन पर Streamlit, Folium और Plotly के साथ ऑफ़लाइन चलता है।'
    },
    contract: {
      en: 'The app reads one CSV. Required: lat, lon. Expected: type, risk_level, confidence (0 to 100, or FIRMS l, n, h). Optional: distance_km, days_seen, detected_on, region, source. Drop the file beside the app and it is picked up on the next interaction, no restart.',
      hi: 'ऐप एक CSV पढ़ता है। ज़रूरी: lat, lon। अपेक्षित: type, risk_level, confidence (0 से 100, या FIRMS का l, n, h)। वैकल्पिक: distance_km, days_seen, detected_on, region, source। फ़ाइल ऐप के पास रख दें, अगली बार अपने आप उठ जाती है, बिना रीस्टार्ट।'
    },
    punjab: {
      en: 'Field teams in Punjab visited 40,557 alert sites in one season and found no fire at 17,832 of them, close to 45 percent. That is alert fatigue, and it is how real fires get missed. Source: Punjab Remote Sensing Centre figures reported by The Tribune.',
      hi: 'पंजाब में फ़ील्ड टीमों ने एक सीज़न में 40,557 अलर्ट स्थलों का दौरा किया और 17,832 पर कोई आग नहीं मिली, लगभग 45 प्रतिशत। यही अलर्ट थकान है, और इसी से असली आग छूट जाती है। स्रोत: पंजाब रिमोट सेंसिंग सेंटर के आंकड़े, द ट्रिब्यून में प्रकाशित।'
    },
    limits: {
      en: 'Honest limits: the records on this site are samples with realistic geography and synthetic readings. The raw FIRMS feed is not wrong, it is complete; FireWatch orders it, it does not delete anything. A mapped industrial polygon is only as good as OpenStreetMap coverage. Live screening of the real feed runs on the How it decides page when you allow location.',
      hi: 'ईमानदार सीमाएँ: इस साइट के रिकॉर्ड नमूने हैं, भूगोल असली, रीडिंग कृत्रिम। कच्चा FIRMS फ़ीड ग़लत नहीं है, वह पूरा है; FireWatch उसे क्रमबद्ध करता है, कुछ हटाता नहीं। दर्ज औद्योगिक बहुभुज उतना ही अच्छा है जितना OpenStreetMap का कवरेज। असली फ़ीड की लाइव स्क्रीनिंग How it decides पेज पर चलती है, जब आप लोकेशन की अनुमति दें।'
    },
    frp: {
      en: 'FRP is fire radiative power, in megawatts: how much energy the fire radiates in the sensor\'s band. bright_ti4 is the brightness temperature of the 4 micrometre channel in kelvin. On the compare page both appear in the raw record card. FireWatch keeps them and adds cause, distance, recurrence and risk on top.',
      hi: 'FRP यानी fire radiative power, मेगावाट में: आग सेंसर बैंड में कितनी ऊर्जा विकीर्ण करती है। bright_ti4 4 माइक्रोमीटर चैनल का ब्राइटनेस तापमान है, केल्विन में। तुलना पेज पर दोनों कच्चे रिकॉर्ड कार्ड में दिखते हैं। FireWatch इन्हें रखता है और ऊपर से कारण, दूरी, पुनरावृत्ति और जोखिम जोड़ता है।'
    },
    offline: {
      en: 'Yes. Basemaps are keyless, fonts fall back to the system, and the app runs on a single machine. Nothing on the map can fail for want of a credential.',
      hi: 'हाँ। बेसमैप बिना key के हैं, फ़ॉन्ट सिस्टम पर लौट आते हैं, और ऐप एक मशीन पर चलता है। किसी credential की कमी से नक्शे पर कुछ नहीं रुकता।'
    },
    speed: {
      en: 'As fast as the satellite pass. FIRMS publishes within hours of overpass, and the rule engine runs in seconds on a laptop.',
      hi: 'उपग्रह के गुज़रने जितना तेज़। FIRMS ओवरपास के कुछ घंटों में प्रकाशित करता है, और नियम इंजन लैपटॉप पर सेकंडों में चलता है।'
    },
    coverage: {
      en: 'The rules do not care where the pixel is. FIRMS covers the globe, OpenStreetMap has industrial polygons on every continent, and the dashboard map pans anywhere. The sample feed shows both India and a set of world sites.',
      hi: 'नियमों को फ़र्क नहीं पड़ता पिक्सेल कहाँ है। FIRMS पूरी दुनिया कवर करता है, OpenStreetMap में हर महाद्वीप पर औद्योगिक बहुभुज हैं, और डैशबोर्ड नक्शा कहीं भी जाता है। नमूना फ़ीड में भारत और दुनिया के कुछ स्थल दोनों हैं।'
    },
    whyrules: {
      en: 'Because an officer has to defend the verdict. Every threshold is written down and every row can be checked by hand. A model that cannot explain itself does not survive its first wrong call.',
      hi: 'क्योंकि अधिकारी को फैसले का बचाव करना होता है। हर थ्रेशोल्ड लिखा हुआ है और हर पंक्ति हाथ से जाँची जा सकती है। जो मॉडल खुद को समझा न सके, वह अपनी पहली ग़लती में ही गिर जाता है।'
    },
    export: {
      en: 'On the dashboard, the button "Export current view (CSV)" under the escalation queue downloads every row in the current filter set with all columns: site_id, lat, lon, type, risk_level, confidence, distance_km, days_seen, region, source, detected_on.',
      hi: 'डैशबोर्ड पर एस्केलेशन कतार के नीचे "Export current view (CSV)" बटन मौजूदा फ़िल्टर की हर पंक्ति सभी कॉलम के साथ डाउनलोड करता है: site_id, lat, lon, type, risk_level, confidence, distance_km, days_seen, region, source, detected_on।'
    },
    satellite: {
      en: 'Both the dashboard map and the compare maps have a Map / Satellite switch beside the title. Satellite puts each hotspot on Esri imagery with place names, so you can see the plant, the field or the forest under a detection.',
      hi: 'डैशबोर्ड नक्शे और तुलना नक्शों में शीर्षक के पास Map / Satellite स्विच है। Satellite हर हॉटस्पॉट को जगह के नामों के साथ Esri इमेजरी पर रखता है, ताकि आप देख सकें कि नीचे कारखाना है, खेत है या जंगल।'
    },
    justfirms: {
      en: 'No, not just FIRMS on a map. FIRMS tells you where it is hot. FireWatch tells you whether that heat sits within 3 km of a mapped factory, whether it has come back on 3 or more days, and how sure the sensor is. That is the difference between a feed and a worklist. The compare page shows it record by record.',
      hi: 'नहीं, सिर्फ़ नक्शे पर FIRMS नहीं। FIRMS बताता है कहाँ गर्म है। FireWatch बताता है कि वह गर्मी किसी दर्ज कारखाने के 3 किमी के भीतर है या नहीं, 3 या अधिक दिनों में लौटी है या नहीं, और सेंसर कितना पक्का है। यही फ़ीड और वर्कलिस्ट का फ़र्क है। तुलना पेज इसे रिकॉर्ड दर रिकॉर्ड दिखाता है।'
    },
    livefeed: {
      en: 'When the live feed arrives, drop one CSV beside the app. It is picked up on the next interaction, no restart, no code change. The sample set steps aside by itself.',
      hi: 'जब लाइव फ़ीड आए, एक CSV ऐप के पास रख दें। अगली बार अपने आप उठ जाती है, बिना रीस्टार्ट, बिना कोड बदले। नमूना सेट खुद हट जाता है।'
    },
    who: {
      en: 'FireWatch is built for the district industrial-safety authority and the pollution control board: the people who send the team. It is a worklist for them, not a public alert feed.',
      hi: 'FireWatch ज़िला औद्योगिक-सुरक्षा प्राधिकरण और प्रदूषण नियंत्रण बोर्ड के लिए बना है: जो लोग टीम भेजते हैं। यह उनके लिए वर्कलिस्ट है, सार्वजनिक अलर्ट फ़ीड नहीं।'
    },
    faqlist: {
      en: 'The FAQ answers seven questions. Tap one and I will answer it here:',
      hi: 'FAQ में सात सवालों के जवाब हैं। किसी पर टैप करें, मैं यहीं जवाब दूँगी:'
    },
    dna: {
      en: 'Thermal DNA reads a location three ways and says whether the heat there now is abnormal for that place. Strand 1: a ten-year baseline of daily maximum air temperature for the same dates (ERA5 via Open-Meteo), so you know if the background is unusually hot. Strand 2: live VIIRS fire pixels from the last 7 days within 1 km, read for persistence, night passes, radiative power and how tightly they cluster. Strand 3: the regional burning calendar and the distance to mapped industry. The verdict is one of: Abnormal for this location, Watch, Expected for this location, Not abnormal yet, or Heat, probably not fire, with an abnormality index from 0 to 100 and every threshold printed.',
      hi: 'थर्मल DNA किसी जगह को तीन तरह से पढ़ता है और बताता है कि वहाँ की मौजूदा गर्मी उस जगह के लिए असामान्य है या नहीं। स्ट्रैंड 1: इन्हीं तारीखों के लिए दस साल का दैनिक अधिकतम तापमान बेसलाइन (Open-Meteo से ERA5), ताकि पता चले पृष्ठभूमि असामान्य रूप से गर्म है या नहीं। स्ट्रैंड 2: पिछले 7 दिनों के 1 किमी के भीतर के लाइव VIIRS फ़ायर पिक्सेल, निरंतरता, रात के पास, विकिरण शक्ति और गुच्छे की कसावट के लिए। स्ट्रैंड 3: क्षेत्रीय जलाने का कैलेंडर और दर्ज उद्योग की दूरी। फैसला इनमें से एक: इस जगह के लिए असामान्य, निगरानी, इस जगह के लिए अपेक्षित, अभी असामान्य नहीं, या गर्मी, शायद आग नहीं, 0 से 100 का असामान्यता सूचकांक और हर थ्रेशोल्ड छपा हुआ।'
    },
    self: {
      en: 'I am Therma, the FireWatch guide. I answer from the sample detection feed on this site and from the pages themselves. I can count and list hotspots by risk, cause, region or source, explain how a verdict is reached, describe trends by day, and take you to any section. I work in English and Hindi, and I do not send anything off this page.',
      hi: 'मैं Therma हूँ, FireWatch की गाइड। मैं इस साइट के नमूना फ़ीड और पेजों से जवाब देती हूँ। मैं जोखिम, कारण, क्षेत्र या स्रोत के हिसाब से हॉटस्पॉट गिन और सूचीबद्ध कर सकती हूँ, बता सकती हूँ कि फैसला कैसे बनता है, दिन के हिसाब से रुझान बता सकती हूँ, और किसी भी अनुभाग तक ले जा सकती हूँ। मैं अंग्रेज़ी और हिंदी में काम करती हूँ, और इस पेज से बाहर कुछ नहीं भेजती।'
    }
  };

  window.THERMA_CORE = { detectLang: detectLang, riskName: riskName, typeName: typeName, regionName: regionName, n2: n2, pl: pl, dateS: dateS, SITE: SITE, PAGE_KEY: PAGE_KEY, KB: KB, ROWS: ROWS, API: API, MON: MON, esc: esc, $: $, here: here, reduced: reduced, REGION_HI: REGION_HI };
})();
