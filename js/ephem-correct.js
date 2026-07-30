/**
 * ephem-correct.js — per-event calibration of astronomy-engine against JPL DE441.
 *
 * Public API:
 *   EphemCorrect.setEvent(event)              — adopt the selected event's coefficients
 *   EphemCorrect.at(date)                     — the correction in force there, or null
 *   EphemCorrect.geoVector(body, date)        — corrected geocentric EQJ vector
 *   EphemCorrect.equator(body, date, obs)     — topocentric of-date RA/Dec
 *   EphemCorrect.subPoint(body, date)         — the place the body stands overhead
 *   …With() variants take the correction explicitly, for the build.
 *
 * Events before −1999 ship Besselian elements computed from DE441, so the shadow,
 * the contact curves and the local contact times are DE-quality already. What is
 * not is everything the page recomputes live: sub-solar and sub-lunar points,
 * altitude and azimuth read-outs, the eclipse glyph, the Moon marker. Those run on
 * astronomy-engine, whose Moon is thousands of km from DE441 across −3000…−2000.
 *
 * Shipping DE to the browser is not an option and is not needed: across the few
 * hours around an event that this atlas ever displays, DE minus AE is a slowly
 * turning, nearly rigid offset, and a cubic in "hours from greatest eclipse"
 * absorbs it. So each ancient event carries 24 floats.
 *
 * OUTSIDE the fitted window the correction is DROPPED, never frozen. The offset
 * direction rotates with the Moon's orbit, so a held correction drifts out of
 * phase and overshoots — far enough out, worse than no correction at all.
 */
const EphemCorrect = (() => {
  'use strict';

  // Matches HALF_WINDOW_H in the generator that fits these coefficients. The two
  // must agree: outside it the polynomial was never fitted and diverges fast.
  const MAX_APPLY_HOURS = 12;

  const KM_PER_AU = 1.4959787069098932e8;
  const MS_PER_HOUR = 3600000;

  let _active = null; // { epoch: ms, moon: coeffs, sun: coeffs }

  // ---- Correction state ----

  /**
   * Adopt (or clear) the selected event's coefficients. Events from −1999 on
   * carry none, so this is how the correction switches itself off for the 97 %
   * of the atlas that never needed it.
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

  // ---- Corrected positions ----

  /**
   * Add the DE-minus-AE offset to a geocentric EQJ vector the caller already has.
   *
   * This is the primitive, and call sites use it in preference to letting this
   * module make the astronomy-engine call for them. The two lunar entry points
   * differ — GeoVector(Moon, t, true) carries aberration and GeoMoon(t) does not —
   * so wrapping whatever the call site already asked for adds the correction
   * without silently changing which convention that site has always used.
   *
   * Passing through unchanged for any body other than the Sun and Moon, and
   * whenever no correction applies, so callers need no guard.
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
   * call of their own to wrap. Uses GeoMoon for the Moon, matching how the
   * coefficients were fitted.
   */
  function geoVectorWith(body, date, corr) {
    const raw = _bodyName(body) === 'Moon' ? Astronomy.GeoMoon(date) : Astronomy.GeoVector(body, date, true);
    return correctWith(raw, body, corr);
  }

  /**
   * Topocentric of-date RA (hours) and declination (degrees) — the two numbers
   * Astronomy.Horizon takes. Horizon needs no correction of its own, being pure
   * rotation, so this is the only place an ephemeris enters an altitude reading.
   *
   * The observer is subtracted as a VECTOR rather than the correction being
   * applied as an angle afterwards. Parallax moves the Moon by up to a degree
   * between the geocentric and topocentric directions, and that fraction of the
   * ancient correction is larger than everything else in this module together.
   *
   * With a zero correction this reproduces Astronomy.Equator(body, date, obs,
   * true, true) to 0.004", which is how the reconstruction was checked rather
   * than assumed.
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

  // ---- Ambient-state wrappers ----
  //
  // Two forms of every call, rather than one that treats a missing argument as
  // "use the ambient state": the build passes coefficients explicitly and the
  // browser reads them from the selection, and an undefined-versus-null slip
  // between those two worlds would silently drop the correction rather than fail.

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
