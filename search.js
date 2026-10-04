// search.js — finner nøkkelord i en sak og leter etter samme sak hos andre nyheter.
// Kilder:
//   • GDELT (gratis, ingen nøkkel) – søker i nyheter fra hele verden
//   • Google Nyheter (via valgfri gratis proxy, se worker.js) – best dekning av norske nyheter

/* ---------- Tekst ---------- */

const STOPWORDS = new Set((
  // norsk
  'og i jeg det at en et den til er som på de med han av ikke der så var meg seg men ett har om vi min mitt ha hadde hun nå over da ved fra du ut sin dem oss opp man kan hans hvor eller hva skal selv sjøl her alle vil bli ble blitt kunne inn når være kom noen noe ville dere deres kun ja etter ned skulle denne for deg si sine sitt mot å meget hvorfor dette disse uten hvordan ingen din ditt blir samme hvilken hvilke sånn inni mellom vår hver hvem vors hvis både bare enn fordi før mange også slik vært båe begge siden dykk dykkar dei deira deim di då eg ein eit eitt elles honom hjå ho hoe henne hennar hennes hoss hossen ikkje ingi inkje korleis korso kva kvar kvarhelst kven kvi kvifor me medan mi mine mykje no nokon noka nokor noko nokre sia sidan so somt somme um upp vere vore verte vort varte vart nye ny nytt flere fleste mer mest første andre to tre fire fem seks sju åtte ni ti år dag dager uke gang her mens fikk får gjør gjorde sier sa sagt slik helt nå svært veldig enda sammen like nok rundt tross annen andre også ifølge vg nrk etter derfor dermed altså allerede igjen aldri alltid går gikk tar tok satt sett se ser fått få'
  // engelsk
  + ' the a an and or but if of to in on at by for with from as is are was were be been being it its this that these those he she they we you i his her their our your my not no yes do does did has have had will would can could should may might must shall about into over after before than then so such just also more most very new says said say how what who why when where which while up out off down all any some one two three first last year years day days week news live update updates video watch report reports here there over under amid against'
).split(/\s+/));

/** Gjør om æøå osv. til a-z så «går» og «gar» (fra lenker) blir like. */
function fold(s) {
  return String(s || '').toLowerCase()
    .replace(/[æä]/g, 'ae').replace(/[øö]/g, 'o').replace(/[åàáâã]/g, 'a')
    .replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôõ]/g, 'o').replace(/[úùûü]/g, 'u')
    .replace(/ß/g, 'ss').replace(/ç/g, 'c').replace(/ñ/g, 'n');
}

/** Grov ordstamme: de første 5 bokstavene (tåler bøyning: «regjeringen» ≈ «regjeringa»). */
function stem(word) {
  const f = fold(word).replace(/[^a-z0-9]/g, '');
  return f.length > 5 ? f.slice(0, 5) : f;
}

