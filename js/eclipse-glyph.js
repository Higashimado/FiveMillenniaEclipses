/**
 * eclipse-glyph.js — inline-SVG eclipse disk glyphs for the sidebar list.
 *
 * Six variants computed from the real greatest-eclipse geometry carried on
 * `event.glyph`, which the build backfills onto each event. Five layer a shadow
 * onto the project's Sun/Moon disk art (img/sun-large.svg, img/moon-large.svg —
 * each a disk filling its viewBox, embedded at 28×28 to land exactly at R=14
 * about (20,20)); total solar eclipse replaces the disk with a fixed corona glyph.
 *
 * Exposes a global `EclipseGlyph` (no module system in this project).
 */
window.EclipseGlyph = (function () {
  'use strict';

  const R = 14; // rendered primary-disk radius in the 40×40 viewBox
  const CX = 20,
    CY = 20; // disk center

  // Sky-view transform (§1.1 / §3.2): east on the left, north up. P measured
  // from celestial north counterclockwise toward east.
  const skyOffset = (amp, pa) => ({ dx: -amp * Math.sin(pa), dy: -amp * Math.cos(pa) });

  const f = (x) => (+x).toFixed(3);
  const isNum = (x) => typeof x === 'number' && isFinite(x);

  // ---- Runtime fallback geometry (only used if event.glyph is missing) ----
  // Mirrors the build-time glyph geometry using the browser-global Astronomy
  // engine, so a missing `event.glyph` degrades instead of blanking the card.
  const R_SUN_KM = 695700.0,
    R_MOON_KM = 1737.4,
    R_EARTH_KM = 6378.137,
    DANJON = 1.02;

  function wrapPi(x) {
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x < -Math.PI) x += 2 * Math.PI;
    return x;
  }

  function norm2Pi(x) {
    let v = x % (2 * Math.PI);
    if (v < 0) v += 2 * Math.PI;
    return v;
  }

  function eqAtPeak(body, peakIso) {
    const t = Astronomy.MakeTime(new Date(peakIso));
    const v = EphemCorrect.correct(Astronomy.GeoVector(body, t, true), body, t.date);
    const dist = Math.hypot(v.x, v.y, v.z);
    return { ra: Math.atan2(v.y, v.x), dec: Math.asin(v.z / dist), dist_km: dist * Astronomy.KM_PER_AU };
  }

  // Position angle (0=N, π/2=E) of `target` relative to `origin`.
  function posAngle(origin, target) {
    const dec_avg = 0.5 * (origin.dec + target.dec);
    const dRAx = wrapPi(target.ra - origin.ra) * Math.cos(dec_avg);
    return norm2Pi(Math.atan2(dRAx, target.dec - origin.dec));
  }

  // Tangent-plane offset: angular separation (rad) + position angle in one pass.
  function skyVec(origin, target) {
    const dec_avg = 0.5 * (origin.dec + target.dec);
    const dRAx = wrapPi(target.ra - origin.ra) * Math.cos(dec_avg);
    const dDec = target.dec - origin.dec;
    return { sep: Math.hypot(dRAx, dDec), pa: norm2Pi(Math.atan2(dRAx, dDec)) };
  }

  // The bite depth is inverted OUT of the catalog magnitude, not measured from the
  // ephemeris. A solar eclipse's magnitude is topocentric — a ground-total eclipse
  // is not total seen from Earth's centre — so the geocentric Sun↔Moon separation
  // is far too large: a 0.93 partial would render as a barely-there nibble.
  // Inverting mag = (sd_sun + sd_moon − sep) / 2·sd_sun makes the glyph's bite
  // agree with the magnitude printed on the same card.
  function runtimeSolar(peakIso, event) {
    const sun = eqAtPeak(Astronomy.Body.Sun, peakIso),
      moon = eqAtPeak(Astronomy.Body.Moon, peakIso);
    const sd_sun = Math.asin(R_SUN_KM / sun.dist_km),
      sd_moon = Math.asin(R_MOON_KM / moon.dist_km);
    const mag = event && typeof event.magnitude === 'number' ? event.magnitude : 0;
    return {
      sd_primary: sd_sun,
      sd_occluder: sd_moon,
      sep: Math.max(0, sd_sun + sd_moon - 2 * mag * sd_sun),
      pa: posAngle(sun, moon),
    };
  }

  // Lunar bite depth is geocentric — the same shadowed Moon is seen identically
  // across the whole night hemisphere — so take `sep` from the real Moon↔antisolar
  // separation. Going through the catalog magnitude the way the solar path does
  // would be worse than useless here: penumbralMag is unreliably 0, which pushes
  // the penumbra ring tangent to the disk and renders a blank glyph.
  function runtimeLunar(peakIso, _event) {
    const sun = eqAtPeak(Astronomy.Body.Sun, peakIso),
      moon = eqAtPeak(Astronomy.Body.Moon, peakIso);
    const sd_sun = Math.asin(R_SUN_KM / sun.dist_km),
      sd_moon = Math.asin(R_MOON_KM / moon.dist_km);
    const pi_moon = Math.asin(R_EARTH_KM / moon.dist_km),
      pi_sun = Math.asin(R_EARTH_KM / sun.dist_km);
    const rho_umbra = DANJON * (pi_moon + pi_sun - sd_sun);
    const rho_penum = DANJON * (pi_moon + pi_sun + sd_sun);
    const anti = { ra: sun.ra + Math.PI, dec: -sun.dec };
    const { sep, pa } = skyVec(moon, anti);
    return { sd_primary: sd_moon, rho_umbra, rho_penum, sep, pa };
  }

  /**
   * Lunar eclipse magnitude (umbral for Partial/Total, penumbral for Penumbral)
   * recovered from the glyph geometry, so the card's magnitude always agrees with the
   * drawn glyph. Returns null when no geometry is available.
   */
  function lunarMagnitude(event) {
    const g = ensureGlyph(event);
    if (!g || !isNum(g.sd_primary) || g.sd_primary <= 0 || !isNum(g.sep)) return null;
    const ring = event.kind === 'Penumbral' ? g.rho_penum : g.rho_umbra;
    if (!isNum(ring)) return null;
    return (ring + g.sd_primary - g.sep) / (2 * g.sd_primary);
  }

  // Real-time Earth-shadow geometry at an arbitrary instant (reuses the same
  // runtimeLunar math as the sidebar card). Returns the glyph fields plus the
  // moon's umbral & penumbral immersion magnitudes (>0 = in contact, ≥1 = the
  // moon is fully inside that shadow). null when the engine is unavailable.
  // Used by the map moon-disk renderer to paint a live red shadow bite.
  function lunarShadowAt(date) {
    if (typeof Astronomy === 'undefined' || !Astronomy.GeoVector) return null;
    try {
      const g = runtimeLunar(date);
      const sd = g.sd_primary;
      if (!isNum(sd) || sd <= 0) return null;
      return Object.assign({}, g, {
        umbralMag: (g.rho_umbra + sd - g.sep) / (2 * sd),
        penumbralMag: (g.rho_penum + sd - g.sep) / (2 * sd),
      });
    } catch (_) {
      return null;
    }
  }

  // Resolve glyph geometry, computing + caching on the event if absent.
  function ensureGlyph(event) {
    if (event.glyph) return event.glyph;
    if (typeof Astronomy === 'undefined' || !Astronomy.GeoVector) return null;
    try {
      const isSolar = event._kind === 'solar';
      const peakIso = isSolar ? event.peak && event.peak.time : event.times && event.times.peak;
      if (!peakIso) return null;
      event.glyph = isSolar ? runtimeSolar(peakIso, event) : runtimeLunar(peakIso, event);
      return event.glyph;
    } catch (_) {
      return null;
    }
  }

  // ---- SVG fragment builders ----
  const svgOpen = (size) => `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">`;
  const sunDisk = (base) => `<image href="${base}img/sun-large.svg"  x="6" y="6" width="28" height="28"/>`;
  const moonDisk = (base) => `<image href="${base}img/moon-large.svg" x="6" y="6" width="28" height="28"/>`;

  // 3.3.1 / 3.3.2 — solar partial & annular: Moon silhouette over the Sun disk.
  function solarOverlay(g, size, base, cid) {
    const r_moon = R * (g.sd_occluder / g.sd_primary);
    const amp = R * (g.sep / g.sd_primary);
    const { dx, dy } = skyOffset(amp, g.pa);
    // Clip to a circle just outside the sun disk (R+2) so the sun is never
    // truncated while the moon silhouette is cleanly bounded.
    return (
      svgOpen(size) +
      `<defs><clipPath id="${cid}"><rect x="${CX - R - 2}" y="${CY - R - 2}" width="${2 * (R + 2)}" height="${2 * (R + 2)}"/></clipPath></defs>` +
      `<g clip-path="url(#${cid})">` +
      sunDisk(base) +
      `<circle cx="${f(CX + dx)}" cy="${f(CY + dy)}" r="${f(r_moon)}" fill="var(--ecl-moon-silhouette)"/>` +
      `</g></svg>`
    );
  }

  // 3.3.3 — total solar eclipse (and Hybrid): fixed corona-ring + black disk + diamond bead.
  // Dark disk matches the normal sun size (R). Corona ring hugs it (inner edge = R).
  // Bead sits at the dark disk's limb (distance R from centre, upper-right at 45°).
  function solarTotal(size) {
    const bx = f(CX + R / Math.SQRT2),
      by = f(CY - R / Math.SQRT2);
    return (
      svgOpen(size) +
      `<circle cx="${CX}" cy="${CY}" r="15" fill="none" stroke="var(--ecl-corona)" stroke-width="1.8"/>` +
      `<circle cx="${CX}" cy="${CY}" r="${R}" fill="var(--ecl-corona-disk)"/>` +
      `<circle cx="${bx}" cy="${by}" r="2.5" fill="var(--ecl-corona-bead)"/>` +
      `</svg>`
    );
  }

  // 3.3.4 — partial lunar eclipse: Earth's umbra over the Moon disk, clipped, with center hint.
  function lunarUmbra(g, size, base, cid) {
    const r_umbra = R * (g.rho_umbra / g.sd_primary);
    const amp = R * (g.sep / g.sd_primary);
    const { dx, dy } = skyOffset(amp, g.pa);
    return (
      svgOpen(size) +
      `<defs><clipPath id="${cid}"><circle cx="20" cy="20" r="14"/></clipPath></defs>` +
      moonDisk(base) +
      `<g clip-path="url(#${cid})">` +
      `<circle cx="${f(CX + dx)}" cy="${f(CY + dy)}" r="${f(r_umbra)}" fill="var(--ecl-umbra)" opacity="0.8"/>` +
      `</g></svg>`
    );
  }

  // 3.3.5 — penumbral lunar eclipse: penumbra over the Moon disk, clipped, deep warm wash.
  function lunarPenumbra(g, size, base, cid) {
    const r_penum = R * (g.rho_penum / g.sd_primary);
    const amp = R * (g.sep / g.sd_primary);
    const { dx, dy } = skyOffset(amp, g.pa);
    return (
      svgOpen(size) +
      `<defs><clipPath id="${cid}"><circle cx="20" cy="20" r="14"/></clipPath></defs>` +
      moonDisk(base) +
      `<g clip-path="url(#${cid})">` +
      `<circle cx="${f(CX + dx)}" cy="${f(CY + dy)}" r="${f(r_penum)}" fill="var(--ecl-penumbra)" opacity="0.4"/>` +
      `</g></svg>`
    );
  }

  // 3.3.6 — total lunar eclipse: uniform blood disk over the Moon texture, no asymmetry
  // (owner directive). Like lunarUmbra/lunarPenumbra, the moon disk is drawn
  // underneath so the texture shows through the semi-transparent blood red.
  function lunarTotal(size, base, cid) {
    return (
      svgOpen(size) +
      `<defs><clipPath id="${cid}"><circle cx="20" cy="20" r="14"/></clipPath></defs>` +
      moonDisk(base) +
      `<g clip-path="url(#${cid})"><circle cx="20" cy="20" r="14" fill="var(--ecl-bloodmoon)" opacity="0.8"/></g>` +
      `<circle cx="20" cy="20" r="14" fill="none" stroke="var(--ecl-bloodmoon-rim)" stroke-width="0.8"/>` +
      `</svg>`
    );
  }

  // Plain-disk fallback when geometry is unavailable (no glyph, no engine).
  function plainDisk(isSolar, size, base) {
    return svgOpen(size) + (isSolar ? sunDisk(base) : moonDisk(base)) + `</svg>`;
  }

  /**
   * Build an inline SVG string for an eclipse-list card.
   * @param {Object} event  — record with `_kind` ('solar'/'lunar'), `kind`, `glyph`
   * @param {Object} [opts]
   * @param {number} [opts.size=42]
   * @param {string} [opts.idPrefix]  unique per card (clipPath id namespace)
   * @param {string} [opts.assetBase=''] path prefix for img/ assets
   * @returns {string}
   */
  function render(event, opts) {
    opts = opts || {};
    const size = opts.size || 42;
    const base = opts.assetBase || '';
    const idPrefix = opts.idPrefix || `eg-${event._kind || 'e'}-${event.date || 'x'}`;
    const cid = `${idPrefix}-clip`;
    const isSolar = event._kind === 'solar';
    const kind = event.kind || '';

    // total solar eclipse / hybrid solar eclipse (total+annular) — fixed replacement, no geometry needed.
    if (isSolar && (kind === 'Total' || kind === 'Hybrid')) return solarTotal(size);

    const g = ensureGlyph(event);
    // A glyph object may exist but be partially populated (older build, curve-
    // only record). Validate the fields each builder dereferences so we degrade
    // to a plain disk instead of emitting <circle r="NaN"> (an invisible bite).
    const baseOk = g && isNum(g.sd_primary) && g.sd_primary > 0 && isNum(g.sep) && isNum(g.pa);

    if (isSolar) {
      // Partial & Annular share one formula; r_moon<R for annular shows a ring.
      return baseOk && isNum(g.sd_occluder) ? solarOverlay(g, size, base, cid) : plainDisk(true, size, base);
    }

    if (kind === 'Total') return lunarTotal(size, base, cid); // geometry ignored
    if (!baseOk) return plainDisk(false, size, base);
    if (kind === 'Penumbral')
      return isNum(g.rho_penum) ? lunarPenumbra(g, size, base, cid) : plainDisk(false, size, base);
    return isNum(g.rho_umbra) ? lunarUmbra(g, size, base, cid) : plainDisk(false, size, base); // Partial
  }

  // Per-observer eclipse glyph for the click-a-point observation popup: a solar
  // bite sized to the LOCAL magnitude at the clicked point, reusing the same disk
  // builders as the event card so the figure shows what that location actually
  // sees rather than the greatest-eclipse view. Lunar magnitude is global (only
  // moon-up/down varies by location), so lunar defers to render(). opts carries
  // { maxPhase, maxMag, size, idPrefix, assetBase }. Degrades to render() on any gap.
  function renderLocal(event, opts) {
    opts = opts || {};
    const size = opts.size || 64;
    const base = opts.assetBase || '';
    try {
      if (event._kind !== 'solar') return render(event, opts);
      if (opts.maxPhase === 'total') return solarTotal(size);
      // Synthetic per-point glyph: sd_sun/sd_moon/pa from the event peak geometry,
      // sep inverted from the local magnitude (same relation as runtimeSolar).
      const peakIso = event.peak && event.peak.time;
      const gg =
        event.glyph && isNum(event.glyph.sd_occluder) ? event.glyph : peakIso ? runtimeSolar(peakIso, event) : null;
      if (!gg || !isNum(gg.sd_primary) || gg.sd_primary <= 0 || !isNum(gg.sd_occluder)) return render(event, opts);
      const mag = isNum(opts.maxMag) ? opts.maxMag : 0;
      const sep = Math.max(0, gg.sd_primary + gg.sd_occluder - 2 * mag * gg.sd_primary);
      const idPrefix = opts.idPrefix || `eg-${event._kind || 'e'}-${event.date || 'x'}`;
      return solarOverlay(
        { sd_primary: gg.sd_primary, sd_occluder: gg.sd_occluder, sep, pa: gg.pa },
        size,
        base,
        `${idPrefix}-clip`
      );
    } catch (_) {
      return render(event, opts);
    }
  }

  // ---- kexing / huibo / yanfan emblem ----
  // A non-eclipse transient has no shadow geometry; this draws a small mark so the
  // jingguan strip's glyph slot is filled at the same 30px size as an eclipse figure.
  // Comet and guest-star kinds use the engraving-style icons in img/; the viewBox
  // crops each source SVG to its focal region (nucleus+tail / central burst).
  // Occultation renders body-specific glyphs depending on the record:
  //   • Moon-only: phase-correct disk (Astronomy.Illumination + bright-limb PA)
  //   • Moon + named planet: phase disk with planet dot upper-left
  //   • Planet-only: ink-on-paper glow dot with wuxing (Five-Elements) color

  // Chinese traditional planet names → modern key (歲星/熒惑/鎮星/太白/辰星)
  const _ZH_PLANET = {
    歲星: 'jupiter',
    木星: 'jupiter',
    熒惑: 'mars',
    火星: 'mars',
    鎮星: 'saturn',
    填星: 'saturn',
    土星: 'saturn',
    太白: 'venus',
    金星: 'venus',
    辰星: 'mercury',
    水星: 'mercury',
  };

  // Planet ink tints for light-mode paper (#F3EFE6). The conventional screen tints
  // for these five are tuned for a dark sky and wash out on a pale ground, so each is
  // darkened ~30% to hold contrast as ink.
  const _PLANET_INK = {
    jupiter: '#B86010', // orange
    mars: '#C03428', // red
    saturn: '#A08808', // yellow
    venus: '#B87808', // amber
    mercury: '#847A78', // gray
  };

  function _planetFromSkyPos(skyPos) {
    if (!skyPos) return null;
    for (const n in _ZH_PLANET) {
      if (skyPos.indexOf(n) >= 0) return _ZH_PLANET[n];
    }
    return null;
  }

  // Parses astronomical year date strings ("YYYY-MM-DD" or "YYYY", negative OK).
  // Uses setUTCFullYear to avoid the 0–99 mapping bug in Date.UTC.
  function _parseDateForAstro(dateStr) {
    if (!dateStr) return null;
    try {
      const s = String(dateStr);
      const neg = s.charAt(0) === '-';
      const parts = (neg ? s.slice(1) : s).split('-');
      const y = (neg ? -1 : 1) * parseInt(parts[0], 10);
      const m = parts.length > 1 ? parseInt(parts[1], 10) - 1 : 6;
      const d = parts.length > 2 ? parseInt(parts[2], 10) : 1;
      const dt = new Date(0);
      dt.setUTCFullYear(y, m, d);
      dt.setUTCHours(6, 0, 0, 0);
      return dt;
    } catch (_) {
      return null;
    }
  }

  // Returns {phaseAngle (rad, 0=full π=new), chi (rad, bright-limb PA north-through-east)}.
  // Requires Astronomy engine (astronomy-engine.min.js loaded before this file).
  function _moonPhaseParams(dateStr) {
    let phaseAngle = Math.PI * 0.5; // fallback: quarter
    let chi = Math.PI / 2; // fallback: lit on right
    try {
      const date = _parseDateForAstro(dateStr);
      if (date && typeof Astronomy !== 'undefined') {
        // Illumination is deliberately left uncorrected while the surrounding
        // positions are not. It supplies the phase ANGLE, and the ancient
        // ephemeris error of 1.9 deg perturbs that by the same amount — which at
        // an eclipse, where the Moon is within a degree of new or full, moves the
        // illuminated fraction by 0.03 % of the disc. The bright-limb orientation,
        // which would be visible, comes from bodyPosition below and is corrected.
        const illum = Astronomy.Illumination('Moon', date);
        phaseAngle = illum.phase_angle * (Math.PI / 180);
        // Position angle of Sun from Moon — determines which limb is lit.
        // Observer(0,0,0) is geocentric to within < 0.01° for phase purposes.
        const obs = new Astronomy.Observer(0, 0, 0);
        const moonEq = EphemCorrect.equator('Moon', date, obs);
        const sunEq = EphemCorrect.equator('Sun', date, obs);
        const ra1 = moonEq.ra * (Math.PI / 12); // hours → radians
        const dec1 = moonEq.dec * (Math.PI / 180);
        const ra2 = sunEq.ra * (Math.PI / 12);
        const dec2 = sunEq.dec * (Math.PI / 180);
        const dRA = ra2 - ra1;
        chi = Math.atan2(
          Math.cos(dec2) * Math.sin(dRA),
          Math.sin(dec2) * Math.cos(dec1) - Math.cos(dec2) * Math.sin(dec1) * Math.cos(dRA)
        );
      }
    } catch (_) {}
    return { phaseAngle: phaseAngle, chi: chi };
  }

  // SVG arc path for the lit hemisphere, centered at origin with radius R.
  // Arc 1 = lit limb (right semicircle CW in SVG y-down coords).
  // Arc 2 = terminator: sweep=1 (gibbous, lit>half), sweep=0 (crescent, lit<half).
  function _moonLitPath(R, phaseAngle) {
    const b = R * Math.cos(phaseAngle);
    const absB = Math.abs(b).toFixed(3);
    const sweep = b >= 0 ? 1 : 0;
    return (
      'M0,' + -R + ' A' + R + ',' + R + ' 0 0 1 0,' + R + ' A' + absB + ',' + R + ' 0 0 ' + sweep + ' 0,' + -R + ' Z'
    );
  }

  // Moon texture (img/moon-large.svg) with phase-correct dark overlay using SVG mask.
  // The mask makes the overlay transparent over the lit area and opaque over the dark area.
  // Uses the same coordinate system as eclipse glyphs: viewBox="0 0 40 40", R=14, cx=cy=20.
  function _moonPhaseOnDisk(dateStr, size, base, cid) {
    const pp = _moonPhaseParams(dateStr);
    const deg = ((pp.chi - Math.PI / 2) * (180 / Math.PI)).toFixed(1);
    const lit = _moonLitPath(14, pp.phaseAngle);
    const mid = cid + 'm'; // mask id
    return (
      svgOpen(size) +
      '<defs>' +
      '<clipPath id="' +
      cid +
      '"><circle cx="20" cy="20" r="14"/></clipPath>' +
      '<mask id="' +
      mid +
      '">' +
      '<rect x="0" y="0" width="40" height="40" fill="white"/>' +
      '<g transform="translate(20,20) rotate(' +
      deg +
      ')">' +
      '<path d="' +
      lit +
      '" fill="black"/>' +
      '</g>' +
      '</mask>' +
      '</defs>' +
      moonDisk(base) +
      '<g clip-path="url(#' +
      cid +
      ')" mask="url(#' +
      mid +
      ')">' +
      '<rect x="0" y="0" width="40" height="40" fill="#1C1A15" opacity="0.70"/>' +
      '</g>' +
      '</svg>'
    );
  }

  // Moon phase disk + planet glow dot in the upper-left corner of the disk.
  // Planet dot rendered above the phase overlay so it's always visible.
  function _moonWithPlanetOnDisk(dateStr, planetKey, size, base, cid) {
    const pp = _moonPhaseParams(dateStr);
    const deg = ((pp.chi - Math.PI / 2) * (180 / Math.PI)).toFixed(1);
    const lit = _moonLitPath(14, pp.phaseAngle);
    const mid = cid + 'm';
    const pc = _PLANET_INK[planetKey] || '#5A5040';
    // (11,11) in 40×40 viewBox = (-9,-9) from center (20,20): upper-left, inside R=14 disk
    return (
      svgOpen(size) +
      '<defs>' +
      '<clipPath id="' +
      cid +
      '"><circle cx="20" cy="20" r="14"/></clipPath>' +
      '<mask id="' +
      mid +
      '">' +
      '<rect x="0" y="0" width="40" height="40" fill="white"/>' +
      '<g transform="translate(20,20) rotate(' +
      deg +
      ')">' +
      '<path d="' +
      lit +
      '" fill="black"/>' +
      '</g>' +
      '</mask>' +
      '</defs>' +
      moonDisk(base) +
      '<g clip-path="url(#' +
      cid +
      ')">' +
      '<g mask="url(#' +
      mid +
      ')">' +
      '<rect x="0" y="0" width="40" height="40" fill="#1C1A15" opacity="0.70"/>' +
      '</g>' +
      '<circle cx="11" cy="11" r="4.5" fill="' +
      pc +
      '" opacity="0.22"/>' +
      '<circle cx="11" cy="11" r="2.2" fill="' +
      pc +
      '" opacity="0.95"/>' +
      '</g>' +
      '</svg>'
    );
  }

  function _planetDotSvg(planetKey, size) {
    const color = _PLANET_INK[planetKey] || '#5A5040';
    const C = (size / 2).toFixed(1);
    const r = Math.max(2.5, size * 0.11).toFixed(1); // ~3.3 at size=30
    const glowR = (parseFloat(r) * 2.8).toFixed(1);
    return (
      '<svg viewBox="0 0 ' +
      size +
      ' ' +
      size +
      '" width="' +
      size +
      '" height="' +
      size +
      '" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle cx="' +
      C +
      '" cy="' +
      C +
      '" r="' +
      glowR +
      '" fill="' +
      color +
      '" opacity="0.18"/>' +
      '<circle cx="' +
      C +
      '" cy="' +
      C +
      '" r="' +
      r +
      '" fill="' +
      color +
      '" opacity="0.92"/>' +
      '</svg>'
    );
  }

  // A gathering: one dot per body, clustered. The bodies come off object.key, which for a
  // conjunction names all of them (venus_and_mercury_and_jupiter), so the mark carries the
  // same information the sentence does — how many gathered, and which. Laid out on a small
  // circle rather than a row: a gathering has no order, and a row would read as a sequence.
  function _conjunctionGlyph(size, rec) {
    const key = (rec && rec.ident && rec.ident.key) || '';
    let keys = key.split('_and_').filter((k) => _PLANET_INK[k]);
    // the_five_planets, or a body with no ink of its own — draw five neutral dots for the
    // five, else fall back to a pair so the mark still reads as "more than one".
    if (!keys.length) keys = key === 'the_five_planets' ? Object.keys(_PLANET_INK) : ['', ''];
    const C = size / 2;
    const spread = size * 0.19;
    const r = Math.max(2, size * 0.082);
    const n = keys.length;
    let dots = '';
    for (let i = 0; i < n; i++) {
      // Single ring, starting at 12 o'clock. Two bodies land opposite each other, which is
      // what 「太白與歲星合」 looks like; more spread evenly around.
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const cx = (C + spread * Math.cos(a)).toFixed(1);
      const cy = (C + spread * Math.sin(a)).toFixed(1);
      const ink = _PLANET_INK[keys[i]] || '#5A5040';
      dots += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(1) + '" fill="' + ink + '" opacity="0.92"/>';
    }
    return (
      '<svg viewBox="0 0 ' +
      size +
      ' ' +
      size +
      '" width="' +
      size +
      '" height="' +
      size +
      '" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      // The halo says the bodies are gathered at one place, which is the whole claim.
      '<circle cx="' +
      C +
      '" cy="' +
      C +
      '" r="' +
      (spread + r * 1.9).toFixed(1) +
      '" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.3"/>' +
      dots +
      '</svg>'
    );
  }

  // Third parameter `rec` is the _map()-projected card; fourth `base` is the asset
  // path prefix for img/ (defaults to '' so img/moon-large.svg resolves from page root).
  function transientGlyph(kind, size, rec, base) {
    const s = size || 30;
    const b = base || '';
    if (kind === 'comet') {
      // Crop: nucleus at (120,235), dust/ion tail toward (215,150). viewBox frames
      // x=[88,230], y=[130,255] so the comet spans the full diagonal of the square.
      return (
        '<svg viewBox="88 130 142 125" width="' +
        s +
        '" height="' +
        s +
        '" ' +
        'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<image href="' +
        b +
        'img/comet_icon.svg" x="0" y="0" width="420" height="320"/>' +
        '</svg>'
      );
    }
    if (kind === 'conjunction') return _conjunctionGlyph(s, rec);
    if (kind !== 'occultation') {
      // guest star — supernova emblem, crop to central 130×130 burst region.
      return (
        '<svg viewBox="75 75 130 130" width="' +
        s +
        '" height="' +
        s +
        '" ' +
        'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<image href="' +
        b +
        'img/supernova_icon.svg" x="0" y="0" width="280" height="280"/>' +
        '</svg>'
      );
    }
    // occultation: dispatch on the body pair carried in the record.
    // rec is the _map()-projected card: ident = raw r.object, skyPos = r.sky_position, date = r.event_date.
    if (rec) {
      const objKey = rec.ident && rec.ident.key;
      const skyPos = rec.skyPos || '';
      const dateStr = rec.date || '';
      const cid = 'occ-' + (dateStr || 'x').replace(/[^a-z0-9]/gi, '-');
      if (objKey === 'the_moon') {
        const targetPlanet = _planetFromSkyPos(skyPos);
        return targetPlanet
          ? _moonWithPlanetOnDisk(dateStr, targetPlanet, s, b, cid)
          : _moonPhaseOnDisk(dateStr, s, b, cid);
      }
      if (_PLANET_INK[objKey]) return _planetDotSvg(objKey, s);
    }
    // Fallback (no record or unrecognised body): geometric two-circle mark.
    // occulted body (ring) drawn first, then the occulting body (disk) on top of its
    // left edge — one body passing over/near the other.
    const occult =
      '<circle cx="25.5" cy="20" r="5.6" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle cx="15.5" cy="20" r="8.4"/>';
    return (
      '<svg viewBox="0 0 40 40" width="' +
      s +
      '" height="' +
      s +
      '" ' +
      'fill="currentColor" aria-hidden="true">' +
      occult +
      '</svg>'
    );
  }

  // ---- Contact-Trajectory Schematic (eclipse phase diagram, shixiangtu, ported from AstroMeteoMap) ----
  // A larger diagram than the list glyph: the occulting body drawn at every
  // contact instant strung along its crossing trajectory, each contact labelled.
  // Lunar is a single global figure (Moon crossing Earth's penumbra+umbra rings);
  // solar is location-specific (Sun's diurnal arc with Sun∪Moon coverage glyphs
  // at each contact's real alt/az). Shown in the click-a-point observation popup.
  // Reuses the geometry core above (skyOffset/eqAtPeak/skyVec/ensureGlyph/…).

  // Apparent (refraction-corrected) alt/az of a body in degrees — mirrors the
  // popup's bodyAltAz (observe-popup.js) so the sky-path matches the horizon gate.
  function bodyHorizontal(body, date, lat, lng) {
    if (typeof Astronomy === 'undefined' || !(date instanceof Date) || isNaN(date.getTime())) return null;
    try {
      const obs = new Astronomy.Observer(lat, lng, 0);
      const equ = EphemCorrect.equator(body, date, obs);
      const h = Astronomy.Horizon(date, obs, equ.ra, equ.dec, 'normal');
      return { az: h.azimuth, alt: h.altitude };
    } catch (_) {
      return null;
    }
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // Attribute-safe escape (for inlining gloss text into a data-gloss attribute).
  const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
  // ` data-gloss="…"` fragment for an SVG element, or '' when no text given.
  const glossAttr = (s) => (s ? ` data-gloss="${escAttr(s)}"` : '');

  // ---- On-screen sizing vs. viewBox ----
  // These schematics ship `width="100%"`, so the browser scales the whole viewBox
  // to whatever the column gives it: anything authored at N user units lands at
  // N × (colPx / VBW) CSS px. That is right for geometry — shrink the column and
  // the diagram shrinks with it — but wrong for type and for hit targets, which
  // must hold a constant screen size to stay legible/clickable. Both fall out of
  // one factor: author them at (target × VBW / colPx) and the scaling cancels.
  //
  // colPx is the figure column's real CSS width, supplied by the caller (it is a
  // layout fact this module cannot read). It defaults to DESIGN_PX, the width these
  // diagrams were drawn against, so callers that pass nothing keep today's output.
  const DESIGN_PX = 320;
  const colOf = (opts) => (+opts.colPx > 0 ? +opts.colPx : DESIGN_PX);
  // Author-side multiplier that pins type at opts.textPx CSS px on screen. The 12
  // divisor is the size the diagrams were drawn at, so tk = 1 (a no-op) whenever
  // the caller asks for 12px in a DESIGN_PX-wide column. Gutters reserved FOR type
  // (padL under the altitude labels, padB under the azimuth row) must be scaled by
  // this too, or the labels grow into the plot.
  const textScale = (opts, VBW) => ((+opts.textPx > 0 ? +opts.textPx : 12) / 12) * (VBW / colOf(opts));

  // Transparent fat hit-casing for a thin schematic line, carrying its gloss so
  // the whole comfortable band — not the 1px visible stroke — triggers the
  // definition card. HitWidths.MIN is a screen-px floor, so it needs the same
  // colPx round-trip as type: at 240px the old hardcoded /316 silently narrowed
  // every band to ~76% of the intended target.
  const HIT_MIN = () => (typeof HitWidths !== 'undefined' ? HitWidths.MIN : 12);
  const hitW = (W, colPx) => f((HIT_MIN() * W) / (colPx || DESIGN_PX));
  function hitCasing(x1, y1, x2, y2, W, gloss, colPx) {
    return (
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" ` +
      `stroke-width="${hitW(W, colPx)}" fill="none" pointer-events="stroke"${glossAttr(gloss)}/>`
    );
  }

  // Polyline form of hitCasing — a transparent fat band tracing a multi-point line
  // (the solar diurnal arc) so the whole curve, not its 1px stroke, is hoverable.
  function hitCasingPoly(points, W, gloss, colPx) {
    return (
      `<polyline points="${points}" stroke="transparent" stroke-width="${hitW(W, colPx)}" ` +
      `fill="none" stroke-linejoin="round" stroke-linecap="round" pointer-events="stroke"${glossAttr(gloss)}/>`
    );
  }

  // Reusable arrowhead marker (points along the line it terminates). `color`
  // defaults to the path colour; the sky-path diagram passes the axis colour for
  // its coordinate-axis arrows.
  function arrowMarker(id, color) {
    color = color || 'var(--ecl-schem-path, #8a93a3)';
    return (
      `<defs><marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" ` +
      `markerWidth="5" markerHeight="5" orient="auto-start-reverse">` +
      `<path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker></defs>`
    );
  }

  // A body disc drawn with the project's Sun/Moon disk art (a disk filling its own
  // viewBox, transparent outside) instead of a flat fill, with an optional
  // translucent depth tint and an optional rim stroke. Lets the moon/sun faces
  // show real texture in the schematics.
  function texturedDisc(href, cx, cy, r, tintColor, tintOpacity, rim) {
    const d = 2 * r;
    let out = `<image href="${href}" x="${f(cx - r)}" y="${f(cy - r)}" width="${f(d)}" height="${f(d)}"/>`;
    if (tintColor && tintOpacity > 0)
      out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${tintColor}" opacity="${tintOpacity}"/>`;
    if (rim) out += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${rim}" stroke-width="0.8"/>`;
    return out;
  }

  // Inline corona at an arbitrary SVG centre/radius — the total-solar coverage
  // glyph for the sky-path diagram's greatest-eclipse position (scaled by rPx).
  function coronaAt(cx, cy, rPx) {
    const kS = rPx / R;
    const bo = (R / Math.SQRT2) * kS; // bead offset along each axis (45°)
    return (
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(15 * kS)}" fill="none" stroke="var(--ecl-corona,#b7c2cd)" stroke-width="${f(1.8 * kS)}"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rPx)}" fill="var(--ecl-corona-disk,#15161a)"/>` +
      `<circle cx="${f(cx + bo)}" cy="${f(cy - bo)}" r="${f(2.5 * kS)}" fill="var(--ecl-corona-bead,#eef1f4)"/>`
    );
  }

  /**
   * EclipseWise-style summary stats for a lunar eclipse's schematic corner readout.
   * Returns { umbralMag, penumbralMag, gamma, partialMin, totalMin } — any field
   * null when it can't be derived. gamma = least distance of the Moon's centre from
   * the shadow axis in Earth-radii, north positive.
   */
  function lunarStats(event) {
    const g = ensureGlyph(event);
    const t = event.times || {};
    const out = { umbralMag: null, penumbralMag: null, gamma: null, partialMin: null, totalMin: null };
    if (g && isNum(g.sd_primary) && g.sd_primary > 0 && isNum(g.sep)) {
      const sd = g.sd_primary;
      if (isNum(g.rho_umbra)) out.umbralMag = (g.rho_umbra + sd - g.sep) / (2 * sd);
      if (isNum(g.rho_penum)) out.penumbralMag = (g.rho_penum + sd - g.sep) / (2 * sd);
      try {
        if (typeof Astronomy !== 'undefined' && Astronomy.GeoVector && t.peak) {
          const sun = eqAtPeak(Astronomy.Body.Sun, t.peak),
            moon = eqAtPeak(Astronomy.Body.Moon, t.peak);
          const pi_moon = Math.asin(R_EARTH_KM / moon.dist_km);
          const anti = { ra: sun.ra + Math.PI, dec: -sun.dec };
          const { sep, pa } = skyVec(anti, moon);
          out.gamma = (sep / pi_moon) * (Math.cos(pa) >= 0 ? 1 : -1);
        }
      } catch (_) {
        /* leave gamma null */
      }
    }
    // Only a positive stored value overrides geometry: the build bakes umbralMag/
    // penumbralMag=0 for penumbral events, which would clobber the correct value.
    if (isNum(event.umbralMag) && event.umbralMag > 0) out.umbralMag = event.umbralMag;
    if (isNum(event.penumbralMag) && event.penumbralMag > 0) out.penumbralMag = event.penumbralMag;
    const durSec = (a, b) => (a && b ? (Date.parse(b) - Date.parse(a)) / 1000 : null);
    const par = isNum(event.partialDurSec) ? event.partialDurSec : durSec(t.u1, t.u4);
    const tot = isNum(event.totalDurSec) ? event.totalDurSec : durSec(t.u2, t.u3);
    if (par != null && isFinite(par)) out.partialMin = par / 60;
    if (tot != null && isFinite(tot)) out.totalMin = tot / 60;
    return out;
  }

  // Lunar: the Moon strung along its real crossing trajectory through Earth's
  // concentric penumbra/umbra shadow. Celestial north up, east left (sky view).
  // Each Moon sits at its true sky offset from the antisolar point (= shadow
  // centre) at that contact, so the path tilt is real and the red umbral bite
  // falls on the geometrically correct side. gloss supplies hover text.
  function lunarSchematic(event, opts) {
    opts = opts || {};
    const base = opts.assetBase || '';
    const gloss = opts.gloss || {};
    const colPx = colOf(opts);
    if (typeof Astronomy === 'undefined' || !Astronomy.GeoVector) return '';
    const g = ensureGlyph(event);
    const t = event.times || {};
    if (!g || !isNum(g.sd_primary) || g.sd_primary <= 0 || !isNum(g.rho_umbra) || !isNum(g.rho_penum)) return '';
    const sd = g.sd_primary;
    const rUm = g.rho_umbra / sd,
      rPen = g.rho_penum / sd;

    // Moon offset from the antisolar point (Moon-radii, sky view) at one instant.
    function moonAt(iso) {
      const sun = eqAtPeak(Astronomy.Body.Sun, iso),
        moon = eqAtPeak(Astronomy.Body.Moon, iso);
      const anti = { ra: sun.ra + Math.PI, dec: -sun.dec };
      const v = skyVec(anti, moon);
      const o = skyOffset(v.sep / sd, v.pa);
      return { x: o.dx, y: o.dy };
    }

    const order = [
      ['P1', t.p1],
      ['U1', t.u1],
      ['U2', t.u2],
      ['G', t.peak],
      ['U3', t.u3],
      ['U4', t.u4],
      ['P4', t.p4],
    ].filter((o) => o[1]);
    const pts = [];
    for (const [key, iso] of order) {
      try {
        const m = moonAt(iso);
        if (isFinite(m.x) && isFinite(m.y)) pts.push({ key, x: m.x, y: m.y });
      } catch (_) {
        /* skip */
      }
    }
    if (!pts.length) return '';

    // Moon-path direction (ingress→egress) and its extended, arrowed endpoints.
    const a = pts[0],
      z = pts[pts.length - 1];
    let pdx = z.x - a.x,
      pdy = z.y - a.y;
    const plen = Math.hypot(pdx, pdy) || 1;
    pdx /= plen;
    pdy /= plen;
    const EXT = 1.6;
    const path0 = { x: a.x - pdx * EXT, y: a.y - pdy * EXT };
    const path1 = { x: z.x + pdx * EXT, y: z.y + pdy * EXT };

    // Ecliptic direction through the shadow centre: two antisolar samples 1 h apart.
    let ecl0 = null,
      ecl1 = null;
    try {
      const pk = Date.parse(t.peak);
      const s0 = eqAtPeak(Astronomy.Body.Sun, t.peak);
      const s1 = eqAtPeak(Astronomy.Body.Sun, new Date(pk + 3600000).toISOString());
      const v = skyVec({ ra: s0.ra + Math.PI, dec: -s0.dec }, { ra: s1.ra + Math.PI, dec: -s1.dec });
      const u = skyOffset(1, v.pa);
      const L = plen / 2 + EXT;
      ecl0 = { x: u.dx * L, y: u.dy * L };
      ecl1 = { x: -u.dx * L, y: -u.dy * L };
    } catch (_) {
      /* ecliptic optional */
    }

    // Pixel mapping — gather bounds over every element drawn.
    const S = 20,
      pad = 16;
    const xs = [-rPen, rPen, path0.x, path1.x],
      ys = [-rPen, rPen, path0.y, path1.y];
    if (ecl0) {
      xs.push(ecl0.x, ecl1.x);
      ys.push(ecl0.y, ecl1.y);
    }
    for (const p of pts) {
      xs.push(p.x - 1, p.x + 1);
      ys.push(p.y - 1, p.y + 1);
    }
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    // Unlike the solar diagram's fixed 320-unit frame, W here is whatever the
    // geometry needs, so type must be authored against W to land at textPx on
    // screen. The old `12 * max(1, W/320)` only compensated for an over-wide
    // viewBox and still assumed a ~320px column; this holds for any column.
    const W = (maxX - minX) * S + 2 * pad;
    const labelFS = ((+opts.textPx > 0 ? +opts.textPx : 12) * W) / colPx;
    // The contact-key row hangs below the geometry. Both offsets were authored
    // against a 12-unit label (baseline 13 down, row 18 tall), so keep them as
    // ratios of labelFS or the row collides with the Moon discs once type grows.
    const labelDrop = labelFS * (13 / 12);
    const H = (maxY - minY) * S + 2 * pad + labelFS * (18 / 12);
    const Xn = (u) => (u - minX) * S + pad,
      Yn = (u) => (u - minY) * S + pad;

    const X = (u) => f(Xn(u)),
      Y = (u) => f(Yn(u));
    const cx0 = Xn(0),
      cy0 = Yn(0),
      rPenPx = rPen * S,
      rUmPx = rUm * S;
    const uid = String(event.date || 'lun').replace(/[^a-z0-9]/gi, '');
    const cg = gloss.contacts || {};

    let s = `<svg viewBox="0 0 ${f(W)} ${f(H)}" width="100%" class="ecl-schematic" role="img" font-family="var(--font-text)">`;
    s += arrowMarker(`arr-${uid}`);
    // Background shadow rings — neutral dark shadows (no red; red lives only on
    // the shadowed Moon faces below, matching the list-card glyph effect).
    s += `<circle cx="${X(0)}" cy="${Y(0)}" r="${f(rPenPx)}" fill="var(--ecl-schem-pen, #353b47)" opacity="0.5" stroke="var(--ecl-schem-pen-rim, #5a6373)" stroke-width="1"${glossAttr(gloss.penumbra)}/>`;
    s += `<circle cx="${X(0)}" cy="${Y(0)}" r="${f(rUmPx)}" fill="var(--ecl-schem-umb, #23262d)" opacity="0.85" stroke="var(--ecl-schem-umb-rim, #3a3f49)" stroke-width="1"${glossAttr(gloss.umbra)}/>`;
    // Ecliptic (solid, faint) and × at the shadow centre.
    if (ecl0) {
      s += `<line x1="${X(ecl0.x)}" y1="${Y(ecl0.y)}" x2="${X(ecl1.x)}" y2="${Y(ecl1.y)}" stroke="var(--ecl-schem-axis, #6f7787)" stroke-width="1" opacity="0.7" pointer-events="none"/>`;
      s += hitCasing(X(ecl0.x), Y(ecl0.y), X(ecl1.x), Y(ecl1.y), W, gloss.ecliptic, colPx);
    }
    const xr = S * 0.275;
    s +=
      `<g stroke="var(--ecl-schem-axis, #6f7787)" stroke-width="1.1" opacity="0.9" pointer-events="none">` +
      `<line x1="${f(cx0 - xr)}" y1="${f(cy0 - xr)}" x2="${f(cx0 + xr)}" y2="${f(cy0 + xr)}"/>` +
      `<line x1="${f(cx0 - xr)}" y1="${f(cy0 + xr)}" x2="${f(cx0 + xr)}" y2="${f(cy0 - xr)}"/></g>`;
    // Shadow-centre hit target (transparent, above ring fills but below the discs).
    const xHitR = hitW(W, colPx);
    s += `<circle cx="${f(cx0)}" cy="${f(cy0)}" r="${xHitR}" fill="transparent" pointer-events="all"${glossAttr(gloss.shadowcenter)}/>`;
    // Moon path (dashed, arrow at the egress end) + transparent hoverable casing.
    s += `<line x1="${X(path0.x)}" y1="${Y(path0.y)}" x2="${X(path1.x)}" y2="${Y(path1.y)}" stroke="var(--ecl-schem-path, #8a93a3)" stroke-width="1" stroke-dasharray="3 3" opacity="0.85" marker-end="url(#arr-${uid})" pointer-events="none"/>`;
    s += hitCasing(X(path0.x), Y(path0.y), X(path1.x), Y(path1.y), W, gloss.moonpath, colPx);
    // Contact labels first so the Moon disks (drawn next) occlude them on overlap.
    const labelY = f((maxY - minY) * S + pad + labelDrop);
    for (const p of pts) {
      s += `<text x="${X(p.x)}" y="${labelY}" text-anchor="middle" font-size="${f(labelFS)}" fill="var(--ecl-schem-label, #9aa4b2)"${glossAttr(cg[p.key])}>${esc(p.key)}</text>`;
    }
    // Moon at each contact: disk art + penumbra/umbra washes clipped to the disk,
    // so each shadow wash covers exactly the Moon ∩ shadow overlap.
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i],
        mx = Xn(p.x),
        my = Yn(p.y),
        cid = `eclm-${uid}-${i}`;
      s += `<g${glossAttr(cg[p.key])}>`;
      s += `<image href="${base}img/moon-large.svg" x="${f(mx - S)}" y="${f(my - S)}" width="${f(2 * S)}" height="${f(2 * S)}"/>`;
      s += `<defs><clipPath id="${cid}"><circle cx="${f(mx)}" cy="${f(my)}" r="${f(S)}"/></clipPath></defs>`;
      s +=
        `<g clip-path="url(#${cid})">` +
        `<circle cx="${f(cx0)}" cy="${f(cy0)}" r="${f(rPenPx)}" fill="var(--ecl-penumbra, #2a221c)" opacity="0.4"/>` +
        `<circle cx="${f(cx0)}" cy="${f(cy0)}" r="${f(rUmPx)}" fill="var(--ecl-umbra, #a8472e)" opacity="0.8"/>` +
        `</g>`;
      s += `</g>`;
    }
    s += `</svg>`;
    return s;
  }

  // Solar: altitude-azimuth "sky-position" diagram — the Sun's diurnal arc as seen
  // from the observer, with Sun+Moon coverage glyphs at each contact's real sky
  // position. x = windowed azimuth (P1→P4 left→right in time); y = altitude
  // 0°(horizon, bottom) to 90°(zenith, top). opts = { assetBase, observer:{lat,lng},
  // contacts:{c1,maxTime,c4,c1AtHorizon,c4AtHorizon,maxPhase}, gloss, labels,
  // colPx, textPx }.
  function solarSkyPath(event, opts) {
    if (typeof Astronomy === 'undefined' || !Astronomy.Horizon) return '';
    const base = opts.assetBase || '';
    const obs = opts.observer,
      c = opts.contacts || {};
    const cg = opts.gloss || {};
    const labels = opts.labels || {};
    if (!obs) return '';
    const lat = obs.lat,
      lng = obs.lng;
    const Sun = Astronomy.Body.Sun,
      Moon = Astronomy.Body.Moon;
    const aeObs = new Astronomy.Observer(lat, lng, 0);

    // Contacts shown: P1 · G · P4 only (five glyphs over a narrow azimuth window
    // is too crowded). P1/P4 may carry a horizon-crossing marker (sunrise/sunset)
    // instead of the true exterior contact — c1AtHorizon/c4AtHorizon flag those.
    const order = [
      ['P1', c.c1, !!c.c1AtHorizon],
      ['G', c.maxTime, false],
      ['P4', c.c4, !!c.c4AtHorizon],
    ].filter((o) => o[1] instanceof Date && !isNaN(o[1]));
    if (!order.length) return '';

    // Per-contact sky geometry: Sun/Moon alt-az (deg) + angular semidiameters (deg).
    function contactGeom(date) {
      const sunH = bodyHorizontal(Sun, date, lat, lng);
      const moonH = bodyHorizontal(Moon, date, lat, lng);
      if (!sunH || !moonH) return null;
      const se = EphemCorrect.equator(Sun, date, aeObs);
      const me = EphemCorrect.equator(Moon, date, aeObs);
      const sdSun = (Math.asin(R_SUN_KM / (se.dist * Astronomy.KM_PER_AU)) * 180) / Math.PI;
      const sdMoon = (Math.asin(R_MOON_KM / (me.dist * Astronomy.KM_PER_AU)) * 180) / Math.PI;
      return { sunAz: sunH.az, sunAlt: sunH.alt, moonAz: moonH.az, moonAlt: moonH.alt, sdSun, sdMoon };
    }

    const contacts = [];
    for (const [key, date, atHorizon] of order) {
      try {
        const g = contactGeom(date);
        if (g && isFinite(g.sunAlt) && isFinite(g.sunAz)) {
          if (atHorizon) g.sunAlt = Math.max(0, g.sunAlt);
          contacts.push({ key, date, ...g });
        }
      } catch (_) {
        /* skip */
      }
    }
    if (!contacts.length) return '';

    // Unwrap azimuths relative to G so arcs crossing due north stay continuous.
    const gContact = contacts.find((p) => p.key === 'G') || contacts[Math.floor(contacts.length / 2)];
    const refAz = gContact.sunAz;
    const unwrap = (aVal) => {
      let d = aVal - refAz;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      return refAz + d;
    };
    for (const p of contacts) {
      p.sunAzU = unwrap(p.sunAz);
      p.moonAzU = unwrap(p.moonAz);
    }

    const tC1 = order[0][1].getTime(),
      tC4 = order[order.length - 1][1].getTime();
    const span = Math.max(tC4 - tC1, 60000);

    const VBW = 320,
      VBH = 210;
    // Type holds at opts.textPx on screen for any column width (see textScale);
    // only the two gutters that actually carry type scale with it — padL sits
    // under the right-anchored altitude labels, padB under the azimuth row. padR
    // and padT are bare margins, so scaling them would just eat the plot.
    // Geometry (rPx, the grid, the arc) stays in raw units and so keeps shrinking
    // with the column — which is the point: the figure gets smaller, the type does not.
    const tk = textScale(opts, VBW);
    const colPx = colOf(opts);
    const FS = 12 * tk;
    const padL = 36 * tk,
      padR = 16,
      padT = 16,
      padB = 30 * tk;
    const plotW = VBW - padL - padR,
      plotH = VBH - padT - padB;
    const rPx = 16;

    const azVals = [];
    for (const p of contacts) if (p.sunAlt >= 0) azVals.push(p.sunAzU, p.moonAzU);
    if (!azVals.length) for (const p of contacts) azVals.push(p.sunAzU);
    let azMin = Math.min(...azVals),
      azMax = Math.max(...azVals);
    const azPad = Math.max((azMax - azMin) * 0.12, 0.6);
    azMin -= azPad;
    azMax += azPad;

    const inset = rPx + 2;
    const yOf = (alt) => padT + ((90 - alt) / 90) * plotH;
    const xOf = (az) => padL + inset + ((az - azMin) / (azMax - azMin)) * (plotW - 2 * inset);

    const uid = String(event.date || 'sol').replace(/[^a-z0-9]/gi, '');
    let s = `<svg viewBox="0 0 ${VBW} ${VBH}" width="100%" class="ecl-schematic ecl-skypath" role="img" font-family="var(--font-text)">`;
    s += arrowMarker(`arr-path-${uid}`);
    s += arrowMarker(`arr-axis-${uid}`, 'var(--ecl-schem-axis,#6f7787)');

    // 1. Coordinate frame: 30°/60° altitude grid + left axis with zenith arrow.
    s += `<g class="ecl-skp-axis">`;
    for (const gAlt of [30, 60]) {
      const gy = f(yOf(gAlt));
      s += `<line x1="${f(padL)}" y1="${gy}" x2="${f(VBW - padR)}" y2="${gy}" stroke="var(--ecl-schem-grid,var(--ecl-schem-axis,#6f7787))" stroke-width="0.6" stroke-opacity="0.18"/>`;
    }
    s += `<line x1="${f(padL)}" y1="${f(yOf(0))}" x2="${f(padL)}" y2="${f(yOf(90) - 4)}" stroke="var(--ecl-schem-axis,#6f7787)" stroke-width="0.8" stroke-opacity="0.5" marker-end="url(#arr-axis-${uid})"/>`;
    for (const gAlt of [0, 30, 60, 90]) {
      s += `<text x="${f(padL - 4)}" y="${f(yOf(gAlt) + FS * 0.34)}" text-anchor="end" font-size="${FS}" fill="var(--ecl-schem-label,#9aa4b2)" opacity="0.65">${gAlt}°</text>`;
    }
    s += `</g>`;

    // 2. Diurnal arc — sampled over a wider window than the contacts, above-horizon
    //    only, split into runs at the horizon and clipped to the plot box.
    const xL = padL,
      xR = VBW - padR;
    const padMsDraw = span * 1.0;
    const ARC_DRAW_N = 56;
    const arcRuns = [];
    let run = [];
    for (let i = 0; i <= ARC_DRAW_N; i++) {
      const tt = new Date(tC1 - padMsDraw + ((span + 2 * padMsDraw) * i) / ARC_DRAW_N);
      const h = bodyHorizontal(Sun, tt, lat, lng);
      if (h && isFinite(h.az) && isFinite(h.alt) && h.alt >= 0) run.push({ x: xOf(unwrap(h.az)), y: yOf(h.alt) });
      else if (run.length) {
        arcRuns.push(run);
        run = [];
      }
    }
    if (run.length) arcRuns.push(run);
    const crossX = (p0, p1, x) => ({ x, y: p0.y + ((x - p0.x) / (p1.x - p0.x)) * (p1.y - p0.y) });
    const clipRunX = (ptsIn) => {
      const outRuns = [];
      let cur = [];
      for (let i = 0; i < ptsIn.length; i++) {
        const p = ptsIn[i],
          inside = p.x >= xL && p.x <= xR;
        if (inside) {
          if (!cur.length && i > 0) {
            const q = ptsIn[i - 1];
            cur.push(crossX(q, p, q.x < xL ? xL : xR));
          }
          cur.push(p);
        } else if (cur.length) {
          const q = cur[cur.length - 1];
          cur.push(crossX(q, p, p.x < xL ? xL : xR));
          outRuns.push(cur);
          cur = [];
        } else if (i > 0) {
          const q = ptsIn[i - 1];
          if ((q.x < xL && p.x > xR) || (q.x > xR && p.x < xL))
            outRuns.push([crossX(q, p, q.x < xL ? xL : xR), crossX(q, p, p.x < xL ? xL : xR)]);
        }
      }
      if (cur.length) outRuns.push(cur);
      return outRuns;
    };
    const drawRuns = [];
    for (const r of arcRuns) for (const cc of clipRunX(r)) if (cc.length >= 2) drawRuns.push(cc);
    for (let si = 0; si < drawRuns.length; si++) {
      const ptsStr = drawRuns[si].map((p) => `${f(p.x)},${f(p.y)}`).join(' ');
      const arrow = si === drawRuns.length - 1 ? ` marker-end="url(#arr-path-${uid})"` : '';
      s += `<polyline class="ecl-skp-arc" points="${ptsStr}" fill="none" stroke="var(--ecl-schem-path,#8a93a3)" stroke-width="1.2" stroke-opacity="0.4" pointer-events="none"${arrow}/>`;
      s += hitCasingPoly(ptsStr, VBW, cg.sunpath, colPx);
    }

    // 3. Horizon line — always on, solid; arrow points toward increasing azimuth.
    const hy = f(yOf(0));
    s += `<line class="ecl-skp-horizon" x1="${f(padL)}" y1="${hy}" x2="${f(VBW - padR)}" y2="${hy}" stroke="var(--ecl-horizon,var(--ecl-schem-axis,#6f7787))" stroke-width="1" stroke-opacity="0.6" marker-end="url(#arr-axis-${uid})"/>`;

    // 4. Per-contact group: hover crosshair + altitude read-out + P-label + azimuth
    //    tick + coverage glyph + transparent hit circle. Below-horizon contacts are
    //    skipped (they still show, dimmed, in the contact table).
    const maxPhase = (c.maxPhase || '').toLowerCase();
    const drawn = contacts.filter((p) => p.sunAlt >= 0);
    const azRowY = f(VBH - padB + FS + 2);

    const geo = drawn.map((p) => {
      const gx = xOf(p.sunAzU),
        gy = yOf(p.sunAlt);
      const k = rPx / p.sdSun;
      const dxDeg = (p.moonAzU - p.sunAzU) * Math.cos((p.sunAlt * Math.PI) / 180);
      const dyDeg = p.moonAlt - p.sunAlt;
      const mdx = k * dxDeg,
        mdy = -k * dyDeg;
      const rMoonPx = rPx * (p.sdMoon / p.sdSun);
      const glyphTop = Math.min(gy - rPx, gy + mdy - rMoonPx);
      const glyphBot = Math.max(gy + rPx, gy + mdy + rMoonPx);
      return { p, gx, gy, mdx, mdy, rMoonPx, glyphTop, glyphBot, ly: 0 };
    });

    // Label collision avoidance: keep each P-label clear of the sun∪moon glyph and
    // of already-placed labels.
    const yMin = padT + FS,
      yMax = VBH - padB - 4;
    const STEP = FS + 6;
    const placedBoxes = [];
    const boxesOverlap = (b1, b2) => b1.x0 < b2.x1 && b2.x0 < b1.x1 && b1.y0 < b2.y1 && b2.y0 < b1.y1;
    const boxAt = (ly, x0, x1) => ({ x0, x1, y0: ly - FS, y1: ly + 3 });
    for (const gg of geo) {
      const w = Math.max(FS, esc(labels[gg.p.key] || gg.p.key).length * FS * 0.66) + 4;
      const x0 = gg.gx - w / 2,
        x1 = gg.gx + w / 2;
      const cand = [];
      for (let i = 0; i < 6; i++) cand.push(gg.glyphTop - 4 - i * STEP);
      for (let i = 0; i < 6; i++) cand.push(gg.glyphBot + FS + i * STEP);
      let chosen = null;
      for (const ly of cand) {
        if (ly - FS < yMin || ly + 3 > yMax) continue;
        const box = boxAt(ly, x0, x1);
        if (!placedBoxes.some((b) => boxesOverlap(box, b))) {
          chosen = { ly, box };
          break;
        }
      }
      if (!chosen) {
        const ly = Math.min(yMax - 3, Math.max(yMin + FS, gg.glyphTop - 4));
        chosen = { ly, box: boxAt(ly, x0, x1) };
      }
      gg.ly = chosen.ly;
      placedBoxes.push(chosen.box);
    }

    for (const gg of geo) {
      const p = gg.p,
        gx = gg.gx,
        gy = gg.gy,
        mdx = gg.mdx,
        mdy = gg.mdy,
        rMoonPx = gg.rMoonPx;
      s += `<g class="ecl-skp-pt">`;
      s += `<line class="ecl-skp-cross" x1="${f(gx)}" y1="${f(gy)}" x2="${f(gx)}" y2="${hy}"/>`;
      s += `<line class="ecl-skp-cross" x1="${f(gx)}" y1="${f(gy)}" x2="${f(padL)}" y2="${f(gy)}"/>`;
      const altDeg = Math.round(p.sunAlt);
      const altStr = (altDeg < 0 ? '−' : '+') + Math.abs(altDeg) + '°';
      s += `<text class="ecl-skp-hialt" x="${f(padL - 4)}" y="${f(gy + FS * 0.34)}" text-anchor="end" font-size="${FS}">${altStr}</text>`;
      s += `<text class="ecl-skp-label" x="${f(gx)}" y="${f(gg.ly)}" text-anchor="middle" font-size="${FS}" fill="var(--ecl-schem-label,#9aa4b2)"${glossAttr(cg[p.key])}>${esc(labels[p.key] || p.key)}</text>`;
      const azDeg = Math.round(((p.sunAz % 360) + 360) % 360);
      const ax = Math.max(FS, Math.min(VBW - FS, gx));
      s += `<text class="ecl-skp-az" x="${f(ax)}" y="${azRowY}" text-anchor="middle" font-size="${FS}" fill="var(--ecl-schem-label,#9aa4b2)" opacity="0.7">${azDeg}°</text>`;
      s += `<g class="ecl-skyglyph">`;
      if (p.key === 'G') {
        if (maxPhase === 'total') {
          s += coronaAt(gx, gy, rPx);
        } else if (maxPhase === 'annular') {
          s += texturedDisc(`${base}img/sun-large.svg`, gx, gy, rPx, null, 0, null);
          s += `<circle cx="${f(gx + mdx)}" cy="${f(gy + mdy)}" r="${f(rMoonPx)}" fill="var(--ecl-moon-silhouette,#15161a)"/>`;
        } else {
          s += texturedDisc(`${base}img/sun-large.svg`, gx, gy, rPx, null, 0, null);
          s += texturedDisc(
            `${base}img/moon-large.svg`,
            gx + mdx,
            gy + mdy,
            rMoonPx,
            'var(--ecl-moon-silhouette,#15161a)',
            0.9,
            null
          );
        }
      } else {
        s += texturedDisc(`${base}img/sun-large.svg`, gx, gy, rPx, null, 0, null);
        s += texturedDisc(
          `${base}img/moon-large.svg`,
          gx + mdx,
          gy + mdy,
          rMoonPx,
          'var(--ecl-moon-silhouette,#15161a)',
          0.9,
          null
        );
      }
      s += `</g>`;
      const rHit = f(Math.max(rPx, rMoonPx) + 2);
      s += `<circle class="ecl-skp-hit" cx="${f(gx)}" cy="${f(gy)}" r="${rHit}"${glossAttr(cg[p.key])}/>`;
      s += `</g>`;
    }
    s += `</svg>`;
    return s;
  }

  // Public: contact-trajectory schematic for the observation popup. Returns ''
  // when geometry is unavailable so the caller can omit the figure.
  //
  // opts.colPx / opts.textPx decouple type size from figure size: pass the figure
  // column's CSS width and the on-screen px you want the labels to hold, and the
  // diagram scales while the type does not. Omit both to get the historical
  // behaviour (drawn for a 320px column at 12px type).
  function renderSchematic(event, opts) {
    opts = opts || {};
    try {
      return event._kind === 'solar' ? solarSkyPath(event, opts) : lunarSchematic(event, opts);
    } catch (_) {
      return '';
    }
  }

  return { render, renderLocal, renderSchematic, lunarStats, lunarMagnitude, lunarShadowAt, transientGlyph };
})();
