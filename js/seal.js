/**
 * seal.js — civilization identity: house colour x seal emblem.
 *
 * A seal is a classical device that belongs ON a picture — unlike a UI badge.
 * Each corpus civilization wears a coloured rounded-square seal with a
 * distinct cultural motif drawn in white line. Colour alone reliably separates
 * only about eight categories and there are 28 here, so the MOTIF SHAPE carries
 * identity as well: civs stay distinguishable under colour blindness and where
 * markers overlap.
 *
 * Europe is split into geographic sub-civilizations (byzantine / italian /
 * iberian / french / british / germanic / norse / slavic) because the corpus's
 * European records come from traditions far enough apart — Byzantine chronicles,
 * Icelandic annals, Iberian and Frankish house records — that one 'european'
 * seal would erase the distinction the map exists to show. That legacy key is
 * retained as a latent fallback; it won't appear in the legend unless data uses it.
 *
 * Every motif is drawn here as plain SVG primitives, one seal per line — except
 * `french` (fleur-de-lis), which is hand-traced at heraldic scale. The charge
 * itself (three lily petals over a tie-band) is a centuries-old heraldic device,
 * not anyone's copyrightable expression; see ATTRIBUTION.md.
 *
 * Localized names (7 locales) come from data/duizhao/wenming.json, injected
 * at load time via Seal.setNames(). This file owns only colour, motif, and
 * ordering — not names.
 *
 * Public API (window.Seal):
 *   Seal.svg(civ, size)        -> seal SVG markup string
 *   Seal.color(civ)            -> house colour hex
 *   Seal.name(civ, lang)       -> localized name (7 locales; falls back to en -> 'Other')
 *   Seal.zh(civ)/hant(civ)/en(civ) -> thin wrappers around Seal.name for legacy call sites
 *   Seal.setNames(table)       -> inject data/duizhao/wenming.json .civs at atlas load time
 *   Seal.icon(civ, isSel)      -> L.divIcon (seal in a drop-shadow wrapper, + pulse if selected)
 *   Seal.CIVS                  -> the ordered civ table (colour + order only; no name fields)
 */

