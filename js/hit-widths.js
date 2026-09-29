/**
 * hit-widths.js — shared minimum hover hit-target widths (screen px) for the
 * transparent "fat" casing laid over each thin visible line, since SVG/Leaflet hit
 * area == stroke width. SCREEN px: SVG that is viewBox-scaled (the eclipse
 * schematics) must convert via *W/316.
 *
 * Coarse pointers get wider casings, per WCAG 2.2's 24px target floor. Sampled once
 * at load; a device that flips input mode mid-session keeps its boot-time widths.
 */
const HIT_COARSE = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

const HitWidths = Object.freeze({
  MIN: HIT_COARSE ? 24 : 12, // baseline thin-line floor: map eclipse curves,
  // schematic moon-path/ecliptic lines, satellite ground tracks
  COMPASS: HIT_COARSE ? 28 : 16, // observer compass direction rays
  ASTERISM: HIT_COARSE ? 40 : 28, // constellation asterism lines
  VERTEX: HIT_COARSE ? 26 : 18, // asterism vertex hit circles (radius px)
});
if (typeof window !== 'undefined') window.HitWidths = HitWidths;
