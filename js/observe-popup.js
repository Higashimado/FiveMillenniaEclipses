/**
 * observe-popup.js — click-a-point local observation panel (map popup).
 *
 * When an eclipse event is selected, clicking a map point asks: what would an
 * observer AT that point have seen? This module builds the popup HTML — the
 * local eclipse-situation glyph, the observer's own contact times + Sun/Moon
 * altitude, and, when the selected eclipse isn't visible there, the next
 * eclipse of each kind visible from that point.
 *
 * All geometry is delegated to EclipseCtl (classifySolar / solarLocalContacts /
 * classifyLunar / nextVisible — ported from AstroMeteoMap), which runs the SAME
 * Besselian evaluator as the drawn footprint. This file is presentation only.
 *
 * Forecast rows carry data-ecl-date / data-ecl-kind; the map wires them to
 * Atlas.selectEvent on popupopen (Leaflet popup HTML is inert until attached).
 */
window.ObservePanel = (function () {
  'use strict';

  // Figure column, in CSS px — MUST equal .op-fig's width in css/app.css, and the
  // label target MUST equal --fs-note. Both are handed to EclipseGlyph.renderSchematic,
  // which authors its type against them so the diagram can shrink without its labels
  // shrinking with it (the figure once sat in a 116px column and rendered 4.35px text).
  // This is the only reason the card is no longer sized by the diagram's viewBox.
  const FIG_PX = 240,
    FIG_TEXT_PX = 12;

  const T = (k, p) => (typeof I18n !== 'undefined' ? I18n.t(k, p) : k);
  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const ctl = () => window.EclipseCtl;
  // Which register the reader is in. Several presentation choices on this card fork on
  // it — shichen against hora, the approximation marker, shupai tracking — so it reads
  // the same predicate every time rather than each site testing the locale its own way.
  const isCJK = () => (typeof I18n !== 'undefined' ? I18n.isZhOrJa() : true);

  // UTC HH:MM from a Date (contact instants are computed as UTC, like the panel).
  function hhmm(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }

  // Plain ASCII "3m 21s" — no superscript m/s anywhere on the site, because that
  // unicode renders inconsistently across fonts and zoom levels. Matches the mmss
  // in js/event-panel.js.
  function mmss(ms) {
    if (ms == null || !isFinite(ms) || ms <= 0) return null;
    const s = Math.round(ms / 1000),
      m = Math.floor(s / 60);
    return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
  }

  // Apparent (refraction-corrected) alt/az of a body, matching the horizon gate.
  function bodyAltAz(body, date, lat, lng) {
    if (typeof Astronomy === 'undefined' || !(date instanceof Date) || isNaN(date.getTime())) return null;
    try {
      const obs = new Astronomy.Observer(lat, lng, 0);
      const equ = EphemCorrect.equator(body, date, obs);
      const h = Astronomy.Horizon(date, obs, equ.ra, equ.dec, 'normal');
      return { alt: h.altitude, az: h.azimuth };
    } catch (_) {
      return null;
    }
  }

  const altLabel = (h) => (h && isFinite(h.alt) ? Math.round(h.alt) + '°' : '—');

  // Whole days since the epoch, UTC. setUTCHours(0,…) lands on an exact multiple of
  // a day (no leap seconds in JS time), so this is exact — and unlike Date.UTC it is
  // safe for astronomical years 0–99, which Date.UTC would silently map to 1900–1999.
  function utcDay(d) {
    const x = new Date(d.getTime());
    x.setUTCHours(0, 0, 0, 0);
    return Math.round(x.getTime() / 86400000);
  }

  function coordStr(lat, lng) {
    const ns = lat >= 0 ? 'N' : 'S',
      ew = lng >= 0 ? 'E' : 'W';
    return Math.abs(lat).toFixed(2) + '°' + ns + ' ' + Math.abs(lng).toFixed(2) + '°' + ew;
  }

  // Local apparent solar time (difang-shishi), as an hour-of-day 0..24 — the Sun's
  // hour angle shifted so 0 = local apparent midnight, matching civil convention.
  function localApparentHour(date, lat, lng) {
    if (typeof Astronomy === 'undefined' || !(date instanceof Date) || isNaN(date.getTime())) return null;
    try {
      const obs = new Astronomy.Observer(lat, lng, 0);
      const ha = Astronomy.HourAngle(Astronomy.Body.Sun, date, obs);
      let h = (ha + 12) % 24;
      if (h < 0) h += 24;
      return h;
    } catch (_) {
      return null;
    }
  }

  // ---- twelve-shichen (CJK locales) — the double-hour reading of local apparent time ----
  // Twelve equal double-hours, each a fixed 2h, anchored at midnight (子 begins 23:00),
  // each split into an 初 (first) and 正 (second) half — so the day is finely cut into 24.
  // Because every shichen is a fixed 2h anchored at midnight, this is defined everywhere,
  // the poles included — unlike the Western hora below, which needs a finite daylight span.
  //
  //   子 23–01  丑 01–03  寅 03–05  卯 05–07  辰 07–09  巳 09–11
  //   午 11–13  未 13–15  申 15–17  酉 17–19  戌 19–21  亥 21–23   (local apparent time)
  //   初 = first half-double-hour, 正 = second. 午正 = 12:00–13:00 LAT.
  const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  // Kanji ordinals for the branch's 1-based position in the day (子=第一, 酉=第十, …),
  // shared by zh-Hans/zh-Hant/ja — the characters are identical across all three.
  const ZH_ORDINAL = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

  // Decimal hour-of-day (from localApparentHour) → "HH:MM", shared by the shichen
  // and hora cells so both name the same instant the same way.
  function hourFracToHHMM(h) {
    return (
      String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h - Math.floor(h)) * 60) % 60).padStart(2, '0')
    );
  }

  function shichenIndex(h) {
    // → { branch: 0..11, first: bool } | null
    if (h == null || !isFinite(h)) return null;
    let hh = (h + 1) % 24; // shift so 子 (idx 0) spans 23:00–01:00
    if (hh < 0) hh += 24;
    return { branch: Math.floor(hh / 2) % 12, first: hh % 2 < 1 };
  }

  function shichenLabel(h) {
    const s = shichenIndex(h);
    return s ? SHICHEN[s.branch] + (s.first ? '初' : '正') : '—';
  }

  // ---- hora inaequalis (Western locales) — the classical unequal / temporal hour ----
  // What a Latin chronicler wrote where a Chinese one wrote shichen. Daylight is split into
  // twelve equal parts and night into another twelve, so an hour STRETCHES with the season
  // (a Paris summer daylight-hora ≈ 81 min, winter ≈ 41 min) — it is NOT a fixed 60 min.
  // Anchored at sunrise/sunset, not midnight; hence undefined in polar day/night (no finite
  // span to divide) — the one case shichen handles but hora cannot.
  //
  //   Names run prima(I) … duodecima(XII); hora sexta closes at noon (meridies = end of VI),
  //   hora nona ≈ mid-afternoon — English "noon" drifted here from nona. The canonical Office
  //   (Prime=I, Terce=III, Sext=VI, None=IX, Vespers≈XII) is built on this reckoning, and
  //   "the eleventh hour" (Matt. 20, hora undecima) is a fossil of it. d./n. = diei/noctis
  //   ("of the day"/"of the night"), the genitive the source texts themselves use.
  const ROMAN12 = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const LATIN_ORD = [
    '',
    'prima',
    'secunda',
    'tertia',
    'quarta',
    'quinta',
    'sexta',
    'septima',
    'octava',
    'nona',
    'decima',
    'undecima',
    'duodecima',
  ];

  // Sun horizon crossings across [t0ms, t1ms], sorted ascending as { ms, rise }. Empty
  // when the Sun neither rises nor sets in the window (polar day/night). A 25h pad on each
  // side of the contacts (see contactTable) guarantees a bracketing crossing on both sides
  // of every row, since rise/set recur every ~24h — except at the poles, which is the point.
  function sunHorizonEvents(lat, lng, t0ms, t1ms) {
    if (typeof Astronomy === 'undefined') return [];
    const evs = [];
    try {
      const obs = new Astronomy.Observer(lat, lng, 0);
      for (const dir of [+1, -1]) {
        // +1 rise, -1 set
        let cursor = Astronomy.MakeTime(new Date(t0ms));
        for (let guard = 0; guard < 8; guard++) {
          const hit = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, dir, cursor, 2);
          if (!hit) break;
          const ms = hit.date.getTime();
          if (ms > t1ms) break;
          evs.push({ ms, rise: dir > 0 });
          cursor = Astronomy.MakeTime(new Date(ms + 60000)); // step just past this crossing
        }
      }
    } catch (_) {
      return [];
    }
    evs.sort((a, b) => a.ms - b.ms);
    return evs;
  }

  // Which unequal hour `ms` falls in, given the day's crossings. The bracketing pair
  // [start, end] is the surrounding rise→set (day) or set→rise (night); the hour index is
  // 1..12 within it. Deciding day/night by which crossing PRECEDES ms — rather than by a
  // refracted altitude test — keeps this self-consistent with the rise/set convention at
  // the ~1-minute boundary where an apparent-altitude test could pick the wrong side.
  // Returns { n, night, startMs, spanMs } or null (polar / outside the events window).
  function horaAt(ms, events) {
    let start = null,
      end = null;
    for (let i = 0; i < events.length; i++) {
      if (events[i].ms <= ms) start = events[i];
      else {
        end = events[i];
        break;
      }
    }
    if (!start || !end) return null;
    const spanMs = end.ms - start.ms;
    if (spanMs <= 0) return null;
    const n = Math.min(12, Math.max(1, Math.floor((ms - start.ms) / (spanMs / 12)) + 1));
    return { n, night: !start.rise, startMs: start.ms, spanMs };
  }

  const horaLabel = (H) => (H ? ROMAN12[H.n] + (H.night ? ' n.' : ' d.') : '—');

  // Raw glossary text by slug (optional params for computed values) + its
  // ` data-gloss="…"` attribute form (glossary-tip.js resolves the hover). Used by the
  // magnitude corner label, the duration annotation, and the per-cell shichen/hora glosses.
  const G = (slug, params) => (typeof I18n !== 'undefined' && I18n.gloss ? I18n.gloss(slug, params) : '');
  const gAttr = (slug, params) => {
    const s = G(slug, params);
    return s ? ' data-gloss="' + esc(s) + '"' : '';
  };

  // Contact desc-column label (first contact/second contact/…) → glossary slug, so the table's name column
  // gets the same hover definition the schematic's contact labels already carry.
  // Annular c2/c3 variants share the plain slug; unknown keys resolve to '' via gAttr.
  const CONTACT_DESC_GLOSS = {
    'eclipse.contact.solar_c1.label': 'ecl_c_p1_solar',
    'eclipse.contact.solar_c2.label': 'ecl_c_p2_solar',
    'eclipse.contact.solar_c2_annular.label': 'ecl_c_p2_solar',
    'eclipse.contact.solar_c3.label': 'ecl_c_p3_solar',
    'eclipse.contact.solar_c3_annular.label': 'ecl_c_p3_solar',
    'eclipse.contact.solar_c4.label': 'ecl_c_p4_solar',
    'eclipse.contact.greatest.label': 'ecl_c_greatest',
    'eclipse.contact.sunrise': 'ecl_c_sunrise',
    'eclipse.contact.sunset': 'ecl_c_sunset',
    'eclipse.contact.lunar_p1.label': 'ecl_c_p1_lunar',
    'eclipse.contact.lunar_u1.label': 'ecl_c_u1',
    'eclipse.contact.lunar_u2.label': 'ecl_c_u2',
    'eclipse.contact.lunar_u3.label': 'ecl_c_u3',
    'eclipse.contact.lunar_u4.label': 'ecl_c_u4',
    'eclipse.contact.lunar_p4.label': 'ecl_c_p4_lunar',
    'eclipse.contact.moonrise': 'ecl_c_moonrise',
    'eclipse.contact.moonset': 'ecl_c_moonset',
  };

  // Brow header (meiti running-head band), single line: place name (two-tier offline lookup, site=quezhi/
  // region=yuezhi per PlaceName.lookup) + coordinates, then current phase (or "no-eclipse") at
  // the trailing edge. Coordinates only follow a NAMED place — when lookup falls back
  // to bare coordinates as the name itself, appending them again would duplicate.
  // The band stays ONE line: the date is already printed with the forecast dates
  // elsewhere, and magnitude sits at the figure's own corner.
  // Leading signed integer of an extended-ISO astronomical date ("-000762-06-07" →
  // -762, "2030-06-01" → 2030), for era-correct place naming. null if unparseable.
  function _yearOf(dateStr) {
    const y = parseInt(dateStr, 10);
    return Number.isFinite(y) ? y : null;
  }

  // No gloss on the phase name — "Total eclipse"/"Annular eclipse" are basic
  // enough that this site's readers can be assumed to know them already.
  function browHtml(lat, lng, phaseName, phaseNone, year) {
    const p = typeof PlaceName !== 'undefined' ? PlaceName.lookup(lat, lng, undefined, year) : null;
    const hasName = !!(p && p.name);

    // Region tier (yuezhi) is an approximation, and the seal is the ONE marker that
    // says so. The heading must NOT also change ink colour: that states the same fact
    // twice and makes an approximate name read as a lesser one. The marker glyph is a
    // translated key, never a CSS literal: it is 约/約 for a Chinese or Japanese reader
    // and "c." (circa) for a Latin-script one, the same register split localHourCell
    // already makes between shichen and hora. Its gloss explains the 90 km site radius
    // on hover.
    const mark =
      hasName && p.tier === 'region'
        ? '<span class="op-mark"' + gAttr('op_approx') + '>' + esc(T('place.approx.mark')) + '</span>'
        : '';

    // Modern name is part of the place name, not a tier beside it, so it trails the
    // historical name as a parenthetical — the same idiom and the same key the records
    // card sets (js/atlas.js placeLabel). CJK needs no leading space; its parenthesis
    // supplies one.
    const mod =
      p && p.modern
        ? '<span class="op-mod">' + (isCJK() ? '' : ' ') + esc(T('atlas.place.modern', { name: p.modern })) + '</span>'
        : '';

    // The coordinates always render, and always as coordinates. Before PlaceName.load()
    // resolves there is no name, and the old fallback promoted the coordinate string into
    // the 14px/700 heading slot — the one state where this card set digits two different
    // ways. The heading now simply stays empty and collapses (see .op-place:empty).
    const place = '<div class="op-place">' + (hasName ? esc(p.name) + mod : '') + '</div>';
    const coord = '<span class="op-coord num">' + esc(coordStr(lat, lng)) + '</span>';

    // The phase text is wrapped so the letterspacing can sit on the inner span: its
    // negative right margin pulls the outer box back to the last glyph's ink, and the
    // outer box is what carries the underline.
    const phase =
      '<div class="op-phase' + (phaseNone ? ' op-none' : '') + '"><span>' + esc(phaseName) + '</span></div>';

    return '<div class="op-brow"><div class="op-head">' + mark + place + coord + phase + '</div></div>';
  }

  // Duration annotation (jiazhu) appended under the contact table. items:
  // [label, value, glossSlug?]; empty-value items drop out (mirrors event-panel.js
  // sciStrip). Own .op-dur classes — .ec-sci* belongs to the event card's layout.
  function durStrip(items) {
    const parts = items.filter((p) => p[1] != null && p[1] !== '');
    if (!parts.length) return '';
    return (
      '<div class="op-dur">' +
      parts
        .map(
          (p) =>
            '<span class="k"' +
            (p[2] ? gAttr(p[2]) : '') +
            '>' +
            esc(p[0]) +
            '</span> <span class="v">' +
            esc(p[1]) +
            '</span>'
        )
        .join('<i class="mid">·</i>') +
      '</div>'
    );
  }

  // Solar durations from THIS observer's own local contacts (central = c3−c2 for a
  // total/annular max here; partial = c4−c1) — the site-local take, matching the
  // contact table above (cf. event-panel.js:163, same central-line choice).
  function solarDurations(lc) {
    const central =
      (lc.maxPhase === 'total' || lc.maxPhase === 'annular') && lc.c2 instanceof Date && lc.c3 instanceof Date;
    const items = [];
    if (central) items.push([T('eclipse.duration.central'), mmss(lc.c3 - lc.c2), 'ecl_s_central']);
    if (lc.c1 instanceof Date && lc.c4 instanceof Date)
      items.push([T('eclipse.duration.partial'), mmss(lc.c4 - lc.c1), 'ecl_s_par']);
    return durStrip(items);
  }

  // Lunar durations (global — the Moon is one body, not a sweeping shadow): total/
  // partial from EclipseGlyph.lunarStats (baked totalDurSec/partialDurSec preferred);
  // penumbral only for Penumbral-kind (the field is non-null for total/partial too,
  // so a kind guard is required — cf. event-panel.js:183-187).
  function lunarDurations(event) {
    const st = window.EclipseGlyph && EclipseGlyph.lunarStats ? EclipseGlyph.lunarStats(event) : null;
    const isPenumbral = (event.kind || '').toLowerCase() === 'penumbral';
    const items = [];
    if (st && !isPenumbral) {
      const totMs = st.totalMin != null && isFinite(st.totalMin) ? st.totalMin * 60000 : null;
      const parMs = st.partialMin != null && isFinite(st.partialMin) ? st.partialMin * 60000 : null;
      items.push([T('eclipse.duration.total'), mmss(totMs), 'ecl_total']);
      items.push([T('eclipse.duration.partial'), mmss(parMs), 'ecl_par']);
    }
    if (isPenumbral && event.penumbralDurSec != null)
      items.push([T('eclipse.duration.penumbral'), mmss(event.penumbralDurSec * 1000)]);
    return durStrip(items);
  }

  // The local-hour cell (shichen for CJK, hora for Western), text + its hover gloss.
  // CJK reads local apparent time as a fixed double-hour; Western reads it as the
  // unequal hour a Latin chronicler would have named — see the two blocks above.
  // Each cell's gloss names only this instant (ordinal + local apparent clock time);
  // the shared mechanism explanation (what a shichen/hora IS) lives on the column
  // header instead — see contactTable — so it renders once per card, not once per row.
  // `events` (Western only) is the day's sun crossings, computed once per card.
  function localHourCell(date, lat, lng, isCJK, events) {
    const lah = localApparentHour(date, lat, lng);
    if (isCJK) {
      const s = shichenIndex(lah);
      if (!s) return { text: '—', attr: '' };
      const branch = SHICHEN[s.branch];
      return {
        text: branch + (s.first ? '初' : '正'),
        attr: gAttr('op_shichen_cell', { ord: ZH_ORDINAL[s.branch], lat: hourFracToHHMM(lah) }),
      };
    }
    const H = horaAt(date.getTime(), events);
    if (!H) return { text: '—', attr: '' };
    const latin = 'hora ' + LATIN_ORD[H.n] + (H.night ? ' noctis' : ' diei');
    return {
      text: horaLabel(H),
      attr: gAttr('op_hora_cell', { latin, time: lah == null ? '—' : hourFracToHHMM(lah) }),
    };
  }

  // Contact table. defs: [pk, labelKey, Date, forceVisible?]. A contact below the
  // horizon (Sun/Moon set) is shown dimmed — the instant is geometrically real
  // but not observable there. Sunrise/sunset markers are forceVisible. Each row
  // also carries local apparent time in the third column: a shichen double-hour under
  // CJK locales, an unequal hora under Western ones. Both explain themselves on
  // hover (data-gloss → the themed card), so no on-card caption text is needed.
  //
  // Column order is P-key · CJK-name · shichen/hora · UTC · altitude, matching the event card's
  // .ec-ct (pk | k | v) rather than inverting its first two.
  //
  // refDay anchors the day markers: an eclipse can straddle UTC midnight, and the
  // brow dates the event, not each row. Rows are marked relative to greatest eclipse (the day
  // the brow names), so first contact the evening before reads −1 and a fourth contact after midnight
  // reads +1. Local apparent time never straddles here, so its column needs no marker.
  function contactTable(defs, body, lat, lng, refDate) {
    const refDay = refDate instanceof Date && !isNaN(refDate.getTime()) ? utcDay(refDate) : null;
    const cjk = isCJK();
    // Western hora needs the day's sun crossings. Compute them ONCE over a window
    // padded 25h past the outermost contact — enough to bracket every row (rise/set
    // recur ~24h) yet cheap (~4-6 searches vs 3 per row). Skipped entirely for CJK.
    let events = [];
    if (!cjk) {
      const ms = defs
        .map((d) => d[2])
        .filter((d) => d instanceof Date && !isNaN(d.getTime()))
        .map((d) => d.getTime());
      if (ms.length) {
        events = sunHorizonEvents(lat, lng, Math.min(...ms) - 25 * 3600e3, Math.max(...ms) + 25 * 3600e3);
      }
    }
    const rows = defs
      .map(([pk, labelKey, date, force]) => {
        if (!(date instanceof Date) || isNaN(date.getTime())) return '';
        const h = bodyAltAz(body, date, lat, lng);
        const below = !force && h && isFinite(h.alt) && h.alt < 0;
        const peak = pk === 'G';
        const cls = [below && 'op-ct-below', peak && 'op-ct-peak'].filter(Boolean).join(' ');
        const lh = localHourCell(date, lat, lng, cjk, events);
        const shift = refDay == null ? 0 : utcDay(date) - refDay;
        // ±1 rather than locale-specific next/previous-day kanji: the day-offset tag is the same in every locale the
        // site ships, and two characters is all the column can spare.
        const day = shift ? '<i class="op-ct-day">' + (shift > 0 ? '+' : '−') + Math.abs(shift) + '</i>' : '';
        // Same gloss on the pk cell (P1…P4) as on its name — a reader may hover
        // either.
        const descGloss = gAttr(CONTACT_DESC_GLOSS[labelKey]);
        return (
          '<tr' +
          (cls ? ' class="' + cls + '"' : '') +
          '>' +
          '<td class="op-ct-key"' +
          descGloss +
          '>' +
          esc(pk) +
          '</td>' +
          '<td class="op-ct-desc"' +
          descGloss +
          '>' +
          esc(T(labelKey)) +
          '</td>' +
          '<td class="op-ct-sc"' +
          lh.attr +
          '>' +
          esc(lh.text) +
          '</td>' +
          '<td class="op-ct-time"' +
          gAttr('op_ct_utc') +
          '>' +
          (hhmm(date) || '—') +
          day +
          '</td>' +
          '<td class="op-ct-alt num">' +
          altLabel(h) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    if (!rows) return '';
    // Column header — the local-hour column is shichen (CJK) or "Hora" (Western),
    // one key whose value tracks the same locale split as the cells below it, so header
    // and body can never disagree; UTC is the universal abbreviation; the altitude column reuses the
    // existing star.altitude key. The mechanism gloss (what a shichen/hora IS) sits
    // here, once, rather than repeating on every row's cell.
    const head =
      '<thead><tr>' +
      '<td class="op-ct-key"></td><td class="op-ct-desc"></td>' +
      '<td class="op-ct-sc"' +
      gAttr(isCJK ? 'shichen_mechanism' : 'hora_mechanism') +
      '>' +
      esc(T('eclipse.card.localhour')) +
      '</td>' +
      '<td class="op-ct-time">UTC</td>' +
      '<td class="op-ct-alt">' +
      esc(T('star.altitude')) +
      '</td>' +
      '</tr></thead>';
    return '<table class="op-contacts">' + head + '<tbody>' + rows + '</tbody></table>';
  }

  // Next-visible forecast (four kinds). Rows carry data attrs for map wiring.
  //
  // Each slot is a BUCKET, not a phase: nextVisible files annular maxima under
  // solarTotal (js/eclipse.js:403) and penumbral ones under lunarPartial (:414),
  // so a slot's own true phase can differ from its label. That distinction was
  // shown here as a trailing annotation, but it read as a plain duplicate on
  // the two rows where phase and label already say the same thing, so it was
  // dropped; the label is what's shown, per bucket, not the resolved phase.
  function forecastHtml(slots) {
    if (!slots) return '<div class="op-note">' + T('panel.eclipse.loading') + '</div>';
    const row = (labelKey, slot) => {
      const lbl = T(labelKey);
      if (!slot || !slot.event)
        return '<div class="op-fc-row"><span class="op-k">' + lbl + '</span><span class="op-v op-none">—</span></div>';
      // event.date is the raw ISO date-only form ("2030-06-01" / "-001999-11-18").
      // The data attr stays raw (machine-read: map wiring keys on it); the visible
      // cell is dated the same way the shu'er dates events (Atlas.sciDate — Julian
      // calendar before 1582, BCE gloss, no bare -0/leading-0 year), guarded for
      // pre-Atlas-boot calls. Keeping the raw attr and the shown date apart is what
      // lets the display calendar change without touching any of the map wiring.
      const shownDate = window.Atlas && Atlas.sciDate ? Atlas.sciDate(slot.event.date) : slot.event.date;
      return (
        '<div class="op-fc-row op-fc" role="button" tabindex="0" data-ecl-date="' +
        esc(slot.event.date) +
        '" data-ecl-kind="' +
        esc(slot.event._kind) +
        '"><span class="op-k">' +
        lbl +
        '</span><span class="op-v num">' +
        esc(shownDate) +
        '</span></div>'
      );
    };
    return (
      '<div class="op-forecast">' +
      row('panel.eclipse.next_solar_partial', slots.solarPartial) +
      row('panel.eclipse.next_solar_total', slots.solarTotal) +
      row('panel.eclipse.next_lunar_partial', slots.lunarPartial) +
      row('panel.eclipse.next_lunar_total', slots.lunarTotal) +
      '</div>'
    );
  }

  function notVisibleHtml(lat, lng, fromDate, year) {
    const c = ctl();
    const slots = c && c.nextVisible ? c.nextVisible(lat, lng, fromDate) : null;
    return (
      browHtml(lat, lng, T('panel.eclipse.not_visible_here'), true, year) +
      '<div class="op-body op-body--full"><div class="op-say">' +
      forecastHtml(slots) +
      '</div></div>'
    );
  }

  function solarHtml(event, lat, lng) {
    const c = ctl();
    const lc = c && c.solarLocalContacts ? c.solarLocalContacts(event, lat, lng) : null;
    const from = new Date(isFinite(event._peakMs) ? event._peakMs : Date.parse(event.peak && event.peak.time));
    const year = _yearOf(event.date);
    if (!lc || !lc.visible) return notVisibleHtml(lat, lng, from, year);

    const central =
      (lc.maxPhase === 'total' || lc.maxPhase === 'annular') && lc.c2 instanceof Date && lc.c3 instanceof Date;
    const phaseName = T('eclipse.type.solar.' + String(lc.maxPhase || '').toLowerCase());

    // Point-observer contacts (this location's own first contact/second contact/greatest eclipse/third contact/fourth contact) —
    // NOT the global external/internal tangency contacts the event card once mislabeled these as.
    const ann = lc.maxPhase === 'annular';
    const defs = [
      ['P1', 'eclipse.contact.solar_c1.label', lc.c1],
      ['P2', ann ? 'eclipse.contact.solar_c2_annular.label' : 'eclipse.contact.solar_c2.label', lc.c2],
      ['G', 'eclipse.contact.greatest.label', lc.maxTime],
      ['P3', ann ? 'eclipse.contact.solar_c3_annular.label' : 'eclipse.contact.solar_c3.label', lc.c3],
      ['P4', 'eclipse.contact.solar_c4.label', lc.c4],
    ];
    if (lc.sunrise) defs.push(['', 'eclipse.contact.sunrise', lc.sunrise, true]);
    if (lc.sunset) defs.push(['', 'eclipse.contact.sunset', lc.sunset, true]);
    defs.sort(
      (a, b) => (a[2] instanceof Date ? a[2].getTime() : Infinity) - (b[2] instanceof Date ? b[2].getTime() : Infinity)
    );

    // Sky-path eclipse phase diagram (shixiangtu) replaces the small local glyph. A below-horizon exterior
    // contact is swapped for its sunrise/sunset horizon marker so the arc keeps a
    // visible endpoint; the true P1/P4 stay in the contact table.
    const diagContacts = {
      maxPhase: lc.maxPhase,
      maxTime: lc.maxTime,
      c1: lc.sunrise || lc.c1,
      c4: lc.sunset || lc.c4,
      c1AtHorizon: !!lc.sunrise,
      c4AtHorizon: !!lc.sunset,
    };
    const sgloss = {
      P1: G(lc.sunrise ? 'ecl_c_sunrise' : 'ecl_c_p1_solar'),
      G: G('ecl_c_greatest'),
      P4: G(lc.sunset ? 'ecl_c_sunset' : 'ecl_c_p4_solar'),
      sunpath: G('ecl_sunpath'),
    };
    const slabels = {
      P1: lc.sunrise ? T('eclipse.contact.sunrise') : undefined,
      P4: lc.sunset ? T('eclipse.contact.sunset') : undefined,
    };
    // colPx/textPx must match .op-fig's width in css/app.css: the schematic sizes its
    // type against the column it is given, so the figure shrinks while its labels stay
    // at --fs-note on screen. Change one, change the other.
    const diagram =
      window.EclipseGlyph && EclipseGlyph.renderSchematic
        ? EclipseGlyph.renderSchematic(event, {
            observer: { lat, lng },
            contacts: diagContacts,
            gloss: sgloss,
            labels: slabels,
            colPx: FIG_PX,
            textPx: FIG_TEXT_PX,
          })
        : '';

    // magnitude, pinned at the figure's own top-right corner rather than the brow — the
    // figure is what it describes, and the brow now carries only place + phase.
    const magLabel =
      '<div class="op-fig-mag"' +
      gAttr('ecl_magnitude') +
      '>' +
      esc(T('eclipse.card.magnitude')) +
      ' ' +
      esc(lc.maxMag != null ? lc.maxMag.toFixed(3) : '—') +
      '</div>';

    let fig;
    if (diagram) {
      fig = magLabel + '<div class="ecl-diagram ecl-diagram--solar">' + diagram + '</div>';
    } else {
      // Fallback (astronomy engine unavailable): the original compact glyph + a note.
      const glyph =
        window.EclipseGlyph && EclipseGlyph.renderLocal
          ? EclipseGlyph.renderLocal(event, { maxPhase: lc.maxPhase, maxMag: lc.maxMag, size: 76 })
          : '';
      let note = T('eclipse.card.magnitude') + ' ' + (lc.maxMag != null ? lc.maxMag.toFixed(3) : '—');
      if (central) note += ' · ' + (mmss(lc.c3 - lc.c2) || '—');
      fig = '<div class="op-diagram">' + glyph + '</div><div class="op-fig-note">' + esc(note) + '</div>';
    }

    return (
      browHtml(lat, lng, phaseName, false, year) +
      '<div class="op-body"><div class="op-fig">' +
      fig +
      '</div><div class="op-say">' +
      contactTable(defs, Astronomy.Body.Sun, lat, lng, lc.maxTime) +
      solarDurations(lc) +
      '</div></div>'
    );
  }

  function lunarHtml(event, lat, lng) {
    const c = ctl();
    const cl = c && c.classifyLunar ? c.classifyLunar(event, lat, lng) : null;
    const from = new Date(isFinite(event._peakMs) ? event._peakMs : Date.parse(event.times && event.times.peak));
    const year = _yearOf(event.date);
    if (!cl || !cl.visible) return notVisibleHtml(lat, lng, from, year);

    const t = event.times || {};
    const Moon = Astronomy.Body.Moon;
    // The phase of THIS place, not of the event. classifyLunar already computes the
    // deepest phase that clears the local horizon; naming the card from the global
    // event.kind instead — as this did — meant a site where only the partial phase
    // ever rose still read total lunar eclipse, on a card whose entire claim is visible from this location.
    // event.kind stays as the fallback for when the classifier gives nothing.
    const phaseName = T('eclipse.type.lunar.' + String(cl.maxPhase || event.kind || '').toLowerCase());

    const iso = (s) => (s ? new Date(Date.parse(s)) : null);
    const defs = [
      ['P1', 'eclipse.contact.lunar_p1.label', iso(t.p1)],
      ['U1', 'eclipse.contact.lunar_u1.label', iso(t.u1)],
      ['U2', 'eclipse.contact.lunar_u2.label', iso(t.u2)],
      ['G', 'eclipse.contact.greatest.label', iso(t.peak)],
      ['U3', 'eclipse.contact.lunar_u3.label', iso(t.u3)],
      ['U4', 'eclipse.contact.lunar_u4.label', iso(t.u4)],
      ['P4', 'eclipse.contact.lunar_p4.label', iso(t.p4)],
    ];
    for (const mk of moonHorizonMarkers(t.p1, t.p4, lat, lng)) defs.push(mk);
    defs.sort(
      (a, b) => (a[2] instanceof Date ? a[2].getTime() : Infinity) - (b[2] instanceof Date ? b[2].getTime() : Infinity)
    );

    // Shadow-cone eclipse phase diagram, shixiangtu (global geometry — location-independent) replaces the glyph.
    const lgloss = {
      umbra: G('ecl_umbra'),
      penumbra: G('ecl_penumbra'),
      ecliptic: G('ecl_ecliptic'),
      moonpath: G('ecl_moonpath'),
      shadowcenter: G('ecl_shadow_center'),
      contacts: {
        P1: G('ecl_c_p1_lunar'),
        U1: G('ecl_c_u1'),
        U2: G('ecl_c_u2'),
        G: G('ecl_c_greatest'),
        U3: G('ecl_c_u3'),
        U4: G('ecl_c_u4'),
        P4: G('ecl_c_p4_lunar'),
      },
    };
    const diagram =
      window.EclipseGlyph && EclipseGlyph.renderSchematic
        ? EclipseGlyph.renderSchematic(event, { gloss: lgloss, colPx: FIG_PX, textPx: FIG_TEXT_PX })
        : '';

    const umag =
      event.umbralMag != null
        ? (+event.umbralMag).toFixed(3)
        : event.magnitude != null
          ? (+event.magnitude).toFixed(3)
          : null;

    const magLabel =
      umag != null
        ? '<div class="op-fig-mag"' +
          gAttr('ecl_umag') +
          '>' +
          esc(T('eclipse.magnitude.umbral')) +
          ' ' +
          esc(umag) +
          '</div>'
        : '';

    let fig;
    if (diagram) {
      fig = magLabel + '<div class="ecl-diagram">' + diagram + '</div>';
    } else {
      const glyph = window.EclipseGlyph && EclipseGlyph.render ? EclipseGlyph.render(event, { size: 76 }) : '';
      let note = T('eclipse.magnitude.umbral') + ' ' + (umag != null ? umag : '—');
      if (event.obscuration != null) note += ' · ' + T('eclipse.obscuration') + ' ' + (+event.obscuration).toFixed(2);
      fig = '<div class="op-diagram">' + glyph + '</div><div class="op-fig-note">' + esc(note) + '</div>';
    }

    return (
      browHtml(lat, lng, phaseName, false, year) +
      '<div class="op-body"><div class="op-fig">' +
      fig +
      '</div><div class="op-say">' +
      contactTable(defs, Moon, lat, lng, iso(t.peak)) +
      lunarDurations(event) +
      '</div></div>'
    );
  }

  // Moonrise/moonset instants (apparent alt 0) inside [p1,p4] — forceVisible marker
  // rows. Mirrors the solar sunrise/sunset scan: coarse sign sweep then bisection.
  function moonHorizonMarkers(p1Iso, p4Iso, lat, lng) {
    const out = [];
    const p1 = Date.parse(p1Iso),
      p4 = Date.parse(p4Iso);
    if (typeof Astronomy === 'undefined' || !isFinite(p1) || !isFinite(p4) || p4 <= p1) return out;
    const Moon = Astronomy.Body.Moon;
    const upAt = (ms) => {
      const h = bodyAltAz(Moon, new Date(ms), lat, lng);
      return !!(h && isFinite(h.alt) && h.alt >= 0);
    };

    const bis = (a, b) => {
      for (let k = 0; k < 28; k++) {
        const m = (a + b) / 2;
        if (upAt(m)) b = m;
        else a = m;
      }
      return new Date((a + b) / 2);
    };
    const M = 48,
      up = [];
    for (let i = 0; i <= M; i++) {
      const ms = p1 + ((p4 - p1) * i) / M;
      up.push({ ms, on: upAt(ms) });
    }
    for (let i = 1; i <= M; i++)
      if (up[i].on && !up[i - 1].on) {
        out.push(['', 'eclipse.contact.moonrise', bis(up[i - 1].ms, up[i].ms), true]);
        break;
      }
    for (let i = M; i >= 1; i--)
      if (up[i - 1].on && !up[i].on) {
        out.push(['', 'eclipse.contact.moonset', bis(up[i].ms, up[i - 1].ms), true]);
        break;
      }
    return out;
  }

  // Public: build the popup HTML for a selected event observed at (lat,lng).
  function htmlFor(event, domain, lat, lng) {
    if (!event || !ctl()) return '';
    try {
      return domain === 'solar' ? solarHtml(event, lat, lng) : lunarHtml(event, lat, lng);
    } catch (err) {
      return '<div class="op-note">' + esc(String((err && err.message) || err)) + '</div>';
    }
  }

  return { htmlFor };
})();
