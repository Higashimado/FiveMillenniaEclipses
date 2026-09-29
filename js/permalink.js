/** permalink.js — shareable URL ⇄ app-state sync.
 *
 * Continuously mirrors map view, timeline instant, selection, filters and basemap
 * into the query string via history.replaceState (500ms leading throttle), and
 * restores them once at boot. The URL shape is <base>/<lang>/?<params> — the
 * language lives in the PATH segment, so it is NOT a query param here.
 *
 * Params (all omitted at their default): v=lat,lng,zoom · t=UTC ISO astronomical
 * year · r=record_id · date+k=event · o=lat,lng of the open observation card ·
 * type · civ · mode · base · q · yr=lo,hi · f=focus-year.
 */
const Permalink = (() => {
  'use strict';

  // lizhou normalisation (normYear: (y − Y0) / SPAN), so focus and range round-trip
  // as human-readable YEARS. Read the domain and cold-open defaults from Atlas rather
  // than restating them; the literals below are only a boot-order fallback.
  const _AD = (window.Atlas && Atlas.DEFAULTS) || {};
  const Y0 = _AD.Y0 != null ? _AD.Y0 : -3000,
    Y1 = _AD.Y1 != null ? _AD.Y1 : 1999,
    SPAN = Y1 - Y0;
  const DEFAULT_RANGE = _AD.range || [-762, 1931];
  const DEFAULT_FOCUS_YEAR = _AD.focusYear != null ? _AD.focusYear : 1919;

  // Trailing language segment(s), longest-first; (?:…)+ self-heals nested paths
  // like /it/it/ → /. Legacy zh / zh-CN are stripped too (they map to zh-Hans).
  const LANG_RE = /(?:\/(?:zh-Hans|zh-Hant|zh-CN|zh|en|fr|es|it|ja))+\/?$/;

  let _restoring = false; // suppress writes while applyFromURL mutates state
  let _timer = null; // leading-throttle handle

  // TimeState AND I18n are lexical globals (their modules do NOT attach them to
  // window), so reach them by bareword behind a typeof guard — window.* is undefined.
  const _TS = () => (typeof TimeState !== 'undefined' ? TimeState : null);
  const _I18n = () => (typeof I18n !== 'undefined' ? I18n : null);

  // ---- BCE-Safe UTC Time Serialization ----
  // Never Date.UTC or Date.parse for a variable year: both remap 0–99 into the 1900s,
  // silently relocating a third of this atlas. Use getUTC*/setUTCFullYear instead.
  function fmtTimeUTC(d) {
    const y = d.getUTCFullYear();
    const p2 = (n) => String(n).padStart(2, '0');
    return (
      (y < 0 ? '-' : '') +
      String(Math.abs(y)).padStart(6, '0') +
      '-' +
      p2(d.getUTCMonth() + 1) +
      '-' +
      p2(d.getUTCDate()) +
      'T' +
      p2(d.getUTCHours()) +
      ':' +
      p2(d.getUTCMinutes()) +
      ':' +
      p2(d.getUTCSeconds()) +
      'Z'
    );
  }

  function parseTimeUTC(s) {
    const m = /^(-?)(\d{1,7})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?Z?$/.exec(s);
    if (!m) return null;
    const y = (m[1] === '-' ? -1 : 1) * +m[2];
    const d = new Date(0);
    d.setUTCFullYear(y, +m[3] - 1, +m[4]);
    d.setUTCHours(+(m[5] || 0), +(m[6] || 0), +(m[7] || 0), 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // ---- URL path (language lives here, not in the query) ----

  function _basePath() {
    let p = location.pathname.replace(/\/index\.html$/, '');
    p = p.replace(LANG_RE, '');
    if (!p.endsWith('/')) p += '/';
    return p;
  }

  function _writeURL() {
    const qs = serialize();
    const i18n = _I18n();
    const lang = i18n && i18n.getLocale ? i18n.getLocale() : 'en';
    const url = _basePath() + lang + '/' + (qs ? '?' + qs : '') + location.hash;
    history.replaceState(null, '', url);
  }

  // ---- Serialize: Live State To Query String ----

  function serialize() {
    const p = new URLSearchParams();
    const map = window.appMap;
    const A = window.Atlas && Atlas.state ? Atlas.state : null;
    const TS = _TS();

    // v = lat,lng,zoom (world-copy lng preserved so the same copy re-frames)
    if (map && map.getCenter) {
      const c = map.getCenter();
      p.set('v', c.lat.toFixed(4) + ',' + c.lng.toFixed(4) + ',' + Math.round(map.getZoom()));
    }

    // t = UTC instant. Omit while playing; when no event is selected and the time
    // is still the untouched live clock (meaningless for a −3000…1999 atlas); and
    // when it sits on the selected event's peak (the event already implies it).
    if (TS && !(TS.isPlaying && TS.isPlaying())) {
      const now = TS.current;
      const sel = window.EclipseLoader && EclipseLoader.selected && EclipseLoader.selected();
      let emit = !!now;
      if (!sel) {
        if (now && Math.abs(now.getTime() - Date.now()) < 5000) emit = false;
      } else if (EclipseLoader.peakMs) {
        const peak = EclipseLoader.peakMs(sel);
        if (peak != null && now && Math.abs(peak - now.getTime()) < 1000) emit = false;
      }
      if (emit) p.set('t', fmtTimeUTC(now));
    }

    // selection: record id wins (it re-derives the event); else bare event date+k
    if (A && A.sel) {
      p.set('r', A.sel);
    } else if (A && A.selEv) {
      const bar = A.selEv.lastIndexOf('|');
      p.set('date', A.selEv.slice(0, bar));
      p.set('k', A.selEv.slice(bar + 1) === 'lunar' ? 'l' : 's');
    }

    // o = lat,lng of the click-a-point observation card, when one is open. Only
    // meaningful alongside a selection (the card is a read-out OF the selected
    // event), and Atlas returns null once the card is dismissed.
    const obs = window.Atlas && Atlas.observePoint ? Atlas.observePoint() : null;
    if (obs) p.set('o', obs.lat.toFixed(4) + ',' + obs.lng.toFixed(4));

    // filters + lizhou (omit at defaults)
    if (A) {
      if (A.type && A.type !== 'solar') p.set('type', A.type);
      if (A.civ) p.set('civ', A.civ);
      if (A.mode && A.mode !== 'records') p.set('mode', A.mode);
      if (A.q) p.set('q', A.q);
      if (A.range && (A.range[0] !== DEFAULT_RANGE[0] || A.range[1] !== DEFAULT_RANGE[1])) {
        p.set('yr', A.range[0] + ',' + A.range[1]);
      }
      if (A.focusN != null) {
        const fy = Math.round(A.focusN * SPAN + Y0);
        if (fy !== DEFAULT_FOCUS_YEAR) p.set('f', String(fy));
      }
    }

    // basemap — the id someone explicitly picked, never the one merely on screen: a
    // base the app settled on by itself must not be pinned into a shared link.
    // 'ohm' is omitted as the preferred default.
    const base = window.BasemapsCtl && BasemapsCtl.getPick && BasemapsCtl.getPick();
    if (base && base !== 'ohm') p.set('base', base);

    return p.toString();
  }

  // ---- Write Scheduling ----
  // A zoom fires many events and playback fires every frame, so this coalesces: the
  // first touch arms a 500ms timer, and _writeURL reads whatever the final state is.
  function _scheduleWrite() {
    if (_restoring || _timer) return;
    _timer = setTimeout(() => {
      _timer = null;
      _writeURL();
    }, 500);
  }

  // ---- Restore: Query String To App State ----
  // Ordered; each step fault-isolated.
  function _syncSeg(sel, attr, val) {
    document.querySelectorAll(sel + ' button').forEach((b) => {
      const on = b.getAttribute(attr) === String(val);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function applyFromURL(ctx) {
    _restoring = true;
    const params = new URLSearchParams(location.search);
    const map = (ctx && ctx.map) || window.appMap;
    const A = window.Atlas;
    const TS = _TS();
    const attempt = (fn) => {
      try {
        fn();
      } catch (e) {
        console.warn('[permalink] restore step failed', e);
      }
    };

    // Basemap first, and outside the Atlas block below: the base layer is a
    // property of the map, not of Atlas state, so a link must restore it even on a
    // boot where Atlas never came up.
    attempt(() => {
      if (params.has('base') && window.BasemapsCtl && BasemapsCtl.chooseBase) {
        BasemapsCtl.chooseBase(params.get('base'));
      }
    });

    // 1. filters BEFORE selection (so the list/markers are in the right mode).
    if (A && A.state) {
      const S = A.state;
      attempt(() => {
        if (params.has('type')) S.type = params.get('type');
      });
      attempt(() => {
        if (params.has('civ')) S.civ = params.get('civ');
      });
      attempt(() => {
        if (params.has('mode')) S.mode = params.get('mode');
      });
      attempt(() => {
        if (params.has('q')) {
          S.q = params.get('q');
          const qEl = document.getElementById('q');
          if (qEl) qEl.value = S.q;
        }
      });
      attempt(() => {
        if (params.has('yr')) {
          const yr = params.get('yr').split(',').map(Number);

          // Clamp both handles into the year domain [Y0, Y1] and keep lo ≤ hi —
          // a crafted URL must not push a filter handle off the axis.
          if (yr.length === 2 && yr.every((n) => !isNaN(n))) {
            const lo = Math.max(Y0, Math.min(Y1, yr[0]));
            const hi = Math.max(Y0, Math.min(Y1, yr[1]));
            S.range = lo <= hi ? [lo, hi] : [hi, lo];
          }
        }
      });
      attempt(() => {
        if (params.has('f')) {
          const fy = Number(params.get('f'));

          // Clamp the focus year to the domain so focusN stays within [0, 1].
          if (!isNaN(fy)) S.focusN = (Math.max(Y0, Math.min(Y1, fy)) - Y0) / SPAN;
        }
      });

      // Static segmented controls aren't re-rendered by refresh() — sync them.
      attempt(() => {
        _syncSeg('#typeseg', 'data-t', S.type);
      });
      attempt(() => {
        _syncSeg('#modeseg', 'data-m', S.mode);
      });
      attempt(() => {
        if (A.refresh) A.refresh();
      });
    }

    // Steps 3 and 4 run after the selection, whether that selection was immediate or
    // had to wait for a register to arrive — so they stay one function, not two copies.
    const finish = () => {
      // 3. time AFTER selection (selection sets peak/midpoint; t overrides it).
      attempt(() => {
        if (params.has('t') && TS) {
          const d = parseTimeUTC(params.get('t'));
          if (d) TS.setTime(d);
        }
      });

      // 4. observation card, after the selection it reads out and BEFORE the view —
      // opening a popup autoPans, and step 5's setView must be what the reader
      // ends up framed on. A no-op when nothing is selected (Atlas guards on it).
      attempt(() => {
        if (params.has('o') && A && A.showObservation) {
          const o = params.get('o').split(',').map(Number);

          // Clamp lat into the sphere; lng is left alone, world copies included,
          // so the pin lands in the same copy the v= framing shares.
          if (o.length === 2 && o.every((n) => !isNaN(n))) {
            A.showObservation(Math.max(-90, Math.min(90, o[0])), o[1], { autoPan: false });
          }
        }
      });

      // 5. view LAST (the shared framing wins over any selection recenter).
      attempt(() => {
        if (params.has('v') && map) {
          const parts = params.get('v').split(',').map(Number);

          // animate:false — an animated setView on restore can be interrupted by the
          // selection's redraws / curve loads and snap back to the origin.
          if (parts.length === 3 && parts.every((n) => !isNaN(n)))
            map.setView([parts[0], parts[1]], parts[2], { animate: false });
        }
      });

      _restoring = false;
      _writeURL(); // stamp the canonical /<lang>/?… form (adds the language path)
    };

    // 2. selection: record r (cascades to event+time) > bare event date+k. Only the
    // register on screen is fetched before first paint, so a permalink into one still
    // in flight has to wait: Atlas.select is a silent no-op on a record not held yet.
    const wanted = params.get('r');
    if (wanted && A && A.select && A.ensureRecord) {
      // Both arms run the SAME continuation: finish() clears _restoring, and a restore
      // that never clears it silently kills URL writing for the rest of the session.
      // A register that failed to arrive costs the reader its selection, never the framing.
      const done = () => {
        attempt(() => A.select(wanted));
        finish();
      };
      A.ensureRecord(wanted).then(done, done);
      return;
    }

    attempt(() => {
      if (wanted && A && A.select) {
        A.select(wanted);
      } else if (params.has('date') && A && A.selectEvent) {
        A.selectEvent(params.get('date'), params.get('k') === 'l' ? 'lunar' : 'solar');
      }
    });

    finish();
  }

  // ---- Watch: State To URL ----

  function startWatching(ctx) {
    const map = (ctx && ctx.map) || window.appMap;
    if (map && map.on) map.on('moveend zoomend', _scheduleWrite);
    const TS = _TS();
    if (TS && TS.subscribe) TS.subscribe(_scheduleWrite);
    const i18n = _I18n();
    if (i18n && i18n.subscribe) i18n.subscribe(_scheduleWrite); // locale → path segment
  }

  return { applyFromURL, startWatching, touch: _scheduleWrite, serialize };
})();
window.Permalink = Permalink;
