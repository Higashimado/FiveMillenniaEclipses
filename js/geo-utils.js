/**
 * geo-utils.js — the two shared helpers the map draws with: world-copy offsets and
 * colour interpolation.
 *
 * Public API: GeoUtils.wrapOffsets(minLon, maxLon) -> offsets in degrees;
 * GeoUtils.lerpHex(c0, c1, t) -> "#rrggbb".
 *
 * bessel-runtime.js and envelope-ring.js MUST NOT depend on this module: both are
 * loaded standalone outside the browser by the offline curve harnesses, where a bare
 * GeoUtils reference is an uncaught ReferenceError. Their inlined longitude wrap and
 * Earth radius stay inlined for that reason.
 */
const GeoUtils = (() => {
  // Which world copies a shape spanning [minLon, maxLon] falls into, within the map's
  // -200…+520 range. Returns offsets rather than translated geometry: each caller
  // (marker, polyline, ring) knows how to shift its own kind.
  function wrapOffsets(minLon, maxLon) {
    const offsets = [];
    const kMin = Math.ceil((-200 - maxLon) / 360);
    const kMax = Math.floor((520 - minLon) / 360);
    for (let k = kMin; k <= kMax; k++) offsets.push(k * 360);
    return offsets;
  }

  // Straight per-channel RGB interpolation between two "#rrggbb" strings, t in [0, 1].
  // Both endpoints come from the one COLOR table, so the six-digit form is the only one
  // that has to be read here.
  function lerpHex(c0, c1, t) {
    const p = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const a = p(c0),
      b = p(c1);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }

  return { wrapOffsets, lerpHex };
})();
