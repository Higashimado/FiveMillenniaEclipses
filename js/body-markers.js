/**
 * body-markers.js — Sun & Moon disk textures at their sub-points.
 *
 * Ported from AstroMeteoMap (see ATTRIBUTION.md): the footprint-sized disk
 * markers, the phase-aware moon disk, and the sun's large↔xlarge level-of-detail
 * swap. The glow/glare canvas, day-mode bloom and distance z-sort are deliberately
 * NOT ported — they belong to a luminosity model this project does not have.
 *
 * The disk is pinned to a real ground FOOTPRINT rather than a fixed pixel size, so
 * it doubles every zoom level and divides by cos(lat) for the Mercator stretch.
 * That is what makes it read as an object lying ON the Earth rather than a marker
 * floating above it. Floored to 32 px so it stays visible when zoomed out, with a
 * large↔xlarge SVG crossfade above ~80-160 px. The moon carries its phase
 * (elliptical terminator + earthshine + north-pole texture pose) so a
 * solar-eclipse new moon reads dark; a live Earth-shadow "bite" is grafted
 * straight from EclipseGlyph.lunarShadowAt during eclipses.
 *
 * Pure renderer: BodyMarkers.render(map, group, date) draws two markers into
 * `group`. The caller (js/eclipse.js) owns the layer lifecycle + redraw timing.
 */