function tokenize(text) {
  return String(text || '')
    .replace(/[«»"“”„'’‘`´]/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function isStop(w) { return STOPWORDS.has(w.toLowerCase()); }

/** Gjetter språk: 'nb' eller 'en'. */
function guessLang(text) {
  const t = String(text || '').toLowerCase();
  if (/[æøå]/.test(t)) return 'nb';
  const words = tokenize(t);
  const nb = ['og', 'er', 'på', 'som', 'ikke', 'med', 'til', 'av', 'har', 'etter', 'mot', 'vil', 'skal', 'blir', 'ble', 'fra', 'kan', 'om'];
  const en = ['the', 'and', 'is', 'of', 'to', 'in', 'on', 'with', 'after', 'for', 'will', 'has', 'was', 'from', 'over', 'says'];
  let a = 0, b = 0;
  for (const w of words) { if (nb.includes(w)) a++; if (en.includes(w)) b++; }
  return b > a ? 'en' : 'nb';
}

/* ---------- Lenke og overskrift ---------- */

const URL_RE = /https?:\/\/[^\s<>"«»]+/i;

/** Tar imot det som ble delt (tittel, tekst, lenke) og finner lenke + overskrift. */
function parseShared({ title = '', text = '', url = '' } = {}) {
  const all = [url, text, title].join(' ');
  const m = all.match(URL_RE);
  let link = m ? m[0].replace(/[).,;:!?]+$/, '') : '';
  let host = '';
  try { if (link) host = new URL(link).hostname; } catch { link = ''; }

  // Tekst uten lenke: bruk tittel først, så tekst
  const strip = (s) => String(s || '').replace(new RegExp(URL_RE.source, 'gi'), ' ').replace(/\s+/g, ' ').trim();
  let head = strip(title) || strip(text);
  let fromSlug = false;
  if (!head && link) { head = slugTitle(link); fromSlug = !!head; if (head) head = head[0].toUpperCase() + head.slice(1); }
  head = cleanTitle(head, host);
  return { url: link, host, title: head, fromSlug };
}

/** Fjerner «– VG», «| Aftenposten», «- NRK Norge» osv. på slutten. */
function cleanTitle(title, host = '') {
  let t = String(title || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(VG\+|DB\+|\+|Pluss|PLUSS|Abonnement|Kun for abonnenter)[:\s]+/i, '');
  const site = fold(cleanDomainName(host));
  for (let i = 0; i < 2; i++) {
    const m = t.match(/^(.*\S)\s+[-–—|·:]\s+([^-–—|·]{1,40})$/);
    if (!m) break;
    const tail = m[2].trim();
    const tailWords = tail.split(/\s+/).length;
    const looksLikeSite = (site && fold(tail).replace(/[^a-z0-9]/g, '').includes(site))
      || /\b(nyheter|news|avis|nett|online|tv|radio|norge|direkte)\b/i.test(tail)
      || /\.(no|com|se|dk|uk|de|fr|net|org)$/i.test(tail);
    if (tailWords <= 3 && (looksLikeSite || tailWords <= 2) && m[1].split(/\s+/).length >= 3) t = m[1];
    else break;
  }
  return t.trim();
}

function cleanDomainName(host) {
  const h = String(host || '').toLowerCase().replace(/^(www\d?|m|amp)\./, '');
  return h.split('.')[0] || '';
}

/** Lager en overskrift av lenken: …/i/Xy12ab/regjeringen-kutter-i-budsjettet → «regjeringen kutter i budsjettet» */
function slugTitle(link) {
  try {
    const u = new URL(link);
    const segs = u.pathname.split('/').map(s => decodeURIComponent(s).replace(/\.(html?|php|aspx?)$/i, ''));
    let best = '';
    for (const s of segs) {
      const parts = s.split(/[-_+]+/).filter(Boolean);
      const words = parts.filter(p => /^\p{L}[\p{L}']*$/u.test(p) || /^\d{1,4}$/.test(p));
      if (words.length >= 3 && words.length >= parts.length * 0.6 && words.join(' ').length > best.length) best = words.join(' ');
    }
    return best;
  } catch { return ''; }
}

/* ---------- Nøkkelord ---------- */

/**
 * Plukker ut de viktigste ordene. Navn (stor forbokstav midt i setningen),
 * lange ord og tall prioriteres. Returnerer [{word, score, on}].
 */
const WEAK = new Set(('announces announced warns warned plans calls called reveals revealed claims claimed faces hits gets makes '
  + 'sets wins says told tells report reported reports amid latest breaking live update exclusive '
  + 'mener krever advarer varsler kommer fortsatt stor store nytt avslører avslørt skriver opplyser bekrefter bekreftet').split(' '));

function extractKeywords(title, extra = '', max = 7) {
  const words = tokenize(title);
  const seen = new Map();
  // Overskrifter Med Stor Forbokstav I Hvert Ord (vanlig på engelsk) – da sier store bokstaver lite
  const content = words.filter(w => !isStop(w) && /\p{L}/u.test(w));
  const titleCase = content.length >= 4 && content.filter(w => /^\p{Lu}/u.test(w)).length / content.length > 0.7;
  words.forEach((w, i) => {
    if (w.length < 3 && !/^\d+$/.test(w)) return;
    if (isStop(w)) return;
    if (/^\d+$/.test(w) && w.length < 3) return;
    const key = fold(w);
    let s = 1;
    const cap = /^\p{Lu}/u.test(w);
    const allCaps = w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w);
    if (cap && !titleCase && i > 0) s += 3;
    else if (cap) s += 1;
    if (WEAK.has(w.toLowerCase())) s -= 1.5;
    if (allCaps && w.length <= 6) s += 1.5; // forkortelser: NATO, FHI, DNB
    if (w.length >= 8) s += 1;
    if (w.length >= 12) s += 0.5;
    if (/\d/.test(w)) s += w.length >= 3 ? 0.8 : 0;
    if (/^(19|20)\d\d$/.test(w)) s -= 0.8; // årstall sier lite
    s -= i * 0.02; // tidlig i tittelen = litt viktigere
    const prev = seen.get(key);
    if (!prev || prev.score < s) seen.set(key, { word: w, score: s });
  });
  // Ord fra ingress/beskrivelse kan styrke ord som også står i tittelen
  if (extra) {
    const ex = new Set(tokenize(extra).map(stem));
    for (const k of seen.values()) if (ex.has(stem(k.word))) k.score += 0.6;
  }
  const list = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, max);
  const onCount = Math.min(4, list.length);
  return list.map((k, i) => ({ word: k.word, score: Math.round(k.score * 10) / 10, on: i < onCount }));
}

/* ---------- Treff og poeng ---------- */

/** Hvor godt passer en tittel med søket? 0–1. */
function matchScore(keywords, origTitle, candTitle, candDesc = '') {
  const active = keywords.filter(k => k.on);
  if (!active.length) return 0;
  const candStems = new Set(tokenize(candTitle + ' ' + candDesc).map(stem));
  const titleStems = new Set(tokenize(candTitle).map(stem));
  let hit = 0, weight = 0;
  for (const k of active) {
    const w = Math.max(1, k.score);
    weight += w;
    const st = stem(k.word);
    if (titleStems.has(st)) hit += w;
    else if (candStems.has(st)) hit += w * 0.6;
  }
  const kw = hit / weight;
  // Likhet mellom titlene (ord som ikke er fyllord)
  const a = new Set(tokenize(origTitle).filter(w => !isStop(w) && w.length > 2).map(stem));
  const b = new Set(tokenize(candTitle).filter(w => !isStop(w) && w.length > 2).map(stem));
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  const jac = a.size && b.size ? inter / (a.size + b.size - inter) : 0;
  return Math.min(1, kw * 0.75 + jac * 0.6);
}

/* ---------- Kilder ---------- */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url, ms = 15000, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

/** GDELT bruker JSONP som reserve hvis nettleseren blokkerer vanlig oppslag. */
function jsonp(url, ms = 15000) {
  return new Promise((resolve, reject) => {
    const cb = '__ss_cb' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const done = (fn, v) => { clearTimeout(t); delete window[cb]; s.remove(); fn(v); };
    const t = setTimeout(() => done(reject, new Error('timeout')), ms);
    window[cb] = (data) => done(resolve, data);
    s.onerror = () => done(reject, new Error('jsonp'));
    s.src = url + '&callback=' + cb;
    document.head.appendChild(s);
  });
}

let lastGdelt = 0;

/** Søk i GDELT. timespan: '1d', '3d', '1w', '1m' … */
async function searchGdelt(words, { timespan = '1w', proxy = '', max = 75 } = {}) {
  const q = words.filter(w => fold(w).replace(/[^a-z0-9]/g, '').length >= 3)
    .map(w => /\s/.test(w) ? `"${w}"` : w).join(' ');
  if (!q) return [];
  const params = new URLSearchParams({ query: q, mode: 'artlist', maxrecords: String(max), timespan, sort: 'hybridrel', format: 'json' });
  // GDELT tillater ett oppslag per 5 sekunder
  const wait = 5300 - (Date.now() - lastGdelt);
  if (wait > 0) await sleep(wait);
  lastGdelt = Date.now();

  const direct = 'https://api.gdeltproject.org/api/v2/doc/doc?' + params;
  let data = null, err = null;
  const tries = [];
  if (proxy) tries.push(() => fetchWithTimeout(proxy.replace(/\/$/, '') + '/gdelt?' + params).then(parseGdeltRes));
  tries.push(() => fetchWithTimeout(direct).then(parseGdeltRes));
  if (typeof document !== 'undefined') {
    const jp = new URLSearchParams(params); jp.set('format', 'jsonp');
    tries.push(() => jsonp('https://api.gdeltproject.org/api/v2/doc/doc?' + jp));
  }
  for (const t of tries) {
    try { data = await t(); if (data) break; } catch (e) { err = e; }
  }
  if (!data) throw err || new Error('GDELT svarte ikke');
  return (data.articles || []).map(a => ({
    title: (a.title || '').trim(),
    url: a.url,
    host: hostOf(a.url) || a.domain,
    date: parseGdeltDate(a.seendate),
    lang: a.language,
    image: a.socialimage || '',
    via: 'GDELT',
  })).filter(a => a.title && a.url);
}

async function parseGdeltRes(res) {
  const txt = await res.text();
  if (!res.ok) throw new Error('GDELT ' + res.status);
  const t = txt.trim();
  if (!t.startsWith('{')) {
    if (/limit requests/i.test(t)) throw new Error('GDELT: for mange søk – vent litt');
    if (!t) return { articles: [] };
    throw new Error('GDELT: ' + t.slice(0, 120));
  }
  return JSON.parse(t);
}

function parseGdeltDate(s) {
  const m = String(s || '').match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

/** Søk i Google Nyheter via proxy (RSS). */
async function searchGoogleNews(words, { lang = 'nb', days = 7, proxy } = {}) {
  if (!proxy) return [];
  const q = words.join(' ') + ` when:${days}d`;
  const loc = lang === 'en' ? { hl: 'en-US', gl: 'US', ceid: 'US:en' } : { hl: 'no', gl: 'NO', ceid: 'NO:no' };
  const params = new URLSearchParams({ q, ...loc });
  const res = await fetchWithTimeout(proxy.replace(/\/$/, '') + '/news?' + params);
  if (!res.ok) throw new Error('Google Nyheter ' + res.status);
  return parseNewsRss(await res.text());
}

function parseNewsRss(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return [...doc.querySelectorAll('item')].map(it => {
    const src = it.querySelector('source');
    const srcName = src ? src.textContent.trim() : '';
    let title = (it.querySelector('title')?.textContent || '').trim();
    if (srcName && title.endsWith(' - ' + srcName)) title = title.slice(0, -(srcName.length + 3));
    const pub = it.querySelector('pubDate')?.textContent;
    return {
      title,
      url: (it.querySelector('link')?.textContent || '').trim(),
      host: src ? hostOf(src.getAttribute('url')) : '',
      source: srcName,
      date: pub ? new Date(pub) : null,
      via: 'Google Nyheter',
    };
  }).filter(a => a.title && a.url);
}

/** Henter tittel og ingress fra saken (krever proxy – betalingssider viser dette også uten abonnement). */
async function fetchMeta(url, proxy) {
  if (!proxy || !url) return null;
  const res = await fetchWithTimeout(proxy.replace(/\/$/, '') + '/meta?url=' + encodeURIComponent(url), 12000);
  if (!res.ok) return null;
  return res.json();
}

function hostOf(u) { try { return new URL(u).hostname; } catch { return ''; } }

/* ---------- Samlet søk ---------- */

/**
 * Finner samme sak andre steder.
 * onProgress(tekst) kalles underveis. Returnerer { results, errors, used }.
 */
async function findSameStory({ title, url, host, keywords, timespanDays = 7, proxy = '', onProgress = () => {} }) {
  const lang = guessLang(title);
  const active = keywords.filter(k => k.on).map(k => k.word);
  const errors = [];
  const used = [];
  const all = new Map();
  const origHost = cleanDomain(host);
  const origPath = (() => { try { const u = new URL(url); return u.hostname.replace(/^www\./, '') + u.pathname; } catch { return ''; } })();

  const add = (list) => {
    for (const a of list) {
      const h = cleanDomain(a.host);
      if (!h) continue;
      if (origHost && (h === origHost || h.endsWith('.' + origHost))) continue; // samme avis
      const key = a.url.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '');
      if (origPath && key.startsWith(origPath)) continue;
      if (all.has(key)) continue;
      const score = matchScore(keywords, title, a.title, a.desc || '');
      all.set(key, { ...a, host: h, score, status: paywallStatus(h) });
    }
  };

  const gdeltSpan = timespanDays <= 1 ? '1d' : timespanDays <= 3 ? '3d' : timespanDays <= 7 ? '1w' : timespanDays <= 14 ? '2w' : '1m';

  // 1) Google Nyheter (hvis proxy) – gå i gang med en gang
  const gn = proxy ? (async () => {
    onProgress('Søker i Google Nyheter …');
    try {
      let r = await searchGoogleNews(active, { lang, days: timespanDays, proxy });
      if (r.length < 3 && active.length > 2) r = r.concat(await searchGoogleNews(active.slice(0, 2), { lang, days: timespanDays, proxy }));
      if (lang === 'nb') {
        // Norske navn i internasjonale medier
        const names = keywords.filter(k => k.on && /^\p{Lu}/u.test(k.word)).map(k => k.word).slice(0, 3);
        if (names.length >= 2) r = r.concat(await searchGoogleNews(names, { lang: 'en', days: timespanDays, proxy }).catch(() => []));
      }
      add(r); used.push('Google Nyheter');
    } catch (e) { errors.push(e.message); }
  })() : Promise.resolve();

  // 2) GDELT – smalt søk først, så bredere hvis det gir få treff
  const gd = (async () => {
    const steps = [active];
    if (active.length > 3) steps.push(active.slice(0, 3));
    if (active.length > 2) steps.push(active.slice(0, 2));
    let found = 0;
    for (let i = 0; i < steps.length; i++) {
      onProgress(i === 0 ? 'Søker i nyheter fra hele verden …' : 'Utvider søket …');
      try {
        const r = await searchGdelt(steps[i], { timespan: gdeltSpan, proxy });
        const before = all.size; add(r); found += all.size - before;
        if (!used.includes('GDELT')) used.push('GDELT');
      } catch (e) { errors.push(e.message); if (/svarte ikke|Failed to fetch|NetworkError|jsonp|timeout/i.test(e.message)) break; }
      const good = [...all.values()].filter(a => a.score >= 0.45).length;
      if (good >= 3 || found >= 8) break;
    }
  })();

  await Promise.all([gn, gd]);
  const rank = { free: 0, unknown: 1, partial: 2, paywall: 3 };
  const results = [...all.values()]
    .filter(a => a.score >= 0.28)
    .sort((a, b) => (rank[a.status] - rank[b.status]) || (b.score - a.score) || ((b.date || 0) - (a.date || 0)));
  return { results, errors: [...new Set(errors)], used, lang };
}

/** Lenker for å søke selv (virker alltid). */
function manualLinks(words, lang = 'nb') {
  const q = encodeURIComponent(words.join(' '));
  const gn = lang === 'en' ? 'hl=en-US&gl=US&ceid=US:en' : 'hl=no&gl=NO&ceid=NO:no';
  return [
    { name: 'Google Nyheter', url: `https://news.google.com/search?q=${q}&${gn}` },
    { name: 'NRK', url: `https://www.nrk.no/sok/?q=${q}` },
    { name: 'Bing Nyheter', url: `https://www.bing.com/news/search?q=${q}` },
    { name: 'DuckDuckGo', url: `https://duckduckgo.com/?q=${q}&iar=news&ia=news` },
  ];
}

if (typeof module !== 'undefined') {
  const pw = require('./paywall.js');
  global.paywallStatus = pw.paywallStatus; global.cleanDomain = pw.cleanDomain;
  module.exports = { fold, stem, tokenize, guessLang, parseShared, cleanTitle, slugTitle, extractKeywords, matchScore, manualLinks, parseGdeltDate };
}
