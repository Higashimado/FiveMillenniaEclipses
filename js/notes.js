/** notes.js — Renders a record's `notes` units into numbered, anchored note sentences.

   Pure, and shared by the page and the build. A unit names its type, sub-case and slots; the
   sentence comes from the locale's `note.*` keys, every name from data/concordance/.
*/
const Notes = (() => {
  'use strict';

  // ---- Unit Table ----

  // type -> sub-case -> slot list. A trailing `?` marks an optional slot; a type with one
  // sub-case names it after the type and units of that type may omit `sub`.
  const TYPES = {
    calendar_gloss: {
      epoch: ['calendar'],
      // refer marks an anchor that only points at the month (本月, this month): the sentence
      // names the month before explaining it.
      month: ['calendar', 'month', 'span?', 'refer?'],
      used: ['calendar', 'region?', 'until?'],
      dual: ['author', 'calendar'],
    },
    emendation: {
      replace: ['wrong', 'right', 'ref?', 'hedge?', 'cause?'],
      // Without `right` the missing words are unknown, and the gap is placed after the anchor.
      omit: ['anchor', 'right?', 'ref?'],
      // premise states what the cited work found, when the addition alone gives no reason.
      interpolate: ['wrong', 'ref?', 'premise?'],
      misprint: ['wrong'],
      misread: ['wrong', 'right', 'wrong_sense', 'right_sense'],
      spurious: ['fact', 'wrong', 'ref?'],
      conflation: ['right', 'part', 'wrong', 'ref?'],
    },
    glossary_term: { term: ['term'] },
    source_notation: {
      symbol: ['sign?', 'meaning'],
      lacuna: ['what', 'mark?'],
      figure: ['figure'],
    },
    date_basis: {
      inferred: ['field', 'basis', 'work?'],
      // value names the place, and only a unit anchored on the place carries it; others lists
      // the datings the cited work does not follow.
      authority: ['work', 'value?', 'others?'],
    },
    time_reckoning: {
      sunset: ['calendar'],
      noon_counted: ['observer', 'stated', 'actual'],
      time_scale: ['place', 'scale', 'astronomical?'],
      day_hour: ['hour'],
      night_hour: ['hour'],
    },
    entity_gloss: {
      role: ['role'],
      description: ['description', 'ref?'],
      nature: ['description', 'subject?'],
      unclear: ['word'],
    },
    computation_check: {
      claim: ['by', 'fact', 'claim'],
      // affirm turns the verdict around: the subject is the value, not a different one.
      verdict: ['by', 'subject', 'value', 'affirm?'],
      wrong_night: ['predictor', 'event'],
      unseen: ['by', 'period', 'eclipse'],
      absent: ['by', 'period', 'missing', 'conclusion?'],
      distance: ['by', 'object', 'star', 'deg', 'word?'],
    },
    // A series is a work's list of eclipses or the eclipses of one year.
    related_record: { series: ['series?', 'year?', 'total', 'kind', 'index'] },
    historical_context: { context: ['when', 'event'] },
    scholarly_view: { view: ['who', 'view'] },
    variant_reading: { variant: ['witness', 'variant', 'sense?'], adopted: ['witness', 'variant', 'adopted_from'] },
  };

  // One kind per slot name. orig: a quotation from the source, never translated; text: a
  // seven-locale map or a table key (see named); person, work, place: a table key or a map;
  // enum: a note.enum.<slot> key.
  const KIND = {
    wrong: 'orig',
    right: 'orig',
    part: 'orig',
    anchor: 'orig',
    word: 'orig',
    variant: 'orig',
    calendar: 'calendar',
    term: 'term',
    ref: 'work',
    work: 'work',
    witness: 'work',
    adopted_from: 'work',
    series: 'work',
    others: 'others',
    observer: 'person',
    author: 'person',
    predictor: 'person',
    place: 'place',
    cause: 'enum',
    field: 'enum',
    mark: 'enum',
    scale: 'enum',
    eclipse: 'enum',
    by: 'by',
    hedge: 'bool',
    astronomical: 'bool',
    refer: 'bool',
    affirm: 'bool',
    month: 'num',
    deg: 'num',
    total: 'num',
    index: 'num',
    year: 'num',
    until: 'num',
    hour: 'num',
  };

  const LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'fr', 'es', 'it', 'ja'];
  const ANCHORS = ['place', 'year', 'source', 'record'];

  // Han-script locales consult each other before English; western locales stop at English.
  const CHAIN = {
    'zh-Hans': ['zh-Hans', 'zh-Hant', 'en'],
    'zh-Hant': ['zh-Hant', 'zh-Hans', 'en'],
    ja: ['ja', 'zh-Hant', 'zh-Hans', 'en'],
    en: ['en'],
    fr: ['fr', 'en'],
    es: ['es', 'en'],
    it: ['it', 'en'],
  };

  // Intl locale for dates and month names: British English writes "23 November".
  const INTL = { en: 'en-GB' };

  let D = { calendars: {}, terms: {}, sources: {}, persons: {}, bodies: {}, stars: {}, places: {} };

  /**
   * Supply the concordance tables the slots resolve against.
   * @param {{calendars?:Object, terms?:Object, sources?:Object, persons?:Object, bodies?:Object,
   *   stars?:Object, places?:Object}} d
   */
  function setData(d) {
    D = Object.assign(
      { calendars: {}, terms: {}, sources: {}, persons: {}, bodies: {}, stars: {}, places: {} },
      d || {}
    );
    calNames = {};
    unitNames = {};
  }

  // ---- Small Helpers ----

  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const isCjk = (lang) => lang === 'zh-Hans' || lang === 'zh-Hant' || lang === 'ja';
  const isZh = (lang) => lang === 'zh-Hans' || lang === 'zh-Hant';

  // Chinese notes print numbers in Han numerals, as the Chinese translations do; a record whose
  // translation prints Arabic years (a modern report) keeps Arabic numerals in its notes too.
  // render() sets this per record.
  let latinDigits = false;
  const hanOn = (lang) => isZh(lang) && !latinDigits;
  const HAN = /[㐀-鿿]/;

  function pick(map, lang) {
    if (!map || typeof map !== 'object') return '';
    for (const k of CHAIN[lang] || CHAIN.en) if (map[k]) return map[k];
    return '';
  }

  // ---- Numbers ----

  const HAN_DIGIT = '〇一二三四五六七八九';

  function hanNumber(n) {
    if (n < 10) return HAN_DIGIT[n];
    if (n < 20) return '十' + (n % 10 ? HAN_DIGIT[n % 10] : '');
    if (n < 100) return HAN_DIGIT[Math.floor(n / 10)] + '十' + (n % 10 ? HAN_DIGIT[n % 10] : '');
    return hanCount(n);
  }

  const YEAR_SLOTS = ['year', 'until'];

  // A number slot in Han numerals: a year digit by digit from a hundred up (八一〇, 810), a
  // decimal with 点 (point), 點 (point) in zh-Hant (零点六, 0.6), any other count in words (一百零四, 104).
  function hanQuantity(slot, v, lang) {
    if (typeof v !== 'number') return String(v);
    if (YEAR_SLOTS.indexOf(slot) >= 0) return v >= 100 ? hanDigits(v) : hanNumber(v);
    if (!Number.isInteger(v)) {
      const [i, f] = String(v).split('.');
      return (i === '0' ? '零' : hanCount(+i)) + (lang === 'zh-Hant' ? '點' : '点') + hanDigits(f);
    }
    return hanCount(v);
  }

  const HAN_VALUE = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 正: 1, 元: 1 };

  // Han numerals below a hundred, the forms a year or month count takes, including the
  // contracted twenty and thirty.
  function hanValue(s) {
    if (!s) return null;
    if (s.length === 1 && s in HAN_VALUE) return HAN_VALUE[s];
    const m = s.match(/^([一二三四五六七八九])?(十|廿|卅)([一二三四五六七八九])?$/);
    if (!m) return null;
    const tens = m[2] === '廿' ? 2 : m[2] === '卅' ? 3 : m[1] ? HAN_VALUE[m[1]] : 1;
    return tens * 10 + (m[3] ? HAN_VALUE[m[3]] : 0);
  }

  const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const EN_TEENS = [
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ];
  const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const EN_ORD = {
    one: 'first',
    two: 'second',
    three: 'third',
    five: 'fifth',
    eight: 'eighth',
    nine: 'ninth',
    twelve: 'twelfth',
  };

  function enCardinal(n) {
    if (n < 10) return EN_ONES[n];
    if (n < 20) return EN_TEENS[n - 10];
    return EN_TENS[Math.floor(n / 10)] + (n % 10 ? '-' + EN_ONES[n % 10] : '');
  }

  function enOrdinal(n) {
    const c = enCardinal(n);
    const parts = c.split('-');
    const last = parts.pop();
    const o = EN_ORD[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
    return parts.concat(o).join('-');
  }

  const FR_ONES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
  const FR_TEENS = [
    'dix',
    'onze',
    'douze',
    'treize',
    'quatorze',
    'quinze',
    'seize',
    'dix-sept',
    'dix-huit',
    'dix-neuf',
  ];
  const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', '', 'quatre-vingt', ''];

  function frCardinal(n) {
    if (n < 10) return FR_ONES[n];
    if (n < 20) return FR_TEENS[n - 10];
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (t === 7 || t === 9) {
      const base = t === 7 ? 'soixante' : 'quatre-vingt';
      return base + (t === 7 && u === 1 ? ' et ' : '-') + FR_TEENS[u];
    }
    if (u === 0) return FR_TENS[t] + (t === 8 ? 's' : '');
    return FR_TENS[t] + (u === 1 && t !== 8 ? ' et un' : '-' + FR_ONES[u]);
  }

  function frOrdinal(n, fem) {
    if (n === 1) return fem ? 'première' : 'premier';
    let c = frCardinal(n).replace(/vingts$/, 'vingt');
    if (/cinq$/.test(c)) return c + 'uième';
    if (/neuf$/.test(c)) return c.slice(0, -1) + 'vième';
    if (/e$/.test(c)) c = c.slice(0, -1);
    return c + 'ième';
  }

  const ES_CARD = [
    '',
    'uno',
    'dos',
    'tres',
    'cuatro',
    'cinco',
    'seis',
    'siete',
    'ocho',
    'nueve',
    'diez',
    'once',
    'doce',
    'trece',
    'catorce',
    'quince',
    'dieciséis',
    'diecisiete',
    'dieciocho',
    'diecinueve',
    'veinte',
  ];
  const ES_TENS = ['', '', 'veinti', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const ES_ORD = ['', 'primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno'];
  const ES_ORD_TENS = [
    '',
    'décimo',
    'vigésimo',
    'trigésimo',
    'cuadragésimo',
    'quincuagésimo',
    'sexagésimo',
    'septuagésimo',
    'octogésimo',
    'nonagésimo',
  ];
  const ES_VEINTI = { 2: 'veintidós', 3: 'veintitrés', 6: 'veintiséis' };

  function esCardinal(n) {
    if (n <= 20) return ES_CARD[n];
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (t === 2) return ES_VEINTI[u] || 'veinti' + ES_CARD[u];
    return ES_TENS[t] + (u ? ' y ' + ES_CARD[u] : '');
  }

  // Masculine forms drop the final -o before the noun (primer año, tercer mes); an ordinal
  // standing alone (es el primero de los dos) keeps it, which `alone` asks for.
  function esOrdinal(n, fem, alone) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    let unit = u ? ES_ORD[u] : '';
    if (n === 11) return fem ? 'undécima' : 'undécimo';
    if (n === 12) return fem ? 'duodécima' : 'duodécimo';
    if (!fem && !alone && (u === 1 || u === 3)) unit = unit.slice(0, -1);
    if (fem) unit = unit.replace(/o$/, 'a');
    if (!t) return unit;
    let tens = ES_ORD_TENS[t];
    if (fem) tens = tens.replace(/o$/, 'a');
    if (t === 1 && u) return tens.replace('décim', 'decim') + unit;
    return u ? tens + ' ' + unit : tens;
  }

  const IT_CARD = [
    '',
    'uno',
    'due',
    'tre',
    'quattro',
    'cinque',
    'sei',
    'sette',
    'otto',
    'nove',
    'dieci',
    'undici',
    'dodici',
    'tredici',
    'quattordici',
    'quindici',
    'sedici',
    'diciassette',
    'diciotto',
    'diciannove',
  ];
  const IT_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
  const IT_ORD = ['', 'primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto', 'settimo', 'ottavo', 'nono', 'decimo'];

  function itCardinal(n) {
    if (n < 20) return IT_CARD[n];
    const t = Math.floor(n / 10);
    const u = n % 10;
    let tens = IT_TENS[t];
    if (u === 1 || u === 8) tens = tens.slice(0, -1);
    return tens + (u ? (u === 3 ? 'tré' : IT_CARD[u]) : '');
  }

  function itOrdinal(n, fem) {
    let o;
    if (n <= 10) o = IT_ORD[n];
    else {
      const c = itCardinal(n).replace(/tré$/, 'tre');
      o = /(tre|sei)$/.test(c) ? c + 'esimo' : c.slice(0, -1) + 'esimo';
    }
    return fem ? o.slice(0, -1) + 'a' : o;
  }

  // A count of things as the locale writes it in running prose.
  function cardinal(n, lang) {
    if (isZh(lang)) return hanNumber(n);
    if (lang === 'ja' || n > 99 || n < 1) return String(n);
    if (lang === 'en') return enCardinal(n);
    if (lang === 'fr') return frCardinal(n);
    if (lang === 'es') return esCardinal(n);
    if (lang === 'it') return itCardinal(n);
    return String(n);
  }

  function ordinal(n, lang, fem) {
    if (isZh(lang)) return hanNumber(n);
    if (lang === 'ja' || n > 99 || n < 1) return String(n);
    if (lang === 'en') return enOrdinal(n);
    if (lang === 'fr') return frOrdinal(n, fem);
    if (lang === 'es') return esOrdinal(n, fem);
    if (lang === 'it') return itOrdinal(n, fem);
    return String(n);
  }

  // ---- Dates ----

  function _date(m, d) {
    const x = new Date(0);
    x.setUTCFullYear(2000, m - 1, d || 1);
    return x;
  }

  // Intl writes the Chinese month with a Han numeral in zh-Hans but a digit in zh-Hant; both
  // tracks take the Han numeral.
  function monthName(m, lang) {
    if (isZh(lang)) return hanNumber(m) + '月';
    return new Intl.DateTimeFormat(INTL[lang] || lang, { month: 'long', timeZone: 'UTC' }).format(_date(m));
  }

  // ---- Slot Values ----

  // Source quotations take the locale's own marks. A print's ASCII minute and second signs
  // after a digit (2° 25' 20") read as primes (2° 25′ 20″), and a straight " left inside an
  // English quotation becomes the inner single mark.
  function quote(s, lang) {
    const v = esc(
      String(s)
        .replace(/(\d)'(?=[\s\d]|$)/g, '$1′')
        .replace(/(\d)"(?=[\s\d,.;]|$)/g, '$1″')
    );
    if (isCjk(lang)) return '「' + v.replace(/「/g, '『').replace(/」/g, '』') + '」';
    if (lang === 'fr') return '« ' + v + ' »';
    if (lang === 'es' || lang === 'it') return '«' + v + '»';
    return '"' + v.replace(/"/g, "'") + '"';
  }

  const STEMS = '甲乙丙丁戊己庚辛壬癸';
  const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
  const HAN_DATE =
    /^(?:([元正一二三四五六七八九十廿卅]+)年)?(閏|闰)?(?:([正一二三四五六七八九十]+)月)?(?:([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])日?)?$/;

  // Position of a stem-branch pair in the sexagenary cycle, 1 for 甲子 (jiazi).
  function cycleIndex(gz) {
    const s = STEMS.indexOf(gz[0]);
    const b = BRANCHES.indexOf(gz[1]);
    for (let i = 0; i < 60; i++) if (i % 10 === s && i % 12 === b) return i + 1;
    return null;
  }

  // A western reader cannot read a Han date, so a quoted year, month or cyclical day is
  // followed by its reading in parentheses: "十一月乙卯" (eleventh month, cyclical day 52).
  function hanDateGloss(s, lang, tr) {
    const m = String(s).match(HAN_DATE);
    if (!m || !(m[1] || m[3] || m[4])) return '';
    const parts = [];
    if (m[1]) {
      const n = hanValue(m[1]);
      if (n == null) return '';
      parts.push(fill(tr('note.gloss.year'), { ordinal: ordinal(n, lang), ordinal_f: ordinal(n, lang, true) }));
    }
    if (m[3]) {
      const n = hanValue(m[3]);
      if (n == null) return '';
      const key = m[2] ? 'note.gloss.leap_month' : 'note.gloss.month';
      parts.push(fill(tr(key), { ordinal: ordinal(n, lang), ordinal_f: ordinal(n, lang, true) }));
    }
    if (m[4]) parts.push(fill(tr('note.gloss.cyclical'), { n: String(cycleIndex(m[4])) }));
    return parts.join(tr('note.gloss.sep') || ', ');
  }

  // An entry of xingguan.json by its key, its Chinese name in Han script. A single star takes
  // its IAU proper name elsewhere; an asterism takes 「Rom (gloss)」, as the map labels write it,
  // with 'the' before the English gloss and the bare rom when the gloss only repeats it.
  function starNames(key) {
    const e = D.stars[key];
    if (!e) return null;
    const han = { 'zh-Hans': key, 'zh-Hant': e.hant || key };
    if (e.kind === 'star') return e.modern && e.modern.proper ? { ...han, ...e.modern.proper } : null;
    if (!e.rom) return null;
    const out = { ...han, ja: e.ja || e.hant || key };
    for (const lang of ['en', 'fr', 'es', 'it']) {
      const gloss = e[lang] || e.en;
      const g = (gloss || '').toLowerCase();
      if (!g || g === e.rom.toLowerCase() || g === 'the ' + e.rom.toLowerCase()) out[lang] = e.rom;
      else if (lang === 'en' && !/^(the|a|an)\s/i.test(gloss)) out[lang] = `${e.rom} (the ${gloss})`;
      else out[lang] = `${e.rom} (${gloss})`;
    }
    return out;
  }

  // A seven-locale value a table already holds is stored as its key: a body (bodies.json), a
  // star (xingguan.json), a person (persons.json) or a word a note prints as it stands
  // (terms.json); anything else is printed as written.
  function named(v, lang) {
    if (typeof v !== 'string') return pick(v, lang);
    const row = D.bodies[v] || starNames(v) || D.persons[v] || (D.terms[v] && D.terms[v].gloss);
    return row ? pick(row, lang) : v;
  }

  function origValue(unit, slot, lang, tr) {
    const s = unit[slot];

    // A quotation from a Latin-script source reads in the reader's language when glossed.
    if (!HAN.test(s) && unit[slot + '_gloss']) return quote(named(unit[slot + '_gloss'], lang), lang);
    const gloss = named(unit[slot + '_gloss'], lang);

    // A Han quotation reads in the reader's own script: 閏月 (intercalary month) shows as
    // 闰月 (intercalary month) in zh-Hans.
    if (isCjk(lang)) return quote(gloss && HAN.test(gloss) ? gloss : s, lang);
    let out = quote(s, lang);
    if (!HAN.test(s)) return out;
    const g = gloss ? esc(gloss) : hanDateGloss(s, lang, tr);
    if (g) out += ' (' + g + ')';
    return out;
  }

  function personValue(v, lang) {
    return esc(named(v, lang));
  }

  // French, Spanish and Italian calendar names come with their definite article, chosen by
  // the gender calendars.json records, and an ART mark that contract() uses to fuse a
  // preceding preposition with it (de + le = du).
  const ART = '';
  const ROMANCE = { fr: ['le ', 'la ', "l'"], es: ['el ', 'la ', null], it: ['il ', 'la ', "l'"] };
  const CONTRACT = {
    fr: [
      [/(?<!\p{L})([dD])e (?=[aeiouàâéèêëîïôöùûü])/gu, (m, p) => p + "'"],
      [/(?<!\p{L})([dD]e) (le|les) /gu, (m, p, a) => (p === 'De' ? 'D' : 'd') + (a === 'le' ? 'u ' : 'es ')],
      [/(?<!\p{L})([àÀ]) (le|les) /gu, (m, p, a) => (p === 'À' ? 'A' : 'a') + (a === 'le' ? 'u ' : 'ux ')],
    ],
    es: [[/(?<!\p{L})([dD]e|[aA]) el /gu, (m, p) => p + 'l ']],
    it: [
      [/(?<!\p{L})([dD]i|[aA]|[dD]a|[iI]n|[sS]u) (il |la |l'|i |gli |le |lo )/gu, (m, p, a) => itPrep(p) + IT_ART[a]],
    ],
  };

  const IT_ART = { 'il ': 'l ', 'la ': 'lla ', "l'": "ll'", 'i ': 'i ', 'gli ': 'gli ', 'le ': 'lle ', 'lo ': 'llo ' };

  function itPrep(p) {
    const base = { di: 'de', a: 'a', da: 'da', in: 'ne', su: 'su' }[p.toLowerCase()];
    return p[0] === p[0].toUpperCase() ? base[0].toUpperCase() + base.slice(1) : base;
  }

  function contract(html, lang) {
    for (const [re, fn] of CONTRACT[lang] || []) html = html.replace(re, fn);
    return html.replace(//g, '');
  }

  function calendarValue(key, lang) {
    const c = D.calendars[key];
    const name = c ? pick(c.name, lang) : key;
    const art = ROMANCE[lang];
    if (art) {
      const noun = name.charAt(0).toLowerCase() + name.slice(1);
      const fem = ((c && c.gender) || {})[lang] === 'f';
      const elide = art[2] && /^[aeiouàâéèêëîïôöùûüh]/i.test(noun);
      return ART + (elide ? art[2] : fem ? art[1] : art[0]) + esc(noun);
    }

    // English lowercases only the generic head word (the era of Alexander) and keeps a
    // proper adjective (Hijri calendar).
    return esc(lang === 'en' && /^Era\b/.test(name) ? 'e' + name.slice(1) : name);
  }

  // The title a locale prints: its own form, then the Han forms a Chinese or Japanese reader
  // falls back to, then the Latin-script title (rom) and the English one.
  function workTitle(title, lang) {
    const han = { 'zh-Hans': ['zh-Hant'], 'zh-Hant': ['zh-Hans'], ja: ['zh-Hant', 'zh-Hans'] }[lang] || [];
    for (const k of [...(lang === 'en' ? [] : [lang]), ...han, 'rom', 'en']) if (title[k]) return title[k];
    return '';
  }

  // A work cited in a note: Han titles take 《》 in Chinese and 『』 in Japanese, a western
  // title is set in italics, and an article's title is quoted in roman type. Chinese and
  // Japanese have no quotation marks for a Latin-script title, so it is set in italics there.
  function workValue(v, lang) {
    // Chinese and Japanese run titles together with no separator; a western list joins them.
    if (Array.isArray(v)) {
      const items = v.map((x) => workValue(x, lang));
      return isCjk(lang)
        ? items.join('')
        : new Intl.ListFormat(INTL[lang] || lang, { type: 'conjunction' }).format(items);
    }

    // A witness that is no catalogued work (the base text's own collation note) is a phrase.
    if (v && typeof v === 'object' && !v.source) return esc(pick(v, lang));
    const key = v && typeof v === 'object' ? v.source : v;
    const src = D.sources[key];
    let title = src ? workTitle(src.title || {}, lang) : '';
    const form = (src && src.form) || 'book';
    if (!title) return esc(key);

    // The consulted edition's url links the title, so the cited work can be found again.
    return linkToWork(src, markTitle(title, form, lang));
  }

  function linkToWork(src, html) {
    const ed = ((src && src.editions) || []).find((e) => e.consulted);
    if (!ed || !ed.url) return html;
    return '<a class="wlink" href="' + esc(ed.url) + '" target="_blank" rel="noopener">' + html + '</a>';
  }

  // The datings an authority note does not follow: a seven-locale phrase, the same phrase
  // linked to a work ({text, work}), or a list of {value, work} pairs whose work is linked
  // like any cited title.
  function othersValue(v, lang, tr) {
    if (v && typeof v === 'object' && !Array.isArray(v) && v.work) {
      return linkToWork(D.sources[v.work], esc(pick(v.text, lang)));
    }
    if (!Array.isArray(v)) return esc(named(v, lang));
    const item = tr('note.date_basis.authority.other_item');
    return v
      .map((x) => fill(item, { value: esc(named(x.value, lang)), work: workValue(x.work, lang) }))
      .join(isCjk(lang) ? '、' : '; ');
  }

  // sources.json writes a Han title with its own 《》 and a chapter title in Chicago form,
  // Suishu, "Tianwen zhi": the marks are this function's to add.
  function markTitle(title, form, lang) {
    title = title.replace(/^《(.*)》$/, '$1');
    if (form === 'edition' || form === 'cite') return esc(title);
    const han = HAN.test(title) || /[\p{sc=Hira}\p{sc=Kana}]/u.test(title);
    if (form === 'article') return quote(title, lang);
    if (isCjk(lang) && !han) return '<i>' + esc(title) + '</i>';
    const part = !han && title.match(/^(.+?), "(.+)"$/);
    if (part) return '<i>' + esc(part[1]) + '</i>, ' + quote(part[2], lang);

    // Japanese sets the book alone in 『』 and runs the treatise after it: 『隋書』天文志 (the
    // Astronomical Treatise of the Book of Sui).
    if (han && lang === 'ja') {
      const dot = title.indexOf('·');
      return dot > 0 ? '『' + esc(title.slice(0, dot)) + '』' + esc(title.slice(dot + 1)) : '『' + esc(title) + '』';
    }
    if (han && isCjk(lang)) return '《' + esc(title) + '》';
    return '<i>' + esc(title) + '</i>';
  }

  // A Romance enum phrase may carry its article (le lieu d'observation); the ART mark lets
  // a preposition before it contract (du lieu d'observation).
  function enumValue(slot, v, lang, tr) {
    const mark = ROMANCE[lang] ? ART : '';
    if (Array.isArray(v)) {
      const items = v.map((x) => tr('note.enum.' + slot + '.' + x) || x);
      return mark + esc(new Intl.ListFormat(INTL[lang] || lang, { type: 'conjunction' }).format(items));
    }
    return mark + esc(tr('note.enum.' + slot + '.' + v) || v);
  }

  // The lead phrase that names the basis of a computation check.
  function byValue(v, lang, tr) {
    if (v === 'computation' || v === 'prediction') return tr('note.lead.' + v);
    return fill(tr('note.lead.according'), { work: workValue(v, lang) });
  }

  function slotValue(unit, slot, lang, tr) {
    const v = unit[slot];
    if (v == null || v === '') return '';
    switch (KIND[slot] || 'text') {
      case 'orig':
        return origValue(unit, slot, lang, tr);
      case 'calendar':
        return calendarValue(v, lang);
      case 'term':
        return esc(D.terms[v] ? pick(D.terms[v].gloss, lang) : v);
      case 'work':
        return workValue(v, lang);
      case 'others':
        return othersValue(v, lang, tr);
      case 'person':
        return personValue(v, lang);
      case 'place':
        return esc(typeof v === 'string' ? (D.places[v] && pick(D.places[v].name, lang)) || v : pick(v, lang));
      case 'enum':
        return enumValue(slot, v, lang, tr);
      case 'by':
        return byValue(v, lang, tr);
      case 'bool':
        return v ? '1' : '';
      case 'num':
        return hanOn(lang)
          ? hanQuantity(slot, v, lang)
          : v.toLocaleString(lang, { useGrouping: false, maximumFractionDigits: 6 });
      default:
        return esc(named(v, lang));
    }
  }

  // ---- Sentence Assembly ----

  // A placeholder the values do not supply is left standing, so render-notes can report it.
  // {name:f} asks for the feminine form where the locale has one (première, primera).
  function fill(pattern, vals) {
    return String(pattern || '').replace(/\{(\w+)(?::(f))?\}/g, (m, k, f) => {
      if (f && k + '_f' in vals) return vals[k + '_f'];
      return k in vals ? vals[k] : m;
    });
  }

  // Chinese running text keeps one space between Han and a Latin letter or digit (the
  // han-latin-spacing-zh rule), applied after assembly so every slot joint is covered;
  // markup between the two sides does not count as a separator.
  function spaceHanLatin(html) {
    return html
      .replace(/([㐀-鿿])((?:<[^>]+>)*)([A-Za-z0-9])/g, '$1 $2$3')
      .replace(/([A-Za-z0-9])((?:<\/[^>]+>)*)([㐀-鿿])/g, '$1$2 $3');
  }

  // A western sentence begins with a capital, whichever slot or lead opened it.
  function capitalize(html) {
    return html.replace(/^((?:<[^>]+>|["«  ])*)(\p{Ll})/u, (m, pre, c) => pre + c.toUpperCase());
  }

  function subOf(unit) {
    const subs = TYPES[unit.type];
    if (!subs) return null;
    if (unit.sub) return subs[unit.sub] ? unit.sub : null;
    const names = Object.keys(subs);
    return names.length === 1 ? names[0] : null;
  }

  // The sentence key for a unit; a few sub-cases pick a variant from their data.
  function patternKey(unit, sub) {
    const base = 'note.' + unit.type + '.' + sub;
    if (unit.type === 'calendar_gloss' && sub === 'month') {
      const ref = unit.refer ? '_ref' : '';
      if (unit.span) return base + ref + '_approx';
      return base + ref + (julianOf(unit) ? '' : '_bare');
    }
    if (unit.type === 'date_basis' && sub === 'authority' && unit.at === 'place') return base + '_place';
    if (unit.hedge && sub === 'replace') return base + '_hedged';
    if (sub === 'omit' && !unit.right) return base + '_unknown';
    if (sub === 'nature' && unit.subject) return base + '_subject';
    if (sub === 'verdict' && unit.affirm) return base + '_affirm';
    return base;
  }

  function julianOf(unit) {
    const c = D.calendars[unit.calendar];
    const m = c && (c.months || []).find((x) => x.n === unit.month);
    return m && m.julian ? m.julian : null;
  }

  function monthOf(unit, lang) {
    const c = D.calendars[unit.calendar];
    const m = c && (c.months || []).find((x) => x.n === unit.month);
    return m ? esc(pick(m, lang)) : '';
  }

  // ---- Calendar Names In The Text ----

  // A Han or kana era name is skipped when a neighbouring character makes it part of another
  // word: 这回历法 (this time, the method) holds no Hijri calendar. The characters before count
  // only ahead of 回 (time), which they turn into a measure word.
  const CJK_BEFORE = '这這那一每几幾两兩此本该該';
  const CJK_AFTER = '法时時书書史算';
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SP = '[ \\u00a0]';
  const HAN_DIGITS = '[0-9〇零一二三四五六七八九十百千]';
  const NUM = '\\d+(?:[.,]\\d+)*';

  // A Greek alphabetic numeral with its keraia: ια΄ (11), θ΄ (9).
  const GREEK_NUM = '[α-ωϛϟϡ]{1,3}[΄ʹ᾽]';

  // The card's span takes the year beside an era name: 回历三八〇年 (Hijri year 380), "l'an
  // 381 de l'hégire", "anno 1194 a Dhū 'l-qarnayn", "the ninth indiction".
  const CJK_YEAR_BEFORE = '(?:第' + HAN_DIGITS + '+(?:个|個|回の|の)?)?';
  const CJK_YEAR_AFTER = '(?:\\s?第?' + HAN_DIGITS + '+(?:\\.' + HAN_DIGITS + '+)*年?)?';
  const YEAR_WORD = "(?:year|l['’]an|an|año|l['’]anno|anno)" + SP + '+';
  const LINK_WORD = '(?:(?:of|the|de|la|del|della|di|du|el|a|ab)' + SP + "+|(?:dell|d|l)['’])";
  let calNames = {};

  // An ordinal before an era name, in digits (11th, 11ᵉ, 11ª) or in words up to fifteen, the
  // length of the indiction cycle.
  function ordinalPattern(lang) {
    const words = [];
    for (let n = 1; n <= 15; n++) words.push(ordinal(n, lang), ordinal(n, lang, true));
    return '(?:\\d+(?:st|nd|rd|th|ᵉ|e|er|re|ª|º)|' + [...new Set(words)].map(reEsc).join('|') + ')';
  }

  // The pattern for one locale's era names ('orig' for the source text) and the calendar each
  // lower-cased name belongs to, built once per locale. The name is the match's one non-empty
  // group; the rest of the match is the year beside it.
  function calendarPattern(lang) {
    if (calNames[lang]) return calNames[lang];
    const owner = new Map();
    const plain = [];
    const late = [];
    Object.keys(D.calendars).forEach((key) => {
      const c = D.calendars[key];
      ((c.names && c.names[lang]) || []).forEach((s) => plain.push(s) && owner.set(s.toLowerCase(), key));
      ((c.names_after_year && c.names_after_year[lang]) || []).forEach(
        (s) => late.push(s) && owner.set(s.toLowerCase(), key)
      );
    });
    const alt = (list) =>
      list
        .sort((a, b) => b.length - a.length)
        .map(reEsc)
        .join('|');
    let re = null;
    if (plain.length && lang !== 'orig' && isCjk(lang))
      re = new RegExp(
        '(?<![' +
          CJK_BEFORE +
          '](?=回))' +
          CJK_YEAR_BEFORE +
          '(' +
          alt(plain) +
          ')(?![' +
          CJK_AFTER +
          '])' +
          CJK_YEAR_AFTER,
        'gu'
      );
    else if (plain.length) {
      const before =
        '(?:(?:' +
        YEAR_WORD +
        ')?' +
        NUM +
        SP +
        '+' +
        LINK_WORD +
        '*|' +
        ordinalPattern(lang) +
        SP +
        '+|' +
        GREEK_NUM +
        SP +
        '+)';
      const parts = [before + '(' + alt(plain) + ')'];
      if (late.length) parts.push(before + '(' + alt(late) + ')');
      parts.push('(' + alt(plain) + ')(?:' + SP + '+(?:' + NUM + '|' + GREEK_NUM + '))?');
      re = new RegExp('(?<![\\p{L}\\p{N}])(?:' + parts.join('|') + ')(?!\\p{L})', 'giu');
    }
    calNames[lang] = { re, owner };
    return calNames[lang];
  }

  /**
   * Wrap each era name with its year, each number with its unit word, and each stem-branch
   * pair in already-escaped record text in a hover card. Only text between tags is searched.
   * @param {string} html escaped text, possibly with markup
   * @param {string} textLang locale of the text, or 'orig' for the source text
   * @param {string} lang the reader's locale, which the sentence is given in
   * @param {(key:string)=>(string|null)} [tr] locale dictionary lookup; without it a
   *        stem-branch pair gets no card
   * @param {string[]} [skip] phrases a footnote explains, whose unit words get no card
   * @returns {string}
   */
  function calendarNames(html, textLang, lang, tr, skip) {
    const { re, owner } = calendarPattern(textLang);
    let out = String(html);
    if (re)
      out = betweenTags(out, re, (m, ...groups) => {
        const name = groups.find((g) => typeof g === 'string' && g);
        const c = D.calendars[owner.get(String(name).toLowerCase())];
        return glossSpan(m, c ? pick(c.note, lang) : '');
      });
    const units = unitPattern(textLang);
    if (units.re)
      out = betweenTags(out, units.re, (m, name, at, part) => {
        if (inside(part, at, m.length, skip)) return m;
        const t = D.terms[units.owner.get(name.toLowerCase())];
        return glossSpan(m, t ? pick(t.gloss, lang) : '');
      });
    const cyc = tr && tr('note.ganzhi');
    if (cyc) {
      const han = textLang === 'orig' || isCjk(textLang);
      out = betweenTags(out, han ? GANZHI_HAN : GANZHI_PINYIN, (m) => {
        const n = han ? cycleIndex(m) : pinyinCycleIndex(m);
        const g = isCjk(lang) ? m : m.charAt(0).toUpperCase() + m.slice(1);
        return n ? glossSpan(m, fill(cyc, { n: isZh(lang) ? hanNumber(n) : String(n), g })) : m;
      });
    }
    return out;
  }

  // A unit word counts only after a number, which joins the card's span: 七八尺 (seven or
  // eight chi), "7 or 8 chi". 指 (digit) must not start another word, as in 指距 (a span).
  const HAN_NUM = '0-9〇一二三四五六七八九十百两兩半几幾数數';
  const UNIT_AFTER = '距数數出示定向着著甲寸';
  const WORD_NUM = {
    en: ['one', 'a', 'half'],
    fr: ['un', 'une', 'demi'],
    es: ['un', 'una', 'medio'],
    it: ['un', 'uno', 'mezzo'],
  };
  const RANGE_WORD = '(?:[-–]|or|to|and|ou|à|et|o|a|y|e)';
  let unitNames = {};

  // The pattern for one locale's unit words after a number; the unit word is group 1.
  function unitPattern(lang) {
    if (unitNames[lang]) return unitNames[lang];
    const owner = new Map();
    const words = [];
    Object.keys(D.terms).forEach((key) => {
      const t = D.terms[key];
      ((t.names_after_number && t.names_after_number[lang]) || []).forEach(
        (s) => words.push(s) && owner.set(s.toLowerCase(), key)
      );
    });
    let re = null;
    const alt = words
      .sort((a, b) => b.length - a.length)
      .map(reEsc)
      .join('|');
    if (alt && (lang === 'orig' || isCjk(lang)))
      re = new RegExp('[' + HAN_NUM + ']+(' + alt + ')(?![' + UNIT_AFTER + '])', 'gu');
    else if (alt) {
      const nums = ['\\d+(?:[.,]\\d+)?(?:' + SP + '?[½⅓¼¾])?', '[½⅓¼¾]'].concat(WORD_NUM[lang] || []);
      for (let n = 1; n <= 20; n++) nums.push(reEsc(cardinal(n, lang)));
      const one = '(?:' + nums.join('|') + ')';
      const count = one + '(?:' + SP + '*' + RANGE_WORD + SP + '*' + one + ')?';
      re = new RegExp('(?<![\\p{L}\\p{N}])' + count + SP + '+(' + alt + ')(?!\\p{L})', 'giu');
    }
    unitNames[lang] = { re, owner };
    return unitNames[lang];
  }

  // A stem-branch pair in Han script, or in the hyphenated pinyin the translations print
  // (ding-hai). A pair whose stem and branch differ in parity is no cycle term and is left.
  const GANZHI_HAN = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/gu;
  const STEMS_PY = ['jia', 'yi', 'bing', 'ding', 'wu', 'ji', 'geng', 'xin', 'ren', 'gui'];
  const BRANCHES_PY = ['zi', 'chou', 'yin', 'mao', 'chen', 'si', 'wu', 'wei', 'shen', 'you', 'xu', 'hai'];
  const GANZHI_PINYIN = new RegExp(
    '(?<![\\p{L}\\p{N}-])(?:' + STEMS_PY.join('|') + ')-(?:' + BRANCHES_PY.join('|') + ')(?![\\p{L}-])',
    'giu'
  );

  function pinyinCycleIndex(s) {
    const [a, b] = s.toLowerCase().split('-');
    return cycleIndex(STEMS[STEMS_PY.indexOf(a)] + BRANCHES[BRANCHES_PY.indexOf(b)]);
  }

  // Whether [at, at + len) of `text` lies within an occurrence of one of the phrases.
  function inside(text, at, len, phrases) {
    for (const p of phrases || []) {
      if (!p) continue;
      for (let i = text.indexOf(p); i >= 0; i = text.indexOf(p, i + 1))
        if (i <= at && at + len <= i + p.length) return true;
    }
    return false;
  }

  // Apply a replacement to the text between tags only, so a highlight or a link stays whole.
  function betweenTags(html, re, fn) {
    return html
      .split(/(<[^>]*>)/)
      .map((part, i) => (i % 2 ? part : part.replace(re, fn)))
      .join('');
  }

  function glossSpan(text, gloss) {
    return gloss ? '<span class="ngloss" data-gloss="' + escAttr(esc(gloss)) + '">' + text + '</span>' : text;
  }

  /**
   * One unit as an HTML sentence in one locale.
   * @param {Object} unit a `notes` element
   * @param {string} lang BCP-47 locale
   * @param {(key:string)=>(string|null)} tr locale dictionary lookup
   * @returns {string} '' for a unit of unknown type or a missing pattern
   */
  function sentence(unit, lang, tr) {
    const sub = subOf(unit);
    if (!sub) return '';
    const vals = {};
    for (const raw of TYPES[unit.type][sub]) {
      const slot = raw.replace('?', '');
      vals[slot] = slotValue(unit, slot, lang, tr);
    }
    vals.ordinal = unit.month != null ? ordinal(unit.month, lang) : '';
    vals.ordinal_f = unit.month != null ? ordinal(unit.month, lang, true) : '';
    if (unit.type === 'calendar_gloss') {
      vals.month = monthOf(unit, lang);
      const j = julianOf(unit);
      vals.julian_month = j ? esc(monthName(j, lang)) : '';
    }

    // The series index stands without a noun: es el primero de los dos eclipses.
    if (unit.index != null) vals.index = lang === 'es' ? esOrdinal(unit.index, false, true) : ordinal(unit.index, lang);
    if (unit.index != null) vals.index_f = ordinal(unit.index, lang, true);
    if (unit.total != null) vals.total = cardinal(unit.total, lang);

    // Chinese counts two things as 两 (liang), not 二 (er): 两场日食 (two solar eclipses).
    if (unit.total === 2 && isZh(lang) && !latinDigits) vals.total = '两';

    // An inference names its year or place in the basis, so the closing clause only points back
    // to it: this year, this place.
    if (unit.type === 'date_basis' && sub === 'inferred') vals.this = esc(tr('note.enum.this.' + unit.field) || '');

    if (unit.hour != null) vals.clock = clockText(unit.hour, lang, tr);

    // The era sentence is the calendar's own, kept in calendars.json beside its name.
    if (unit.type === 'calendar_gloss' && sub === 'epoch') {
      const c = D.calendars[unit.calendar];
      return c ? esc(pick(c.note, lang)) : '';
    }

    // Optional fragments: {opt_x} prints <pattern key>.opt_x, else note.<type>.<sub>.opt_x, when
    // slot x has a value.
    const key = patternKey(unit, sub);
    let pat = tr(key);
    if (!pat) return '';
    pat = pat.replace(/\{opt_(\w+)\}/g, (m, slot) =>
      vals[slot] ? fill(tr(key + '.opt_' + slot) || tr('note.' + unit.type + '.' + sub + '.opt_' + slot), vals) : ''
    );

    // A slot that ends in an abbreviation (av. J.-C.) lends its period to the sentence.
    let out = contract(fill(pat, vals), lang).replace(/([^.\s]\.)((?:<\/[^>]+>)*)\.$/, '$1$2');

    // A Spanish slot that opens with el after a or de in the pattern fuses with it (al adivino).
    if (lang === 'es') out = out.replace(/(?<!\p{L})([aA]|[dD]e) el (?=\p{L})/gu, (m, p) => p + 'l ');
    if (isZh(lang)) out = spaceHanLatin(out).replace(/([A-Za-z0-9])((?:<\/[^>]+>)*)。/g, '$1$2．');
    else if (!isCjk(lang)) out = capitalize(out);
    return out;
  }

  // ---- Date Marks ----

  // date.epoch ("hijri:244") marks a foreign era's year, date.hour ("day:6") an unequal hour,
  // a twelfth of daylight from sunrise or of night from sunset. Each place a translation prints
  // one gets a hover unit, except a year beside its era's name, which calendarNames covers.

  const MARK = /^(\w[\w-]*):(\d+)$/;
  const HAN_NUM_CHAR = '〇零一二三四五六七八九十百千';
  const HOUR_WORD = { en: /^hours?$/i, fr: /^heures?$/i, es: /^horas?$/i, it: /^or[ae]$/i };

  // The words that join two hours of a span, after which an ordinal may stand without its noun.
  const HOUR_LINK = {
    en: /^(?:and|to|until|till|or)$/i,
    fr: /^(?:et|à|jusqu|ou)$/i,
    es: /^(?:y|a|hasta|o)$/i,
    it: /^(?:e|a|alla|all|fino|o)$/i,
  };

  // The article an ordinal standing for an hour takes, "to the ninth", "dalla sesta".
  const HOUR_ARTICLE = {
    en: /^the$/i,
    fr: /^la$/i,
    es: /^la$/i,
    it: /^(?:la|alla|della|dalla|all|dall|dell|sull)$/i,
  };

  // A count of hours into the day, the form a few translations give the n-th hour.
  const INTO_DAY = { en: '(?:into|of) the day', fr: 'du jour', es: 'del día', it: 'del giorno' };
  const DIGIT_ORDINAL = '(?:st|nd|rd|th|e|ᵉ|ème|er|re|ª|º|\\.ª|\\.º)';

  // A year as Han numerals digit by digit (一〇〇五), the form the translations print.
  function hanDigits(n) {
    return String(n).replace(/\d/g, (d) => HAN_DIGIT[d]);
  }

  // A count above ninety-nine in Han numerals: 二百四十四 (two hundred forty-four).
  function hanCount(n) {
    if (n < 100) return hanNumber(n);
    const units = ['', '十', '百', '千'];
    const ds = String(n);
    let out = '';
    let zero = false;
    for (let i = 0; i < ds.length; i++) {
      const d = +ds[i];
      const p = ds.length - 1 - i;
      if (!d) {
        zero = out !== '';
        continue;
      }
      out += (zero ? '零' : '') + HAN_DIGIT[d] + units[p];
      zero = false;
    }
    return out;
  }

  // The [start, end) of every match of a global pattern.
  function reAll(text, re) {
    const out = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      out.push([m.index, m.index + m[0].length]);
      if (!m[0].length) re.lastIndex++;
    }
    return out;
  }

  // Which occurrence of `s` in `text` starts at `at`, counting from 1.
  function occurrence(text, s, at) {
    let n = 0;
    for (let i = text.indexOf(s); i >= 0 && i <= at; i = text.indexOf(s, i + 1)) n++;
    return n;
  }

  // Where a translation prints a year of an era: in Han script with 年 (year), elsewhere the
  // bare numeral.
  function yearRanges(text, n, lang) {
    if (isCjk(lang)) {
      const forms = [...new Set([hanDigits(n), hanCount(n), String(n)])].map(reEsc).join('|');
      return reAll(text, new RegExp('(?<![' + HAN_NUM_CHAR + '0-9])(?:' + forms + ')年', 'gu'));
    }
    return reAll(text, new RegExp('(?<![\\p{N}.,])' + n + '(?![\\p{N}]|[.,]\\d)', 'gu'));
  }

  // Where a translation prints the n-th hour: 第六时 (sixth hour), "the sixth hour", "7th hour",
  // an office's name (Terce), or the bare ordinal of a span, "from the sixth to the ninth hour".
  function hourRanges(text, n, lang) {
    if (isCjk(lang)) {
      const hour = lang === 'zh-Hans' ? '时' : '時';
      const forms = [...new Set([hanNumber(n), String(n)])].map(reEsc).join('|');
      return reAll(text, new RegExp('第(?:' + forms + ')' + hour + '(?![代期候间間刻])', 'gu'));
    }
    const named = ((D.calendars['unequal-hours'] || {}).hours || []).find((h) => h.n === n);
    const name = named && named[lang];
    const words = [...new Set([ordinal(n, lang), ordinal(n, lang, true)].concat(name || []))].map(reEsc);
    const ords = reAll(
      text,
      new RegExp('(?<![\\p{L}\\p{N}])(?:' + words.join('|') + '|' + n + DIGIT_ORDINAL + ')(?![\\p{L}\\p{N}])', 'giu')
    );

    // An ordinal whose article follows a joining word closes a span: "y la nona".
    const linked = (at) => {
      const w = /(\p{L}+)[ \u00a0]*$/u.exec(text.slice(0, at));
      return !!w && HOUR_LINK[lang].test(w[1]);
    };
    const out = [];
    for (const [a, b] of ords) {
      const next = /^[ \u00a0]*(\p{L}+)/u.exec(text.slice(b));
      const prev = /(\p{L}+)['’]?[ \u00a0]*$/u.exec(text.slice(0, a));
      if (next && HOUR_WORD[lang].test(next[1])) out.push([a, b + next[0].length]);
      else if (prev && HOUR_WORD[lang].test(prev[1])) out.push([a - prev[0].length, b]);
      else if (
        prev &&
        HOUR_ARTICLE[lang].test(prev[1]) &&
        (!next || HOUR_LINK[lang].test(next[1]) || linked(a - prev[0].length))
      ) {
        const from = Math.max(text.lastIndexOf('.', a), text.lastIndexOf(';', a), text.lastIndexOf(':', a)) + 1;
        const to = text.slice(b).search(/[.;:]/);
        const clause = text.slice(from, to < 0 ? text.length : b + to);
        if ((clause.match(/\p{L}+/gu) || []).some((w) => HOUR_WORD[lang].test(w))) out.push([a, b]);
      }
    }
    if (name) out.push(...reAll(text, new RegExp('(?<!\\p{L})' + reEsc(name) + '(?!\\p{L})', 'gu')));
    const count = new RegExp(
      '(?<!\\p{L})' + reEsc(cardinal(n, lang)) + SP + '+\\p{L}+(?=' + SP + '+' + INTO_DAY[lang] + ')',
      'giu'
    );
    for (const [a, b] of reAll(text, count))
      if (
        HOUR_WORD[lang].test(
          text
            .slice(a, b)
            .split(/[ \u00a0]+/)
            .pop()
        )
      )
        out.push([a, b]);
    return out.sort((x, y) => x[0] - y[0]).filter((r, i, all) => !i || r[0] >= all[i - 1][1]);
  }

  // Twelve unequal hours of daylight from about six in the morning, of night from about six in
  // the evening: the hour of the modern clock the n-th one is about, 0 to 23.
  function clockHour(count, n) {
    return ((count === 'night' ? 18 : 6) + n) % 24;
  }

  // The same hour reckoned from the Sun's own rising and setting at the record's place on its
  // day, in local mean time: a midsummer third hour at Poznan is about seven, not nine.
  // Null where the place, the date or the ephemeris is missing, or the Sun does not set.
  function skyHour(count, n, sky) {
    if (!sky || sky.lat == null || sky.lon == null || typeof Astronomy === 'undefined') return null;
    const m = /^(-?\d+)-(\d\d)-(\d\d)/.exec(sky.date || '');
    if (!m) return null;
    const noon = new Date(0);
    noon.setUTCFullYear(+m[1], +m[2] - 1, +m[3]);
    const shift = (sky.lon / 15) * 3600000;
    const t0 = noon.getTime() + 12 * 3600000 - shift;
    try {
      const obs = new Astronomy.Observer(sky.lat, sky.lon, 0);
      const day = count !== 'night';
      const from = Astronomy.MakeTime(new Date(day ? t0 - 12 * 3600000 : t0));
      const start = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, day ? +1 : -1, from, 1);
      if (!start) return null;
      const end = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, day ? -1 : +1, start, 1);
      if (!end) return null;
      const a = start.date.getTime();
      const mid = a + ((n - 0.5) * (end.date.getTime() - a)) / 12 + shift;
      return ((Math.round((mid - noon.getTime()) / 3600000) % 24) + 24) % 24;
    } catch (_) {
      return null;
    }
  }

  // "about nine in the morning" in the reader's locale, from note.clock.* keys.
  function clockText(h, lang, tr) {
    const key = h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 6 ? 'small' : h < 12 ? 'am' : h < 19 ? 'pm' : 'night';
    const h12 = h % 12 || 12;
    const pat = (h12 === 1 && tr('note.clock.' + key + '_one')) || tr('note.clock.' + key);
    return pat ? fill(pat, { h: hanOn(lang) ? hanNumber(h12) : String(h12) }) : '';
  }

  /**
   * The hover units a record's date marks stand for, each anchored to one place a translation
   * prints the year or hour, and a year also to where the source prints it in digits.
   * @param {{epoch?:string[], hour?:string[]}} date the record's date block
   * @param {Object<string,string>} texts the translations by locale
   * @param {string} [orig] text_orig
   * @param {{lat:number, lon:number, date:string}} [sky] the record's place and day, for the hour
   * @returns {Object[]} units shaped like `notes` hover units
   */
  function dateUnits(date, texts, orig, sky) {
    const out = [];
    const all = Object.assign({}, texts, { orig: orig || '' });
    const add = (base, find) => {
      const per = {};
      let most = 0;
      for (const lang of LOCALES.concat('orig')) {
        const t = all[lang] || '';
        const named = calendarPattern(lang).re;
        const taken = named ? reAll(t, named) : [];
        per[lang] = find(t, lang).filter(([a, b]) => !taken.some(([c, d]) => a < d && c < b));
        most = Math.max(most, per[lang].length);
      }
      for (let k = 0; k < most; k++) {
        const tr = {};
        for (const lang of LOCALES) {
          const r = per[lang][k];
          if (!r) continue;
          const t = all[lang];
          const s = t.slice(r[0], r[1]);
          tr[lang] = { s, n: occurrence(t, s, r[0]) };
        }
        const o = tr.orig;
        delete tr.orig;
        if (!Object.keys(tr).length) continue;
        out.push(Object.assign({}, base, { at: o ? { orig: o.s, n: o.n, tr } : { tr } }));
      }
    };
    for (const e of (date && date.epoch) || []) {
      const m = MARK.exec(e);
      if (m) add({ type: 'calendar_gloss', sub: 'epoch', calendar: m[1] }, (t, lang) => yearRanges(t, +m[2], lang));
    }
    for (const h of (date && date.hour) || []) {
      const m = MARK.exec(h);
      if (m)
        add(
          { type: 'time_reckoning', sub: m[1] + '_hour', hour: skyHour(m[1], +m[2], sky) ?? clockHour(m[1], +m[2]) },
          (t, lang) => (lang === 'orig' ? [] : hourRanges(t, +m[2], lang))
        );
    }
    return out;
  }

  /**
   * What is wrong with a record's date marks: a mark of the wrong shape, an era the calendars
   * table does not count years in, or a locale whose translation prints no such year or hour.
   * @returns {string[]}
   */
  function markProblems(date, texts) {
    const out = [];
    for (const e of (date && date.epoch) || []) {
      const m = MARK.exec(e);
      if (!m || !D.calendars[m[1]] || D.calendars[m[1]].epoch == null) {
        out.push(`epoch ${e}: not <calendar>:<year> of a calendar that counts years`);
        continue;
      }
      for (const lang of LOCALES)
        if (!yearRanges((texts && texts[lang]) || '', +m[2], lang).length)
          out.push(`epoch ${e}: the ${lang} translation prints no year ${m[2]}`);
    }
    for (const h of (date && date.hour) || []) {
      const m = MARK.exec(h);
      if (!m || (m[1] !== 'day' && m[1] !== 'night') || +m[2] < 1 || +m[2] > 12) {
        out.push(`hour ${h}: not day:<1-12> or night:<1-12>`);
        continue;
      }
      for (const lang of LOCALES)
        if (!hourRanges((texts && texts[lang]) || '', +m[2], lang).length)
          out.push(`hour ${h}: the ${lang} translation prints no such hour`);
    }
    return out;
  }

  // ---- Anchors ----

  // Where an `orig` anchor ends in text_orig: the end of its n-th occurrence, or -1.
  function anchorEnd(orig, at) {
    return at.orig == null ? -1 : quoteEnd(orig, at.orig, at.n);
  }

  // The end of the n-th occurrence of `s` in `text` (the first when n is absent), or -1.
  function quoteEnd(text, s, n) {
    let from = 0;
    let idx = -1;
    for (let i = 0; i < (n || 1); i++) {
      idx = text.indexOf(s, from);
      if (idx < 0) return -1;
      from = idx + 1;
    }
    return idx + s.length;
  }

  // Reading order on the card: header place, header year, the body text, the source.
  // A whole-record note sits at the end of the body text.
  function readingRank(at, orig) {
    if (at === 'place') return [0, 0];
    if (at === 'year') return [1, 0];
    if (at === 'record') return [2, orig.length + 0.5];
    if (at === 'source') return [3, 0];
    return [2, anchorEnd(orig, at)];
  }

  // Where an `orig` anchor's phrase ends in the translation, or -1 when it has none there.
  function transEnd(text, at, lang) {
    const q = at && typeof at === 'object' && at.tr && at.tr[lang];
    if (!q) return -1;
    return typeof q === 'string' ? quoteEnd(text, q) : quoteEnd(text, q.s, q.n);
  }

  /**
   * Render a record's notes in one locale, numbered in reading order: the translation's order
   * when every quoted anchor is found in it, since it is read first, else the original's.
   * @param {{notes?:Object[], text_orig?:string, trans?:string, trans_lang?:string}} rec
   * @param {string} lang
   * @param {(key:string)=>(string|null)} tr locale dictionary lookup
   * @returns {Object[]} {n, type, at, pos, html} per unit; `pos` is the offset in text_orig
   *          after which the mark goes, or -1.
   */
  function render(rec, lang, tr) {
    const zh = rec.text_zh != null ? rec.text_zh : (rec.text && rec.text['zh-Hans']) || '';
    latinDigits = /\d{3,4}\s?年/.test(zh);
    const orig = rec.text_orig || '';
    const notes = rec.notes || [];
    const trans = rec.trans || '';
    const quoted = notes.filter((u) => u.at && typeof u.at === 'object' && !isHover(u));
    const byTrans = trans && quoted.length > 0 && quoted.every((u) => transEnd(trans, u.at, rec.trans_lang) >= 0);
    const units = notes.map((u, i) => {
      const r = readingRank(u.at, orig);
      let order = r;
      if (byTrans && r[0] === 2) {
        order = u.at === 'record' ? [2, trans.length + 0.5] : [2, transEnd(trans, u.at, rec.trans_lang)];
      }
      return { u, i, r, order };
    });
    units.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.i - b.i);

    // Units on one anchor share one number and one entry, in record order. Checks or
    // emendations of one kind within NEAR characters are one finding under the first number;
    // in CJK a sentence repeating the previous lead drops it.
    let k = 0;
    const out = [];
    const byAnchor = {};
    const byKind = {};
    const KINDS = ['computation_check', 'emendation'];
    const NEAR = 12;
    const joint = isCjk(lang) ? '' : ' ';
    const leads = isCjk(lang) ? ['computation', 'prediction'].map((l) => tr('note.lead.' + l)).filter(Boolean) : [];
    units.forEach((x) => {
      const hover = isHover(x.u);
      let html = sentence(x.u, lang, tr);
      const key = hover ? null : JSON.stringify(x.u.at && (x.u.at.orig != null ? [x.u.at.orig, x.u.at.n] : x.u.at));
      const append = (r) => {
        const prev = r.html;
        const lead = leads.find((l) => prev.startsWith(l) && html.startsWith(l));
        if (lead) html = html.slice(lead.length);

        // An emendation with no source of its own rests on the computation just before it, and
        // joins it as one sentence: "by computation, X; hence for Y read Z". After a premise
        // that only denies (no such day, no eclipse seen) the reading follows without "hence".
        const hence = tr(r.negative ? 'note.join.plain' : 'note.join.hence');
        if (html && prev && hence && r.last === 'computation_check' && x.u.type === 'emendation' && !x.u.ref) {
          r.html =
            prev.replace(/[。.]$/, '') +
            hence +
            html.replace(/^((?:<[^>]+>)*)(\p{Lu})(?!\p{Lu})/u, (m, p, c) => p + c.toLowerCase());
        } else if (html) r.html += (prev ? joint : '') + html;
        r.last = x.u.type;
        r.negative = isNegative(x.u);
      };
      if (key && byAnchor[key]) {
        append(byAnchor[key]);
        return;
      }
      const sub = subOf(x.u);
      const pos = x.r[0] === 2 ? Math.min(Math.floor(x.r[1]), orig.length) : -1;
      const kind = !hover && pos >= 0 && KINDS.indexOf(x.u.type) >= 0 ? x.u.type + '.' + sub : null;
      const last = kind && byKind[kind];
      const head = last && pos - last.pos <= NEAR ? last.head : null;
      if (head) append(head);
      const r = {
        n: hover ? 0 : head ? head.n : ++k,
        hover,
        type: x.u.type,
        key: sub ? patternKey(x.u, sub) : '',
        at: x.u.at,
        pos,
        html: head ? '' : html,
        last: head ? null : x.u.type,
        negative: isNegative(x.u),
      };
      if (head) r.extra = true;
      if (key) byAnchor[key] = head || r;
      if (kind) byKind[kind] = { head: head || r, pos };
      out.push(r);
    });
    latinDigits = false;
    return out;
  }

  // A computation that only denies: the reading it supports follows it without "hence". A
  // verdict says the recorded value is not the computed one, unless it affirms; a distance is
  // measured on the recorded date and shows the reading wrong.
  const DENIALS = ['unseen', 'absent', 'verdict', 'distance'];

  function isNegative(u) {
    return u.type === 'computation_check' && DENIALS.indexOf(u.sub) >= 0 && !u.affirm;
  }

  // A gloss on a term or on a calendar or unit reading (a foreign month or era, an hour or time
  // scale, a night reckoned from sunset) shows as a hover card on its quoted phrase and takes no
  // note number. Who or what a name is goes to a numbered note.
  const HOVER = {
    glossary_term: null,
    calendar_gloss: ['month', 'epoch'],
    time_reckoning: ['day_hour', 'night_hour'],
  };

  /**
   * The phrases of one locale's text that an entity gloss footnote explains, for
   * calendarNames to leave without a unit card.
   * @param {Object[]} rendered the output of render()
   * @param {string} lang the locale of the text
   * @returns {string[]}
   */
  function glossedPhrases(rendered, lang) {
    return (rendered || [])
      .filter((r) => !r.hover && r.type === 'entity_gloss' && r.at && r.at.tr && r.at.tr[lang])
      .map((r) => (typeof r.at.tr[lang] === 'string' ? r.at.tr[lang] : r.at.tr[lang].s));
  }

  function isHover(u) {
    if (!u.at || typeof u.at !== 'object' || !(u.type in HOVER)) return false;
    const subs = HOVER[u.type];
    return !subs || subs.indexOf(subOf(u)) >= 0;
  }

  // Placeholders around a hover phrase: open, the unit's index in render() output, a
  // separator, the phrase, close. Ranks order them against note marks at one offset.
  const HOVER_OPEN = '';
  const HOVER_SEP = '';
  const HOVER_CLOSE = '';
  const RANK = { close: -1, mark: 1, open: 3 };

  // Hover ranges [start, end, index], dropping any that overlaps one already taken.
  function hoverRanges(rendered, endOf) {
    const out = [];
    rendered.forEach((r, i) => {
      if (!r.hover) return;
      const span = endOf(r);
      if (!span) return;
      const [a, b] = span;
      if (out.some(([c, d]) => a < d && c < b)) return;
      out.push([a, b, i]);
    });
    return out;
  }

  /**
   * Dangling anchors of one record: units whose `orig` quotation is not found often enough.
   * @returns {number[]} indices into rec.notes
   */
  function dangling(rec) {
    const orig = rec.text_orig || '';
    return (rec.notes || []).reduce((out, u, i) => {
      if (u.at && typeof u.at === 'object' && anchorEnd(orig, u.at) < 0) out.push(i);
      else if (typeof u.at === 'string' && ANCHORS.indexOf(u.at) < 0) out.push(i);
      return out;
    }, []);
  }

  /**
   * Insert the superscript marks into text_orig: private-use placeholders the caller turns
   * into markup after escaping, so a mark never splits an HTML entity.
   * @returns {string}
   */
  // One note number at one offset, kept once when merged units share both.
  function addMark(at, pos, n) {
    const ns = (at[pos] = at[pos] || []);
    if (ns.indexOf(n) < 0) ns.push(n);
  }

  function markOrig(orig, rendered) {
    const at = {};
    rendered.forEach((r) => {
      if (r.pos >= 0 && !r.hover) addMark(at, r.pos, r.n);
    });
    const ins = Object.keys(at).map((k) => ({ pos: +k, rank: RANK.mark, str: markString(at[k]) }));
    hoverRanges(rendered, (r) => (r.pos >= 0 ? [r.pos - r.at.orig.length, r.pos] : null)).forEach(([a, b, i]) =>
      ins.push(...hoverMarks(a, b, i))
    );
    return insertAll(orig, ins);
  }

  function hoverMarks(a, b, i) {
    return [
      { pos: a, rank: RANK.open, str: HOVER_OPEN + i + HOVER_SEP },
      { pos: b, rank: RANK.close, str: HOVER_CLOSE },
    ];
  }

  // Insert strings at offsets of `text`; at one offset, lower ranks go first.
  function insertAll(text, ins) {
    ins.sort((x, y) => x.pos - y.pos || x.rank - y.rank);
    let out = '';
    let from = 0;
    ins.forEach((m) => {
      out += text.slice(from, m.pos) + m.str;
      from = m.pos;
    });
    return out + text.slice(from);
  }

  /** The placeholder for one superscript carrying these note numbers. */
  function markString(ns) {
    return '' + ns.join(',') + '';
  }

  /**
   * Places superscripts after the phrase `at.tr` names (string, or {s, n} for the n-th hit),
   * or at the end for a whole-record note; header anchors and missing phrases get no mark, and
   * a hover unit brackets its phrase with the hover placeholders.
   * @param {string} text the translation as shown
   * @param {Object[]} rendered the output of render()
   * @param {string} lang the locale of `text`
   * @returns {{pos:number, rank:number, str:string}[]} insertions; lower rank first at a tie
   */
  function transMarks(text, rendered, lang) {
    const at = {};
    rendered.forEach((r) => {
      if (r.hover) return;
      let pos = -1;
      if (r.at === 'record') pos = text.length;
      else if (r.at && typeof r.at === 'object' && r.at.tr && r.at.tr[lang]) {
        pos = transEnd(text, r.at, lang);
      }
      if (pos >= 0) addMark(at, pos, r.n);
    });
    const ins = Object.keys(at).map((k) => ({ pos: +k, rank: RANK.mark, str: markString(at[k]) }));
    hoverRanges(rendered, (r) => {
      const q = r.at.tr && r.at.tr[lang];
      const end = transEnd(text, r.at, lang);
      return end < 0 ? null : [end - (typeof q === 'string' ? q : q.s).length, end];
    }).forEach(([a, b, i]) => ins.push(...hoverMarks(a, b, i)));
    return ins;
  }

  /**
   * One superscript for these note numbers: each number a bracketed link to its entry in the
   * note list, previewed through the site tooltip. The brackets keep an editor's mark apart
   * from the superscripts the source prints itself (a footnote figure, a unit letter).
   * @param {number[]} ns note numbers
   * @param {Object[]} rendered the output of render()
   * @returns {string} markup
   */
  function supHtml(ns, rendered) {
    const links = ns.map((n) => {
      const u = (rendered || []).find((r) => r.n === n);
      const tip = u && u.html ? u.html.replace(/<[^>]+>/g, '') : '';
      const attr = tip ? ' data-tip="' + escAttr(tip) + '"' : '';
      return '<a href="#" class="nlink" data-n="' + n + '"' + attr + '>[' + n + ']</a>';
    });

    // U+2060 WORD JOINER forbids a line break before the mark and between two marks, so a
    // mark never opens a line apart from the word it annotates.
    return '⁠<sup class="nref">' + links.join('⁠') + '</sup>';
  }

  // The note html is already escaped, so only a bare ampersand and the quote need work.
  function escAttr(s) {
    return String(s)
      .replace(/&(?![a-z#\d]+;)/gi, '&amp;')
      .replace(/"/g, '&quot;');
  }

  // Placeholder pair -> superscript links; run after the text has been escaped and highlighted.
  function supMarks(html, rendered) {
    return html
      .replace(/\uE000([\d,]+)\uE001/g, (_, s) => supHtml(s.split(',').map(Number), rendered))
      .replace(/\uE004(\d+)\uE005/g, (_, i) => {
        const u = rendered[+i];
        return '<span class="ngloss" data-gloss="' + escAttr(u ? u.html.replace(/<[^>]+>/g, '') : '') + '">';
      })
      .replace(/\uE006/g, '</span>');
  }

  /** The placeholders as the bracketed numbers a reader sees, "[1][2]", for searched text. */
  function plainMarks(s) {
    return String(s)
      .replace(/\uE004\d+\uE005|\uE006/g, '')
      .replace(/([\d,]+)/g, (_, ns) =>
        ns
          .split(',')
          .map((n) => '[' + n + ']')
          .join('')
      );
  }

  /** Strip the placeholders, for any consumer that wants the bare text back. */
  function unmark(s) {
    return String(s)
      .replace(/\uE004\d+\uE005|\uE006/g, '')
      .replace(/[\d,]+/g, '');
  }

  return {
    TYPES,
    KIND,
    LOCALES,
    ANCHORS,
    setData,
    render,
    dateUnits,
    markProblems,
    sentence,
    dangling,
    markOrig,
    markString,
    transMarks,
    supMarks,
    supHtml,
    unmark,
    plainMarks,
    calendarNames,
    glossedPhrases,
    ordinal,
    cardinal,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Notes;
