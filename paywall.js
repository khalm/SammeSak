// paywall.js — hvilke nettsteder som er gratis, delvis bak betalingsmur, eller låst.
// Listen kan utvides fritt. Underdomener teller med (www.nrk.no → nrk.no).
//   free    = vanligvis gratis å lese
//   partial = noen saker er låst (f.eks. VG+, Dagbladet+, begrenset antall gratis)
//   paywall = de fleste saker krever abonnement

const PAYWALL_LIST = {
  free: [
    // Norge
    'nrk.no', 'tv2.no', 'abcnyheter.no', 'forskning.no', 'document.no', 'regjeringen.no',
    'kode24.no', 'p4.no', 'radionorge.no', 'nyheter24.no', 'filternyheter.no', 'kampanje.com', 'nab.no',
    'khrono.no', 'universitas.no', 'ntb.no',
    'yr.no', 'politiet.no', 'nordnorskdebatt.no',
    // Norden
    'svt.se', 'sverigesradio.se', 'dr.dk', 'tv2.dk', 'yle.fi', 'ruv.is', 'mbl.is', 'omni.se',
    // Internasjonalt
    'bbc.com', 'bbc.co.uk', 'theguardian.com', 'apnews.com', 'reuters.com', 'aljazeera.com', 'npr.org',
    'dw.com', 'france24.com', 'euronews.com', 'abc.net.au', 'cbc.ca', 'news.sky.com', 'independent.co.uk',
    'cbsnews.com', 'nbcnews.com', 'abcnews.go.com', 'pbs.org', 'axios.com', 'thehill.com', 'usatoday.com',
    'news.yahoo.com', 'yahoo.com', 'msn.com', 'rte.ie', 'tagesschau.de', 'zdf.de', 'n-tv.de', 'rfi.fr',
    'francetvinfo.fr', 'swissinfo.ch', 'nos.nl', 'euronews.com', 'politico.eu', 'arstechnica.com',
    'theverge.com', 'techcrunch.com', 'engadget.com', 'nasa.gov', 'un.org', 'voanews.com', 'cnbc.com',
    'theconversation.com', 'propublica.org', 'vox.com', 'time.com', 'newsweek.com', 'foxnews.com',
    'aa.com.tr', 'scmp.com', 'japantimes.co.jp', 'thelocal.se', 'thelocal.dk', 'news.un.org', 'cnn.com',
  ],
  partial: [
    'vg.no', 'dagbladet.no', 'nettavisen.no', 'dagsavisen.no', 'altinget.no', 'e24.no', 'tu.no', 'digi.no', 'thelocal.no', 'sysla.no', 'dagens.no',
    'aftonbladet.se', 'expressen.se', 'ekstrabladet.dk', 'bt.dk', 'iltalehti.fi', 'is.fi',
    'spiegel.de', 'zeit.de', 'stern.de', 'welt.de', 'lemonde.fr', 'lefigaro.fr', 'liberation.fr',
    'elpais.com', 'corriere.it', 'repubblica.it', 'politico.com', 'forbes.com', 'wired.com',
    'theatlantic.com', 'newyorker.com', 'vanityfair.com', 'businessinsider.com', 'insider.com',
    'latimes.com', 'telegraph.co.uk', 'thetimes.com', 'nzherald.co.nz', 'smh.com.au', 'theage.com.au',
    'haaretz.com', 'timesofisrael.com', 'irishtimes.com', 'nationalgeographic.com', 'medium.com',
    'fortune.com', 'theinformation.com', 'foreignpolicy.com', 'newscientist.com', 'scientificamerican.com',
  ],
  paywall: [
    // Norge – riksaviser
    'aftenposten.no', 'dn.no', 'finansavisen.no', 'morgenbladet.no', 'klassekampen.no', 'dagensperspektiv.no',
    'kapital.no', 'minerva.no', 'fiskeribladet.no', 'intrafish.no', 'upstreamonline.com', 'rechargenews.com',
    'tradewindsnews.com', 'europower.no', 'kommunal-rapport.no', 'medier24.no', 'shifter.no',
    'hegnar.no', 'nationen.no', 'bondebladet.no', 'dagenno.no', 'dagen.no', 'vartland.no', 'subjekt.no', 'rett24.no', 'agendamagasin.no',
    // Norge – regionaviser og lokalaviser
    'bt.no', 'aftenbladet.no', 'adressa.no', 'fvn.no', 'an.no', 'ba.no', 'h-avis.no', 'rb.no', 'ta.no',
    'tb.no', 'oa.no', 'smp.no', 'glomdalen.no', 'ostlendingen.no', 'nordlys.no', 'itromso.no', 'ifinnmark.no',
    'ao.no', 'agderposten.no', 'op.no', 'hamar-dagblad.no', 'ringblad.no', 'gd.no', 'oppland-arbeiderblad.no',
    'budstikka.no', 'dt.no', 'varden.no', 'laagendalsposten.no', 'tvedestrandsposten.no', 'lofotposten.no',
    'vol.no', 'avisa-hordaland.no', 'sunnmorsposten.no', 'rbnett.no', 'tk.no',
    'avisenagder.no', 'moss-avis.no', 'f-b.no', 'sa.no', 'ga.no', 'jarlsbergavis.no', 'gjengangeren.no',
    'helgelendingen.no', 'folkebladet.no', 'avisa-nordland.no', 'an.no', 'opp.no', 'nordlys.no', 'altaposten.no', 'finnmarkdagblad.no', 'sortlandsavis.no', 'vesteraalen.no', 'banett.no', 'an.no', 'ranablad.no', 'fremover.no', 'hardanger-folkeblad.no',
    'kvinnheringen.no', 'haugesunds-avis.no', 'h-a.no', 'sandnesposten.no', 'jbl.no', 'dalane-tidende.no',
    'fjt.no', 'firda.no', 'firdaposten.no', 'sognavis.no', 'porsgrunnsdagblad.no', 'kv.no', 'retten.no',
    'tidens-krav.no', 'driva.no', 'namdalsavisa.no', 'tronderavisa.no', 'tronderbladet.no', 'innherred.no',
    'romerikes-blad.no', 'rha.no', 'indre.no', 'bygdeposten.no', 'eub.no', 'akersposten.no', 'nordstrands-blad.no',
    'oyene.no', 'lokalavisa.no', 'enebakkavis.no', 'vestlandsnytt.no', 'grimstad-adressetidende.no',
    'lister24.no', 'l-a.no', 'farsundsavis.no', 'fvn.no', 'smaalenene.no',
    // Norden
    'dn.se', 'svd.se', 'gp.se', 'sydsvenskan.se', 'di.se', 'hd.se', 'berlingske.dk', 'politiken.dk',
    'jp.dk', 'borsen.dk', 'information.dk', 'weekendavisen.dk', 'hs.fi', 'kauppalehti.fi',
    // Internasjonalt
    'nytimes.com', 'wsj.com', 'ft.com', 'washingtonpost.com', 'economist.com', 'bloomberg.com',
    'barrons.com', 'theathletic.com', 'bostonglobe.com', 'theaustralian.com.au', 'afr.com',
    'sueddeutsche.de', 'faz.net', 'handelsblatt.com', 'nzz.ch', 'lesechos.fr', 'mediapart.fr',
    'marketwatch.com', 'seekingalpha.com', 'stratechery.com', 'thetimes.co.uk', 'spectator.co.uk',
    'newstatesman.com', 'harpers.org', 'nybooks.com', 'chronicle.com', 'hbr.org', 'technologyreview.com',
    'nikkei.com', 'asia.nikkei.com', 'globeandmail.com', 'thestar.com', 'sfchronicle.com',
    'chicagotribune.com', 'miamiherald.com', 'seattletimes.com', 'startribune.com', 'denverpost.com',
    'nationalpost.com', 'lastampa.it', 'elmundo.es', 'expansion.com', 'derstandard.at', 'diepresse.com',
  ],
};

const PAYWALL_MAP = (() => {
  const m = new Map();
  for (const [kind, list] of Object.entries(PAYWALL_LIST)) for (const d of list) m.set(d, kind);
  return m;
})();

/** Rent domene uten www./m./amp. */
function cleanDomain(host) {
  return String(host || '').toLowerCase().replace(/^(www\d?|m|amp|mobil|mobile)\./, '').replace(/\.$/, '');
}

/** 'free' | 'partial' | 'paywall' | 'unknown' */
function paywallStatus(host) {
  let d = cleanDomain(host);
  while (d && d.includes('.')) {
    if (PAYWALL_MAP.has(d)) return PAYWALL_MAP.get(d);
    d = d.slice(d.indexOf('.') + 1);
  }
  return 'unknown';
}

const PAYWALL_LABEL = {
  free: { text: 'Gratis', icon: '🟢' },
  unknown: { text: 'Ukjent', icon: '⚪' },
  partial: { text: 'Delvis betalingsmur', icon: '🟡' },
  paywall: { text: 'Betalingsmur', icon: '🔒' },
};

if (typeof module !== 'undefined') module.exports = { paywallStatus, cleanDomain, PAYWALL_LABEL, PAYWALL_LIST };
