/**
 * map-boot.js — thin runtime shell.
 *
 * Builds the Leaflet map, carries the one shared helper eclipse.js needs
 * (_computeAltitudeContourArcs, for lunar visibility hemispheres), then hands
 * control to Eclipse.init + the lazy loader.
 *
 * Everything heavy (shadow geometry, contact-curve rendering) is reused from
 * js/eclipse.js and js/bessel-runtime.js. This file is wiring.
 */

(() => {
  'use strict';

  // ---- World Window ----
  // Single source of truth for the horizontal world range, exposed on window so
  // other modules reuse the same bounds for their world-copy draw loops.
  const MAP_LNG_WEST = -200,
    MAP_LNG_EAST = 520;
  window.MAP_LNG_WEST = MAP_LNG_WEST;
  window.MAP_LNG_EAST = MAP_LNG_EAST;

  // ---- Deg/Rad Helpers ----

  const _rad = (d) => (d * Math.PI) / 180;
  const _deg = (r) => (r * 180) / Math.PI;

  /**
   * Raw closed small-circle ring (first == last) of angular radius 90−altThresholdDeg
   * about (centerLat, centerLng). Longitudes are NOT split at the antimeridian; that
   * is _computeAltitudeContourArcs's job. Returns [] when the radius degenerates.
   */
  function _computeAltitudeContourRing(centerLat, centerLng, altThresholdDeg) {
    const dDeg = 90 - altThresholdDeg;
    if (dDeg < 0.001 || dDeg > 180 - 0.001) return [];
    const d = _rad(dDeg),
      lat0 = _rad(centerLat),
      lng0 = centerLng;
    const cosD = Math.cos(d),
      sinD = Math.sin(d);
    const cosLat0 = Math.cos(lat0),
      sinLat0 = Math.sin(lat0);
    const N = 720;
    const raw = [];
    for (let i = 0; i <= N; i++) {
      const theta = (i / N) * 2 * Math.PI;
      const cosT = Math.cos(theta),
        sinT = Math.sin(theta);
      const sinLat = sinLat0 * cosD + cosLat0 * sinD * cosT;
      const lat = Math.asin(Math.max(-1, Math.min(1, sinLat)));
      const y = sinT * sinD * cosLat0;
      const x = cosD - sinLat0 * sinLat;
      raw.push([_deg(lat), lng0 + _deg(Math.atan2(y, x))]);
    }
    return raw;
  }
  window._computeAltitudeContourRing = _computeAltitudeContourRing;

  /**
   * Small-circle arc(s) for boundary rendering. eclipse.js calls this for lunar
   * visibility hemispheres. Returns Array<Array<[lat,lng]>>; splits at the
   * antimeridian.
   */
  function _computeAltitudeContourArcs(centerLat, centerLng, altThresholdDeg) {
    const raw = _computeAltitudeContourRing(centerLat, centerLng, altThresholdDeg);
    if (raw.length === 0) return [];
    const eastEdge = centerLng + 180,
      westEdge = centerLng - 180;
    function _splitAtAnti(prev, next) {
      const prevIsEast = prev[1] > centerLng;
      const prevEdge = prevIsEast ? eastEdge : westEdge;
      const nextEdge = prevIsEast ? westEdge : eastEdge;
      const nextLngUnwrap = next[1] + (prevIsEast ? 360 : -360);
      const denom = nextLngUnwrap - prev[1];
      const t = Math.abs(denom) < 1e-9 ? 0 : (prevEdge - prev[1]) / denom;
      const latCross = prev[0] + (next[0] - prev[0]) * t;
      return { latCross, prevEdge, nextEdge };
    }

    const arcs = [];
    let current = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      const prev = raw[i - 1],
        next = raw[i];
      if (Math.abs(next[1] - prev[1]) > 180) {
        const { latCross, prevEdge, nextEdge } = _splitAtAnti(prev, next);
        current.push([latCross, prevEdge]);
        if (current.length >= 2) arcs.push(current);
        current = [[latCross, nextEdge]];
      }
      current.push(next);
    }
    if (current.length >= 2) arcs.push(current);
    return arcs;
  }
  window._computeAltitudeContourArcs = _computeAltitudeContourArcs;

  // The Sidebar API eclipse.js drives (showEclipse / showLunarEclipse) belongs to
  // js/event-panel.js, which index.html must load before this file.

  // ---- Build the map ----
  // Base tile layers + the layer-control switcher are owned by js/basemaps.js.
  // This just creates the map shell.
  function buildMap() {
    const map = L.map('map', {
      worldCopyJump: false,
      minZoom: 3, // can't zoom out past the world window
      maxZoom: 19, // ceiling shared by every base layer's native/upsampled zoom
      zoomControl: false, // default top-left paints UNDER the 68px topbar (z 1300 vs 0)
      maxBounds: [
        [-90, MAP_LNG_WEST],
        [90, MAP_LNG_EAST],
      ], // clamp panning to the −200…+520 window
      maxBoundsViscosity: 1.0, // hard edge — no rubber-band past the bounds
    }).setView([30, 30], 3);

    // License requirement: every base layer (OSM / CARTO / OHM / Esri) mandates credit;
    // basemaps.js supplies the per-layer strings.
    map.attributionControl.setPosition('bottomright');

    // Leaflet's default prefix ships a country-flag sprite next to "Leaflet",
    // which clashes with the site's Song-painting palette — text only.
    map.attributionControl.setPrefix('Leaflet');

    window.appMap = map;
    return map;
  }

  async function boot() {
    if (typeof I18n !== 'undefined') {
      try {
        await I18n.init(I18n.detectLocale());
        I18n.applyDOM();
      } catch (e) {
        /* keys fallback */
      }
    }
    const map = buildMap();
    const eclipseCtl = Eclipse.init(map);
    window.EclipseCtl = eclipseCtl;

    // soloLayer (real-time umbra/penumbra) is NOT mounted here — it tracks event
    // selection: EclipseCtl.selectEvent adds it, panel-close (deselect) removes
    // it. Boot lands in ambient-overview mode with no live footprint.

    // Base layers + switcher (light-first). Capture the returned control
    // (selectBase/chooseBase/getBase/getPick) on window so js/permalink.js can
    // read + restore the active basemap.
    if (window.Basemaps && Basemaps.init) window.BasemapsCtl = Basemaps.init(map);

    if (window.UI && UI.init) UI.init();

    // Hand off to the lazy loader (drives selectEvent from the timeline/viewport).
    if (window.EclipseLoader && EclipseLoader.init) {
      EclipseLoader.init(map, eclipseCtl);
    }

    // The Atlas front-end OWNS the record markers, the library and the fisheye
    // lizhou; nothing here may draw a record marker of its own.
    if (window.Atlas && Atlas.init) await Atlas.init(map, eclipseCtl);

    // Permalink LAST: every collaborator (appMap, TimeState, EclipseLoader, Atlas,
    // BasemapsCtl) is now live. applyFromURL restores shared state from the query
    // string; startWatching begins mirroring state → URL via history.replaceState.
    if (window.Permalink) {
      Permalink.applyFromURL({ map, ctl: eclipseCtl });
      Permalink.startWatching({ map });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
