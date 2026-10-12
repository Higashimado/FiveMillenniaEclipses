/**
 * atlas.js — the light-atlas front-end.
 *
 * Owns: record markers (seal divIcons), the floating library, the fisheye
 * lizhou (era ribbon + draggable filter window), and the time-scrub that
 * moves TimeState. One shared `state` drives map, library and timeline.
 *
 * Reuses: the map (window.appMap), EclipseCtl (contact curves), EclipseLoader
 * (event index), TimeState, I18n, and Seal (js/seal.js) for civ identity.
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

  // ---- Dynamic LOD ----

  // The kept set is a function of (filters, time range, zoom) alone, never the viewport: a
  // pan must not thin one region because another came into frame. CELL is a fixed pixel grid
  // at every zoom, so a cell's members at z stay a subset of its members at z+1 as LOD_K grows.
  const CELL = 32; // world-pixel grid; 22px seal + badge needs a ≥32px gap
  const LOD_K = (z) => (z <= 4 ? 1 : z <= 6 ? 2 : z <= 8 ? 3 : 5); // sites kept per cell

  // Two-box hysteresis: build a marker within VIEW_MARGIN of the view, destroy it only past
  // EVICT_MARGIN, so a pan that crosses the admit edge and back reuses the DOM. Fractions of
  // the view's own width/height, per side.
  const VIEW_MARGIN = 0.6;
  const EVICT_MARGIN = 1.2;

  // A seal fades out over this long before its marker is removed; the same duration
  // is set on .rec-mk in css/app.css and the two must stay in step.
  const FADE_MS = 200;

  // Importance weights. `significance` is sparse, so derive a composite that also
  // protects rare civs (geographic diversity) and rewards multi-vantage events (yishi-duozheng,
  // one event witnessed from several places), the project's core value.
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

  // Stack depth as a coarse tier, feeding the LOD ranking only: it decides whether a place
  // is drawn, never how many other places are. Capped below SIG_W.landmark.
  const depthW = (n) => Math.min(Math.floor(Math.log2(Math.max(1, n))) * 80, 320);

  // ---- Locale-Scoped Era Ribbons ----

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

  // ---- Highlight The Phenomenon Phrase ----

  // A mark covers the term only, never a leading article ("the eclipse" lights from "eclipse").
  // Patterns spell word characters \p{L}, never \w, which is ASCII-only and misses "éclipse".
  // A hedged kind ("an almost total eclipse") keeps its adjective dark; only the noun lights.
  const LATIN_HEDGE =
    '(?<!(?:almost|nearly|near|virtually|practically|presque|pratiquement|quasi|casi|' +
    'prácticamente|praticamente|bijna|nahezu|fast)[\\s-])';
  const KIND_BEFORE =
    '(?:' +
    LATIN_HEDGE +
    '(?:total(?:e[ns]?)?|partial|partiell\\p{L}*|partiële|annular|central|ringförmig\\p{L}*|' +
    'gedeeltelijke|ringvormige|volledige)\\s+)?';
  const KIND_AFTER =
    '(?:\\s+(?:total(?:e[ns]?|i)?|partiel\\p{L}*|parzial\\p{L}*|parcial\\p{L}*|annulaires?|' +
    'anular\\p{L}*|annular|central\\p{L}*))?(?!\\p{L})';

  // English sets the body as an adjective between the kind and the noun ("total solar
  // eclipse"), so the body word joins the term there, or the mark stops at "eclipse".
  const LATIN_ECLIPSE = [
    KIND_BEFORE +
      '(?:(?:solar|lunar)\\s+)?' +
      '(?:(?:zons?|maans?)?[eé]cc?l[iy]ps\\p{L}*|ekl[iy]ps\\p{L}*|ecc?liss\\p{L}*|' +
      'obscurat\\p{L}*|deliqui\\p{L}*)' +
      KIND_AFTER +
      '(?:(?:\\s+(?:de|del|della|di|du|des|of|la|le|el|il|the)){0,2}\\s*' +
      '(?:sol\\p{L}*|lun\\p{L}*|soleil|lune|moon|sun)' +
      KIND_AFTER +
      // A coordinated second body ("eclipse of the sun or moon") belongs to the same term.
      '(?:\\s+(?:or|and|ou|et|o|y|e|od)(?:\\s+(?:de|del|della|di|du|des|la|le|el|il|the))?\\s+' +
      '(?:sol\\p{L}*|lun\\p{L}*|soleil|lune|moon|sun)(?!\\p{L}))?' +
      ')?',
    // Dutch and German close the body into one compound (zonsverduistering, Sonnenfinsternis),
    // so the whole word is the term. The Dutch vowel run is loose on purpose: period type
    // sets "verduustering" and "verduietering" often enough to matter.
    KIND_BEFORE + '\\p{L}*verdu[ius]{1,2}e?ter\\p{L}*',
    KIND_BEFORE + '(?:\\p{L}*finsterni(?:ss|ß|s)\\p{L}*|verfinster\\p{L}*)',
    // Totality in every tongue the corpus reports it in. "grootste" alone is an ordinary
    // adjective and lights only with the phase noun it qualifies.
    LATIN_HEDGE + '(?:totalit\\p{L}*|totalidad\\p{L}*)',
    'grootste\\s+(?:phase|fase)',
  ];

  const DATE_RI = '(?<![0-9０-９〇零一二三四五六七八九十廿卅]\\s*)';

  const ECLIPSE_WORDS = [
    // The term stops at the verb: in 日有食之、既 (there was an eclipse of it; 既 opens a new
    // clause) neither the object pronoun 之 nor the clause marker 既 belongs to the mark.
    // DATE_RI keeps a day-number's own 日 from opening the eclipse word that follows it.
    DATE_RI + '日月[食蝕蚀]|[日月][有亦]?[食蝕蚀]',
    'nisshoku|il-sik|nhật thực|yuè shí|rì yǒu shí|hi ni shoku',
    'khusif\\p{L}*|ἐξελείφθη|νὺξ ἐγένετο|ἔκλειψ\\p{L}*|ἐκλείψ\\p{L}*',
    // Arabic kasafa / khasafa with whatever vowel points the transcription carries.
    '[\\p{L}\\p{M}]*[كخ]\\p{M}*س\\p{M}*و?\\p{M}*ف[\\p{L}\\p{M}]*',
    ...LATIN_ECLIPSE,
    'attal\\p{L}*|AN\\.MI|dies\\s+quasi\\s+nox',
    // Latin chronicles: Solis facta defectio (an eclipse of the Sun took place), sol et luna
    // defecerunt (Sun and Moon failed), luna fuscatur (the Moon is darkened).
    '(?<!\\p{L})(?:defecti\\p{L}*|defec(?:it|erunt)|defici\\p{L}*|fuscat\\p{L}*)',
  ];

  // Bare 蝕/蚀 (eclipse-graph variants) lights only on a line whose phenomenon is already an
  // eclipse; elsewhere the graph can belong to an unrelated formula. Order the two-graph term
  // ahead of it in the alternation, and let CJK_HEDGE_WORDS reach past one character for a hedge.
  const CJK_HEDGE_WORDS =
    '(?:近乎|[几幾]近|[几幾]乎|接近|[将將]近|近[于於]|[几幾][与與]|ほぼ|ほとんど|' + '非|不是|不若|不像|未[达達])';

  // 不知有日食者 (those unaware there was an eclipse) speaks of people, not of the eclipse
  // seen, so the clause 有日食者 stays dark.
  const CJK_HEDGE = '(?<!' + CJK_HEDGE_WORDS + '[日月]?)(?<!有(?=[日月][食蚀蝕]者))';
  const CJK_HEDGE_AFTER = '(?![日月]?[食蚀蝕]?に近[いかく])';
  const ECLIPSE_BARE = ['薄[食蝕蚀]', '(?<!' + CJK_HEDGE_WORDS + '[日月]?(?:皆既|金[環环]|[全偏环環])[日月]?)[蝕蚀]'];

  // Transients: the nouns name the object, the verbs name the approach. 守/入/合/會 (ordinary
  // prose otherwise) light only when the line's phenomenon is an approach; never widen this
  // group to eclipse lines, where those characters are not what the entry records.
  const TRANSIENT_NOUNS =
    '客星|彗星|孛星|星孛|彗孛|妖星|[長长]星|流星|(?<!\\p{L})(?:stella\\s+)?com[eè]t\\p{L}*(?:\\s+sidus)?';

  // Star and body names as regex alternations, filled by setStarNames; until then the gated
  // verbs match nothing. `pre` drops one-character asterisms such as 人 (Man), too common a
  // word to vouch for the verb after it.
  const STAR = { cjk: '(?!)', pre: '(?!)', latin: '(?!)' };

  // 入 (enter) and 合 (join) light only next to a star or body, as in 太白入房 (Venus entered
  // Fang). 會稽山 (Mount Kuaiji) stays dark, and so does 兵入 (troops enter) of an omen; 曰入
  // (says entered) quotes the verb and lights.
  const _cjkVerbs = () => [
    '[犯掩守]',
    // 月食熒惑 (the Moon ate Mars) records an occultation: only 食 (eat) is the verb.
    '(?<=[日月])[食蝕蚀](?=' + STAR.cjk + ')',
    '(?<![兵出])(?<=' + STAR.pre + ')[入聚合會会]',
    '(?<![兵出])[入聚合會会](?=[于於]?(?:' + STAR.cjk + '))',
    '(?<=[曰云謂谓])入',
    // A Latin-script source names the conjunction or occultation by its noun.
    '(?<!\\p{L})(?:conjonctions?|conjunctions?|coniunct\\p{L}*|occult\\p{L}*)(?!\\p{L})',
  ];

  // The CJK kinds and contacts of an eclipse — e.g. 食甚 (greatest eclipse) — as newspapers
  // and translations name them. Every 食 slot also takes 蝕/蚀 (variant graphs); a kind compound
  // precedes the bare contacts so each lights whole. XIANG skips 相 (aspect) as in 食相并 (joined).
  const XIANG = '相(?![同似当當反近符并並])';
  const CJK_CONTACT = [
    CJK_HEDGE + '(?:皆既|金[環环]|部分|半影|[全偏环環])[日月]?[食蚀蝕](?:' + XIANG + '|期|[帯帶带])?' + CJK_HEDGE_AFTER,
    CJK_HEDGE + '(?:' + DATE_RI + '日月|[日月](?:[全偏环環]|[有亦]|[当當])?)[食蚀蝕]' + CJK_HEDGE_AFTER,
    CJK_HEDGE + '皆既' + CJK_HEDGE_AFTER,
    '[食蚀蝕](?:[甚既]|' + XIANG + ')|初[亏虧食蚀蝕]|[复復][圆圓円]|(?<![生新而])生光(?!芒)',
  ];

  // ---- Highlight The Matching Term In A Translation ----

  // The classical forms above (bare 蝕 (eclipse graph), bare approach verbs) would light
  // ordinary words in a translation, which is modern prose, so this vocabulary is its own.
  const TRANS_ECLIPSE_WORDS = [...CJK_CONTACT, ...LATIN_ECLIPSE];

  // Bare 守 (keep station) lights only right after the star that keeps it. Bare 犯 (trespass)
  // stays lit: modern prose has no neutral reading of it on a transient line.
  const TRANS_OCCULT_WORDS = [
    '[掩凌侵冲衝干]犯|犯|逼近|留守|(?<=星)守|掩食|掩[蔽入没过過]|接近|侵犯|掩蔽|掩[っいう]|留ま(?:っ[たて]|り|る)',
    '(?<!\\p{L})(?:approach\\p{L}*|occult\\p{L}*|kept\\s+station|invaded|trespass\\p{L}*|linger\\p{L}*)(?!\\p{L})',
    '(?<!\\p{L})(?:approch\\p{L}*|rest(?:ée?s?|a)|occult\\p{L}*|envahi\\p{L}*|empiét\\p{L}*)(?!\\p{L})',
    '(?<!\\p{L})(?:acerc\\p{L}*|permaneci\\p{L}*|ocult\\p{L}*|invadi\\p{L}*)(?!\\p{L})',
    '(?<!\\p{L})(?:avvicin\\p{L}*|rimast[aoie]|occult\\p{L}*|invas[aoie])(?!\\p{L})',
  ];

  // The entering and gathering verbs light only next to a star or body name, as "entered
  // Fang" does; an omen's troops entering stay dark, and a verb quoted as a word lights, as
  // 'said "entered"' does.
  const _latinVerb = (verb) =>
    '(?<!\\p{L})(?:' +
    verb +
    ")(?=(?:(?:\\s+|(?<='))(?:into|in|at|with|the|dans|en|avec|la|le|les|l|el|los|las|con|nella|nel|nello|negli|nelle|il|lo|gli|a|à|al|alla|de|di|du|des|del|della|all|both|tous|toutes|ensemble|todos|todas|juntos|tutti|tutte|insieme|space|area|between|great|star|stars|determinative|of|espace|entre|grande?|mayor|maggiore|enclosure|enceinte|recinto|étoile|espacio|estrella|spazio|tra|fra|stella)(?!\\p{L})'?){0,5}\\s*(?:" +
    STAR.latin +
    ')(?!\\p{L}))|(?<=[«“"]\\s?)(?:' +
    verb +
    ')(?=\\s?[»”"])';

  const _gatherWords = () => [
    '(?<!兵[将將马馬]?)(?:[移进進行皆]入|[合聚会會][于於])(?=' + STAR.cjk + ')',
    '(?<=[说說説曰]「?)移入',
    '(?<=' + STAR.pre + ')(?:[会會]合|俱[会會])',
    '(?<!兵[がは][^、。]{0,8})(?<=(?:' + STAR.cjk + ')(?:の間)?[にへ])入(?:っ[たて]|り|る)',
    '入る(?=と)',
    '(?<=(?:' + STAR.cjk + ')[でにと])会合',
    // The conjunction itself lights wherever it is named: 相合 (conjoin) and 会合 (meet), the
    // Japanese 合 (conjunction) as noun or verb stem, and the noun in the Latin-script locales.
    '相合|[会會]合',
    '(?<=[のでが])合(?=[。、とにでがは])',
    '(?<![りいし])合(?=にな|とな|すれ|した)',
    '(?<!\\p{L})(?:conjunctions?|conjonctions?|conjunci(?:ón|ones)|congiunzion[ei])(?!\\p{L})',
    _latinVerb('enter(?:ed|s|ing)?|massed'),
    _latinVerb('entr(?:ée?s?|a|èrent)|mass(?:ée?s?|èrent)|rassembl\\p{L}*'),
    _latinVerb('entr(?:ó|aron|ado)|agrup\\p{L}*|congreg\\p{L}*'),
    _latinVerb('entr(?:at[aoie]|ò|arono)|raggrupp\\p{L}*|radun\\p{L}*'),
  ];

  const TRANS_TRANSIENT_NOUNS = [
    '彗星|客星|孛星|星孛|彗孛|妖星|[長长]星|流星|箒星',
    'com[eè]t\\p{L}*|cometa\\p{L}*|broom[- ]?stars?|guest\\s+stars?',
    'étoiles?\\s+invitées?|estrellas?\\s+(?:huésped|invitadas?)|stell[ae]\\s+ospit[ei]',
  ];

  // The transient expressions name stars, so they are built again once the names arrive.
  const _phraseRe = (parts) => new RegExp(parts.join('|'), 'giu');
  const ECLIPSE_ONLY_RE = new RegExp('^(?:' + ECLIPSE_WORDS.concat(CJK_CONTACT).join('|') + ')$', 'iu');
  const ECLIPSE_RE = _phraseRe(ECLIPSE_WORDS.concat(CJK_CONTACT, ECLIPSE_BARE));
  const TRANS_ECLIPSE_RE = _phraseRe(TRANS_ECLIPSE_WORDS);
  let TRANSIENT_RE, TRANS_APPROACH_RE, TRANS_TRANSIENT_RE;
  const _buildTransientRe = () => {
    const approach = [...TRANS_OCCULT_WORDS, ..._gatherWords()];

    // An eclipse word followed by a star name yields to the verb 食 (eat) above.
    const eclipse = '(?![日月][有亦]?[食蝕蚀](?:' + STAR.cjk + '))(?:' + ECLIPSE_WORDS.join('|') + ')';
    TRANSIENT_RE = _phraseRe([eclipse, TRANSIENT_NOUNS, ..._cjkVerbs()]);
    TRANS_APPROACH_RE = _phraseRe(TRANS_ECLIPSE_WORDS.concat(approach));
    TRANS_TRANSIENT_RE = _phraseRe(TRANS_ECLIPSE_WORDS.concat(TRANS_TRANSIENT_NOUNS, approach));
  };
  _buildTransientRe();

  // Longest first, so a name wins over any shorter name it begins with.
  const _alt = (names) =>
    [...new Set(names.filter(Boolean))]
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|') || '(?!)';

  function setStarNames(xingguanJson, bodiesJson) {
    const cjk = [];
    const pre = [];
    const latin = [];
    const isCjk = (n) => /[㐀-鿿]/.test(n);
    Object.entries((xingguanJson && xingguanJson.xingguan) || {}).forEach(([key, e]) => {
      [key, e.hant, e.ja, ...(e.alias || [])]
        .filter((n) => n && isCjk(n))
        .forEach((n) => {
          cjk.push(n);
          if (n.length > 1) pre.push(n);
        });
      if (e.rom) latin.push(e.rom);
      const proper = e.modern && e.modern.proper;
      if (proper) latin.push(...Object.values(proper).filter((n) => !isCjk(n)));
    });
    Object.values((bodiesJson && bodiesJson.bodies) || {}).forEach((b) => {
      (b.alias || []).forEach((n) => pre.push(n) && cjk.push(n));
      if (b.token === 'planet') return;
      Object.entries(b).forEach(([k, n]) => {
        if (k === 'token' || k === 'kind' || k === 'alias' || !n) return;
        if (isCjk(n)) cjk.push(n) && pre.push(n);
        else latin.push(n.replace(/^(?:the|la|le|il)\s+/i, ''));
      });
    });
    STAR.cjk = _alt(cjk);
    STAR.pre = _alt(pre);
    STAR.latin = _alt(latin);
    _buildTransientRe();
    Object.entries((xingguanJson && xingguanJson.xingguan) || {}).forEach(([key, e]) => {
      STAR_REF[key] = [key, e];
      if (e.modern && e.modern.hip) STAR_REF[e.modern.hip] = [key, e];
    });
  }

  // [key, xingguan entry] by key and by HIP number, for a separation's star reference.
  const STAR_REF = {};

  // CJK reads the entry's own name; Western reads a star's Bayer designation, else the entry's
  // catalogue designation (M44), else its romanization (Bi), keeping the event list short.
  function starName(ref, lang) {
    if (!STAR_REF[ref]) return '';
    const [key, e] = STAR_REF[ref];
    if (/^(zh|ja)/.test(lang)) {
      const name = lang === 'ja' ? e.ja : lang === 'zh-Hant' ? e.hant : key;
      return (name || key).replace(/\(.*\)$/, '');
    }

    // A HIP ref names one star (Bayer letter); a key names the asterism (romanization),
    // so 积尸 (Corpse Qi) reads Jishi, never its catalogue number M44.
    const m = e.modern || {};
    return typeof ref === 'number' ? m.bayer || m.designation || e.rom || '' : e.rom || m.bayer || m.designation || '';
  }

  const _esc = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  // Inline ' data-gloss="…"' for a glossary slug (empty when unknown / I18n absent),
  // feeding the shared glossary-tip.js hover card — same contract as I18n.glossAttr.
  const _gloss = (slug, params) => (typeof I18n !== 'undefined' && I18n.glossAttr ? I18n.glossAttr(slug, params) : '');

  // The same lookup as _gloss but returning the sentence rather than the attribute, for
  // the one case that composes two glosses into a third before inlining it.
  const _glossText = (slug, params) => (typeof I18n !== 'undefined' && I18n.gloss ? I18n.gloss(slug, params) : '');

  // Escape first, wrap second: the marks are the only markup this string is allowed to carry.
  // A phenomenon this does not know takes the transient vocabulary, which is the wider of the
  // two — an unmarked phrase is a worse failure than one extra mark on a line nobody typed.
  const _isEclipse = (type) => type === 'solar' || type === 'lunar';
  const _mark = (m) => '<mark class="hl">' + m + '</mark>';

  // An eclipse line lights only its own body's term; the other body's term stays dark. A term
  // naming both bodies ("eclipse of the sun or moon") or neither (kasafa) lights on either line.
  // Transient lines are exempt: 月食昴 (the moon eclipsing the Pleiades) is the approach recorded.
  const SUN_BODY = /日|nisshoku|nhật|rì|il-sik|sol|zon|sun|sonne/iu;
  const MOON_BODY = /月|yuè|lun|moon|maan|mond/iu;
  const _otherBodyOnly = (m, type) =>
    type === 'solar' ? MOON_BODY.test(m) && !SUN_BODY.test(m) : SUN_BODY.test(m) && !MOON_BODY.test(m);

  // A lit approach verb carries its glossary entry, matched on the verb's root in each
  // script. Order matters: 掩犯 (occulted) defines as 掩, 移入 (moved into) as 入.
  const VERB_GLOSS = [
    ['verb_occult', /掩|^[食蝕蚀]$|occult|ocult/iu],
    ['verb_keep', /守|留|station|linger|rest[ée]|resta|permaneci|rimast/iu],
    ['verb_enter', /入|enter|entr[éeaóò]/iu],
    ['verb_gather', /聚|mass|rassembl|agrup|congreg|raggrupp|radun/iu],
    ['verb_conjunction', /[合会會]|conjunc|conjonc|congiun/iu],
    ['verb_appulse', /犯|凌|侵|[冲衝干]|近|approach|approch|acerc|avvicin|invad|invas|envahi|empiét|trespass/iu],
  ];
  const _verbMark = (m) => {
    const hit = VERB_GLOSS.find(([, re]) => re.test(m));
    return hit ? '<mark class="hl"' + _gloss(hit[0]) + '>' + m + '</mark>' : _mark(m);
  };

  const _markFor = (type) => (m) =>
    _isEclipse(type) ? (_otherBodyOnly(m, type) ? m : _mark(m)) : ECLIPSE_ONLY_RE.test(m) ? _mark(m) : _verbMark(m);

  const highlightPhrase = (s, type) => _esc(s).replace(_isEclipse(type) ? ECLIPSE_RE : TRANSIENT_RE, _markFor(type));
  const highlightTrans = (s, type) =>
    _esc(s).replace(
      _isEclipse(type)
        ? TRANS_ECLIPSE_RE
        : type === 'appulse' || type === 'conjunction'
          ? TRANS_APPROACH_RE
          : TRANS_TRANSIENT_RE,
      _markFor(type)
    );

  // An era name in the text carries the era's sentence as a hover card (Notes.calendarNames).
  const eraNames = (html, textLang, lang, skip) =>
    typeof Notes !== 'undefined' ? Notes.calendarNames(html, textLang, lang, _noteKey(lang), skip) : html;
  const _hasCJK = (s) => /[㐀-鿿぀-ヿ가-힣]/.test(String(s || ''));

  // A pipe-parted line is a table row. One pipe is enough — a two-column register (a time
  // against what happened at it) has only one gutter — and the run test below, not the pipe
  // count, is what keeps an ordinary sentence out.
  const _isRow = (s) => (s.match(/[|\uff5c]/g) || []).length >= 1;
  const _cells = (s) => s.split(/\s*[|\uff5c]\s*/).map((c) => c.trim());

  // A numeral in any script the corpus sets tables in; Latin digits alone would read a
  // Chinese register's numeral-only first row as a heading.
  const _DIGITS = /[0-9\uff10-\uff19〇一二三四五六七八九十百千两]/;

  // Han numerals also stand as words in a heading (Kepler's 'two centres', 'one direction'),
  // so a table whose readings use Arabic figures takes its first row as heads whenever that
  // row has none.
  const _ARABIC = /[0-9\uff10-\uff19]/;
  const _isHead = (rows) =>
    rows.length > 1 && _ARABIC.test(rows.slice(1).flat().join(''))
      ? !_ARABIC.test(rows[0].join(''))
      : !_DIGITS.test(rows[0].join(''));

  // Wrapping is a property of the column, not the cell, decided from the column's longest
  // cell: a per-cell numeral or punctuation test cannot tell a reading from a running clause,
  // but the two kinds separate cleanly down a whole column.
  const _PROSE_COLUMN = 40;

  // A short cell still reads as a clause once it parts at a comma or runs past three words
  // (ultra 2 aestimando non mensurando).
  const _CLAUSE = /[，；]|[,;] \S|\S+ \S+ \S+ \S+/u;
  const _proseColumns = (rows) => {
    const width = Math.max(...rows.map((r) => r.length));
    return Array.from(
      { length: width },
      (_, i) =>
        Math.max(0, ...rows.map((r) => (r[i] || '').length)) > _PROSE_COLUMN ||
        rows.some((r) => _CLAUSE.test(r[i] || ''))
    );
  };

  // Renders a run of pipe rows as a real table. The run's first row is column heads when it
  // carries no numeral at all: heads are words, readings are numbers.
  const tableHtml = (rows, render) => {
    const head = _isHead(rows) ? rows.shift() : null;
    const prose = _proseColumns(head ? [head, ...rows] : rows);
    const tr = (cs, tag) =>
      '<tr>' +
      cs
        .map((c, i) => '<' + tag + (prose[i] ? ' class="rec-tab-prose"' : '') + '>' + render(c) + '</' + tag + '>')
        .join('') +
      '</tr>';
    return (
      '<div class="rec-tabwrap"><table class="rec-tab">' +
      (head ? '<thead>' + tr(head, 'th') + '</thead>' : '') +
      '<tbody>' +
      rows.map((r) => tr(r, 'td')).join('') +
      '</tbody>' +
      '</table></div>'
    );
  };

  // ---- Mid-Article Headings ----

  // Nothing in the text marks a heading, so shape decides: short, closing on no sentence
  // punctuation (a trailing quote is fine), no internal comma/colon/pipe, and followed by a
  // line at least twice its length or itself a head — else a couplet's first line reads as one.

  // The source line at the same index must pass the same tests too; when the two do not part
  // into the same number of lines, nothing corroborates and no heading is marked, since a
  // wrongly marked head is a lie about the source.
  const _MID_CLOSE = /[.!?:;,。！？：；，、…)）\]】"'—]$/;
  const _MID_QUOTE_TAIL = /[»”」』]$/;
  const _MID_INNER = /[,，:：…｜|]|\[…\]/;
  const _MID_WORD = /[A-Za-zÀ-ÿͰ-῿㐀-鿿]/;
  const _MID_CJK = /[㐀-鿿぀-ヿ]/;

  const _midShape = (s) => {
    if (!s || s.length > (_MID_CJK.test(s) ? 20 : 45)) return false;
    if (_MID_INNER.test(s) || !_MID_WORD.test(s)) return false;
    return !_MID_CLOSE.test(s.replace(_MID_QUOTE_TAIL, '').trim());
  };

  const _isMidHeading = (seq, i) => {
    // Line 0 counts too: a report split off at a run-in crosshead opens on it.
    if (i + 1 >= seq.length) return false;
    if (!_midShape(seq[i])) return false;
    return _midShape(seq[i + 1]) || seq[i + 1].length >= 2 * seq[i].length;
  };

  // A crosshead set in capitals is a head whatever it closes on ("ASTRONOMERS IN ALBANY.",
  // "IN HUDSON AND SYRACUSE,"): the capitals mark it on the page. Two words of two letters
  // keep out a column header ("H. M. SEC.") and an initialled signature ("A. A. NIJLAND.").
  const _capsHead = (seq, i) => {
    const s = seq[i];
    if (i + 1 >= seq.length || s.length > 45 || s.includes('|') || /\p{Ll}/u.test(s)) return false;
    return (s.match(/\p{L}{2,}/gu) || []).length >= 2 && seq[i + 1].length >= 2 * s.length;
  };
  const _shortLine = (s) => s.length <= (_MID_CJK.test(s) ? 20 : 45) && !s.includes('|');

  // ---- Line-Start And Line-End Guard ----

  // A closing mark may not begin a line and an opening mark may not end one. The browser
  // already refuses to break before 》 or 」, but not at an ordinary space, so a space typed in
  // front of a closing mark (French sets one by convention: « mot ») lets the mark start a line.

  // The fix keeps the space but takes away its breakability: U+00A0 reads identically and
  // cannot be broken at. Written with escapes below, since a no-break space is invisible in source.
  const NBSP = '\u00a0';
  const _NO_LINE_START =
    /[\u0020\u3000]+([\u00bb\u201d\u2019\uff09\u3011\u3009\u300b\u300d\u300f\u3015\uff5d\u3001\u3002\uff0c\uff1b\uff1a\uff1f\uff01?!;:\u00b7])/g;
  const _NO_LINE_END = /([\u00ab\u201c\u2018\uff08\u3010\u3008\u300a\u300c\u300e\u3014\uff5b])[\u0020\u3000]+/g;
  const hardenBreaks = (s) => s.replace(_NO_LINE_START, NBSP + '$1').replace(_NO_LINE_END, '$1' + NBSP);

  // ---- Paragraphs, Tables And Heads Of One Record's Text ----

  // Splits the source's own paragraph breaks into separate blocks (left in one text node the
  // browser folds a break into a space) before rendering, never after: the phrase highlighter
  // emits markup, and splitting markup on a newline can cut a tag in half.
  function paraHtml(text, renderLine, orig) {
    // Runs the line-start guard here, once, rather than at each of the three call sites below,
    // and before the renderer: the renderer emits markup, which the guard would misread.
    const render = (s) => fnLinks(renderLine(hardenBreaks(s)));
    const split = (s) =>
      String(s || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
    const lines = markFootnotes(split(text));
    const src = split(orig);
    const heads =
      src.length === lines.length
        ? lines.map(
            (_, i) => (_isMidHeading(lines, i) && _isMidHeading(src, i)) || (_capsHead(src, i) && _shortLine(lines[i]))
          )
        : lines.map(() => false);
    const out = [];
    let run = [];

    // Two rows make a table, and so does one row that parts into three or more cells: a strip
    // of contact times printed under a photograph is a single row and is still tabular. What
    // this refuses is the lone line holding one pipe, which is a sentence.
    const flush = () => {
      const tabular = run.length >= 2 || (run.length === 1 && _cells(run[0].s).length >= 3);
      if (tabular)
        out.push(
          tableHtml(
            run.map((r) => _cells(r.s)),
            render
          )
        );
      else run.forEach((r) => out.push('<p>' + render(r.s) + '</p>'));
      run = [];
    };
    const notes = [];
    lines.forEach((line, i) => {
      const fn = _fnKey(line, i);
      if (fn) {
        notes.push('<p data-fn="' + _esc(fn) + '">' + render(line) + '</p>');
        return;
      }
      if (_isBreak(line)) {
        flush();
        out.push('<p class="rec-break">' + line.replace(/[\s]/g, '') + '</p>');
        return;
      }
      if (_isRow(line)) {
        run.push({ s: line });
        return;
      }
      flush();
      out.push(heads[i] ? '<p class="rec-mid">' + render(line) + '</p>' : '<p>' + render(line) + '</p>');
    });
    flush();
    if (notes.length) out.push('<div class="rec-fn">' + notes.join('') + '</div>');
    return out.join('');
  }

  // ---- The Source's Own Footnotes ----

  // A paragraph opening on a footnote figure ((¹), (1), 1), *), **), a bare asterisk) is the
  // author's footnote. Never the first paragraph, where a numbered extract begins, and never
  // a row of asterisks alone, which is a section break.
  const _FN_HEAD = /^(?:[(（]\s*(?:\d{1,2}|[¹²³⁴⁵⁶⁷⁸⁹⁰]+|[*＊]+)\s*[)）]|\d{1,2}[)）]|[*＊†‡]+[)）]?)/;

  // The figure's identity, the same in the body and in the footnote: `(¹)`, `¹` and `1)`
  // all key as 1, `*)` and `＊` as *.
  function _fnNorm(mark) {
    return mark
      .replace(/[()（）\s]/g, '')
      .replace(/＊/g, '*')
      .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, (c) => '1234567890'['¹²³⁴⁵⁶⁷⁸⁹⁰'.indexOf(c)]);
  }

  // A paragraph of asterisks alone (`* * *`, `⁂`) is a section break.
  function _isBreak(line) {
    return /^[\s*＊⁂]+$/.test(line) && /[*＊⁂]/.test(line);
  }

  function _fnKey(line, i) {
    if (i === 0 || _isBreak(line)) return '';
    const m = line.replace('\ue008', '').match(_FN_HEAD);
    return m ? _fnNorm(m[0]) : '';
  }

  // Wraps each body figure that a footnote answers to in placeholders for fnLinks(). A figure
  // of digits must follow a word and close a clause (`Einstein.2)`), so a count in
  // parentheses is never taken for one.
  function markFootnotes(lines) {
    const keys = new Set(lines.map((l, i) => _fnKey(l, i)).filter(Boolean));
    if (!keys.size) return lines;
    const fig =
      /(?<![*＊\d(（])(?:[(（](?:[¹²³⁴⁵⁶⁷⁸⁹⁰]+|[*＊]+)[)）]|[*＊]+[)）]?|[¹²³⁴⁵⁶⁷⁸⁹⁰]+|(?<=[^\s\d]\s?)\d{1,2}[)）](?=[\s.,;:。，；：．]|$))(?![*＊\d])/g;
    return lines.map((line, i) => {
      if (_fnKey(line, i)) return '\ue008' + line;
      return line.replace(fig, (m) => (keys.has(_fnNorm(m)) ? '\ue006' + m + '\ue007' : m));
    });
  }

  // The placeholders after escaping: a body figure becomes a link to its footnote, and the
  // footnote's own marker is dropped.
  function fnLinks(html) {
    return html
      .replace(/\ue008/g, '')
      .replace(
        /\ue006([^\ue007]+)\ue007/g,
        (_, m) => '<a href="#" class="fnlink" data-fn="' + _esc(_fnNorm(m)) + '">' + m + '</a>'
      );
  }

  // Visibility buckets that mean nothing stood above the horizon to be seen. low-sun, grazing
  // and horizon are deliberately excluded: an eclipse at sunrise is the ordinary case in the
  // East-Asian registers, and flagging those would teach the reader to ignore the flag.
  const _SKY_GLOSS = {
    night: 'vis_below_horizon',
    deep: 'vis_below_horizon',
    'no-reach': 'vis_no_reach',
  };

  // A record whose sighting is qualified on either of two independent axes: the source itself
  // says it was not seen, or the reckoned sky says there was nothing to see. Both are read
  // because they can disagree — a compiler can name cloud over a place the shadow never reached.
  const _qualified = (rec) => (!!rec.claim && rec.claim !== 'seen') || !!_SKY_GLOSS[rec.vis];

  // Era-tag attributes for a record. Every case shares one frame class on purpose: a scan down
  // the rail carries one bit ("flagged"), and the hover card says which. `cls` differs by
  // register (rc-year for the rail, rp-year for the marker popup) and MUST fly the same flag.
  function eraAttrs(rec, cls) {
    if (!_qualified(rec)) return ' class="' + cls + ' num"';
    const claim = rec.claim && rec.claim !== 'seen' ? _glossText('claim_' + rec.claim) : '';
    const sky = _SKY_GLOSS[rec.vis] ? _glossText(_SKY_GLOSS[rec.vis]) : '';
    const both = claim && sky ? _glossText('status_pair', { claim, sky }) : claim || sky;

    // The claim's term rides along so the hover card can set it in vermilion; the sky axis
    // carries no term of its own.
    const term = claim ? _glossText('claim_' + rec.claim + '.term') : '';
    const attr =
      (both ? ' data-gloss="' + both.replace(/"/g, '&quot;') + '"' : '') +
      (term ? ' data-gloss-term="' + term.replace(/"/g, '&quot;') + '"' : '');
    return ' class="' + cls + ' num era-quewei"' + attr;
  }

  // ---- Astronomical Year From Event_date ----

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

  // ---- Event_date String To Numeric Ymd ----

  function _ymdFromStr(dateStr) {
    if (!dateStr) return null;
    const neg = dateStr[0] === '-';
    const parts = (neg ? dateStr.slice(1) : dateStr).split('-').map(Number);
    return { y: neg ? -parts[0] : parts[0], m: parts[1] || 1, d: parts[2] || 1 };
  }

  // ---- Civil Calendar Of A Stored Date ----

  // The corpus stores every date in proleptic Gregorian, but no pre-1582 observer kept that
  // calendar, so reader-facing dates convert to Julian before 1582-10-15; the stored Gregorian
  // form survives in the hover card _calGloss builds.

  // `parts` is the component count of the source string: month precision names the Julian
  // month off the 15th (an OS/NS offset on the 1st or 31st can shift the month), and year
  // precision passes through unconverted.
  function _civilYmd(ymd, parts) {
    const plain = { y: ymd.y, m: ymd.m, d: ymd.d, julian: false };
    if (parts < 2 || typeof SinoCal === 'undefined') return plain;
    const jd = SinoCal.toJulian(ymd.y, ymd.m, parts >= 3 ? ymd.d : 15);
    return jd.beforeReform ? { y: jd.y, m: jd.m, d: jd.d, julian: true } : plain;
  }

  // ---- Science-Row Date ----

  // CJK/ja render 年月日 (year/month/day) with Arabic numerals, leading zeros stripped, and a
  // 前 (before) prefix for BCE. zh and ja both space every digit/kanji boundary (GB/T 15834),
  // but the year/date seam needs no *extra* space: the boundary space already sits there.
  function _sciDate(dateStr, lang) {
    const ymd = _ymdFromStr(dateStr);
    if (!ymd) return dateStr;

    // Render only the components the record actually asserts: a missing month or day must
    // never be padded to 1, which would fabricate a date the source never gave. Count
    // components off the string, not off _ymdFromStr, whose ||1 default other callers rely on.
    const parts = (dateStr[0] === '-' ? dateStr.slice(1) : dateStr).split('-').length;
    const cal = _civilYmd(ymd, parts);
    if (!(isZh(lang) || lang === 'ja')) return _westernSciDate(dateStr, cal, parts);
    let s = (cal.y <= 0 ? '前 ' + (1 - cal.y) : String(cal.y)) + ' 年';
    if (parts >= 2) s += ' ' + cal.m + ' 月';
    if (parts >= 3) s += ' ' + cal.d + ' 日';
    return s;
  }

  // A Julian date must never be written in extended-ISO form (defined on the Gregorian
  // calendar): pre-reform dates take the month-name form ("21 Feb 720 BCE"), only post-reform
  // dates keep the astro-ISO string; the era-year gloss is added only where a year is ambiguous.
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

  // Written form of the Julian gloss card's date in 年月日 (year/month/day) order, never the
  // dashed ISO form reserved for post-reform dates. `tr` names the dictionary the month comes
  // from: a citation of a western serial keeps its western month name on a Chinese page.
  function _gregEquivReadable(dateStr, lang, tr) {
    const tt = tr || T;
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
    const mon = tt('julian.month.' + ymd.m);
    if (parts >= 3) return ymd.d + ' ' + mon + ' ' + yr;
    return parts >= 2 ? mon + ' ' + yr : yr;
  }

  // Inline ' data-gloss="…"' naming the calendar a rendered date is in. Only the converted
  // (Julian) dates carry it: a post-reform date is plainly Gregorian and a year-only date is
  // calendar-agnostic, so glossing either would be noise.
  function _calGlossFor(dateStr, lang) {
    const ymd = _ymdFromStr(dateStr);
    if (!ymd || typeof I18n === 'undefined' || !I18n.glossAttr) return '';
    const parts = (dateStr[0] === '-' ? dateStr.slice(1) : dateStr).split('-').length;
    if (!_civilYmd(ymd, parts).julian) return '';

    // The zh templates leave {date} flush against Han; a CE date opens with a digit, which
    // the han-latin-spacing-zh rule sets off with one space, while a BCE date opens with Han.
    const lg = lang || state.lang;
    let date = _gregEquivReadable(dateStr, lg);
    if (/^zh/.test(lg) && /^[0-9]/.test(date)) date = ' ' + date;
    return I18n.glossAttr('cal_julian', { date });
  }

  // Canonicalize an extended-ISO date to the NASA 5MCSE display form: sign + 4-digit
  // zero-padded |year| + -MM-DD (e.g. -000762-06-07 → -0762-06-07). Display-only: the
  // six-digit extended-ISO padding in data files is untouched.
  function _astroIso(dateStr) {
    if (!dateStr) return dateStr;
    const neg = dateStr[0] === '-';
    const m = (neg ? dateStr.slice(1) : dateStr).match(/^0*(\d+)(-\d\d-\d\d)$/);
    if (!m) return dateStr;
    const yr = m[1].padStart(4, '0');
    return (neg ? '-' : '') + yr + m[2];
  }

  // Chronicle-line bare-year fallback for a year no nianhao/nengo era covers (deep BCE): reads
  // in Han numerals, e.g. 公元前七三五年 (BCE 735), to match the all-Han prose line, so unlike
  // displayYear it inserts no digit/kanji boundary space.
  function chronicleYear(lang, y) {
    if (isZh(lang)) return (y <= 0 ? '公元前' + cjkDigits(1 - y) : '公元' + cjkDigits(y)) + '年';
    return (y <= 0 ? '紀元前' + cjkDigits(1 - y) : cjkDigits(y)) + '年';
  }

  // Chinese past the last dynasty carries no 近现代 (modern era) label, whose width would run into the
  // saros cell at the end of the row.
  function chronicleYearLabel(lang, y) {
    const e = isZh(lang) && y >= 1912 ? '' : eraLabel(lang, y);
    const yr = chronicleYear(lang, y);
    return e ? e + ' · ' + yr : yr;
  }

  // ---- Beijing Civil Day Of An Event ----

  // Event dates are greatest-eclipse UT days, but the chronicle registers reckon the
  // observer's own civil day; East-8 runs eight hours ahead, so from 16:00 UT onward the
  // event belongs to the next day in Chang'an, one day later than a UT-day reckoning.
  function _bjCivilYmd(dateStr, peakIso) {
    const ymd = _ymdFromStr(dateStr);
    if (!ymd) return ymd;

    // hasDay counts off the stored string, not the reckoning: a Hanshu transient can name a
    // ganzhi day never pinned to a date, and a Goryeosa eclipse can name one with no month at
    // all, so neither has a day here to reckon from even though both are day-level in kind.
    ymd.hasDay = (dateStr[0] === '-' ? dateStr.slice(1) : dateStr).split('-').length >= 3;
    if (!peakIso) return ymd;
    const t = new Date(peakIso);
    if (isNaN(t.getTime())) return ymd;
    t.setUTCHours(t.getUTCHours() + 8);

    // A computed instant resolves the civil day outright, whatever the string carried.
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hasDay: true };
  }

  // ---- Chronicle Line For The Shu'er ----

  // CJK (zh/ja): reign-era + reckoned lunisolar date, closed by shuo (solar-eclipse syzygy) or
  // wang (lunar eclipse), rubricated vermilion (zhu). Western: cultural period + the date,
  // which leaves l1 to the event alone.
  function chronicleStr(y, kind, dateStr, lang, precision, lunarMonth, peakIso) {
    if (y == null) return '';

    // The CJK registers reckon on the observer's civil day, so they read the date off the
    // East-8 shift of the computed instant; the Western branch needs only the year.
    const ymd = _bjCivilYmd(dateStr, peakIso);
    const sino = typeof SinoCal !== 'undefined';

    // Reckon a ganzhi day only where a day was actually resolved (hasDay + day precision):
    // gating on precision or kind alone reads the source's claim rather than the date on
    // hand, and would print the ganzhi of the 1st as if the source had given it.
    const dayLevel = kind === 'solar' || kind === 'lunar' || precision === 'day';
    const hasCal = ymd && ymd.hasDay && dayLevel && sino;
    if (isZh(lang) || lang === 'ja') {
      // ja keeps a continuous nengō system since 645 Taika, so it gets the same reign-year
      // treatment as zh's nianhao, not the coarse RIBBONS period band; the reign year follows
      // the civil day, since East-8 can carry a late-December event into the next reign year.
      const cy = ymd ? ymd.y : y;
      const prefix = isZh(lang)
        ? nianhaoYear(cy, lang) || chronicleYearLabel(lang, cy)
        : nengoYear(cy) || chronicleYearLabel(lang, cy);

      // lianxie (continuous writing): the reign-year runs straight into the lunisolar date
      // with no space, as Tianwenzhi chronicle entries actually read. A transient is not
      // tied to syzygy, so its day reads "…ganzhi-ri day" in plain ink, not vermilion.
      if (hasCal) {
        const ls = SinoCal.lunisolar(ymd.y, ymd.m, ymd.d);
        const body = (ls ? ls.label : '') + SinoCal.dayGanzhi(ymd.y, ymd.m, ymd.d).str;
        if (kind === 'solar' || kind === 'lunar') {
          const anchor = '<span class="ev-anchor">' + (kind === 'solar' ? '朔' : '望') + '</span>';
          return _esc(prefix) + (body ? _esc(body) + anchor : '');
        }
        return _esc(prefix) + (body ? _esc(body) + '日' : '');
      }

      // No resolved day: season + lunisolar month name from the recorded lunarMonth, never a
      // reckoning of event_date's Gregorian month. Keyed on lunarMonth itself, not precision
      // === 'month', so a record whose day was never pinned still gets its recorded month.
      if (sino && lunarMonth) {
        return _esc(prefix + SinoCal.seasonLabel(lunarMonth) + SinoCal.monthName(lunarMonth));
      }
      return _esc(prefix); // year precision (or no recorded month): reign-year only
    }

    // Western: cultural period + the full date, whose year stands in for the period's own.
    // l1 then holds the event alone, which a long star or planet name needs the width for.
    const era = eraLabel(lang, y);
    const date = '<span' + _calGlossFor(dateStr, lang) + '>' + _esc(_sciDate(dateStr, lang)) + '</span>';
    return era ? _esc(era) + ' · ' + date : date;
  }

  // Line-1 tail for a jingguan transient slip: identified → 超新星 (supernova) or 彗星 (comet)
  // with its designation, unidentified → 未确认 (unconfirmed) alone. The type word is derived
  // from the designation itself (SN … is a supernova, anything else a comet).
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

  // An occultation whose closest approach is past this means the subject or position was
  // misread. Conjunctions are exempt: a lodge can be 30° wide.
  const SEP_TRUSTED_DEG = 10;

  function sepTrusted(sep) {
    return !!(sep && sep.event && (sep.ruler === 'pair' || sep.closest_deg <= SEP_TRUSTED_DEG));
  }

  // The glossary entry defining the computed event's verb; four or more bodies meeting is a
  // gathering, two or three a conjunction.
  function sepEventGloss(sep) {
    if (sep.event !== 'conjunction') return 'verb_' + sep.event;
    return (sep.bodies || []).length > 3 ? 'verb_gather' : 'verb_conjunction';
  }

  // The event's name as mark_separation.py computes it, never the source's verb.
  function separationEvent(sep, lang) {
    const bodies = sep.bodies || [];
    const names = bodies.map((b) => T('sep.body.' + b));
    const many = bodies.length === 2 ? 'two' : bodies.length === 3 ? 'three' : 'many';

    // A star target the concordance names in all seven locales gets its name (named);
    // an unnamed one reads as a bare star.
    let family = bodies.length === 1 ? (sep.star ? 'named' : 'star') : many;

    // CJK names each body of a three-body conjunction, as 金木合土 (Venus and Jupiter conjoin
    // Saturn); western scripts count them.
    if (family === 'three' && sep.event === 'conjunction' && /^(zh|ja)/.test(lang)) family = 'listed';
    const count = bodies.length + (bodies.indexOf('the_moon') >= 0 ? 'm' : '');

    // English names a two-body conjunction attributively, "Mercury–Moon conjunction", where
    // "the Moon" loses its article. No other locale's body names start with "the ".
    if (family === 'two' && sep.event === 'conjunction') {
      names.forEach((n, i) => (names[i] = n.replace(/^the /, '')));
    }
    let out = T('sep.ev.' + family + '.' + sep.event, {
      a: names[0],
      b: names[1] || '',
      c: names[2] || '',
      n: bodies.length > 2 ? T('sep.count.' + count) : '',
      s: sep.star ? starName(sep.star, lang) : '',
    });

    // A three-character Chinese name takes 星 (planet) after its first planet, as 金犯火
    // (Venus trespasses Mars) does; before a star's name the planet always takes it, as in
    // 金星犯轩辕大星 (Venus trespasses the Great Star of Xuanyuan).
    if (/^zh/.test(lang) && family === 'named') out = out.replace(/^[水金火木土]/, '$&星');
    else if (/^zh/.test(lang) && out.length === 3) out = out.replace(/[水金火木土]/, '$&星');
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  // Line-1 tail for an occultation or conjunction slip: the computed event and the least
  // separation that night. Records the ephemeris could not be asked about fall back to
  // unconfirmed.
  function separationL1(trec, lang) {
    const sep = trec && trec.sep;
    const deg = sep && sep.closest_deg;
    if (!sepTrusted(sep)) {
      return ' · <span class="ev-strip-type">' + _esc(T('transient.unconfirmed')) + '</span>';
    }
    const fmt = (n) => n.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const dist = T('sep.distance', { deg: fmt(deg) });
    return (
      ' · <span class="ev-strip-type"' +
      _gloss(sepEventGloss(sep)) +
      '>' +
      _esc(separationEvent(sep, lang)) +
      '</span>' +
      ' · <span class="ev-strip-mag">' +
      _esc(dist) +
      '</span>'
    );
  }

  // ---- Focus Year (The Lizhou Needle) ----

  // focusN is stored normalised over [Y0, Y1] for the fisheye lens; every consumer that wants a
  // year goes through focusYear(). The fine-tick walk and list window seek deliberately keep the
  // unrounded float instead, since rounding there would nudge the first tick and first list row.

  // Subscribers are notified with the needle's target year, not the eased value that
  // focusStep animates toward; every subscriber must coalesce its own notifications
  // (basemaps debounces 180ms) since a drag fires one per pointermove sample.
  const _focusSubs = [];

  function focusYear() {
    return Math.round(Y0 + state.focusN * SPAN);
  }

  function subscribeFocus(fn) {
    if (typeof fn === 'function') _focusSubs.push(fn);
  }

  function _notifyFocus() {
    for (const fn of _focusSubs) {
      try {
        fn(focusYear());
      } catch (e) {
        /* one bad subscriber must not stall the needle */
      }
    }
  }

  // The RIBBONS entry [name,start,end] covering the "current" year — the selected record's
  // year if one is selected, else the fisheye focus year. Null when this locale's
  // periodization has no band over that year (pre-Antiquity, table gaps).
  function focusEra() {
    const sel = state.sel ? RECS.find((r) => r.id === state.sel) : null;
    const yr = sel ? sel.year : focusYear();
    const es = (RIBBONS[state.lang] || RIBBONS.en).eras;
    for (const e of es) {
      if (yr >= e[1] && yr < e[2]) return e;
    }
    return null;
  }

  // #reccount: the fan-N-tiao (entry count) tally plus the "of which" (nei) current-era subset,
  // counted within the same currentArray() so it is a true subset. Called from both renderList
  // and the end of drawTimeline, so it tracks a focus scrub live; omitted when era is null.
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
    // Han counts are spelled out (一万一千八百七十一) while each line fits the pane's ten
    // characters; if either line would overflow, both switch to digit-by-digit (一一八七一).
    const lines = (fmtN) => [
      T('atlas.count.total', { n: fmtN(arr.length) }),
      e && m ? T('atlas.count.era', { era: e[0], n: fmtN(m) }) : '',
    ];
    let [total, eraStr] = lines(isZh(state.lang) ? cjkCount : String);
    if (isZh(state.lang) && (total.length > 10 || eraStr.length > 10)) {
      [total, eraStr] = lines(cjkDigits);
    }
    cnt.innerHTML = arr.length
      ? '<span class="rc-total">' +
        _esc(total) +
        '</span>' +
        (eraStr ? '<span class="rc-era">' + _esc(eraStr) + '</span>' : '')
      : '<span class="rc-total">' + _esc(T('atlas.none')) + '</span>';
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

  // Cardinal place-value spelling up to 99999, e.g. 一万一千八百七十一 (eleven thousand eight
  // hundred seventy-one); an internal 零 (zero) fills a gap, e.g. 一千零六 (one thousand and six).
  function cjkCount(n) {
    const CH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const U = ['', '十', '百', '千'];
    n = Math.abs(Math.round(n));
    if (n === 0) return CH[0];
    if (n >= 100000) return String(n);

    // A leading 十 (ten) drops its 一 (one) only at the very start: 十五 (fifteen), but
    // 一万零一十五 (ten thousand and fifteen).
    const seg = (v, lead) => {
      let out = '',
        zero = false;
      for (let pl = 3; pl >= 0; pl--) {
        const d = Math.floor(v / Math.pow(10, pl)) % 10;
        if (d === 0) {
          if (out) zero = true;
          continue;
        }
        if (zero) {
          out += CH[0];
          zero = false;
        }
        out += lead && pl === 1 && d === 1 && !out ? U[pl] : CH[d] + U[pl];
      }
      return out;
    };
    const wan = Math.floor(n / 10000),
      rem = n % 10000;
    let str = wan ? seg(wan, true) + '万' : '';
    if (rem) str += (wan && rem < 1000 ? CH[0] : '') + seg(rem, !wan);
    return str;
  }

  // Decimal Han numeral below 1000 in the juan-number style: 11 → 十一 (eleven), 106 → 一百六
  // (one hundred six), 160 → 一百六十 (one hundred sixty). The zero after the hundreds is
  // dropped, as in 卷第一百六 (juan 106).
  function cjkDecimal(n) {
    const D = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    n = Math.abs(Math.round(n));
    if (n === 0) return D[0];
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    let s = h ? D[h] + '百' : '';
    if (t) s += (t === 1 && !h ? '' : D[t]) + '十';
    if (u) s += D[u];
    return s;
  }

  // Roman numerals for a positive integer: 106 → CVI (the Western saros label).
  function _roman(n) {
    const R = [
      [1000, 'M'],
      [900, 'CM'],
      [500, 'D'],
      [400, 'CD'],
      [100, 'C'],
      [90, 'XC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ];
    let s = '';
    for (const [v, r] of R) for (; n >= v; n -= v) s += r;
    return s;
  }

  // 1-based rank of an eclipse among the catalogue's members of its saros series, by date.
  // Solar and lunar series share numbers, so the series key carries the kind. Rebuilt only
  // when the catalogue size changes, so a call made mid-load does not freeze a short count.
  let _sarosRank = null;
  let _sarosRankN = -1;
  function sarosOrdinal(e) {
    const all = EclipseLoader.all();
    if (all.length !== _sarosRankN) {
      _sarosRankN = all.length;
      const groups = new Map();
      for (const x of all) {
        if (x.saros == null) continue;
        const k = x._kind + '|' + x.saros;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(x);
      }
      _sarosRank = new Map();
      for (const list of groups.values()) {
        list.sort((a, b) => a._peakMs - b._peakMs);
        list.forEach((x, i) => _sarosRank.set(x.date + '|' + x._kind, i + 1));
      }
    }
    return _sarosRank.get(e.date + '|' + e._kind) || null;
  }

  // Ordinal place-value spelling for volumes and reign years, e.g. 四十九 (forty-nine).
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

  // Nianhao lookup: returns e.g. "清光绪十六年" for zh-Hans/zh-Hant, null otherwise.
  // Binary search for last era entry where e.y <= yr; falls back for out-of-range years.
  function nianhaoYear(yr, lang) {
    if (!NIANHAO || !NIANHAO.eras || !NIANHAO.eras.length) return null;
    const hant = lang === 'zh-Hant';
    const eras = NIANHAO.eras;
    if (yr < eras[0].y || yr >= 1912) return null; // outside the Jianyuan-to-Xuantong range
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

  // Mirrors nianhaoYear but single-line (no dynasty), with explicit `gap` entries for the two
  // real 7th-century interregna: those must fall back to the period label, never silently
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
    return (e.ja || e.nt) + (reign === 1 ? '元年' : cjkOrdinal(reign) + '年');
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

  // A source attested in the viewer's own language is its own translation: the corpus
  // draws on public-domain editions in several of the site's own locales, so a reader of
  // one would otherwise meet the same paragraph twice. Render the original alone.
  function transLine(rec, lang, cls) {
    const t = transText(rec, lang);
    if (!t || _sameText(t, rec.orig || '')) return '';
    const shownLang = rec.textMap && Object.keys(rec.textMap).find((k) => rec.textMap[k] === t);
    const ns = shownLang ? cardNotes(rec, lang) : [];
    const marks = ns.length ? Notes.transMarks(t, ns, shownLang) : [];
    const marked = markTrans(t, rec.supplied, shownLang, marks);
    const skip = ns.length ? Notes.glossedPhrases(ns, shownLang) : [];
    const html = paraHtml(
      marked,
      (s) => eraNames(highlightTrans(s, rec.type), shownLang || lang, lang, skip),
      rec.orig
    );
    return (
      '<div class="' +
      cls +
      '" lang="' +
      _esc(shownLang || lang) +
      '">' +
      suppliedSpans(ns.length ? Notes.supMarks(html, ns) : html, shownLang || lang) +
      '</div>'
    );
  }

  // Words the translation adds (an era carried over, an omitted subject) are bracketed by CSS
  // per script, and the note superscripts sit in the same text. All go in as placeholders
  // before escaping and highlighting and become markup after, so none splits an entity.
  const SUP_OPEN = '';
  const SUP_CLOSE = '';

  // The [start, end) of each supplied span within the translation `text` of locale `lang`.
  function suppliedRanges(text, units, lang) {
    return Supplied.ranges(text, units, lang);
  }

  // The translation with its supplied spans bracketed and `marks` ({pos, ns}, from
  // Notes.transMarks) set in. At one offset a closing bracket comes first, then the note mark,
  // then an opening bracket, so a mark after a supplied word falls outside its brackets.
  function markTrans(text, units, lang, marks) {
    if (!lang) return text;
    const at = [];
    suppliedRanges(text, units, lang).forEach(([a, b]) => {
      at.push([a, 2, SUP_OPEN]);
      at.push([b, 0, SUP_CLOSE]);
    });
    marks.forEach((m) => at.push([m.pos, m.rank, m.str]));
    at.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let out = '';
    let from = 0;
    at.forEach(([pos, , str]) => {
      out += text.slice(from, pos) + str;
      from = pos;
    });
    out += text.slice(from);

    // Adjacent spans share one pair of brackets instead of one pair each.
    return out.split(SUP_CLOSE + SUP_OPEN).join('');
  }

  // Round brackets in Chinese and Japanese (GB/T 15834 4.9.3.1), square elsewhere. They are
  // characters of the text, so a copy or a find takes them along.
  const suppliedBrackets = (lang) => (/^(zh|ja)/.test(lang || '') ? ['（', '）'] : ['[', ']']);

  function suppliedSpans(html, lang) {
    const [open, close] = suppliedBrackets(lang);
    return html.replace(//g, '<span class="supplied">' + open).replace(//g, close + '</span>');
  }

  // The translation to show, or the original when this locale has none — a card
  // must never come up blank just because one of the seven renderings is missing.
  function transText(rec, lang) {
    return I18n.pick(rec.textMap, lang, { zh: true }) || rec.orig;
  }

  // ---- Card place / source (structured, per-locale, no embedded English) ----

  const _cjkLang = (l) => l === 'zh-Hans' || l === 'zh-Hant' || l === 'ja';

  // Recursively collect every string leaf out of a value that may be a string, a plain
  // array, or a nested {locale: value} object (gazetteer.json's `modern`/`aliases` shape) —
  // used to build search haystacks without "[object Object]" leaking in.
  function _flattenHay(v) {
    if (v == null) return [];
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v.flatMap(_flattenHay);
    if (typeof v === 'object') return Object.values(v).flatMap(_flattenHay);
    return [];
  }

  // A place is shown by its historical name, with the modern name as a parenthetical gloss
  // where the two differ. The gloss goes through pickDistinct, never pick: a locale where the
  // name never changed would otherwise render "Bogor (now Bogor)".
  function placeLabel(rec, lang) {
    const p = rec.placeI18n;
    if (!p) return _esc(rec.place);
    let html = _esc(I18n.pick(p.name, lang));
    const modern = I18n.pickDistinct(p.modern, p.name, lang);

    // CJK locales: no space before the parenthetical gloss (their punctuation supplies it).
    // Non-CJK: one space inside the span, before the text, never outside it.
    if (modern)
      html +=
        (_cjkLang(lang) ? '<span class="rp-mod">' : '<span class="rp-mod"> ') +
        T('atlas.place.modern', { name: _esc(modern) }) +
        '</span>';
    return html;
  }

  // Pointer type of the gesture in flight. Touch has no hover state, so a tap on an elided
  // place name carries two jobs at once (reveal the name, select the record); a mouse never
  // needs this, since hover already revealed the name before the click.
  let _touchTap = false;

  // The width shortfall always cuts the place name's tail, the modern gloss, and a gloss is
  // one indivisible unit — half of `(now Hangzhou)` names nowhere — so it drops whole, never
  // mid-ellipsis, leaving a hairline caret and the full label on the hover card.
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

      // Two ways to withhold, and elision hides the second: once the gloss drops, the row no
      // longer overflows, so an overflow-only test would strip the affordance the drop created.
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

  // ja falls back to zh-Hant deliberately: a Chinese book title is written in its traditional
  // form in Japanese, e.g. 宋書 (Book of Song), unlike a place name, where ja needs its own field.
  function sourceTitle(s, lang) {
    return I18n.pick(s.title, lang, { rom: true, zh: true });
  }

  // Names joined by the locale's own list separator; a trailing 等 (et al.) marks the
  // unnamed co-compilers the source itself only gestured at.
  function sourceAuthors(s, lang) {
    if (!s.author || !s.author.length) return '';
    const cjk = _cjkLang(lang);
    const names = s.author.map((a) => (cjk ? a.name : a.rom || a.name));
    let out = names.join(cjk ? '、' : ', ');
    if (s.author.some((a) => a.et_al)) out += cjk ? ' 等' : ' et al.';
    return out;
  }

  // Fill a locus_url template: each {field} placeholder takes that locus key's value,
  // percent-encoded on its own. A field the record does not supply yields no link at all,
  // never a URL with a literal "{volume}" in it.
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

  // ---- Citation Locus ----

  // Prints the locus in the order a citation reads: the work, then where inside it, then which
  // sheet. The locus identifies the passage; the facsimile URL the same object also carries is
  // a separate concern, and reading it alone would leave a card with no juan, issue or page.
  const LOCUS_ORDER = [
    'work',
    'volume',
    'number',
    'chapter',
    'section',
    'part',
    'annal',
    'reign',
    'year',
    'folio',
    'fragment',
    'issue',
    'column',
    'page',
  ];

  // Three registers, and the key decides which: a title is quoted, a leaf number is labelled,
  // everything else prints bare. A value written in Han that already names its own division
  // (its own script's citation segment) takes neither.
  const LOCUS_TITLE = { work: 1, section: 1 };
  const LOCUS_NUMBERED = { volume: 1, number: 1, chapter: 1, folio: 1, fragment: 1, page: 1, annal: 1 };

  // The epochs an annal may be counted from other than the Common Era, keyed by the
  // locus `era` value, each mapped to its own citation pattern.
  const ANNAL_ERA = { spanish: 'atlas.locus.annal_spanish', 'anno-mundi': 'atlas.locus.annal_am' };

  // Nearly every volume value carries its own unit 卷 (juan) inside it, e.g. "卷052", so a
  // label in front of one would double it. A western edition does the same when its own
  // division is not the one the key names, so this tests the value, never the key.
  const _selfLabelled = (v) => /^[卷冊册頁页葉叶第]/.test(v) || /^[A-Za-z]{1,5}\.\s*\d/.test(v);

  // A half-width space parts a Han character from Latin letters or Arabic numerals beside it,
  // and only from those: a spelled-out term like 第七页 (page seven) stays unspaced, but the
  // same word set next to an Arabic digit takes one. Shared with ja, applied site-wide.
  const _locusPad = (v, lang) => ((isZh(lang) || lang === 'ja') && /^[ -~]/.test(v) ? ' ' + v + ' ' : v);

  // ---- Which Apparatus A Citation Is Set In ----

  // Follows the source, not the reader: if the source's own displayed name comes out in Han,
  // the whole citation is set the Chinese way, else it keeps its western frame even on a
  // Chinese page. A CJK locale has no western frame of its own, so English stands in (I18n.ten).
  const TEN = (k, p) => (typeof I18n !== 'undefined' && I18n.ten ? I18n.ten(k, p) : k);

  // The closing mark a hoisted headline ends with, in the locales whose punctuation goes
  // inside it. Empty for every other locale, which is the same as saying "leave it alone".
  const COMMA_INSIDE_QUOTE = { en: '”' };

  // The Chinese apparatus runs its parts together — 《史記》卷二十八《封禪書》 — because each
  // is self-delimiting; only where the script changes does a boundary have to be drawn.
  const _scriptGap = (left, right) => (/[!-~]$/.test(left) !== /^[!-~]/.test(right) && left && right ? ' ' : '');

  // ---- Juan: One Number, Two Archives ----

  // The stored value is the archive's own page name, its 卷 (juan) plus digits, e.g. "卷053",
  // so the number is read back out and reset for the reader: Chinese history journals number
  // a juan in positional Han, and a western-locale reader is owed Arabic digits over a Han string.
  const _HAN_DIGITS = '〇一二三四五六七八九';

  // ○ (U+25CB circle) and 〇 (ideographic zero) read as the same glyph to a reader, so both
  // must parse as zero here.
  const _HAN_VALUE = { 〇: 0, '○': 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const _HAN_SCALE = { 十: 10, 百: 100, 千: 1000 };

  const _hanPositional = (n) => String(n).replace(/\d/g, (d) => _HAN_DIGITS[+d]);

  // The unit word belongs to the book's tradition, not the reader's language: the same graph
  // is juan in a Chinese history, gwon in a Korean one, kan in a Japanese one, romanised the
  // way the source catalogue already does.
  const JUAN_UNIT = { chinese: 'juan', tangut: 'juan', korean: 'gwon', japanese: 'kan', vietnamese: 'quyển' };

  function _hanToInt(s) {
    if (/^\d+$/.test(s)) return +s;

    // No scale character means the digits are positional: 一〇五 (one-oh-five) is not 1+0+5.
    if (!/[十百千]/.test(s)) {
      let n = 0;
      for (const ch of s) {
        if (!(ch in _HAN_VALUE)) return null;
        n = n * 10 + _HAN_VALUE[ch];
      }
      return n;
    }
    let total = 0;
    let cur = 0;
    for (const ch of s) {
      if (ch in _HAN_VALUE) cur = _HAN_VALUE[ch];
      else if (ch in _HAN_SCALE) {
        total += (cur || 1) * _HAN_SCALE[ch];
        cur = 0;
      } else return null;
    }
    return total + cur;
  }

  // Null for anything whose juan is not a number to be read, e.g. 卷上 (the upper of two
  // fascicles) or a western volume in Roman numerals; those keep the edition's own name.
  function _juanSegment(v, lang, tt, civ) {
    // Some editions write their juan 卷之十五 (juan fifteen); the middle 之 is phrasing, not a part.
    const m = /^卷之?(\d+|[〇零一二三四五六七八九十百千]+)(.*)$/.exec(v);
    if (!m) return null;
    const n = _hanToInt(m[1]);
    if (n === null) return null;
    const cjk = _cjkLang(lang);

    // Some archives split one juan into parts and write the part as 之二 (part two). Han keeps
    // it; a western citation reads the same thing as the decimal 105.2.
    const tail = cjk ? m[2] : m[2].replace(/^之(.+)$/, (_, t) => '.' + (_hanToInt(t) === null ? t : _hanToInt(t)));
    const unit = cjk ? (lang === 'ja' ? '巻' : '卷') : JUAN_UNIT[civ] || 'juan';
    return tt('atlas.locus.juan', { u: unit, v: (cjk ? _hanPositional(n) : n) + tail });
  }

  // Some archives number their leaves in Han, which a western citation has no way to read;
  // same treatment as the juan. Null for a page written any other way, ranges and column
  // references included.
  const _hanLeaf = (v) => (/^[〇零○一二三四五六七八九十百千]+$/.test(v) ? _hanToInt(v) : null);

  // Decide a title's brackets from that title's own script, never the source's: a Chinese
  // paper's own name earns 《》 (Chinese book-title marks), but a French headline it carried
  // stayed Latin and takes western quotes. Returns the dictionary and locale the value is set from.
  function _titleCite(v, cite, tt) {
    return _cjkLang(cite) && !_hasCJK(v) ? { cite: 'en', tt: TEN } : { cite, tt };
  }

  // A journal or a book is cited by an italic title in the western manner and by its own
  // brackets in CJK; the locale pattern supplies the brackets where a script has them.
  function _workTitle(v, lang, tt) {
    const t = tt('atlas.locus.work', { v: _esc(v) });
    return _cjkLang(lang) ? t : '<i>' + t + '</i>';
  }

  // A serial's headline precedes the paper that carried it (the CMOS newspaper order); a
  // classical work's division name is not a headline and stays after the juan, hence the two
  // pieces returned. `cite`/`tt` follow the source; `absorbed` is the key already set elsewhere.
  function locusLabel(rec, cite, tt, absorbed, link) {
    const lo = rec.locus;
    if (!lo) return { head: '', tail: '' };
    const han = _cjkLang(cite);
    const headline = lo.issue && lo.section ? lo.section : '';
    const out = [];
    for (const k of LOCUS_ORDER) {
      const v = lo[k];
      if (!v || k === absorbed || (k === 'section' && headline)) continue;

      // A fascicle and its leaf are one reference (e.g. "fascicle 2, leaf 1"): the fascicle
      // carries the leaf and the leaf does not print again after it.
      if (k === 'page' && lo.part && _hanLeaf(v) !== null) continue;
      let s;
      if (k === 'part') {
        const leaf = lo.page && _hanLeaf(lo.page) !== null ? _hanLeaf(lo.page) : null;
        const n = _hanToInt(v);
        if (han) s = _esc(v) + (leaf === null ? '' : '之' + _hanPositional(leaf));
        else s = (n === null ? _esc(v) : n) + (leaf === null ? '' : '.' + leaf);
        out.push({ k, s });
        continue;
      }

      // The issue is a stored Gregorian date, so it is written the way every other date
      // on the site is written rather than left as the dashed ISO string.
      if (k === 'issue') s = _esc(_gregEquivReadable(v, cite, tt));
      else if (k === 'work') {
        const w = _titleCite(v, cite, tt);
        s = _workTitle(v, w.cite, w.tt);
      } else if (k === 'volume' && _juanSegment(v, cite, tt, rec.civ)) s = _juanSegment(v, cite, tt, rec.civ);
      else if (k === 'page' && _hanLeaf(v) !== null)
        s = tt('atlas.locus.page', { v: han ? _hanPositional(_hanLeaf(v)) : _hanLeaf(v) });

      // A standing column is the paper's own department, not the piece's title, so the history
      // journals set it after the date in quotation marks; a western citation names it in
      // roman. Its script picks the marks, as a headline's does.
      else if (k === 'column') s = _titleCite(v, cite, tt).tt('atlas.locus.column', { v: _esc(v) });

      // A Han citation names an annal in positional Han with no pad; a value already in Han
      // that ends in its own year word (年) is a whole segment and takes no second one. An
      // annal counted from another epoch (Spanish era, anno mundi) names that epoch instead.
      else if (k === 'annal' && ANNAL_ERA[lo.era])
        s = tt(ANNAL_ERA[lo.era], {
          v: han && /^\d+$/.test(v) ? _hanPositional(v) : _esc(v),
        });
      else if (k === 'annal' && han && /^\d+$/.test(v)) s = tt('atlas.locus.annal', { v: _hanPositional(v) });
      else if (k === 'annal' && /年$/.test(v)) s = tt('atlas.locus.annal_reign', { v: _esc(v) });
      else if (LOCUS_TITLE[k] && !/^\d+$/.test(v)) s = _titleCite(v, cite, tt).tt('atlas.locus.' + k, { v: _esc(v) });
      else if (LOCUS_NUMBERED[k] && !_selfLabelled(v))
        s = tt('atlas.locus.' + k, { v: _locusPad(_esc(v), cite) }).trim();
      else s = _esc(v);
      if (link && link.k === k)
        s = '<a class="src-link" href="' + _esc(link.url) + '" target="_blank" rel="noopener">' + s + '</a>';
      out.push({ k, s });
    }
    let s = '';
    for (const p of out) {
      if (!s) s = p.s;
      else if (!han) s += tt('atlas.locus.sep') + p.s;

      // The leaf reference closes a Chinese citation and takes the comma that stands before
      // it, as does a paper's column after its date; everything above them runs on.
      else if (p.k === 'page' || p.k === 'folio' || p.k === 'column') s += tt('atlas.locus.sep_leaf') + p.s;
      else s += _scriptGap(s, p.s) + p.s;
    }

    // The credit line names who wrote the piece, so it stands with the piece's title, ahead
    // of the paper, joined on a space as the page set it under the headline.
    const credit = lo.byline ? _esc(lo.byline) : '';

    // The headline's own locale travels out with it, so the caller's closing-quote comma is
    // keyed to the locale that actually supplied that mark.
    if (!headline) return { head: credit, headCite: cite, tail: s };
    const h = _titleCite(headline, cite, tt);
    const title = h.tt('atlas.locus.section', { v: _esc(headline) });
    return { head: credit ? title + ' ' + credit : title, headCite: h.cite, tail: s };
  }

  function sourceLabel(rec, lang) {
    const s = rec.sref;

    // A source is cited by its title, else by its author, else by its bare attribution. The
    // card carries the work's name alone; the compiler stays available in sources.json but
    // printing it on every card would be noise. No entry at all is a data error, shown bare.
    const txt = s ? sourceTitle(s, lang) || sourceAuthors(s, lang) || s.attribution || '' : rec.srcKey;

    // The apparatus follows the source: a name that came out in Han can carry a Chinese
    // citation, a name that stayed Latin cannot and takes the western one instead.
    const cite = _cjkLang(lang) && !_hasCJK(txt) ? 'en' : lang;
    const tt = cite === lang ? T : TEN;

    // A reign names a division of the work itself, so the Chinese apparatus sets it inside the
    // title's own brackets on the interpunct compound titles already use, rather than letting
    // it run on after them; it then leaves the locus, or it would be cited twice.
    const inTitle = _cjkLang(cite) && rec.locus && rec.locus.reign && /[》』]$/.test(txt);
    const name = inTitle ? txt.slice(0, -1) + '·' + rec.locus.reign + txt.slice(-1) : txt;

    // A paper's name is stored bare, unlike a book's, so the apparatus supplies its own title
    // marks here (Chinese book-title marks, Japanese quotation marks, or italics).
    const serial = s && s.genre === 'newspaper' && txt === sourceTitle(s, lang);
    const shown = serial ? _workTitle(name, cite, tt) : _esc(name);

    // A source cited by its author is a paper in a journal: the link opens that paper, so it
    // hangs on the paper's title, else on the journal's, as journal sites set it.
    const lo = rec.locus || {};
    const byAuthor = s && !sourceTitle(s, lang);
    const linkKey = rec.srcUrl && byAuthor ? (lo.section && !lo.issue ? 'section' : lo.work ? 'work' : '') : '';
    const body =
      rec.srcUrl && !linkKey
        ? '<a class="src-link" href="' + _esc(rec.srcUrl) + '" target="_blank" rel="noopener">' + shown + '</a>'
        : shown;

    // Show transmission kind so readers know when they are reading a translation or
    // a passage preserved only via another work (CMOS 18e §14.260 visibility principle).
    const editions = (s && s.editions) || [];
    const cons = editions.find((e) => e && e.consulted === true) || editions[0] || {};
    const kind = cons.kind;
    const loc = locusLabel(rec, cite, tt, inTitle ? 'reign' : '', linkKey && { k: linkKey, url: rec.srcUrl });
    let suffix = '';
    if (kind === 'trans' && cons.by)
      suffix = '<span class="src-via">' + T('atlas.src_via_trans', { by: cons.by }) + '</span>';
    else if (kind === 'quot' && cons.by)
      suffix = '<span class="src-via">' + T('atlas.src_apud', { by: cons.by }) + '</span>';
    else if (kind === 'cite') suffix = '<span class="src-via">' + T('atlas.src_catalog') + '</span>';

    // The deep link stays on the publication's own name: it resolves to that issue or juan,
    // not to the piece, so hanging it on the headline would promise more than it gives. A
    // Chinese citation separates the piece from the paper with its own comma, not an interpunct.
    const sep = _cjkLang(cite) ? tt('atlas.locus.sep_leaf') : tt('atlas.locus.sep');
    let head = loc.head ? loc.head + sep : '';

    // CMOS 6.9 tucks the comma inside the closing quotation mark, and American practice is
    // alone in that: the French guillemets and the CJK brackets take it outside. Keyed to
    // the locale that asks for it rather than applied to every quoted headline.
    const inside = COMMA_INSIDE_QUOTE[loc.headCite];
    if (inside && loc.head.endsWith(inside) && sep[0] === ',')
      head = loc.head.slice(0, -inside.length) + ',' + inside + sep.slice(1);

    // A Chinese citation carries no comma between the book and the juan, so the joint
    // between the source's name and its locus obeys the apparatus too.
    const join = _cjkLang(cite) ? _scriptGap(name, loc.tail) : sep;
    return T('atlas.src') + head + body + (loc.tail ? join + loc.tail : '') + suffix;
  }

  // ---- Card Notes ----

  // The sentence patterns of the locale being rendered, which search also asks for in
  // English under any reader locale. A miss comes back as null rather than as the key, so
  // js/notes.js can tell an absent sentence pattern from a present one.
  const _noteKey = (lang) => (k) => I18n.tIn(lang, k);

  // A record's notes rendered in one locale, numbered in reading order. Kept on the record
  // per locale: the card, the popup and the search haystack all read the same rendering.
  function cardNotes(rec, lang) {
    if ((!rec.notes && !rec.marks) || typeof Notes === 'undefined') return [];
    rec._notes = rec._notes || {};
    if (!rec._notes[lang]) {
      const t = transText(rec, lang);
      const shown = t && !_sameText(t, rec.orig || '') ? t : '';
      const transLang = shown && rec.textMap ? Object.keys(rec.textMap).find((k) => rec.textMap[k] === shown) : '';
      rec._notes[lang] = Notes.render(
        {
          notes: (rec.notes || []).concat(
            rec.marks
              ? Notes.dateUnits(rec.marks, rec.textMap, rec.orig, { lat: rec.lat, lon: rec.lon, date: rec.date })
              : []
          ),
          text_orig: rec.orig,
          text_zh: rec.textMap ? rec.textMap['zh-Hans'] || '' : '',
          trans: transLang ? shown : '',
          trans_lang: transLang,
        },
        lang,
        _noteKey(lang)
      );
    }
    return rec._notes[lang];
  }

  // The superscript after a header field or the source line: every unit anchored there.
  function noteMark(rec, lang, at) {
    const ns = cardNotes(rec, lang).filter((u) => u.at === at && u.html);
    return ns.length
      ? Notes.supHtml(
          ns.map((u) => u.n),
          ns
        )
      : '';
  }

  // The original text with its superscripts. The marks go in as placeholders before the text
  // is escaped and highlighted, and become markup after, so no mark splits an entity or a tag.
  function origHtml(rec, lang) {
    const ns = cardNotes(rec, lang);
    const text = ns.length ? Notes.markOrig(rec.orig, ns) : rec.orig;
    const html = paraHtml(text, (s) => eraNames(highlightPhrase(s, rec.type), 'orig', lang), rec.orig);
    return ns.length ? Notes.supMarks(html, ns) : html;
  }

  // The notes area: a numbered list whose numbers match the superscripts.
  function noteList(rec, lang, cls) {
    const ns = cardNotes(rec, lang).filter((u) => u.html && !u.hover);
    if (!ns.length) return '';
    const back = (n) => '<a href="#" class="nback" data-n="' + n + '">↑</a> ';
    return (
      '<ol class="' +
      cls +
      '">' +
      ns
        .map(
          (u) =>
            '<li value="' +
            u.n +
            '" data-n="' +
            u.n +
            '"><span class="nnum">[' +
            u.n +
            ']</span>' +
            back(u.n) +
            u.html +
            '</li>'
        )
        .join('') +
      '</ol>'
    );
  }

  // ---- Note And Footnote Links ----

  // One delegated listener serves every card and popup. The jump stays inside the record it
  // was clicked in and never touches location.hash, which the permalink owns.
  function flash(el) {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.classList.remove('n-flash');
    void el.offsetWidth;
    el.classList.add('n-flash');
  }

  function onNoteLink(e) {
    const a = e.target.closest && e.target.closest('a.nlink, a.nback, a.fnlink');
    if (!a) return;
    const box = a.closest('.reccard, .rp');
    if (!box) return;
    e.preventDefault();
    const n = a.dataset.n;
    let to = null;
    if (a.classList.contains('nlink'))
      to = box.querySelector('.rc-note li[data-n="' + n + '"], .rp-note li[data-n="' + n + '"]');
    else if (a.classList.contains('nback')) to = box.querySelector('a.nlink[data-n="' + n + '"]');
    else {
      const text = a.closest('.rc-trans, .rc-orig, .rp-trans, .rp-orig');
      to = text && text.querySelector('.rec-fn p[data-fn="' + CSS.escape(a.dataset.fn) + '"]');
    }
    if (to) flash(to);
  }

  // Search reads the notes as rendered in the reader's locale and in English, the fallback
  // every locale shares, with the markup stripped.
  function noteHay(rec) {
    if (!rec.notes && !rec.marks) return '';
    const lang = state.lang;
    if (rec._noteHay && rec._noteHay.lang === lang) return rec._noteHay.text;
    const parts = cardNotes(rec, lang).concat(lang === 'en' ? [] : cardNotes(rec, 'en'));
    const text = parts.map((u) => u.html.replace(/<[^>]+>/g, '')).join(' ');
    rec._noteHay = { lang, text };
    return text;
  }

  // The translations and the original as the card shows them, supplied brackets and note numbers
  // included, so a search finds what a copy takes. Marked in the reader's locale, memoised.
  function shownHay(rec) {
    if (!rec.supplied && !rec.notes && !rec.marks) return rec.textHay;
    const lang = state.lang;
    if (rec._shownHay && rec._shownHay.lang === lang) return rec._shownHay.text;
    const ns = cardNotes(rec, lang);
    const plain = (s, l) => {
      const [open, close] = suppliedBrackets(l);
      return Notes.plainMarks(s).split(SUP_OPEN).join(open).split(SUP_CLOSE).join(close);
    };
    const parts = Object.entries(rec.textMap || {}).map(([k, t]) =>
      plain(markTrans(t, rec.supplied, k, ns.length ? Notes.transMarks(t, ns, k) : []), k)
    );
    if (ns.length) parts.push(Notes.plainMarks(Notes.markOrig(rec.orig, ns)));
    const text = parts.join(' ');
    rec._shownHay = { lang, text };
    return text;
  }

  // ---- State (ORBIS Single Source) ----

  // Default view = Eurasia: range[0] is -762 Bur-Sagale (the chronology keystone), focusN is
  // 1919 Eddington (also the basemap's own default when no event is selected), and range[1]
  // is 1931, a rolling public-domain wall (current year − 95) recomputed when the wall moves.

  // civ filter is single-select (null = all); site is a same-coordinate scope from a spiderfy
  // overflow chip; mode is 'records' or 'events' (all-events, paged), with selEv the selected
  // event key in all-events mode.

  // DEFAULTS is the only copy of these values: js/permalink.js reads them here to omit a
  // param still at default, and the object is frozen so the exported copy cannot drift.
  const DEFAULTS = Object.freeze({
    Y0,
    Y1,
    focusYear: 1919,
    range: Object.freeze([-762, 1931]),
  });

  const state = {
    lang: 'en',
    civ: null,
    type: 'solar',
    q: '',
    sel: null,
    mode: 'records',
    selEv: null,
    focusN: normYear(DEFAULTS.focusYear),
    range: [DEFAULTS.range[0], DEFAULTS.range[1]],
  };

  // Shared list pager for records and all-events (only one renders into #list at a time).
  // [winStart, winEnd) index into the current mode's sorted array. winSeedKey remembers what
  // the window was seeded for: a plain re-render preserves it, a filter change re-seeds it.
  let winStart = 0,
    winEnd = 0,
    winLen = 0,
    winSeedKey = '';

  // Row (window-relative) the next render must park at the top of #list, or -1. A freshly
  // seeded window straddles the focus, so without this the list opens scrolled INITIAL_BEFORE
  // rows before the year the reader is looking at.
  let winFocusRow = -1;

  // Cards left visible above the focus card when a window opens on it.
  const FOCUS_LEAD_IN = 2;
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
  let _viewFrom = 0,
    _viewTo = 0; // last measured on-screen card slice (see viewSlice)
  let RECS = []; // mapped records within the service window
  let MANIFEST = null; // data/records/manifest.json (file list + per-file counts)
  const _loadedPh = new Set(); // phenomena whose shards are already in RECS
  const _phLoading = new Map(); // phenomenon → in-flight load Promise, dedupes concurrent asks
  let CIV_COUNT = {}; // civ → corpus-wide record count, read off the manifest
  let CIV_NAMES = {}; // civ → civilizations.json row, for the civ-name search
  let PRESENT_CIVS = []; // civs actually present (ordered by Seal.CIVS)

  // record_id → visibility.json row, machine-derived; no row means visible. The source's own
  // claim lives on the record as source_claim, and the two are read side by side.
  let VIS = {};
  let NIANHAO = null; // Chinese reign-era line of data/concordance/eras.json
  let NENGO = null; // Japanese era line of data/concordance/eras.json

  // Place concordance keyed by place_key, the sole source of a record's place name and
  // coordinates; _map below reads it for every record.
  let GAZ = {};

  // Flatten rather than take Object.values: a civ row may nest an `eras` array of
  // era-name overrides, and a reader who searches Norse must still reach the saga
  // records whose span name is Nordic.
  function _civHay(civ) {
    const row = CIV_NAMES[(civ || '').toLowerCase()];
    return row ? _flattenHay(row).join(' ') : civ || '';
  }

  // ---- Corpus Loading (Phenomenon-Scoped) ----

  // Fetch shards per phenomenon, never the whole corpus: occultation dominates the corpus by
  // bytes and is a register most readers never open, so loading it up front would make the
  // reader wait to see the solar records the default view shows; the rest stream in behind it.
  function _shardsFor(ph) {
    return ((MANIFEST && MANIFEST.files) || []).filter((f) => f.phenomenon === ph);
  }

  // Fetch + project one phenomenon's shards into RECS. Idempotent, and concurrent callers
  // share one in-flight promise, since setType() and the background sweep can both ask for
  // the same phenomenon in the same tick.

  // Must never reject, and a failure must never latch: resolve false and drop the _phLoading
  // entry so the next ask retries. Every caller reads the result as a plain boolean (boot
  // awaits it before building markerLayer), so a throw would take the whole map down.
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
    )
      .then((parts) => {
        const mapped = parts
          .flat()
          .map(_map)
          .filter((r) => r.year != null && r.year >= Y0 && r.year <= Y1);
        RECS = RECS.concat(mapped);
        _loadedPh.add(ph);
        _phLoading.delete(ph);
        _rescoreImportance();
        return true;
      })
      .catch((e) => {
        _phLoading.delete(ph);
        console.warn('[atlas] register failed to load; next ask retries:', ph, e);
        return false;
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

  // ---- Data Mapping: Record To Card Shape ----

  // Resolved by key from data/records/sources.json in init(), populated before _map runs.
  let SOURCES = {};

  function _map(r) {
    // gazetteer.json (via GAZ) is the sole authority for place: a record carries only
    // place.key.
    const placeKey = r.place.key || '';
    const g = GAZ[placeKey] || {};

    // The gazetteer entry is already the display block; the numeric lat/lon/since/until
    // alongside name/modern/aliases are ignored by both the label and the search haystack.
    const placeI18n = g.name ? g : null;
    const placeName = (g.name && g.name['zh-Hans']) || placeKey || '';

    // The source link is, in priority order: r.source.url (a rare per-record escape hatch),
    // edition.locus_url with r.source.locus filled in (the common multi-volume case), or
    // edition.url (the source's single default page).
    const sk = (r.source || {}).key;
    const se = sk ? SOURCES[sk] : null;
    const editions = (se && se.editions) || [];
    const consulted = editions.find((e) => e && e.consulted === true) || editions[0] || {};
    const srcUrl = r.source.url || _locusUrl(consulted.locus_url, r.source.locus) || consulted.url || null;

    // Search matches any form of the citation — title, romanization, English title, compiler,
    // translator — not just what the card shows.
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

    // A serial's column heading belongs to the CITATION, not to text_orig, so the citation
    // haystack is what has to carry it. Leave it out and searching "Jardin des Plantes"
    // silently stops reaching the records headed that way.
    const locus = r.source.locus || null;
    const locusHay = locus ? Object.values(locus).join(' ') : '';

    const textMap = r.text || null; // BCP-47 locale map
    const translit = r.translit || ''; // romanization of text_orig, where authored
    const notes = r.notes && r.notes.length ? r.notes : null; // typed note units, usually absent
    const supplied = r.supplied && r.supplied.length ? r.supplied : null; // words the translation adds

    // The foreign era years and unequal hours the translations print, each a hover card.
    const marks = r.date && (r.date.epoch || r.date.hour) ? r.date : null;
    const ident = r.object || null; // {key, designation?}
    const datePrecision = (r.date || {}).precision || 'day';

    return {
      id: r.record_id,
      civ: (r.civilization || '').toLowerCase(),
      type: (r.phenomenon || 'solar').toLowerCase(),
      year: _eventYear(r.event_date),
      date: r.event_date,
      dateVerbatim: (r.date || {}).verbatim || '', // the source's own date wording, searchable
      ekey: r.event_key || '', // hand-verified "one phenomenon" link (see linkKey)
      place: placeName,
      lat: g.lat,
      lon: g.lon,
      orig: r.text_orig || '',
      cjk: _hasCJK(r.text_orig),
      translit,
      textMap,
      placeI18n,
      sref: se || null,
      srcKey: sk || '', // shown only when the key resolves to no sources.json entry
      srcUrl,
      locus,
      srcHay: srcHay + ' ' + locusHay,
      sig: r.significance || null,
      conf: r.confidence || null,
      claim: r.source_claim || null,
      vis: (VIS[r.record_id] || {}).bucket || null,
      notes,
      marks,
      supplied,
      // Searching a civ by ANY of its seven names. Filled here rather than back-filled
      // after load, so a deferred shard's records are as searchable as the boot ones.
      civHay: _civHay(r.civilization),
      // Search haystack for place names, the gazetteer's full 7-locale block plus historical
      // aliases. `modern` and `aliases` are nested per-locale objects, not plain strings, so
      // they need _flattenHay or they stringify to "[object Object]" instead of being searchable.
      placeHay: placeI18n ? _flattenHay(placeI18n).join(' ') : '',
      // Without this, translations would be unsearchable: a card renders one locale,
      // but a reader may well search in another.
      textHay: textMap ? Object.values(textMap).join(' ') : '',
      ident,
      datePrecision,
      lunarMonth: r.lunar_month ?? null,
      skyPos: r.sky_position || '', // occultation target, used by transientGlyph
      sep: r.separation || null, // {deg, uncertainty_deg, ruler}, see separationL1
      imp: 0,
    };
  }

  // ---- Filters ----

  // Search terms for a record's observation flags, resolved on demand since a head word is
  // whatever the reader's active locale says, and the locale can change under a running page.
  // Both the active locale and English go in; the memo is dropped whole on a locale change.
  let _statusHayMap = {};
  let _statusHayLang = '';

  function _statusHay(rec) {
    const slugs = [];
    if (rec.claim && rec.claim !== 'seen') slugs.push('claim_' + rec.claim);
    if (_SKY_GLOSS[rec.vis]) slugs.push(_SKY_GLOSS[rec.vis]);
    if (!slugs.length) return '';
    if (_statusHayLang !== state.lang) {
      _statusHayMap = {};
      _statusHayLang = state.lang;
    }
    const key = slugs.join('|');
    if (_statusHayMap[key] == null) {
      const words = [];
      slugs.forEach((s) => {
        words.push(_glossText(s + '.term'));
        if (typeof I18n !== 'undefined' && I18n.ten) words.push(I18n.ten('glossary.' + s + '.term'));
      });
      _statusHayMap[key] = words.join(' ');
    }
    return _statusHayMap[key];
  }

  // The event's type name as the ear prints it, so "Moon–Jiao appulse" or "Total solar
  // eclipse" finds its records. Memoised per record for the active locale.
  let _eclKindMap = null;
  let _eclKindLen = -1;

  function _typeHay(r) {
    const lang = state.lang;
    if (r._typeHay && r._typeHay.lang === lang) return r._typeHay.text;
    let text = '';
    if (r.type === 'solar' || r.type === 'lunar') {
      const all = window.EclipseLoader && EclipseLoader.all ? EclipseLoader.all() : [];
      if (_eclKindLen !== all.length) {
        _eclKindLen = all.length;
        _eclKindMap = new Map(all.map((e) => [e.date + '|' + e._kind, e]));
      }
      const e = _eclKindMap.get(r.date + '|' + r.type);
      const kindKey = e ? String(e.kind || '').toLowerCase() : '';
      if (kindKey) text = T('eclipse.type.' + r.type + '.' + kindKey);
      else return ''; // events may still be loading: leave the memo empty
    } else if (r.type === 'appulse' || r.type === 'conjunction') {
      if (sepTrusted(r.sep)) text = separationEvent(r.sep, lang);
    } else {
      text = transientL1(r, lang).replace(/<[^>]*>/g, ' ');
    }
    r._typeHay = { lang, text };
    return text;
  }

  // The forms a reader may type for a stored date: the stored Gregorian one and, before the 1582
  // reform, the Julian one every card shows ("-000762-06-07" is also -762-06-15). The year is a
  // STRING because matching it is a prefix test; parts a record lacks come back null.
  const _ymdMemo = new Map();

  function _ymdForms(iso) {
    let forms = _ymdMemo.get(iso);
    if (forms) return forms;
    const m = /^(-?\d+)(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(iso || '');
    forms = [];
    if (m) {
      const ystr = (y) => (y < 0 ? '-' : '') + Math.abs(y);
      const y = +m[1],
        mo = m[2] == null ? null : +m[2],
        d = m[3] == null ? null : +m[3];
      forms.push({ y: ystr(y), mo, d });
      if (mo != null) {
        const cal = _civilYmd({ y, m: mo, d: d || 1 }, d == null ? 2 : 3);
        if (cal.julian) forms.push({ y: ystr(cal.y), mo: cal.m, d: d == null ? null : cal.d });
      }
    }
    _ymdMemo.set(iso, forms);
    return forms;
  }

  // Every reading of one date token: ISO, 年月日 (year/month/day), slashed or dotted, YYYYMMDD,
  // day or month first before the year (05/06/1912 reads both ways), 月日 (month/day) with a null
  // year matching any year. BCE years arrive already signed from _bceToAstro. Null when not a date.
  function _parseDateQ(tok) {
    const md = /^(\d{1,2})月(\d{1,2})日?$/.exec(tok);
    if (md) return [{ y: null, mo: +md[1], d: +md[2] }];
    const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(tok);
    if (compact) return [{ y: compact[1].replace(/^0*/, '') || '0', mo: +compact[2], d: +compact[3] }];
    const s = tok
      .replace(/日/g, '')
      .replace(/[年月．./／]/g, '-')
      .replace(/-+$/, '');
    const yLast = /^(\d{1,2})-(\d{1,2})-(\d{3,4})$/.exec(s);
    if (yLast) {
      const y = yLast[3].replace(/^0*/, '') || '0',
        a = +yLast[1],
        b = +yLast[2];
      const alts = [];
      if (b >= 1 && b <= 12) alts.push({ y, mo: b, d: a });
      if (a >= 1 && a <= 12 && a !== b) alts.push({ y, mo: a, d: b });
      return alts.length ? alts : null;
    }
    const m = /^(-?)(\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(s);
    if (!m) return null;
    return [
      {
        y: m[1] + (m[2].replace(/^0*/, '') || '0'),
        mo: m[3] == null ? null : +m[3],
        d: m[4] == null ? null : +m[4],
      },
    ];
  }

  // Rank of the best reading in `alts` against a parsed date, or -1 if none fits. The year is a
  // prefix test, and the sign rides in the string, so "18" cannot reach -18. Month and day, once
  // typed, are exact: 3 月 (March) never matches month 30-39, nor a record dated only to the year.
  function _dateRank(forms, alts) {
    let best = -1;
    for (const ymd of forms) {
      for (const d of alts) {
        if (d.y != null && ymd.y.indexOf(d.y) !== 0) continue;
        if (d.mo != null && ymd.mo !== d.mo) continue;
        if (d.d != null && ymd.d !== d.d) continue;
        const r = d.y == null ? 0 : ymd.y.length - d.y.length;
        if (best < 0 || r < best) best = r;
      }
    }
    return best;
  }

  // Parsed once per query string and locale, since both lists match every row on each keystroke.
  // `dates` and `words` split the tokens for the events list; `toks` keeps each raw token beside
  // its date readings for the records list, which tries both.
  let _parsedFor = null,
    _parsedQ = null;

  // Month names a reader may type, long and short in all seven locales, plus the active card's
  // own abbreviations. Compared without accents or a trailing dot, so "fevr" finds "févr.".
  let _monthRe = null,
    _monthNum = null,
    _monthLang = '';

  const _foldMonth = (s) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\.$/, '')
      .toLowerCase();

  function _monthNames() {
    if (_monthLang === state.lang && _monthRe) return;
    _monthLang = state.lang;
    _monthNum = new Map();
    const add = (name, n) => {
      const k = _foldMonth(String(name || '').trim());
      if (k && !/\d/.test(k) && !_monthNum.has(k)) _monthNum.set(k, n);
    };
    for (let n = 1; n <= 12; n++) {
      add(T('julian.month.' + n), n);
      for (const loc of I18n.SUPPORTED) {
        for (const month of ['long', 'short']) {
          try {
            add(new Intl.DateTimeFormat(loc, { month, timeZone: 'UTC' }).format(Date.UTC(2000, n - 1, 15)), n);
          } catch (_) {
            // an unknown locale tag leaves only the names already added
          }
        }
      }
    }
    const alt = [..._monthNum.keys()]
      .sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    _monthRe = alt ? new RegExp('(^|\\s)(' + alt + ')\\.?(?=[\\s,]|$)', 'g') : null;
  }

  // "15 Jun 763 BCE", "April 17, 1912", "avril 1912" and "17 avril" become the numeric forms
  // _parseDateQ reads. Runs after _bceToAstro, so the year may carry its minus sign.
  function _monthsToNumeric(q) {
    _monthNames();
    if (!_monthRe) return q;
    const n = (name) => _monthNum.get(_foldMonth(name));
    const M = '#M(\\d+):[^#]*#';
    const marked = q.replace(_monthRe, (_, pre, name) => pre + '#M' + n(name) + ':' + name + '#');
    return marked
      .replace(new RegExp('(\\d{1,2})\\.?\\s+' + M + ',?\\s+(-?\\d+)', 'g'), (_, d, mo, y) => y + '-' + mo + '-' + d)
      .replace(new RegExp(M + '\\s+(\\d{1,2}),?\\s+(-?\\d+)', 'g'), (_, mo, d, y) => y + '-' + mo + '-' + d)
      .replace(new RegExp(M + '\\s+(-?\\d{3,})', 'g'), (_, mo, y) => y + '-' + mo)
      .replace(new RegExp('(\\d{1,2})\\.?\\s+' + M, 'g'), (_, d, mo) => mo + '月' + d + '日')
      .replace(/#M\d+:([^#]*)#/g, '$1');
  }

  // A BCE year in any locale's written form ("763 BCE", "763 AEC", 763 after 前 (before) or
  // 紀元前 (before the era)) becomes the astronomical year: 763 BCE → -762.
  function _bceToAstro(q) {
    const astro = (n) => '-' + (+n - 1);
    return q
      .replace(/(^|\s)(?:公元前|紀元前|前)\s*(\d+)/g, (_, pre, n) => pre + astro(n))
      .replace(
        /(^|\s)(\d+)\s*(?:b\.?\s*c\.?\s*(?:e\.?)?|a\.?\s*e\.?\s*[cv]\.?|av\.?\s*j\.?\s*-?\s*c\.?|a\.?\s*c\.?)(?=\s|$)/g,
        (_, pre, n) => pre + astro(n)
      );
  }

  function _parseQuery(q) {
    const key = state.lang + '\u0000' + q;
    if (key === _parsedFor) return _parsedQ;
    const dates = [],
      words = [],
      toks = [];

    // The CJK cards space every seam between a digit and 年 (year), 月 (month) or 日 (day);
    // closing those seams keeps a date copied off a card in one token.
    const norm = q
      .toLowerCase()
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[－−]/g, '-')
      .replace(/\s*([年月日])\s*/g, '$1')
      .trim();
    for (const tok of _monthsToNumeric(_bceToAstro(norm)).split(/[\s,，、]+/)) {
      if (!tok) continue;
      const d = _parseDateQ(tok);
      if (d) dates.push(d);
      else words.push(tok);
      toks.push({ raw: tok, date: d });
    }
    _parsedFor = key;
    _parsedQ = { dates, words, toks };
    return _parsedQ;
  }

  // Every token must be found as text in the record or, if it reads as a date, as its event_date.
  // The text route keeps a date-shaped token that means something else, such as a page number or
  // the YYYYMMDD inside a record id, findable.
  function _recMatchQ(r, parsed) {
    if (!parsed.toks.length) return true;
    const hay = [
      r.id,
      r.place,
      r.placeHay,
      r.srcHay,
      r.orig,
      r.textHay,
      shownHay(r),
      r.translit,
      noteHay(r),
      r.civHay,
      r.dateVerbatim,
      _statusHay(r),
      _typeHay(r),
    ]
      .join(' ')
      .toLowerCase();
    for (const t of parsed.toks) {
      if (hay.includes(t.raw)) continue;
      if (!t.date || _dateRank(_ymdForms(r.date), t.date) < 0) return false;
    }
    return true;
  }

  function passFilters(r) {
    return (
      (state.civ == null || r.civ === state.civ) && r.type === state.type && _recMatchQ(r, _parseQuery(state.q.trim()))
    );
  }

  const inRange = (r) => r.year >= state.range[0] && r.year <= state.range[1];
  const timelineRecords = () => RECS.filter(passFilters); // lizhou: full density, never budgeted
  const visibleRecords = () => RECS.filter((r) => passFilters(r) && inRange(r));

  // ---- Dynamic LOD Selection For The Map Layer ----

  // Rank sites in a world-anchored grid, then clip the survivors to the padded viewport:
  // selection first, clipping second, never the other way round. `margin` is a fraction of
  // the view's own span per side; the caller picks VIEW_MARGIN or EVICT_MARGIN.
  function inViewport(map, r, margin) {
    const b = map.getBounds();
    const m = margin == null ? VIEW_MARGIN : margin;
    const latPad = (b.getNorth() - b.getSouth()) * m;
    const lngPad = (b.getEast() - b.getWest()) * m;
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

  // Longitude offsets at which one record must be drawn: the 720°-wide map window means
  // inViewport above can admit a record whose only visible copy is a wrapped one. Restricted
  // to the padded viewport so extra copies are built only while actually on screen.
  function wrapOffsetsFor(lon) {
    const offs = GeoUtils.wrapOffsets(lon, lon);
    if (!map) return offs;
    const b = map.getBounds();
    const lngPad = (b.getEast() - b.getWest()) * VIEW_MARGIN;
    const w = b.getWest() - lngPad,
      e = b.getEast() + lngPad;
    const vis = offs.filter((dx) => lon + dx >= w && lon + dx <= e);
    return vis.length ? vis : offs.slice(0, 1);
  }

  // The one world copy a record's marker "is" right now: the copy nearest the view centre.
  // Every consumer naming a single longitude for a record must go through here, or a click
  // on the +360 copy answers a world away from the gesture.
  function nearestDx(lon, offs, ref) {
    const list = offs || wrapOffsetsFor(lon);
    if (!map) return list[0] || 0;
    const c = ref == null ? map.getCenter().lng : ref;
    return list.reduce((best, dx) => (Math.abs(lon + dx - c) < Math.abs(lon + best - c) ? dx : best), list[0] || 0);
  }

  // ref: a longitude the answer must stay beside — the clicked marker's own lng
  // when there is one (a fan member sits a few pixels off its site, never a world
  // off), otherwise the view centre.
  function nearestLon(lon, ref) {
    return lon + nearestDx(lon, GeoUtils.wrapOffsets(lon, lon), ref);
  }

  // The sites this zoom is allowed to draw, world-wide. Bin by world pixels (map.project at
  // an explicit zoom), never container pixels: a container-pixel grid re-phases on every pan,
  // so half a cell of drag would swap each cell's representative under the reader.
  function lodSites(all, map) {
    const z = map.getZoom();

    // A narrow time window earns +1 site per cell: the reader has already said which two
    // centuries they care about, so the map can afford more detail.
    const k = LOD_K(z) + (state.range[1] - state.range[0] <= 200 ? 1 : 0);
    const keep = [];
    const cells = new Map();
    all.forEach((s) => {
      // Landmark sites bypass the grid entirely rather than winning a slot in it,
      // so a landmark never costs its cell the representative it would otherwise show.
      if (s.sig === 'landmark') {
        keep.push(s);
        return;
      }
      const p = map.project([s.lat, s.lon], z);
      const key = Math.floor(p.x / CELL) + '|' + Math.floor(p.y / CELL);
      let arr = cells.get(key);
      if (!arr) {
        arr = [];
        cells.set(key, arr);
      }
      arr.push(s);
    });
    cells.forEach((arr) => {
      arr.sort((a, b) => b.w - a.w);
      for (let i = 0; i < arr.length && i < k; i++) keep.push(arr[i]);
    });
    return keep;
  }

  // Every civilization on screen keeps at least one seal, however lightly attested: the grid
  // ranks sites, so a tradition holding one thin site in a cell full of capitals would drop
  // off the map. Rescue restores the civ's own highest-ranked site in view and only ever adds.
  function rescueCivs(all, admitted, map) {
    const shown = new Set(admitted.map((s) => s.top.civ));
    const best = new Map();
    all.forEach((s) => {
      const civ = s.top.civ;
      if (shown.has(civ) || !inViewport(map, s, VIEW_MARGIN)) return;
      const cur = best.get(civ);
      if (!cur || s.w > cur.w) best.set(civ, s);
    });
    return [...best.values()];
  }

  // ---- Site Stacks: One Marker Per Coordinate ----

  // Seals sharing one point are mutually unreachable on the map. A stack shows its top seal
  // plus a count badge; clicking fans the members out (spiderfy) with year labels.
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

      // w ranks the site against its cell neighbours; imp stays the record-level
      // score that markerZ() stacks by. Keep them separate: folding depth into imp
      // would push deep capitals above everything else in the paint order too.
      s.w = s.imp + depthW(s.recs.length);
    });
    return [...sites.values()];
  }

  let _sitesMemo = { sig: null, sites: [] };

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

    // Group the whole filtered corpus, not just what is on screen, and memoise it on the
    // filter signature since a pan changes neither. state.lang belongs in the signature
    // because a query also matches the observation flags' head words in the active locale.
    const sig = [
      state.selEv,
      state.sel,
      state.civ,
      state.type,
      state.q,
      state.lang,
      state.range[0],
      state.range[1],
      RECS.length,
    ].join('|');
    if (_sitesMemo.sig !== sig) _sitesMemo = { sig, sites: groupBySite(base) };
    let keep = map ? lodSites(_sitesMemo.sites, map) : _sitesMemo.sites;

    // Always keep the selected record's stack alive so a list-click can open
    // its popup even when LOD/viewport would otherwise thin it out.
    if (state.sel && !keep.some((s) => s.recs.some((r) => r.id === state.sel))) {
      const sel = RECS.find((r) => r.id === state.sel);
      if (sel && withGeo(sel)) {
        const own = base.filter((r) => siteKey(r) === siteKey(sel));
        keep = keep.concat(groupBySite(own.length ? own : [sel]));
      }
    }

    // `keep` is what this zoom may draw anywhere; `admit` is what it draws now, viewport-
    // filtered. drawMarkers needs both: a marker outside admit but still inside keep is
    // off-screen, not gone, and is retained rather than rebuilt when the reader pans back.
    if (!map) return { keep, admit: keep };
    const admit = keep.filter((s) => inViewport(map, s, VIEW_MARGIN));
    const rescued = rescueCivs(_sitesMemo.sites, admit, map);

    // Rescued sites join keep as well as admit, or the ledger would read them as
    // strangers and rebuild their markers on the next pan instead of retaining them.
    return rescued.length ? { keep: keep.concat(rescued), admit: admit.concat(rescued) } : { keep, admit };
  }

  // ---- Map markers ----

  const POPUP_OPTS = { className: 'records-popup', closeButton: true, maxWidth: 300, autoPan: false };

  // The rail's open/closed state is a per-viewer layout preference kept in localStorage.
  const RAIL_KEY = 'fme.rail';
  function railOpen() {
    const lib = document.getElementById('library');
    return !!lib && !lib.classList.contains('hidden');
  }

  function popupHtml(rec) {
    const head =
      '<div class="rp-head">' +
      Seal.svg(rec.civ, 16, Seal.name(rec.civ, state.lang, rec.year)) +
      '<span class="rp-place">' +
      placeLabel(rec, state.lang) +
      noteMark(rec, state.lang, 'place') +
      '</span>' +
      '<span' +
      eraAttrs(rec, 'rp-year') +
      '>' +
      yearLabel(state.lang, rec.year) +
      noteMark(rec, state.lang, 'year') +
      '</span></div>';
    return (
      '<div class="rp">' +
      head +
      transLine(rec, state.lang, 'rp-trans') +
      '<div class="rp-orig ' +
      (rec.cjk ? '' : 'multi') +
      '">' +
      origHtml(rec, state.lang) +
      '</div>' +
      '<div class="rp-src">' +
      sourceLabel(rec, state.lang) +
      noteMark(rec, state.lang, 'source') +
      '</div>' +
      noteList(rec, state.lang, 'rp-note') +
      '</div>'
    );
  }

  // Open (or refresh) a record's marker popup and remember which record it belongs to, so
  // drawMarkers()'s teardown can reopen it afterwards. markerById[id] may point at a shared
  // stack marker with no static popup of its own, so set this record's content at open time.
  let _popupRecId = null; // id of the record whose marker popup is currently open
  function openRecPopup(id) {
    const rec = RECS.find((r) => r.id === id);
    if (!rec) return;
    const m = markerById[id];
    if (!m) return;
    if (m.getPopup()) m.setPopupContent(popupHtml(rec));
    else m.bindPopup(popupHtml(rec), POPUP_OPTS);

    // The marker's own click handler opens the popup; drop Leaflet's bound-popup click
    // toggle, which would otherwise close it again in the same click.
    m.off('click', m._openPopup, m);
    m.openPopup();
    _popupRecId = id;
  }

  // The shu'er and its ruled slat float above every popup; pan the map down just far enough
  // to clear a popup that runs under either one, never so far the marker leaves the map.
  // Called once after a rail toggle settles, never on every moveend or a deliberate pan reverts.
  function clearEarForPopup() {
    const m = _popupRecId && markerById[_popupRecId];
    const pop = m && m.getPopup();
    const el = map && pop && pop.isOpen() && pop.getElement();
    if (!el) return;
    const box = el.getBoundingClientRect();
    let bottom = -Infinity;
    for (const id of ['ev-strip', 'ev-scrub']) {
      const o = document.getElementById(id);
      if (!o || !o.offsetHeight) continue;
      const r = o.getBoundingClientRect();
      if (r.right > box.left && r.left < box.right) bottom = Math.max(bottom, r.bottom);
    }
    const need = bottom + 8 - box.top;
    if (!(need > 0)) return;
    const room = map.getSize().y - 24 - map.latLngToContainerPoint(m.getLatLng()).y;
    const dy = Math.min(need, room);
    if (dy > 0) map.panBy([0, -dy]);
  }

  // The map centre that frames a record popup in one move: the marker lands at the centre
  // unless the popup above it would run under the ear, in which case it sits low enough for
  // the popup to clear it. Measured from the open popup, so the fly needs no correction after.
  function popupFrameCenter(latlng, zoom, el, markerPt) {
    const box = el.getBoundingClientRect();
    const mapBox = map.getContainer().getBoundingClientRect();
    const lift = markerPt.y - (box.top - mapBox.top);
    const size = map.getSize();
    const left = mapBox.left + size.x / 2 - (markerPt.x - (box.left - mapBox.left));
    const right = left + box.width;
    let bottom = -Infinity;
    for (const id of ['ev-strip', 'ev-scrub']) {
      const o = document.getElementById(id);
      if (!o || !o.offsetHeight) continue;
      const r = o.getBoundingClientRect();
      if (r.right > left && r.left < right) bottom = Math.max(bottom, r.bottom - mapBox.top);
    }
    const y = Math.min(Math.max(size.y / 2, bottom + 8 + lift), size.y - 24);
    const pt = map.project(latlng, zoom).subtract([0, y - size.y / 2]);
    return map.unproject(pt, zoom);
  }

  // Once the map cell has been resized, reframe the open record popup clear of the ear.
  function reopenRecPopup() {
    if (!_popupRecId) return;
    openRecPopup(_popupRecId);
    clearEarForPopup();
  }

  // ---- Marker Stacking Order ----

  // Leaflet stacks markers by latitude alone, so every record marker instead names its own
  // band, 100k apart: observer > hovered > selected > open fan > stack > lone record. Inside
  // a band the order is importance (imp) first, then older over younger.
  const Z = { site: 0, stack: 100000, fan: 300000, sel: 500000, hover: 800000, observer: 900000 };

  // Age bonus, coarse on purpose: it only ever breaks ties between records of
  // equal importance, so four eras are enough resolution.
  function ageZ(year) {
    return year < 0 ? 3 : year < 1000 ? 2 : year < 1800 ? 1 : 0;
  }

  // markerZ: imp is multiplied so the age bonus lands strictly below it — an
  // importance step must always outrank an era step.
  function markerZ(band, rec, imp) {
    return band + Math.round(Math.min(imp || 0, 2000)) * 4 + ageZ(rec ? rec.year : 0);
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

  // ---- Spiderfy (Self-Implemented) ----

  // ≤8 members fan on a circle, more on an Archimedean spiral, capped at SPIDER_MAX; a
  // deeper stack fans its most important members and leaves the rest reachable through the
  // record list. Rebuilt on every drawMarkers pass so zoom/filter/selection keep it live.
  const SPIDER_MAX = 24;
  let spider = null; // { key, dx, layer } — at most one site fanned at a time
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

  // dx: the world-copy offset of the stack marker that was clicked. A fan drawn
  // at the record's true lon while the reader clicked its +360 copy would open a
  // screen away from the gesture.
  function spiderfy(stack, dx) {
    unspiderfy();
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const center = L.latLng(stack.lat, stack.lon + (dx || 0));

    // keep the most important members, but LAY OUT chronologically — the fan
    // then reads as a clock of eras around the site.
    const shown = stack.recs
      .slice(0, SPIDER_MAX)
      .slice()
      .sort((a, b) => a.year - b.year);
    spider = { key: stack.key, dx: dx || 0, layer, center, sig: spiderSig(shown), legs: [] };
    const ink = cssvar('--ink-3') || '#8B8F8C';
    spiderLegPoints(center, shown.length).forEach((ll, i) => {
      const r = shown[i];
      const line = L.polyline([center, ll], {
        color: ink,
        weight: 1,
        dashArray: '2 3',
        opacity: 0.8,
        interactive: false,
      }).addTo(layer);
      const m = L.marker(ll, {
        icon: spiderIcon(r, state.sel === r.id),
        riseOnHover: true,
        riseOffset: Z.hover,
        zIndexOffset: markerZ(state.sel === r.id ? Z.sel : Z.fan, r, r.imp),
      });
      m.bindTooltip(placeLabel(r, state.lang), { sticky: true, className: 'eclipse-curve-tooltip', offset: [0, -8] });
      m._spiderSel = state.sel === r.id;
      m.bindPopup(popupHtml(r), POPUP_OPTS);
      m.on('click', () => select(r.id));
      layer.addLayer(m);
      markerById[r.id] = m; // select() opens popups on the fanned marker
      spider.legs.push({ r, m, line });
    });
  }

  // The legs' tooltips and popups are baked in the interface language, so a language
  // switch counts as a change of fan and rebuilds it.
  function spiderSig(shown) {
    return shown.map((r) => r.id).join('|') + '|' + state.lang;
  }

  // Leg tips sit at fixed pixel offsets around the site, so their map positions
  // depend on the zoom they are laid out at.
  function spiderLegPoints(center, n) {
    const c = map.latLngToContainerPoint(center);
    return spiderOffsets(n).map(([x, y]) => map.containerPointToLatLng(L.point(c.x + x, c.y + y)));
  }

  // Rebuild against the stacks this pass actually drew, not a re-filtered RECS: the record
  // base can be re-based onto an event's own records, and LOD thinning can drop a stack the
  // filters would keep. A fan is a child of its stack marker and goes with it if gone.
  function respiderfy(stacks) {
    if (!spider || !map) return;
    const stack = stacks.find((s) => s.key === spider.key);
    if (!stack || stack.recs.length < 2) {
      unspiderfy();
      return;
    }
    const shown = stack.recs
      .slice(0, SPIDER_MAX)
      .slice()
      .sort((a, b) => a.year - b.year);
    if (spiderSig(shown) !== spider.sig) {
      spiderfy(stack, spider.dx);
      return;
    }

    // Same members: move and restyle the existing legs in place. Rebuilding them
    // would close the popup open on a leg and reopen it on a new marker, which the
    // reader sees as a flicker at the end of every fly or zoom.
    spiderLegPoints(spider.center, spider.legs.length).forEach((ll, i) => {
      const { r, m, line } = spider.legs[i];
      m.setLatLng(ll);
      line.setLatLngs([spider.center, ll]);
      const sel = state.sel === r.id;
      if (m._spiderSel !== sel) {
        m._spiderSel = sel;
        m.setIcon(spiderIcon(r, sel));
        m.setZIndexOffset(markerZ(sel ? Z.sel : Z.fan, r, r.imp));
      }
      markerById[r.id] = m;
    });
  }

  // ---- Incremental Marker Ledger ----

  // Keyed "siteKey@dx", one entry per site per drawn world copy. A pass reconciles this
  // ledger against the LOD verdict instead of tearing the layer down: a seal the reader can
  // already see keeps its DOM node, popup and fan, and only genuine arrivals/departures animate.
  let _drawn = new Map();

  // Everything about an entry that the icon, tooltip, popup and paint order read.
  // Rebuild those only when this string changes — setIcon() replaces the element,
  // which would restart a fade and drop the band-hover class mid-hover.
  function markerSig(stack, top, selRec) {
    return [top.civ, stack.recs.length, selRec ? 1 : 0, top.id, state.lang].join('|');
  }

  // data-site survives every setIcon, and is the handle the pan/zoom invariants are
  // checked through: it names the site and world copy, not a DOM position.
  function stampMarker(entry) {
    const el = entry.m.getElement && entry.m.getElement();
    if (!el) return;
    el.dataset.site = entry.key;
    el.classList.remove('mk-out');
  }

  function fadeIn(entry) {
    const el = entry.m.getElement && entry.m.getElement();
    if (!el) return;
    el.classList.add('mk-in');
    requestAnimationFrame(() => el.classList.remove('mk-in'));
  }

  // Departure is deferred by FADE_MS so the seal dissolves instead of blinking out. A marker
  // re-admitted during that window cancels the timer and keeps its node, the whole point of
  // the evict box: an overshooting pan must not pay to rebuild every seal it crossed.
  function fadeOut(entry) {
    if (entry.fade) return;
    const el = entry.m.getElement && entry.m.getElement();
    if (el) el.classList.add('mk-out');
    entry.fade = setTimeout(() => {
      markerLayer.removeLayer(entry.m);
      _drawn.delete(entry.key);
    }, FADE_MS);
  }

  function cancelFade(entry) {
    if (!entry.fade) return;
    clearTimeout(entry.fade);
    entry.fade = null;
    const el = entry.m.getElement && entry.m.getElement();
    if (el) el.classList.remove('mk-out');
  }

  // One marker, bound once. Both handlers read entry.stack rather than closing over
  // the stack object, so a later pass can repoint the entry at a fresh stack without
  // detaching and re-attaching listeners on every pan.
  function makeMarker(entry) {
    const m = L.marker([entry.stack.lat, entry.stack.lon + entry.dx], { riseOnHover: true, riseOffset: Z.hover });
    entry.m = m;
    m.on('click', () => {
      const st = entry.stack;
      st.recs.forEach((r) => (markerById[r.id] = m));
      if (st.recs.length > 1) {
        if (m.closePopup) m.closePopup();
        if (spider && spider.key === st.key) unspiderfy();
        else spiderfy(st, entry.dx);
      } else {
        select(st.top.id);
      }
    });
    return entry;
  }

  // Repaint an entry to match its stack's current state — icon, tooltip, paint band,
  // and whether it carries a popup of its own (a multi-record stack does not: its
  // click opens the fan instead).
  function dressMarker(entry) {
    const stack = entry.stack;
    const selRec = state.sel ? stack.recs.find((r) => r.id === state.sel) : null;
    const top = selRec || stack.top;
    const sig = markerSig(stack, top, selRec);
    if (entry.sig === sig) return;
    entry.sig = sig;
    const multi = stack.recs.length > 1;
    entry.m.setIcon(stackIcon(top.civ, stack.recs.length, !!selRec));
    entry.m.setZIndexOffset(markerZ(selRec ? Z.sel : multi ? Z.stack : Z.site, top, stack.imp));
    entry.m.unbindTooltip();
    entry.m.bindTooltip(placeLabel(top, state.lang), {
      sticky: true,
      className: 'eclipse-curve-tooltip',
      offset: [0, -8],
    });
    if (multi) entry.m.unbindPopup();
    else entry.m.bindPopup(popupHtml(top), POPUP_OPTS);
    stampMarker(entry); // setIcon built a new element — re-stamp it
  }

  function drawMarkers() {
    if (!markerLayer) return;

    // A marker whose popup this pass rebuilds fires popupclose, which nulls the
    // module-level _popupRecId; capture it first and reopen afterwards.
    const reopen = _popupRecId;
    markerById = {};
    const { keep, admit } = selectForView();
    const keepByKey = new Map(keep.map((s) => [s.key, s]));
    const want = new Set();
    admit.forEach((stack) => {
      // One seal per visible world copy. A rebuild resets which copy markerById points at,
      // so the default claim goes to the copy nearest the view centre, never whichever copy
      // happened to be built first (which would reopen the popup a world away).
      const offs = wrapOffsetsFor(stack.lon);
      const home = nearestDx(stack.lon, offs);
      offs.forEach((dx) => {
        const key = stack.key + '@' + dx;
        want.add(key);
        let entry = _drawn.get(key);
        const fresh = !entry;
        if (entry) cancelFade(entry);
        else entry = makeMarker({ key, stack, dx, sig: null, fade: null });
        entry.stack = stack;

        // Dress BEFORE the layer add on a fresh marker, or Leaflet's default pin
        // flashes for a frame in place of the seal.
        dressMarker(entry);
        if (fresh) {
          markerLayer.addLayer(entry.m);
          _drawn.set(key, entry);
          stampMarker(entry);
          fadeIn(entry);
        }
        if (dx === home) stack.recs.forEach((r) => (markerById[r.id] = entry.m));
      });
    });

    // Retain, don't rebuild: an entry this zoom still allows and that has not left the evict
    // box is merely off-screen. Anything else fades and goes.
    _drawn.forEach((entry) => {
      if (want.has(entry.key)) return;
      const live = keepByKey.get(entry.stack.key);
      const held = live && map && inViewport(map, entry.stack, EVICT_MARGIN);
      if (held && !entry.fade) {
        entry.stack = live;
        return;
      }
      if (entry.m.isPopupOpen && entry.m.isPopupOpen()) return; // never yank an open card
      fadeOut(entry);
    });

    // Off-screen retained markers answer for their records too, but only where an
    // on-screen copy has not already claimed them.
    _drawn.forEach((entry) => {
      if (entry.fade) return;
      entry.stack.recs.forEach((r) => {
        if (!markerById[r.id]) markerById[r.id] = entry.m;
      });
    });

    // rebuild an active fan against the fresh markers/zoom/filters
    respiderfy(admit);

    // Reopen the record popup a repaint closed, after respiderfy so a fanned marker exists in
    // markerById; if LOD dropped it, no reopen happens, which is correct. A popup this pass
    // left open is not rewritten, since resetting its content would reflow it on screen.
    if (reopen && markerById[reopen] && !markerById[reopen].isPopupOpen()) openRecPopup(reopen);

    // Permalink sync chokepoint: drawMarkers runs after nearly every state
    // change (civ/type/q filters, record/event select+clear, map move/zoom), so
    // one touch() here keeps the shareable URL current for all of them.
    if (window.Permalink) Permalink.touch();

    // Selecting or clearing an event switches WHICH clock downstream readers follow
    // (the event's instant vs. the needle's year), and a clear moves neither the
    // needle nor TimeState — so the same chokepoint has to announce it.
    _notifyFocus();
  }

  // ---- Click-A-Point Local Observation Popup ----

  // While an event is selected, a background map click asks ObservePanel what an observer at
  // that point would witness, anchored by a lightweight observer marker, cleared on deselect.
  let _obsMarker = null;

  // Leaflet clamps popup content to [minWidth, maxWidth], so these straddle the observe
  // card's own widths in css/app.css: the ceiling clear of the widest figure-bearing card, the
  // floor under the figure-less not-visible card; a lower ceiling would squeeze content back down.
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
      _obsMarker = L.marker(latlng, {
        icon: observerIcon(),
        interactive: true,
        zIndexOffset: Z.observer,
        keyboard: false,
      });
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

  // The observed point, for Permalink; null unless the card is actually open, so a dismissed
  // card drops out of the URL. Reports the marker's own world-copy longitude, not the ±180
  // wrap showObservation derives for geometry, so a restore lands in the same copy.
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

  // While an event is selected, split the rail into .dimmed/.linked cards (by link group for
  // records, by evcard date/kind for all-events): setEventHighlight's .hl only survives while
  // the pointer is on a card, so sibling records need this to stay marked once the pointer moves.
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

  // ---- Timeline: Plateau Lens ----

  const tl = () => document.getElementById('tlsvg');

  // A plain Sarkar–Brown fisheye cannot magnify enough here to tell adjacent years apart, so
  // the lens adds a locally-uniform plateau around the focus (PPY px/year across ±W_YR years)
  // with a fisheye flank whose slope stays continuous at the edge, keeping yearFromX(tlX(y)) exact.
  const PPY = 6; // plateau resolution, px per year
  const W_YR = 12; // plateau half-width, years
  const TICK_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500]; // fine-tick step tiers, coarsest last
  const MIN_GAP = 28; // px — legibility floor between adjacent fine-tick labels
  const fxSB = (u, d) => ((d + 1) * u) / (d * u + 1); // Sarkar–Brown response
  const invFxSB = (v, d) => v / (d + 1 - v * d);

  // Per-frame lens parameters, memoised by (focus, innerH). Arms shrink near the domain edges
  // so each flank keeps ≥20% of its side's pixel budget, which keeps dL/dR ≥ 0 (needs s ≥ 1,
  // hence the clamp) and the mapping invertible everywhere.
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

  // Layout: one merged full-height band, not a stack of strips. Top-register text shares one
  // row above the band, collision-guarded by measured width. Event seals fan upward from
  // dotY; dividerY marks the seal/dynasty-name boundary within the same band.
  let tlW = 800;
  const padL = 16,
    padR = 16,
    focusYearY = 14, // focus-year label baseline, gap above the fish-tail
    regY = 21, // tick-label baseline (range yrs, millennium, fine)
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

  // ---- Cached Canvas Text Measurement ----

  // Hit path is a bare-object property read; 60fps drag pays zero measureText after warmup.
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

  // Canvas measurement fonts must match the .tl-* classes exactly or label-collision layout
  // drifts from what renders, so sizes are read from the same tokens the CSS subscribes to
  // rather than restated: a restated literal cannot be enforced against retuning the type scale.
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

    // Exactly one computed-style read per frame, and every frame: reading it each
    // frame is the skin-follow contract, but the whole palette comes out of a single
    // parse rather than one per token.
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

    // Tick-label register: CE ticks stay bare numerals, BCE ticks carry the locale's era
    // marker — a bare negative or a hard-coded Latin suffix would leak into CJK locales.
    const bceTxt = (y) => (y <= 0 ? T('atlas.year.bce', { n: 1 - y }) : String(y));

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
      millCands.push({ x: xx, text: bceTxt(y) });
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

    // 6 · fine plateau ticks hang from the band top. Walk outward from the focus, escalating
    // to a coarser TICK_STEPS tier whenever a step's real pixel span (via tlX, never a flat
    // px/yr guess) would crowd the next tick closer than MIN_GAP.
    const yF = Y0 + state.focusN * SPAN;
    const walkFine = (dir) => {
      const ys = [];
      let y = yF,
        stepIdx = 0;
      for (;;) {
        // Probe from the current walk position, never the next grid line: that would let the
        // arbitrary phase offset between yF and the grid over-escalate right near the focus.
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

    // 10 · top register: interval-ledger label pass, strict priority (range labels never
    // dropped → yuwei reserves → millennium → fine ticks). Spacing swells from G_MIN to G_MAX
    // across the flanks as a nearest-anchor function of the domain edges and the focus.
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

    // A candidate fits only if it neither overlaps a placed label's box (GAP floor) nor sits
    // closer than gapAt(cx) from its centre. Never-dropped labels skip this test but still
    // carry a .cx so others yield around them.
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

      // Same edge clamp as loA/hiA: a midpoint-anchored label near either strip edge
      // spills off-canvas, so pivot it to start/end anchoring there.
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

    // Focus-year seal in the tick-label register (bceTxt: bare numeral for CE, no "CE" prefix
    // as displayYear would add), pinned at fx above the yuwei. Never dropped, edge-clamped
    // like the range labels.
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

  // nianhaoYear/cjkOrdinal serve the event-card year label; nothing on the timeline
  // side calls them.
  let raf = null,
    dragging = null;
  let _byYear = {}; // year → records index, rebuilt by drawTimeline
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
    _notifyFocus();
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

  // Never run the heavy refresh (full list rebuild + Leaflet marker churn) per pointermove
  // during a range drag. Debounced so the drag stays smooth; a final sync fires on
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

  // Pointer Events with pointer capture, so a drag keeps tracking even when the cursor leaves
  // the SVG. The lens only recenters while the empty band is dragged or a dot is selected;
  // grabbing a range handle leaves the axis frozen. Plain hover never moves focusN.
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
        // Aim-the-lens drag: focus follows the finger but is clamped to [lo, hi] in
        // normalised-year space so the needle never visually crosses a range handle, since
        // lens(f,f,iw)=f means needle and handle share the exact same pixel there.
        const rawN = Math.max(0, Math.min(1, (mx - padL) / (tlW - padL - padR)));
        setFocusTarget(Math.max(normYear(state.range[0]), Math.min(normYear(state.range[1]), rawN)));
        return;
      }
      if (dragging) {
        // Axis-frozen handle drag: focus stays put so the axis never warps while a range
        // boundary moves. Each handle stops when within HIT*2 px of the other, and the range
        // is not updated when blocked. No setFocusTarget here: the lens is aimed separately.
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

  // ---- Library: Facets And Translation-First Cards ----

  // Single-select civ filter as a one-line scrollable chip row: a leading "All" chip then one
  // per present civ. Picking a civ sets state.civ to its key; "All" clears it back to null.
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

  // ---- Shared List Pager ----

  // The current mode's full sorted array; only a [winStart,winEnd) slice renders.
  const recsSorted = () =>
    visibleRecords().sort((a, b) => a.year - b.year || (a.date || '').localeCompare(b.date || ''));
  const currentArray = () => (state.mode === 'events' ? evAll() : recsSorted());
  const yearOf = (item) => (state.mode === 'events' ? _eventYear(item.date) : item.year);

  // Seed key = the filter fingerprint that defines the array. Any change re-seeds the window
  // centered on the focus; an unchanged key preserves it so load-more/wheel paging survives a
  // re-render. Includes the mode prefix, so toggling records↔all-events always re-seeds.
  function seedKeyNow() {
    return state.mode === 'events'
      ? 'ev|' + state.type + '|' + state.q
      : 'rec|' + state.type + '|' + state.civ + '|' + state.q + '|' + state.range.join(',');
  }

  function seedWindow(arr) {
    const len = arr.length,
      key = seedKeyNow();

    // A window seeded against an empty array is 0..0 and caches the same key the filled array
    // produces, so it must be invalidated the moment the array fills, e.g. when a shard streams
    // in behind first paint; safe since the cached window holds no card a reader could be viewing.
    if (winStart === winEnd && len) winSeedKey = null;
    if (winSeedKey !== key) {
      // Snap exactly to the current selection when there is one, so switching records↔events
      // with a record already selected lands on its exact card, not "nearby by year"; this is
      // what centers the other mode's window without fighting over the same winStart/winEnd.
      let cur = -1;
      if (state.mode === 'events' && state.selEv) {
        cur = arr.findIndex((e) => evKey(e.date, e._kind) === state.selEv);
      } else if (state.mode === 'records' && state.sel) {
        cur = arr.findIndex((r) => r.id === state.sel);
      }

      // A rank-ordered all-events result is a hit list, not a stretch of the timeline: open it
      // at the top. Scanning for the focus year would be meaningless on a non-chronological array.
      if (cur < 0 && state.mode === 'events' && evQueryRanked) cur = 0;
      if (cur < 0) {
        const fy = Y0 + state.focusN * SPAN;
        cur = 0;
        while (cur < len && yearOf(arr[cur]) < fy) cur++; // first item ≥ focus year
      }
      winStart = Math.max(0, cur - INITIAL_BEFORE);
      winEnd = Math.min(len, cur + INITIAL_AFTER);
      winSeedKey = key;

      // Park the render on the focus row rather than on the window's first row:
      // the earlier half is context to scroll back into, not the opening view.
      winFocusRow = cur - winStart;
    } else {
      winEnd = Math.min(winEnd, len);
      winStart = Math.min(winStart, winEnd); // clamp a stale window
    }
  }

  // Load-earlier prepends (list grows upward) → restore scrollTop by the height
  // delta or the viewport jumps. Load-later appends — no fixup. Both trim the far
  // edge to hold the window at MAX_WINDOW.
  function pageEarlier() {
    if (winStart <= 0) return;
    const list = document.getElementById('list');
    const h0 = list ? list.scrollHeight : 0;
    winStart = Math.max(0, winStart - PAGE_SIZE);
    if (winEnd - winStart > MAX_WINDOW) winEnd = winStart + MAX_WINDOW;
    renderList();
    if (list) list.scrollTop += list.scrollHeight - h0;

    // renderList already drew the bands, but it measured the rail before this
    // scrollTop restore — redraw against the position the reader ends up at.
    drawBands();
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

  // Wheel-to-edge auto-load: keep-scrolling intent at a list boundary pages the window and
  // flashes the chevron. 'wheel', not 'scroll', because scroll stops firing at the boundary
  // while wheel keeps firing. One listener on the persistent #list survives every rebuild.
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

  // Consume a pending focus row: scroll #list so the seeded card tops the view.
  // Called after appendChild — an unattached row measures 0 — and it clears the
  // request, so wheel paging and load-more re-renders never yank the reader back.
  function applyFocusScroll(list) {
    const row = winFocusRow;
    winFocusRow = -1;
    if (row <= 0) return;

    // Two rows of lead-in above the focus card, not zero: a list that opens flush
    // on its target reads as the beginning of the corpus, hiding the fact that
    // earlier records exist and that scrolling up reaches them.
    const card = list.children[Math.max(0, row - FOCUS_LEAD_IN)];
    if (card) list.scrollTop = card.offsetTop - list.clientTop;
  }

  function renderList() {
    // all-events mode owns #list too — branch here so every renderList() caller
    // (renderAll, type toggle, heavyRefresh, search, locale change) routes right.
    if (state.mode === 'events') return renderEventList();
    const list = document.getElementById('list');
    if (!list) return;
    list.innerHTML = '';

    // Chronological (oldest→newest), same-year ties by ISO date, matching the lizhou's
    // left-old→right-new reading. Windowed to a page centered on the focus.
    const recs = recsSorted();
    seedWindow(recs);
    updateReccount();

    // Empty shelf (a type not yet collected, or filters/search matching nothing):
    // a quiet centered note rather than a blank leaf. Loop below no-ops.
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
        Seal.svg(rec.civ, 18, Seal.name(rec.civ, state.lang, rec.year)) +
        '<span class="rc-place">' +
        placeLabel(rec, state.lang) +
        noteMark(rec, state.lang, 'place') +
        '</span>' +
        '<span' +
        eraAttrs(rec, 'rc-year') +
        '>' +
        yearLabel(state.lang, rec.year) +
        noteMark(rec, state.lang, 'year') +
        '</span></div>' +
        trans +
        '<div class="rc-orig ' +
        (rec.cjk ? '' : 'multi') +
        // No translation line means the original IS the viewer's language. The collapsed
        // card hides .rc-orig, so it would come up with nothing but seal/place/year —
        // `solo` lets it stand in for the missing preview, set in the translation's style.
        (trans ? '' : ' solo') +
        '">' +
        origHtml(rec, state.lang) +
        '</div>' +
        '<div class="rc-src">' +
        sourceLabel(rec, state.lang) +
        noteMark(rec, state.lang, 'source') +
        '</div>' +
        noteList(rec, state.lang, 'rc-note');

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
    applyFocusScroll(list);
    fitPlaceLabels(list); // must follow appendChild — an unattached row measures 0
    drawBands(); // central-band shadows for the visible records' solar events
    applyEventFocus();
  }

  // ---- All-Events (Every Eclipse, Paged) ----

  // A chronological running-log of every eclipse of the selected kind, with or without a
  // curated record, windowed around the lizhou focus and paged by the load chevrons.
  const evKey = (dateStr, kind) => dateStr + '|' + kind;

  // Kinds with a checked-in event catalogue (solar.json / lunar.json). The other
  // type slips (yanfan/kexing/huibo) have no catalogue at all — an empty evAll() for them
  // is a real empty shelf, NOT the boot race below, and must never enter the retry.
  const EV_CATALOGUED = { solar: true, lunar: true };

  // Set by evAll(): whether its last result was ordered by match rank instead of
  // chronologically. seedWindow reads it — a ranked list is a search result and
  // must open on its best matches, not on the lizhou focus year.
  let evQueryRanked = false;

  // An all-events row has no prose, so tokens match its type and date. Rank is -1 for no match,
  // else how many digits the event's year runs past the typed one: a half-typed year still finds
  // its decade and century without burying the literal year.
  function evMatchQ(e, parsed) {
    if (parsed.words.length) {
      const kindKey = String(e.kind || '').toLowerCase();

      // Only the active locale's dictionary is loaded, so the type name matches in the
      // language on screen; the raw kind token keeps the filter reachable from an English keyboard.
      const label = T('eclipse.type.' + e._kind + '.' + kindKey).toLowerCase();
      for (const w of parsed.words) if (!label.includes(w) && !kindKey.includes(w)) return -1;
    }
    if (!parsed.dates.length) return 0;
    const forms = _ymdForms(e.date);
    let rank = 0;
    for (const alts of parsed.dates) {
      const r = _dateRank(forms, alts);
      if (r < 0) return -1;
      rank = Math.max(rank, r);
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
    updateReccount(); // all-events tally = whole catalogue of this kind
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
                const lbl = Seal.name(c, typeof I18n !== 'undefined' ? I18n.getLocale() : 'en', _eventYear(e.date));
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
    applyFocusScroll(list);
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

  // Corner-nav glyphs: prev/next chevrons + close cross, all drawn on one 24×24 viewBox with a
  // single stroke so they read at an identical visual size. The divider and corner nail are
  // pure CSS on .ev-strip-nav; glyphs stay geometric.
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

      // The strip lives inside the Leaflet container so it anchors to the map, which means a
      // mousedown on its text would bubble into Leaflet's own drag handler as a map pan.
      // disableClickPropagation/disableScrollPropagation stop that so the strip stays selectable.
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

    // Line-1 tail after the date: for an eclipse, type + magnitude + saros; for a transient,
    // modern name + designation|unconfirmed (see transientL1).
    let l1extra;
    if (isTransient) {
      l1extra =
        kind === 'appulse' || kind === 'conjunction' ? separationL1(trec, state.lang) : transientL1(trec, state.lang);
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

    // Saros cells flush right: series number over this eclipse's rank in its series, Han
    // digits in CJK, Roman in Western scripts. Negative series take 负/負 (negative) in Han
    // and U+2212 before the Roman; series zero is N (Bede's nulla).
    const sarosNum = e && e.saros != null && !isTransient ? +e.saros : null;
    const hanNum = isZh(state.lang) || state.lang === 'ja';
    const hanNeg = state.lang === 'zh-Hans' ? '负' : '負';

    // 第 (ordinal prefix) takes no zero or negative, so Han series ≤ 0 drop the template.
    const sarosStr =
      sarosNum == null
        ? ''
        : hanNum && sarosNum <= 0
          ? (sarosNum < 0 ? hanNeg : '') + cjkDecimal(sarosNum)
          : T('ear.saros', {
              n: hanNum
                ? cjkDecimal(sarosNum)
                : sarosNum === 0
                  ? 'N'
                  : (sarosNum < 0 ? '−' : '') + _roman(Math.abs(sarosNum)),
            });
    const sarosOrd = sarosNum == null ? null : sarosOrdinal(e);
    const sarosOrdStr = sarosOrd == null ? '' : T('ear.saros.ord', { n: hanNum ? cjkDecimal(sarosOrd) : sarosOrd });

    // Han scripts read series and rank as one phrase on the chronicle row (第一〇六之四二);
    // Western keeps the series on the science row.
    const sarosL1 = hanNum ? '' : sarosStr;

    // Both scripts gloss the cells with one sentence that spells out series and rank.
    const sarosGloss =
      sarosNum == null || sarosOrd == null
        ? ''
        : _gloss('saros_entry_' + kind, { series: String(sarosNum).replace('-', '−'), ord: sarosOrd });
    const sarosL2 = hanNum ? sarosStr + sarosOrdStr : sarosOrdStr;

    // Chronicle line (shilu): reign-era + reckoned lunisolar/ganzhi (CJK) or period + year
    // (Western), already HTML. The peak instant is what the CJK branch shifts into East-8;
    // solar and lunar events file it under different keys, and transients have none.
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

    // CJK opens l1 with the date; Western moved it to l2 (see chronicleStr), so l1 drops
    // the leading separator.
    const cjk = isZh(state.lang) || state.lang === 'ja';
    const l1 = cjk
      ? '<b' + _calGlossFor(dateStr, state.lang) + '>' + _esc(_sciDate(dateStr, state.lang)) + '</b>' + l1extra
      : l1extra.replace(/^ · /, '');

    // shu'er label: CJK/ja keep the upright vertical jingguan; Western get a short spine label
    // so long words (fr "Maintenant") can't overflow the tab. ear.now.short is deliberately
    // Latin-script-only; never read on the CJK branch, where it would echo the key itself.
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
      '<span class="ev-strip-row">' +
      '<span class="ev-strip-l1">' +
      l1 +
      '</span>' +
      (sarosL1 ? '<span class="ev-strip-l1 ev-strip-saros"' + sarosGloss + '>' + _esc(sarosL1) + '</span>' : '') +
      '</span>' +
      (chronicle || sarosL2
        ? '<span class="ev-strip-row">' +
          '<span class="ev-strip-l2">' +
          chronicle +
          '</span>' +
          (sarosL2 ? '<span class="ev-strip-l2 ev-strip-saros"' + sarosGloss + '>' + _esc(sarosL2) + '</span>' : '') +
          '</span>'
        : '') +
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

  // all-events window centering for the current mode only: when all-events is already active
  // and the event's card falls outside the rendered window, re-seed winStart/winEnd on its
  // exact index and report true so the caller rebuilds.

  // Cross-mode centering is not this function's job; that is handled lazily by seedWindow's
  // selection-aware snap when the reader switches modes. Doing it here too would fight over
  // the same winStart/winEnd globals with centerRecordsWindow() below.
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

  // The seed key omits the focus, so a focus restored from a link after first paint would keep
  // the window seeded on the default year; dropping the key makes the next render re-seed.
  function reseedList() {
    winSeedKey = null;
  }

  // Select an event (record or not): drive the engine's contact curves via EclipseLoader
  // (which also flies the map to the greatest-eclipse point), glide the lens, and move the
  // .sel highlight in place, without a list rebuild, so scroll and text selection survive.
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

    // records follow-through: if this event has a matching record, select it too so
    // switching to records later lands on it (centering happens lazily in seedWindow). No
    // match clears any stale state.sel instead of leaving an unrelated record highlighted.
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

  // Move the .sel/.expanded highlight to the given event's rail card, filling its inline
  // detail and scrolling it to center. The card must already be in the rendered window;
  // callers re-seed via centerEventWindow + renderEventList when it isn't.
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
    state.sel = null; // drop any record selection too, so × fully clears
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

  // Mode-aware neighbour step for the #ev-strip ‹ › buttons: all-events steps between events
  // (same kind), records steps the visible record list, so the strip stays linked to whatever
  // the rail is showing. opts.peek returns the neighbour without selecting.
  function stepSelection(dir, opts) {
    if (state.mode === 'records') {
      if (!state.sel) return null;
      const recs = recsSorted();
      const i = recs.findIndex((r) => r.id === state.sel);
      if (i < 0) return null;

      // Step to the first record of the adjacent event, not the adjacent record: one eclipse
      // may carry several records, kept contiguous by recsSorted. Forward skips the current
      // run; backward skips it too, then walks to the start of the previous event's run.
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

  // ---- Central-Band Shadow Overlay ----

  // Draws the totality/annularity band of every central solar eclipse whose card is on
  // screen in the rail, interactive: hover cross-highlights the card and its markers, click
  // jumps to the event.
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

  // The cards intersecting #list's scroll viewport, as absolute indices into the current
  // mode's sorted array. Slice the bands by this, never the pager's [winStart, winEnd), which
  // moves only on a page. Compare rects, never offsetTop, which is not guaranteed to be #list.
  function viewSlice() {
    const list = document.getElementById('list');

    // No layout yet (collapsed rail, pre-paint boot) — fall back to the paged
    // window so the very first draw is not empty.
    if (!list || !list.clientHeight) {
      _viewFrom = winStart;
      _viewTo = winEnd;
      return [_viewFrom, _viewTo];
    }
    const box = list.getBoundingClientRect();
    let k = -1,
      from = -1,
      to = -1;
    for (const el of list.children) {
      // Count only cards: the empty/loading shelves are children too, and the
      // k-th card is index winStart + k in the sorted array (both renderers
      // append in that order).
      if (!el.classList.contains('reccard') && !el.classList.contains('evcard')) continue;
      k++;
      const r = el.getBoundingClientRect();
      if (r.bottom <= box.top || r.top >= box.bottom) continue;
      if (from < 0) from = k;
      to = k;
    }
    _viewFrom = from < 0 ? winStart : winStart + from;
    _viewTo = from < 0 ? _viewFrom : winStart + to + 1;
    return [_viewFrom, _viewTo];
  }

  // Redraw only when the on-screen slice actually shifts. One listener on the persistent
  // #list survives every rebuild. rAF-coalesced, or a fling would rebuild every polygon each frame.
  let _bandScrollRaf = 0;
  function wireBandScrollSync() {
    const list = document.getElementById('list');
    if (!list) return;
    list.addEventListener(
      'scroll',
      () => {
        // Cancel-and-reschedule, never a "pending" boolean: a hidden tab holds its
        // rAF callbacks, and a flag raised there would latch scrolling off for good.
        cancelAnimationFrame(_bandScrollRaf);
        _bandScrollRaf = requestAnimationFrame(() => {
          const a = _viewFrom,
            b = _viewTo;
          const [from, to] = viewSlice();
          if (from !== a || to !== b) drawBands();
        });
      },
      { passive: true }
    );
  }

  // The central solar events whose bands should show = the ones backing the cards
  // on screen in the right rail (events: the slice; records: the on-screen
  // records' distinct solar events).
  function visibleCentralEvents() {
    if (state.type !== 'solar') return [];
    const [from, to] = viewSlice();
    let evs;
    if (state.mode === 'events') {
      evs = evAll().slice(from, to);
    } else {
      const recs = recsSorted().slice(from, to);
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

    // An event is selected: the engine renders its band in a higher pane, so hide the
    // background overview. Bump the token before returning, or an in-flight overview
    // Promise.all would still pass its token check and repaint on top of the cached curves.
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

    // Cache the promise, never the value it resolves to: drawBands runs several times over a
    // boot, and a value-keyed cache is still empty while the first fetch is in flight, so
    // each concurrent draw would fetch the same event file again.
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
        // Draw EVERY ring an event yields, not just the first: a band clipped by the
        // terminator arrives as separate closed loops, and the rest are the gaps.
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

      // Click a shadow: re-click the selected one closes it; records mode jumps to the
      // event's record card, all-events expands its event card. Stop the click bubbling to
      // the map's own handler, or it would open the local-observation popup here too.
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

  // Cross-highlight one event everywhere it surfaces: its shadow band, its all-events card,
  // and the record cards + map markers of every civilization that witnessed it. Only the
  // band half is solar-specific.

  // `origin` is the record the pointer is actually on, and decides the group (see linkKey):
  // date+kind cannot, outside the catalogue kinds. Callers starting from an event rather than
  // a record (the all-events card, a band) pass none and take the catalogue path instead.
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

  // Wait until a record is actually held, fetching registers until it turns up: boot loads
  // only the register on screen, so a link into one still streaming in would otherwise arrive
  // before its shards do. The active register is tried first since a permalink names it in `type`.
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

    // Selecting a record also selects its eclipse event, entering selected-event mode: the
    // map narrows to this event's records, other cards dim, and a click opens the observe popup.
    clearObservation();
    state.selEv = evKey(rec.date, rec.type);

    // A record chosen from a map marker/timeline dot/event panel may fall outside the current
    // page: re-seed the window and rebuild so its card exists. A click on an in-window card
    // skips this, keeping the in-place .sel toggle that preserves any text selection.
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

    // If all-events is the active view, mirror selectEvent(): re-seed the window onto this
    // record's event (if off-page) and move the highlight to its card. When records is active,
    // the all-events window centers lazily, once seedWindow's snap acts on state.selEv.
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

    // Real geometry: select the matching eclipse so the engine draws its contact curves,
    // baselining TimeState on that event's peak so the static umbra sits at greatest eclipse.
    // Pass noFly so selectEvent does not also fly to the peak.
    const d = _dateFromStr(rec.date);
    let ev = null;

    // Only eclipse records hook the geometry engine; without this guard a guest-star or
    // comet record would snap selectNearest to a bogus nearest eclipse.
    if (window.EclipseLoader && (rec.type === 'solar' || rec.type === 'lunar')) {
      if (!EclipseLoader.selectByDate(rec.date, rec.type, { noFly: true }) && d)
        EclipseLoader.selectNearest(d, { noFly: true });
      ev = EclipseLoader.selected && EclipseLoader.selected();
    }
    const peak = ev && EclipseLoader.peakMs ? EclipseLoader.peakMs(ev) : d ? d.getTime() : null;
    if (peak != null && !isNaN(peak) && TS) TS.resetTo(new Date(peak));
    updateEvStrip(); // record selection drives the top strip too

    // Open the popup first and measure it, then fly once to the framing that already leaves
    // room for it (autoPan stays disabled so nothing shifts the view a second time). Runs
    // after the strip update above, since a record from another event resizes the strip/scrub bar.
    if (map && rec.lat != null) {
      const zoom = Math.max(map.getZoom(), 4);
      let target = null;
      if (markerById[id]) {
        openRecPopup(id);
        const m = markerById[id];

        // A fanned record's popup stands on its leg, a fixed pixel offset from the site,
        // so frame the site and measure the popup against the site's own point.
        const site = spider && spider.layer.hasLayer(m) ? spider.center : m.getLatLng();
        const at = L.latLng(site.lat, nearestLon(rec.lon, site.lng));
        const el = m.getPopup().getElement();
        if (el) target = popupFrameCenter(at, zoom, el, map.latLngToContainerPoint(site));
      } else {
        // The marker is not built yet, so measure the same content in a stand-in popup
        // at the site and drop it before the fly.
        const at = L.latLng(rec.lat, nearestLon(rec.lon, null));
        const tmp = L.popup(POPUP_OPTS).setLatLng(at).setContent(popupHtml(rec)).openOn(map);
        const el = tmp.getElement();
        if (el) target = popupFrameCenter(at, zoom, el, map.latLngToContainerPoint(at));
        map.closePopup(tmp);

        // Flying to a record outside the pre-fly viewport means drawMarkers() hasn't built
        // its marker yet; redraw once the fly settles, then open.
        map.once('moveend', () => {
          drawMarkers();
          openRecPopup(id);
        });
      }
      const mk = markerById[id];
      map.flyTo(target || [rec.lat, nearestLon(rec.lon, mk ? mk.getLatLng().lng : null)], zoom);
    }
  }

  // ---- Language / Panels ----

  // The one search box means different things per mode (prose vs. eclipse type/date), so its
  // label follows the mode; the declarative key is rewritten too, not just the rendered text.
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
    set('libtab', T('atlas.tab.lib'));
    syncSearchTip();

    // fuqian type slips: Latin locales use typeShort abbreviations (sideways full
    // words would stretch the slips); CJK/ja use the full two-glyph names.
    const isLatin = !isZh(state.lang) && state.lang !== 'ja';
    const full = {
      solar: T('atlas.solar'),
      lunar: T('atlas.lunar'),
      appulse: T('atlas.fut.appulse'),
      conjunction: T('atlas.fut.conjunction'),
      guest: T('atlas.fut.guest'),
      comet: T('atlas.fut.comet'),
    };
    const short = isLatin
      ? {
          solar: T('atlas.type.solar'),
          lunar: T('atlas.type.lunar'),
          appulse: T('atlas.type.appulse'),
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

          // Tear down the previous layer's selection before switching type: solar's shadow,
          // curves and disks share one soloLayer/curvesLayer with the lunar veil, and only a
          // teardown, not a re-render, removes them.
          clearEventSel();
          state.type = b.dataset.t;

          // The new phenomenon's shards may not be in yet. Render immediately with whatever
          // is held, then render again when loadPhenomenon resolves (a no-op if already in).
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
    wireBandScrollSync();

    // rail show/hide. A per-viewer layout preference, so it lives in localStorage rather than
    // the permalink. Folding the rail resizes the map cell, so Leaflet must re-measure
    // synchronously, or a deferred invalidateSize's moveend could land mid-fly.
    const frameEl = document.getElementById('frame');
    const afterSlide = (prop, fn) => {
      const moving =
        document.body.classList.contains('motion') &&
        frameEl &&
        getComputedStyle(frameEl)
          .transitionDuration.split(',')
          .some((d) => parseFloat(d) > 0);
      if (!moving) return fn();

      // A slide reversed midway never ends, so a timer backs the event up; whichever
      // comes first runs fn, once.
      let timer = 0;
      const done = (e) => {
        if (e && (e.target !== frameEl || e.propertyName !== prop)) return;
        frameEl.removeEventListener('transitionend', done);
        clearTimeout(timer);
        fn();
      };
      frameEl.addEventListener('transitionend', done);
      timer = setTimeout(done, 400);
    };

    const toggleRail = (show) => {
      toggle('library', 'libtab', show);
      try {
        localStorage.setItem(RAIL_KEY, railOpen() ? '1' : '0');
      } catch (_) {}
      afterSlide('grid-template-columns', () => {
        if (map) map.invalidateSize();
        reopenRecPopup();
      });
    };
    const lc = document.getElementById('lib-close');
    if (lc) lc.onclick = () => toggleRail(false);
    const lt = document.getElementById('libtab');
    if (lt) lt.onclick = () => toggleRail(true);
    try {
      if (localStorage.getItem(RAIL_KEY) === '0') toggleRail(false);
    } catch (_) {}

    // Motion is armed only after the stored layout is applied, so a reload never slides.
    setTimeout(() => document.body.classList.add('motion'), 0);

    // search — results are a list, so typing brings a folded rail back
    const q = document.getElementById('q');
    if (q)
      q.oninput = (e) => {
        state.q = e.target.value;
        if (!railOpen()) toggleRail(true);
        renderList();
        drawTimeline();
        drawMarkers();
      };

    // timeline show/hide. Toggling it resizes the inset map (via
    // body:has(#timeline.hidden) #map), so Leaflet must re-measure its container
    // afterwards or tiles grey out.
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

    // language: I18n owns the dropdown (ui.js). An open popup holds locale-baked HTML, so
    // reopen both the selected record marker and the observe card, which branches CJK shichen
    // vs Western hora and would otherwise show the wrong reckoning, not just an untranslated word.
    if (typeof I18n !== 'undefined' && I18n.subscribe) {
      I18n.subscribe(() => {
        state.lang = I18n.getLocale();
        renderAll();
        updateEvStrip();
        if (state.sel && markerById[state.sel]) markerById[state.sel].openPopup();
        if (_obsMarker && _obsMarker.isPopupOpen()) showObservation(_obsMarker.getLatLng());

        // The place row has to be re-fitted for the new locale; only the rail gets that free
        // from renderList. Ask again for the whole document once laid out, and clear the ear
        // against the reopened popup's new height.
        requestAnimationFrame(() => {
          fitPlaceLabels();
          clearEarForPopup();
        });
      });
    }

    // The map cell resizes with the window, and CSS alone never tells Leaflet, which must be
    // told to re-measure or the tiles grey out.
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
    document.addEventListener('click', onNoteLink);

    // Popup markup is inserted only when the popup opens, so the place row cannot
    // be measured any earlier than this.
    if (map) map.on('popupopen', (ev) => fitPlaceLabels(ev.popup.getElement()));

    // Webfonts land after first paint and change every advance width. Listen for every
    // batch, not just the first, since faces split by weight and unicode-range: `ready`
    // covers the already-cached run, `loadingdone` covers each later one.
    if (document.fonts) {
      if (document.fonts.ready) document.fonts.ready.then(() => fitPlaceLabels());
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => fitPlaceLabels());
    }
  }

  // ---- Boot ----

  async function init(mapInstance, ctl) {
    map = mapInstance;
    eclipseCtl = ctl;
    if (typeof I18n !== 'undefined' && I18n.getLocale) state.lang = I18n.getLocale();

    // GAZ and SOURCES must be loaded before _map() runs. Never pass a cache override
    // here: no-store re-downloads the whole corpus on every reload.
    // prettier-ignore
    const [sitesJson, erasJson, civsJson, regionsJson, manifestJson, sourcesJson, visJson, calJson, termsJson, personsJson, bodiesJson, xingguanJson] = await Promise.all([
      fetch('data/concordance/gazetteer.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/concordance/eras.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/concordance/civilizations.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/concordance/regions.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/records/manifest.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/records/sources.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/records/visibility.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/concordance/calendars.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/concordance/terms.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/concordance/persons.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/concordance/bodies.json')
        .then((r) => r.json())
        .catch(() => null),
      fetch('data/concordance/xingguan.json')
        .then((r) => r.json())
        .catch(() => null),
    ]);
    setStarNames(xingguanJson, bodiesJson);

    // Populate SOURCES lookup keyed by source slug (used by _map to resolve source.key).
    if (sourcesJson && sourcesJson.sources) {
      Object.entries(sourcesJson.sources).forEach(([k, v]) => {
        SOURCES[k] = v;
      });
    }
    GAZ = (sitesJson && sitesJson.places) || {};

    // The tables a note's slots name things from; set before any card renders a note.
    if (typeof Notes !== 'undefined') {
      Notes.setData({
        calendars: (calJson && calJson.calendars) || {},
        terms: (termsJson && termsJson.terms) || {},
        sources: SOURCES,
        persons: (personsJson && personsJson.persons) || {},
        bodies: (bodiesJson && bodiesJson.bodies) || {},
        stars: (xingguanJson && xingguanJson.xingguan) || {},
        places: GAZ,
      });
    }

    // The era names and the subject spans a record's supplied tokens expand through.
    if (typeof Supplied !== 'undefined') Supplied.setData({ eras: erasJson, bodies: bodiesJson });

    // Must be populated before any _map() runs: a record mapped ahead of this reads its
    // visibility as null and ships unflagged, which is the silent half of the failure the
    // sidecar exists to end.
    VIS = (visJson && visJson.records) || {};

    // Reuse the already-fetched sites map for the reverse-geocode popup (no 2nd fetch);
    // regions.json holds the authored Voronoi anchors for the tier-2 yuezhi fallback.
    if (typeof PlaceName !== 'undefined') {
      PlaceName.load(GAZ, (regionsJson && regionsJson.anchors) || []);
    }

    // Inject 7-locale civ names from data/concordance/civilizations.json into Seal (single source
    // of truth) and keep the same table here for the civ-name search haystack. Both must
    // be set before any _map() runs — boot shard or deferred one.
    CIV_NAMES = (civsJson && civsJson.civs) || {};
    if (typeof Seal !== 'undefined') Seal.setNames(CIV_NAMES);
    NIANHAO = (erasJson && erasJson.lines && erasJson.lines.zh) || null;
    NENGO = (erasJson && erasJson.lines && erasJson.lines.ja) || null;
    MANIFEST = manifestJson;

    // The civ chip row and the LOD rarity weight both describe the whole corpus, not the
    // shards currently held, so both are read off the manifest and never shift as deferred
    // shards arrive.
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

    // Central-band overlay: a low pane so the washes read as shadows, above tiles and below
    // record markers and the selected event's own richer curves.
    map.createPane('atlas-bands');
    map.getPane('atlas-bands').style.zIndex = 350;
    bandLayer = L.layerGroup().addTo(map);

    // Viewport coupling: re-run the LOD selection when the view changes.
    // Debounced so a pan/zoom gesture reconciles markers once, on settle.
    let _mvTimer;
    map.on('moveend zoomend', () => {
      clearTimeout(_mvTimer);
      _mvTimer = setTimeout(drawMarkers, 120);
    });

    // Mid-gesture top-up. VIEW_MARGIN pre-builds the seals just off each edge, so a short
    // drag reveals markers that already exist; watch for the visible bounds leaving the box
    // the last pass drew for, and reconcile then, rAF-gated so a settled map costs nothing.
    let _topUp = 0,
      _drawnBounds = null;
    map.on('move', () => {
      if (_topUp) return;
      _topUp = requestAnimationFrame(() => {
        _topUp = 0;
        const b = map.getBounds();
        if (_drawnBounds && _drawnBounds.contains(b)) return;
        const latPad = (b.getNorth() - b.getSouth()) * VIEW_MARGIN;
        const lngPad = (b.getEast() - b.getWest()) * VIEW_MARGIN;
        _drawnBounds = L.latLngBounds(
          [b.getSouth() - latPad, b.getWest() - lngPad],
          [b.getNorth() + latPad, b.getEast() + lngPad]
        );
        drawMarkers();
      });
    });

    // Forget the reopen-target when a popup closes for any reason other than our own rebuild,
    // so drawMarkers() won't resurrect a popup the reader deliberately dismissed. The
    // rebuild's own reopen reads a captured local, not this, so it is unaffected.
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

    // Grid layout drives the map's pixel size, and Leaflet caches that size, so re-measure
    // whenever #mapwrap's box changes: mount, window resize, or the lizhou folding.
    const mapWrap = document.getElementById('mapwrap');

    // The lizhou reads its width only when drawn, and folding the rail changes it
    // without a window resize.
    const tlBox = document.getElementById('timeline');
    if (tlBox && 'ResizeObserver' in window) {
      let tlPending = 0;
      new ResizeObserver(() => {
        if (tlPending) return;
        tlPending = requestAnimationFrame(() => {
          tlPending = 0;
          drawTimeline();
        });
      }).observe(tlBox);
    }
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

    // Everything else streams in behind the first paint, deliberately after render/wiring so
    // the reader can already read and click. Every phenomenon, nothing excluded: Permalink
    // restores state.type from the URL only afterwards, and filtering here would starve it.
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

  // Phenomena whose event_date is assigned from the computed eclipse catalogue, so date+kind
  // names one event many observers can share. Every other phenomenon takes its date from the
  // source text, where it carries no identity.
  const CATALOGUE_KINDS = new Set(['solar', 'lunar']);

  // The group a record belongs to for cross-highlighting, three tiers, most trustworthy
  // first: k = a hand-written event_key, d = a catalogue-derived date, r = the record is its
  // own event. A non-catalogue record must never be grouped by date: those dates carry no identity.
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

  // selectEvent/refresh (= renderAll) are exposed for Permalink restore. sciDate is exported
  // so the observation popup's contact table dates itself the same way the shu'er does (BCE
  // handling, digit spacing, Julian conversion, all in one place); calGloss travels with it.
  return {
    init,
    select,
    ensureRecord,
    selectEvent,
    refresh: renderAll,
    reseedList,
    state,
    recordsForEvent,
    focusYear,
    DEFAULTS,
    subscribeFocus,
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
