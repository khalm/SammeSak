// worker.js — VALGFRI gratis proxy på Cloudflare Workers for SammeSak.
// Gir bedre treff: søk i Google Nyheter, og ekte overskrift hentet fra lenken du deler.
// Uten proxy søker appen bare i GDELT (og overskriften tas fra det som ble delt).
//
// Oppsett (kan gjøres på mobilen, gratis):
//   1. Gå til https://dash.cloudflare.com → Workers & Pages → Create → Create Worker
//   2. Gi den navnet «sammesak» → Deploy → Edit code
//   3. Slett alt som står der, lim inn hele denne filen → Deploy
//   4. Kopier adressen (https://sammesak.<ditt-navn>.workers.dev)
//   5. I GitHub-repoet: Settings → Secrets and variables → Actions → New repository secret
//      Navn: PROXY_URL   Verdi: adressen fra punkt 4
//   6. Actions → Publiser appen → Run workflow
//
// Proxyen svarer bare appen din (ALLOWED_ORIGIN) og bare på tre adresser:
//   /search?q=… samlet nyhetssøk (Bing Nyheter + NRK)
//   /news?q=…   nyhetssøk (Bing Nyheter, RSS)
//   /meta?url=… overskrift og ingress fra en sak (det som vises før betalingsmuren)
//   /gdelt?…    GDELT-søk

