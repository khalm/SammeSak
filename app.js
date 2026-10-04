// app.js — skjermer, deling og visning av treff
const APP_VERSION = '1.0.0';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Innstillinger ---------- */
const CFG = window.SAMMESAK_CONFIG || {};
function load(key, fallback) { try { const v = localStorage.getItem('ss.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } }
function save(key, val) { try { localStorage.setItem('ss.' + key, JSON.stringify(val)); } catch {} }
const settings = Object.assign({ days: 7, showPaywalled: false, proxy: '' }, load('settings', {}));
const proxyUrl = () => (settings.proxy || CFG.proxy || '').trim();

/* ---------- Tilstand ---------- */
let current = null; // { url, host, title, keywords, desc }
let searchId = 0;

/* ---------- Skjermer ---------- */
function show(name) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + name));
  // Tilbake-knappen på telefonen skal gå til forsiden, ikke lukke appen
  if (name === 'results' && !(history.state && history.state.r)) history.pushState({ r: 1 }, '');
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => {
  if ($('#scr-results').classList.contains('active')) { searchId++; $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-home')); renderHistory(); }
});

/* ---------- Start et søk ---------- */
async function start(shared) {
  const p = parseShared(shared);
  if (!p.title && !p.url) { flash('Fant ingen lenke eller overskrift.'); return; }
  current = { url: p.url, host: p.host, title: p.title, fromSlug: p.fromSlug, desc: '', keywords: extractKeywords(p.title) };
  show('results');
  renderOrig();
  // Med proxy: hent ekte overskrift og ingress fra saken
  if (p.url && proxyUrl()) {
    setStatus('Leser overskriften …', true);
    try {
      const meta = await fetchMeta(p.url, proxyUrl());
      if (meta && meta.title) {
        const t = cleanTitle(meta.title, p.host);
        if (t && (p.fromSlug || !p.title || t.length > p.title.length * 0.6)) {
          current.title = t; current.fromSlug = false;
        }
        current.desc = meta.description || '';
        current.keywords = extractKeywords(current.title, current.desc);
        renderOrig();
      }
    } catch {}
  }
  if (!current.title) {
    setStatus('');
    $('#results').innerHTML = `<div class="card warn">Fant ikke overskriften i lenken. Skriv den inn over (eller noen stikkord) og trykk <b>Søk igjen</b>.</div>`;
    $('#origTitle').focus();
    renderManual();
    return;
  }
  addHistory(current);
  run();
}

async function run() {
  const id = ++searchId;
  const c = current;
  const active = c.keywords.filter(k => k.on);
  renderManual();
  if (!active.length) { setStatus(''); $('#results').innerHTML = `<div class="card warn">Slå på minst ett søkeord.</div>`; return; }
  $('#results').innerHTML = '';
  $('#againBtn').disabled = true;
  setStatus('Søker …', true);
  try {
    const out = await findSameStory({
      title: c.title, url: c.url, host: c.host, keywords: c.keywords,
      timespanDays: settings.days, proxy: proxyUrl(),
      onProgress: (t) => { if (id === searchId) setStatus(t, true); },
    });
    if (id !== searchId) return;
    renderResults(out);
  } catch (e) {
    if (id !== searchId) return;
    setStatus('');
    $('#results').innerHTML = `<div class="card warn">Noe gikk galt: ${esc(e.message)}. Prøv «Søk selv» under.</div>`;
  } finally {
    if (id === searchId) $('#againBtn').disabled = false;
  }
}

/* ---------- Visning ---------- */
function setStatus(text, busy = false) {
  $('#status').innerHTML = text ? (busy ? '<span class="spinner"></span>' : '') + `<span>${esc(text)}</span>` : '';
}

function statusTag(st) {
  const l = PAYWALL_LABEL[st] || PAYWALL_LABEL.unknown;
  return `<span class="tag ${st}">${l.icon} ${l.text}</span>`;
}

function renderOrig() {
  const c = current;
  const src = c.host ? cleanDomain(c.host) : 'Overskrift';
  $('#origSrc').innerHTML = `<span>Saken fra <b>${esc(src)}</b></span>` + (c.host ? statusTag(paywallStatus(c.host)) : '');
  const ta = $('#origTitle');
  ta.value = c.title;
  autosize(ta);
  $('#origNote').textContent = c.fromSlug ? 'Overskriften er gjettet ut fra lenken – rett den gjerne.' : '';
  renderChips();
}

function renderChips() {
  $('#chips').innerHTML = current.keywords.map((k, i) =>
    `<button type="button" class="chip${k.on ? '' : ' off'}" data-i="${i}">${esc(k.word)}</button>`).join('');
}

function colorFor(s) {
  let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 45% 42%)`;
}

function timeAgo(d) {
  if (!d || isNaN(d)) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'nå nettopp';
  if (min < 60) return `${min} min siden`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} t siden`;
  const days = Math.round(h / 24);
  if (days < 7) return days === 1 ? 'i går' : `${days} dager siden`;
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

function hitHtml(a) {
  const name = a.source || a.host;
  const strong = a.score >= 0.6;
  return `<a class="hit" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">
    <div class="hit-top">
      <span class="avatar" style="background:${colorFor(a.host)}">${esc(name.replace(/^www\./, '').slice(0, 1))}</span>
      <span class="hit-src">${esc(name)}</span>
      <span>· ${esc(timeAgo(a.date))}</span>
    </div>
    <div class="hit-title">${esc(a.title)}</div>
    <div class="hit-meta">${statusTag(a.status)}<span class="tag match${strong ? ' strong' : ''}">${strong ? '✓ Trolig samme sak' : 'Mulig samme sak'}</span></div>
  </a>`;
}

function renderResults({ results, errors, used }) {
  setStatus('');
  const open = results.filter(r => r.status !== 'paywall');
  const locked = results.filter(r => r.status === 'paywall');
  const free = open.filter(r => r.status === 'free');
  const other = open.filter(r => r.status !== 'free');
  let html = '';

  if (free.length) {
    html += `<div class="group-h"><h2>Gratis å lese</h2><span class="count">${free.length} treff</span></div>` + free.map(hitHtml).join('');
  }
  if (other.length) {
    html += `<div class="group-h"><h2>${free.length ? 'Andre treff' : 'Treff'}</h2><span class="count">kan være gratis</span></div>` + other.map(hitHtml).join('');
  }
  if (locked.length) {
    if (settings.showPaywalled) html += `<div class="group-h"><h2>Bak betalingsmur</h2><span class="count">${locked.length}</span></div>` + locked.map(hitHtml).join('');
    else html += `<details class="more"><summary>Vis ${locked.length} treff bak betalingsmur</summary>${locked.map(hitHtml).join('')}</details>`;
  }

  if (!open.length) {
    const noSource = !used.length;
    html = `<div class="card empty">
      <div class="big">${noSource ? '📡' : '🔍'}</div>
      <h2>${noSource ? 'Fikk ikke kontakt med nyhetssøket' : 'Fant ingen gratis versjon'}</h2>
      <p class="muted">${noSource
        ? 'Sjekk nettet, eller sett opp proxy under ⚙️ Innstillinger for et sikrere søk.'
        : 'Det kan være en egen sak bare denne avisen har. Prøv å slå av et søkeord, søke lenger tilbake i tid, eller søk selv under.'}</p>
    </div>` + html;
  }

  if (errors.length && !used.length) {
    html += `<p class="small muted">Feil: ${esc(errors.join(' · '))}</p>`;
  } else if (used.length) {
    html += `<p class="small muted center">Søkt i ${esc(used.join(' og '))} · siste ${settings.days === 1 ? 'døgn' : settings.days + ' dager'}</p>`;
  }
  $('#results').innerHTML = html;
}

function renderManual() {
  const words = current.keywords.filter(k => k.on).map(k => k.word);
  const ws = words.length ? words : tokenize(current.title).slice(0, 6);
  $('#manualLinks').innerHTML = manualLinks(ws, guessLang(current.title))
    .map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)}</a>`).join('');
}

function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

function flash(msg) {
  const el = $('#askInput');
  el.placeholder = msg; el.value = ''; el.focus();
}

/* ---------- Historikk ---------- */
function addHistory(c) {
  const h = load('history', []).filter(x => !(x.url && x.url === c.url) && x.title !== c.title);
  h.unshift({ title: c.title, url: c.url, host: c.host, t: Date.now() });
  save('history', h.slice(0, 12));
  renderHistory();
}
function renderHistory() {
  const h = load('history', []);
  $('#historyBox').classList.toggle('hidden', !h.length);
  $('#historyList').innerHTML = h.map((x, i) => `<li><button type="button" data-h="${i}">
    <span class="h-title">${esc(x.title)}</span>
    <span class="h-src">${esc(x.host ? cleanDomain(x.host) : 'Overskrift')} · ${esc(timeAgo(new Date(x.t)))}</span></button></li>`).join('');
}

/* ---------- Hendelser ---------- */
$('#askForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#askInput').value.trim();
  if (!v) { $('#askInput').focus(); return; }
  $('#askInput').value = '';
  start({ text: v });
});
$('#askInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#askForm').requestSubmit(); }
});
$('#pasteBtn').addEventListener('click', async () => {
  try {
    const t = (await navigator.clipboard.readText()).trim();
    if (t) { $('#askInput').value = t; start({ text: t }); $('#askInput').value = ''; return; }
  } catch {}
  $('#askInput').focus();
  $('#askInput').placeholder = 'Hold fingeren her og velg «Lim inn»';
});
$('#homeBtn').addEventListener('click', () => {
  if (history.state && history.state.r) { history.back(); return; }
  searchId++; show('home'); renderHistory();
});

$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  const k = current.keywords[+b.dataset.i];
  k.on = !k.on; renderChips();
});
$('#addWord').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault(); addWord();
});
function addWord() {
  const w = $('#addWord').value.trim();
  if (!w) return false;
  current.keywords.push({ word: w, score: 2, on: true });
  $('#addWord').value = ''; renderChips();
  return true;
}
$('#origTitle').addEventListener('input', (e) => autosize(e.target));
$('#againBtn').addEventListener('click', () => {
  addWord();
  const t = $('#origTitle').value.trim();
  if (t && t !== current.title) {
    // Ny overskrift → nye søkeord, men behold ord brukeren har lagt til selv
    const extra = current.keywords.filter(k => !tokenize(current.title).includes(k.word) && k.on);
    current.title = t; current.fromSlug = false;
    current.keywords = extractKeywords(t, current.desc);
    for (const k of extra) if (!current.keywords.some(x => fold(x.word) === fold(k.word))) current.keywords.push(k);
    renderOrig(); addHistory(current);
  }
  run();
});

$('#historyList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-h]'); if (!b) return;
  const x = load('history', [])[+b.dataset.h];
  if (x) start({ title: x.title, url: x.url });
});

/* Innstillinger */
$('#settingsBtn').addEventListener('click', () => {
  $('#setDays').value = String(settings.days);
  $('#setPaywalled').checked = settings.showPaywalled;
  $('#setProxy').value = settings.proxy;
  $('#proxyInfo').textContent = CFG.proxy ? 'En proxy er allerede bygget inn i appen. Feltet over er bare for å overstyre den.' : '';
  $('#settings').showModal();
});
$('#settings').addEventListener('close', () => {
  if ($('#settings').returnValue !== 'save') return;
  settings.days = +$('#setDays').value;
  settings.showPaywalled = $('#setPaywalled').checked;
  settings.proxy = $('#setProxy').value.trim();
  save('settings', settings);
  if (current && $('#scr-results').classList.contains('active')) run();
});

/* Installering */
let installEvt = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (standalone) $('#installNote').textContent = '';
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); installEvt = e;
  $('#installBtn').classList.remove('hidden');
});
$('#installBtn').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice.catch(() => {});
  installEvt = null; $('#installBtn').classList.add('hidden');
});
window.addEventListener('appinstalled', () => { $('#installBtn').classList.add('hidden'); $('#installNote').textContent = 'Installert! Nå finner du SammeSak i Del-menyen.'; });
if (!standalone && /iPhone|iPad/.test(navigator.userAgent)) {
  $('#installNote').textContent = 'På iPhone: åpne en sak, trykk Del og kopier lenken, og lim den inn her.';
}

/* Versjon */
$$('[data-version]').forEach(el => el.textContent = 'v' + APP_VERSION);

/* Delt fra en annen app, eller ?q= i adressen */
(function fromUrl() {
  const p = new URLSearchParams(location.search);
  const shared = { title: p.get('title') || '', text: p.get('text') || p.get('q') || '', url: p.get('url') || p.get('link') || '' };
  if (shared.title || shared.text || shared.url) {
    history.replaceState(null, '', location.pathname);
    start(shared);
  }
})();
renderHistory();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
