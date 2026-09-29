/**
 * event-panel.js — selected-event DETAIL builder (Sidebar.detailHtml).
 *
 * Renders INLINE inside the selected all-events card (.evcard), never as a floating
 * panel: a floating card would fight the observe-popup for the same map airspace.
 * js/atlas.js owns that DOM and calls Sidebar.detailHtml, so this file only builds
 * HTML for the science block + linked records. Defines `window.Sidebar`; must load
 * BEFORE map-boot.js (index.html) so it's the sole definition.
 */
(function () {
  'use strict';

  const T = (key, params) => (typeof I18n !== 'undefined' ? I18n.t(key, params) : key);
  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const fmt = (n) => (n == null || !isFinite(+n) ? null : (+n).toFixed(2));
  const fmt3 = (n) => (n == null || !isFinite(+n) ? null : (+n).toFixed(3));
  const pct = (n) => (n == null || !isFinite(+n) ? null : (+n * 100).toFixed(1) + '%');

  let _last = null; // { e, domain } — for a locale-switch refresh

  // "206m 45s" — plain ASCII period duration. Never superscript m/s.
  function mmss(sec) {
    if (sec == null || !isFinite(sec) || sec <= 0) return null;
    const m = Math.floor(sec / 60),
      s = Math.round(sec % 60);
    return m + 'm ' + String(s).padStart(2, '0') + 's';
  }

  function latLngLabel(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    const ns = lat >= 0 ? 'N' : 'S',
      ew = lng >= 0 ? 'E' : 'W';
    return Math.abs(lat).toFixed(1) + '°' + ns + ' ' + Math.abs(lng).toFixed(1) + '°' + ew;
  }

  window.EventPanel = window.EventPanel || {};
  window.EventPanel.latLngLabel = latLngLabel;

  // ISO timestamp → "<date> HH:MM:SS UTC". The date half is delegated to Atlas.sciDate,
  // the site's single date renderer. Read off each timestamp, not the reused event
  // date, since a contact row can cross midnight and convert on its own day.
  function ctDate(iso) {
    const m = /^(-?\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    const neg = m[1][0] === '-';
    const yr = (neg ? m[1].slice(1) : m[1]).replace(/^0+/, '') || '0';
    const dateOnly = (neg ? '-' : '') + yr.padStart(4, '0') + '-' + m[2] + '-' + m[3];
    const shown = window.Atlas && Atlas.sciDate ? Atlas.sciDate(dateOnly) : dateOnly;
    return { date: dateOnly, html: esc(shown) + ' ' + m[4] + ':' + m[5] + ':' + m[6] + ' UTC' };
  }

  // Folded greatest-eclipse timestamp + coordinates line, shared by the collapsed and
  // expanded card head. Lunar peak times have no companion lat/lng in the schema, so
  // lunar cards show time only.
  function peakLineHtml(e, domain) {
    const iso = domain === 'solar' ? e.peak && e.peak.time : e.times && e.times.peak;
    const m = /T(\d{2}:\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    let html = m[1] + ' UTC';
    if (domain === 'solar' && e.peak && typeof e.peak.lat === 'number' && typeof e.peak.lng === 'number') {
      html += ' <i class="mid">·</i> ' + esc(latLngLabel(e.peak.lat, e.peak.lng));
    } else if (
      domain === 'lunar' &&
      e.subLunar &&
      typeof e.subLunar.lat === 'number' &&
      typeof e.subLunar.lng === 'number'
    ) {
      html += ' <i class="mid">·</i> ' + esc(latLngLabel(e.subLunar.lat, e.subLunar.lng));
    }

    // Gate on the NUMBER existing, never on a particular path_confidence value: the
    // self-computed events below −1999 carry this uncertainty yet are filed as
    // 'computed' rather than 'band-only'.
    if (e._sigma_lon_deg != null) {
      html += ' <i class="mid">·</i> <span class="unc">±' + (+e._sigma_lon_deg).toFixed(1) + '°</span>';
    }

    // Head time is the GEOCENTRIC greatest, a different instant from the contact
    // table's G row (the local greatest at that point); glossed from a _solar/_lunar
    // pair keyed off `domain`.
    const gloss = typeof I18n !== 'undefined' ? I18n.glossAttr('ecl_c_greatest_geo_' + domain) : '';
    return gloss ? '<span' + gloss + '>' + html + '</span>' : html;
  }
  window.EventPanel.peakLineHtml = peakLineHtml;

  // One row of the always-visible contact table: P-key column (astronomical
  // notation, language-independent) · localized label · date-time-UTC. The gloss is
  // duplicated onto BOTH the pk and label cells, so hovering either explains it.
  function ctRow(pk, label, iso, isPeak, glossSlug) {
    const v = ctDate(iso);
    if (v == null) return '';
    const gloss = glossSlug && typeof I18n !== 'undefined' ? I18n.glossAttr(glossSlug) : '';
    const calGloss = window.Atlas && Atlas.calGloss ? Atlas.calGloss(v.date) : '';
    return (
      '<tr' +
      (isPeak ? ' class="ct-peak"' : '') +
      '><td class="pk"' +
      gloss +
      '>' +
      pk +
      '</td><td class="k"' +
      gloss +
      '>' +
      esc(label) +
      '</td><td class="v num"' +
      calGloss +
      '>' +
      v.html +
      '</td></tr>'
    );
  }

  // Contact-time table. Solar reads e.p1..p4 + e.peak.time; lunar reads
  // e.times. Rows with no timestamp (e.g. p2/p3 on partials) are omitted.
  function contactsHtml(e, domain) {
    let rows = '';
    if (domain === 'solar') {
      const pl = e.peakLocal;
      if (pl) {
        // Central-line observer's classical contacts at the greatest-eclipse point,
        // C1..C4 in NASA's local naming (P/U name global contacts). c2→c3 is the real
        // totality/annularity, unlike the global p2/p3 umbral sweep.
        const ann = pl.phase === 'annular';

        // Whole table on ONE axis: the observer fixed at the greatest-eclipse point.
        // G is that observer's LOCAL greatest (pl.peak), so C2<G<C3 holds by
        // construction. Falls back to the head time when pl.peak is absent.
        rows += ctRow('C1', T('eclipse.contact.solar_c1.label'), pl.c1, false, 'ecl_c_p1_solar');
        rows += ctRow(
          'C2',
          T(ann ? 'eclipse.contact.solar_c2_annular.label' : 'eclipse.contact.solar_c2.label'),
          pl.c2,
          false,
          'ecl_c_p2_solar'
        );
        rows += ctRow(
          'G',
          T('eclipse.contact.greatest.label'),
          pl.peak || (e.peak && e.peak.time),
          true,
          'ecl_c_greatest'
        );
        rows += ctRow(
          'C3',
          T(ann ? 'eclipse.contact.solar_c3_annular.label' : 'eclipse.contact.solar_c3.label'),
          pl.c3,
          false,
          'ecl_c_p3_solar'
        );
        rows += ctRow('C4', T('eclipse.contact.solar_c4.label'), pl.c4, false, 'ecl_c_p4_solar');
      } else {
        // Legacy data without peakLocal: fall back to the global contacts, named as
        // NASA names them. The index fields p2/p3 hold U1/U4.
        rows += ctRow('P1', T('eclipse.contact.solar_gp1.label'), e.p1, false, 'ecl_c_gp1');
        rows += ctRow('U1', T('eclipse.contact.solar_gu1.label'), e.p2, false, 'ecl_c_gu1');
        rows += ctRow('GE', T('eclipse.contact.greatest.label'), e.peak && e.peak.time, true, 'ecl_c_greatest');
        rows += ctRow('U4', T('eclipse.contact.solar_gu4.label'), e.p3, false, 'ecl_c_gu4');
        rows += ctRow('P4', T('eclipse.contact.solar_gp4.label'), e.p4, false, 'ecl_c_gp4');
      }
    } else {
      const t = e.times || {};
      rows += ctRow('P1', T('eclipse.contact.lunar_p1.label'), t.p1, false, 'ecl_c_p1_lunar');
      rows += ctRow('U1', T('eclipse.contact.lunar_u1.label'), t.u1, false, 'ecl_c_u1');
      rows += ctRow('U2', T('eclipse.contact.lunar_u2.label'), t.u2, false, 'ecl_c_u2');
      rows += ctRow('G', T('eclipse.contact.greatest.label'), t.peak, true, 'ecl_c_greatest');
      rows += ctRow('U3', T('eclipse.contact.lunar_u3.label'), t.u3, false, 'ecl_c_u3');
      rows += ctRow('U4', T('eclipse.contact.lunar_u4.label'), t.u4, false, 'ecl_c_u4');
      rows += ctRow('P4', T('eclipse.contact.lunar_p4.label'), t.p4, false, 'ecl_c_p4_lunar');
    }
    if (!rows) return '';
    return '<div class="ec-contacts"><table class="ec-ct">' + rows + '</table></div>';
  }

  // A folded "·"-joined science strip: [label, value] pairs, nulls dropped.
  // Empty strip (all values missing) renders nothing rather than a bare wrap.
  function sciStrip(pairs) {
    const parts = pairs.filter((p) => p[1] != null && p[1] !== '');
    if (!parts.length) return '';

    // p = [label, value, glossSlug?]; the optional slug hangs a glossary tooltip on
    // the label chip via the shared I18n.glossAttr → glossary-tip.js path.
    const gloss = (s) => (s && typeof I18n !== 'undefined' ? I18n.glossAttr(s) : '');
    return (
      '<div class="ec-sci-wrap"><div class="ec-sci2">' +
      parts
        .map((p) => '<span class="k"' + gloss(p[2]) + '>' + esc(p[0]) + '</span> ' + p[1])
        .join(' <i class="mid">·</i> ') +
      '</div></div>'
    );
  }

  function scienceHtml(e, domain) {
    let sci1, sci2;
    if (domain === 'solar') {
      sci1 = sciStrip([
        [T('eclipse.saros'), e.saros != null ? esc(e.saros) : '—', 'saros'],
        [T('eclipse.obscuration'), pct(e.obscuration), 'obscuration'],
        [T('eclipse.gamma'), fmt3(e.gamma), 'gamma'],
      ]);

      // Durations from the central-line peakLocal so the strip agrees with the contact
      // table above (total/annular = c3−c2, partial = c4−c1); a baked centralDurationSec
      // can be the global U1→U4 span instead, used only when peakLocal is absent.
      const pl = e.peakLocal;
      const centralSec = pl && pl.c2 && pl.c3 ? (Date.parse(pl.c3) - Date.parse(pl.c2)) / 1000 : e.centralDurationSec;
      const partialSec = pl && pl.c1 && pl.c4 ? (Date.parse(pl.c4) - Date.parse(pl.c1)) / 1000 : e.partialDurSec;
      sci2 = sciStrip([
        [T('eclipse.duration.central'), mmss(centralSec), 'ecl_s_central'],
        [T('eclipse.duration.partial'), mmss(partialSec), 'ecl_s_par'],
      ]);
    } else {
      sci1 = sciStrip([
        [T('eclipse.saros'), e.saros != null ? esc(e.saros) : '—', 'saros'],
        [T('eclipse.obscuration'), pct(e.obscuration), 'obscuration'],
        [T('eclipse.gamma'), fmt3(e.gamma), 'ecl_gamma'],
      ]);

      // Lunar durations are genuine local values: totalDurSec = U2→U3, partialDurSec =
      // U1→U4, penumbralDurSec = P1→P4. Penumbral shown only for Penumbral-kind
      // eclipses — the field is non-null for Total/Partial too.
      sci2 = sciStrip([
        [T('eclipse.duration.total'), mmss(e.totalDurSec), 'duration_total'],
        [T('eclipse.duration.partial'), mmss(e.partialDurSec), 'duration_partial'],
        [
          T('eclipse.duration.penumbral'),
          e.kind === 'Penumbral' ? mmss(e.penumbralDurSec) : null,
          'duration_penumbral',
        ],
      ]);
    }
    return sci1 + contactsHtml(e, domain) + sci2;
  }

  // The reverse binding: every curated record whose event_date + type match the
  // selected event. Atlas.init calls Sidebar.refreshRecords() once records land, since
  // they may not have finished loading on the very first selectEvent.
  function recordsHtml(e, domain) {
    if (!window.Atlas || !Atlas.recordsForEvent) return '';
    const lang =
      typeof I18n !== 'undefined' && I18n.getLocale ? I18n.getLocale() : Atlas.state ? Atlas.state.lang : 'en';
    const recs = Atlas.recordsForEvent(e.date, domain);
    if (!recs.length) return '';
    let html =
      '<div class="ec-recs2"><div class="ec-recs-div">' +
      T('eclipse.card.records_title', { n: recs.length }) +
      '</div><div class="ec-recs-icons">';
    for (const r of recs) {
      // .ep-rec MUST stay on this span: atlas.js's click/keyboard binding selects on it.
      html +=
        '<span class="ep-rec-icon ep-rec" data-id="' +
        esc(r.id) +
        '" role="button" tabindex="0">' +
        (window.Seal ? Seal.svg(r.civ, 14) : '') +
        '<span class="ep-rec-place">' +
        Atlas.placeLabel(r, lang) +
        '</span></span>';
    }
    return html + '</div></div>';
  }

  // The event-detail body Atlas injects into the selected .evcard's .ec-detail:
  // science strip → contact table → period strip → linked records. The card's own
  // header (glyph · date · type · magnitude) lives on the evcard in atlas.js.
  function detailHtml(e, domain) {
    if (!e) return '';
    return scienceHtml(e, domain) + recordsHtml(e, domain);
  }

  window.Sidebar = {
    // These only remember the event for a locale-switch refresh. Atlas renders the
    // visible inline card (selectEvent → fillEventDetail); nothing here floats one.
    showEclipse(e) {
      _last = { e, domain: 'solar' };
    },
    showLunarEclipse(e) {
      _last = { e, domain: 'lunar' };
    },
    // The pure detail-HTML builder Atlas consumes for the inline evcard.
    detailHtml,
    // Shared with atlas.js's renderEventList so the folded head and the expanded
    // detail agree on formatting without duplicating it.
    peakLineHtml,
    // Called by Atlas.init once records.json lands (boot race: the first
    // selectEvent can fire before records load, leaving the records section
    // empty) — re-render the currently expanded event card.
    refreshRecords() {
      if (window.Atlas && Atlas.refreshEventDetail) Atlas.refreshEventDetail();
    },
  };

  // Re-render the expanded event card when the UI language changes.
  if (typeof I18n !== 'undefined' && I18n.subscribe) {
    I18n.subscribe(() => {
      if (window.Atlas && Atlas.refreshEventDetail) Atlas.refreshEventDetail();
    });
  }
})();
