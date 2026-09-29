/**
 * ephem-correct.js — per-event calibration of astronomy-engine against JPL DE441.
 *
 * Public API: EphemCorrect.{setEvent, at, geoVector, equator, subPoint}; the …With()
 * variants take the correction as an argument instead of reading module state.
 *
 * astronomy-engine's Moon diverges from DE441 by thousands of km across −3000…−2000;
 * each ancient event carries a cubic-in-hours correction fitted around greatest eclipse.
 * Outside the fitted window the correction is DROPPED, never frozen: the offset
 * direction rotates with the Moon's orbit, so a held correction overshoots.
 */
const EphemCorrect = (() => {
  'use strict';

  // This must equal the half-window the shipped coefficients were fitted over: outside
  // it the polynomial was never fitted and diverges fast.
  const MAX_APPLY_HOURS = 12;

  const KM_PER_AU = 1.4959787069098932e8;
  const MS_PER_HOUR = 3600000;

  let _active = null; // { epoch: ms, moon: coeffs, sun: coeffs }

  // ---- Correction State ----

  /**
   * Adopt (or clear) the selected event's coefficients. An event without them clears
   * the correction — most of the atlas carries none, and this is what switches it off.
   */
  function setEvent(event) {
    const corr = event && event.aeCorr;
    _active = corr && corr.epoch ? { epoch: Date.parse(corr.epoch), moon: corr.moon, sun: corr.sun } : null;
  }

  /** The correction in force at `date`, or null outside the fitted window. */
  function at(date) {
    if (!_active) return null;
    const hours = (date.getTime() - _active.epoch) / MS_PER_HOUR;
    if (!(Math.abs(hours) <= MAX_APPLY_HOURS)) return null;
    return { moon: _active.moon, sun: _active.sun, hours };
  }

  // Horner over a list of 3-vectors: the offset in km at `hours`.
  function _offsetKm(coeffs, hours) {
    if (!coeffs || !coeffs.length) return null;
    let x = 0,
      y = 0,
      z = 0;
    for (let i = coeffs.length - 1; i >= 0; i--) {
      x = x * hours + coeffs[i][0];
      y = y * hours + coeffs[i][1];
      z = z * hours + coeffs[i][2];
    }
    return { x, y, z };
  }

  function _bodyName(body) {
    return typeof body === 'string' ? body : body && String(body);
  }

  function _coeffsFor(body, corr) {
    const name = _bodyName(body);
    if (name === 'Moon') return corr.moon;
    if (name === 'Sun') return corr.sun;
    return null;
  }

  // ---- Corrected Positions ----

  /**
   * Add the DE-minus-AE offset to a geocentric EQJ vector the caller already has, so
   * wrapping an existing GeoVector/GeoMoon call never changes its convention. Passes
   * vec through unchanged for any body other than the Sun and Moon.
   */
  function correctWith(vec, body, corr) {
    if (!corr) return vec;
    const offset = _offsetKm(_coeffsFor(body, corr), corr.hours);
    if (!offset) return vec;
    return new Astronomy.Vector(
      vec.x + offset.x / KM_PER_AU,
      vec.y + offset.y / KM_PER_AU,
      vec.z + offset.z / KM_PER_AU,
      vec.t
    );
  }

  /**
   * Geocentric EQJ vector (AU) for the Sun or Moon, for callers with no existing
   * call of their own to wrap.
   */
  function geoVectorWith(body, date, corr) {
    const raw = _bodyName(body) === 'Moon' ? Astronomy.GeoMoon(date) : Astronomy.GeoVector(body, date, true);
    return correctWith(raw, body, corr);
  }

  /**
   * Topocentric of-date RA (hours) and declination (degrees). The observer is
   * subtracted as a VECTOR, not applied as an angle: parallax moves the Moon up to a
   * degree. With a zero correction this MUST equal Astronomy.Equator(body, date, obs, true, true).
   */
  function equatorWith(body, date, observer, corr) {
    if (!corr) return Astronomy.Equator(body, date, observer, true, true);

    const time = Astronomy.MakeTime(date);
    const geo = geoVectorWith(body, time, corr);
    const obs = Astronomy.ObserverVector(time, observer, false);
    const topo = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), {
      x: geo.x - obs.x,
      y: geo.y - obs.y,
      z: geo.z - obs.z,
      t: time,
    });

    const dist = Math.hypot(topo.x, topo.y, topo.z);
    let ra = (Math.atan2(topo.y, topo.x) * 12) / Math.PI;
    if (ra < 0) ra += 24;
    return { ra, dec: (Math.asin(topo.z / dist) * 180) / Math.PI, dist };
  }

  /**
   * Sub-point (lat, lng) of a body — the place it stands overhead. Rotates EQJ to
   * of-date so right ascension pairs with APPARENT sidereal time, the pairing
   * js/body-markers.js and the lunar build both use.
   */
  function subPointWith(body, date, corr) {
    const time = Astronomy.MakeTime(date);
    const v = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), geoVectorWith(body, time, corr));
    const dist = Math.hypot(v.x, v.y, v.z);
    const gast = Astronomy.SiderealTime(time) * 15;
    let lng = (Math.atan2(v.y, v.x) * 180) / Math.PI - gast;
    lng = (((lng % 360) + 540) % 360) - 180;
    return { lat: (Math.asin(v.z / dist) * 180) / Math.PI, lng, distAU: dist };
  }

  // ---- Ambient-State Wrappers ----

  // Two forms of every call, never one that treats a missing argument as "use the
  // ambient state": merging the two makes an undefined-versus-null slip silently
  // drop the correction instead of failing.
  function correct(vec, body, date) {
    return correctWith(vec, body, at(date));
  }

  function geoVector(body, date) {
    return geoVectorWith(body, date, at(date));
  }

  function equator(body, date, observer) {
    return equatorWith(body, date, observer, at(date));
  }

  function subPoint(body, date) {
    return subPointWith(body, date, at(date));
  }

  return {
    setEvent,
    at,
    correct,
    geoVector,
    equator,
    subPoint,
    correctWith,
    geoVectorWith,
    equatorWith,
    subPointWith,
    MAX_APPLY_HOURS,
  };
})();

if (typeof window !== 'undefined') window.EphemCorrect = EphemCorrect;
