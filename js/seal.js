/**
 * seal.js — civilization identity: house colour x seal emblem.
 *
 * A seal is a classical device that belongs ON a picture — unlike a UI badge.
 * Each corpus civilization wears a coloured rounded-square seal with a
 * distinct cultural motif drawn in white line — or, where a civ's arms are
 * themselves white-ground (austrian), the seal inverts: house colour on paper,
 * flagged by `invert` in the table. Colour alone reliably separates
 * only about eight categories and there are 33 here, so the MOTIF SHAPE carries
 * identity as well: civs stay distinguishable under colour blindness and where
 * markers overlap.
 *
 * Europe is split into geographic sub-civilizations (byzantine / italian /
 * iberian / french / british / netherlandish / germanic / german / austrian / swiss /
 * polish / hungarian / norse / slavic) because the corpus's European records come from
 * traditions far enough apart — Byzantine chronicles, Icelandic annals, Iberian
 * and Frankish house records — that one continent-wide seal would erase the
 * distinction the map exists to show. Keep them split.
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
 *   Seal.name(civ, lang, year) -> localized name (7 locales; era-aware; falls back to en -> 'Other')
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
  // De-confliction is scoped to what a reader can actually confuse: civs whose
  // records fall in the same region and era. Two civs an ocean and a millennium
  // apart may share a hue, and kindred traditions (germanic ~ german) are allowed
  // to sit close on purpose — the motif SHAPE carries identity in both cases.
  // Order is roughly geographic so the legend groups by region. Name fields
  // removed: data/duizhao/wenming.json is the single source of truth for all
  // 7 locales.
  const CIVS = {
    // ---- East Asia ----
    chinese: { color: '#B23A48' }, // zhong (middle) character — wide rectangle + piercing stroke
    korean: { color: '#2456A8' }, // taegeuk — indigo (lower field of the taegeuk emblem)
    japanese: { color: '#C8960E' }, // hinomaru sun disk — chrysanthemum gold (kiku imperial colour)
    vietnamese: { color: '#C25E82' }, // lotus — lotus rose, the table's only pink; the East Asian band around it is red/indigo/gold/teal
    tangut: { color: '#1AA4A4' }, // Tangut square-script glyph (brighter teal vs syriac's dark muted tone)
    // ---- Near East ----
    babylonian: { color: '#6C3C86' }, // ziggurat
    assyrian: { color: '#B07A3A' }, // winged disk
    hittite: { color: '#4E6E86' }, // twin-headed eagle
    arab: { color: '#196C38' }, // crescent — Islamic green (freed by korean->indigo)
    armenian: { color: '#8D6E63' }, // arevakhach (wheel of eternity)
    syriac: { color: '#1F6E6A' }, // eastern cross
    // ---- South Asia ----
    indian: { color: '#CC5A0A' }, // dharmachakra
    // ---- Classical Mediterranean ----
    greek: { color: '#1C6FA6' }, // meander
    roman: { color: '#8E3B2E' }, // laurel wreath — brick red
    // ---- Europe ----
    byzantine: { color: '#7A2E56' }, // Chi-Rho (☧) labarum
    italian: { color: '#5A7020' }, // traced device — olive-chartreuse, clear of chinese/arab green band
    iberian: { color: '#EDB120' }, // castle — the gold the Spanish empire is conventionally mapped in; the brightest ground in the table, so the white castle rides near the contrast floor
    french: { color: '#3D5A96' }, // fleur-de-lis
    british: { color: '#9E3A44' }, // rose
    netherlandish: { color: '#E78523' }, // windmill — Orange-Nassau orange; the key spans the Low Countries north and south, so a Namur record wears it too
    germanic: { color: '#59626E' }, // Reichsapfel (imperial orb) — the Empire, to 1806
    german: { color: '#54504B' }, // cross pattee — warm graphite, the black of black-red-gold lifted off true black so the seal reads as a colour and not a hole in the map
    austrian: { color: '#C8102E', invert: true }, // Bindenschild — the only inverted seal: red device on a paper ground, which IS the red-white-red arms
    swiss: { color: '#D9494E' }, // couped cross — a Swiss cross is white-on-red by definition
    polish: { color: '#DE7B90' }, // crowned white eagle — the pink Poland is conventionally mapped in
    hungarian: { color: '#8B5F63' }, // double cross on a triple mound — the mauve the Kingdom of Hungary is conventionally mapped in
    norse: { color: '#2E5A72' }, // Mjolnir hammer
    slavic: { color: '#2F7A57' }, // Orthodox three-bar cross — malachite green, the vestment green of the Slavic Orthodox rite; covers both medieval Rus' chronicles and the 18th-century Petersburg Academy records
    // ---- Mesoamerica ----
    mayan: { color: '#B03A5A' }, // sun stone — rose-red, 15 deg hue from byzantine purple
    aztec: { color: '#C0512A' }, // Tonatiuh four-movements glyph
    // ---- Modern Americas (scientific era) ----
    american: { color: '#2C3E8C' }, // 5-point star
    canadian: { color: '#D52B1E' }, // maple leaf — the flag red, kept clear of british #9E3A44 in both hue and saturation because the two share the North American map: an 1875 Kingston dispatch prints beside a Bangor one
    'latin-american': { color: '#147A5C' }, // Phrygian cap on a staff
  };
  const DEFAULT = { color: '#7A7268' }; // colour only; an unrecognised key has no name row either, and falls back to 'Other'

  // White-line motifs (viewBox 0 0 24 24), stroked var(--seal-ink) by seal().
  const MOTIF = {
    // ---- East Asia ----
    chinese: '<rect x="6.5" y="8.5" width="11" height="7"/><line x1="12" y1="5" x2="12" y2="19"/>', // zhong — wide box + piercing stroke
    korean: '<circle cx="12" cy="12" r="6"/><path d="M12 6 a3 3 0 0 1 0 6 a3 3 0 0 0 0 6"/>',
    japanese: '<circle cx="12" cy="12" r="6" fill="var(--seal-ink)" stroke="none"/>', // hinomaru — solid sun disk (r=6 matching taegeuk)
    vietnamese: '<path d="M12 16.5 V7.5 M12 16.5 C8.5 14 8 11 9.2 8.1 M12 16.5 C15.5 14 16 11 14.8 8.1"/>',
    tangut: '<rect x="6.8" y="6" width="10.4" height="12" rx="0.6"/><path d="M6.8 12 H17.2 M12 6 V18 M9.2 9 H14.8"/>',
    // ---- Near East ----
    babylonian: '<path d="M5 17.5 H19 M7 17.5 V13.5 H17 V17.5 M9 13.5 V9.5 H15 V13.5 M11 9.5 V6.5 H13 V9.5"/>',
    assyrian:
      '<circle cx="12" cy="12" r="2.4"/><path d="M12 12 H4.5 M12 12 H19.5 M6.2 10.4 L4.5 12 L6.2 13.6 M17.8 10.4 L19.5 12 L17.8 13.6"/>',
    hittite:
      '<g fill="var(--seal-ink)" stroke="none" transform="translate(4.800 5.226) scale(0.008399 -0.008399) translate(-2142.43 -2509.00)"><path d="M3100 2455 c0 -52 -1 -54 -32 -61 -44 -9 -205 -9 -247 1 -32 7 -34 6 -27 -16 22 -78 92 -566 82 -576 -5 -5 -356 37 -469 57 -62 11 -114 20 -117 20 -3 0 -5 -62 -5 -137 l0 -138 -74 3 c-64 3 -73 1 -67 -13 36 -96 64 -272 78 -492 8 -136 15 -193 24 -193 8 0 13 38 18 123 13 237 23 324 57 468 l20 86 94 17 c113 20 446 59 452 52 7 -7 21 -182 29 -370 l7 -169 -74 7 c-118 11 -376 45 -469 61 -47 8 -87 15 -90 15 -3 0 -5 -69 -5 -154 0 -85 3 -152 6 -150 15 9 251 46 404 64 267 30 834 69 1011 70 20 0 21 5 27 208 7 221 25 451 58 727 18 157 53 377 65 417 4 15 -2 16 -51 11 -47 -5 -55 -3 -55 11 0 13 -12 16 -77 16 -171 0 -421 35 -534 75 l-39 14 0 -54z m-2 -115 c-2 -22 -2 -40 1 -40 2 0 34 9 70 19 79 24 210 47 308 56 l72 7 10 -39 c29 -105 92 -576 79 -588 -8 -8 -615 29 -624 38 -6 5 42 388 62 500 17 90 29 117 22 47z m556 -727 c17 -224 26 -385 26 -461 l0 -84 -122 7 c-162 8 -414 24 -510 32 l-78 6 0 86 c0 84 26 461 32 467 3 2 162 15 338 27 25 2 104 4 176 5 l131 2 7 -87z"/></g>', // Hittite twin-headed eagle, traced from a public-domain rendering, filled
    arab: '<g transform="translate(12 12) scale(0.75) translate(-12 -12)"><path d="M14.8 4.6 A8 8 0 1 0 14.8 19.4 A6.3 6.3 0 1 1 14.8 4.6 Z"/></g>', // crescent (y 6..18, margin +1.4)
    armenian:
      '<circle cx="12" cy="12" r="1.3"/><path d="M12 7.2 Q15 7.2 15 10.2 M16.8 12 Q16.8 15 13.8 15 M12 16.8 Q9 16.8 9 13.8 M7.2 12 Q7.2 9 10.2 9"/>',
    syriac: '<path d="M12 5 V19 M5 12 H19 M10.4 5 H13.6 M10.4 19 H13.6 M5 10.4 V13.6 M19 10.4 V13.6"/>',
    // ---- South Asia ----
    indian:
      '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.4"/><path d="M12 6 V18 M6 12 H18 M7.8 7.8 L16.2 16.2 M16.2 7.8 L7.8 16.2"/>',
    // ---- Classical Mediterranean ----
    greek: '<path d="M6.5 17 V6.5 H17.5 V15.5 H9.5 V9.5 H14.5 V13"/>',
    roman:
      '<g fill="var(--seal-ink)" stroke="none" transform="translate(3.700 5.729) scale(0.006103 -0.006103) translate(-250.00 -2637.77)"><path d="M931 2623 c10 -11 14 -45 14 -112 0 -88 -2 -100 -29 -146 -16 -27 -42 -66 -58 -85 -57 -70 -26 -60 50 16 114 117 270 231 299 220 12 -5 9 -14 -17 -44 -45 -53 -191 -249 -223 -299 -15 -24 -23 -43 -18 -43 16 0 50 35 73 77 31 57 101 129 146 152 49 24 126 43 147 35 12 -5 14 -15 9 -43 -16 -96 -49 -158 -115 -215 -54 -46 -91 -57 -209 -63 l-95 -6 -22 -46 c-12 -25 -29 -66 -38 -91 -9 -25 -20 -52 -25 -61 -12 -23 -42 -171 -35 -177 7 -8 75 67 75 84 0 30 64 139 111 189 27 29 68 60 92 70 23 9 50 21 59 26 10 5 30 9 44 9 l27 0 -5 -82 c-8 -163 -87 -273 -238 -332 -59 -24 -76 -28 -133 -33 l-48 -5 5 -101 c5 -109 25 -206 56 -274 11 -24 20 -48 20 -55 0 -7 7 -3 15 9 11 15 14 50 13 140 -1 151 15 206 81 274 26 27 52 49 58 49 7 0 24 -26 39 -57 33 -69 44 -196 24 -259 -22 -68 -103 -170 -168 -214 l-23 -15 51 -72 c28 -40 94 -115 147 -168 92 -91 98 -95 106 -73 11 31 1 79 -26 120 -64 93 -88 194 -68 283 15 65 40 115 59 115 11 0 99 -83 127 -121 20 -25 44 -96 50 -146 10 -69 -11 -167 -51 -248 l-35 -70 26 -21 c15 -11 60 -41 100 -65 41 -24 73 -48 71 -54 -7 -22 -118 2 -229 49 -36 16 -39 16 -66 -3 -15 -11 -40 -23 -57 -27 -16 -4 -33 -10 -39 -13 -30 -20 -249 -22 -291 -2 -83 38 -99 48 -139 83 -62 55 -157 210 -139 227 16 16 127 27 184 19 83 -12 170 -61 261 -145 72 -68 84 -76 127 -80 l47 -5 -43 26 c-103 61 -287 232 -314 292 -8 17 -23 24 -65 29 -63 8 -166 44 -229 81 -131 77 -204 214 -204 384 0 94 6 100 75 77 133 -46 237 -167 276 -323 12 -48 56 -130 65 -121 2 2 -4 24 -14 48 -54 127 -86 301 -74 407 4 41 2 46 -49 97 -53 54 -118 163 -119 197 0 9 -4 20 -10 23 -13 8 -13 142 0 150 6 3 10 16 10 28 0 24 70 146 96 168 15 12 21 9 54 -28 65 -74 84 -184 54 -318 -30 -134 -33 -150 -24 -159 6 -6 11 -4 13 5 31 118 94 262 150 342 17 24 18 32 7 55 -30 66 -43 122 -44 188 -1 109 47 192 154 268 43 30 44 30 61 9z m1462 -44 c77 -68 111 -141 110 -234 0 -65 -17 -138 -44 -192 -9 -17 -8 -27 8 -50 58 -83 100 -180 151 -343 3 -10 7 -7 12 10 4 15 -1 52 -12 90 -19 67 -31 140 -30 175 5 99 78 246 116 232 20 -8 95 -122 102 -157 3 -14 9 -33 15 -42 11 -21 12 -140 1 -153 -4 -6 -14 -28 -21 -50 -19 -57 -73 -138 -122 -184 -40 -37 -42 -41 -36 -84 5 -38 -4 -157 -18 -232 -8 -43 -34 -122 -54 -169 -12 -27 -19 -51 -17 -53 9 -9 53 73 65 121 37 150 136 269 260 316 85 31 91 27 91 -66 0 -127 -43 -247 -115 -319 -70 -70 -210 -136 -322 -151 -38 -5 -53 -12 -61 -28 -29 -62 -211 -231 -314 -292 l-43 -26 49 5 c43 4 55 12 110 64 75 73 117 104 182 135 42 20 64 23 156 23 138 0 142 -3 97 -92 -40 -80 -134 -179 -200 -211 -124 -60 -340 -50 -441 20 -26 18 -28 18 -90 -6 -103 -40 -123 -46 -177 -49 -47 -3 -29 19 60 73 50 30 95 60 100 66 6 7 -3 35 -25 80 -62 123 -69 244 -21 358 18 43 125 156 147 156 20 0 56 -76 63 -136 9 -64 -9 -152 -42 -213 -56 -101 -63 -116 -63 -141 1 -59 15 -53 113 45 53 53 119 128 147 168 47 67 49 73 33 85 -41 29 -115 108 -145 156 -32 49 -33 54 -33 156 0 95 3 110 28 163 16 31 34 57 42 57 7 0 34 -23 59 -51 64 -71 80 -131 77 -276 -2 -85 1 -117 12 -132 13 -20 14 -19 27 22 8 23 17 47 22 53 15 21 39 148 45 243 l5 98 -65 6 c-36 3 -74 11 -84 16 -10 5 -43 22 -73 36 -118 56 -187 162 -199 307 -4 43 -5 81 -2 83 8 8 50 5 69 -4 9 -5 35 -16 58 -26 60 -25 132 -100 170 -179 19 -38 34 -75 34 -82 0 -15 68 -89 75 -82 7 6 -23 154 -35 177 -5 9 -16 36 -25 61 -9 25 -26 66 -38 91 l-21 47 -101 4 c-78 4 -112 10 -148 27 -51 25 -115 91 -141 146 -21 44 -39 136 -28 147 11 11 107 -10 153 -33 49 -25 112 -90 149 -155 25 -45 54 -74 74 -74 13 0 -181 271 -243 339 -28 31 -33 51 -11 51 9 0 120 -68 130 -79 3 -3 37 -32 76 -63 38 -32 90 -80 114 -108 49 -57 69 -50 23 8 -16 20 -43 60 -59 87 -27 46 -29 58 -29 146 0 144 20 155 118 68z"/></g>', // laurel wreath, traced from a public-domain rendering. Filled, and wider than the other motifs: an open wreath needs the extra width or its two branches close up into one blob
    // ---- Europe ----
    byzantine:
      '<path d="M12 4.7 V19.5 M12 4.7 Q16.2 4.7 16.2 7.2 Q16.2 9.7 12 9.7 M6 11.2 L18 17.5 M18 11.2 L6 17.5"/>', // Chi-Rho: rho h=5 (was 7.2); X 33 deg from vertical (was 43 deg)
    italian:
      '<g fill="var(--seal-ink)" stroke="none" transform="translate(4.600 4.620) scale(0.008132 -0.008132) translate(-490.00 -2330.00)"><path d="M2310 2320 c0 -5 -4 -10 -8 -10 -16 0 -111 -101 -138 -147 l-29 -48 -5 -645 c-5 -643 -5 -645 -27 -680 -12 -20 -41 -47 -65 -60 -41 -23 -55 -25 -243 -30 -195 -5 -201 -6 -246 -32 -44 -26 -94 -75 -131 -128 l-18 -25 -17 25 c-38 53 -88 102 -132 128 -45 26 -51 27 -246 32 -188 5 -202 7 -243 30 -24 13 -53 40 -65 60 -22 35 -22 37 -27 680 l-5 645 -29 48 c-27 46 -122 147 -138 147 -4 0 -8 5 -8 10 0 7 310 10 910 10 600 0 910 -3 910 -10z"/><path fill="var(--seal-ground)" d="M860 1870 l0 -250 215 0 215 0 0 250 0 250 -215 0 -215 0 0 -250z"/><path fill="var(--seal-ground)" d="M1510 1870 l0 -250 215 0 215 0 0 250 0 250 -215 0 -215 0 0 -250z"/><path fill="var(--seal-ground)" d="M860 1175 c0 -231 1 -245 19 -255 12 -6 92 -10 190 -10 93 0 181 -4 195 -10 l26 -10 0 265 0 265 -215 0 -215 0 0 -245z"/><path fill="var(--seal-ground)" d="M1510 1155 l0 -265 26 10 c14 6 102 10 195 10 98 0 178 4 190 10 18 10 19 24 19 255 l0 245 -215 0 -215 0 0 -265z"/></g>', // quartered shield, traced from a public-domain rendering: shield filled in ink, the four quarters knocked back out in the ground colour
    iberian:
      '<path d="M6.5 17.2 V8.8 H8.5 V6.8 H10.5 V8.8 H13.5 V6.8 H15.5 V8.8 H17.5 V17.2 M11 17.2 V12.1 H13 V17.2"/>', // castle
    french:
      '<g fill="var(--seal-ink)" stroke="none" fill-rule="evenodd" transform="translate(2.14 1.63) scale(0.145)"><path d="M 47.28,45.01 c 3.3,-13.02 11.18,-21.76 19.14,-31.99 c 2.78,-3.17 2.95,-2.15 5.7,0.32 c 7.41,9.3 20.76,24.24 18.52,36.98 c -3.09,4.79 -6.22,9.56 -9.37,14.33 c -1.56,3.06 -3.23,6.06 -5.02,8.99 c -1.03,2.42 -2.03,4.84 -2.98,7.28 c -2.33,0.32 -4.67,0.58 -7.02,0.77 c -0.44,0.1 -0.77,-0.05 -1,-0.43 c -3.91,-10.87 -10.6,-20.51 -17.02,-30.02 c -1.42,-2.41 -0.15,-3.9 -0.95,-6.23 Z M 16.25,73.06 c 0.95,-7.11 4.69,-12.14 11.23,-15.09 c 17.37,-6.7 28.72,7.61 33.29,22.58 c 0.56,1.25 0.29,2.24 -0.83,2.95 c -1.55,0.58 -3.04,1.27 -4.48,2.08 c -0.34,-0.1 -0.63,-0.28 -0.85,-0.57 c -2.74,-8.6 -13.06,-14.47 -21.68,-10.5 c -4.03,2.43 -5.24,7.28 -1.03,10.23 c 0.09,0.95 -0.38,1.44 -1.4,1.46 c -8.63,1.41 -13.25,-5.52 -14.25,-13.14 Z M 77.24,80.44 c 4.13,-10.23 9.88,-21.43 21.77,-23.96 c 13.27,-2.51 28.25,10.36 20.9,23.85 c -2.88,4.66 -7.03,6.58 -12.44,5.78 c -0.52,-0.02 -0.94,-0.23 -1.25,-0.62 c 0.77,-1.08 1.63,-2.12 2.56,-3.11 c 1.53,-4.4 -2.22,-8.45 -6.49,-9.01 c -6.42,-0.54 -11.73,1.66 -15.92,6.6 c -1.05,1.6 -2.02,3.21 -2.92,4.85 c -1.89,-0.62 -3.73,-1.38 -5.52,-2.27 c -0.54,-0.6 -0.77,-1.3 -0.69,-2.11 Z M 52.03,92.15 c 10.61,-8.67 20.87,-10.05 32.5,-2.24 c 0.75,0.84 4.36,2.18 2.61,3.59 c -11.15,9.06 -22.44,9.28 -33.83,0.59 c -0.61,-0.53 -1.04,-1.18 -1.28,-1.94 Z M 78.78,102.93 c 0.55,-1.74 4.13,-2.55 5.7,-3.07 c 1.21,0.88 2.52,1.56 3.93,2.05 c 5.23,0.92 8.18,-0.51 7.26,-6.17 c -0.14,-1.36 -2.99,-4.2 -0.17,-4.36 c 16.43,1.87 12.56,23.26 -6.94,20.3 c -4.69,-1.16 -7.86,-4.41 -9.78,-8.75 Z M 32.68,101.03 c 0.26,-5.63 4.33,-9.34 9.92,-9.35 c 2.69,0.02 0.52,2.63 0.29,3.85 c -1.62,5.84 2.63,7.47 7.56,6.25 c 1.5,-0.68 2.87,-1.54 4.1,-2.58 c 1.08,0.63 4.95,2.07 5.08,3.25 c -4.04,13.84 -26.82,12.17 -26.95,-1.42 Z M 57.82,116.9 c 2.3,-4.12 4.23,-8.42 5.79,-12.87 c 0.76,-1.57 2.6,-0.18 3.83,-0.23 c 2.35,0.03 4.69,0.07 7.03,0.1 c 1.89,4.59 3.95,9.11 6.16,13.56 c -2.53,3.01 -5.12,5.98 -7.76,8.91 c -1.17,1.2 -2.38,2.33 -3.63,3.4 c -0.45,0.07 -0.8,-0.08 -1.06,-0.46 c -1.8,-3.02 -9.91,-9.7 -10.36,-12.41 Z"/></g>', // fleur-de-lis, hand-traced (project original artwork, not sourced from any external work)
    british:
      '<path d="M13.41 10.06 A1.9 1.9 0 1 1 14.28 12.74 A1.9 1.9 0 1 1 12 14.40 A1.9 1.9 0 1 1 9.72 12.74 A1.9 1.9 0 1 1 10.59 10.06 A1.9 1.9 0 1 1 13.41 10.06 Z"/><circle cx="12" cy="12" r="1.5"/>', // rose (5-lobe cinquefoil)
    netherlandish:
      '<g fill="var(--seal-ink)" stroke="none"><path d="M9.3 19.8 L10.65 11.8 H13.35 L14.7 19.8 Z"/><path d="M12.60 8.62 L15.86 4.52 L17.48 6.14 L13.38 9.40 Z"/><path d="M13.38 10.60 L17.48 13.86 L15.86 15.48 L12.60 11.38 Z"/><path d="M11.40 11.38 L8.14 15.48 L6.52 13.86 L10.62 10.60 Z"/><path d="M10.62 9.40 L6.52 6.14 L8.14 4.52 L11.40 8.62 Z"/><circle cx="12" cy="10" r="1.15"/></g>', // windmill, filled not stroked: white 1.7px lines blur on this ground at 2.42:1, the table's lowest contrast; a solid shape holds
    germanic: '<circle cx="12" cy="13.8" r="4.8"/><path d="M7.4 12.4 H16.6 M12 9 V4.6 M10.3 6.2 H13.7"/>', // Reichsapfel orb + cross
    german:
      '<g fill="var(--seal-ink)" stroke="none"><path d="M9.0 4.4 H15.0 Q13.6 9.0 13.6 10.4 Q15.0 10.4 19.6 9.0 V15.0 Q15.0 13.6 13.6 13.6 Q13.6 15.0 15.0 19.6 H9.0 Q10.4 15.0 10.4 13.6 Q9.0 13.6 4.4 15.0 V9.0 Q9.0 10.4 10.4 10.4 Q10.4 9.0 9.0 4.4 Z"/></g>', // cross pattee (Eisernes Kreuz), inset off the frame so the seal keeps its margin. Filled, never outlined: the flared concave arms are the whole difference from the swiss straight-armed cross, and an outline loses them at 16px
    austrian:
      '<path d="M6.5 5.5 H17.5 V13 C17.5 16.8 14.8 18.9 12 19.8 C9.2 18.9 6.5 16.8 6.5 13 Z" fill="var(--seal-ink)" stroke="none"/><path d="M5 9.7 H19 V13.3 H5 Z" fill="var(--seal-ground)" stroke="none"/>', // Bindenschild: a solid shield knocked out by the fess. The fess runs WIDER than the shield on purpose — flush edges leave an antialiased ink hairline down each side that welds the two red bars back together. Both bars must be ink and the band ground, or the arms invert
    swiss:
      '<path d="M10.2 6 H13.8 V10.2 H18 V13.8 H13.8 V18 H10.2 V13.8 H6 V10.2 H10.2 Z" fill="var(--seal-ink)" stroke="none"/>', // couped cross, filled: the only solid cross in the table, which is what separates it from syriac/slavic
    polish:
      '<g fill="var(--seal-ink)" stroke="none" transform="translate(4.498 4.100) scale(0.008498 -0.008498) translate(-404.20 -2103.17)"><path d="M1370 2060 c0 -10 -7 -30 -15 -46 -18 -35 -14 -40 19 -19 25 17 26 16 26 -2 0 -11 -9 -28 -20 -38 -11 -10 -20 -22 -20 -27 0 -12 38 -10 46 3 4 8 9 8 17 0 15 -15 23 -14 42 5 12 13 13 19 4 30 -9 11 -8 19 6 34 15 17 71 40 97 40 4 0 -13 -29 -38 -65 -30 -43 -44 -73 -41 -85 5 -19 -1 -20 -168 -20 l-172 0 4 23 c3 15 -9 40 -36 76 -23 30 -41 58 -41 63 0 13 51 -1 80 -22 19 -13 24 -25 22 -48 -3 -33 21 -50 43 -32 9 8 15 8 20 0 9 -15 45 -12 45 5 0 8 -9 19 -20 25 -11 6 -20 20 -20 32 0 19 1 20 25 4 13 -9 27 -16 30 -16 11 0 4 28 -10 40 -21 17 -19 40 6 66 20 21 23 22 45 7 13 -8 24 -23 24 -33z m-770 -5 c16 -42 117 -171 172 -219 29 -26 94 -73 143 -104 50 -31 101 -66 113 -77 39 -33 66 -95 66 -153 0 -45 -4 -56 -29 -82 -17 -16 -41 -31 -55 -33 -25 -4 -26 -10 -6 -37 20 -27 45 -42 82 -50 69 -16 75 -7 113 146 19 77 36 145 39 152 3 8 -10 12 -43 12 -41 0 -46 2 -35 15 7 8 25 15 40 15 33 0 60 9 60 19 0 5 -19 14 -41 21 -38 13 -45 12 -82 -8 -22 -12 -42 -21 -43 -19 -10 9 30 46 56 52 33 7 39 19 14 29 -27 10 -59 7 -82 -10 -19 -13 -22 -13 -22 0 0 17 26 45 43 47 7 1 26 2 42 4 17 1 44 14 59 28 29 27 30 27 184 27 l154 0 -14 -22 c-8 -12 -32 -31 -54 -42 l-39 -21 28 -3 c23 -3 26 -6 16 -18 -6 -8 -19 -14 -29 -14 -28 0 -29 -10 -4 -37 30 -33 31 -50 2 -31 -13 8 -32 18 -42 22 -19 6 -19 6 -3 -12 24 -26 21 -40 -8 -34 -31 6 -31 11 2 -170 l28 -148 40 0 c41 0 76 18 107 55 16 19 15 21 -22 37 -53 23 -73 57 -71 119 1 79 32 124 126 185 44 29 109 74 145 101 64 48 177 177 216 249 21 37 21 37 33 16 23 -44 24 -113 3 -174 -11 -32 -17 -58 -12 -58 4 0 24 18 44 40 20 22 39 40 42 40 15 0 -11 -107 -52 -215 -10 -29 51 30 79 74 18 30 21 32 27 15 9 -25 2 -71 -16 -108 -8 -16 -14 -30 -14 -32 0 -1 13 3 30 9 16 6 32 9 34 6 13 -12 -18 -84 -52 -121 -35 -39 -35 -41 -12 -35 14 4 35 10 48 13 31 9 29 -14 -7 -62 -37 -51 -54 -64 -126 -104 -33 -17 -62 -34 -65 -37 -13 -14 71 13 122 38 75 38 91 38 77 2 -14 -37 -64 -89 -101 -104 -34 -14 -21 -28 27 -30 l30 -1 -40 -19 c-22 -10 -53 -19 -70 -19 l-30 -1 40 -19 40 -18 -28 -11 c-16 -6 -46 -11 -67 -11 l-38 0 5 -75 c4 -54 3 -75 -6 -75 -15 0 -91 38 -112 56 -13 12 -12 4 4 -46 11 -33 17 -63 14 -67 -8 -7 -44 16 -79 52 l-28 28 0 -64 c0 -81 -11 -101 -40 -74 -11 10 -30 35 -42 54 -29 48 -28 47 -38 31 -7 -11 -11 -9 -18 11 -48 126 -102 209 -135 209 -24 0 -32 -68 -11 -91 10 -11 43 -71 74 -134 47 -96 53 -115 38 -115 -10 0 -18 -3 -18 -6 0 -20 69 -129 120 -191 52 -63 65 -73 93 -73 24 0 39 8 60 32 l27 33 25 -28 c14 -15 25 -38 25 -49 0 -20 -1 -20 -18 -5 -16 14 -23 15 -45 4 -35 -16 -34 -21 6 -32 28 -9 32 -14 32 -45 0 -24 -5 -35 -15 -35 -9 0 -14 8 -12 20 2 14 -3 21 -15 22 -10 1 -31 5 -48 9 l-30 7 33 -27 c17 -15 32 -35 32 -44 0 -23 -40 -62 -63 -62 -20 0 -20 1 1 23 12 13 22 28 22 34 0 15 -50 50 -70 50 -8 0 -26 3 -38 7 -21 7 -23 6 -13 -12 15 -28 14 -32 -8 -32 -25 0 -41 21 -48 66 l-6 37 43 -7 43 -7 -28 38 c-16 21 -38 49 -51 63 -12 14 -45 61 -73 104 l-50 80 -12 -30 c-10 -27 -12 -27 -19 -9 -5 11 -9 31 -10 45 -1 23 -1 23 -12 6 -9 -16 -14 -9 -41 54 -30 72 -51 92 -89 82 -15 -3 -56 -77 -81 -142 -4 -12 -6 -11 -6 3 -2 32 -18 9 -26 -35 l-8 -43 -10 33 c-5 17 -13 32 -16 32 -4 0 -25 -30 -46 -67 -22 -37 -60 -92 -85 -123 -81 -99 -79 -91 -27 -84 41 6 45 5 42 -12 -2 -11 -4 -25 -4 -31 -1 -18 -38 -53 -56 -53 -13 0 -14 4 -5 21 7 11 10 22 8 23 -11 10 -80 -10 -104 -29 l-29 -23 23 -31 c27 -37 9 -43 -32 -10 -33 26 -33 46 2 82 l27 29 -30 -7 c-55 -12 -56 -13 -49 -42 7 -28 7 -28 -15 -9 -23 21 -28 58 -8 73 6 6 26 14 42 18 25 7 27 9 10 13 -11 2 -23 9 -27 16 -5 8 -13 8 -28 -1 -25 -17 -30 -16 -30 1 0 8 11 28 25 43 l25 28 27 -33 c38 -44 78 -44 120 0 44 47 107 136 132 185 25 50 25 53 6 53 -19 0 -19 6 4 44 10 17 29 56 42 86 12 30 38 77 56 103 28 40 33 54 27 83 -3 18 -12 34 -20 34 -27 0 -83 -74 -120 -160 -26 -58 -41 -83 -45 -72 -5 13 -12 8 -31 -23 -14 -22 -35 -49 -47 -60 -31 -27 -41 -8 -41 75 0 45 -3 60 -10 49 -13 -22 -89 -73 -97 -66 -3 4 3 33 14 65 l20 59 -55 -34 c-82 -49 -86 -47 -79 42 l5 75 -47 0 c-49 0 -100 24 -71 33 8 3 29 10 45 15 l30 10 -40 2 c-22 0 -55 9 -74 19 l-34 18 44 7 44 7 -30 16 c-62 32 -128 114 -104 129 6 3 41 -8 77 -24 103 -47 140 -51 62 -6 -74 42 -125 86 -146 127 -16 29 -12 49 9 42 7 -2 26 -6 42 -10 l30 -6 -33 34 c-37 38 -66 106 -51 121 5 6 18 5 34 -2 25 -12 33 -4 16 14 -15 15 -30 95 -22 117 7 18 9 17 29 -14 27 -45 88 -103 78 -74 -42 110 -62 196 -49 209 3 3 22 -12 40 -34 19 -22 38 -40 43 -40 5 0 -1 26 -12 58 -21 60 -20 130 2 172 14 26 18 25 30 -5z m724 -1227 c3 -37 17 -83 32 -112 27 -51 28 -50 -23 -29 -9 4 -9 -2 0 -27 14 -36 60 -80 85 -80 15 0 15 -2 2 -10 -8 -5 -27 -10 -42 -10 -34 0 -35 -5 -3 -46 15 -20 40 -37 63 -44 50 -13 49 -14 65 16 l13 25 14 -26 c29 -54 -33 -81 -118 -52 -52 18 -56 4 -14 -41 34 -36 74 -49 108 -33 21 9 24 8 24 -9 0 -25 -29 -40 -75 -40 -33 0 -72 18 -103 47 -22 21 -27 15 -29 -34 -2 -31 -9 -54 -22 -66 -19 -19 -19 -19 -35 11 -9 17 -16 47 -16 67 0 38 -10 44 -31 19 -37 -45 -125 -58 -159 -24 -29 29 -25 40 9 27 37 -14 102 13 122 49 16 31 7 39 -32 25 -44 -15 -91 -14 -115 3 -19 14 -19 15 1 52 17 33 20 35 23 16 7 -49 74 -49 122 0 39 38 39 58 1 58 -39 0 -49 18 -16 26 24 6 62 53 78 97 6 16 5 16 -19 1 -34 -23 -37 -15 -14 32 11 22 25 66 30 99 6 33 16 70 22 83 19 37 44 3 52 -70z"/></g>', // crowned Piast eagle, traced from a public-domain heraldic rendering. Kept as one filled path and scaled to fit — it is a whole coat of arms, not a line device
    hungarian:
      '<path d="M12 4.2 V15.6 M9.4 7.2 H14.6 M8.4 10.8 H15.6"/><path d="M5 19.5 Q8 16.2 11 19.5 M9.4 19.5 Q12 15.2 14.6 19.5 M13 19.5 Q16 16.2 19 19.5"/>', // Arpad double cross on a triple mound — the mound is what tells it from the other four crosses
    norse: '<path d="M9 5 H15 M12 5 V10.5 M8.4 10.5 H15.6 L14 17.6 H10 Z"/>', // Mjolnir hammer
    slavic: '<path d="M12 4 V20 M9.6 7.4 H14.4 M7.4 11 H16.6 M9 16.2 L15 13.8"/>', // Orthodox 3-bar cross
    // ---- Mesoamerica ----
    mayan:
      '<circle cx="12" cy="12" r="3.8"/><path d="M12 4.5 V6.4 M12 17.6 V19.5 M4.5 12 H6.4 M17.6 12 H19.5 M6.7 6.7 L8 8 M17.3 6.7 L16 8 M6.7 17.3 L8 16 M17.3 17.3 L16 16"/>',
    aztec:
      '<circle cx="12" cy="12" r="1.9"/><path d="M12 4.5 L14.6 9.4 M12 4.5 L9.4 9.4 M19.5 12 L14.6 14.6 M19.5 12 L14.6 9.4 M12 19.5 L9.4 14.6 M12 19.5 L14.6 14.6 M4.5 12 L9.4 9.4 M4.5 12 L9.4 14.6"/>',
    // ---- Modern Americas ----
    american:
      '<path d="M12 4 L14.12 9.27 L19.8 9.66 L15.4 13.32 L16.85 18.9 L12 15.8 L7.15 18.9 L8.6 13.32 L4.2 9.66 L9.88 9.27 Z"/>', // 5-point star
    canadian:
      '<g fill="var(--seal-ink)" stroke="none" transform="translate(12.000 12.000) scale(0.003984 -0.003984) translate(-3002.50 -2993.00)"><path d="M2967 4693 c-116 -259 -232 -501 -247 -517 -33 -34 -71 -24 -195 53 -64 40 -119 71 -121 68 -3 -3 24 -199 61 -437 36 -237 63 -440 60 -451 -10 -29 -51 -52 -80 -45 -17 4 -80 75 -202 227 l-176 221 -43 -122 c-23 -67 -44 -123 -46 -126 -4 -3 -361 60 -460 81 -33 8 -40 38 76 -298 84 -245 85 -248 63 -256 -109 -42 -213 -85 -219 -90 -4 -4 9 -20 30 -36 20 -16 197 -158 392 -316 369 -299 390 -320 390 -391 0 -17 -19 -73 -41 -125 -23 -51 -39 -97 -35 -100 3 -3 126 8 273 26 441 53 453 54 479 42 13 -6 27 -23 30 -38 6 -22 -29 -726 -40 -800 -3 -20 2 -22 71 -25 41 -2 80 -1 86 2 10 4 7 95 -12 400 -13 217 -21 408 -17 423 3 15 17 32 30 38 26 12 38 11 479 -42 147 -18 270 -30 273 -27 3 3 -13 49 -35 101 -72 169 -66 182 186 384 237 191 526 425 565 458 l29 25 -25 10 c-14 5 -63 24 -108 43 -46 19 -91 37 -100 40 -15 5 -7 36 68 254 115 331 108 306 81 300 -12 -3 -110 -22 -217 -42 -107 -19 -207 -38 -221 -41 -26 -5 -28 -2 -69 115 -24 67 -46 121 -49 121 -4 0 -83 -95 -175 -211 -93 -116 -179 -216 -192 -221 -30 -14 -70 2 -85 35 -8 18 5 121 56 456 37 238 64 435 61 438 -2 3 -57 -28 -121 -68 -124 -77 -162 -87 -195 -53 -10 10 -76 144 -146 297 -70 152 -131 277 -134 277 -4 0 -18 -26 -33 -57z"/></g>', // maple leaf, traced from a public-domain rendering. Filled, not stroked: the eleven points and the stem come out as hairlines under a stroke and close into a blob at marker size
    'latin-american':
      '<g fill="var(--seal-ink)" stroke="none"><path d="M8.6 12.4 C8.2 9.0 9.4 6.0 12.0 5.0 C14.6 4.0 16.6 5.4 15.8 7.2 C15.2 8.5 13.6 8.8 13.2 10.2 C12.9 11.2 13.0 11.8 13.1 12.4 Z"/><path d="M7.9 12.4 H13.8 V13.9 H7.9 Z"/><path d="M11.4 13.9 H12.6 V20 H11.4 Z"/></g>', // Phrygian cap on a staff
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
  // year: astronomical year of the record being labelled, optional. A key names one
  // tradition across its whole span and is never split per polity, so a span name can
  // be an anachronism at one end of it — norse reads Norse for a saga and Nordic for a
  // 1927 observer. Pass the year wherever the caller has one; a call without a year
  // gets the span name, which is what a filter chip covering every era must show.
  // A civ the table does not name at all falls back to English 'Other', never 其他:
  // an unnamed civ on a French card must not leak Han script.
  function name(civ, lang, year) {
    const k = _key(civ);
    // Look up only the civ's own row: borrowing another civ's name row would
    // mislabel an unrecognised key as that civilization instead of 'Other'.
    const row = _names && _names[k];
    if (!row) return 'Other';
    return I18n.pick(_era(row, year) || row, lang) || 'Other';
  }

  // _era: the override whose half-open [since, until) contains `year`, or null.
  // Ranges are authored non-overlapping and validated as such offline, so the first
  // hit is the only hit. An absent bound is open on that side.
  function _era(row, year) {
    if (year == null || !isFinite(year) || !Array.isArray(row.eras)) return null;
    return row.eras.find((e) => (e.since == null || year >= e.since) && (e.until == null || year < e.until)) || null;
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

  // Paper ground for an inverted seal. Not --paper from the CSS tokens: a seal is
  // painted onto the map as well as onto cards, and it must keep the same body on
  // both grounds, so the value is frozen here.
  const GROUND = '#F7F3E9';
  const INK = '#F6F2E8';

  // svg: ground x ink are resolved once here and handed to the motif through
  // --seal-ink / --seal-ground, so a motif never names a colour of its own.
  // An inverted civ swaps the pair: device in the house colour on a paper ground.
  function svg(civ, size, tip) {
    const k = _key(civ);
    const c = info(k);
    const inv = !!c.invert;
    const ground = inv ? GROUND : c.color;
    const ink = inv ? c.color : INK;
    const motif = MOTIF[k] || '<circle cx="12" cy="12" r="4.5"/>'; // neutral fallback
    const tipAttr = tip ? ' data-tip="' + tip.replace(/"/g, '&quot;') + '"' : '';
    return (
      '<svg class="seal" width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 24 24" aria-hidden="true" style="--seal-ink:' +
      ink +
      ';--seal-ground:' +
      ground +
      '"' +
      tipAttr +
      '>' +
      '<rect x="1.5" y="1.5" width="21" height="21" rx="3" fill="' +
      ground +
      '"/>' +
      '<g fill="none" stroke="var(--seal-ink)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
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
