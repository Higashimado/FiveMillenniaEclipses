/**
 * atlas.js — the light-atlas front-end.
 *
 * Owns: record markers (seal divIcons), the floating library (facets +
 * translation-first cards), the fisheye lizhou (language-scoped era ribbon +
 * draggable filter-range window), and a retained fine time-scrub that moves
 * TimeState so the umbra sweeps across the map.
 *
 * Reuses (does NOT re-implement): the map (window.appMap), the astronomy engine
 * (EclipseCtl.selectEvent draws the real contact curves), EclipseLoader (event
 * index + selectByDate/Nearest), TimeState (time engine), I18n (locale), and
 * Seal (js/seal.js) for civ identity.
 *
 * ORBIS: one shared `state` drives map + library + timeline together.
 */

const Atlas = (() => {
  'use strict';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const cssvar = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();
  // TimeState is a lexical global (time.js does NOT attach it to window), so
  // guard on the binding itself — `window.TimeState` would be undefined.
  const TS = typeof TimeState !== 'undefined' ? TimeState : null;

  // ---- Year Domain / Service Window (−3000 … 1999) ----
  const Y0 = -3000,
    Y1 = 1999,
    SPAN = Y1 - Y0;
  const normYear = (y) => (y - Y0) / SPAN;

  // ---- Dynamic LOD: cap on-map markers by importance × viewport × time-span ----
  // Pure render-layer selection — the corpus is never thinned at curation
  // (see yingshoujinshou (collect all available) data philosophy); density is solved here, at draw time.
  const MARKER_BUDGET = 240; // hard cap on simultaneous map markers (tune for perf)
  const VIEW_MARGIN = 0.25; // pad viewport bounds by this fraction before culling
  // zoom → { cell: screen-grid cell size px, k: max markers kept per cell }
  const LOD = (z) =>
    z <= 4
      ? { cell: 64, k: 1 }
      : z === 5
        ? { cell: 56, k: 1 }
        : z === 6
          ? { cell: 52, k: 2 }
          : z === 7
            ? { cell: 48, k: 2 }
            : { cell: 44, k: 3 };
  // importance weights — `significance` is sparse (38/1302), so derive a
  // composite that also protects rare civs (geographic diversity) and rewards
  // multi-vantage events (yishi-duozheng (one event, multiple witnesses)), the project's core value.
  const SIG_W = { landmark: 1000, notable: 400 };
  const CONF_W = { certain: 100, likely: 40, candidate: 10 };
  const rarityW = (c) => (c < 5 ? 260 : c < 20 ? 140 : c < 60 ? 70 : c < 200 ? 25 : 0);
  // deterministic [0,1) tie-breaker from record id — stable across redraws,
  // so the same view never flickers between equal-scored records.
  function jitter(id) {
    let h = 2166136261;
    const s = String(id || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }

  function computeImp(r, civCount, vantage) {
    const corrob = Math.min((vantage - 1) * 25, 100);
    return (SIG_W[r.sig] || 0) + (CONF_W[r.conf] || 0) + rarityW(civCount) + corrob + jitter(r.id);
  }

  // ---- i18n: locale-scoped era ribbons (one family per UI language) ----
  const RIBBONS = {
    'zh-Hans': {
      fam: '中国朝代',
      eras: [
        ['夏', -2070, -1600],
        ['商', -1600, -1046],
        ['周', -1046, -256],
        ['秦', -221, -206],
        ['汉', -206, 220],
        ['三国', 220, 265],
        ['晋', 265, 420],
        ['南北朝', 420, 589],
        ['隋', 589, 618],
        ['唐', 618, 907],
        ['五代', 907, 960],
        ['宋', 960, 1279],
        ['元', 1271, 1368],
        ['明', 1368, 1644],
        ['清', 1636, 1912],
        ['近现代', 1912, 2000],
      ],
    },
    'zh-Hant': {
      fam: '中國朝代',
      eras: [
        ['夏', -2070, -1600],
        ['商', -1600, -1046],
        ['周', -1046, -256],
        ['秦', -221, -206],
        ['漢', -206, 220],
        ['三國', 220, 265],
        ['晉', 265, 420],
        ['南北朝', 420, 589],
        ['隋', 589, 618],
        ['唐', 618, 907],
        ['五代', 907, 960],
        ['宋', 960, 1279],
        ['元', 1271, 1368],
        ['明', 1368, 1644],
        ['清', 1636, 1912],
        ['近現代', 1912, 2000],
      ],
    },
    ja: {
      fam: '日本時代',
      eras: [
        ['古墳', -100, 592],
        ['飛鳥', 592, 710],
        ['奈良', 710, 794],
        ['平安', 794, 1185],
        ['鎌倉', 1185, 1333],
        ['室町', 1336, 1573],
        ['江戸', 1603, 1868],
        ['近代', 1868, 2000],
      ],
    },
    en: {
      fam: 'Western periods',
      eras: [
        ['Antiquity', -800, 476],
        ['Middle Ages', 476, 1400],
        ['Renaissance', 1400, 1600],
        ['Enlightenment', 1600, 1789],
        ['Industrial', 1789, 1914],
        ['Modern', 1914, 2000],
      ],
    },
    fr: {
      fam: 'Périodes occidentales',
      eras: [
        ['Antiquité', -800, 476],
        ['Moyen Âge', 476, 1400],
        ['Renaissance', 1400, 1600],
        ['Lumières', 1600, 1789],
        ['Industrielle', 1789, 1914],
        ['Moderne', 1914, 2000],
      ],
    },
    es: {
      fam: 'Periodos occidentales',
      eras: [
        ['Antigüedad', -800, 476],
        ['Edad Media', 476, 1400],
        ['Renacimiento', 1400, 1600],
        ['Ilustración', 1600, 1789],
        ['Industrial', 1789, 1914],
        ['Moderno', 1914, 2000],
      ],
    },
    it: {
      fam: 'Periodi occidentali',
      eras: [
        ['Antichità', -800, 476],
        ['Medioevo', 476, 1400],
        ['Rinascimento', 1400, 1600],
        ['Illuminismo', 1600, 1789],
        ['Industriale', 1789, 1914],
        ['Moderno', 1914, 2000],
      ],
    },
  };

  const isZh = (l) => l.indexOf('zh') === 0;
  // Global i18n lookup; atlas.* keys live in data/i18n/<locale>/ui.json,
  // missing keys fall back to zh-Hans. Same guard as event-panel.js.
  const T = (k, p) => (typeof I18n !== 'undefined' ? I18n.t(k, p) : k);

  // ---- Highlight the phenomenon phrase inside an original-text string ----
  // Two vocabularies: eclipse, and the transient wording the comet / guest-star / occultation
  // records are actually written in. The Latin-script eclipse words carry an optional qualifier
  // tail because what a reader recognises is the phrase, not its first word: without
  // it, "Eclipse de soleil" and "ECLIPSES LUNAE" light only as far as the space.
  const ECLIPSE_RE = new RegExp(
    [
      '日有?[食蝕蚀]之?、?既?',
      '[日月][食蝕蚀]',
      // Transients: the nouns name the object, the verbs name the approach the entry reports.
      // 入 is kept in the verb set even though the character is common elsewhere: inside these
      // treatise entries it is the approach verb, and a stray highlight costs only ink.
      '客星|彗星|孛星|星孛|彗孛|妖星|[長长]星|流星',
      // 聚/合/會 are the gathering verbs a 合聚 entry is built on (「三星合于張」). 合 is
      // common outside these entries, but by the same reasoning as 入 above, a stray
      // highlight costs only ink while a missing one leaves the claim unmarked.
      '[犯掩守入聚合會会]',
      'nisshoku|il-sik|nhật thực|yuè shí|rì yǒu shí zhī|hi ni shoku ari',
      'khusif\\w*|ἐξελείφθη|νὺξ ἐγένετο',
      '(?:eclips\\w*|obscurat\\w*|deliqui\\w*)' +
        '(?:(?:\\s+(?:de|del|di|du|of|la|le|el|il|the)){0,2}\\s*(?:sol\\w*|lun\\w*|soleil|lune|moon|sun))?',
      'attal\\w*|AN\\.MI|dies\\s+quasi\\s+nox',
    ].join('|'),
    'gi'
  );
  const _esc = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  // Inline ' data-gloss="…"' for a glossary slug (empty when unknown / I18n absent),
  // feeding the shared glossary-tip.js hover card — same contract as I18n.glossAttr.
  const _gloss = (slug) => (typeof I18n !== 'undefined' && I18n.glossAttr ? I18n.glossAttr(slug) : '');
  const highlightPhrase = (s) => _esc(s).replace(ECLIPSE_RE, (m) => '<mark class="hl">' + m + '</mark>');
  const _hasCJK = (s) => /[㐀-鿿぀-ヿ가-힣]/.test(String(s || ''));
  // A record whose eclipse was never actually witnessed at this place: reckoned but unseen,
  // reckoned and absent, or seen off by cloud.
  const _unwitnessed = (rec) =>
    rec.obsStatus === 'predicted_unseen' || rec.obsStatus === 'predicted_nonevent' || rec.obsStatus === 'obscured';

  // Era-tag attributes for a record. An unwitnessed sighting takes the quewei frame plus the
  // gloss naming which of the three it was; every other record takes the bare tag. All three
  // statuses share ONE frame on purpose — a scan down the rail carries one bit ("this entry is
  // flagged"), and the distinction is the hover card's job. cls differs by register: the rail
  // card sets rc-year, the marker popup rp-year, and both must fly the same flag or the same
  // record reads as clean on the map and flagged in the list.
  function eraAttrs(rec, cls) {
    if (!_unwitnessed(rec)) return ' class="' + cls + ' num"';
    return ' class="' + cls + ' num era-quewei"' + _gloss('status_' + rec.obsStatus);
  }

  // ---- Astronomical year from an event_date string ("-000762-06-07" / "0975-…") ----
  function _eventYear(dateStr) {
    if (!dateStr) return null;
    const neg = dateStr[0] === '-';
    const y = parseInt((neg ? dateStr.slice(1) : dateStr).split('-')[0], 10);
    return neg ? -y : y;
  }

  // A UTC Date for an event_date string, BCE-safe (never Date.UTC on 0–99).
  function _dateFromStr(dateStr) {
    if (!dateStr) return null;
    const neg = dateStr[0] === '-';
    const parts = (neg ? dateStr.slice(1) : dateStr).split('-').map(Number);
    const y = neg ? -parts[0] : parts[0];
    const d = new Date(0);
    d.setUTCFullYear(y, (parts[1] || 1) - 1, parts[2] || 1);
    d.setUTCHours(12, 0, 0, 0);
    return d;
  }

  // ---- Display helpers ----
  // lang param kept for call-site compatibility; T() reads the active locale.
  function displayYear(y) {
    return y <= 0 ? T('atlas.year.bce', { n: 1 - y }) : T('atlas.year.ce', { n: y });
  }

  function eraLabel(lang, y) {
    const es = (RIBBONS[lang] || RIBBONS.en).eras;
    for (const e of es) {
      if (y >= e[1] && y < e[2]) return e[0];
    }
    return null;
  }

  function yearLabel(lang, y) {
    const e = eraLabel(lang, y);
    const dy = displayYear(y);
    return e ? e + ' · ' + dy : dy;
  }

  // ---- event_date string → numeric {y,m,d} (BCE-safe; mirrors _eventYear) ----
  function _ymdFromStr(dateStr) {
    if (!dateStr) return null;
    const neg = dateStr[0] === '-';
    const parts = (neg ? dateStr.slice(1) : dateStr).split('-').map(Number);
    return { y: neg ? -parts[0] : parts[0], m: parts[1] || 1, d: parts[2] || 1 };
  }

  // ---- Civil calendar of a stored date (the calendar the date was actually kept in) ----
  // The corpus stores every date in proleptic Gregorian — data filenames, event_date
  // and share links all use it — but no pre-1582 observer kept that calendar, and
  // every reference this atlas can be checked against prints pre-reform dates in the
  // Julian calendar (NASA's Five Millennium Canon, Stephenson, Liu Ciyuan, Zhang
  // Peiyu). So reader-facing dates convert to Julian before 1582-10-15; the stored
  // Gregorian form survives in the hover card that _calGloss builds.
  //
  // `parts` is the component count of the source string, so precision survives the
  // conversion. Month precision names the Julian month off the 15th, because the
  // OS/NS offset applied to a 1st or a 31st can shift the month across a boundary.
  // Year precision has no month/day to convert with and passes through untouched.
  function _civilYmd(ymd, parts) {
    const plain = { y: ymd.y, m: ymd.m, d: ymd.d, julian: false };
    if (parts < 2 || typeof SinoCal === 'undefined') return plain;
    const jd = SinoCal.toJulian(ymd.y, ymd.m, parts >= 3 ? ymd.d : 15);
    return jd.beforeReform ? { y: jd.y, m: jd.m, d: jd.d, julian: true } : plain;
  }

  // ---- Science-row date (science row l1): civil calendar, localized separators ----
  // CJK/ja render 年月日 with Arabic numerals (leading zeros stripped; BCE → 前N年).
  // zh AND ja: a half-width space at every digit/kanji boundary (digit/kanji boundary space rule,
  // GB/T 15834 — ja follows the same rule), but no *extra* space is
  // added at the year/date seam — the single boundary space already sits there.
  function _sciDate(dateStr, lang) {
    const ymd = _ymdFromStr(dateStr);
    if (!ymd) return dateStr;
    // Render only the components the record actually asserts. event_date is stored
    // truncated to its precision (year "0837", month "0616-08", day "0626-03-29"), so a
    // missing month/day must NOT be padded to 1 — that fabricated the spurious "8 月 1 日"
    // on a 月-precision 隋書 record. Count components off the string (BCE: drop the sign),
    // not off _ymdFromStr, whose ||1 default other callers deliberately rely on.
    const parts = (dateStr[0] === '-' ? dateStr.slice(1) : dateStr).split('-').length;
    const cal = _civilYmd(ymd, parts);
    if (!(isZh(lang) || lang === 'ja')) return _westernSciDate(dateStr, cal, parts);
    const pre = isZh(lang) ? '前 ' : '紀元前 ';
    let s = (cal.y <= 0 ? pre + (1 - cal.y) : String(cal.y)) + ' 年';
    if (parts >= 2) s += ' ' + cal.m + ' 月';
    if (parts >= 3) s += ' ' + cal.d + ' 日';
    return s;
  }

  // Western l1. A Julian date must NOT be written in extended-ISO form: ISO 8601 is
  // defined on the Gregorian calendar, so "-0719-02-21" would assert something false.
  // Pre-reform dates take the month-name form chronicles actually read in ("21 Feb 720
  // BCE"); post-reform dates keep the canonical astro-ISO string, which is also the
  // data-filename form. The era-year gloss stays on the ISO branch because a raw
  // extended-ISO year misleads twice over (a bare -762 looks like "762 BCE" but the
  // astronomical −762 is 763 BCE; year 0 is 1 BCE) — only where it is ambiguous, i.e.
  // negative or < 1000; a plain four-digit CE year needs no "(1560 CE)" noise.
  function _westernSciDate(dateStr, cal, parts) {
    if (cal.julian) {
      const yr = cal.y <= 0 || cal.y < 1000 ? displayYear(cal.y) : String(cal.y);
      const mon = T('julian.month.' + cal.m);
      return (parts >= 3 ? cal.d + ' ' + mon : mon) + ' ' + yr;
    }
    const iso = _astroIso(dateStr);
    const y = _eventYear(dateStr);
    if (y == null) return iso;
    return y <= 0 || y < 1000 ? iso + ' (' + displayYear(y) + ')' : iso;
  }

  // Written form of the stored proleptic-Gregorian date for the Julian gloss card
  // below — "1185 年 5 月 1 日" (zh/ja) or "1 May 1185" (Latin), never the dashed
  // ISO form, which the reform-date rule (js/atlas.js:303) reserves for post-reform
  // dates only. No BCE/CE marker is added for a plain CE year — only the pre-1000
  // ambiguous case (negative or 3-digit) needs displayYear's "公元前/BCE" prefix.
  function _gregEquivReadable(dateStr, lang) {
    const ymd = _ymdFromStr(dateStr);
    if (!ymd) return dateStr;
    const parts = (dateStr[0] === '-' ? dateStr.slice(1) : dateStr).split('-').length;
    if (isZh(lang) || lang === 'ja') {
      const pre = isZh(lang) ? '前 ' : '紀元前 ';
      let s = (ymd.y <= 0 ? pre + (1 - ymd.y) : String(ymd.y)) + ' 年';
      if (parts >= 2) s += ' ' + ymd.m + ' 月';
      if (parts >= 3) s += ' ' + ymd.d + ' 日';
      return s;
    }
    const yr = ymd.y <= 0 || ymd.y < 1000 ? displayYear(ymd.y) : String(ymd.y);
    const mon = T('julian.month.' + ymd.m);
    if (parts >= 3) return ymd.d + ' ' + mon + ' ' + yr;
    return parts >= 2 ? mon + ' ' + yr : yr;
  }

  // Inline ' data-gloss="…"' explaining which calendar a rendered date is in, for the
  // shared glossary-tip card. Only the converted (Julian) dates carry it: a post-reform
  // date is plainly Gregorian and a year-only date is calendar-agnostic, so glossing
  // either would be noise. `lang` defaults to the live locale so callers outside
  // this module (Atlas.calGloss, used by the event panel) need not thread it.
  function _calGlossFor(dateStr, lang) {
    const ymd = _ymdFromStr(dateStr);
    if (!ymd || typeof I18n === 'undefined' || !I18n.glossAttr) return '';
    const parts = (dateStr[0] === '-' ? dateStr.slice(1) : dateStr).split('-').length;
    if (!_civilYmd(ymd, parts).julian) return '';
    return I18n.glossAttr('cal_julian', { date: _gregEquivReadable(dateStr, lang || state.lang) });
  }

  // Canonicalize an extended-ISO date to the NASA 5MCSE display form: sign +
  // 4-digit zero-padded |year| + -MM-DD (e.g. -000762-06-07 → -0762-06-07,
  // 0791-07-10 stays). The service window −3000…+1999 fits 4 digits. Data files
  // keep their own six-digit extended-ISO padding, untouched by this; the change
  // here is display-only and never touches _ymdFromStr / _eventYear.
  function _astroIso(dateStr) {
    if (!dateStr) return dateStr;
    const neg = dateStr[0] === '-';
    const m = (neg ? dateStr.slice(1) : dateStr).match(/^0*(\d+)(-\d\d-\d\d)$/);
    if (!m) return dateStr;
    const yr = m[1].padStart(4, '0');
    return (neg ? '-' : '') + yr + m[2];
  }

  // Chronicle-line bare-year fallback (no nianhao/nengo era covers this year, e.g.
  // deep BCE): the reign-year format above always reads in Han numerals ("宋淳熙十二
  // 年"), so the fallback should match instead of jarring into Arabic digits inside
  // an otherwise all-Han prose line ("前735" → "前七三五"). Once the digits are
  // Han glyphs there is no digit/kanji boundary left, so (unlike displayYear, which
  // this deliberately does NOT reuse) no space is inserted.
  function chronicleYear(lang, y) {
    if (isZh(lang)) return y <= 0 ? '公元前' + cjkDigits(1 - y) : '公元' + cjkDigits(y);
    return y <= 0 ? '紀元前' + cjkDigits(1 - y) : cjkDigits(y) + '年';
  }

  function chronicleYearLabel(lang, y) {
    const e = eraLabel(lang, y);
    const yr = chronicleYear(lang, y);
    return e ? e + ' · ' + yr : yr;
  }

  // ---- Beijing civil day of an event (the day an East Asian observer would have logged) ----
  // Event dates are greatest-eclipse *UT* days, but the chronicle registers reckon in the
  // observer's own civil day, and East-8 runs eight hours ahead: from 16:00 UT onward the
  // event already belongs to the next day in Chang'an. That is a third of the corpus,
  // so reckoning ganzhi and the lunisolar month off the UT day dates those one day
  // early against the very sources this line echoes.
  //
  // Shifting the instant and reading the civil date off it needs no day-boundary
  // special case and no JDN inverse. Mutating an existing Date sidesteps the
  // Date.UTC 0–99 remap. Falls back to the stored date when there is no computed
  // instant — transient records carry none.
  function _bjCivilYmd(dateStr, peakIso) {
    const ymd = _ymdFromStr(dateStr);
    if (!ymd || !peakIso) return ymd;
    const t = new Date(peakIso);
    if (isNaN(t.getTime())) return ymd;
    t.setUTCHours(t.getUTCHours() + 8);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  // ---- Chronicle line for the shu'er (shilu): a Tianwenzhi-style, localized dating ----
  // CJK (zh/ja): reign-era + reckoned lunisolar (season+month+ganzhi), closed by shuo (solar eclipse syzygy) / wang
  // (lunar eclipse) with the anchor rubricated in vermilion (zhu). Western: cultural period + year only,
  // since l1 already carries the Julian-calendar day. The lunisolar is computed
  // (SinoCal.lunisolar), a reconstruction — not a source quotation.
  function chronicleStr(y, kind, dateStr, lang, precision, lunarMonth, peakIso) {
    if (y == null) return '';
    // The CJK registers reckon on the observer's civil day, so they read the date off the
    // East-8 shift of the computed instant; the Western branch needs only the year.
    const ymd = _bjCivilYmd(dateStr, peakIso);
    const sino = typeof SinoCal !== 'undefined';
    // All three registers track the record's true precision — none renders a component the
    // source doesn't support. Eclipses are always day-precise; a transient (kexing/huibo) may be
    // month/year. Day → reckon lunisolar day + ganzhi from the full date. Month → the source-recorded
    // lunisolar month recorded on the record itself, no ganzhi day. Year → reign-year only.
    const dayLevel = kind === 'solar' || kind === 'lunar' || precision === 'day';
    const hasCal = ymd && dayLevel && sino;
    if (isZh(lang) || lang === 'ja') {
      // zh: Chinese nianhao (duizhao/nianhao.json). ja: nengō (duizhao/nengo.json) — Japan has kept a
      // continuous nengō system since 645 Taika (645), so it gets the same reign-year
      // treatment as zh rather than the coarse RIBBONS period band.
      // The reign year follows the civil day, not the UT one: a late-December event that
      // East-8 carries into January belongs to the next reign year in the annals.
      const cy = ymd ? ymd.y : y;
      const prefix = isZh(lang)
        ? nianhaoYear(cy, lang) || chronicleYearLabel(lang, cy)
        : nengoYear(cy) || chronicleYearLabel(lang, cy);
      // lianxie (continuous writing): reign-year runs straight into the lunisolar date, no space — this is
      // how Tianwenzhi chronicle entries actually read ("宋淳熙十二年夏四月癸丑朔").
      // Tail char: solar eclipse closes on shuo, lunar eclipse on wang (both rubricated vermilion/zhu); a transient is
      // not tied to syzygy, so its day just reads "…ganzhi-ri day", plain ink.
      if (hasCal) {
        const ls = SinoCal.lunisolar(ymd.y, ymd.m, ymd.d);
        const body = (ls ? ls.label : '') + SinoCal.dayGanzhi(ymd.y, ymd.m, ymd.d).str;
        if (kind === 'solar' || kind === 'lunar') {
          const anchor = '<span class="ev-anchor">' + (kind === 'solar' ? '朔' : '望') + '</span>';
          return _esc(prefix) + (body ? _esc(body) + anchor : '');
        }
        return _esc(prefix) + (body ? _esc(body) + '日' : '');
      }
      // Month precision: season + lunisolar month name from the recorded month (no ganzhi day, no syzygy tail).
      // event_date's Gregorian month ≠ the lunisolar month, so this must come off lunarMonth,
      // never a reckoning of the coarse date. e.g. 隋大业十二年夏六月.
      if (sino && precision === 'month' && lunarMonth) {
        return _esc(prefix + SinoCal.seasonLabel(lunarMonth) + SinoCal.monthName(lunarMonth));
      }
      return _esc(prefix); // year precision (or no recorded month): reign-year only
    }
    // Western: cultural period + year. The Julian-calendar day used to be spelled out
    // here as an Old-Style counterpart to a Gregorian l1; l1 is itself Julian now, so
    // repeating it would print the same date twice.
    return _esc(yearLabel(lang, y));
  }

  // Line-1 tail for a jingguan transient slip (kexing/huibo), two ways:
  //   identified   → 「超新星 · SN 1054」, 「彗星 · 1P/Halley」
  //   unidentified → 「未确认」 alone, no fabricated type
  // The type word is derived from the catalogue DESIGNATION, which is the only part
  // of a record's `object` that says WHAT the thing is: an SN … designation is a
  // supernova, and anything else carrying one (1P/Halley, C/1264 N1) is a comet.
  // `object` carries {key, designation, basis} and nothing else — in particular no
  // type or confirmation field, so these two outcomes are the whole space. The
  // designation is language-neutral; only the type word is localised.
  function transientL1(trec, lang) {
    const id = trec && trec.ident;
    const desig = (id && id.designation) || '';
    const unconf = T('transient.unconfirmed');
    const name = desig ? T('transient.kind.' + (/^SN\b/i.test(desig) ? 'supernova' : 'comet')) : '';
    if (!name) return ' · <span class="ev-strip-type">' + _esc(unconf) + '</span>';
    return (
      ' · <span class="ev-strip-type">' +
      _esc(name) +
      '</span>' +
      ' · <span class="ev-strip-mag">' +
      _esc(desig) +
      '</span>'
    );
  }

  // Focus era: the RIBBONS entry [name,start,end] covering the "current" year — the
  // selected record's year if one is selected, else the fisheye focus year (the
  // celadon needle). Mirrors drawSpine's sel-else-focus precedent; null when this
  // locale's periodization has no band over that year (pre-Antiquity, table gaps).
  function focusEra() {
    const sel = state.sel ? RECS.find((r) => r.id === state.sel) : null;
    const yr = sel ? sel.year : Math.round(Y0 + state.focusN * SPAN);
    const es = (RIBBONS[state.lang] || RIBBONS.en).eras;
    for (const e of es) {
      if (yr >= e[1] && yr < e[2]) return e;
    }
    return null;
  }

  // #reccount: the fan-N-tiao (entry count) tally (line 1) + the "of which" current-era subset (line 2). Called from
  // renderList (filter/range/search/mode changes) AND the end of drawTimeline (focus scrub
  // rides focusStep→drawTimeline), so both lines track the needle live. The tally counts
  // currentArray() — the CURRENT list's population (records → filtered records; all-events → the
  // queried events of that kind) — so it always == what the list pages, in either mode. The
  // era subset is counted within that SAME array via yearOf, so it is a true subset (m ≤ n)
  // and the "of which" (nei) framing holds. Clause omitted when era is null or 0.
  function updateReccount() {
    const cnt = document.getElementById('reccount');
    if (!cnt) return;
    const arr = currentArray();
    const e = focusEra();
    const m = e
      ? arr.reduce((a, it) => {
          const y = yearOf(it);
          return a + (y >= e[1] && y < e[2] ? 1 : 0);
        }, 0)
      : 0;
    // Empty shelf: 「未收」 reads better than the account-book 「凡零条」; era line omitted.
    const fmtN = (n) => (isZh(state.lang) ? cjkCount(n) : String(n));
    const total = T('atlas.count.total', { n: fmtN(arr.length) });
    const eraStr = e && m ? T('atlas.count.era', { era: e[0], n: fmtN(m) }) : '';
    cnt.innerHTML = arr.length
      ? '<span class="rc-total">' +
        _esc(total) +
        '</span>' +
        (eraStr ? '<span class="rc-era">' + _esc(eraStr) + '</span>' : '')
      : '<span class="rc-total">' + _esc(T('atlas.none')) + '</span>';
    // active site scope (spiderfy overflow) → dismissible chip below the count
    if (state.site) {
      const first = RECS.find((r) => r.lat != null && siteKey(r) === state.site);
      const chip = document.createElement('span');
      chip.className = 'chip sitechip';
      chip.innerHTML = '<span>×</span><span>' + (first ? placeLabel(first, state.lang) : _esc(state.site)) + '</span>';
      chip.onclick = () => {
        state.site = null;
        renderAll();
      };
      cnt.appendChild(chip);
    }
  }

  // ---- CJK numeral helpers ----
  // Positional digit-by-digit: 1690 → 一六九〇 (for fan-N-tiao (entry-count) record counts).
  function cjkDigits(n) {
    const D = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    return String(Math.abs(Math.round(n)))
      .split('')
      .map((c) => D[+c])
      .join('');
  }

  // Ordinal place-value: 49 → 四十九, 10 → 十, 1 → 一 (for volumes and reign years).
  function cjkOrdinal(n) {
    const CH = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n <= 0) return CH[0] || '〇';
    if (n < 10) return CH[n];
    if (n < 100) {
      const t = Math.floor(n / 10),
        o = n % 10;
      return (t === 1 ? '' : CH[t]) + '十' + (o ? CH[o] : '');
    }
    if (n < 1000) {
      const h = Math.floor(n / 100),
        r = n % 100;
      return CH[h] + '百' + (r < 10 && r > 0 ? '零' + CH[r] : r ? cjkOrdinal(r) : '');
    }
    return String(n); // fallback for >999 (won't occur in this use)
  }

  // Cardinal place-value spelling for tallies: 1256 → 一千二百五十六 (fan N-tiao tally).
  // Internal 零 fills gaps (1006 → 一千零六); handles up to 9999 + one 万 group; arabic beyond.
  function cjkCount(n) {
    const CH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const U = ['', '十', '百', '千'];
    n = Math.abs(Math.round(n));
    if (n === 0) return CH[0];
    if (n >= 100000) return String(n); // beyond corpus scale
    const seg = (m) => {
      // 0..9999 with internal 零
      let out = '',
        zero = false;
      for (let pl = 3; pl >= 0; pl--) {
        const d = Math.floor(m / Math.pow(10, pl)) % 10;
        if (d === 0) {
          if (out) zero = true;
          continue;
        }
        if (zero) {
          out += CH[0];
          zero = false;
        }
        out += pl === 1 && d === 1 && !out ? U[pl] : CH[d] + U[pl]; // 十五 not 一十五
      }
      return out;
    };
    const wan = Math.floor(n / 10000),
      rem = n % 10000;
    let str = wan ? seg(wan) + '万' : '';
    if (rem) {
      if (wan && rem < 1000) str += CH[0];
      str += seg(rem);
    }
    return str;
  }

  // Nianhao lookup: returns e.g. "清光绪十六年" for zh-Hans/zh-Hant, null otherwise.
  // Binary search for last era entry where e.y <= yr; falls back for out-of-range years.
  function nianhaoYear(yr, lang) {
    if (!NIANHAO || !NIANHAO.eras || !NIANHAO.eras.length) return null;
    const hant = lang === 'zh-Hant';
    const eras = NIANHAO.eras;
    if (yr < eras[0].y || yr >= 1912) return null; // outside 建元–宣统 range (宣统三年止)
    let lo = 0,
      hi = eras.length - 1,
      found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (eras[mid].y <= yr) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return null;
    const e = eras[found];
    const dyn = hant ? e.dt : e.d;
    const name = hant ? e.nt : e.n;
    const startY = e.s !== undefined ? e.s : e.y;
    const reign = yr - startY + 1;
    const reignStr = reign === 1 ? '元年' : cjkOrdinal(reign) + '年';
    return dyn + name + reignStr;
  }

  // Nengō lookup (nengō): mirrors nianhaoYear but single-line (no dynasty) and
  // with explicit `gap` entries for the two real 7th-century interregna when no
  // era name was in use — those must fall back to the period label, not silently
  // inherit the previous era's name.
  function nengoYear(yr) {
    if (!NENGO || !NENGO.eras || !NENGO.eras.length) return null;
    const eras = NENGO.eras;
    if (yr < eras[0].y) return null;
    let lo = 0,
      hi = eras.length - 1,
      found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (eras[mid].y <= yr) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return null;
    const e = eras[found];
    if (e.gap) return null;
    const reign = yr - e.y + 1;
    return e.n + (reign === 1 ? '元年' : cjkOrdinal(reign) + '年');
  }

  // Normalise two strings for de-dup comparison: collapse whitespace, unify smart
  // quotes/dashes, strip trailing punctuation. Exact equality is too brittle — a
  // trailing full-stop or a curly vs. straight apostrophe makes the same text render twice.
  function _sameText(a, b) {
    function norm(s) {
      if (!s) return '';
      return s
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, '-')
        .replace(/[.,;:!?。，；：！？]+$/, '');
    }
    return norm(a) === norm(b);
  }

  // A source attested in the viewer's own language is its own translation — 44 records come
  // from public-domain French editions, so a French reader would otherwise read the same
  // paragraph twice. Render the original alone in that case.
  function transLine(rec, lang, cls) {
    const t = transText(rec, lang);
    if (!t || _sameText(t, rec.orig || '')) return '';
    return '<div class="' + cls + '">' + _esc(t) + '</div>';
  }

  // The translation to show, or the original when this locale has none — a card
  // must never come up blank just because one of the seven renderings is missing.
  function transText(rec, lang) {
    return I18n.pick(rec.textMap, lang, { zh: true }) || rec.orig;
  }

  // ---- Card place / source (structured, per-locale, no embedded English) ----
  const _cjkLang = (l) => l === 'zh-Hans' || l === 'zh-Hant' || l === 'ja';
  // Recursively collect every string leaf out of a value that may be a string, a plain
  // array, or a nested {locale: value} object (diming.json's `modern`/`aliases` shape) —
  // used to build search haystacks without "[object Object]" leaking in.
  function _flattenHay(v) {
    if (v == null) return [];
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v.flatMap(_flattenHay);
    if (typeof v === 'object') return Object.values(v).flatMap(_flattenHay);
    return [];
  }

  // A place is shown by its historical name, with the modern name as a parenthetical
  // gloss where the two differ. Both blocks are BCP-47-keyed, so both go through the
  // one ladder: only 37 of 164 places carry a modern name, and only a handful of those
  // record a per-locale exonym (Beijing vs Pékin/Pekín/Pechino), so most locales
  // resolve down the chain rather than to a field of their own.
  function placeLabel(rec, lang) {
    const p = rec.placeI18n;
    if (!p) return _esc(rec.place);
    let html = _esc(I18n.pick(p.name, lang));
    const modern = I18n.pick(p.modern, lang);
    // CJK locales: no space before the parenthetical gloss (their punctuation supplies it).
    // Non-CJK: one space inside the span, before the text — matches the pre-existing markup.
    if (modern)
      html +=
        (_cjkLang(lang) ? '<span class="rp-mod">' : '<span class="rp-mod"> ') +
        T('atlas.place.modern', { name: _esc(modern) }) +
        '</span>';
    return html;
  }

  // Pointer type of the gesture in flight. Touch has no hover state, so a tap on
  // an elided place name carries two jobs at once — reveal the name, select the
  // record — and the handlers below have to tell the two apart. A mouse never
  // needs this: hover already revealed the name before the click.
  let _touchTap = false;

  // The year cell is `flex: 0 0 auto` + nowrap, so the whole width shortfall lands
  // on the place name and what gets cut is always the tail: the modern gloss.
  //
  // A gloss is ONE INDIVISIBLE UNIT — half of `(now Hangzhou)` names nowhere — so
  // never let the ellipsis land inside it. Drop it whole, hand the full label to
  // the site's hover card, and leave a hairline caret so the absence is legible.
  //
  // Measure, never count characters: Spectral and Source Han Serif differ by ~2x in
  // advance width for the same string, so the threshold moves with the locale. Ask
  // the layout engine, and re-ask after any width, locale or webfont change.
  function fitPlaceLabels(root) {
    const scope = root || document;
    scope.querySelectorAll('.rc-place, .rp-place').forEach((el) => {
      const mod = el.querySelector('.rp-mod');
      // Reset first: a re-fit has to start from the full label, not from whatever
      // the previous pass left standing at the previous width.
      if (mod) mod.classList.remove('is-elided');
      el.classList.remove('has-elision');
      const full = el.textContent.trim();
      if (mod && el.scrollWidth > el.clientWidth + 0.5) {
        mod.classList.add('is-elided');
        el.classList.add('has-elision');
        // The caret costs width of its own. If it alone re-overflows the row,
        // spend that width on the name and let the ellipsis stand instead.
        if (el.scrollWidth > el.clientWidth + 0.5) el.classList.remove('has-elision');
      }
      // Two ways to withhold, and the elision hides the second one: once the gloss
      // is dropped the row no longer overflows, so an overflow-only test would
      // call the row complete and strip the very affordance the drop created the
      // need for.
      const elided = !!mod && mod.classList.contains('is-elided');
      if (elided || el.scrollWidth > el.clientWidth + 0.5) {
        // data-gloss, not data-tip: the card wraps, clamps to 260px and accepts the
        // pointer so the name can be dragged and copied; the .is-label chip is
        // nowrap and pointer-transparent, which a long place name outgrows.
        el.setAttribute('data-gloss', full);
        el.setAttribute('tabindex', '0');
      } else {
        el.removeAttribute('data-gloss');
        el.removeAttribute('tabindex');
      }
    });
  }

  // sref in v2 is the sources.json entry {title?, author?, attribution?}, looked up in
  // _map() by source.key. ja falls back to zh-Hant deliberately: a Chinese book title IS
  // written in its traditional form in Japanese (《宋書·天文志》), unlike a place name,
  // where ja needs its own field (see placeLabel).
  function sourceTitle(s, lang) {
    return I18n.pick(s.title, lang, { rom: true, zh: true });
  }

  // Names joined by the locale's own list separator; a trailing 等 / "et al." marks the
  // unnamed co-compilers the source itself only gestured at.
  function sourceAuthors(s, lang) {
    if (!s.author || !s.author.length) return '';
    const cjk = _cjkLang(lang);
    const names = s.author.map((a) => (cjk ? a.name : a.rom || a.name));
    let out = names.join(cjk ? '、' : ', ');
    if (s.author.some((a) => a.et_al)) out += cjk ? ' 等' : ' et al.';
    return out;
  }

  // Fill a locus_url template from a record's locus object: each {field} placeholder takes
  // that locus key's value, percent-encoded on its own. Because the segments are now
  // separate fields rather than one '/'-joined string, a multi-segment locus
  // (朝鮮王朝實錄/{reign}/{year}) needs no special casing — the '/' lives in the template.
  // A template whose fields the record does not supply yields no link at all rather than a
  // URL with a literal "{volume}" in it.
  function _locusUrl(tmpl, locus) {
    if (!tmpl || !locus) return null;
    let missing = false;
    const url = tmpl.replace(/\{([a-z_]+)\}/g, (_, f) => {
      if (locus[f] == null) {
        missing = true;
        return '';
      }
      return encodeURIComponent(locus[f]);
    });
    return missing ? null : url;
  }

  function sourceLabel(rec, lang) {
    const s = rec.sref;
    // A source is cited by its title; an entry with no title (18th-20th c. observers, who
    // published no book we name) is cited by its author; one with neither — a genuinely
    // anonymous, untitled communication — falls back to its attribution.
    // The card line stays the work's name alone, as it has always been — the compiler is
    // available in the entry for anyone reading sources.json, but 脫脫 等《宋史·天文志》 on
    // every one of 5,126 cards is noise, not scholarship.
    // No entry at all means source.key names something sources.json does not define —
    // a data error. Show the bare key rather than an empty citation, so it is visible.
    const txt = s ? sourceTitle(s, lang) || sourceAuthors(s, lang) || s.attribution || '' : rec.srcKey;
    const body = rec.srcUrl
      ? '<a class="src-link" href="' + _esc(rec.srcUrl) + '" target="_blank" rel="noopener">' + _esc(txt) + '</a>'
      : _esc(txt);
    // Show transmission kind so readers know when they are reading a translation or
    // a passage preserved only via another work (CMOS 18e §14.260 visibility principle).
    const editions = (s && s.editions) || [];
    const cons = editions.find((e) => e && e.consulted === true) || editions[0] || {};
    const kind = cons.kind;
    let suffix = '';
    if (kind === 'trans' && cons.by)
      suffix = '<span class="src-via">' + T('atlas.src_via_trans', { by: cons.by }) + '</span>';
    else if (kind === 'quot' && cons.by)
      suffix = '<span class="src-via">' + T('atlas.src_apud', { by: cons.by }) + '</span>';
    else if (kind === 'cite') suffix = '<span class="src-via">' + T('atlas.src_catalog') + '</span>';
    return T('atlas.src') + body + suffix;
  }

  // ---- Card note (editorial annotation, per-locale) ----
  // A note is the project's own editorial voice, so a western locale shows English
  // or nothing — falling through to the Chinese note would read to a French reader
  // as though the editor had addressed them in Chinese. Hence no { zh: true } here,
  // unlike transText, where the Han original IS the thing worth showing.
  function noteLabel(rec, lang) {
    const txt = I18n.pick(rec.noteI18n, lang);
    return txt ? _esc(txt) : '';
  }

  // ---- State (ORBIS single source) ----
  // Default view = Eurasia (map center/zoom in map-boot.js) framed by three
  // historically load-bearing eclipses: −762 Assyrian Bur-Sagale (chronology
  // keystone) → 1187 four-continent multi-vantage total [korean/italian/
  // british/syriac] (fisheye focus — widest civ-span single event in corpus,
  // "same sky, four continents") → 1919 Eddington relativity test.
  // civ filter is single-select: null = all civilizations, or one civ key.
  // site: a same-coordinate scope set by a spiderfy overflow chip (null = off).
  // mode: 'records' (curated records cards) | 'events' (all-events — all eclipse events,
  // paged). selEv: selected event key "date|kind" in all-events mode.
  const state = {
    lang: 'en',
    civ: null,
    type: 'solar',
    q: '',
    sel: null,
    site: null,
    mode: 'records',
    selEv: null,
    focusN: normYear(1187),
    range: [-762, 1919],
  };

  // Shared list pager (BOTH records and all-events — only one renders into #list at a
  // time). [winStart, winEnd) index into the current mode's sorted array; winLen
  // caches that array's length for the pager/wheel. winSeedKey remembers what the
  // window was seeded for so a plain re-render preserves it (for load-more), while
  // any filter change re-seeds it centered on the lizhou focus year. Constants mirror
  // AstroMeteoMap's makeListController.
  let winStart = 0,
    winEnd = 0,
    winLen = 0,
    winSeedKey = '';
  const INITIAL_BEFORE = 10,
    INITIAL_AFTER = 10,
    PAGE_SIZE = 20,
    MAX_WINDOW = 60;

  let map = null,
    eclipseCtl = null,
    markerLayer = null,
    markerById = {};
  let bandLayer = null; // central-band shadow overlay (total/annular eclipse path)
  let _solarByDate = null; // lazy Map(date → solar event) for records-mode lookup
  const _bandCache = new Map(); // date → Promise<band ring | null> (see drawBands)
  let _bandToken = 0; // guards against stale async band draws
  let RECS = []; // mapped records within the service window
  let MANIFEST = null; // data/records/manifest.json (file list + per-file counts)
  const _loadedPh = new Set(); // phenomena whose shards are already in RECS
  const _phLoading = new Map(); // phenomenon → in-flight load Promise (dedupes concurrent asks)
  let CIV_COUNT = {}; // civ → corpus-wide record count, read off the manifest
  let CIV_NAMES = {}; // civ → wenming.json row, for the civ-name search haystack
  let PRESENT_CIVS = []; // civs actually present (ordered by Seal.CIVS)
  let NIANHAO = null; // lazy-loaded Chinese reign-era table (data/duizhao/nianhao.json)
  let NENGO = null; // lazy-loaded Japanese era-name table (data/duizhao/nengo.json)
  let GAZ = {}; // place concordance (data/duizhao/diming.json .places), keyed by
  // place_key — the canonical observed_at/place_i18n a
  // record inlines only when it OVERRIDES — the build strips inline place names
  // out of the records, and _map below inverts that strip at read time.

  function _civHay(civ) {
    const row = CIV_NAMES[(civ || '').toLowerCase()];
    return row ? Object.values(row).join(' ') : civ || '';
  }

  // ---- Corpus loading (phenomenon-scoped) ----
  // The corpus is 14.4 MB across 51 NDJSON shards, and 10.3 MB of that is
  // occultation alone — a register most readers never open. Loading it all before
  // first paint made the reader wait on 12,035 records to see the ~1,270 solar ones
  // the default view shows. Shards are fetched per phenomenon instead: the active
  // one blocks first paint, the rest stream in behind it.
  function _shardsFor(ph) {
    return ((MANIFEST && MANIFEST.files) || []).filter((f) => f.phenomenon === ph);
  }

  // Fetch + project one phenomenon's shards into RECS. Idempotent, and concurrent
  // callers share one in-flight promise — setType() and the background sweep can
  // both ask for the same phenomenon in the same tick.
  function loadPhenomenon(ph) {
    if (_loadedPh.has(ph)) return Promise.resolve(false);
    if (_phLoading.has(ph)) return _phLoading.get(ph);
    const job = Promise.all(
      _shardsFor(ph).map((f) =>
        fetch(`data/records/${f.path}`)
          .then((r) => r.text())
          .then((t) =>
            t
              .split('\n')
              .filter(Boolean)
              .map((l) => JSON.parse(l))
          )
          .catch(() => [])
      )
    ).then((parts) => {
      const mapped = parts
        .flat()
        .map(_map)
        .filter((r) => r.year != null && r.year >= Y0 && r.year <= Y1);
      RECS = RECS.concat(mapped);
      _loadedPh.add(ph);
      _phLoading.delete(ph);
      _rescoreImportance();
      return true;
    });
    _phLoading.set(ph, job);
    return job;
  }

  // civCount comes off the manifest, so the rarity term is exact from the first
  // frame and does not shift as later shards land. vantage is a property of the
  // records actually held, so it is recomputed on every merge.
  function _rescoreImportance() {
    const vantage = {};
    RECS.forEach((r) => {
      vantage[r.date] = (vantage[r.date] || 0) + 1;
    });
    RECS.forEach((r) => {
      r.imp = computeImp(r, CIV_COUNT[r.civ] || 0, vantage[r.date] || 1);
    });
  }

  // ---- Data mapping: real record → internal card shape ----
  // SOURCES: resolved by key from data/records/sources.json in init(), populated before _map runs.
  let SOURCES = {};

  function _map(r) {
    // ---- Place ----
    // diming.json (via GAZ) is the sole display authority: a record carries no inline
    // name or i18n block, only place.key, plus an observed_at when the true vantage
    // point differs from the gazetteer's canonical site for that key.
    const placeKey = r.place.key || '';
    const g = GAZ[placeKey] || {};
    const ll = r.place.observed_at || g;
    // The gazetteer entry is already the display block — name/modern/aliases are all
    // BCP-47-keyed, and the numeric lat/lon/since/until alongside them are ignored by
    // both the label and the search haystack (which collects string leaves only).
    const placeI18n = g.name ? g : null;
    const placeName = (g.name && g.name['zh-Hans']) || placeKey || '';

    // ---- Source ----
    // r.source.key names the whole sources.json entry {title?, author?, attribution?}.
    // The link is, in priority order: (1) r.source.url — a rare per-record escape hatch;
    // (2) edition.locus_url with r.source.locus filled in — the common case for
    // multi-volume sources; (3) edition.url — the source's single default page.
    const sk = (r.source || {}).key;
    const se = sk ? SOURCES[sk] : null;
    const editions = (se && se.editions) || [];
    const consulted = editions.find((e) => e && e.consulted === true) || editions[0] || {};
    const srcUrl = r.source.url || _locusUrl(consulted.locus_url, r.source.locus) || consulted.url || null;
    // Search matches ANY form of the citation — 《宋书·天文志》, its romanization, its
    // English title, the compiler's name, the translator's name — not just what the card shows.
    const srcHay = se
      ? [
          Object.values(se.title || {}).join(' '),
          (se.author || []).map((a) => a.name + ' ' + (a.rom || '')).join(' '),
          consulted.by || '',
          consulted.title || '',
          se.attribution || '',
          sk,
        ].join(' ')
      : sk || '';

    const textMap = r.text || null; // BCP-47 locale map
    const translit = r.translit || ''; // romanization of text_orig, where authored
    const noteI18n = r.note || null; // BCP-47 locale map, usually absent
    const ident = r.object || null; // {key, designation?, basis?}
    const datePrecision = (r.date || {}).precision || 'day';

    return {
      id: r.record_id,
      civ: (r.civilization || '').toLowerCase(),
      type: (r.phenomenon || 'solar').toLowerCase(),
      year: _eventYear(r.event_date),
      date: r.event_date,
      ekey: r.event_key || '', // hand-verified "these records are one phenomenon" (see linkKey)
      place: placeName,
      lat: ll.lat,
      lon: ll.lon,
      orig: r.text_orig || '',
      cjk: _hasCJK(r.text_orig),
      translit,
      textMap,
      placeI18n,
      sref: se || null,
      srcKey: sk || '', // shown only when the key resolves to no sources.json entry
      srcUrl,
      srcHay,
      sig: r.significance || null,
      conf: r.confidence || null,
      obsStatus: r.observation_status || null,
      noteI18n,
      noteHay: Object.values(noteI18n || {}).join(' '),
      // Searching a civ by ANY of its seven names. Filled here rather than back-filled
      // after load, so a deferred shard's records are as searchable as the boot ones.
      civHay: _civHay(r.civilization),
      // Search haystack for place names: diming.json's full 7-locale block + historical
      // aliases (e.g. 汴梁/金陵/汉城 for bianjing/jiankang/hanyang) — now the ONLY source
      // of place text since records carry no inline override. Most values are strings;
      // `modern` is a {zh,en?,...} object and `aliases` is a {zh?:[...],en?:[...],...}
      // object of arrays — recursively flatten both to plain strings before joining, or
      // they stringify to "[object Object]"/comma-joined arrays instead of being searchable.
      placeHay: placeI18n ? _flattenHay(placeI18n).join(' ') : '',
      // Without this, translations would be unsearchable: a card renders one locale,
      // but a reader may well search in another.
      textHay: textMap ? Object.values(textMap).join(' ') : '',
      ident,
      datePrecision,
      lunarMonth: r.lunar_month ?? null,
      skyPos: r.sky_position || '', // occultation target (star/asterism/planet), used by transientGlyph
      imp: 0,
    };
  }

  // ---- Filters ----
  function passFilters(r) {
    const q = state.q.trim().toLowerCase();
    return (
      (state.civ == null || r.civ === state.civ) &&
      r.type === state.type &&
      (state.site == null || (r.lat != null && siteKey(r) === state.site)) &&
      (!q ||
        [r.id, r.place, r.placeHay, r.srcHay, r.orig, r.textHay, r.translit, r.noteHay, r.civHay]
          .join(' ')
          .toLowerCase()
          .includes(q))
    );
  }

  const inRange = (r) => r.year >= state.range[0] && r.year <= state.range[1];
  const timelineRecords = () => RECS.filter(passFilters); // lizhou: full density, never budgeted
  const visibleRecords = () => RECS.filter((r) => passFilters(r) && inRange(r));

  // ---- Dynamic LOD selection for the MAP layer (viewport × time-span × importance) ----
  // Cull to the padded viewport, then, if still over budget, keep the most
  // important records spread across a screen-space grid so no region dominates.
  function inViewport(map, r) {
    const b = map.getBounds();
    const latPad = (b.getNorth() - b.getSouth()) * VIEW_MARGIN;
    const lngPad = (b.getEast() - b.getWest()) * VIEW_MARGIN;
    if (r.lat < b.getSouth() - latPad || r.lat > b.getNorth() + latPad) return false;
    const w = b.getWest() - lngPad,
      e = b.getEast() + lngPad;
    // Markers are single-copy at their real lon; the map spans a 720° window
    // (−200…520), so test the lon and its ±360 wraps against the bounds.
    for (let lon = r.lon - 360; lon <= r.lon + 360 + 1e-6; lon += 360) {
      if (lon >= w && lon <= e) return true;
    }
    return false;
  }

  function thinToBudget(cand, map, budget) {
    // 1. landmark records are always shown — reserve budget for them first.
    const keep = cand.filter((r) => r.sig === 'landmark').slice(0, budget);
    let budget2 = budget - keep.length;
    if (budget2 <= 0) return keep;
    const rest = cand.filter((r) => r.sig !== 'landmark');
    // 2. bucket into screen-grid cells; narrow time windows earn +1 detail/cell.
    const lod = LOD(map.getZoom());
    const perCellK = lod.k + (state.range[1] - state.range[0] <= 200 ? 1 : 0);
    const cells = new Map();
    rest.forEach((r) => {
      const p = map.latLngToContainerPoint([r.lat, r.lon]);
      const key = Math.floor(p.x / lod.cell) + '|' + Math.floor(p.y / lod.cell);
      let arr = cells.get(key);
      if (!arr) {
        arr = [];
        cells.set(key, arr);
      }
      arr.push(r);
    });
    // 3. within a cell, rank by importance; emit round-robin (every cell's #1,
    //    then every cell's #2 …) so geographic spread wins before local density.
    const ranked = [];
    cells.forEach((arr) => {
      arr.sort((a, b) => b.imp - a.imp);
      arr.slice(0, perCellK).forEach((r, i) => ranked.push({ r, rank: i }));
    });
    ranked.sort((a, b) => a.rank - b.rank || b.r.imp - a.r.imp);
    for (const x of ranked) {
      if (budget2 <= 0) break;
      keep.push(x.r);
      budget2--;
    }
    return keep;
  }

  // ---- Site stacks: records sharing one coordinate render as ONE marker ----
  // The corpus concentrates hard (北京 179 / 开封 163 / 长安 143 records on one
  // point each), so coincident seals were mutually unreachable on the map. A
  // stack shows its top seal + a count badge; clicking fans the members out
  // (spiderfy) with year labels — the era is readable at a glance — and stacks
  // too deep for a fan overflow into the library via the state.site scope.
  function siteKey(r) {
    return r.lat.toFixed(4) + ',' + r.lon.toFixed(4);
  }

  function groupBySite(recs) {
    const sites = new Map();
    recs.forEach((r) => {
      const k = siteKey(r);
      let s = sites.get(k);
      if (!s) {
        s = { key: k, lat: r.lat, lon: r.lon, recs: [] };
        sites.set(k, s);
      }
      s.recs.push(r);
    });
    sites.forEach((s) => {
      s.recs.sort((a, b) => b.imp - a.imp);
      s.top = s.recs[0];
      s.imp = s.top.imp;
      // a landmark member makes the whole stack landmark (keeps the LOD reserve)
      s.sig = s.recs.some((r) => r.sig === 'landmark') ? 'landmark' : s.top.sig;
    });
    return [...sites.values()];
  }

  function selectForView() {
    const withGeo = (r) => r.lat != null && r.lon != null;
    // Event selected → the map shows ONLY that event's records (every vantage),
    // regardless of civ / query / range filters. Parse state.selEv directly: it is
    // set before EclipseLoader.selected() updates during a record select.
    let base;
    if (state.selEv) {
      const bar = state.selEv.lastIndexOf('|');
      const rec = state.sel ? RECS.find((r) => r.id === state.sel) : null;
      const group = rec ? siblingRecords(rec) : recordsForEvent(state.selEv.slice(0, bar), state.selEv.slice(bar + 1));
      base = group.filter(withGeo);
    } else {
      base = RECS.filter((r) => withGeo(r) && passFilters(r) && inRange(r));
    }
    const cand = groupBySite(map ? base.filter((r) => inViewport(map, r)) : base);
    let out = !map || cand.length <= MARKER_BUDGET ? cand : thinToBudget(cand, map, MARKER_BUDGET);
    // Always keep the selected record's stack alive so a list-click can open
    // its popup even when LOD/viewport would otherwise thin it out.
    if (state.sel && !out.some((s) => s.recs.some((r) => r.id === state.sel))) {
      const sel = RECS.find((r) => r.id === state.sel);
      if (sel && withGeo(sel)) {
        const own = base.filter((r) => siteKey(r) === siteKey(sel));
        out = out.concat(groupBySite(own.length ? own : [sel]));
      }
    }
    return out;
  }

  // ---- Map markers ----
  const POPUP_OPTS = { className: 'records-popup', closeButton: true, maxWidth: 300, autoPan: false };
  function popupHtml(rec) {
    return (
      '<div class="rp">' +
      '<div class="rp-head">' +
      Seal.svg(rec.civ, 16) +
      '<span class="rp-place">' +
      placeLabel(rec, state.lang) +
      '</span>' +
      '<span' +
      eraAttrs(rec, 'rp-year') +
      '>' +
      yearLabel(state.lang, rec.year) +
      '</span></div>' +
      transLine(rec, state.lang, 'rp-trans') +
      '<div class="rp-orig ' +
      (rec.cjk ? '' : 'multi') +
      '">' +
      highlightPhrase(rec.orig) +
      '</div>' +
      '<div class="rp-src">' +
      sourceLabel(rec, state.lang) +
      '</div>' +
      (noteLabel(rec, state.lang) ? '<div class="rp-note">' + noteLabel(rec, state.lang) + '</div>' : '') +
      '</div>'
    );
  }

  // Open (or refresh) a record's marker popup and remember which record it belongs
  // to, so drawMarkers()'s clearLayers() teardown can reopen it afterwards (see
  // _popupRecId below). markerById[id] may point at a shared stack marker that
  // binds no static popup of its own, so set THIS record's content at open time.
  let _popupRecId = null; // id of the record whose marker popup is currently open
  function openRecPopup(id) {
    const rec = RECS.find((r) => r.id === id);
    if (!rec) return;
    const m = markerById[id];
    if (!m) return;
    if (m.getPopup()) m.setPopupContent(popupHtml(rec));
    else m.bindPopup(popupHtml(rec), POPUP_OPTS);
    m.openPopup();
    _popupRecId = id;
  }

  // Seal divIcon + count badge (mirrors Seal.icon's wrapper so selected pulse
  // and drop-shadow stay identical; the badge is atlas-side, not seal-side).
  function stackIcon(civ, count, isSel) {
    const sz = isSel ? 30 : 22;
    const pulse = isSel ? '<div class="mk-pulse"></div>' : '';
    const badge = count > 1 ? '<span class="mk-count num">' + (count > 99 ? '99+' : count) + '</span>' : '';
    const html =
      '<div style="position:relative;width:' +
      sz +
      'px;height:' +
      sz +
      'px;' +
      'filter:drop-shadow(0 1px 2px rgba(0,0,0,.28))">' +
      pulse +
      Seal.svg(civ, sz) +
      badge +
      '</div>';
    return L.divIcon({ className: 'rec-mk', html: html, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
  }

  function spiderIcon(rec, isSel) {
    const sz = isSel ? 26 : 20;
    const pulse = isSel ? '<div class="mk-pulse"></div>' : '';
    const html =
      '<div style="position:relative;width:' +
      sz +
      'px;height:' +
      sz +
      'px;' +
      'filter:drop-shadow(0 1px 2px rgba(0,0,0,.28))">' +
      pulse +
      Seal.svg(rec.civ, sz) +
      '<span class="mk-yr num">' +
      _esc(displayYear(rec.year)) +
      '</span></div>';
    return L.divIcon({ className: 'rec-mk', html: html, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
  }

  // ---- Spiderfy (self-implemented, no vendor dep) ----
  // ≤8 members fan on a circle, more on an Archimedean spiral (constant arc
  // spacing), capped at SPIDER_MAX with a "+N ▸" overflow leg into the library.
  // The fan is rebuilt (respiderfy) on every drawMarkers pass so zoom, filter
  // and selection changes keep it live instead of snapping it shut.
  const SPIDER_MAX = 24;
  let spider = null; // { key, layer } — at most one site fanned at a time
  function spiderOffsets(n) {
    const pts = [];
    if (n <= 8) {
      const r = 38,
        start = -Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const a = start + (i * 2 * Math.PI) / n;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
    } else {
      let th = 0;
      for (let i = 0; i < n; i++) {
        const r = 26 + 5.5 * th;
        pts.push([r * Math.cos(th), r * Math.sin(th)]);
        th += 27 / r;
      }
    }
    return pts;
  }

  function unspiderfy() {
    if (!spider) return;
    if (map) map.removeLayer(spider.layer);
    spider = null;
  }

  function spiderfy(stack) {
    unspiderfy();
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    spider = { key: stack.key, layer };
    // keep the most important members, but LAY OUT chronologically — the fan
    // then reads as a clock of eras around the site.
    const shown = stack.recs
      .slice(0, SPIDER_MAX)
      .slice()
      .sort((a, b) => a.year - b.year);
    const overflow = stack.recs.length - shown.length;
    const nodes = shown.length + (overflow > 0 ? 1 : 0);
    const c = map.latLngToContainerPoint([stack.lat, stack.lon]);
    const offs = spiderOffsets(nodes);
    const ink = cssvar('--ink-3') || '#8B8F8C';
    const legTo = (ll) =>
      L.polyline([[stack.lat, stack.lon], ll], {
        color: ink,
        weight: 1,
        dashArray: '2 3',
        opacity: 0.8,
        interactive: false,
      }).addTo(layer);
    shown.forEach((r, i) => {
      const ll = map.containerPointToLatLng(L.point(c.x + offs[i][0], c.y + offs[i][1]));
      legTo(ll);
      const m = L.marker(ll, { icon: spiderIcon(r, state.sel === r.id), riseOnHover: true });
      m.bindTooltip(placeLabel(r, state.lang), { sticky: true, className: 'eclipse-curve-tooltip', offset: [0, -8] });
      m.bindPopup(popupHtml(r), POPUP_OPTS);
      m.on('click', () => select(r.id));
      layer.addLayer(m);
      markerById[r.id] = m; // select() opens popups on the fanned marker
    });
    if (overflow > 0) {
      const o = offs[nodes - 1];
      const ll = map.containerPointToLatLng(L.point(c.x + o[0], c.y + o[1]));
      legTo(ll);
      const m = L.marker(ll, {
        icon: L.divIcon({
          className: 'rec-mk',
          html: '<span class="mk-more num">+' + overflow + ' ▸</span>',
          iconSize: [44, 20],
          iconAnchor: [22, 10],
        }),
        title: '',
      });
      m.on('click', () => {
        state.site = stack.key;
        unspiderfy();
        renderAll(); // rail is permanent — renderAll surfaces the site scope
      });
      layer.addLayer(m);
    }
  }

  // Rebuild against the stacks this pass actually DREW, not against a re-filtered
  // RECS: the map's record base is not always passFilters+inRange (an event
  // selection re-bases it onto that event's records), and LOD thinning can drop a
  // stack the filters would keep. A fan is a child of its stack marker — when the
  // marker is gone or has collapsed to a lone record, the fan goes with it.
  function respiderfy(stacks) {
    if (!spider || !map) return;
    const stack = stacks.find((s) => s.key === spider.key);
    if (!stack || stack.recs.length < 2) {
      unspiderfy();
      return;
    }
    spiderfy(stack);
  }

  function drawMarkers() {
    if (!markerLayer) return;
    // Leaflet's bindPopup installs a `remove → closePopup` hook, so clearLayers()
    // below silently closes any open record popup. Capture which record it was
    // BEFORE the teardown (clearLayers synchronously fires popupclose, which nulls
    // the module-level _popupRecId), then reopen it after the rebuild — otherwise
    // any viewport change (pan/zoom → the debounced drawMarkers) drops the popup.
    const reopen = _popupRecId;
    markerLayer.clearLayers();
    markerById = {};
    const stacks = selectForView();
    stacks.forEach((stack) => {
      const selRec = state.sel ? stack.recs.find((r) => r.id === state.sel) : null;
      const top = selRec || stack.top;
      const multi = stack.recs.length > 1;
      const m = L.marker([stack.lat, stack.lon], {
        icon: stackIcon(top.civ, stack.recs.length, !!selRec),
        riseOnHover: true,
      });
      m.bindTooltip(placeLabel(top, state.lang), { sticky: true, className: 'eclipse-curve-tooltip', offset: [0, -8] });
      if (!multi) {
        m.bindPopup(popupHtml(top), POPUP_OPTS);
        m.on('click', () => select(top.id));
      } else {
        // no popup on the stack itself — click toggles the fan
        m.on('click', () => {
          m.closePopup && m.closePopup();
          if (spider && spider.key === stack.key) unspiderfy();
          else spiderfy(stack);
        });
      }
      markerLayer.addLayer(m);
      stack.recs.forEach((r) => {
        markerById[r.id] = m;
      });
    });
    // rebuild an active fan against the fresh markers/zoom/filters
    respiderfy(stacks);
    // Reopen the record popup the teardown above closed — AFTER respiderfy so a
    // fanned marker exists in markerById. If LOD dropped it (record scrolled out
    // of the viewport), markerById[reopen] is undefined → no reopen, which is the
    // right thing (its marker is genuinely gone).
    if (reopen && markerById[reopen]) openRecPopup(reopen);
    // Permalink sync chokepoint: drawMarkers runs after nearly every state
    // change (civ/type/q filters, record/event select+clear, map move/zoom), so
    // one touch() here keeps the shareable URL current for all of them.
    if (window.Permalink) Permalink.touch();
  }

  // ---- Click-a-point local observation popup ----
  // While an event is selected, a background map click asks ObservePanel what an
  // observer at that point would witness (local contact times / next-visible),
  // anchored by a lightweight observer marker. Cleared when the event deselects.
  let _obsMarker = null;
  // maxWidth 600 clears the 580px .op-body (figure-column is sized to render the
  // sky-path at ~12px text); Leaflet clamps content to [minWidth,maxWidth], so a
  // lower ceiling would squeeze the card back down. minWidth 240 floors the
  // figure-less not-visible card (op-body--full is width:auto ≈ 234px).
  const OBS_POPUP_OPTS = { className: 'observe-popup', closeButton: true, maxWidth: 600, minWidth: 240, autoPan: true };
  function observerIcon() {
    return L.divIcon({
      className: 'observer-pin',
      html: '<span class="observer-x">✛</span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  // `opts` overrides popup options for this open — Permalink restore passes
  // autoPan:false because its own setView is the framing the link promised, and
  // autoPan's pan animation lands after that setView and would drag it off.
  function showObservation(latlng, opts) {
    const sel = window.EclipseLoader && EclipseLoader.selected && EclipseLoader.selected();
    if (!sel || !window.ObservePanel) return;
    const lat = latlng.lat;
    const lng = ((latlng.lng + 540) % 360) - 180; // wrap world-copy lng into −180…180 for geometry
    const html = ObservePanel.htmlFor(sel, sel._kind, lat, lng);
    if (!_obsMarker) {
      _obsMarker = L.marker(latlng, { icon: observerIcon(), interactive: true, zIndexOffset: 1200, keyboard: false });
      _obsMarker.addTo(map);
      _obsMarker.on('popupopen', (ev) => wireForecast(ev.popup));
      // Dismissing the card by its × leaves the marker in place, so drawMarkers
      // never runs and its touch() can't notice — stamp the URL from here instead.
      _obsMarker.on('popupclose', () => {
        if (window.Permalink) Permalink.touch();
      });
    } else {
      _obsMarker.setLatLng(latlng);
    }
    _obsMarker.bindPopup(html, opts ? Object.assign({}, OBS_POPUP_OPTS, opts) : OBS_POPUP_OPTS).openPopup();
    if (window.Permalink) Permalink.touch();
  }

  // The observed point, for Permalink — null unless the card is actually open, so a
  // dismissed card drops out of the URL. Reports the marker's own world-copy
  // longitude (not the ±180 wrap showObservation derives for geometry) so a restore
  // puts the pin back in the same copy the shared view frames.
  function observePoint() {
    if (!_obsMarker || !_obsMarker.isPopupOpen()) return null;
    const ll = _obsMarker.getLatLng();
    return { lat: ll.lat, lng: ll.lng };
  }

  // Wire the "next visible" forecast rows to jump to that event (may cross domain).
  function wireForecast(popup) {
    const root = popup && popup.getElement && popup.getElement();
    if (!root) return;
    root.querySelectorAll('.op-fc').forEach((el) => {
      const go = () => {
        const d = el.getAttribute('data-ecl-date'),
          k = el.getAttribute('data-ecl-kind');
        if (!d) return;
        clearObservation();
        if (k && k !== state.type) {
          state.type = k;
          renderAll();
        }
        // Intentional jump: auto-expand the handle window to include the target year
        // so the event appears in the list and map after selection.
        const fy = parseInt(d, 10);
        if (!isNaN(fy)) {
          let changed = false;
          if (fy < state.range[0]) {
            state.range[0] = fy;
            changed = true;
          }
          if (fy > state.range[1]) {
            state.range[1] = fy;
            changed = true;
          }
          if (changed) heavyRefreshNow();
        }
        selectEvent(d, k);
      };
      el.onclick = go;
      el.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      };
    });
  }

  function clearObservation() {
    if (_obsMarker) {
      map.removeLayer(_obsMarker);
      _obsMarker = null;
      if (window.Permalink) Permalink.touch();
    }
  }

  // Library focus: while an event is selected, split the rail in two (records list → by
  // link group; all-events → by evcard date/kind, which that rail carries directly). Cards
  // outside the event get .dimmed; cards inside it get .linked, which holds the pale-green
  // linkage tier with the pointer nowhere near the rail — setEventHighlight's .hl only
  // survives while the pointer is on a card, so without this the sibling records of a
  // selected event go bare the moment the reader moves away, and "who else recorded this
  // eclipse" drops off screen right after the click that asked. The list stays full and
  // scrollable — only the emphasis narrows.
  function applyEventFocus() {
    const list = document.getElementById('list');
    if (!list) return;
    const on = !!state.selEv;
    let selDate = null,
      selKind = null;
    if (on) {
      const bar = state.selEv.lastIndexOf('|');
      selDate = state.selEv.slice(0, bar);
      selKind = state.selEv.slice(bar + 1);
    }
    const selKey = on ? selectedLinkKey() : null;
    list.classList.toggle('event-focus', on);
    list.querySelectorAll('.reccard').forEach((c) => {
      const rec = c.dataset.id ? RECS.find((r) => r.id === c.dataset.id) : null;
      const match = on && rec && linkKey(rec) === selKey;
      c.classList.toggle('dimmed', on && !match);
      c.classList.toggle('linked', on && match);
    });
    list.querySelectorAll('.evcard').forEach((c) => {
      const match = on && c.dataset.date === selDate && c.dataset.kind === selKind;
      c.classList.toggle('dimmed', on && !match);
      c.classList.toggle('linked', on && match);
    });
  }

  // ---- TIMELINE (plateau lens: locally-uniform focus + fisheye flanks) ----
  const tl = () => document.getElementById('tlsvg');
  // The plain Sarkar–Brown fisheye peaked at ~6× (≈1.1 px/yr at focus over the
  // 5000-yr domain) — never enough to tell adjacent years apart. The lens now
  // has a locally-UNIFORM plateau around the focus (PPY px per year across
  // ±W_YR years, so single years are separable and clickable) and each flank
  // is a Sarkar–Brown fisheye whose distortion is derived per draw such that
  // the slope is CONTINUOUS at the plateau edge (no crease). Every piece is
  // analytic and monotone, so yearFromX(tlX(y)) === y stays exact, and
  // lens(f) === f preserves the needle-at-focus identity drawTimeline relies
  // on. Focus stays decoupled from zoom (spec-locked).
  const PPY = 6; // plateau resolution, px per year
  const W_YR = 12; // plateau half-width, years
  const TICK_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500]; // fine-tick step tiers, coarsest last
  const MIN_GAP = 28; // px — legibility floor between adjacent fine-tick labels
  const fxSB = (u, d) => ((d + 1) * u) / (d * u + 1); // Sarkar–Brown response
  const invFxSB = (v, d) => v / (d + 1 - v * d);
  // Per-frame lens parameters, memoised by (focus, innerH). Arms shrink near
  // the domain edges so each flank keeps ≥20% of its side's pixel budget —
  // that guard keeps dL/dR ≥ 0 (needs s ≥ 1, hence the clamp) and the mapping
  // invertible everywhere.
  let _lensCache = { key: '', p: null };
  function lensParams(f, innerH) {
    const key = f + '|' + innerH;
    if (_lensCache.key === key) return _lensCache.p;
    const s = Math.max(1.2, (PPY * SPAN) / Math.max(innerH, 1)); // plateau slope (normalized)
    const w = W_YR / SPAN;
    const wl = Math.min(w, (0.8 * f) / s),
      wr = Math.min(w, (0.8 * (1 - f)) / s);
    const nL = f - wl,
      pL = f - wl * s; // left flank spans (year / pixel space)
    const nR = 1 - f - wr,
      pR = 1 - f - wr * s; // right flank spans
    const dL = nL > 0 && pL > 0 ? Math.max(0, (s * nL) / pL - 1) : 0;
    const dR = nR > 0 && pR > 0 ? Math.max(0, (s * nR) / pR - 1) : 0;
    const p = { f, s, wl, wr, nL, pL, nR, pR, dL, dR };
    _lensCache = { key, p };
    return p;
  }

  function lens(n, f, innerH) {
    const q = lensParams(f, innerH);
    if (n >= f - q.wl && n <= f + q.wr) return f + (n - f) * q.s; // plateau: uniform
    if (n < f - q.wl) {
      if (q.nL <= 0 || q.pL <= 0) return 0;
      const u = (f - q.wl - n) / q.nL;
      return f - q.wl * q.s - fxSB(u, q.dL) * q.pL;
    }
    if (q.nR <= 0 || q.pR <= 0) return 1;
    const u = (n - (f + q.wr)) / q.nR;
    return f + q.wr * q.s + fxSB(u, q.dR) * q.pR;
  }

  function invLens(p, f, innerH) {
    const q = lensParams(f, innerH);
    const pLo = f - q.wl * q.s,
      pHi = f + q.wr * q.s;
    if (p >= pLo && p <= pHi) return f + (p - f) / q.s;
    if (p < pLo) {
      if (q.pL <= 0 || q.nL <= 0) return 0;
      const v = (pLo - p) / q.pL;
      return f - q.wl - invFxSB(v, q.dL) * q.nL;
    }
    if (q.pR <= 0 || q.nR <= 0) return 1;
    const v = (p - pHi) / q.pR;
    return f + q.wr + invFxSB(v, q.dR) * q.nR;
  }

  // Layout: one merged full-height band (shoujuan timeline) replaces the old three-strip
  // ruler. Top-register text (range yrs / millennium / fine ticks) shares ONE
  // row above the band, collision-guarded by MEASURED width (interval ledger
  // in drawTimeline — dynamic range labels win, fixed ticks yield). Event
  // seals fan UPWARD from dotY; a dividerY rule marks the seal/dynasty-name
  // boundary within the shared band. Cross-axis zones (Y) are EXPLICIT (not
  // H-relative deltas). The main axis is X (year→x); the lens's innerH arg is
  // just "main-axis pixel budget", so we feed it the width-derived iw.
  let tlW = 800;
  const padL = 16,
    padR = 16,
    focusYearY = 14, // focus-year label baseline — 3px gap above the fish-tail (bandTop-8=20)
    regY = 21, // tick-label baseline (range yrs, millennium, fine); 3px gap to bandTop
    bandTop = 25, // merged band top edge (yuwei tip lands here)
    dotY = 62, // event-dot baseline; fan stacks UPWARD, pitch 8, cap 4
    dividerY = 72, // register divider — event dots above, dynasty names below
    eraNameY = 93, // dynasty-name baseline
    bandBot = 103, // merged band bottom edge
    H = 117;
  const FAN_PITCH = 8,
    FAN_CAP = 4;
  // yuwei (fish-tail folding mark, focus/selection alignment): notched top, tip
  // points down. Local coords: tip at (0,8); placed via translate(x, bandTop-8).
  const YUWEI = 'M-5 0 L0 2.5 L5 0 L0 8 Z';
  const tlX = (year) => {
    const iw = tlW - padL - padR;
    return padL + lens(normYear(year), state.focusN, iw) * iw;
  };

  function yearFromX(px) {
    const iw = tlW - padL - padR;
    const p = Math.max(0, Math.min(1, (px - padL) / iw));
    return Math.round(Y0 + invLens(p, state.focusN, iw) * SPAN);
  }

  function mk(tag, a) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in a) e.setAttribute(k, a[k]);
    return e;
  }

  // ---- Cached canvas text measurement (top-register collision + name fit) ----
  // Hit path is a bare-object property read; 60fps drag pays zero measureText
  // after warmup (misses only on locale switch / first frame).
  let _measCtx = null,
    _measCache = Object.create(null);
  function textW(str, font) {
    const k = font + '' + str,
      w = _measCache[k];
    if (w !== undefined) return w;
    if (!_measCtx) _measCtx = document.createElement('canvas').getContext('2d');
    _measCtx.font = font;
    return (_measCache[k] = _measCtx.measureText(str).width);
  }

  // Canvas measurement fonts must match the .tl-* classes exactly or label-collision
  // layout drifts from what renders. Read the sizes from the same tokens the CSS
  // subscribes to rather than restating them. A restated literal cannot be enforced,
  // and retuning the type scale would then silently mislay every timeline label.
  let _tlFonts = null;
  const tlFonts = () =>
    _tlFonts ||
    (_tlFonts = (() => {
      const body = cssvar('--fs-body') || '13px'; // .tl-axis / .tl-rangeyr
      const note = cssvar('--fs-note') || '12px'; // .tl-fine / .tl-era
      const text = cssvar('--font-text');
      return {
        mill: body + ' ' + text,
        fine: note + ' ' + text,
        range: '600 ' + body + ' ' + text,
        era: note + ' ' + text,
      };
    })());
  // Webfont subsets stream in (font-display:swap): flush widths once per batch.
  if (document.fonts && document.fonts.addEventListener)
    document.fonts.addEventListener('loadingdone', () => {
      _measCache = Object.create(null);
      _tlFonts = null;
      schedule();
    });

  function drawTimeline() {
    const svg = tl();
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    tlW = r.width || 800;
    svg.setAttribute('viewBox', '0 0 ' + tlW + ' ' + H);
    svg.setAttribute('height', H);
    svg.innerHTML = '';
    // One computed-style read per frame (still every frame — that's the skin-
    // follow contract — just merged into a single parse instead of ~10).
    const cs = getComputedStyle(document.body),
      cv = (n) => cs.getPropertyValue(n).trim();
    const panel = cv('--panel'),
      paperDeep = cv('--paper-deep'),
      hair = cv('--hair'),
      ink3 = cv('--ink-3'),
      inkNote = cv('--ink-note'),
      accent = cv('--accent'),
      accentInk = cv('--accent-ink'),
      accentDeep = cv('--accent-deep'),
      spark = cv('--spark'),
      lunar = cv('--lunar'),
      card = cv('--card');
    const iw = tlW - padL - padR;
    // 1 · band ground — one full-height body, square corners (R16)
    svg.appendChild(
      mk('rect', { x: 0, y: bandTop, width: tlW, height: bandBot - bandTop, fill: 'rgba(' + panel + ', .88)' })
    );
    // 1b · register divider: event seals (above) share the band with the
    // dynasty names (below) at no gap, but a tinted rule keeps the two
    // registers legible — distinct from the neutral --hair dynasty-column rules.
    svg.appendChild(
      mk('line', {
        x1: padL,
        y1: dividerY,
        x2: tlW - padR,
        y2: dividerY,
        stroke: accentDeep,
        'stroke-width': 1,
        'stroke-opacity': 0.3,
      })
    );
    // 2 · jiege dynasty columns: alternating paper washes split by wusilan rules;
    // names measured-fit later so grid lines never strike through glyphs.
    // Only the current UI language's family is shown.
    const rib = RIBBONS[state.lang] || RIBBONS.en;
    const names = [];
    rib.eras.forEach((e, i) => {
      const ex1 = Math.max(tlX(Math.max(e[1], Y0)), padL),
        ex2 = Math.min(tlX(Math.min(e[2], Y1)), tlW - padR);
      const ew = ex2 - ex1;
      if (ew <= 1) return;
      if (i % 2 === 0)
        svg.appendChild(
          mk('rect', { x: ex1, y: bandTop, width: ew, height: bandBot - bandTop, fill: paperDeep, 'fill-opacity': 0.5 })
        );
      svg.appendChild(
        mk('line', {
          x1: ex1,
          y1: bandTop,
          x2: ex1,
          y2: bandBot,
          stroke: hair,
          'stroke-width': 0.7,
          'stroke-opacity': 0.8,
        })
      );
      if (i === rib.eras.length - 1)
        svg.appendChild(
          mk('line', {
            x1: ex2,
            y1: bandTop,
            x2: ex2,
            y2: bandBot,
            stroke: hair,
            'stroke-width': 0.7,
            'stroke-opacity': 0.8,
          })
        );
      names.push({ cx: (ex1 + ex2) / 2, w: ew, name: e[0] });
    });
    // 3 · filter window (accent, R8) + dimmed out-of-range flanks
    const rx0 = tlX(state.range[0]),
      rx1 = tlX(state.range[1]);
    const loA = 'start'; // always right of handle — text grows inward
    const hiA = 'end'; // always left of handle — text grows inward
    svg.appendChild(
      mk('rect', {
        x: Math.min(rx0, rx1),
        y: bandTop,
        width: Math.abs(rx1 - rx0),
        height: bandBot - bandTop,
        fill: accent,
        'fill-opacity': 0.08,
      })
    );
    svg.appendChild(
      mk('rect', {
        x: padL,
        y: bandTop,
        width: Math.max(0, rx0 - padL),
        height: bandBot - bandTop,
        fill: ink3,
        'fill-opacity': 0.06,
      })
    );
    svg.appendChild(
      mk('rect', {
        x: rx1,
        y: bandTop,
        width: Math.max(0, tlW - padR - rx1),
        height: bandBot - bandTop,
        fill: ink3,
        'fill-opacity': 0.06,
      })
    );
    // 4 · 500-yr grid lines; millennium labels become top-register candidates
    const millCands = [];
    for (let y = -3000; y <= 2000; y += 500) {
      const xx = tlX(y);
      svg.appendChild(
        mk('line', {
          x1: xx,
          y1: bandTop,
          x2: xx,
          y2: bandBot,
          stroke: hair,
          'stroke-width': 0.6,
          'stroke-opacity': 0.6,
        })
      );
      if (y % 1000 !== 0) continue;
      millCands.push({ x: xx, text: y <= 0 ? 1 - y + ' BCE' : y + '' });
    }
    // 5 · dynasty names, drawn over the grid, only where the measured name fits
    const eraFont = tlFonts().era;
    names.forEach((n) => {
      if (textW(n.name, eraFont) + 8 <= n.w) {
        const t = mk('text', { x: n.cx, y: eraNameY, 'text-anchor': 'middle', class: 'tl-era', fill: inkNote });
        t.textContent = n.name;
        svg.appendChild(t);
      }
    });
    // 6 · fine plateau ticks hang from the band top; labels become candidates.
    // Walk outward from the focus in both directions, escalating from a 1-yr step
    // to coarser TICK_STEPS tiers whenever a full step's REAL pixel span (via
    // tlX — never a flat px/yr guess) would crowd the next tick closer than
    // MIN_GAP. The step has to escalate along the walk: one step sized off the
    // plateau's own uniform rate covers the plateau and leaves the fisheye flanks
    // with no fine ticks at all, however much pixel room they have.
    // Candidates are collected nearest-focus-first, right/left interleaved, so the
    // section-10 ledger's greedy fits() favours them over distant ones — the same
    // liberal-generate/ledger-thins contract millCands relies on, so no separate
    // label-thinning pass is needed here.
    const yF = Y0 + state.focusN * SPAN;
    const bceTxt = (y) => (y <= 0 ? 1 - y + ' BCE' : String(y));
    const walkFine = (dir) => {
      const ys = [];
      let y = yF,
        stepIdx = 0;
      for (;;) {
        // Probe a full step-width hop from the CURRENT walk position (not the
        // next grid line) — probing the grid line would let the arbitrary
        // phase offset between yF and that grid understate a coarse tier's
        // true steady-state spacing and over-escalate right near the focus.
        while (stepIdx < TICK_STEPS.length - 1 && Math.abs(tlX(y + dir * TICK_STEPS[stepIdx]) - tlX(y)) < MIN_GAP)
          stepIdx++;
        const step = TICK_STEPS[stepIdx];
        const ny = dir > 0 ? (Math.floor(y / step) + 1) * step : (Math.ceil(y / step) - 1) * step;
        if (ny < Y0 || ny > Y1) return ys; // domain edge — this direction is done
        y = ny;
        ys.push(y);
      }
    };
    const right = walkFine(1),
      left = walkFine(-1);
    const fineCands = [];
    for (let i = 0; i < right.length || i < left.length; i++) {
      [right[i], left[i]].forEach((y) => {
        if (y == null || y % 1000 === 0) return; // %1000===0 already a millCands label
        const xx = tlX(y);
        if (y % 500 !== 0)
          svg.appendChild(
            mk('line', {
              x1: xx,
              y1: bandTop,
              x2: xx,
              y2: bandTop + 5,
              stroke: hair,
              'stroke-width': 0.7,
              'stroke-opacity': 0.9,
            })
          );
        fineCands.push({ x: xx, text: bceTxt(y) });
      });
    }
    // 7 · event seals — fan stacks UPWARD from the dotY baseline, cap FAN_CAP.
    // The by-year index is module-cached so the hover tip reads it without a
    // redraw (rebuilt here on every draw, which every data change goes through).
    const recs = timelineRecords();
    _byYear = {};
    const byYear = _byYear;
    recs.forEach((rec) => {
      (byYear[rec.year] = byYear[rec.year] || []).push(rec);
    });
    Object.keys(byYear).forEach((yr) => {
      const grp = byYear[yr],
        xx = tlX(+yr),
        inWin = +yr >= state.range[0] && +yr <= state.range[1];
      const cap = Math.min(grp.length, FAN_CAP);
      if (grp.length > 1) {
        const ys = [];
        for (let i = 0; i < cap; i++) ys.push(dotY - i * FAN_PITCH);
        svg.appendChild(
          mk('line', {
            x1: xx,
            y1: Math.min.apply(null, ys),
            x2: xx,
            y2: Math.max.apply(null, ys),
            stroke: accent,
            'stroke-width': 1,
            'stroke-dasharray': '1.5 2.5',
            'stroke-opacity': inWin ? 0.7 : 0.22,
          })
        );
      }
      grp.slice(0, cap).forEach((rec, i) => {
        const cy = dotY - i * FAN_PITCH,
          isSel = state.sel === rec.id;
        const g = mk('g', {});
        g.style.cursor = 'pointer';
        g.setAttribute('opacity', inWin ? 1 : 0.28);
        g.setAttribute('pointer-events', inWin ? 'all' : 'none');
        g.appendChild(
          mk('circle', {
            cx: xx,
            cy: cy,
            r: isSel ? 4.6 : 3.2,
            fill: Seal.color(rec.civ),
            stroke: card,
            'stroke-width': 1,
          })
        );
        g.addEventListener('click', () => select(rec.id));
        svg.appendChild(g);
      });
    });
    // 8 · needles + yuwei alignment marks (bare <path> — never <g>: the gesture
    // code's closest('g') guard must keep matching dots only)
    const fx = padL + state.focusN * iw;
    svg.appendChild(
      mk('line', { x1: fx, y1: bandTop, x2: fx, y2: bandBot, stroke: lunar, 'stroke-width': 1, 'stroke-opacity': 0.55 })
    );
    svg.appendChild(
      mk('path', {
        d: YUWEI,
        transform: 'translate(' + fx + ' ' + (bandTop - 8) + ')',
        fill: lunar,
        'fill-opacity': 0.9,
      })
    );
    let selX = null;
    if (state.sel) {
      const rec = RECS.find((rr) => rr.id === state.sel);
      if (rec) {
        selX = tlX(rec.year);
        svg.appendChild(
          mk('line', { x1: selX, y1: bandTop, x2: selX, y2: bandBot, stroke: spark, 'stroke-width': 1.4 })
        );
        svg.appendChild(
          mk('path', { d: YUWEI, transform: 'translate(' + selX + ' ' + (bandTop - 8) + ')', fill: spark })
        );
      }
    }
    // 9 · range handles (last, so they stay grabbable on top) — plain accent bars.
    // A wide transparent hit-casing behind each bar advertises the grab zone; the
    // actual hit-test is coordinate-based in wireTimelineGestures (±HIT px).
    [rx0, rx1].forEach((xx) => {
      const hit = mk('rect', {
        x: xx - 11,
        y: bandTop - 6,
        width: 22,
        height: bandBot + 6 - (bandTop - 6),
        fill: 'transparent',
      });
      hit.style.cursor = 'ew-resize';
      svg.appendChild(hit);
      svg.appendChild(
        mk('rect', {
          x: xx - 3,
          y: bandTop - 3,
          width: 6,
          height: bandBot + 3 - (bandTop - 3),
          fill: accent,
          'fill-opacity': 0.92,
        })
      ); /* handle = accent (R8) */
    });
    // 10 · top register: interval-ledger label pass, strict priority —
    // range labels (never dropped) → yuwei reserves → millennium → fine ticks.
    // Density envelope: three dense anchors — the two domain edges and the focus —
    // with required spacing swelling from G_MIN at each anchor to G_MAX across the
    // flanks between them, so the label field reads as dense–sparse–dense rather
    // than uniform. The spacing must be a NEAREST-ANCHOR function: that is what
    // self-heals when the focus nears a rim, since the collapsing flank never
    // reaches large d and no empty valley is forced onto a side with no room.
    // DWELL matches the lens plateau's pixel half-width (W_YR·PPY), so the ramp
    // thins only the flanks beyond the plateau.
    const ANCH = [padL, fx, tlW - padR],
      G_MIN = MIN_GAP,
      G_MAX = 110,
      DWELL = W_YR * PPY,
      RAMP = 80;
    const gapAt = (x) => {
      let d = Infinity;
      for (const a of ANCH) d = Math.min(d, Math.abs(x - a));
      return G_MIN + (G_MAX - G_MIN) * Math.max(0, Math.min(1, (d - DWELL) / RAMP));
    };
    const ledger = [],
      GAP = 6;
    // A candidate fits only if, against EVERY placed label, it neither overlaps
    // its box (GAP floor) nor sits closer than the local envelope gap from its
    // centre. Governed by the candidate's own gapAt(cx): greedy fill runs
    // outward from the anchors, so checking the incoming point's breathing room
    // gives predictable, monotonic thinning (G is continuous across the focus
    // anchor, so no seam). Never-dropped labels (range yrs, yuwei/sel reserves)
    // skip this test but still carry a .cx so others yield around them.
    const fits = (a, b, cx) => {
      const g = gapAt(cx);
      return ledger.every((o) => (b + GAP <= o[0] || a - GAP >= o[1]) && Math.abs(cx - o.cx) >= g);
    };

    const interval = (x, anchor, w) => {
      const iv = anchor === 'start' ? [x, x + w] : anchor === 'end' ? [x - w, x] : [x - w / 2, x + w / 2];
      iv.cx = x;
      return iv;
    };

    const drawLabel = (x, anchor, text, cls, fill) => {
      const t = mk('text', { x: x, y: regY, 'text-anchor': anchor, class: cls, fill: fill });
      t.textContent = text;
      svg.appendChild(t);
    };
    const F = tlFonts();
    if (rx1 - rx0 < 72) {
      const midX = (rx0 + rx1) / 2,
        txt = displayYear(state.range[0]) + '–' + displayYear(state.range[1]);
      const w = textW(txt, F.range);
      // Same edge clamp as loA/hiA: a midpoint-anchored label near either
      // strip edge would otherwise spill off-canvas (verified via
      // browser repro at range≈[-2999,-2990] — bbox went to x=-28).
      const a = midX - w / 2 < padL ? 'start' : midX + w / 2 > tlW - padR ? 'end' : 'middle';
      const lx = a === 'start' ? padL : a === 'end' ? tlW - padR : midX;
      const rangeEl0 = mk('text', {
        x: lx,
        y: regY - 2,
        'text-anchor': a,
        class: 'tl-axis tl-rangeyr',
        fill: accentInk,
      });
      rangeEl0.textContent = txt;
      svg.appendChild(rangeEl0);
      ledger.push(interval(lx, a, w));
    } else {
      const loTxt = displayYear(state.range[0]),
        hiTxt = displayYear(state.range[1]);
      // Offset by ±(bar half-width 3 − gap 2) = ±1 so the first/last glyph
      // aligns with the bar edge with 2px breathing room.
      const loEl = mk('text', {
        x: rx0 - 4,
        y: regY - 4,
        'text-anchor': loA,
        class: 'tl-axis tl-rangeyr',
        fill: accentInk,
      });
      loEl.textContent = loTxt;
      svg.appendChild(loEl);
      ledger.push(interval(rx0 - 1, loA, textW(loTxt, F.range)));
      const hiEl = mk('text', {
        x: rx1 + 4,
        y: regY - 4,
        'text-anchor': hiA,
        class: 'tl-axis tl-rangeyr',
        fill: accentInk,
      });
      hiEl.textContent = hiTxt;
      svg.appendChild(hiEl);
      ledger.push(interval(rx1 + 1, hiA, textW(hiTxt, F.range)));
    }
    // Focus-year seal: plain numeral matching the tick-label register (bceTxt,
    // not the localized displayYear era-string), pinned at fx right above the
    // yuwei — reads as "hugging the seam" in a single line instead of an
    // orphaned caption in its own row. Never dropped, edge-clamped like the
    // range labels.
    const nowTxt = bceTxt(Math.round(yF)),
      nowW = textW(nowTxt, F.range);
    const nowA = fx - nowW / 2 < padL ? 'start' : fx + nowW / 2 > tlW - padR ? 'end' : 'middle';
    const nowX = nowA === 'start' ? padL : nowA === 'end' ? tlW - padR : fx;
    const nowIv = interval(nowX, nowA, nowW);
    // Hide focus-year label when it overlaps a range label (already in ledger).
    // Still reserve a narrow fish-tail slot so tick labels don't land on the needle.
    const nowCollides = ledger.some((o) => nowIv[0] - GAP < o[1] && nowIv[1] + GAP > o[0]);
    if (!nowCollides) {
      const nowEl = mk('text', {
        x: nowX,
        y: focusYearY,
        'text-anchor': nowA,
        class: 'tl-axis tl-nowyr',
        fill: accentInk,
      });
      nowEl.textContent = nowTxt;
      svg.appendChild(nowEl);
      ledger.push(nowIv);
    } else {
      const fxR = [fx - 6, fx + 6];
      fxR.cx = fx;
      ledger.push(fxR);
    }
    if (selX != null) {
      const sR = [selX - 6, selX + 6];
      sR.cx = selX;
      ledger.push(sR);
    }
    // Edge-anchor flip (same trick as loA/hiA above): a tick sitting within
    // ~34px of either strip edge would spill half its middle-anchored text
    // past padL/padR, so it pivots to start/end anchoring right at the edge.
    const edgeA = (x) => (x < padL + 34 ? 'start' : x > tlW - padR - 34 ? 'end' : 'middle');
    millCands.forEach((c) => {
      const a = edgeA(c.x),
        iv = interval(c.x, a, textW(c.text, F.mill));
      if (fits(iv[0], iv[1], c.x)) {
        drawLabel(c.x, a, c.text, 'tl-axis', inkNote);
        ledger.push(iv);
      } /* R9: axis labels use --ink-note */
    });
    fineCands.forEach((c) => {
      const a = edgeA(c.x),
        iv = interval(c.x, a, textW(c.text, F.fine));
      if (fits(iv[0], iv[1], c.x)) {
        drawLabel(c.x, a, c.text, 'tl-axis tl-fine', inkNote);
        ledger.push(iv);
      }
    });
    updateReccount();
  }

  // nianhaoYear/cjkOrdinal are kept for the event-card year label; there is no
  // timeline-side call site for them here — a focus-year readout may get a
  // new home later (2026-07-11: deferred, not in scope for this redesign).
  let raf = null,
    dragging = null;
  let _byYear = {}; // year → records index, rebuilt by drawTimeline; read by the hover tip
  function schedule() {
    if (!raf)
      raf = requestAnimationFrame(() => {
        raf = null;
        drawTimeline();
      });
  }

  // Focus animator: focusN eases toward focusTarget instead of teleporting, so
  // grabbing a handle / clicking the band / selecting a record glides the lens
  // rather than snapping the whole axis (focus+context "smooth transition" rule).
  let focusRAF = null,
    focusLastT = 0,
    focusTarget = state.focusN;
  const FOCUS_TAU = 55; // ms; exp-smoothing time constant → ~150ms visual settle
  function setFocusTarget(n) {
    focusTarget = Math.max(0, Math.min(1, n));
    if (focusRAF == null) {
      focusLastT = 0;
      focusRAF = requestAnimationFrame(focusStep);
    }
  }

  function focusStep(ts) {
    if (!focusLastT) focusLastT = ts;
    const dt = Math.min(64, ts - focusLastT); // clamp long gaps (tab was backgrounded)
    focusLastT = ts;
    const alpha = 1 - Math.exp(-dt / FOCUS_TAU); // frame-rate-independent, handles a moving target
    state.focusN += (focusTarget - state.focusN) * alpha;
    if (Math.abs(focusTarget - state.focusN) < 1e-4) {
      state.focusN = focusTarget;
      focusRAF = null;
    } else focusRAF = requestAnimationFrame(focusStep);
    drawTimeline();
  }

  // ---- Hover tip (year + record count under the cursor) ----
  // A paper chip floated above the strip; DOM-only (no SVG redraw), so the
  // "plain hover never warps the lens" contract holds.
  let _tip = null,
    _tipRaf = 0;
  function tlTip(mx) {
    const box = document.getElementById('timeline');
    if (!box) return;
    if (!_tip) {
      _tip = document.createElement('div');
      _tip.id = 'tl-tip';
      box.appendChild(_tip);
    }
    const year = yearFromX(mx);
    const grp = _byYear[year];
    let txt = displayYear(year);
    if (grp && grp.length) {
      txt += ' · ' + grp.length;
      if (grp.length > FAN_CAP) txt += ' (+' + (grp.length - FAN_CAP) + ')'; // fan caps at FAN_CAP — surface the rest
    }
    _tip.textContent = txt;
    _tip.style.left = mx + 'px';
    _tip.style.display = 'block';
  }

  function hideTlTip() {
    if (_tip) _tip.style.display = 'none';
    if (_tipRaf) {
      cancelAnimationFrame(_tipRaf);
      _tipRaf = 0;
    }
  }

  // Heavy refresh (full list rebuild + Leaflet marker churn) is far too costly
  // to run per pointermove during a range drag (renderList rebuilds ~1200
  // cards). Debounce it so the drag stays smooth; a final sync fires on
  // pointerup/pointercancel via heavyRefreshNow.
  let heavyTimer = null;
  function heavyRefreshSoon() {
    clearTimeout(heavyTimer);
    heavyTimer = setTimeout(() => {
      renderList();
      drawMarkers();
    }, 120);
  }

  function heavyRefreshNow() {
    clearTimeout(heavyTimer);
    heavyTimer = null;
    renderList();
    drawMarkers();
  }

  // Which handle (if any) is within grab range of local x. HIT must match the
  // transparent hit-casing half-width drawn in drawTimeline.
  const HIT = 12;
  function handleAt(mx) {
    const rx0 = tlX(state.range[0]),
      rx1 = tlX(state.range[1]);
    const d0 = Math.abs(mx - rx0),
      d1 = Math.abs(mx - rx1);
    if (d0 <= HIT && d0 <= d1) return 'lo';
    if (d1 <= HIT) return 'hi';
    return null;
  }

  // Pointer Events (mouse + touch + pen) with pointer capture, so a drag keeps
  // tracking even when the cursor leaves the SVG. The lens ONLY recenters while
  // the empty band is pressed/dragged (aiming the plateau) or a dot is selected
  // — grabbing a range handle leaves the axis frozen so the user adjusts the
  // boundary in the already-magnified region. Plain hover never moves focusN.
  function wireTimelineGestures() {
    const svg = tl();
    if (!svg) return;
    const localX = (ev) => ev.clientX - svg.getBoundingClientRect().left;
    svg.addEventListener('pointerdown', (ev) => {
      const mx = localX(ev);
      const h = handleAt(mx);
      if (h) {
        dragging = h;
      } else {
        // Dot <g> elements own their clicks — a redraw here would destroy the
        // element before its click event fires, breaking dot selection.
        if (ev.target.closest('g')) return;
        // A click outside the filter-handle window is ignored (needle stays
        // put), mirroring the pointermove clamp so click and drag share one
        // boundary. Range handles and out-of-window dots stay clickable above.
        const rawN = (mx - padL) / (tlW - padL - padR);
        if (rawN < normYear(state.range[0]) || rawN > normYear(state.range[1])) return;
        dragging = 'focus';
        setFocusTarget(rawN);
      }
      hideTlTip();
      try {
        svg.setPointerCapture(ev.pointerId);
      } catch (e) {
        /* older engines */
      }
      ev.preventDefault();
    });
    svg.addEventListener('pointermove', (ev) => {
      const mx = localX(ev);
      if (dragging === 'focus') {
        // Aim-the-lens drag: focus follows the finger but is clamped to [lo, hi]
        // in normalised-year space so the lens needle never visually crosses a
        // range handle. When focusN = normYear(handle), lens(f,f,iw)=f (fixed-
        // point identity), so needle and handle share the exact same pixel.
        const rawN = Math.max(0, Math.min(1, (mx - padL) / (tlW - padL - padR)));
        setFocusTarget(Math.max(normYear(state.range[0]), Math.min(normYear(state.range[1]), rawN)));
        return;
      }
      if (dragging) {
        // Axis-frozen handle drag (scheme B): focus stays put so the axis never
        // warps while the user repositions a range boundary. Pixel-space collision:
        // each handle stops when within HIT*2 px of the other; when blocked the
        // range isn't updated. No setFocusTarget here — user aims the lens first
        // by dragging the empty band, then adjusts handles in the magnified zone.
        const y = Math.max(Y0, Math.min(Y1, yearFromX(mx)));
        // Focus needle pixel: lens(f,f)=f fixed-point, so needle x = padL + focusN*iw.
        const fnx = padL + state.focusN * (tlW - padL - padR);
        if (dragging === 'lo') {
          const rx1 = tlX(state.range[1]);
          if (mx < rx1 - HIT * 2 && mx < fnx - HIT) state.range[0] = y;
        } else {
          const rx0 = tlX(state.range[0]);
          if (mx > rx0 + HIT * 2 && mx > fnx + HIT) state.range[1] = y;
        }
        heavyRefreshSoon();
        schedule(); // no focus animator during handle drags — schedule directly
        return;
      }
      // Plain hover (not dragging): no focus movement, no redraw — only the
      // rAF-throttled year/count tip.
      if (!_tipRaf)
        _tipRaf = requestAnimationFrame(() => {
          _tipRaf = 0;
          tlTip(mx);
        });
    });
    svg.addEventListener('pointerleave', () => {
      if (!dragging) hideTlTip();
    });
    const endDrag = (ev) => {
      if (!dragging) return;
      const wasFocus = dragging === 'focus';
      dragging = null;
      try {
        svg.releasePointerCapture(ev.pointerId);
      } catch (e) {
        /* noop */
      }
      if (!wasFocus) heavyRefreshNow(); // focus alone never changes markers/list
      if (window.Permalink) Permalink.touch(); // capture range (heavyRefresh) + focus drag-end
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
  }

  // ---- LIBRARY (facets + translation-first cards) ----
  // Single-select civ filter as a one-line horizontally-scrollable chip row: a
  // leading "All" chip (state.civ == null) then one chip per present civ. Picking
  // a civ sets state.civ to that key; picking "All" clears it back to null.
  function renderCivFilter() {
    const box = document.getElementById('civscroll');
    if (!box) return;
    box.innerHTML = '';
    const allLabel = T('atlas.filter.all');
    const all = document.createElement('span');
    all.className = 'chip' + (state.civ == null ? ' on' : ' off');
    all.innerHTML = '<span>' + allLabel + '</span>';
    all.onclick = () => {
      state.civ = null;
      renderAll();
    };
    box.appendChild(all);
    PRESENT_CIVS.forEach((k) => {
      const on = state.civ === k;
      const el = document.createElement('span');
      el.className = 'chip' + (on ? ' on' : ' off');
      const civLabel = Seal.name(k, state.lang);
      el.innerHTML = Seal.svg(k, 16) + '<span>' + civLabel + '</span>';
      el.onclick = () => {
        state.civ = on ? null : k;
        renderAll();
      };
      box.appendChild(el);
    });
  }

  // ---- Shared list pager (records + all-events) ----
  // The current mode's full sorted array; only a [winStart,winEnd) slice renders.
  const recsSorted = () =>
    visibleRecords().sort((a, b) => a.year - b.year || (a.date || '').localeCompare(b.date || ''));
  const currentArray = () => (state.mode === 'events' ? evAll() : recsSorted());
  const yearOf = (item) => (state.mode === 'events' ? _eventYear(item.date) : item.year);
  // Seed key = the filter fingerprint that defines the array. Any change (mode,
  // type, civ, query, range, site) re-seeds the window centered on the focus;
  // an unchanged key preserves the window so load-more / wheel paging survives a
  // re-render (locale switch, heavyRefresh). Note it includes the mode prefix, so
  // toggling records↔all-events always re-seeds.
  function seedKeyNow() {
    return state.mode === 'events'
      ? 'ev|' + state.type + '|' + state.q
      : 'rec|' + state.type + '|' + state.civ + '|' + state.q + '|' + state.range.join(',') + '|' + state.site;
  }

  function seedWindow(arr) {
    const len = arr.length,
      key = seedKeyNow();
    // A window seeded against an EMPTY array is 0..0, and the key it caches is the same key
    // the filled array produces — so without this the register that arrived late (a shard
    // streaming in behind first paint) keeps rendering nothing while the count reads 152.
    // Re-seeding is safe here precisely because the cached window holds no card that a
    // reader could be looking at.
    if (winStart === winEnd && len) winSeedKey = null;
    if (winSeedKey !== key) {
      // Snap exactly to the current selection for this array when there is one
      // — e.g. switching records↔all-events with an event/record already selected should
      // land exactly on its card, not just "nearby by year" (same-year ties
      // would drift a few rows off). Falls back to the focus-year approximation
      // otherwise. This is what makes the OTHER mode's window end up correctly
      // centered "in the background" without select()/selectEvent() having to
      // reach across and poke the other mode's window directly (they'd fight
      // over the same winStart/winEnd globals — see centerEventWindow/
      // centerRecordsWindow below, which are for the CURRENT mode only).
      let cur = -1;
      if (state.mode === 'events' && state.selEv) {
        cur = arr.findIndex((e) => evKey(e.date, e._kind) === state.selEv);
      } else if (state.mode === 'records' && state.sel) {
        cur = arr.findIndex((r) => r.id === state.sel);
      }
      // A rank-ordered all-events result is a hit list, not a stretch of the
      // timeline: open it at the top. Scanning for the focus year would both be
      // meaningless (the array is no longer chronological) and bury the literal
      // year the reader typed under the decades and centuries beneath it.
      if (cur < 0 && state.mode === 'events' && evQueryRanked) cur = 0;
      if (cur < 0) {
        const fy = Y0 + state.focusN * SPAN;
        cur = 0;
        while (cur < len && yearOf(arr[cur]) < fy) cur++; // first item ≥ focus year
      }
      winStart = Math.max(0, cur - INITIAL_BEFORE);
      winEnd = Math.min(len, cur + INITIAL_AFTER);
      winSeedKey = key;
    } else {
      winEnd = Math.min(winEnd, len);
      winStart = Math.min(winStart, winEnd); // clamp a stale window
    }
  }

  // Load-earlier prepends (list grows upward) → restore scrollTop by the height
  // delta or the viewport jumps. Load-later appends — no fixup. Both trim the far
  // edge to hold the window at MAX_WINDOW, mirroring AstroMeteoMap's controller.
  function pageEarlier() {
    if (winStart <= 0) return;
    const list = document.getElementById('list');
    const h0 = list ? list.scrollHeight : 0;
    winStart = Math.max(0, winStart - PAGE_SIZE);
    if (winEnd - winStart > MAX_WINDOW) winEnd = winStart + MAX_WINDOW;
    renderList();
    if (list) list.scrollTop += list.scrollHeight - h0;
  }

  function pageLater() {
    if (winEnd >= winLen) return;
    winEnd = Math.min(winLen, winEnd + PAGE_SIZE);
    if (winEnd - winStart > MAX_WINDOW) winStart = winEnd - MAX_WINDOW;
    renderList();
  }

  // Chevrons show in BOTH modes; both hide when the whole list fits one window.
  function updateLoadBtns(len) {
    winLen = len;
    const eb = document.getElementById('ec-earlier'),
      lb = document.getElementById('ec-later');
    const fits = winStart <= 0 && winEnd >= len;
    if (eb) {
      eb.hidden = fits;
      eb.disabled = winStart <= 0;
    }
    if (lb) {
      lb.hidden = fits;
      lb.disabled = winEnd >= len;
    }
  }

  // Wheel-to-edge auto-load: keep-scrolling intent at a list boundary pages the
  // window and flashes the chevron. 'wheel' (not 'scroll') because scroll stops
  // firing at the boundary — wheel keeps firing, so it detects the intent. One
  // listener on the persistent #list element survives every innerHTML rebuild.
  let _wheelCool = false;
  const WHEEL_COOLDOWN_MS = 400;
  function flashBtn(id) {
    const b = document.getElementById(id);
    if (!b || b.disabled) return;
    b.classList.add('ec-load-flash');
    setTimeout(() => b.classList.remove('ec-load-flash'), WHEEL_COOLDOWN_MS);
  }

  function wireWheelAutoload() {
    const list = document.getElementById('list');
    if (!list) return;
    list.addEventListener(
      'wheel',
      (ev) => {
        if (_wheelCool) return;
        const atTop = list.scrollTop <= 1;
        const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= 1;
        if (ev.deltaY < 0 && atTop && winStart > 0) {
          ev.preventDefault();
          _wheelCool = true;
          pageEarlier();
          flashBtn('ec-earlier');
          setTimeout(() => {
            _wheelCool = false;
          }, WHEEL_COOLDOWN_MS);
        } else if (ev.deltaY > 0 && atBottom && winEnd < winLen) {
          ev.preventDefault();
          _wheelCool = true;
          pageLater();
          flashBtn('ec-later');
          setTimeout(() => {
            _wheelCool = false;
          }, WHEEL_COOLDOWN_MS);
        }
      },
      { passive: false }
    );
  }

  function renderList() {
    // all-events mode owns #list too — branch here so every renderList() caller
    // (renderAll, type toggle, heavyRefresh, search, locale change) routes right.
    if (state.mode === 'events') return renderEventList();
    const list = document.getElementById('list');
    if (!list) return;
    list.innerHTML = '';
    // Chronological (oldest→newest), same-year ties by ISO date — matches the
    // bottom lizhou's left-old→right-new reading. Windowed to a page centered on the
    // focus, paged by the chevrons / wheel (identical machinery to all-events).
    const recs = recsSorted();
    seedWindow(recs);
    updateReccount();
    // Empty shelf (a type not yet collected, or filters/search matching nothing):
    // a quiet centered note instead of the old blank leaf. Loop below no-ops.
    if (!recs.length) list.innerHTML = '<div class="list-empty">' + _esc(T('atlas.empty')) + '</div>';
    for (let i = winStart; i < winEnd; i++) {
      const rec = recs[i];
      const card = document.createElement('div');
      card.className = 'reccard' + (state.sel === rec.id ? ' sel' : '');
      card.dataset.id = rec.id;
      // The quewei frame for an unwitnessed sighting rides on the era tag (see eraAttrs).
      // It stays on the always-visible rc-top row rather than the folded detail, so an
      // unlit contact path never reads as a bug on a collapsed card.
      const trans = transLine(rec, state.lang, 'rc-trans');
      card.innerHTML =
        '<div class="rc-top">' +
        Seal.svg(rec.civ, 18, Seal.name(rec.civ, state.lang)) +
        '<span class="rc-place">' +
        placeLabel(rec, state.lang) +
        '</span>' +
        '<span' +
        eraAttrs(rec, 'rc-year') +
        '>' +
        yearLabel(state.lang, rec.year) +
        '</span></div>' +
        trans +
        '<div class="rc-orig ' +
        (rec.cjk ? '' : 'multi') +
        // No translation line means the original IS the viewer's language. The collapsed
        // card hides .rc-orig, so it would come up with nothing but seal/place/year —
        // `solo` lets it stand in for the missing preview, set in the translation's style.
        (trans ? '' : ' solo') +
        '">' +
        highlightPhrase(rec.orig) +
        '</div>' +
        '<div class="rc-src">' +
        sourceLabel(rec, state.lang) +
        '</div>' +
        (noteLabel(rec, state.lang) ? '<div class="rc-note">' + noteLabel(rec, state.lang) + '</div>' : '');
      // A drag to select the source text (or a click on the citation link) must
      // NOT be hijacked into a card-select: that redraws the list and would wipe
      // the user's selection, making the text impossible to copy.
      card.onclick = (e) => {
        if (!window.getSelection().isCollapsed) return;
        if (e.target.closest('a')) return;
        // A touch tap on an elided place name is asking for the withheld name, not
        // for the record — glossary-tip is opening its card on this same gesture,
        // and selecting would move the lens and the map out from under it.
        if (_touchTap && e.target.closest('.rc-place[data-gloss]')) return;
        select(rec.id);
      };
      // Reverse cross-highlight: hovering a card lights the sibling records of the
      // same event (other vantages on it), its marker, and — for solar — its band.
      card.onmouseenter = () => setEventHighlight(rec.date, rec.type, true, rec);
      card.onmouseleave = () => setEventHighlight(rec.date, rec.type, false, rec);
      list.appendChild(card);
    }
    updateLoadBtns(recs.length);
    fitPlaceLabels(list); // must follow appendChild — an unattached row measures 0
    drawBands(); // central-band shadows for the visible records' solar events
    applyEventFocus();
  }

  // ---- All-events (all eclipse events, paged) ----
  // A chronological running-log of EVERY eclipse of the selected kind — with or
  // without a curated record — windowed around the lizhou focus and paged by the
  // load-earlier / load-later chevrons (ported windowing from AstroMeteoMap's
  // makeListController, reskinned to the Song card chrome).
  const evKey = (dateStr, kind) => dateStr + '|' + kind;
  // Kinds with a checked-in event catalogue (solar.json / lunar.json). The other
  // type slips (yanfan/kexing/huibo) have no catalogue at all — an empty evAll() for them
  // is a real empty shelf, NOT the boot race below, and must never enter the retry.
  const EV_CATALOGUED = { solar: true, lunar: true };

  // The records list searches prose (place / source / text); an all-events row has
  // no prose, so the same query box matches the two things its card actually
  // shows — the eclipse type and the date. Tokens are AND-ed, so "日全食 1178"
  // narrows on both at once.
  const _EV_YMD = /^(-?\d+)-(\d{2})-(\d{2})$/;

  // Set by evAll(): whether its last result was ordered by match rank instead of
  // chronologically. seedWindow reads it — a ranked list is a search result and
  // must open on its best matches, not on the lizhou focus year.
  let evQueryRanked = false;

  // An event's date as the reader would write it: the year sign-plus-digits with
  // the zero padding dropped ("-000762-06-07" → "-762"), month and day as
  // numbers. The year is a STRING because matching it is a prefix test.
  function _evYmd(iso) {
    const m = _EV_YMD.exec(iso || '');
    if (!m) return null;
    const sign = m[1][0] === '-' ? '-' : '';
    return { y: sign + (m[1].replace(/^-?0*/, '') || '0'), mo: +m[2], d: +m[3] };
  }

  // One date token, in whatever shape a reader types it: written ("1178年3月21日"),
  // slashed ("1178/03/21"), dashed ("1178-3-21"), dotted, or truncated to
  // year-month or bare year. A leading 前 / 公元前 becomes the astronomical minus
  // sign, which is how the catalogue keys BCE years. Returns null for anything
  // that isn't a date, so the caller can fall through to the type-name match.
  function _parseDateQ(tok) {
    const s = tok
      .replace(/^(?:公元)?前/, '-')
      .replace(/日/g, '')
      .replace(/[年月．./／]/g, '-')
      .replace(/-+$/, '');
    const m = /^(-?)(\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(s);
    if (!m) return null;
    return {
      y: m[1] + (m[2].replace(/^0*/, '') || '0'),
      mo: m[3] == null ? null : +m[3],
      d: m[4] == null ? null : +m[4],
    };
  }

  // Split the query once per keystroke rather than once per event — the loop
  // below runs over the whole catalogue (tens of thousands of rows) on every
  // character typed. Tokens are AND-ed, so "日全食 1178" narrows on type and date
  // at once; each is read as a date if it parses as one, otherwise as a word.
  function _parseQuery(q) {
    const dates = [],
      words = [];
    for (const tok of q.toLowerCase().split(/[\s,，、]+/)) {
      if (!tok) continue;
      const d = _parseDateQ(tok);
      if (d) dates.push(d);
      else words.push(tok);
    }
    return { dates, words };
  }

  // Match rank, or -1 for no match. 0 means the reader typed the year exactly; n
  // means the event's year carries n further digits — "18" ranks year 18 at 0,
  // 18X at 1, 18XX at 2. That is what orders the list, so a half-typed year
  // still finds its decade and century without burying the literal year.
  function evMatchQ(e, parsed) {
    if (parsed.words.length) {
      const kindKey = String(e.kind || '').toLowerCase();
      // Only the active locale's dictionary is loaded, so the type name matches
      // in the language on screen; the raw kind token ("total", "annular") keeps
      // the same filter reachable from an English keyboard whatever that
      // language is.
      const label = T('eclipse.type.' + e._kind + '.' + kindKey).toLowerCase();
      for (const w of parsed.words) if (!label.includes(w) && !kindKey.includes(w)) return -1;
    }
    if (!parsed.dates.length) return 0;
    const ymd = _evYmd(e.date);
    if (!ymd) return -1;
    let rank = 0;
    for (const d of parsed.dates) {
      // The year is a prefix test — and the sign rides in the string, so "18"
      // cannot reach -18 and "-7" cannot reach 762. Month and day, once typed,
      // are exact: "3月" means March, not the 3rd through 3Xth month.
      if (ymd.y.indexOf(d.y) !== 0) return -1;
      if (d.mo != null && ymd.mo !== d.mo) return -1;
      if (d.d != null && ymd.d !== d.d) return -1;
      rank = Math.max(rank, ymd.y.length - d.y.length);
    }
    return rank;
  }

  function evAll() {
    const [lo, hi] = state.range;
    const parsed = _parseQuery(state.q.trim());
    const src = window.EclipseLoader && EclipseLoader.all ? EclipseLoader.all() : [];
    const hits = [];
    let ranked = false;
    for (const e of src) {
      if (e._kind !== state.type) continue;
      const m = /^(-?\d+)/.exec(e.date || '');
      if (!m || +m[1] < lo || +m[1] > hi) continue;
      const rank = evMatchQ(e, parsed);
      if (rank < 0) continue;
      if (rank > 0) ranked = true;
      hits.push({ e, rank });
    }
    evQueryRanked = ranked;
    // Sort is stable, so within a rank the catalogue's chronological order
    // stands. Skipped entirely when nothing outranks anything (no date token, or
    // a fully typed year), leaving the plain chronological list untouched.
    if (ranked) hits.sort((a, b) => a.rank - b.rank);
    return hits.map((h) => h.e);
  }

  function renderEventList() {
    const list = document.getElementById('list');
    if (!list) return;
    const kind = state.type;
    if (!EV_CATALOGUED[kind]) {
      list.innerHTML = '<div class="list-empty">' + _esc(T('atlas.empty')) + '</div>';
      updateReccount();
      updateLoadBtns(0);
      return;
    }
    // Boot-race check uses the raw (unfiltered) catalogue: a zero-length result
    // here means the catalogue hasn't arrived yet, not that the range is empty.
    const raw = (window.EclipseLoader && EclipseLoader.all ? EclipseLoader.all() : []).filter((e) => e._kind === kind);
    if (!raw.length) {
      list.innerHTML = '<div class="ev-loading">' + _esc(T('atlas.loading')) + '</div>';
      updateLoadBtns(0);
      clearTimeout(renderEventList._t);
      renderEventList._t = setTimeout(() => {
        if (state.mode === 'events') renderEventList();
      }, 200);
      return;
    }
    // Range filter applied after boot-race check — a legitimately empty window
    // shows the empty shelf rather than spinning forever.
    const all = evAll();
    if (!all.length) {
      list.innerHTML = '<div class="list-empty">' + _esc(T('atlas.empty')) + '</div>';
      updateLoadBtns(0);
      return;
    }
    seedWindow(all); // focus-centered on (re)entry; preserved across paging
    updateReccount(); // all-events tally = the whole catalogue of this kind (parallels renderList)
    list.innerHTML = '';
    for (let i = winStart; i < winEnd; i++) {
      const e = all[i];
      const kindKey = String(e.kind || '').toLowerCase();
      const mag = e.magnitude == null || !isFinite(+e.magnitude) ? '—' : (+e.magnitude).toFixed(3);
      const recs = recordsForEvent(e.date, kind);
      const n = recs.length;
      // Deduplicate to one seal per civilization and render inline right of the date.
      const civs = [...new Set(recs.map((r) => r.civ).filter(Boolean))];
      const sealsHtml =
        civs.length && window.Seal
          ? '<span class="ec-seals">' +
            civs
              .map((c) => {
                const lbl = Seal.name(c, typeof I18n !== 'undefined' ? I18n.getLocale() : 'en');
                return Seal.svg(c, 15, lbl);
              })
              .join('') +
            '</span>'
          : '';
      const glyph =
        typeof EclipseGlyph !== 'undefined' && EclipseGlyph.render
          ? EclipseGlyph.render(e, { size: 48, idPrefix: 'ev-' + kind + '-' + e.date })
          : '';
      const isSel = state.selEv === evKey(e.date, kind);
      const card = document.createElement('div');
      card.className = 'evcard' + (isSel ? ' sel expanded' : '') + (n ? '' : ' ev-norec');
      card.dataset.date = e.date;
      card.dataset.kind = kind;
      // .ec-detail holds the inline science/records body, filled only when selected;
      // js/event-panel.js builds that HTML.
      const peakLine = window.Sidebar && Sidebar.peakLineHtml ? Sidebar.peakLineHtml(e, kind) : '';
      card.innerHTML =
        '<span class="ec-glyph">' +
        glyph +
        '</span>' +
        '<div class="ec-body">' +
        '<div class="ec-row1"><span class="ec-date num"' +
        _calGlossFor(e.date, state.lang) +
        '>' +
        _esc(_sciDate(e.date, state.lang)) +
        '</span>' +
        sealsHtml +
        '</div>' +
        (peakLine ? '<div class="ec-peak">' + peakLine + '</div>' : '') +
        '<div class="ec-row2"><span class="ec-kind"' +
        _gloss('ecl_type_' + kind + '_' + kindKey) +
        '>' +
        _esc(T('eclipse.type.' + kind + '.' + kindKey)) +
        '</span> · <span class="ec-magk"' +
        _gloss('ecl_magnitude') +
        '>' +
        _esc(T('eclipse.card.magnitude')) +
        '</span> <span class="num">' +
        mag +
        '</span></div>' +
        '</div>' +
        '<div class="ec-detail"></div>';
      if (isSel) fillEventDetail(card, e, kind);
      // Click the summary area toggles selection (re-click collapses); clicks
      // inside .ec-detail (nav / records / contacts) handle themselves.
      card.onclick = (ev) => {
        if (!window.getSelection().isCollapsed) return;
        if (ev.target.closest('.ec-detail')) return;
        if (state.selEv === evKey(e.date, kind)) clearEventSel();
        else selectEvent(e.date, kind);
      };
      // Reverse cross-highlight: hovering an event card lights its records and, for
      // a central solar event, its band. No CENTRAL_KINDS gate — a non-central
      // event simply has no band layer to find, and its records still light.
      card.onmouseenter = () => setEventHighlight(e.date, kind, true);
      card.onmouseleave = () => setEventHighlight(e.date, kind, false);
      list.appendChild(card);
    }
    updateLoadBtns(all.length);
    drawBands(); // central-band shadows for the visible solar events
    applyEventFocus();
  }

  // Resolve the full loader event (with science fields) for an inline detail fill.
  function eventByKey(dateStr, kind) {
    if (!window.EclipseLoader || !EclipseLoader.all) return null;
    return EclipseLoader.all().find((e) => e.date === dateStr && e._kind === kind) || null;
  }

  // The loaded record for a (date, phenomenon) selEv key. Guest stars / comets have
  // no eclipse event, so the jingguan strip reads their identification + date_precision
  // from the record itself.
  function recordByKey(dateStr, kind) {
    return RECS.find((r) => r.date === dateStr && r.type === kind) || null;
  }

  // Switch the rail mode (records records / all-events events) and sync the segment button.
  function setMode(m) {
    if (state.mode === m) return;
    state.mode = m;
    document.querySelectorAll('#modeseg button').forEach((x) => {
      const on = x.dataset.m === m;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', String(on));
    });
    renderList();
  }

  // elephantine corner nav nav glyphs: prev/next chevrons + close cross, all drawn on one 24×24
  // viewBox with a single stroke so they read at an identical visual size. The
  // blank-spine divider + corner-nail nails are pure CSS on .ev-strip-nav button; glyphs stay geometric.
  const NAV_GLYPH = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6 8 12 15 18"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6 16 12 9 18"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18"/></svg>',
  };

  // Show/hide the minimal floating strip (#ev-strip) that anchors the selection
  // identity + prev/close/next buttons above the map. Created lazily on first use.
  // The strip never holds detail content — science lives in the .evcard inline.
  function updateEvStrip() {
    let strip = document.getElementById('ev-strip');
    if (!state.selEv) {
      if (strip) strip.style.display = 'none';
      if (typeof EvScrub !== 'undefined') EvScrub.detach();
      return;
    }
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'ev-strip';
      (document.getElementById('map') || document.body).appendChild(strip);
      // The strip lives INSIDE the Leaflet container (so it anchors to the map, not
      // the page), which means a mousedown on its text bubbles up to Leaflet's own
      // drag handler and gets hijacked into a map pan instead of a text selection.
      // disableClickPropagation/disableScrollPropagation (Leaflet's own control-layer
      // fix for exactly this) stop that bubbling so the strip behaves like ordinary
      // page text — selectable/copyable — while clicks elsewhere on the map still
      // drag/zoom normally.
      if (window.L && L.DomEvent) {
        L.DomEvent.disableClickPropagation(strip);
        L.DomEvent.disableScrollPropagation(strip);
      }
      // Delegated click: ‹ / × / › buttons share one handler on the container.
      strip.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const btn = ev.target.closest('[data-nav]');
        if (!btn) return;
        const d = btn.dataset.nav;
        if (d === 'close') clearEventSel();
        else stepSelection(parseInt(d, 10));
      });
    }
    strip.style.display = '';
    const bar = state.selEv.lastIndexOf('|');
    const dateStr = state.selEv.slice(0, bar),
      kind = state.selEv.slice(bar + 1);
    // kexing/huibo are transients (kind = phenomenon): no eclipse event, so read the
    // record instead and take the year from its own date (else the chronicle line
    // stays blank because y was derived from the missing event).
    const isTransient = kind !== 'solar' && kind !== 'lunar';
    // Prefer the specific selected record (state.sel = record_id) so that multiple
    // records sharing the same year-only event_date are each resolved individually.
    // recordByKey is a coarser fallback for the rare case where sel lags behind selEv.
    const trec = isTransient
      ? state.sel
        ? RECS.find((r) => r.id === state.sel) || recordByKey(dateStr, kind)
        : recordByKey(dateStr, kind)
      : null;
    const e = isTransient ? null : eventByKey(dateStr, kind);
    const y = e ? _eventYear(e.date) : _eventYear(dateStr);
    // 30px glyph: eclipse figure, or a kexing/huibo emblem — either way it fills (and
    // reserves) the same slot beside the two rows.
    const glyph = isTransient
      ? typeof EclipseGlyph !== 'undefined' && EclipseGlyph.transientGlyph
        ? EclipseGlyph.transientGlyph(kind, 30, trec)
        : ''
      : e && typeof EclipseGlyph !== 'undefined' && EclipseGlyph.render
        ? EclipseGlyph.render(e, { size: 30, idPrefix: 'strip-' })
        : '';
    // Line-1 tail after the date: for an eclipse, type + magnitude; for a transient,
    // modern name + designation|unconfirmed (see transientL1).
    let l1extra;
    if (isTransient) {
      l1extra = transientL1(trec, state.lang);
    } else {
      const kindKey = e ? String(e.kind || '').toLowerCase() : '';
      const typeLabel = kindKey ? T('eclipse.type.' + kind + '.' + kindKey) : '';
      // Magnitude (magnitude): 3 decimals with its label so the bare number reads clearly.
      const rawMag = e ? e.magnitude : null;
      const magStr =
        rawMag != null && isFinite(+rawMag) ? T('eclipse.card.magnitude') + ' ' + (+rawMag).toFixed(3) : '';
      l1extra =
        (typeLabel
          ? ' · <span class="ev-strip-type"' +
            _gloss('ecl_type_' + kind + '_' + kindKey) +
            '>' +
            _esc(typeLabel) +
            '</span>'
          : '') +
        (magStr ? ' · <span class="ev-strip-mag"' + _gloss('ecl_magnitude') + '>' + _esc(magStr) + '</span>' : '');
    }
    // Chronicle line (shilu): reign-era + reckoned lunisolar/ganzhi (CJK) or period +
    // year (Western). Already HTML — may carry the vermilion (zhu) anchor span.
    // The peak instant is what the CJK branch shifts into East-8; solar and lunar
    // events file it under different keys, and transients have none.
    const peakIso = e ? (e.peak && e.peak.time) || (e.times && e.times.peak) || null : null;
    const chronicle = chronicleStr(
      y,
      kind,
      dateStr,
      state.lang,
      isTransient ? trec && trec.datePrecision : 'day',
      isTransient ? trec && trec.lunarMonth : null,
      peakIso
    );
    // shu'er label: CJK/ja keep the upright vertical jingguan; Western get a short spine label
    // (ear.now.short) so long words (fr "Maintenant") can't overflow the tab.
    // ear.now.short is deliberately a Latin-script-only key — reading it on the CJK
    // branch is what forced the old `!== 'ear.now.short'` echo guard here.
    const tabLabel = isZh(state.lang) || state.lang === 'ja' ? T('ear.now') : T('ear.now.short');
    const canPrev = !!stepSelection(-1, { peek: true });
    const canNext = !!stepSelection(1, { peek: true });
    // Two registers stacked in .ev-strip-lines: the science row (ISO · type · magnitude)
    // over the chronicle row; the glyph is a quandian centered against the pair.
    strip.innerHTML =
      '<span class="ev-strip-tab' +
      (isZh(state.lang) || state.lang === 'ja' ? '' : ' is-latin') +
      '" aria-hidden="true">' +
      _esc(tabLabel) +
      '</span>' +
      '<span class="ev-strip-body">' +
      '<span class="ev-strip-glyph">' +
      glyph +
      '</span>' +
      '<span class="ev-strip-lines">' +
      '<span class="ev-strip-l1"><b' +
      _calGlossFor(dateStr, state.lang) +
      '>' +
      _esc(_sciDate(dateStr, state.lang)) +
      '</b>' +
      l1extra +
      '</span>' +
      (chronicle ? '<span class="ev-strip-l2">' + chronicle + '</span>' : '') +
      '</span>' +
      '</span>' +
      '<span class="ev-strip-nav">' +
      '<button data-nav="-1"' +
      (canPrev ? '' : ' disabled') +
      ' aria-label="prev">' +
      NAV_GLYPH.prev +
      '</button>' +
      '<button data-nav="1"' +
      (canNext ? '' : ' disabled') +
      ' aria-label="next">' +
      NAV_GLYPH.next +
      '</button>' +
      '<button data-nav="close" aria-label="close">' +
      NAV_GLYPH.close +
      '</button>' +
      '</span>';

    // jiechi (carpenter-rule) ledge: hang the intraday time-scrubber under the ear for real-time
    // solar/lunar events. Transient record kinds (yanfan/kexing/huibo) have no contact
    // geometry, so EvScrub.attach self-detaches on them.
    if (typeof EvScrub !== 'undefined') EvScrub.attach(e, kind);
  }

  // Fill a selected .evcard's .ec-detail with the inline science + records body
  // (Sidebar.detailHtml). No nav/close chrome here — that lives on the top
  // #ev-strip summary bar; the rail card is pure detail (avoids double controls).
  function fillEventDetail(card, e, domain) {
    if (!card) return;
    const box = card.querySelector('.ec-detail');
    if (!box) return;
    box.innerHTML = window.Sidebar && Sidebar.detailHtml ? Sidebar.detailHtml(e, domain) : '';
    // Linked-record rows → switch to records mode (so the record card is visible), select.
    box.querySelectorAll('.ep-rec').forEach((r) => {
      const go = (ev) => {
        if (ev) ev.stopPropagation();
        setMode('records');
        select(r.dataset.id);
      };
      r.onclick = go;
      r.onkeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          go(ev);
        }
      };
    });
  }

  // Re-render the currently expanded event card's detail (locale switch / boot
  // records-race). Exposed for event-panel.js's Sidebar hooks.
  function refreshEventDetail() {
    if (!state.selEv) return;
    const bar = state.selEv.lastIndexOf('|');
    const dateStr = state.selEv.slice(0, bar),
      kind = state.selEv.slice(bar + 1);
    const list = document.getElementById('list');
    if (!list) return;
    const esc = window.CSS && CSS.escape ? CSS.escape(dateStr) : dateStr;
    const card = list.querySelector('.evcard.expanded[data-date="' + esc + '"][data-kind="' + kind + '"]');
    if (card) fillEventDetail(card, eventByKey(dateStr, kind), kind);
  }

  // all-events window centering for the CURRENT mode only: when all-events is already the
  // active view and the given event's card falls outside the rendered window
  // (e.g. stepping to a far neighbour, or a forecast-popup pick), re-seed
  // winStart/winEnd on its exact index and report true so the caller rebuilds.
  // Cross-mode centering (when selected while another mode is active) is NOT this function's job — that's
  // handled lazily by seedWindow()'s selection-aware snap above, the moment the
  // reader actually switches modes. Doing it here too would fight over the same
  // winStart/winEnd globals with centerRecordsWindow() below (whichever ran
  // last would clobber the other's window before either mode was ever shown).
  function centerEventWindow(dateStr, kind) {
    if (state.mode !== 'events' || kind !== state.type) return false;
    const all = evAll();
    const idx = all.findIndex((e) => e.date === dateStr);
    if (idx < 0 || (idx >= winStart && idx < winEnd)) return false;
    winStart = Math.max(0, idx - INITIAL_BEFORE);
    winEnd = Math.min(all.length, idx + INITIAL_AFTER);
    winSeedKey = seedKeyNow(); // claim the window for this exact filter fingerprint
    return true;
  }

  // The reverse direction, same current-mode-only scope as centerEventWindow.
  function centerRecordsWindow(recId) {
    if (state.mode !== 'records') return false;
    const recs = recsSorted();
    const idx = recs.findIndex((r) => r.id === recId);
    if (idx < 0 || (idx >= winStart && idx < winEnd)) return false;
    winStart = Math.max(0, idx - INITIAL_BEFORE);
    winEnd = Math.min(recs.length, idx + INITIAL_AFTER);
    winSeedKey = seedKeyNow(); // claim the window for this exact filter fingerprint
    return true;
  }

  // Select an EVENT (record or not): drive the engine's contact curves via
  // EclipseLoader (which also flies the map to the greatest-eclipse point —
  // unlike select()'s records, an event has no single "don't jump" record
  // marker to preserve), glide the lens, and move the .sel highlight in place
  // (no list rebuild → scroll + any text selection survive), expanding its
  // inline detail.
  function selectEvent(dateStr, kind) {
    clearObservation(); // a prior point's read-out was for the old event
    state.selEv = evKey(dateStr, kind);
    const y = _eventYear(dateStr);
    if (y != null) setFocusTarget(normYear(y));
    if (window.EclipseLoader && EclipseLoader.selectByDate) {
      EclipseLoader.selectByDate(dateStr, kind); // curves + TimeState + fly to peak
    }
    // all-events window centering, only meaningful when all-events is already the active
    // view (see centerEventWindow's own comment for the cross-mode case).
    if (centerEventWindow(dateStr, kind)) renderEventList();
    // records follow-through: if this event has a matching record, select it too
    // (state.sel) so switching to records later lands on it — the exact centering
    // itself happens lazily in seedWindow() at that point. No matching record →
    // clear any stale state.sel instead of leaving an unrelated record
    // highlighted. If records already happens to be the active view, recenter now.
    const linkedRecs = recordsForEvent(dateStr, kind);
    state.sel = linkedRecs.length ? linkedRecs[0].id : null;
    if (state.sel && centerRecordsWindow(state.sel)) renderList();
    highlightEventCard(dateStr, kind);
    updateEvStrip();
    drawTimeline();
    drawBands(); // hide other bands while this event is selected
    drawMarkers(); // narrow map markers to this event's records
    applyEventFocus(); // dim other events' cards, light this one's siblings
  }

  // Move the .sel/.expanded highlight to the given event's rail card, filling its
  // inline detail and scrolling it to center. Shared by selectEvent() and select()
  // (record→event, all-events mode) so both land identically. The card must already be
  // in the rendered window (caller re-seeds via centerEventWindow + renderEventList
  // when it isn't); in records mode the rail holds .reccard, not .evcard, so callers
  // guard on state.mode. Idempotent — renderEventList already flags an in-window
  // isSel card, but only this scrolls it into view.
  function highlightEventCard(dateStr, kind) {
    const list = document.getElementById('list');
    if (!list) return;
    // Collapse the previously expanded card, then expand the newly selected one.
    list.querySelectorAll('.evcard.sel, .evcard.expanded').forEach((c) => {
      c.classList.remove('sel', 'expanded');
      const b = c.querySelector('.ec-detail');
      if (b) b.innerHTML = '';
    });
    const card = list.querySelector(
      '.evcard[data-date="' +
        (window.CSS && CSS.escape ? CSS.escape(dateStr) : dateStr) +
        '"][data-kind="' +
        kind +
        '"]'
    );
    if (card) {
      card.classList.add('sel', 'expanded');
      fillEventDetail(card, eventByKey(dateStr, kind), kind);
      card.scrollIntoView({ block: 'center' });
    }
  }

  // Deselect the event: restore the band overview and collapse the inline detail.
  function clearEventSel() {
    state.selEv = null;
    state.sel = null; // drop any record selection too, so × fully clears records mode
    clearObservation();
    if (map) map.closePopup(); // close the selected record's marker popup if open
    // Tear down the engine's live footprint + selected curves.
    if (window.EclipseLoader && EclipseLoader.deselect) EclipseLoader.deselect();
    const list = document.getElementById('list');
    if (list) {
      list.querySelectorAll('.evcard.expanded, .evcard.sel, .reccard.sel').forEach((c) => {
        c.classList.remove('expanded', 'sel');
        const b = c.querySelector('.ec-detail');
        if (b) b.innerHTML = '';
      });
    }
    updateEvStrip();
    drawBands();
    drawMarkers(); // restore the full filtered marker set
    drawTimeline(); // clear the selected record's dot highlight on the lizhou
    applyEventFocus(); // clear the library dimming and linkage
  }

  // Step the selection to the previous/next eclipse OF THE SAME DOMAIN, walking
  // EclipseLoader's peak-sorted catalogue. dir = -1 (earlier) / +1 (later).
  // opts.peek → just return the neighbour (button enable/disable), no select.
  function stepEvent(dir, opts) {
    const L = window.EclipseLoader;
    if (!L || !L.all || !L.selected) return null;
    const cur = L.selected();
    if (!cur) return null;
    // Constrain stepping to the current handle window so ‹ › never leave state.range.
    const [lo, hi] = state.range;
    const all = L.all().filter((e) => {
      if (e._kind !== cur._kind) return false;
      const m = /^(-?\d+)/.exec(e.date || '');
      return m && +m[1] >= lo && +m[1] <= hi;
    });
    if (!all.length) return null;
    const i = all.indexOf(cur);
    if (i < 0) return null; // current event outside range
    for (let j = i + dir; j >= 0 && j < all.length; j += dir) {
      const nb = all[j];
      if (!(opts && opts.peek)) selectEvent(nb.date, nb._kind);
      return nb;
    }
    return null; // at range boundary
  }

  // Mode-aware neighbour step for the #ev-strip ‹ › buttons. all-events steps between
  // EVENTS (stepEvent, same kind); records steps the visible RECORD list (select the
  // adjacent card) so the strip stays linked to whatever the rail is showing.
  // opts.peek returns the neighbour (or null at a boundary) without selecting.
  function stepSelection(dir, opts) {
    if (state.mode === 'records') {
      if (!state.sel) return null;
      const recs = recsSorted();
      const i = recs.findIndex((r) => r.id === state.sel);
      if (i < 0) return null;
      // Step to the FIRST record of the adjacent EVENT, not the adjacent record —
      // one eclipse (evKey = date|type) may carry several records, which recsSorted
      // keeps contiguous (secondary sort on date). Forward: skip the current event's
      // run, land on its next distinct key. Backward: skip the current run, then walk
      // to the START of the previous event's run so prev always lands on that event's
      // first record, mirroring next.
      const key = (r) => evKey(r.date, r.type);
      const cur = key(recs[i]);
      let j = i;
      if (dir > 0) {
        while (j < recs.length && key(recs[j]) === cur) j++; // skip current event
        if (j >= recs.length) return null; // no next event
      } else {
        while (j >= 0 && key(recs[j]) === cur) j--; // → last rec of prev event
        if (j < 0) return null; // no previous event
        const prev = key(recs[j]);
        while (j - 1 >= 0 && key(recs[j - 1]) === prev) j--; // back to its first rec
      }
      const nb = recs[j];
      if (!(opts && opts.peek)) select(nb.id);
      return nb;
    }
    return stepEvent(dir, opts);
  }

  // ---- Central-band shadow overlay (total/annular eclipse path) ----
  // Draw the totality/annularity band of every central solar eclipse currently
  // loaded in the right rail as a translucent wash, interactive: hover cross-
  // highlights the card + related record markers, click jumps to the event.
  const CENTRAL_KINDS = { Total: 1, Annular: 1, Hybrid: 1 };
  function solarByDate(date) {
    // Build lazily, but NOT while EclipseLoader is still loading (boot race:
    // caching an empty map here would strand records-mode bands forever).
    if (!_solarByDate || !_solarByDate.size) {
      const all = window.EclipseLoader && EclipseLoader.all ? EclipseLoader.all() : [];
      if (all.length) {
        _solarByDate = new Map();
        for (const e of all) if (e._kind === 'solar' && !_solarByDate.has(e.date)) _solarByDate.set(e.date, e);
      }
    }
    return (_solarByDate && _solarByDate.get(date)) || null;
  }

  // The central solar events whose bands should show = the ones backing the
  // right rail's currently visible window (events: the slice; records: the
  // visible records' distinct solar events).
  function visibleCentralEvents() {
    if (state.type !== 'solar') return [];
    let evs;
    if (state.mode === 'events') {
      evs = evAll().slice(winStart, winEnd);
    } else {
      const recs = recsSorted().slice(winStart, winEnd);
      const seen = new Set();
      evs = [];
      for (const r of recs) {
        if (r.type !== 'solar' || seen.has(r.date)) continue;
        seen.add(r.date);
        const e = solarByDate(r.date);
        if (e) evs.push(e);
      }
    }
    return evs.filter((e) => e && CENTRAL_KINDS[e.kind]);
  }

  // Semantic band colours (song palette): total = yanzhi madder, annular/hybrid =
  // zheshi ochre; matches the engine's single-event band fill.
  function bandColor(kind) {
    const ann = kind === 'Annular' || kind === 'Hybrid';
    return ann ? '#B0703C' : '#A8324A';
  }

  const BAND_FILL_OP = 0.07,
    BAND_HL_FILL_OP = 0.2,
    SPARK = '#CE564C'; // yanzhi (== --spark)
  function drawBands() {
    if (!bandLayer || !map) return;
    // Boot race: EclipseLoader.init isn't awaited, so the catalogue may not be
    // ready on the first render — retry so the initial bands still appear.
    if (state.type === 'solar' && window.EclipseLoader && EclipseLoader.all && !EclipseLoader.all().length) {
      clearTimeout(drawBands._t);
      drawBands._t = setTimeout(drawBands, 200);
      return;
    }
    // An event is selected → the engine renders its band in a higher pane;
    // hide the background overview so other paths don't add visual noise.
    // Bump the token BEFORE returning: an in-flight overview Promise.all (e.g.
    // a permalink cold-load that selects an event a tick later) would otherwise
    // still pass its token check and repaint the overview central band on top
    // of the cached curves — the two must stay mutually exclusive.
    if (state.selEv) {
      ++_bandToken;
      bandLayer.clearLayers();
      return;
    }
    const token = ++_bandToken;
    const evs = visibleCentralEvents();
    if (!evs.length) {
      bandLayer.clearLayers();
      return;
    }
    // Cache the PROMISE, not the value it resolves to. drawBands runs several times
    // over a boot (renderList, event selection, mode switch, theme swap); a
    // value-keyed cache is still empty while the first fetch is in flight, so every
    // in-flight event file was fetched a second time.
    Promise.all(
      evs.map((e) => {
        let p = _bandCache.get(e.date);
        if (!p) {
          p = (eclipseCtl && eclipseCtl.bandRingsFor ? eclipseCtl.bandRingsFor(e) : Promise.resolve(null)).catch(
            () => null
          );
          _bandCache.set(e.date, p);
        }
        return p.then((r) => ({ e, r }));
      })
    ).then((results) => {
      if (token !== _bandToken) return; // a newer drawBands superseded this one
      bandLayer.clearLayers();
      for (const { e, r } of results) {
        // One event can yield several rings — a band clipped by the terminator arrives as
        // separate closed loops, and drawing only the first left visible gaps.
        if (!r || !r.ok || !r.rings) continue;
        for (const ring of r.rings) drawBandRing(ring, e, bandColor(e.kind));
      }
    });
  }

  // One band ring → an L.polygon in every world copy that overlaps −200…520
  // (same wMin/wMax derivation the engine's addBandPolygon uses).
  function drawBandRing(ring, e, color) {
    const base = {
      pane: 'atlas-bands',
      smoothFactor: 0,
      interactive: true,
      color: color,
      weight: 1,
      opacity: 0.4,
      fill: true,
      fillColor: color,
      fillOpacity: BAND_FILL_OP,
    };
    const LNG_WEST = -200,
      LNG_EAST = 520;
    let lo = Infinity,
      hi = -Infinity;
    for (const p of ring) {
      if (p[1] < lo) lo = p[1];
      if (p[1] > hi) hi = p[1];
    }
    if (!isFinite(lo)) return;
    const wMin = Math.ceil((LNG_WEST - hi) / 360),
      wMax = Math.floor((LNG_EAST - lo) / 360);
    for (let w = wMin; w <= wMax; w++) {
      const shifted = w === 0 ? ring : ring.map((p) => [p[0], p[1] + w * 360]);
      const poly = L.polygon(shifted, base).addTo(bandLayer);
      poly._evDate = e.date;
      poly._evKind = e.kind;
      poly._baseColor = color;
      // 'solar' is the RECORD type here, not e.kind (which is the total/annular subtype).
      poly.on('mouseover', () => setEventHighlight(e.date, 'solar', true));
      poly.on('mouseout', () => setEventHighlight(e.date, 'solar', false));
      const _bandTipDate = _sciDate(e.date, state.lang);
      const _bandTipKind =
        typeof I18n !== 'undefined' ? I18n.t('eclipse.type.solar.' + (e.kind || '').toLowerCase()) : e.kind || '';
      const _bandTip = [_bandTipDate, _bandTipKind].filter(Boolean).join(' · ');
      if (_bandTip) poly.bindTooltip(_bandTip, { sticky: true, className: 'eclipse-curve-tooltip' });
      // Click a shadow: re-click the selected one closes it; in records mode jump to
      // the event's record card, in all-events mode expand its event card. Stop the
      // click from bubbling to the map's own 'click' handler — otherwise it
      // fires right after selectEvent()/select() set state.selEv and mistakenly
      // opens the local-observation popup at this point too.
      poly.on('click', (domEvt) => {
        L.DomEvent.stopPropagation(domEvt);
        if (state.selEv === evKey(e.date, 'solar')) {
          clearEventSel();
          return;
        }
        if (state.mode === 'records') {
          const rs = recordsForEvent(e.date, 'solar');
          if (rs.length) {
            select(rs[0].id);
            return;
          }
        }
        selectEvent(e.date, 'solar');
      });
    }
  }

  // Cross-highlight one event everywhere it surfaces: its shadow band, its
  // all-events card, and the record cards + map markers of every civilization
  // that witnessed it. The linkage thread is what makes two vantages on one
  // event legible as one event; only the band half is solar-specific (no other
  // kind draws a shadow).
  // `origin` is the record the pointer is actually on, and it is what decides the group
  // (see linkKey) — date+kind cannot, outside the catalogue kinds. Callers that start from
  // an event rather than a record (the all-events card, a band) pass none and take the
  // catalogue path, which is the only path those two surfaces have.
  function setEventHighlight(date, kind, on, origin) {
    if (bandLayer && kind === 'solar') {
      bandLayer.eachLayer((l) => {
        if (l._evDate !== date) return;
        l.setStyle(
          on
            ? { color: SPARK, weight: 1.5, opacity: 0.95, fillColor: l._baseColor, fillOpacity: BAND_HL_FILL_OP }
            : { color: l._baseColor, weight: 1, opacity: 0.4, fillColor: l._baseColor, fillOpacity: BAND_FILL_OP }
        );
      });
    }
    const _cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
    const esc = _cssEsc(date);
    // Match the kind too: one date can carry a solar eclipse AND a comet sighting,
    // and lighting the wrong card would assert a link that isn't there.
    document
      .querySelectorAll('.evcard[data-date="' + esc + '"][data-kind="' + _cssEsc(kind) + '"]')
      .forEach((c) => c.classList.toggle('hl', on));
    for (const r of origin ? siblingRecords(origin) : recordsForEvent(date, kind)) {
      document
        .querySelectorAll('.reccard[data-id="' + _cssEsc(r.id) + '"]')
        .forEach((c) => c.classList.toggle('hl', on));
      const m = markerById[r.id],
        el = m && m.getElement && m.getElement();
      if (el) el.classList.toggle('mk-hl', on);
    }
  }

  // Wait until a record is actually held, fetching registers until it turns up.
  // Boot loads only the register on screen, so a link into one still streaming in
  // arrives before its shards do; select() finds nothing and returns without a word.
  // The active register is tried first because a permalink names it in `type`.
  async function ensureRecord(id) {
    const held = () => RECS.some((r) => r.id === id);
    if (held()) return true;
    const all = [...new Set(((MANIFEST && MANIFEST.files) || []).map((f) => f.phenomenon))];
    for (const ph of [state.type, ...all.filter((p) => p !== state.type)]) {
      await loadPhenomenon(ph);
      if (held()) return true;
    }
    return false;
  }

  // ---- SELECT (ORBIS: pan + popup + REAL contact curves + time baseline) ----
  function select(id) {
    const rec = RECS.find((r) => r.id === id);
    if (!rec) return;
    state.sel = id;
    setFocusTarget(normYear(rec.year)); // glide the lens to the record's year
    // Selecting a record also selects its eclipse EVENT (the footprint + panel
    // open below), so enter selected-event mode: the map narrows to this event's
    // records, other cards dim, and a map-point click opens the observation popup.
    clearObservation();
    state.selEv = evKey(rec.date, rec.type);
    // A record chosen from a map marker / timeline dot / event panel may fall
    // outside the current page. Re-seed the window on it and rebuild so its card
    // exists to highlight. (A click on an in-window card skips this, keeping the
    // in-place .sel toggle that preserves any in-progress text selection.)
    if (state.mode === 'records') {
      const recs = recsSorted();
      const idx = recs.findIndex((r) => r.id === id);
      if (idx >= 0 && (idx < winStart || idx >= winEnd)) {
        winStart = Math.max(0, idx - INITIAL_BEFORE);
        winEnd = Math.min(recs.length, idx + INITIAL_AFTER);
        winSeedKey = seedKeyNow(); // hold this window against seedWindow's preserve path
        renderList();
      }
    }
    // If all-events is the ACTIVE view, mirror what selectEvent() does: re-seed the
    // window onto this record's underlying event (if off-page) and move the
    // .sel/.expanded highlight to its card. When records is active instead, the
    // all-events window is centered lazily by seedWindow()'s selection snap the moment
    // the reader switches modes (state.selEv was set at 1977) — see its comment.
    if (state.mode === 'events') {
      if (centerEventWindow(rec.date, rec.type)) renderEventList();
      highlightEventCard(rec.date, rec.type);
    }
    drawBands();
    drawMarkers();
    drawTimeline();
    applyEventFocus();
    // Move the .sel highlight in place rather than rebuilding the list — a full
    // renderList() here would destroy any in-progress text selection in a card.
    const list = document.getElementById('list');
    if (list) {
      list.querySelectorAll('.reccard.sel').forEach((c) => c.classList.remove('sel'));
      const esc = window.CSS && CSS.escape ? CSS.escape(id) : id;
      const card = list.querySelector('.reccard[data-id="' + esc + '"]');
      if (card) {
        card.classList.add('sel');
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    // Fly the map to the record's own observation site, then open its popup in
    // place — autoPan stays disabled on the popup so opening it doesn't cause a
    // second, smaller shift right after flyTo already centered the view.
    if (map && rec.lat != null) {
      if (markerById[id]) {
        openRecPopup(id);
      } else {
        // Flying to a record outside the pre-fly viewport means drawMarkers()
        // hasn't built its marker yet (LOD is viewport-based) — redraw once the
        // fly settles, THEN open, or markerById[id] is still undefined here.
        map.once('moveend', () => {
          drawMarkers();
          openRecPopup(id);
        });
      }
      map.flyTo([rec.lat, rec.lon], Math.max(map.getZoom(), 4));
    }
    // Real geometry: select the matching eclipse so the engine draws its contact
    // curves; baseline TimeState on that event's PEAK so the (now static) umbra
    // sits at greatest eclipse. Pass noFly so selectEvent does NOT fly to the peak.
    const d = _dateFromStr(rec.date);
    let ev = null;
    // Only eclipse records hook the geometry engine. Guest stars / comets (guest,
    // comet) have no eclipse event — without this guard selectNearest would snap to a
    // bogus nearest eclipse and draw its contact curves under an unrelated record.
    if (window.EclipseLoader && (rec.type === 'solar' || rec.type === 'lunar')) {
      if (!EclipseLoader.selectByDate(rec.date, rec.type, { noFly: true }) && d)
        EclipseLoader.selectNearest(d, { noFly: true });
      ev = EclipseLoader.selected && EclipseLoader.selected();
    }
    const peak = ev && EclipseLoader.peakMs ? EclipseLoader.peakMs(ev) : d ? d.getTime() : null;
    if (peak != null && !isNaN(peak) && TS) TS.resetTo(new Date(peak));
    updateEvStrip(); // record selection drives the top strip too (records↔strip sync)
  }

  // ---- Language / panels ----
  // The one search box means different things per mode — prose in the records
  // list, eclipse type and date in the all-events table — so its label follows
  // the mode. The declarative key is rewritten too, not just the rendered text,
  // so a later I18n.applyDOM() re-resolves the mode-appropriate string.
  function syncSearchTip() {
    const q = document.getElementById('q');
    if (!q) return;
    q.dataset.i18nAria = state.mode === 'events' ? 'atlas.search_events' : 'atlas.search';
    const label = T(q.dataset.i18nAria);
    q.setAttribute('data-tip', label);
    q.setAttribute('aria-label', label);
  }

  function applyLang() {
    document.documentElement.lang = state.lang;
    document.body.dataset.lang = state.lang;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    set('lib-t', T('atlas.lib'));
    set('tltab', T('atlas.tab.tlt'));
    syncSearchTip();
    // fuqian type slips: Latin locales use typeShort abbreviations (sideways full
    // words would stretch the slips); CJK/ja use the full two-glyph names.
    const isLatin = !isZh(state.lang) && state.lang !== 'ja';
    const full = {
      solar: T('atlas.solar'),
      lunar: T('atlas.lunar'),
      occultation: T('atlas.fut.occultation'),
      conjunction: T('atlas.fut.conjunction'),
      guest: T('atlas.fut.guest'),
      comet: T('atlas.fut.comet'),
    };
    const short = isLatin
      ? {
          solar: T('atlas.type.solar'),
          lunar: T('atlas.type.lunar'),
          occultation: T('atlas.type.occultation'),
          conjunction: T('atlas.type.conjunction'),
          guest: T('atlas.type.guest'),
          comet: T('atlas.type.comet'),
        }
      : {};
    document.querySelectorAll('#typeseg button').forEach((b) => {
      const f = full[b.dataset.t];
      if (!f) return;
      b.textContent = short[b.dataset.t] || f;
      b.setAttribute('aria-label', f);
      if (short[b.dataset.t]) b.setAttribute('data-tip', f);
      else b.removeAttribute('data-tip');
    });
    const mseg = document.querySelectorAll('#modeseg button');
    if (mseg[0]) mseg[0].textContent = T('atlas.mode.records');
    if (mseg[1]) mseg[1].textContent = T('atlas.mode.all');
  }

  function renderAll() {
    renderCivFilter();
    renderList();
    drawTimeline();
    drawMarkers();
    applyLang();
  }

  function toggle(panelId, tabId, show) {
    const p = document.getElementById(panelId),
      tab = document.getElementById(tabId);
    const willShow = show !== undefined ? show : p.classList.contains('hidden');
    p.classList.toggle('hidden', !willShow);
    if (tab) tab.style.display = willShow ? 'none' : 'flex';
  }

  function wireChrome() {
    // The seam toggles are <button>s; keep aria-pressed in sync with .on so the
    // dual-toggle layout affordance is also exposed to assistive tech (R13).
    const syncPressed = (sel) =>
      document
        .querySelectorAll(sel + ' button')
        .forEach((x) => x.setAttribute('aria-pressed', String(x.classList.contains('on'))));
    // type toggle (solar / lunar exclusive) — re-seeds the all-events window (evSeedKey)
    document.querySelectorAll('#typeseg button').forEach(
      (b) =>
        (b.onclick = () => {
          document.querySelectorAll('#typeseg button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          syncPressed('#typeseg');
          // Tear down the previous layer's selection before switching type, so a
          // solar event's live shadow / cached curves / body-marker disks / lunar
          // veil don't linger onto the new layer — all four share one soloLayer /
          // curvesLayer, and only a teardown (not a re-render) removes them.
          clearEventSel();
          state.type = b.dataset.t;
          // The new phenomenon's shards may not be in yet (only the booted one blocks
          // first paint). Render immediately with whatever is held — usually everything,
          // since the background sweep starts right after boot — and render again when
          // the load resolves. loadPhenomenon is a no-op once a phenomenon is in.
          const redraw = () => {
            renderList();
            drawTimeline();
            drawMarkers();
          };
          redraw();
          loadPhenomenon(state.type).then((added) => {
            if (added) redraw();
          });
        })
    );
    // mode toggle (records records / all-events events exclusive). Only the rail content
    // changes — map + timeline untouched — so just re-render the list. seedKeyNow
    // carries the mode prefix, so the switch re-seeds the window on the focus.
    document.querySelectorAll('#modeseg button').forEach(
      (b) =>
        (b.onclick = () => {
          document.querySelectorAll('#modeseg button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          syncPressed('#modeseg');
          state.mode = b.dataset.m;
          syncSearchTip();
          renderList();
          if (window.Permalink) Permalink.touch(); // mode is renderList-only (no drawMarkers)
        })
    );
    // pager chevrons (both modes)
    const eb = document.getElementById('ec-earlier');
    if (eb) eb.onclick = pageEarlier;
    const lb = document.getElementById('ec-later');
    if (lb) lb.onclick = pageLater;
    wireWheelAutoload();
    // search
    const q = document.getElementById('q');
    if (q)
      q.oninput = (e) => {
        state.q = e.target.value;
        renderList();
        drawTimeline();
        drawMarkers();
      };
    // timeline show/hide — the rail is permanent, only the lizhou collapses.
    // Toggling it resizes the inset map (via body:has(#timeline.hidden) #map),
    // so Leaflet must re-measure its container afterwards or tiles grey out.
    const toggleTimeline = (show) => {
      toggle('timeline', 'tltab', show);
      requestAnimationFrame(() => {
        if (map) map.invalidateSize();
      });
    };
    const tc = document.getElementById('tl-close');
    if (tc) tc.onclick = () => toggleTimeline(false);
    const tt = document.getElementById('tltab');
    if (tt) tt.onclick = () => toggleTimeline(true);
    // language: I18n owns the dropdown (ui.js). React to its changes. An open popup
    // holds locale-baked HTML, so reopen both the selected record marker AND the
    // observe card — the latter now branches CJK shichen vs Western hora, so a stale card
    // would show the wrong reckoning entirely, not just an untranslated word.
    if (typeof I18n !== 'undefined' && I18n.subscribe) {
      I18n.subscribe(() => {
        state.lang = I18n.getLocale();
        renderAll();
        updateEvStrip();
        if (state.sel && markerById[state.sel]) markerById[state.sel].openPopup();
        if (_obsMarker && _obsMarker.isPopupOpen()) showObservation(_obsMarker.getLatLng());
      });
    }
    // Grid layout: the map cell resizes with the window, so Leaflet must
    // re-measure too (the old absolute inset resized the map via CSS alone).
    window.addEventListener('resize', () => {
      drawTimeline();
      fitPlaceLabels();
      if (map) map.invalidateSize();
    });
    document.addEventListener(
      'pointerdown',
      (e) => {
        _touchTap = e.pointerType === 'touch';
      },
      true
    );
    // Popup markup is inserted only when the popup opens, so the place row cannot
    // be measured any earlier than this.
    if (map) map.on('popupopen', (ev) => fitPlaceLabels(ev.popup.getElement()));
    // Webfonts land after first paint and change every advance width on the page —
    // a fit measured against the fallback face is measured against the wrong font.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitPlaceLabels());
  }

  // ---- Boot ----
  async function init(mapInstance, ctl) {
    map = mapInstance;
    eclipseCtl = ctl;
    if (typeof I18n !== 'undefined' && I18n.getLocale) state.lang = I18n.getLocale();

    // Phase 1: load lookup tables + manifest + sources in parallel. GAZ must be populated
    // before _map() runs; SOURCES must be populated before _map() resolves source keys.
    // No cache override: these are content-addressed by the ?v= bump in index.html, and
    // forcing no-store here made every reload re-download the whole corpus.
    const [sitesJson, nianJson, nengoJson, civsJson, quyuJson, manifestJson, sourcesJson] = await Promise.all([
      fetch('data/duizhao/diming.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/duizhao/nianhao.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/duizhao/nengo.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/duizhao/wenming.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/duizhao/quyu.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/records/manifest.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/records/sources.json')
        .then((r) => r.json())
        .catch(() => null),
    ]);

    // Populate SOURCES lookup keyed by source slug (used by _map to resolve source.key).
    if (sourcesJson && sourcesJson.sources) {
      Object.entries(sourcesJson.sources).forEach(([k, v]) => {
        SOURCES[k] = v;
      });
    }
    GAZ = (sitesJson && sitesJson.places) || {};
    // Reuse the already-fetched sites map for the reverse-geocode popup (no 2nd fetch);
    // quyu.json holds the authored Voronoi anchors for the tier-2 yuezhi fallback.
    if (typeof PlaceName !== 'undefined') {
      PlaceName.load(GAZ, (quyuJson && quyuJson.anchors) || []);
    }
    // Inject 7-locale civ names from data/duizhao/wenming.json into Seal (single source
    // of truth) and keep the same table here for the civ-name search haystack. Both must
    // be set before any _map() runs — boot shard or deferred one.
    CIV_NAMES = (civsJson && civsJson.civs) || {};
    if (typeof Seal !== 'undefined') Seal.setNames(CIV_NAMES);
    NIANHAO = nianJson;
    NENGO = nengoJson;
    MANIFEST = manifestJson;

    // The civ chip row and the LOD rarity weight both describe the WHOLE corpus, not
    // the shards currently held — so both are read off the manifest, which names every
    // (phenomenon, civilization) pair and its count. They are therefore correct from
    // the first frame and never shift as deferred shards arrive.
    CIV_COUNT = {};
    ((MANIFEST && MANIFEST.files) || []).forEach((f) => {
      const c = (f.civilization || '').toLowerCase();
      if (f.count > 0) CIV_COUNT[c] = (CIV_COUNT[c] || 0) + f.count;
    });
    const seen = new Set(Object.keys(CIV_COUNT));
    PRESENT_CIVS = Object.keys(Seal.CIVS).filter((k) => seen.has(k));
    // include any civ present in data but missing from the table (fallback seal)
    seen.forEach((c) => {
      if (PRESENT_CIVS.indexOf(c) < 0) PRESENT_CIVS.push(c);
    });
    state.civ = null; // default: show all civilizations

    // Only the phenomenon on screen blocks first paint.
    await loadPhenomenon(state.type);

    markerLayer = L.layerGroup().addTo(map);
    // Central-band overlay: a low pane (z 350) so the washes read as shadows on
    // the map — above tiles (200), below record markers (600) and the selected
    // event's own richer curves (628/629). Its own layerGroup, refreshed from the
    // list render funnel (drawBands).
    map.createPane('atlas-bands');
    map.getPane('atlas-bands').style.zIndex = 350;
    bandLayer = L.layerGroup().addTo(map);
    // Viewport coupling: re-run the LOD selection when the view changes.
    // Debounced so a pan/zoom gesture rebuilds markers once, on settle.
    let _mvTimer;
    map.on('moveend zoomend', () => {
      clearTimeout(_mvTimer);
      _mvTimer = setTimeout(drawMarkers, 120);
    });
    // Forget the reopen-target when a popup closes for ANY reason other than our
    // own rebuild — a reader clicking the × or the observe popup superseding it —
    // so drawMarkers() won't resurrect a popup the reader (or another feature)
    // deliberately dismissed. The rebuild's own reopen happens synchronously
    // inside drawMarkers after this fires, reading a captured local, not this.
    map.on('popupclose', () => {
      _popupRecId = null;
    });
    // Background click: fold an open spiderfy; when an event is selected, also
    // open the local observation popup at the clicked point.
    map.on('click', (ev) => {
      unspiderfy();
      if (state.selEv) showObservation(ev.latlng);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') unspiderfy();
    });

    // Grid layout drives the map's pixel size (#map fills the col-1 #mapwrap cell
    // now, not a CSS inset), and Leaflet caches that size — so re-measure whenever
    // #mapwrap's box changes: mount, window resize, or the lizhou folding. One rAF-
    // coalesced observer covers all three (the reason grid was avoided before).
    const mapWrap = document.getElementById('mapwrap');
    if (mapWrap && 'ResizeObserver' in window) {
      let roPending = 0;
      new ResizeObserver(() => {
        if (roPending) return;
        roPending = requestAnimationFrame(() => {
          roPending = 0;
          if (map) map.invalidateSize();
        });
      }).observe(mapWrap);
    }

    // A ?date= deep-link selects an event via EclipseLoader before Atlas boots;
    // mirror it into state.selEv so the ambient overview stays hidden (single
    // "selected" flag — a normal boot lands in overview with selEv null).
    if (window.EclipseLoader && EclipseLoader.selected) {
      const sel = EclipseLoader.selected();
      if (sel) state.selEv = evKey(sel.date, sel._kind);
    }

    renderAll();
    wireChrome();
    wireTimelineGestures();
    // second layout pass after fonts/reflow settle; re-measure the inset map too
    window.addEventListener('load', () => {
      drawTimeline();
      if (map) map.invalidateSize();
    });
    // Boot race: EclipseLoader.init is not awaited in map-boot, so the first
    // selectEvent can beat the corpus — let the event panel re-render its
    // linked-records section now that RECS exist.
    if (window.Sidebar && Sidebar.refreshRecords) Sidebar.refreshRecords();

    // Everything else streams in behind the first paint, so switching register is
    // instant in practice while the opening view never waits on 10 MB of
    // occultation records it does not show. Deliberately after render + wiring:
    // the reader can already read and click during this.
    // EVERY phenomenon, with nothing excluded — do NOT filter out state.type here as
    // an optimisation. Boot loads the DEFAULT register, and Permalink.restore assigns
    // state.type from the URL only afterwards, so such a filter starves any
    // permalinked non-default register of its shards and its list stays empty
    // forever. loadPhenomenon is idempotent, so the filter buys nothing anyway.
    const rest = [...new Set(((MANIFEST && MANIFEST.files) || []).map((f) => f.phenomenon))];
    const sweep = () =>
      rest
        .reduce((chain, ph) => chain.then(() => loadPhenomenon(ph)), Promise.resolve())
        .then(() => {
          drawMarkers();
          // Re-render the list only when it has nothing in it. Records arriving behind a
          // reader who is already reading must not rebuild the list under them — that is
          // what wipes a drag-selection — but an empty list has nothing to disturb.
          if (document.querySelector('#list .list-empty')) renderList();
          if (window.Sidebar && Sidebar.refreshRecords) Sidebar.refreshRecords();
        });
    if (window.requestIdleCallback) requestIdleCallback(sweep, { timeout: 3000 });
    else setTimeout(sweep, 0);
  }

  // Reverse binding for the event panel: all records observing this event.
  // Forward binding (record → event) lives in select() via EclipseLoader.
  function recordsForEvent(dateStr, kind) {
    return RECS.filter((r) => r.date === dateStr && r.type === kind);
  }

  // Phenomena whose event_date is assigned from the computed eclipse catalogue. For those,
  // date+kind names ONE event that many observers can share, which is what makes the
  // reverse binding above meaningful. Every other phenomenon takes its date from the source
  // text, where it is only "the day this chronicle claims", and carries no identity.
  const CATALOGUE_KINDS = new Set(['solar', 'lunar']);

  // The group a record belongs to for cross-highlighting — the corpus's answer to "which
  // other records are THIS SAME phenomenon". Three tiers, most trustworthy first:
  //   k: an editor wrote event_key by hand after identifying the records as one phenomenon
  //   d: a catalogue-derived date, which is identity-bearing on its own
  //   r: nothing asserts a link, so the record is its own event
  // A non-catalogue record must NOT be grouped by date. Occultation dates are often
  // source-truncated to a bare year, so string equality sweeps dozens of unrelated
  // sightings into one "event"; and the multi-culture records that genuinely are one
  // event (SN 1006, SN 1054) are dated differently by each chronicle that saw them.
  // Date is too loose and too tight at once, which is why tier k exists.
  function linkKey(rec) {
    if (rec.ekey) return 'k:' + rec.ekey;
    if (CATALOGUE_KINDS.has(rec.type)) return 'd:' + rec.date + '|' + rec.type;
    return 'r:' + rec.id;
  }

  // Records the corpus can honestly call the same phenomenon as `rec`.
  function siblingRecords(rec) {
    const key = linkKey(rec);
    return RECS.filter((r) => linkKey(r) === key);
  }

  // The link group currently in focus. A selection made from the all-events rail sets only
  // state.selEv, and that rail is catalogue-only, so the 'd:' form reconstructs it exactly.
  function selectedLinkKey() {
    const rec = state.sel ? RECS.find((r) => r.id === state.sel) : null;
    if (rec) return linkKey(rec);
    return state.selEv ? 'd:' + state.selEv : null;
  }

  // selectEvent / refresh (= renderAll) exposed for Permalink restore: select a
  // bare event by date+kind, and re-render the whole library after state.* is set.
  // sciDate is exported for the observation popup's brow (js/observe-popup.js),
  // which must date its contact table the same way the shu'er dates the event —
  // BCE handling, GB/T 15834 digit spacing and the Julian conversion all live in
  // one place rather than being restated there. calGloss travels with it so a date
  // rendered outside this module still explains which calendar it is in.
  // observePoint / showObservation are the Permalink pair for the click-a-point card.
  return {
    init,
    select,
    ensureRecord,
    selectEvent,
    refresh: renderAll,
    state,
    recordsForEvent,
    yearLabel,
    placeLabel,
    stepEvent,
    clearEventSel,
    refreshEventDetail,
    sciDate: (dateStr, lang) => _sciDate(dateStr, lang || state.lang),
    calGloss: (dateStr) => _calGlossFor(dateStr),
    observePoint,
    showObservation: (lat, lng, opts) => showObservation(L.latLng(lat, lng), opts),
  };
})();
window.Atlas = Atlas;