const ALLOWED_ORIGIN = 'https://khalm.github.io';
const BOT_UA = 'SammeSak/1.0 (+https://khalm.github.io/SammeSak/)';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Expose-Headers': 'X-Source',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const url = new URL(request.url);
    // Feilsøking: test om en nyhetskilde svarer (bare kjente nyhetsadresser)
    if (url.pathname === '/probe') {
      const u = url.searchParams.get('u') || '';
      let h = ''; try { h = new URL(u).hostname; } catch {}
      if (!/(^|\.)(google\.com|bing\.com|gdeltproject\.org|duckduckgo\.com|nrk\.no|yahoo\.com|startpage\.com|brave\.com|qwant\.com|mojeek\.com|tv2\.no|nettavisen\.no|dagbladet\.no|abcnyheter\.no|guardianapis\.com|theguardian\.com|bbci\.co\.uk|bbc\.co\.uk|vg\.no|e24\.no|ntb\.no|msn\.com|reuters\.com|apnews\.com)$/.test(h)) return json({ error: 'host' }, 400, cors);
      const headers = {};
      if (url.searchParams.get('ua') !== '0') headers['User-Agent'] = url.searchParams.get('ua') === 'bot' ? 'SammeSak/1.0 (+https://khalm.github.io/SammeSak/)' : UA;
      if (url.searchParams.get('c') === '1') headers['Cookie'] = 'CONSENT=YES+cb.20240101-00-p0.en+FX+999; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg';
      const t0 = Date.now();
      try {
        const r = await fetch(u, { headers, redirect: url.searchParams.get('r') === '1' ? 'follow' : 'manual', signal: AbortSignal.timeout(8000) });
        const t = await r.text();
        return json({ status: r.status, ms: Date.now() - t0, len: t.length, rss: /<rss[\s>]/i.test(t), items: (t.match(/<item>/g) || []).length, sources: [...t.matchAll(/<item>[\s\S]*?<title>([^<]*)<\/title>[\s\S]*?<News:Source>([^<]*)<\/News:Source>/g)].map(m => m[2] + ' | ' + m[1].slice(0, 70)), start: t.slice(0, 300), find: url.searchParams.get('f') ? [...t.matchAll(new RegExp(url.searchParams.get('f'), 'g'))].slice(0, +(url.searchParams.get('n') || 5)).map(m => t.slice(m.index, m.index + +(url.searchParams.get('len') || 400))) : undefined, titles: [...t.matchAll(/<title>(?:<!\[CDATA\[)?([^<\]]*)/g)].slice(0, 8).map(m => m[1].slice(0, 60)), location: r.headers.get('location') || '', ct: r.headers.get('content-type') }, 200, cors);
      } catch (e) { return json({ error: String(e), ms: Date.now() - t0 }, 200, cors); }
    }
    // Bare appen din får bruke proxyen
    const origin = request.headers.get('Origin');
    if (url.pathname !== '/' && origin !== ALLOWED_ORIGIN && !(url.pathname === '/search' && !origin)) {
      return new Response('Forbidden', { status: 403, headers: cors });
    }
    try {
      if (url.pathname === '/news') {
        // Google blokkerer Cloudflare-servere, så nyhetssøket går via Bing Nyheter (RSS).
        // Bing gir bare RSS når den ikke later som den er en nettleser.
        const q = (url.searchParams.get('q') || '').replace(/\s*when:\d+d\s*/i, ' ').trim();
        const mkt = url.searchParams.get('hl') === 'no' ? 'nb-NO' : 'en-US';
        const res = await fetch('https://www.bing.com/news/search?' + new URLSearchParams({ q, format: 'rss', mkt, setlang: mkt.slice(0, 2) }), {
          headers: { 'User-Agent': BOT_UA }, signal: AbortSignal.timeout(8000), cf: { cacheTtl: 600, cacheEverything: true },
        });
        const xml = await res.text();
        return new Response(xml, { status: res.status, headers: { ...cors, 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'max-age=600', 'X-Source': 'bing' } });
      }

      if (url.pathname === '/search') {
        // Samlet nyhetssøk: flere Bing-søk (bredt + rettet mot gratis nettsteder) og NRKs nyeste saker
        const q = (url.searchParams.get('q') || '').trim();
        const q2 = (url.searchParams.get('q2') || '').trim();
        const names = (url.searchParams.get('names') || '').trim();
        const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'nb';
        if (!q) return json({ items: [] }, 400, cors);
        const jobs = [];
        const bing = (query, mkt) => jobs.push(bingSearch(query, mkt));
        if (lang === 'nb') {
          bing(q, 'nb-NO'); if (q2 && q2 !== q) bing(q2, 'nb-NO');
          bing(q + ' site:nrk.no', 'nb-NO'); if (q2 && q2 !== q) bing(q2 + ' site:nrk.no', 'nb-NO');
          bing(q + ' site:tv2.no', 'nb-NO');
          if (names) { bing(names, 'en-US'); bing(names + ' site:bbc.com', 'en-US'); }
          jobs.push(nrkFeeds(q + ' ' + q2));
        } else {
          bing(q, 'en-US'); if (q2 && q2 !== q) bing(q2, 'en-US');
          for (const site of ['bbc.com', 'theguardian.com', 'apnews.com', 'reuters.com']) bing(q + ' site:' + site, 'en-US');
          if (names) bing(names, 'nb-NO');
        }
        const lists = await Promise.allSettled(jobs);
        const seen = new Set(), items = [];
        for (const l of lists) if (l.status === 'fulfilled') for (const it of l.value) {
          const k = it.url.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '');
          if (seen.has(k)) continue; seen.add(k); items.push(it);
        }
        return json({ items, queries: jobs.length }, 200, { ...cors, 'Cache-Control': 'max-age=300' });
      }

      if (url.pathname === '/gdelt') {
        const res = await fetch('https://api.gdeltproject.org/api/v2/doc/doc?' + url.searchParams, {
          headers: { 'User-Agent': BOT_UA }, signal: AbortSignal.timeout(7000), cf: { cacheTtl: 600, cacheEverything: true },
        });
        return new Response(await res.text(), { status: res.status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
      }

      if (url.pathname === '/meta') {
        const target = url.searchParams.get('url') || '';
        if (!/^https?:\/\//i.test(target)) return json({ error: 'bad url' }, 400, cors);
        const res = await fetch(target, {
          headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.6' },
          redirect: 'follow', signal: AbortSignal.timeout(8000), cf: { cacheTtl: 3600, cacheEverything: true },
        });
        // Les bare starten av siden – metadata står i <head>
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let html = '';
        while (html.length < 400000) {
          const { done, value } = await reader.read();
          if (done) break;
          html += dec.decode(value, { stream: true });
          if (/<\/head>/i.test(html)) break;
        }
        reader.cancel().catch(() => {});
        const meta = (prop) => {
          const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
          const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
          const m = html.match(re1) || html.match(re2);
          return m ? decodeEntities(m[1]).trim() : '';
        };
        const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        return json({
          title: meta('og:title') || meta('twitter:title') || (t ? decodeEntities(t[1]).trim() : ''),
          description: meta('og:description') || meta('description') || meta('twitter:description'),
          published: meta('article:published_time') || meta('pubdate') || '',
          site: meta('og:site_name'),
          finalUrl: res.url,
        }, 200, cors);
      }
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502, cors);
    }
    return new Response('SammeSak-proxy v4 er oppe ✓', { status: 200, headers: cors });
  },
};

