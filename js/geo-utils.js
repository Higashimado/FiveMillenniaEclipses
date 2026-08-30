/**
 * geo-utils.js — the two shared helpers the map draws with: world-copy offsets and
 * colour interpolation.
 *
 * Public API:
 *   GeoUtils.wrapOffsets(minLon, maxLon) -> [longitude offsets, in degrees]
 *   GeoUtils.lerpHex(c0, c1, t)          -> "#rrggbb"
 */
const GeoUtils = (() => {
  // Which world copies a shape spanning [minLon, maxLon] falls into. The map's longitude
  // range is -200…+520, so one shape can be visible in more than one copy at once and
  // anything drawn only at k = 0 vanishes as the reader pans past a seam. Return the
  // offsets rather than the translated geometry: callers hold markers, polylines and
  // rings alike, and each knows how to shift its own kind.
  function wrapOffsets(minLon, maxLon) {
    const offsets = [];
    for (let k = -1; k <= 2; k++) {
      const lo = k * 360 + minLon;
      const hi = k * 360 + maxLon;
      if (hi >= -200 && lo <= 520) offsets.push(k * 360);
    }
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
