/**
 * ev-scrub.js — intraday time scrubber (jiechi/carpenter-rule ledge).
 *
 * Hangs a slim ruled slat under the jingguan shu'er (#ev-strip); the zhupi
 * playhead drives TimeState across the event's [P1, P4] window so the umbra
 * redraws frame-by-frame without touching geometry code.
 */
const EvScrub = (() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const YUWEI = 'M-5 0 L0 2.5 L5 0 L0 8 Z'; // banxinyuwei (shared with js/atlas.js)
  // Slat viewBox; VBY = bleed above y=0. VBW deliberately tracks the slat's CSS
  // width (#ev-scrub is min(433px, …)), so user units ≈ CSS px at design size and
  // the --fs-* tokens on the <text> below mean what they say on screen. The
  // schematic in js/eclipse-glyph.js needs a compensation factor precisely because
  // its viewBox does NOT track its column; this one does. Keep them equal.
  const VBW = 434,
    VBH = 54,
    AXIS_Y = 28,
    VBY = 3;
  const TAB_W = 26,
    PADR = 14; // .ev-strip-tab width; right nav gutter (× button half-width)
  const SWEEP_MS = 12000; // wall-clock duration of a full ⏵ sweep

  // ---- DOM + per-selection state ----
  let _el = null,
    _svg = null,
    _play = null;
  let _pts = null,
    _from = 0,
    _to = 0,
    _band = null,
    _padL = TAB_W + 18;
  let _timer = 0,
    _last = 0,
    _playing = false;
  let _ro = null,
    _subscribed = false;

  const T = (k) => (typeof I18n !== 'undefined' ? I18n.t(k) : k);
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // Contact key → glossary slug: hovering a scrubber label shows the same tooltip
  // the event card / schematic carry for that contact. Missing key → no attribute.
  const CONTACT_GLOSS = {
    'eclipse.contact.solar_c1.label': 'ecl_c_p1_solar',
    'eclipse.contact.solar_c2.label': 'ecl_c_p2_solar',
    'eclipse.contact.solar_c3.label': 'ecl_c_p3_solar',
    'eclipse.contact.solar_c4.label': 'ecl_c_p4_solar',
    'eclipse.contact.greatest.label': 'ecl_c_greatest',
    'eclipse.contact.lunar_p1.label': 'ecl_c_p1_lunar',
    'eclipse.contact.lunar_u1.label': 'ecl_c_u1',
    'eclipse.contact.lunar_u2.label': 'ecl_c_u2',
    'eclipse.contact.lunar_u3.label': 'ecl_c_u3',
    'eclipse.contact.lunar_u4.label': 'ecl_c_u4',
    'eclipse.contact.lunar_p4.label': 'ecl_c_p4_lunar',
  };
  const glossAttr = (slug) => {
    const s = slug && typeof I18n !== 'undefined' && I18n.gloss ? I18n.gloss(slug) : '';
    return s ? ' data-gloss="' + s.replace(/"/g, '&quot;') + '"' : '';
  };

  // ---- Label collision avoidance ----
  // Short events squeeze second/third contact within a couple of minutes of greatest,
  // so their ticks land within a few user units of each other and the labels smear
  // into an unreadable blot. Rather than nudge or stagger (both cost vertical room
  // the slat does not have, and both break the label→tick correspondence), drop the
  // lower-ranked label outright: the tick stays, only its name goes.
  const LABEL_GAP = 2.5; // half the min clear space between two label boxes, in user units
  // Range endpoints as \u escapes, not literal characters. Two endpoints this class
  // needs (U+FAFF, U+FF00) are unassigned codepoints, so spelled out they are invisible
  // in an editor — and the font subsetter, which scans js/ as shipped text, read all
  // eight endpoints as glyphs the corpus needs. No face can supply an unassigned
  // codepoint, so the font coverage guard could never go green while they sat here.
  const CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60]/;

  // Rank decides who survives a clash: greatest eclipse > first/fourth contact > the rest.
  function labelRank(p) {
    if (p.key === 'eclipse.contact.greatest.label') return 2;
    return p.major ? 1 : 0;
  }

  // Advance-width estimate at --fs-body. Exact measurement would need getComputedTextLength
  // on a laid-out node (two reflows per frame during playback); the labels are short and
  // this only has to be good enough to decide "do these two boxes touch".
  function labelWidth(text) {
    let w = 0;
    for (const ch of String(text)) w += CJK_RE.test(ch) ? 13.5 : 7.4;
    return w;
  }

  // Greedy placement in rank order: each label claims [x-w/2, x+w/2] padded by
  // LABEL_GAP; anything overlapping a claimed span is dropped.
  function placeLabels(items) {
    const taken = [];
    const kept = new Set();
    for (const it of items.slice().sort((a, b) => b.rank - a.rank || a.cx - b.cx)) {
      const a = it.cx - it.w / 2 - LABEL_GAP,
        b = it.cx + it.w / 2 + LABEL_GAP;
      if (taken.some((r) => a < r[1] && b > r[0])) continue;
      taken.push([a, b]);
      kept.add(it);
    }
    return kept;
  }

  // ---- Axis ↔ time mapping (single source of truth = TimeState.current) ----
  const tOfMs = (ms) => clamp01((ms - _from) / (_to - _from || 1));
  const xOfT = (t) => _padL + t * (VBW - _padL - PADR);
  const msOfT = (t) => _from + clamp01(t) * (_to - _from);
  const nowMs = () => (typeof TimeState !== 'undefined' ? TimeState.current.getTime() : _from);

  // ---- UTC time-of-day (HH:MM) — the scrubber is a light readout; the event
  //      card's contact table carries the exact seconds. ----
  function fmtUTC(ms) {
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '—';
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }

  // ---- Contact model from the live event. Missing contacts (partial / penumbral
  //      events lack u2/u3, etc.) are simply skipped. Labels reuse the app's
  //      existing eclipse.contact.* i18n keys, so all 7 locales are covered. ----
  function contactsFor(e, kind) {
    const pts = [];
    // short = western abbreviation; cjkShow = show full label in CJK even when cap=true.
    const add = (iso, key, major, cap, short, cjkShow) => {
      if (!iso) return;
      const ms = Date.parse(iso);
      if (isFinite(ms)) pts.push({ ms, key, major: !!major, cap: !!cap, short: short || '', cjkShow: !!cjkShow });
    };
    if (kind === 'solar') {
      // All ticks on ONE axis — the observer at the greatest-eclipse point — so
      // the P-keys match the event card exactly and the second contact→third contact band lines up:
      // c1/c2/peak/c3/c4 all local (peakLocal). Fall back to the global p1..p4 +
      // geocentric peak for index entries built before peakLocal carried them.
      const pl = e.peakLocal || {};
      add(pl.c1 || e.p1, 'eclipse.contact.solar_c1.label', true, false, 'P1');
      add(pl.c2 || e.p2, 'eclipse.contact.solar_c2.label', false, true, 'P2');
      add(pl.peak || (e.peak && e.peak.time), 'eclipse.contact.greatest.label', true, false, 'G');
      add(pl.c3 || e.p3, 'eclipse.contact.solar_c3.label', false, true, 'P3');
      add(pl.c4 || e.p4, 'eclipse.contact.solar_c4.label', true, false, 'P4');
    } else {
      const t = e.times || {};
      add(t.p1, 'eclipse.contact.lunar_p1.label', false, true, 'P1', true); // penumbra-start (CJK label)
      add(t.u1, 'eclipse.contact.lunar_u1.label', true, false, 'U1'); // first contact
      add(t.u2, 'eclipse.contact.lunar_u2.label', false, false, 'U2'); // second contact
      add(t.peak, 'eclipse.contact.greatest.label', true, false, 'G'); // greatest eclipse
      add(t.u3, 'eclipse.contact.lunar_u3.label', false, false, 'U3'); // third contact
      add(t.u4, 'eclipse.contact.lunar_u4.label', true, false, 'U4'); // fourth contact
      add(t.p4, 'eclipse.contact.lunar_p4.label', false, true, 'P4', true); // penumbra-end (CJK label)
    }
    pts.sort((a, b) => a.ms - b.ms);
    return pts;
  }

  // ---- Lazy DOM (reused across selections; only ever hidden on detach) ----
  function ensureEl(parent) {
    if (_el && _el.parentNode === parent) return;
    if (_el) _el.remove();
    _el = document.createElement('div');
    _el.id = 'ev-scrub';
    _play = document.createElement('button');
    _play.className = 'scrub-play';
    _play.setAttribute('aria-label', 'play');
    _play.textContent = '⏵';
    _play.style.width = TAB_W + 'px';
    _play.addEventListener('click', toggle);
    _svg = document.createElementNS(NS, 'svg');
    _svg.setAttribute('viewBox', '0 -' + VBY + ' ' + VBW + ' ' + (VBH + VBY));
    _svg.style.overflow = 'visible'; // labels near axis endpoints bleed past viewBox
    _el.appendChild(_play);
    _el.appendChild(_svg);
    parent.appendChild(_el);
    // The slat lives inside the Leaflet container; stop pointer/scroll from
    // bubbling into the map's own drag/zoom handlers (same fix the strip uses).
    if (window.L && L.DomEvent) {
      L.DomEvent.disableClickPropagation(_el);
      L.DomEvent.disableScrollPropagation(_el);
    }
    wireDrag();
  }

  // ---- Pointer drag → TimeState.setTime (guarded capture; mirrors atlas.js's
  //      wireTimelineGestures — non-active pointer ids throw on capture). ----
  function wireDrag() {
    const hit = (ev) => {
      const r = _svg.getBoundingClientRect();
      if (!r.width) return null; // 0-width viewport → no drag
      const vx = ((ev.clientX - r.left) / r.width) * VBW;
      return clamp01((vx - _padL) / (VBW - _padL - PADR));
    };

    const onMove = (ev) => {
      const t = hit(ev);
      if (t == null) return;
      stopPlayback(); // a manual grab cancels ⏵
      if (typeof TimeState !== 'undefined') TimeState.setTime(new Date(msOfT(t)));
      ev.preventDefault();
    };
    _svg.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      try {
        _svg.setPointerCapture(ev.pointerId);
      } catch (_) {}
      onMove(ev);
      const move = (e) => onMove(e);
      const up = () => {
        try {
          _svg.releasePointerCapture(ev.pointerId);
        } catch (_) {}
        _svg.removeEventListener('pointermove', move);
        _svg.removeEventListener('pointerup', up);
        _svg.removeEventListener('pointercancel', up);
      };
      _svg.addEventListener('pointermove', move);
      _svg.addEventListener('pointerup', up);
      _svg.addEventListener('pointercancel', up);
    });
  }

  // ---- Glue the slat's top to the ear's bottom + track the tab width so the ⏵
  //      and the axis inset stay under the tab across locales. ----
  function position() {
    if (!_el) return;
    const strip = document.getElementById('ev-strip');
    // Bail while the ear is hidden / not laid out (offsetHeight 0) — a ResizeObserver
    // tick can fire mid-teardown; repositioning then would glue the slat to y≈0.
    if (!strip || !strip.offsetHeight) return;
    _el.style.top = strip.offsetTop + strip.offsetHeight + 8 + 'px';
    const tab = strip.querySelector('.ev-strip-tab');
    const w = tab ? Math.round(tab.getBoundingClientRect().width) : TAB_W;
    if (w) {
      _play.style.width = w + 'px';
      _padL = w + 18;
    }
  }

  function render() {
    if (!_el || !_svg || !_pts) return;
    const curMs = nowMs(),
      px = xOfT(tOfMs(curMs));
    let s = '';
    // Lunar totality band (second contact→third contact); solar's internal tangency span is a ~2-min sliver → omitted.
    if (_band) {
      const xa = xOfT(tOfMs(_band[0])),
        xb = xOfT(tOfMs(_band[1]));
      s +=
        '<rect x="' +
        xa.toFixed(1) +
        '" y="' +
        (AXIS_Y - 3) +
        '" width="' +
        (xb - xa).toFixed(1) +
        '" height="6" fill="var(--ink,#2B2A26)" opacity="0.12"/>';
    }
    // wusilan axis line.
    s +=
      '<line x1="' +
      _padL +
      '" y1="' +
      AXIS_Y +
      '" x2="' +
      (VBW - PADR) +
      '" y2="' +
      AXIS_Y +
      '" stroke="var(--ink-note,#696353)" stroke-width="1"/>';
    // Contacts: tick + optional label. CJK: full names (penumbra-start/end included via cjkShow);
    // western: short abbreviations (P1/G/U1…) for all labeled contacts.
    const cjk = /^(zh|ja)/.test(typeof I18n !== 'undefined' && I18n.getLocale ? I18n.getLocale() : 'en');
    const wanted = [];
    for (const p of _pts) {
      const showLabel = cjk ? p.major || !p.cap || p.cjkShow : !!p.short;
      if (!showLabel) continue;
      const label = cjk ? T(p.key) : p.short;
      wanted.push({ p, label, cx: xOfT(tOfMs(p.ms)), w: labelWidth(label), rank: labelRank(p) });
    }
    const kept = placeLabels(wanted);
    const shown = new Map();
    for (const it of kept) shown.set(it.p, it.label);
    for (const p of _pts) {
      const cx = xOfT(tOfMs(p.ms)),
        h = p.major ? 7 : 4;
      s +=
        '<line x1="' +
        cx.toFixed(1) +
        '" y1="' +
        (AXIS_Y - h) +
        '" x2="' +
        cx.toFixed(1) +
        '" y2="' +
        (AXIS_Y + h) +
        '" stroke="var(--ink-note,#696353)" stroke-width="' +
        (p.major ? 1.1 : 0.7) +
        '"/>';
      if (shown.has(p)) {
        const label = shown.get(p);
        s +=
          '<text x="' +
          cx.toFixed(1) +
          '" y="' +
          (AXIS_Y + 23) +
          '" text-anchor="middle" font-family="var(--font-text)" font-size="var(--fs-body)" ' +
          'fill="var(--ink-note,#696353)"' +
          glossAttr(CONTACT_GLOSS[p.key]) +
          '>' +
          esc(label) +
          '</text>';
      }
    }
    // Endpoint UTC times, inward-anchored so they never clip the ends.
    s +=
      '<text x="' +
      _padL +
      '" y="13" text-anchor="middle" font-family="var(--font-text)" ' +
      'font-size="var(--fs-note)" fill="var(--ink-note,#696353)">' +
      fmtUTC(_from) +
      '</text>';
    s +=
      '<text x="' +
      (VBW - PADR) +
      '" y="13" text-anchor="middle" font-family="var(--font-text)" ' +
      'font-size="var(--fs-note)" fill="var(--ink-note,#696353)">' +
      fmtUTC(_to) +
      '</text>';
    // Playhead: zhupi (vermilion) yuwei + stem + current-UTC cartouche (labelled UTC).
    s +=
      '<g transform="translate(' +
      px.toFixed(1) +
      ',' +
      (AXIS_Y - 10) +
      ')"><path d="' +
      YUWEI +
      '" fill="var(--spark,#B23A2E)"/></g>';
    s +=
      '<line x1="' +
      px.toFixed(1) +
      '" y1="' +
      (AXIS_Y - 2) +
      '" x2="' +
      px.toFixed(1) +
      '" y2="' +
      (AXIS_Y + 7) +
      '" stroke="var(--spark,#B23A2E)" stroke-width="1.4"/>';
    const cw = 44,
      cx0 = Math.max(0, Math.min(VBW - cw, px - cw / 2));
    s +=
      '<rect x="' +
      cx0.toFixed(1) +
      '" y="' +
      -VBY +
      '" width="' +
      cw +
      '" height="18" rx="1.5" ' +
      'fill="var(--card,#F7F3EA)" stroke="var(--spark,#B23A2E)" stroke-width="0.7"/>';
    s +=
      '<text x="' +
      (cx0 + cw / 2).toFixed(1) +
      '" y="' +
      (-VBY + 13) +
      '" text-anchor="middle" ' +
      'font-family="var(--font-text)" font-size="var(--fs-body)" font-weight="600" fill="var(--spark,#B23A2E)">' +
      fmtUTC(curMs) +
      '</text>';
    _svg.innerHTML = s;
  }

  // ---- Playback: own setInterval loop (respects the [P1,P4] window; the shared
  //      TimeState.startPlayback would run to the 5-millennia service bound). ----
  function toggle() {
    _playing ? stopPlayback() : startPlayback();
  }

  function startPlayback() {
    if (typeof TimeState === 'undefined' || _to <= _from) return;
    if (nowMs() >= _to - 500) TimeState.setTime(new Date(_from)); // restart a finished sweep
    _playing = true;
    _last = Date.now();
    const span = _to - _from;
    _timer = setInterval(() => {
      if (!_playing) return;
      const t = Date.now(),
        dt = t - _last;
      _last = t;
      const next = nowMs() + (dt / SWEEP_MS) * span; // time-based: rate holds under throttling
      if (next >= _to) {
        TimeState.setTime(new Date(_to));
        stopPlayback();
        return;
      }
      TimeState.setTime(new Date(next));
    }, 50);
    syncPlayBtn();
  }

  function stopPlayback() {
    _playing = false;
    if (_timer) {
      clearInterval(_timer);
      _timer = 0;
    }
    syncPlayBtn();
  }

  function syncPlayBtn() {
    if (_play) _play.textContent = _playing ? '⏸' : '⏵';
  }

  // ---- Public API ----

  /**
   * Attach (or refresh) the scrubber under the ear for a selected real-time
   * event. Called from atlas.js's updateEvStrip on every (re)selection and
   * locale switch. Silently detaches for transient record kinds (kexing/huibo/yanfan)
   * or events with too few contacts to scrub.
   * @param {object} e     the solar/lunar event object (from eventByKey)
   * @param {string} kind  'solar' | 'lunar' | other (other → detach)
   */
  function attach(e, kind) {
    if (!e || (kind !== 'solar' && kind !== 'lunar')) {
      detach();
      return;
    }
    const pts = contactsFor(e, kind);
    const strip = document.getElementById('ev-strip');
    if (pts.length < 2 || !strip || !strip.parentNode) {
      detach();
      return;
    }
    _pts = pts;
    // Axis window: prefer TimeState's locked [P1,P4] (exactly what the geometry is
    // bounded to on selection); fall back to the contact span if unlocked.
    const lr = typeof TimeState !== 'undefined' ? TimeState.lockedRange : null;
    if (lr && lr.from && lr.to) {
      _from = lr.from.getTime();
      _to = lr.to.getTime();
    } else {
      _from = pts[0].ms;
      _to = pts[pts.length - 1].ms;
    }
    if (_to <= _from) {
      detach();
      return;
    }
    // Shaded band: lunar [second contact u2, third contact u3]; solar [peakLocal.c2, c3] (second contact→third contact at greatest-eclipse
    // point — e.p2/p3 are geocentric shadow-on-Earth span, up to hours wide; peakLocal is local).
    _band = null;
    if (kind === 'lunar' && e.times && e.times.u2 && e.times.u3) {
      const a = Date.parse(e.times.u2),
        b = Date.parse(e.times.u3);
      if (isFinite(a) && isFinite(b) && b > a) _band = [a, b];
    } else if (kind === 'solar' && e.peakLocal && e.peakLocal.c2 && e.peakLocal.c3) {
      const a = Date.parse(e.peakLocal.c2),
        b = Date.parse(e.peakLocal.c3);
      if (isFinite(a) && isFinite(b) && b > a) _band = [a, b];
    }
    ensureEl(strip.parentNode);
    _el.style.display = '';
    // One permanent TimeState subscriber (no unsubscribe API); it no-ops while
    // the slat is hidden, so repeated attach never stacks listeners.
    if (!_subscribed && typeof TimeState !== 'undefined') {
      TimeState.subscribe(() => {
        if (_el && _el.style.display !== 'none') render();
      });
      _subscribed = true;
    }
    // Keep glued under the ear as it reflows (chronicle line count / font load).
    if (!_ro && typeof ResizeObserver !== 'undefined') {
      _ro = new ResizeObserver(() => {
        position();
        render();
      });
    }
    if (_ro) {
      _ro.disconnect();
      _ro.observe(strip);
    }
    position();
    render();
    syncPlayBtn();
  }

  /** Hide the scrubber + stop playback (deselection / non-real-time kinds). */
  function detach() {
    stopPlayback();
    if (_ro) _ro.disconnect();
    if (_el) _el.style.display = 'none';
    _pts = _band = null;
  }

  function isPlaying() {
    return _playing;
  }

  return { attach, detach, isPlaying };
})();

if (typeof window !== 'undefined') window.EvScrub = EvScrub;