const NRK_FEEDS = ['toppsaker', 'nyheter/siste', 'norge/toppsaker', 'urix/toppsaker', 'sport/toppsaker', 'kultur/toppsaker',
  'okonomi/toppsaker', 'viten/toppsaker', 'ostfold/toppsaker', 'stor-oslo/toppsaker', 'innlandet/toppsaker', 'buskerud/toppsaker',
  'vestfoldogtelemark/toppsaker', 'sorlandet/toppsaker', 'rogaland/toppsaker', 'vestland/toppsaker', 'mr/toppsaker',
  'trondelag/toppsaker', 'nordland/toppsaker', 'tromsogfinnmark/toppsaker', 'sapmi/toppsaker'];

function rssItems(xml, fallbackSource) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const tag = (n) => { const r = it.match(new RegExp('<' + n + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + n + '>')); return r ? decodeEntities(r[1].replace(/<[^>]+>/g, '')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''; };
    let link = tag('link');
    try { const real = new URL(link).searchParams.get('url'); if (real && /^https?:/i.test(real)) link = real; } catch {}
    const title = tag('title');
    if (title && link) out.push({ title, url: link, source: tag('News:Source') || fallbackSource || '', desc: tag('description').slice(0, 300), date: tag('pubDate') });
  }
  return out;
}

async function bingSearch(query, mkt) {
  const res = await fetch('https://www.bing.com/news/search?' + new URLSearchParams({ q: query, format: 'rss', mkt, setlang: mkt.slice(0, 2) }), {
    headers: { 'User-Agent': BOT_UA }, signal: AbortSignal.timeout(7000), cf: { cacheTtl: 600, cacheEverything: true },
  });
  return rssItems(await res.text());
}

// NRKs nyeste saker – fanger opp ferske saker før søkemotorene har dem
async function nrkFeeds(words) {
  const stems = new Set(String(words).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3).map(w => w.slice(0, 5)));
  const lists = await Promise.allSettled(NRK_FEEDS.map(f => fetch('https://www.nrk.no/' + f + '.rss', {
    headers: { 'User-Agent': BOT_UA }, signal: AbortSignal.timeout(5000), cf: { cacheTtl: 300, cacheEverything: true },
  }).then(r => r.text()).then(x => rssItems(x, 'NRK').map(it => ({ ...it, via: 'NRK' })))));
  const out = [];
  for (const l of lists) if (l.status === 'fulfilled') for (const it of l.value) {
    const ws = (it.title + ' ' + it.desc).toLowerCase().split(/[^\p{L}\p{N}]+/u).map(w => w.slice(0, 5));
    if (ws.filter(w => stems.has(w)).length >= 2) out.push(it);
  }
  return out;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
}

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|aring|oslash|aelig|Aring|Oslash|AElig);/gi, (m, e) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aring: 'å', oslash: 'ø', aelig: 'æ', Aring: 'Å', Oslash: 'Ø', AElig: 'Æ' };
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return named[e] ?? named[e.toLowerCase()] ?? m;
  });
}