const BodyMarkers = (() => {
  'use strict';

  // ---- Tiny geometry helpers ----
  const RAD = Math.PI / 180,
    DEG = 180 / Math.PI;
  const rad = (d) => d * RAD;
  const deg = (r) => r * DEG;
  const clamp = (lo, hi, x) => Math.max(lo, Math.min(hi, x));
  // Smoothstep, used for both the disk-appearance ramp and the LOD crossfade: a
  // linear ramp makes the swap visible as a hard edge at either end.
  const smoothstep = (e0, e1, x) => {
    const t = clamp(0, 1, (x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };
  const normLng = (lng) => (((lng % 360) + 540) % 360) - 180;

  // ---- Constants ----
  // SUN_FOOTPRINT_KM: the Sun's ~31.5' apparent diameter subtends ~59 km on the
  // ground. MIN_DISK_PX 32 is a display floor, not physics — at true scale both
  // bodies vanish when zoomed out, and a marker you cannot see cannot be read.
  // DISK_RASTER_CAP_PX: rasterize at most 512 px and CSS-scale beyond that, so max
  // zoom does not build an enormous SVG bitmap for no added detail.
  const SUN_FOOTPRINT_KM = 59;
  const MOON_DIAM_KM = 3474;
  const EARTH_R_KM = 6371.0;
  const AU_KM = 149597870.7;
  const MIN_DISK_PX = 32;
  const DISK_RASTER_CAP_PX = 512;

  // ---- Ground-footprint size law ----
  // px = (Web-Mercator px/km at z0) · diamKm · 2^zoom / cos(lat). The disk is
  // anchored to real km on the ground, not a fixed screen size.
  const PX_PER_KM_Z0 = 256 / 40075.017;
  function footprintPx(zoom, diamKm, lat) {
    if (lat === undefined) lat = 0;
    const cosLat = Math.max(0.01, Math.cos(lat * RAD));
    return (PX_PER_KM_Z0 * diamKm * Math.pow(2, zoom)) / cosLat;
  }

  // Body ground footprint (km) from its angular diameter at geocentric distance.
  function footprintKmFromDist(diamKm, distAU) {
    return EARTH_R_KM * (diamKm / (distAU * AU_KM));
  }

  // ---- Body position + sub-point ----
  // bodyPosition returns EQJ (J2000) RA/Dec in radians — good enough for the
  // RELATIVE angles (bright-limb PA, north-pole PA) since the frame cancels.
  function bodyPosition(date, body) {
    const t = Astronomy.MakeTime(date);
    const v = EphemCorrect.correct(Astronomy.GeoVector(body, t, true), body, date);
    const d = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return { alpha: Math.atan2(v.y, v.x), delta: Math.asin(v.z / d) };
  }

  // Ground sub-point: rotate the EQJ vector to EQD (of-date) so it pairs with
  // apparent sidereal time, then lat = dec, lng = RA − GAST.
  function bodySubPoint(date, body) {
    const t = Astronomy.MakeTime(date);
    const v = Astronomy.RotateVector(
      Astronomy.Rotation_EQJ_EQD(t),
      EphemCorrect.correct(Astronomy.GeoVector(body, t, true), body, date)
    );
    const d = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const gast = Astronomy.SiderealTime(t) * 15; // apparent ST (deg), pairs with EQD α
    return { lat: deg(Math.asin(v.z / d)), lng: normLng(deg(Math.atan2(v.y, v.x)) - gast), distAU: d };
  }

  // Position angle (rad) of body 2 relative to body 1, north through east.
  function positionAngle(ra1, dec1, ra2, dec2) {
    const dRA = ra2 - ra1;
    const sinPA = Math.cos(dec2) * Math.sin(dRA);
    const cosPA = Math.sin(dec2) * Math.cos(dec1) - Math.cos(dec2) * Math.sin(dec1) * Math.cos(dRA);
    return Math.atan2(sinPA, cosPA);
  }

  // ---- Disk raster helpers ----
  const diskRenderSize = (fpPx) => Math.min(fpPx, DISK_RASTER_CAP_PX);
  const moonSvgSrc = (fpPx) => (smoothstep(80, 160, fpPx) > 0.5 ? 'img/moon-xlarge.svg' : 'img/moon-large.svg');

  // Wrap disk content (built at renderW×renderH) so it visually fills
  // visualW×visualH while its backing raster stays the render size. Uniform scale
  // preserves aspect; transform-origin 0 0 keeps the scaled box at the divIcon's
  // top-left so the visual center still lands on iconAnchor.
  function scaleDiskWrap(innerHtml, renderW, renderH, visualW, visualH) {
    if (visualW <= renderW + 0.5 && visualH <= renderH + 0.5) return innerHtml;
    const k = visualW / renderW;
    return (
      '<div style="width:' +
      renderW +
      'px;height:' +
      renderH +
      'px;transform:scale(' +
      k.toFixed(4) +
      ');transform-origin:0 0">' +
      innerHtml +
      '</div>'
    );
  }

  // ---- Unique clipPath id counter + phase-SVG memo ----
  let _iconId = 0;
  const _phaseCache = new Map();
  const _PHASE_CACHE_LIMIT = 256;

  // ---- Phased-disk SVG generator ----
  //   R    disk radius (px)
  //   i    phase angle (rad). 0 = full, π = new. Terminator semi-minor = R·cos(i).
  //   chi  bright-limb position angle (rad), north through east.
  //   opts.baseImageHref  moon: full texture under a dark overlay → earthshine look
  //   opts.texRotDeg      moon: lunar north-pole PA. The SURFACE texture rotates by
  //     this (slowly varying) instead of chi; otherwise it spins ~360°/synodic
  //     month and flips across full/new. Only the terminator boundary tracks chi.
  //   opts.shadow         live Earth-shadow geometry (EclipseGlyph.lunarShadowAt);
  //     when present, a red umbra/penumbra "bite" is clipped onto the disk.
  function buildPhasedDiskSVG(R, i, chi, opts) {
    const baseHref = opts.baseImageHref || '';
    const litHref = opts.litImageHref || '';
    const litColor = opts.litColor || '#e0dde6';
    const darkColor = opts.darkColor || '#0e1014';
    const darkOverlayAlpha = opts.darkOverlayAlpha != null ? opts.darkOverlayAlpha : 0.75;
    const texRotDeg = opts.texRotDeg || 0;
    const shadow = opts.shadow || null;

    const mode = baseHref ? 'B' : litHref ? 'L' : 'C';
    const shSig = shadow
      ? shadow.sep.toFixed(5) +
        ',' +
        shadow.pa.toFixed(3) +
        ',' +
        shadow.rho_umbra.toFixed(5) +
        ',' +
        shadow.rho_penum.toFixed(5)
      : '';
    const cacheKey =
      mode +
      '|' +
      R +
      '|' +
      (baseHref || litHref) +
      '|' +
      i.toFixed(2) +
      '|' +
      chi.toFixed(2) +
      '|' +
      texRotDeg.toFixed(1) +
      '|' +
      shSig +
      '|' +
      litColor +
      '|' +
      darkColor +
      '|' +
      darkOverlayAlpha.toFixed(2);
    const hit = _phaseCache.get(cacheKey);
    if (hit) return hit;

    const sz = 2 * R;
    const b = R * Math.cos(i);
    const absB = Math.abs(b);
    const sweep = b >= 0 ? 1 : 0; // gibbous (b≥0): arc through left → lit>50%
    const degLit = (chi - Math.PI / 2) * DEG; // terminator / bright-limb angle

    const litPath =
      'M0,' +
      (-R).toFixed(2) +
      ' A' +
      R.toFixed(2) +
      ',' +
      R.toFixed(2) +
      ' 0 0 1 0,' +
      R.toFixed(2) +
      ' A' +
      absB.toFixed(2) +
      ',' +
      R.toFixed(2) +
      ' 0 0 ' +
      sweep +
      ' 0,' +
      (-R).toFixed(2) +
      ' Z';

    const id = 'ph' + ++_iconId;
    const minXY = -R;
    const imgAttrs =
      'x="' +
      minXY.toFixed(2) +
      '" y="' +
      minXY.toFixed(2) +
      '" width="' +
      sz +
      '" height="' +
      sz +
      '" preserveAspectRatio="none"';

    const parts = [];
    parts.push(
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        sz +
        '" height="' +
        sz +
        '" viewBox="' +
        minXY +
        ' ' +
        minXY +
        ' ' +
        sz +
        ' ' +
        sz +
        '">'
    );

    if (mode === 'B') {
      // Moon: texture oriented by lunar north-pole PA (texRotDeg), terminator by
      // chi (degLit) — DECOUPLED. The clip path carries its own rotate(degLit) in
      // root user space so the lit boundary lands at degLit regardless of texture.
      const texT = ' transform="rotate(' + texRotDeg.toFixed(2) + ')"';
      parts.push(
        '<defs><clipPath id="' +
          id +
          '"><path d="' +
          litPath +
          '" transform="rotate(' +
          degLit.toFixed(2) +
          ')"/></clipPath></defs>'
      );
      parts.push('<image href="' + baseHref + '" ' + imgAttrs + texT + '/>');
      parts.push(
        '<circle cx="0" cy="0" r="' +
          R.toFixed(2) +
          '" fill="' +
          darkColor +
          '" opacity="' +
          darkOverlayAlpha.toFixed(3) +
          '"/>'
      );
      parts.push('<g clip-path="url(#' + id + ')"><image href="' + baseHref + '" ' + imgAttrs + texT + '/></g>');
      // Live Earth-shadow bite — same geometry as the sidebar card glyph
      // (eclipse-glyph.js), in the screen-north frame, clipped to the moon disk.
      if (shadow && shadow.penumbralMag > 0) {
        const sd = shadow.sd_primary;
        const amp = (R * shadow.sep) / sd;
        const bdx = (-amp * Math.sin(shadow.pa)).toFixed(2);
        const bdy = (-amp * Math.cos(shadow.pa)).toFixed(2);
        const bite = [];
        if (shadow.penumbralMag > 0) {
          const rp = ((R * shadow.rho_penum) / sd).toFixed(2);
          bite.push(
            '<circle cx="' + bdx + '" cy="' + bdy + '" r="' + rp + '" fill="var(--ecl-penumbra)" opacity="0.4"/>'
          );
        }
        if (shadow.umbralMag > 0) {
          const ru = ((R * shadow.rho_umbra) / sd).toFixed(2);
          bite.push('<circle cx="' + bdx + '" cy="' + bdy + '" r="' + ru + '" fill="var(--ecl-umbra)" opacity="0.8"/>');
        }
        const dskId = 'dsk' + _iconId;
        parts.push(
          '<defs><clipPath id="' + dskId + '"><circle cx="0" cy="0" r="' + R.toFixed(2) + '"/></clipPath></defs>'
        );
        parts.push('<g clip-path="url(#' + dskId + ')">' + bite.join('') + '</g>');
      }
    } else if (mode === 'L') {
      parts.push('<defs><clipPath id="' + id + '"><path d="' + litPath + '"/></clipPath></defs>');
      parts.push('<g transform="rotate(' + degLit.toFixed(2) + ')">');
      parts.push('<circle cx="0" cy="0" r="' + R.toFixed(2) + '" fill="' + darkColor + '"/>');
      parts.push('<image href="' + litHref + '" ' + imgAttrs + ' clip-path="url(#' + id + ')"/>');
      parts.push('</g>');
    } else {
      parts.push('<defs><clipPath id="' + id + '"><path d="' + litPath + '"/></clipPath></defs>');
      parts.push('<g transform="rotate(' + degLit.toFixed(2) + ')">');
      parts.push('<circle cx="0" cy="0" r="' + R.toFixed(2) + '" fill="' + darkColor + '"/>');
      parts.push('<path d="' + litPath + '" fill="' + litColor + '"/>');
      parts.push('</g>');
    }

    parts.push('</svg>');
    const svg = parts.join('');

    if (_phaseCache.size >= _PHASE_CACHE_LIMIT) {
      const firstKey = _phaseCache.keys().next().value;
      if (firstKey !== undefined) _phaseCache.delete(firstKey);
    }
    _phaseCache.set(cacheKey, svg);
    return svg;
  }

  // ---- Moon disk HTML ----
  function buildMoonDiskHtml(illum, paDeg, fpPx, diskAlpha, northPADeg, shadow) {
    const visualSz = Math.max(4, Math.round(fpPx));
    const renderSz = Math.max(4, Math.round(diskRenderSize(fpPx)));
    const R = renderSz / 2;
    const svg = buildPhasedDiskSVG(R, rad(illum.phase_angle), rad(paDeg), {
      baseImageHref: moonSvgSrc(fpPx),
      darkColor: '#0e1014',
      darkOverlayAlpha: 0.75,
      texRotDeg: northPADeg || 0,
      shadow: shadow || null,
    });
    // Tighten the visible-disc ramp so the disc is fully opaque once past the
    // floor — the moon is a solid body, not a translucent glow.
    const wrapperOpacity = Math.min(1, diskAlpha * 2);
    const clipped =
      '<div style="width:' +
      renderSz +
      'px;height:' +
      renderSz +
      'px;border-radius:50%;overflow:hidden;opacity:' +
      wrapperOpacity.toFixed(3) +
      '">' +
      svg +
      '</div>';
    return { html: scaleDiskWrap(clipped, renderSz, renderSz, visualSz, visualSz), size: visualSz };
  }

  // ---- Sun disk HTML ----
  // large↔xlarge crossfade by opacity, clipped to a circle. Upstream leaves the disk
  // ~76% opaque so it can blend into a glow/bloom layer; that layer is not ported, and
  // against this project's light basemap a translucent sun reads as a smudge. Forced
  // fully opaque instead (min(1, dA·2), the same treatment the moon disk uses).
  function buildSunDiskHtml(fpPx) {
    const visualSz = Math.max(4, Math.round(fpPx));
    const renderSz = Math.max(4, Math.round(diskRenderSize(fpPx)));
    const dA = smoothstep(6, 40, fpPx);
    const wrapperOpacity = Math.min(1, dA * 2);
    const lodMix = smoothstep(80, 160, fpPx); // 0 = large, 1 = xlarge
    const img = (src, op) =>
      '<img src="' +
      src +
      '" width="' +
      renderSz +
      '" height="' +
      renderSz +
      '" style="display:block;position:absolute;left:0;top:0;opacity:' +
      op.toFixed(3) +
      '">';
    const imgs = [];
    if (lodMix < 0.99) imgs.push(img('img/sun-large.svg', 1 - lodMix));
    if (lodMix > 0.01) imgs.push(img('img/sun-xlarge.svg', lodMix));
    const inner =
      '<div style="position:relative;width:' +
      renderSz +
      'px;height:' +
      renderSz +
      'px;border-radius:50%;overflow:hidden;opacity:' +
      wrapperOpacity.toFixed(3) +
      '">' +
      imgs.join('') +
      '</div>';
    return { html: scaleDiskWrap(inner, renderSz, renderSz, visualSz, visualSz), size: visualSz };
  }

  // ---- World-copy placement (ceil/floor window tiling; mirrors _drawShadowBand's
  // drawPoly and addPolyline). NOT the fixed [-360,0,+360] triple — that drops a
  // far copy near the antimeridian for wide shapes; the tiling is uniformly safe. ----
  function placeWrapped(group, lat, lng, diskHtml, tip, zOffset) {
    const west = typeof window !== 'undefined' && window.MAP_LNG_WEST != null ? window.MAP_LNG_WEST : -200;
    const east = typeof window !== 'undefined' && window.MAP_LNG_EAST != null ? window.MAP_LNG_EAST : 520;
    const sz = diskHtml.size;
    // Name chip on hover: wrap the disk in a hit layer carrying data-tip (read by
    // glossary-tip.js's delegated listener). pointer-events:auto is set on the wrapper
    // so hover fires even though the marker is interactive:false (a child's auto wins
    // over any inherited none); it stays off the map-click path otherwise. Attribute
    // copies into every world-copy naturally since it rides diskHtml. tip empty → no
    // wrapper, preserving the untouched disk for callers that pass none.
    const html = tip
      ? '<div class="body-disk-hit" style="width:100%;height:100%;pointer-events:auto" data-tip="' +
        tip.replace(/"/g, '&quot;') +
        '">' +
        diskHtml.html +
        '</div>'
      : diskHtml.html;
    const wMin = Math.ceil((west - lng) / 360);
    const wMax = Math.floor((east - lng) / 360);
    for (let w = wMin; w <= wMax; w++) {
      L.marker([lat, lng + w * 360], {
        icon: L.divIcon({
          className: 'body-disk-icon',
          html: html,
          iconSize: [sz, sz],
          iconAnchor: [sz / 2, sz / 2],
        }),
        interactive: false,
        keyboard: false,
        bubblingMouseEvents: false,
        pane: 'eclipse-markers',
        zIndexOffset: zOffset || 0,
      }).addTo(group);
    }
  }

  // ---- Draw one body (sun | moon) at its sub-point ----
  function drawBody(map, group, date, zoom, which) {
    const body = which === 'sun' ? Astronomy.Body.Sun : Astronomy.Body.Moon;
    let sp;
    try {
      sp = bodySubPoint(date, body);
    } catch (_) {
      return;
    }
    if (!sp) return;

    const diamKm = which === 'sun' ? SUN_FOOTPRINT_KM : footprintKmFromDist(MOON_DIAM_KM, sp.distAU);
    const fpPxEff = Math.max(footprintPx(zoom, diamKm, sp.lat), MIN_DISK_PX);

    let diskHtml;
    if (which === 'sun') {
      diskHtml = buildSunDiskHtml(fpPxEff);
    } else {
      const dA = smoothstep(6, 40, fpPxEff);
      let illum, mp, sunp;
      try {
        // Illumination is deliberately left uncorrected while the surrounding
        // positions are not. It supplies the phase ANGLE, and the ancient
        // ephemeris error of 1.9 deg perturbs that by the same amount — which at
        // an eclipse, where the Moon is within a degree of new or full, moves the
        // illuminated fraction by 0.03 % of the disc. The bright-limb orientation,
        // which would be visible, comes from bodyPosition below and is corrected.
        illum = Astronomy.Illumination(body, date);
        mp = bodyPosition(date, body);
        sunp = bodyPosition(date, Astronomy.Body.Sun);
      } catch (_) {
        return;
      }
      const pa = deg(positionAngle(mp.alpha, mp.delta, sunp.alpha, sunp.delta));
      // Lunar north-pole PA orients the surface texture (decoupled from phase).
      let northPADeg = 0;
      try {
        const ax = Astronomy.RotationAxis(body, Astronomy.MakeTime(date));
        northPADeg = deg(positionAngle(mp.alpha, mp.delta, rad(ax.ra * 15), rad(ax.dec)));
      } catch (_) {
        /* keep texture upright if axis unavailable */
      }
      // Live Earth-shadow bite during lunar eclipses; null (no bite) otherwise.
      const shadow =
        typeof EclipseGlyph !== 'undefined' && EclipseGlyph.lunarShadowAt ? EclipseGlyph.lunarShadowAt(date) : null;
      diskHtml = buildMoonDiskHtml(illum, pa, fpPxEff, dA, northPADeg, shadow);
    }
    // Hover name chip so the reader knows the disk marks the sub-solar / sub-lunar
    // point (the spot on Earth with the body at the zenith), not the body itself.
    const tip =
      typeof I18n !== 'undefined' && I18n.t
        ? I18n.t(which === 'sun' ? 'body.subsolar_point' : 'body.sublunar_point')
        : '';
    // Moon needs zIndexOffset large enough to beat the sun at any latitude
    // (max lat diff 180° × 10 000 = 1 800 000; 2 000 000 clears the margin).
    if (diskHtml) placeWrapped(group, sp.lat, sp.lng, diskHtml, tip, which === 'moon' ? 2000000 : 0);
  }

  // ---- Public: draw sun + moon disks into `group` for the given instant ----
  function render(map, group, date) {
    if (typeof Astronomy === 'undefined' || typeof L === 'undefined' || !map || !group) return;
    const zoom = map.getZoom();
    drawBody(map, group, date, zoom, 'sun');
    drawBody(map, group, date, zoom, 'moon');
  }

  return { render };
})();
