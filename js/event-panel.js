/**
 * event-panel.js — selected-event DETAIL builder (Sidebar.detailHtml).
 *
 * The detail renders INLINE inside the selected all-events card (.evcard), never
 * as a floating panel: a floating card fights the observe-popup (click-a-point
 * local circumstances) for the same map airspace. js/atlas.js owns that DOM and
 * calls Sidebar.detailHtml here, so this file creates no element of its own — it
 * is the pure HTML builder for the science block + linked records.
 *
 * Defines `window.Sidebar`, the API eclipse.js drives; must load BEFORE
 * map-boot.js (index.html) so it's the sole definition. eclipse.js still calls
 * Sidebar.showEclipse / showLunarEclipse on selection — now thin no-ops that just
 * remember the last event for a locale refresh; the visible inline card is
 * refreshed by Atlas.refreshEventDetail.
 *
 * Layout (jiazhu dual-row format): the folded-state head (js/atlas.js) carries the greatest-eclipse timestamp + coordinates (.ec-peak);
 * this file supplies everything below it — science strip (Saros/γ or area ratio,
 * folded "·"-joined) → an always-visible contact-time table (P-key / label /
 * date-time-UTC columns) → a period strip (central eclipse / partial / total / penumbra) → linked
 * historical records (jiehang heading note + seal-icon row; the reverse event→records
 * binding, a row click hands off to Atlas.select).
 *
 * Science fields are backfilled at build time: solar `obscuration` is derived
 * from magnitude and `centralDurationSec` is the NASA 5MCSE local
 * totality/annularity length; lunar `saros`/`gamma` come from the NASA 5MCLE
 * catalog. The only residual nulls are the
 * ~81 faint penumbral lunar eclipses NASA does not catalog — their `saros`
 * renders '—' and the `gamma`/duration entries drop out of the strip.
 *
 * Dates and times stay raw ISO/UTC — computed science, not localized prose;
 * the folded era-year subtitle (removed from the card head in this redesign)
 * was the one bridge to the historical register and is intentionally gone.
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

  // ISO timestamp → "<date> HH:MM:SS UTC". The date half is delegated to
  // Atlas.sciDate, the site's single date renderer: it converts to the Julian
  // calendar before the 1582-10-15 reform (matching the science row and every
  // eclipse catalogue these times can be checked against) and localizes the form.
  // Rendering it here instead would mean a second, divergent calendar rule —
  // and worse, an ISO-shaped Julian date, which ISO 8601 does not permit.
  // The clock time is left alone: UTC is an instant, not a calendar quantity.
  // Contact rows can cross midnight, so the date is read off each timestamp,
  // NOT the reused event date — a row past midnight then converts on its own day.
  function ctDate(iso) {
    const m = /^(-?\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    const neg = m[1][0] === '-';
    const yr = (neg ? m[1].slice(1) : m[1]).replace(/^0+/, '') || '0';
    const dateOnly = (neg ? '-' : '') + yr.padStart(4, '0') + '-' + m[2] + '-' + m[3];
    const shown = window.Atlas && Atlas.sciDate ? Atlas.sciDate(dateOnly) : dateOnly;
    return { date: dateOnly, html: esc(shown) + ' ' + m[4] + ':' + m[5] + ':' + m[6] + ' UTC' };
  }

  // Folded greatest-eclipse timestamp + coordinates line, shared by the collapsed and expanded card head
  // (js/atlas.js renders it in .ec-row1's place, once — not duplicated here).
  // Lunar peak times have no companion lat/lng in the schema, so lunar cards
  // show time only. band-only solar events append the path's ±σ° in italics.
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
    // Gate on the NUMBER existing, never on a particular path_confidence value.
    // The self-computed events below −1999 carry a ±7° longitude uncertainty yet
    // are filed as 'computed' rather than 'band-only', so keying the read-out off
    // the confidence label hides the caveat from exactly the events that need it
    // most.
    if (e._sigma_lon_deg != null) {
      html += ' <i class="mid">·</i> <span class="unc">±' + (+e._sigma_lon_deg).toFixed(1) + '°</span>';
    }
    // Head time is the GEOCENTRIC greatest, distinct from the contact table's G
    // row (the local greatest at that point), the two being under a second
    // apart. Both domains gloss it, from a _solar/_lunar pair keyed off `domain`:
    // solar is the shadow axis nearest Earth's centre and its ground intercept,
    // lunar the Moon's centre nearest the shadow axis and its sublunar point.
    const gloss = typeof I18n !== 'undefined' ? I18n.glossAttr('ecl_c_greatest_geo_' + domain) : '';
    return gloss ? '<span' + gloss + '>' + html + '</span>' : html;
  }
  window.EventPanel.peakLineHtml = peakLineHtml;

  // One row of the always-visible contact table: P-key column (astronomical
  // notation, language-independent) · localized label · date-time-UTC. The
  // gloss is duplicated onto BOTH the pk and label cells — a reader may hover
  // either "P1" or its name and expects the same explanation either way.
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
        // Central-line observer's classical contacts (point-observer timestamps) at the
        // greatest-eclipse point: first contact/second contact/greatest eclipse/third contact/fourth contact. c2→c3 is the real
        // totality/annularity (minutes), unlike the global p2/p3 umbral sweep.
        const ann = pl.phase === 'annular';
        // Whole table on ONE axis: the observer fixed at the greatest-eclipse
        // point. G is that observer's LOCAL greatest (pl.peak) — so P2<G<P3 holds
        // by construction. It differs from the geocentric greatest in the head
        // (.ec-peak, e.peak.time) by under a second, too little to be worth a
        // gloss of its own, so G reads the plain greatest-eclipse definition and
        // only the head says it is the geocentric one. pl.peak is baked at build
        // time; fall back to the head time for index entries built before that
        // field existed.
        rows += ctRow('P1', T('eclipse.contact.solar_c1.label'), pl.c1, false, 'ecl_c_p1_solar');
        rows += ctRow(
          'P2',
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
          'P3',
          T(ann ? 'eclipse.contact.solar_c3_annular.label' : 'eclipse.contact.solar_c3.label'),
          pl.c3,
          false,
          'ecl_c_p3_solar'
        );
        rows += ctRow('P4', T('eclipse.contact.solar_c4.label'), pl.c4, false, 'ecl_c_p4_solar');
      } else {
        // Legacy data without peakLocal: fall back to global-axis contacts+labels.
        rows += ctRow('P1', T('eclipse.contact.p1.label'), e.p1, false, 'ecl_c_p1_solar');
        rows += ctRow('P2', T('eclipse.contact.p2.label'), e.p2, false, 'ecl_c_p2_solar');
        rows += ctRow('G', T('eclipse.contact.greatest.label'), e.peak && e.peak.time, true, 'ecl_c_greatest');
        rows += ctRow('P3', T('eclipse.contact.p3.label'), e.p3, false, 'ecl_c_p3_solar');
        rows += ctRow('P4', T('eclipse.contact.p4.label'), e.p4, false, 'ecl_c_p4_solar');
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
      // Durations from the central-line peakLocal so the strip agrees with the
      // contact table above: total eclipse/annular eclipse = c3−c2, partial eclipse = c4−c1 (this observer's own
      // partial span). Also fixes non-NASA events whose baked centralDurationSec
      // fell back to the global U1→U4 span. Legacy data (no peakLocal) uses the
      // baked centralDurationSec (NASA) / global partialDurSec.
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
      // Lunar durations are genuine local values (the Moon is one object, not a
      // sweeping shadow): totalDurSec = U2→U3, partialDurSec = U1→U4,
      // penumbralDurSec = P1→P4. Show penumbral only for Penumbral-kind eclipses
      // (the field is non-null for Total/Partial too, so a kind-guard is required).
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

  // The reverse binding: every curated record whose event_date + type match
  // the selected event. Atlas may not have finished loading records on the
  // very first selectEvent (EclipseLoader.init is not awaited in map-boot) —
  // Atlas.init calls Sidebar.refreshRecords() when they land.
  //
  // Records render as a single jiehang heading note (record count — the head's .ec-recs
  // duplicate is hidden via .evcard.expanded .ec-recs{display:none} in CSS)
  // followed by a wrapping row of seal-icon + place chips (no year — this is
  // a "who recorded this, where" glance, not a chronology). Each chip keeps
  // the .ep-rec class (+ data-id/role/tabindex) so atlas.js's existing
  // fillEventDetail click/keyboard binding (`.ep-rec` selector) still finds it.
  // No linked records → the whole block is omitted, not shown empty.
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
      html +=
        '<span class="ep-rec-icon ep-rec" data-id="' +
        esc(r.id) +
        '" role="button" tabindex="0">' +
        (window.Seal ? Seal.svg(r.civ, 18) : '') +
        '<span class="ep-rec-place">' +
        Atlas.placeLabel(r, lang) +
        '</span></span>';
    }
    return html + '</div></div>';
  }

  // The event-detail body Atlas injects into the selected .evcard's .ec-detail:
  // science strip → contact table → period strip → linked records. Header
  // (glyph · date · greatest-eclipse timestamp / coordinates · type · magnitude) lives on the evcard in
  // atlas.js.
  function detailHtml(e, domain) {
    if (!e) return '';
    return scienceHtml(e, domain) + recordsHtml(e, domain);
  }

  window.Sidebar = {
    // No longer floats a card; the engine still calls these on selection, so we
    // just remember the event for a locale-switch refresh. The visible inline
    // card is rendered by Atlas (selectEvent → fillEventDetail).
    showEclipse(e) {
      _last = { e, domain: 'solar' };
    },
    showLunarEclipse(e) {
      _last = { e, domain: 'lunar' };
    },
    // The pure detail-HTML builder Atlas consumes for the inline evcard.
    detailHtml,
    // Shared with atlas.js's renderEventList so the folded head's greatest-eclipse timestamp +
    // coordinates line and the expanded detail agree on formatting without duplicating it.
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