const Seal = (() => {
  'use strict';

  // ---- Name store (injected from data/duizhao/wenming.json via setNames) ----
  // Rows are BCP-47-keyed name blocks. Falls back gracefully when not yet loaded.
  let _names = null;

  // House colours spread across the wheel and de-conflicted for a light ground.
  // At 28 civs the warm/gold/blue-grey bands each hold a few near-neighbours
  // (e.g. slavic ~ assyrian gold, british ~ chinese red) — the motif SHAPE is the
  // primary discriminator there. Order is roughly geographic so the legend groups
  // by region. Name fields removed: data/duizhao/wenming.json is the single source
  // of truth for all 7 locales.
  const CIVS = {
    // ---- East Asia ----
    chinese: { color: '#B23A48' }, // zhong (middle) character — wide rectangle + piercing stroke
    korean: { color: '#2456A8' }, // taegeuk — indigo (lower field of the taegeuk emblem)
    japanese: { color: '#C8960E' }, // hinomaru sun disk — chrysanthemum gold (kiku imperial colour)
    vietnamese: { color: '#6E5A2E' }, // lotus
    tangut: { color: '#1AA4A4' }, // Tangut square-script glyph (brighter teal vs syriac's dark muted tone)
    // ---- Near East ----
    babylonian: { color: '#6C3C86' }, // ziggurat
    assyrian: { color: '#B07A3A' }, // winged disk
    hittite: { color: '#4E6E86' }, // double eagle
    arab: { color: '#196C38' }, // crescent — Islamic green (freed by korean->indigo)
    armenian: { color: '#8D6E63' }, // arevakhach (wheel of eternity)
    syriac: { color: '#1F6E6A' }, // eastern cross
    // ---- South Asia ----
    indian: { color: '#CC5A0A' }, // dharmachakra
    // ---- Classical Mediterranean ----
    greek: { color: '#1C6FA6' }, // meander
    roman: { color: '#8E3B2E' }, // aquila
    // ---- Europe (split from the legacy 'european') ----
    byzantine: { color: '#7A2E56' }, // Chi-Rho (☧) labarum
    italian: { color: '#5A7020' }, // arch — olive-chartreuse, clear of chinese/arab green band
    iberian: { color: '#8A8228' }, // castle
    french: { color: '#3D5A96' }, // fleur-de-lis
    british: { color: '#9E3A44' }, // rose
    germanic: { color: '#59626E' }, // Reichsapfel (imperial orb)
    norse: { color: '#2E5A72' }, // Mjolnir hammer
    slavic: { color: '#A65E2A' }, // Orthodox three-bar cross
    russian: { color: '#7A6218' }, // onion dome — post-Petrine Imperial Academy science
    // ---- Mesoamerica ----
    mayan: { color: '#B03A5A' }, // sun stone — rose-red, 15 deg hue from byzantine purple
    aztec: { color: '#C0512A' }, // Tonatiuh four-movements glyph
    // ---- Modern Americas (scientific era) ----
    american: { color: '#2C3E8C' }, // 5-point star
    latin: { color: '#147A5C' }, // Southern Cross
    // ---- latent fallback (retired single-Europe key; not shown unless data uses it) ----
    european: { color: '#5B7A2E' },
  };
  const DEFAULT = { color: '#7A7268' }; // colour only; the name falls back via _names (key 'european')

  // White-line motifs (viewBox 0 0 24 24), stroked #F6F2E8 by seal().
  const MOTIF = {
    // ---- East Asia ----
    chinese: '<rect x="6.5" y="8.5" width="11" height="7"/><line x1="12" y1="5" x2="12" y2="19"/>', // zhong — wide box + piercing stroke
    korean: '<circle cx="12" cy="12" r="6"/><path d="M12 6 a3 3 0 0 1 0 6 a3 3 0 0 0 0 6"/>',
    japanese: '<circle cx="12" cy="12" r="6" fill="#F6F2E8" stroke="none"/>', // hinomaru — solid sun disk (r=6 matching taegeuk)
    vietnamese: '<path d="M12 16.5 V7.5 M12 16.5 C8.5 14 8 11 9.2 8.1 M12 16.5 C15.5 14 16 11 14.8 8.1"/>',
    tangut: '<rect x="6.8" y="6" width="10.4" height="12" rx="0.6"/><path d="M6.8 12 H17.2 M12 6 V18 M9.2 9 H14.8"/>',
    // ---- Near East ----
    babylonian: '<path d="M5 17.5 H19 M7 17.5 V13.5 H17 V17.5 M9 13.5 V9.5 H15 V13.5 M11 9.5 V6.5 H13 V9.5"/>',
    assyrian:
      '<circle cx="12" cy="12" r="2.4"/><path d="M12 12 H4.5 M12 12 H19.5 M6.2 10.4 L4.5 12 L6.2 13.6 M17.8 10.4 L19.5 12 L17.8 13.6"/>',
    hittite: '<path d="M12 8.5 V17 M12 9.5 L8.5 6.5 M12 9.5 L15.5 6.5 M8 11.5 H16 M9.2 14.2 H14.8"/>',
    arab: '<g transform="translate(12 12) scale(0.75) translate(-12 -12)"><path d="M14.8 4.6 A8 8 0 1 0 14.8 19.4 A6.3 6.3 0 1 1 14.8 4.6 Z"/></g>', // crescent (y 6..18, margin +1.4)
    armenian:
      '<circle cx="12" cy="12" r="1.3"/><path d="M12 7.2 Q15 7.2 15 10.2 M16.8 12 Q16.8 15 13.8 15 M12 16.8 Q9 16.8 9 13.8 M7.2 12 Q7.2 9 10.2 9"/>',
    syriac: '<path d="M12 5 V19 M5 12 H19 M10.4 5 H13.6 M10.4 19 H13.6 M5 10.4 V13.6 M19 10.4 V13.6"/>',
    // ---- South Asia ----
    indian:
      '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.4"/><path d="M12 6 V18 M6 12 H18 M7.8 7.8 L16.2 16.2 M16.2 7.8 L7.8 16.2"/>',
    // ---- Classical Mediterranean ----
    greek: '<path d="M6.5 17 V6.5 H17.5 V15.5 H9.5 V9.5 H14.5 V13"/>',
    roman: '<path d="M12 5 V19 M6.5 9 Q12 6 17.5 9 M7.5 12.2 H16.5 M9.5 15.4 H14.5"/>',
    // ---- Europe ----
    byzantine:
      '<path d="M12 4.7 V19.5 M12 4.7 Q16.2 4.7 16.2 7.2 Q16.2 9.7 12 9.7 M6 11.2 L18 17.5 M18 11.2 L6 17.5"/>', // Chi-Rho: rho h=5 (was 7.2); X 33 deg from vertical (was 43 deg)
    italian: '<path d="M6.5 18.5 V11 A5.5 5.5 0 0 1 17.5 11 V18.5 M6.5 12.6 H17.5 M12 5.4 V7.8"/>', // arch + keystone
    iberian:
      '<path d="M6.5 17.2 V8.8 H8.5 V6.8 H10.5 V8.8 H13.5 V6.8 H15.5 V8.8 H17.5 V17.2 M11 17.2 V12.1 H13 V17.2"/>', // castle
    french:
      '<g fill="#F6F2E8" stroke="none" fill-rule="evenodd" transform="translate(2.14 1.63) scale(0.145)"><path d="M 47.28,45.01 c 3.3,-13.02 11.18,-21.76 19.14,-31.99 c 2.78,-3.17 2.95,-2.15 5.7,0.32 c 7.41,9.3 20.76,24.24 18.52,36.98 c -3.09,4.79 -6.22,9.56 -9.37,14.33 c -1.56,3.06 -3.23,6.06 -5.02,8.99 c -1.03,2.42 -2.03,4.84 -2.98,7.28 c -2.33,0.32 -4.67,0.58 -7.02,0.77 c -0.44,0.1 -0.77,-0.05 -1,-0.43 c -3.91,-10.87 -10.6,-20.51 -17.02,-30.02 c -1.42,-2.41 -0.15,-3.9 -0.95,-6.23 Z M 16.25,73.06 c 0.95,-7.11 4.69,-12.14 11.23,-15.09 c 17.37,-6.7 28.72,7.61 33.29,22.58 c 0.56,1.25 0.29,2.24 -0.83,2.95 c -1.55,0.58 -3.04,1.27 -4.48,2.08 c -0.34,-0.1 -0.63,-0.28 -0.85,-0.57 c -2.74,-8.6 -13.06,-14.47 -21.68,-10.5 c -4.03,2.43 -5.24,7.28 -1.03,10.23 c 0.09,0.95 -0.38,1.44 -1.4,1.46 c -8.63,1.41 -13.25,-5.52 -14.25,-13.14 Z M 77.24,80.44 c 4.13,-10.23 9.88,-21.43 21.77,-23.96 c 13.27,-2.51 28.25,10.36 20.9,23.85 c -2.88,4.66 -7.03,6.58 -12.44,5.78 c -0.52,-0.02 -0.94,-0.23 -1.25,-0.62 c 0.77,-1.08 1.63,-2.12 2.56,-3.11 c 1.53,-4.4 -2.22,-8.45 -6.49,-9.01 c -6.42,-0.54 -11.73,1.66 -15.92,6.6 c -1.05,1.6 -2.02,3.21 -2.92,4.85 c -1.89,-0.62 -3.73,-1.38 -5.52,-2.27 c -0.54,-0.6 -0.77,-1.3 -0.69,-2.11 Z M 52.03,92.15 c 10.61,-8.67 20.87,-10.05 32.5,-2.24 c 0.75,0.84 4.36,2.18 2.61,3.59 c -11.15,9.06 -22.44,9.28 -33.83,0.59 c -0.61,-0.53 -1.04,-1.18 -1.28,-1.94 Z M 78.78,102.93 c 0.55,-1.74 4.13,-2.55 5.7,-3.07 c 1.21,0.88 2.52,1.56 3.93,2.05 c 5.23,0.92 8.18,-0.51 7.26,-6.17 c -0.14,-1.36 -2.99,-4.2 -0.17,-4.36 c 16.43,1.87 12.56,23.26 -6.94,20.3 c -4.69,-1.16 -7.86,-4.41 -9.78,-8.75 Z M 32.68,101.03 c 0.26,-5.63 4.33,-9.34 9.92,-9.35 c 2.69,0.02 0.52,2.63 0.29,3.85 c -1.62,5.84 2.63,7.47 7.56,6.25 c 1.5,-0.68 2.87,-1.54 4.1,-2.58 c 1.08,0.63 4.95,2.07 5.08,3.25 c -4.04,13.84 -26.82,12.17 -26.95,-1.42 Z M 57.82,116.9 c 2.3,-4.12 4.23,-8.42 5.79,-12.87 c 0.76,-1.57 2.6,-0.18 3.83,-0.23 c 2.35,0.03 4.69,0.07 7.03,0.1 c 1.89,4.59 3.95,9.11 6.16,13.56 c -2.53,3.01 -5.12,5.98 -7.76,8.91 c -1.17,1.2 -2.38,2.33 -3.63,3.4 c -0.45,0.07 -0.8,-0.08 -1.06,-0.46 c -1.8,-3.02 -9.91,-9.7 -10.36,-12.41 Z"/></g>', // fleur-de-lis, hand-traced (project original artwork, not sourced from any external work)
    british:
      '<path d="M13.41 10.06 A1.9 1.9 0 1 1 14.28 12.74 A1.9 1.9 0 1 1 12 14.40 A1.9 1.9 0 1 1 9.72 12.74 A1.9 1.9 0 1 1 10.59 10.06 A1.9 1.9 0 1 1 13.41 10.06 Z"/><circle cx="12" cy="12" r="1.5"/>', // rose (5-lobe cinquefoil)
    germanic: '<circle cx="12" cy="13.8" r="4.8"/><path d="M7.4 12.4 H16.6 M12 9 V4.6 M10.3 6.2 H13.7"/>', // Reichsapfel orb + cross
    norse: '<path d="M9 5 H15 M12 5 V10.5 M8.4 10.5 H15.6 L14 17.6 H10 Z"/>', // Mjolnir hammer
    slavic: '<path d="M12 4 V20 M9.6 7.4 H14.4 M7.4 11 H16.6 M9 16.2 L15 13.8"/>', // Orthodox 3-bar cross
    russian:
      '<path d="M12 3.5 C9.5 6 9.3 8.4 12 9.4 C14.7 8.4 14.5 6 12 3.5 Z M8 9.4 H16 M9 9.4 V18.4 H15 V9.4 M12 3.5 V1.6"/>', // onion dome + cross
    // ---- Mesoamerica ----
    mayan:
      '<circle cx="12" cy="12" r="3.8"/><path d="M12 4.5 V6.4 M12 17.6 V19.5 M4.5 12 H6.4 M17.6 12 H19.5 M6.7 6.7 L8 8 M17.3 6.7 L16 8 M6.7 17.3 L8 16 M17.3 17.3 L16 16"/>',
    aztec:
      '<circle cx="12" cy="12" r="1.9"/><path d="M12 4.5 L14.6 9.4 M12 4.5 L9.4 9.4 M19.5 12 L14.6 14.6 M19.5 12 L14.6 9.4 M12 19.5 L9.4 14.6 M12 19.5 L14.6 14.6 M4.5 12 L9.4 9.4 M4.5 12 L9.4 14.6"/>',
    // ---- Modern Americas ----
    american:
      '<path d="M12 4 L14.12 9.27 L19.8 9.66 L15.4 13.32 L16.85 18.9 L12 15.8 L7.15 18.9 L8.6 13.32 L4.2 9.66 L9.88 9.27 Z"/>', // 5-point star
    latin:
      '<circle cx="12" cy="5.4" r="1.15"/><circle cx="12" cy="18.2" r="1.15"/><circle cx="6.2" cy="12.4" r="1.15"/><circle cx="17.8" cy="11.6" r="1.15"/><circle cx="13.6" cy="15" r="0.85"/>', // Southern Cross
    // ---- latent fallback ----
    european:
      '<path d="M12 4 C10.5 7.5 8.5 8.5 8.5 11.5 C8.5 9.5 6.8 10.2 7.4 12.6 M12 4 C13.5 7.5 15.5 8.5 15.5 11.5 C15.5 9.5 17.2 10.2 16.6 12.6 M12 4 V18 M8.6 14.6 H15.4"/>',
  };

  function _key(civ) {
    return String(civ || '').toLowerCase();
  }

  function info(civ) {
    return CIVS[_key(civ)] || DEFAULT;
  }

  function color(civ) {
    return info(civ).color;
  }

  // ---- Name injection ----
  // setNames: called once by atlas.js after data/duizhao/wenming.json is fetched.
  function setNames(table) {
    _names = table || null;
  }

  // name: resolve the 7-locale display name for a civ key.
  // lang: I18n locale string ('zh-Hans', 'zh-Hant', 'en', 'fr', 'es', 'it', 'ja').
  // A civ the table does not name at all falls back to English 'Other', never 其他:
  // an unnamed civ on a French card must not leak Han script.
  function name(civ, lang) {
    const k = _key(civ);
    const row = _names && (_names[k] || _names['european']); // european = last-resort named row
    if (!row) return 'Other';
    return I18n.pick(row, lang) || 'Other';
  }

  // Thin wrappers kept for legacy call sites (atlas.js civscroll, event-panel.js).
  function zh(civ) {
    return name(civ, 'zh-Hans');
  }

  function hant(civ) {
    return name(civ, 'zh-Hant');
  }

  function en(civ) {
    return name(civ, 'en');
  }

  function svg(civ, size, tip) {
    const k = _key(civ);
    const c = info(k);
    const motif = MOTIF[k] || '<circle cx="12" cy="12" r="4.5"/>'; // neutral fallback
    const tipAttr = tip ? ' data-tip="' + tip.replace(/"/g, '&quot;') + '"' : '';
    return (
      '<svg class="seal" width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 24 24" aria-hidden="true"' +
      tipAttr +
      '>' +
      '<rect x="1.5" y="1.5" width="21" height="21" rx="3" fill="' +
      c.color +
      '"/>' +
      '<g fill="none" stroke="#F6F2E8" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      motif +
      '</g></svg>'
    );
  }

  // A Leaflet divIcon: the seal inside a drop-shadow wrapper, larger + pulsing
  // when selected. Requires L (loaded before this file).
  function icon(civ, isSel) {
    const sz = isSel ? 30 : 22;
    const pulse = isSel ? '<div class="mk-pulse"></div>' : '';
    const html =
      '<div style="position:relative;width:' +
      sz +
      'px;height:' +
      sz +
      'px;' +
      'filter:drop-shadow(0 1px 2px rgba(0,0,0,.28))">' +
      pulse +
      svg(civ, sz) +
      '</div>';
    return L.divIcon({ className: 'rec-mk', html: html, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
  }

  return { CIVS, svg, color, name, setNames, zh, hant, en, info, icon };
})();
window.Seal = Seal;
