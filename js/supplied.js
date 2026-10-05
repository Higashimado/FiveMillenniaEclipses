/** supplied.js — The spans of a translation that a record's `supplied` array marks as added.

   Pure, and shared with the build's checks. A unit is a token (era=hongwu, year=23, month=3,
   month=i4, subject=moon) or a written-out unit {kind, text: {locale: span | {s, n}}}. A token
   expands through the eras of data/concordance/eras.json, the ordinal that ordinal() writes and
   the bodies of data/concordance/bodies.json that carry a token; the build holds a twin of this
   code and a check that both find the same spans.
*/
const Supplied = (() => {
  'use strict';

  const LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'fr', 'es', 'it', 'ja'];
  const TOKEN = /^(era|year|month|subject)=([a-z0-9-]+)$/;

  // A subject written in Han is not read where a numeral, 正 (the first month's other name) or 閏
  // (intercalary) stands before it: the ja form of the Moon, 月 (moon), would be found inside
  // a month name.
  const NO_SUBJECT_AFTER = '〇一二三四五六七八九十廿卅正閏0123456789';

  let ERAS = {};
  let SUBJECTS = {};

  const HAN = '〇一二三四五六七八九';
  const EN_ONES = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
  const EN_TEENS = [
    'tenth',
    'eleventh',
    'twelfth',
    'thirteenth',
    'fourteenth',
    'fifteenth',
    'sixteenth',
    'seventeenth',
    'eighteenth',
    'nineteenth',
  ];
  const EN_TENS = ['', '', 'twent', 'thirt', 'fort', 'fift', 'sixt', 'sevent', 'eight', 'ninet'];
  const NOUN = {
    year: { en: 'year', fr: 'année', es: 'año', it: 'anno' },
    month: { en: 'month', fr: 'mois', es: 'mes', it: 'mese' },
  };

  /** A number from 1 to 99 in Han numerals: 十一 (eleven), 二十 (twenty), 二十三 (twenty-three). */
  function han(n) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return (t > 1 ? HAN[t] : '') + (t ? '十' : '') + (u ? HAN[u] : '');
  }

  /** An English ordinal word from 1 to 99: first, eleventh, twentieth, twenty-third. */
  function enOrdinal(n) {
    if (n < 10) return EN_ONES[n];
    if (n < 20) return EN_TEENS[n - 10];
    const u = n % 10;
    return EN_TENS[Math.floor(n / 10)] + (u ? 'y-' + EN_ONES[u] : 'ieth');
  }

  /**
   * The span of a year or month token in each locale, or null outside year 1–99 and month 1–12.
   * 元年 (first year), 正月 (first month); fr 1ʳᵉ année but 1ᵉʳ mois; es 1.er and 3.er before a
   * masculine noun.
   * @param {'year'|'month'} kind
   * @param {string} value N, or iN for an intercalary month
   */
  function ordinal(kind, value) {
    const m = /^(i?)([1-9]\d?)$/.exec(value);
    if (!m || (m[1] && kind !== 'month')) return null;
    const n = Number(m[2]);
    if (kind === 'month' && n > 12) return null;
    const year = kind === 'year';
    const hanForm = (n === 1 ? (year ? '元' : '正') : han(n)) + (year ? '年' : '月');
    const fr = n === 1 ? (year ? '1ʳᵉ' : '1ᵉʳ') : n + 'ᵉ';
    const es = n === 1 || n === 3 ? n + '.er' : n + '.º';
    const w = NOUN[kind];
    const forms = {
      'zh-Hans': hanForm,
      'zh-Hant': hanForm,
      en: enOrdinal(n) + ' ' + w.en,
      fr: fr + ' ' + w.fr,
      es: es + ' ' + w.es,
      it: n + 'º ' + w.it,
      ja: hanForm,
    };
    if (!m[1]) return forms;
    return {
      'zh-Hans': '闰' + hanForm,
      'zh-Hant': '閏' + hanForm,
      en: 'intercalary ' + forms.en,
      fr: forms.fr + ' intercalaire',
      es: forms.es + ' intercalar',
      it: forms.it + ' intercalare',
      ja: '閏' + hanForm,
    };
  }

  /** A romanised name without accents, lowercased and hyphenated (Hưng Thống is hung-thong). */
  function slug(rom) {
    return rom
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // The name of an era entry in each locale; en carries the line's unit word (reign, era).
  function eraForms(unit, row) {
    return {
      'zh-Hans': row.n,
      'zh-Hant': row.nt,
      en: row.rom + ' ' + unit,
      fr: row.rom,
      es: row.rom,
      it: row.rom,
      ja: row.ja || row.nt,
    };
  }

  /**
   * Supply the tables a token expands through.
   * @param {{eras?:Object, bodies?:Object}} d eras.json and bodies.json, as parsed
   */
  function setData(d) {
    ERAS = {};
    const lines = (d && d.eras && d.eras.lines) || {};
    for (const line of Object.values(lines)) {
      for (const row of line.eras) {
        if (!row.rom || row.n == null) continue;
        const key = row.k || slug(row.rom);
        if (!(key in ERAS)) ERAS[key] = eraForms(line.unit, row);
      }
    }
    SUBJECTS = {};
    for (const row of Object.values((d && d.bodies && d.bodies.bodies) || {})) {
      if (!row.token) continue;
      const forms = {};
      for (const l of LOCALES) forms[l] = row[l];
      SUBJECTS[row.token] = forms;
    }
  }

  /** The {locale: span} map of a token, or null when it names nothing. */
  function expand(token) {
    const m = typeof token === 'string' ? TOKEN.exec(token) : null;
    if (!m) return null;
    if (m[1] === 'era') return ERAS[m[2]] || null;
    if (m[1] === 'subject') return SUBJECTS[m[2]] || null;
    return ordinal(m[1], m[2]);
  }

  // English also dates a year as the era name and a numeral, "Kangxi 4": where the token's form is
  // absent, an era is read as its bare name and a year as the numeral that follows a word.
  function englishShort(u, text) {
    const [kind, value] = u.split('=');
    if (kind === 'era') {
      const s = ERAS[value] && ERAS[value].fr;
      const i = s ? text.indexOf(s) : -1;
      return i >= 0 ? [i, i + s.length] : null;
    }
    if (kind === 'year' && /^\d+$/.test(value)) {
      const m = new RegExp('(?<=\\p{L} )' + value + '(?!\\d)', 'u').exec(text);
      return m ? [m.index, m.index + value.length] : null;
    }
    return null;
  }

  /**
   * The [start, end) of each span of `units` within the translation `text` of locale `lang`.
   * A token is found at its first occurrence, a subject after the spans found before it and not
   * after a numeral; a written-out unit at its n-th occurrence. A span the text lacks has no range.
   * @returns {Array<[number, number]>}
   */
  function ranges(text, units, lang) {
    const out = [];
    for (const u of units || []) {
      if (typeof u === 'string') {
        const s = (expand(u) || {})[lang];
        if (!s) continue;
        const subject = u.startsWith('subject=');
        let i = text.indexOf(s, subject ? Math.max(0, ...out.map((r) => r[1])) : 0);
        while (subject && i > 0 && NO_SUBJECT_AFTER.includes(text[i - 1])) i = text.indexOf(s, i + 1);
        if (i >= 0) out.push([i, i + s.length]);
        else if (lang === 'en') {
          const short = englishShort(u, text);
          if (short) out.push(short);
        }
        continue;
      }
      const v = u.text && u.text[lang];
      if (!v) continue;
      const s = typeof v === 'string' ? v : v.s;
      let at = -1;
      for (let k = 0; k < (typeof v === 'string' ? 1 : v.n); k++) at = text.indexOf(s, at + 1);
      if (at >= 0) out.push([at, at + s.length]);
    }
    return out;
  }

  return { LOCALES, slug, ordinal, setData, expand, ranges };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Supplied;
