/** i18n.js — Centralized UI string translation system */
const I18n = (() => {
  const SUPPORTED = ['zh-Hans', 'zh-Hant', 'en', 'fr', 'es', 'it', 'ja'];

  // The locale whose dictionary backs any key the active one lacks. English, not
  // Chinese: a missing key must never leak Han script into a French or Spanish
  // reading. The seven locales are peers, none the substrate the others patch from.
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
    // VALUE would otherwise be read as a substitution pattern. A placeholder the caller
    // did not supply is left standing.
    return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
  }

  function t(key, params) {
    const str = _dict[key] ?? _fallbackDict[key];
    if (str == null) return key;
    return _interp(str, params);
  }

  // The English form of a key whatever the active locale is: for citing a work in a
  // language the reader's locale has no citation apparatus for. A locale with its
  // own western citation frame never calls this.
  function ten(key, params) {
    const str = _fallbackDict[key] ?? _dict[key];
    if (str == null) return key;
    return _interp(str, params);
  }

  // A key in a named locale, or null when that locale's dictionary lacks it. Only the
  // active locale and English are loaded, so any other locale also answers null.
  function tIn(locale, key) {
    const dict = locale === _locale ? _dict : locale === FALLBACK ? _fallbackDict : null;
    return (dict && dict[key]) ?? null;
  }

  // Glossary lookup: a single `glossary.<slug>` namespace holding short term
  // definitions, shared across panels and cards. Returns '' when the slug has no
  // entry — unlike t(), which echoes the key back.
  function gloss(slug, params) {
    const key = 'glossary.' + slug;
    const str = _dict[key] ?? _fallbackDict[key];
    return str == null ? '' : _interp(str, params);
  }

  // HTML attribute form of gloss(): returns ` data-gloss="…"` (escaped) for inlining
  // into a label/th/span open tag, or '' when the slug is unknown. data-gloss, not
  // native title=, so the hover renders glossary-tip.js's themed card.
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
      // Both dictionaries in one round trip: the fallback is needed on the very first
      // render, so it cannot be fetched behind the active one.
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

  // Publish the active locale to the document. Stamp the FULL BCP-47 tag, script
  // subtag included: 'zh-Hans'/'zh-Hant' let a browser pick the right Han glyph
  // variant, a distinction a bare 'zh' would lose.
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

  // The document's own name and blurb, in the reader's language. Re-applied here
  // because the per-language shells under /en/ …/ja/ stamp a <title> only once, at
  // load. og:title pairs the localised name with site.subtitle (the Latin form).
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
    // {lang} template in the markup. Re-running the substitution here keeps the href
    // in step with a language switch instead of stranding the reader on the old tag.
    document.querySelectorAll('[data-i18n-href]').forEach((el) => {
      el.setAttribute('href', el.dataset.i18nHref.replace('{lang}', _locale));
    });

    // data-i18n-tip → data-tip (glossary-tip.js's compact .is-label chip), NOT a
    // native title=. Keeps static control labels on the site's one tooltip path.
    document.querySelectorAll('[data-i18n-tip]').forEach((el) => {
      el.setAttribute('data-tip', t(el.dataset.i18nTip));
    });
  }

  // Map one BCP-47 tag onto a supported locale, or '' when nothing matches. Chinese
  // needs script resolution because the browser reports region, not script: zh-TW/HK/MO
  // are Traditional, everything else Han-Chinese Simplified; bare 'zh' resolves to zh-Hans.
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
  // pick() resolves a DATA block (a place name, a civ name, a source title) keyed by
  // BCP-47 tag. ONE ladder — call sites must not hand-write their own.
  const CHAIN = {
    'zh-Hans': ['zh-Hans', 'zh-Hant', 'en'],
    'zh-Hant': ['zh-Hant', 'zh-Hans', 'en'],
    ja: ['ja', 'zh-Hant', 'zh-Hans', 'en'],
    en: ['en'],
    fr: ['fr', 'en'],
    es: ['es', 'en'],
    it: ['it', 'en'],
  };

  // Han-script locales consult each other before English; ja leads with its own
  // field, since Japanese sometimes writes a different kanji form than either
  // Chinese script. Western locales stop at English unless the caller sets opts.zh.

  // Appended for western locales only on opt-in: right for a record translation or
  // a book title (better the source than a blank), wrong for an editorial note.
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
   * A locale with no secondary value inherits one down the chain, so a name unchanged
   * IN THAT LOCALE can come back as its own restatement; tested here, after resolution.
   */
  function pickDistinct(map, headMap, lang, opts) {
    const val = pick(map, lang, opts);
    return val && val !== pick(headMap, lang, opts) ? val : '';
  }

  function detectLocale() {
    // Language-in-path (highest priority): a per-language shell under /en/ …/ja/ serves
    // this app at /<lang>/, and the permalink writer stamps that segment. Longest
    // match first (zh-Hans before bare zh).
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
    // stated order. No locale is privileged as the cold-open default; FALLBACK
    // closes the list for readers whose languages this atlas does not yet speak.
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
    tIn,
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
