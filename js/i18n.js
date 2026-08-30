/** i18n.js — Centralized UI string translation system */
const I18n = (() => {
  const SUPPORTED = ['zh-Hans', 'zh-Hant', 'en', 'fr', 'es', 'it', 'ja'];
  // The locale whose dictionary backs any key the active one lacks, and the last
  // resort when nothing else resolves. English, not Chinese: a missing key must
  // never leak Han script into a French or Spanish reading. The seven locales are
  // peers — none of them is the substrate the others are patched from.
  const FALLBACK = 'en';
  let _locale = FALLBACK;
  let _dict = {};
  let _fallbackDict = {};
  let _subs = [];
  let _ready = false;

  // {param} substitution, shared by t() and gloss() so a glossary entry can carry
  // computed values (e.g. a contact's actual clock interval) the same way UI strings do.
  function _interp(str, params) {
    if (!params) return str;
    // Substitute through a CALLBACK, never a replacement string: $& / $` / $' inside a
    // VALUE would otherwise be read as a substitution pattern and splice the surrounding
    // text back in. Values here are data — record text, place names, citation fragments —
    // and glossAttr inlines the result straight into an HTML attribute. One pass over the
    // string also replaces the old per-key loop, which built a fresh RegExp per parameter.
    // A placeholder the caller did not supply is left standing, as it always was.
    return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
  }

  function t(key, params) {
    const str = _dict[key] ?? _fallbackDict[key];
    if (str == null) return key;
    return _interp(str, params);
  }

  // The English form of a key whatever the active locale is. For citing a work in a
  // language the reader's locale has no apparatus for: a Dutch newspaper read on a
  // Chinese page keeps a western citation rather than being fitted with 年月日 and 版,
  // which is what the Chinese history journals themselves prescribe for a
  // foreign-language source. English stands in as the western frame; a locale that has
  // its own western frame never calls this.
  function ten(key, params) {
    const str = _fallbackDict[key] ?? _dict[key];
    if (str == null) return key;
    return _interp(str, params);
  }

  // Glossary lookup: a single `glossary.<slug>` namespace holding short
  // encyclopedia-style term definitions, shared across panels and cards so
  // one concept (magnitude, RA, …) is defined once and reused everywhere.
  // Returns '' when the slug has no entry (so callers can no-op cleanly) —
  // note this differs from t(), which echoes the key. Optional params interpolate
  // like t()'s, so a gloss can splice in per-instance values.
  function gloss(slug, params) {
    const key = 'glossary.' + slug;
    const str = _dict[key] ?? _fallbackDict[key];
    return str == null ? '' : _interp(str, params);
  }

  // HTML attribute form of gloss(): returns ` data-gloss="…"` (escaped) for inlining
  // into a label/th/span open tag, or '' when the slug is unknown. The leading
  // space lets call sites write `'<span class="label"' + glossAttr('ra') + '>'`.
  // data-gloss (not native title=) so the hover renders glossary-tip.js's themed
  // card — the site's one tooltip mechanism, no bare-white native boxes.
  // `params` forwards to gloss()'s interpolation, so a card can name the instance
  // it was opened on (the calendar gloss splices in that date's stored form).
  function glossAttr(slug, params) {
    const str = gloss(slug, params);
    return str ? ' data-gloss="' + str.replace(/"/g, '&quot;') + '"' : '';
  }

  async function _loadDict(locale) {
    const url = 'data/i18n/' + locale + '/ui.json?v=1';
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('i18n load failed: ' + url);
    return resp.json();
  }

  async function init(locale) {
    _locale = SUPPORTED.includes(locale) ? locale : FALLBACK;
    try {
      // Both dictionaries in one round trip — the fallback is needed on the very
      // first render, so fetching it after the active one just delayed first paint.
      if (_locale === FALLBACK) {
        _dict = _fallbackDict = await _loadDict(FALLBACK);
      } else {
        [_dict, _fallbackDict] = await Promise.all([_loadDict(_locale), _loadDict(FALLBACK)]);
      }
    } catch (e) {
      console.warn('[i18n] init failed, using keys as fallback', e);
      _dict = {};
      _fallbackDict = {};
    }
    _ready = true;
  }

  async function setLocale(locale) {
    if (!SUPPORTED.includes(locale)) return;
    if (locale === _locale && _ready) return;
    _locale = locale;
    try {
      _dict = await _loadDict(_locale);
      if (_locale !== FALLBACK) {
        if (!Object.keys(_fallbackDict).length) {
          _fallbackDict = await _loadDict(FALLBACK);
        }
      } else {
        _fallbackDict = _dict;
      }
    } catch (e) {
      console.warn('[i18n] setLocale failed for', locale, e);
    }
    _stampLang();
    _subs.forEach((fn) => {
      try {
        fn(_locale);
      } catch (e) {
        console.error(e);
      }
    });
  }

  // Publish the active locale to the document. Stamp the FULL BCP-47 tag, script subtag
  // included: 'zh-Hans' and 'zh-Hant' are what let a browser pick the right Han glyph
  // variants, so collapsing either to a bare 'zh' costs Chinese the one distinction every
  // other locale keeps for free.
  function _stampLang() {
    document.documentElement.lang = _locale;
    document.body.dataset.lang = _locale;
  }

  function getLocale() {
    return _locale;
  }

  function isZh() {
    return _locale === 'zh-Hans' || _locale === 'zh-Hant';
  }

  function isZhOrJa() {
    return _locale === 'zh-Hans' || _locale === 'zh-Hant' || _locale === 'ja';
  }

  function subscribe(fn) {
    _subs.push(fn);
  }

  // The document's own name and blurb, in the reader's language. The per-language
  // shells under /en/ …/ja/ each stamp a <title> as they write the root document, but
  // that is a one-shot at load: a switch made inside the page would otherwise leave the
  // tab (and every og: card a reader shares from it) speaking whichever shell they
  // arrived through. Written here so the name follows the locale like every other string.
  //
  // og:title takes the prose form, which for a non-Latin locale is bilingual — the same
  // pairing the README's own heading uses. site.subtitle IS that Latin prose form, so a
  // locale whose title already equals it (en) prints one name, not the same name twice.
  function _stampDocumentName() {
    const title = t('site.title');
    const latin = t('site.subtitle');
    const tagline = t('site.tagline');
    document.title = title;
    const og = title === latin ? title : title + ' · ' + latin;
    const meta = (sel, v) => {
      const el = document.head && document.head.querySelector(sel);
      if (el && v) el.setAttribute('content', v);
    };
    meta('meta[property="og:title"]', og);
    meta('meta[property="og:description"]', tagline);
    meta('meta[name="description"]', tagline);
  }

  function applyDOM() {
    _stampLang();
    _stampDocumentName();
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    // data-i18n-href: an off-site URL whose path carries the locale, written from a
    // {lang} template in the markup. The template stays in the HTML so the destination
    // is readable next to the link's other attributes; only the substitution needs to
    // know which locale is live, and re-running it here keeps the href in step with a
    // language switch instead of stranding the reader on the tag they arrived with.
    document.querySelectorAll('[data-i18n-href]').forEach((el) => {
      el.setAttribute('href', el.dataset.i18nHref.replace('{lang}', _locale));
    });
    // data-i18n-tip → data-tip (glossary-tip.js's compact .is-label chip), NOT a
    // native title=. Keeps static control labels on the site's one tooltip path.
    document.querySelectorAll('[data-i18n-tip]').forEach((el) => {
      el.setAttribute('data-tip', t(el.dataset.i18nTip));
    });
  }

  // Map one BCP-47 tag onto a supported locale, or '' when nothing matches.
  // Chinese needs script resolution because the browser reports region, not script:
  // zh-TW/HK/MO are Traditional, everything else Han-Chinese is Simplified. A bare
  // 'zh' resolves to zh-Hans — the reading with by far the larger population, and the
  // one the corpus's own primary translations are authored in.
  function _resolveTag(tag) {
    const raw = String(tag || '').trim();
    if (!raw) return '';
    if (SUPPORTED.includes(raw)) return raw;
    const low = raw.toLowerCase();
    if (low === 'zh' || low.startsWith('zh-')) {
      if (low.includes('hant') || /-(tw|hk|mo)\b/.test(low)) return 'zh-Hant';
      return 'zh-Hans';
    }
    const base = low.split('-')[0];
    return SUPPORTED.find((l) => l.toLowerCase().split('-')[0] === base && !l.startsWith('zh')) || '';
  }

  // ---- Pick: the One Locale Ladder ----
  // t() resolves UI strings out of the loaded dictionaries; pick() resolves a DATA
  // block carrying its own renderings — a place name, a civ name, a record
  // translation, a source title. Both are keyed by BCP-47 tag.
  //
  // There is deliberately ONE ladder, and call sites must not hand-write their
  // own: separately written ladders drift into different fallback orders, and the
  // same entry then renders differently in the record card and the map popup.
  //
  // Han-script locales consult each other before English, because a reader of one
  // Han script gets more from a neighbouring Han rendering than from a romanized
  // or English one; ja leads with its own field because Japanese sometimes writes
  // a different kanji form than either Chinese script (Gyeongju: 金城, not 庆州).
  // Western locales stop at English — a French card must never fall through to
  // Han script unless the caller explicitly asks via opts.zh.
  const CHAIN = {
    'zh-Hans': ['zh-Hans', 'zh-Hant', 'en'],
    'zh-Hant': ['zh-Hant', 'zh-Hans', 'en'],
    ja: ['ja', 'zh-Hant', 'zh-Hans', 'en'],
    en: ['en'],
    fr: ['fr', 'en'],
    es: ['es', 'en'],
    it: ['it', 'en'],
  };

  // Appended for western locales only on opt-in. Showing the original Han text is
  // right for a record translation or a book title (better the source than a
  // blank), and wrong for an editorial note (which would then read as if the
  // editor wrote in Chinese to a French reader).
  const ZH_TAIL = ['zh-Hant', 'zh-Hans'];

  /**
   * Resolve one string out of a {locale: string} data block.
   * @param {Object} map    BCP-47-keyed block; may also carry a `rom` romanization.
   * @param {string} [lang] active locale; defaults to the live one.
   * @param {{rom?:boolean, zh?:boolean}} [opts]
   *        rom — fall through to the romanization before giving up.
   *        zh  — let western locales fall through to Han script as a last resort.
   * @returns {string} '' when the block offers nothing at all.
   */
  function pick(map, lang, opts) {
    if (!map) return '';
    const o = opts || {};
    for (const k of CHAIN[lang || _locale] || CHAIN.en) {
      if (map[k]) return map[k];
    }
    if (o.rom && map.rom) return map.rom;
    if (o.zh) {
      for (const k of ZH_TAIL) {
        if (map[k]) return map[k];
      }
    }
    return '';
  }

  /**
   * Resolve a secondary block only where it says something the primary does not.
   * @param {Object} map     the secondary block (a modern name, a later title).
   * @param {Object} headMap the primary block it would be shown beside.
   * @param {string} [lang]  active locale; defaults to the live one.
   * @param {{rom?:boolean, zh?:boolean}} [opts] passed through to pick.
   * @returns {string} '' when the two resolve to the same string.
   *
   * A locale carrying no secondary value of its own inherits one down the chain, so
   * a name that never changed IN THAT LOCALE comes back as its own restatement —
   * "Bogor (now Bogor)". The data cannot pre-empt this by omitting the key: omission
   * is what sends the ladder to the next locale, which for zh-Hans ends at en and
   * puts Latin script inside a Chinese label. The equality therefore has to be
   * tested after resolution, which is here, beside the ladder that causes it.
   */
  function pickDistinct(map, headMap, lang, opts) {
    const val = pick(map, lang, opts);
    return val && val !== pick(headMap, lang, opts) ? val : '';
  }

  function detectLocale() {
    // Language-in-path (highest priority): a per-language shell under /en/ …/ja/
    // serves this app at /<lang>/, and the permalink writer stamps that segment.
    // Read it first so a shared /<lang>/?… link cold-opens in that language.
    // Longest match first (zh-Hans before bare zh).
    const seg = location.pathname
      .replace(/\/index\.html$/, '')
      .match(/\/(zh-Hans|zh-Hant|zh-CN|zh|en|fr|es|it|ja)\/?$/);
    if (seg) {
      const pathLang = _resolveTag(seg[1]);
      if (pathLang) return pathLang;
    }

    // An explicit ?lang= beats the browser: it is what a shared link carries.
    const params = new URLSearchParams(location.search);
    const urlLang = _resolveTag(params.get('lang'));
    if (urlLang) return urlLang;

    // Otherwise negotiate against the reader's own browser preferences, in their
    // stated order. No locale is privileged as the cold-open default — a Japanese
    // browser opens in Japanese, an Italian one in Italian. FALLBACK closes the
    // list for readers whose languages this atlas does not yet speak.
    const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (const tag of prefs) {
      const hit = _resolveTag(tag);
      if (hit) return hit;
    }
    return FALLBACK;
  }

  return {
    t,
    ten,
    pick,
    pickDistinct,
    gloss,
    glossAttr,
    init,
    setLocale,
    getLocale,
    isZh,
    isZhOrJa,
    subscribe,
    detectLocale,
    applyDOM,
    SUPPORTED,
  };
})();
