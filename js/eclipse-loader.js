/**
 * eclipse-loader.js — event index owner and selection manager.
 *
 * Guarantees the page never renders all events at once: it owns the index,
 * decides WHICH event's contact curves to show, and calls the reused Eclipse
 * controller's selectEvent(). The heavy rendering stays in eclipse.js.
 *
 * The two index files (solar.json + lunar.json) are loaded whole, and only the
 * per-event curve files are fetched on demand. Chunking the index itself — by
 * century, derived from the indexes' own event_date fields — would slot in behind
 * this same public API, and no such chunked index ships today.
 */

const EclipseLoader = (() => {
  'use strict';
  let _map = null,
    _ctl = null;
  let _all = []; // merged, sorted-by-peak events
  let _selectedIdx = -1;

  function _peakMs(e) {
    const iso = e._kind === 'solar' ? e.peak && e.peak.time : e.times && e.times.peak;
    return Date.parse(iso);
  }

  async function _loadIndexes() {
    const [solar, lunar] = await Promise.all([
      fetch('data/eclipses/solar.json')
        .then((r) => r.json())
        .catch(() => []),
      fetch('data/eclipses/lunar.json')
        .then((r) => r.json())
        .catch(() => []),
    ]);
    solar.forEach((e) => {
      e._kind = 'solar';
    });
    lunar.forEach((e) => {
      e._kind = 'lunar';
    });
    // Clip to the service window Y0 = -3000 … Y1 = 1999 (matches atlas.js / time.js).
    // Parse the leading year from extended-ISO date strings (e.g. "-001999-06-08").
    const inWindow = (e) => {
      const m = /^(-?\d+)/.exec(e.date || '');
      return m && +m[1] >= -3000 && +m[1] <= 1999;
    };
    _all = solar.concat(lunar).filter(inWindow);
    _all.forEach((e) => {
      e._peakMs = _peakMs(e);
      // Outer-contact window bounds in ms — classifySolar / solarLocalContacts
      // scan [_p1Ms, _p4Ms]. Solar reads p1/p4 (ISO); lunar reads times.p1/p4.
      const p1 = e._kind === 'solar' ? e.p1 : e.times && e.times.p1;
      const p4 = e._kind === 'solar' ? e.p4 : e.times && e.times.p4;
      e._p1Ms = Date.parse(p1);
      e._p4Ms = Date.parse(p4);
    });
    _all.sort((a, b) => a._peakMs - b._peakMs);
  }

  // opts is passed straight through to the controller's selectEvent (e.g.
  // { noFly:true } to suppress the fly-to-greatest-eclipse-point pan).
  function selectIndex(i, opts) {
    if (i < 0 || i >= _all.length) return;
    _selectedIdx = i;
    _ctl.selectEvent(_all[i], opts);
  }

  function selectByDate(date, kind, opts) {
    const i = _all.findIndex((e) => e.date === date && (!kind || e._kind === kind));
    if (i >= 0) selectIndex(i, opts);
    return i >= 0;
  }

  function selectNearest(when, opts) {
    if (!_all.length) return;
    const t = when instanceof Date ? when.getTime() : Date.parse(when);
    let best = 0,
      bestD = Infinity;
    for (let i = 0; i < _all.length; i++) {
      const d = Math.abs(_all[i]._peakMs - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    selectIndex(best, opts);
  }

  // Drop the selection: tear down the engine's live footprint + selected curves
  // (its soloLayer 'remove' hook clears curves + unlocks range) and forget the
  // index so selected() returns null. Called by Atlas.clearEventSel on close.
  function deselect() {
    _selectedIdx = -1;
    if (_ctl && _ctl.deselect) _ctl.deselect();
  }

  function next() {
    selectIndex(Math.min(_selectedIdx + 1, _all.length - 1));
  }

  function prev() {
    selectIndex(Math.max(_selectedIdx - 1, 0));
  }

  function all() {
    return _all;
  }

  // Currently-selected event (or null) — lets the atlas scrub baseline on its peak.
  function selected() {
    return _selectedIdx >= 0 && _selectedIdx < _all.length ? _all[_selectedIdx] : null;
  }

  function peakMs(e) {
    return e ? _peakMs(e) : null;
  }

  async function init(map, ctl) {
    _map = map;
    _ctl = ctl;
    await _loadIndexes();
    // Land in ambient-overview mode (no selection). No auto-selectNearest — the
    // live footprint and the selected-event layer are user-triggered; overview
    // shows only band washes. selectNearest stays part of the API for callers.
    // URL restore (the ?date= deep-link AND the full permalink) is centralized in
    // js/permalink.js, applied once at the end of boot() after Atlas is ready, so
    // it is NOT handled here (a read here would double-apply / race Atlas.state).
    // No prev/next jump buttons in this UI; next()/prev() remain as public API.
  }

  return { init, selectByDate, selectNearest, selectIndex, deselect, next, prev, all, selected, peakMs };
})();
window.EclipseLoader = EclipseLoader;
