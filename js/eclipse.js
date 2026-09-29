/**
 * Eclipse runtime — real-time shadow computation via Astronomy Engine.
 *
 * Solar shadow geometry: Moon-Sun line is intersected with Earth (sphere).
 * If no intersection, the umbra has left Earth's surface — we render nothing.
 * If intersection exists, render umbra & penumbra circles in real time.
 *
 * Lunar visibility: render the hemisphere centered on the sub-lunar point
 * during a lunar eclipse — this is "where the Moon is above the horizon",
 * NOT the night side (Sun-set criterion is unrelated).
 */
const Eclipse = (() => {
  const R_EARTH = 6371; // km, mean radius
  const R_MOON = 1737.4;
  const R_SUN = 695700;
  const AU = 1.495978707e8; // km

  // Views onto EclipseLoader's merged catalog: never fetch or annotate a private copy.
  let solarEvents = [];
  let lunarEvents = [];
  let besselPolys = {}; // date → NASA polynomial from events/<date>.json

  // Bumped on every besselPolys mutation. Any memo derived from the Bessel elements MUST
  // fold it into its key: one instant resolves to other elements once the NASA polynomial lands.
  let _ephemGen = 0;
  let _loaded = false;
  let _polling = false;
  let _callbacks = [];

  // Densify step and umbra seed count stop growing at zoom Z_CAP, so redrawShadow may skip
  // a zoomend beyond it that changes neither the instant nor zEff.
  const Z_CAP = 9;

  // Marching-squares chains for one instant, keyed by keyTime + _ephemGen.
  let _fieldCache = { key: '', chainsByMag: null };

  // Viewport snapshot taken once per draw pass; addPolyline skips world copies outside it.
  // null draws every copy.
  let _map = null;
  let _curveViewport = null; // { west, east } in degrees, margin already applied

  // Longitude span of the current viewport, padded by marginDeg on each side.
  function viewportLngSpan(map, marginDeg) {
    const b = map.getBounds();
    return { west: b.getWest() - marginDeg, east: b.getEast() + marginDeg };
  }

  // Half-viewport margin: a curve vertex stays drawn across a moderate pan
  // before the wrap-key flips and triggers a rebuild, so it never pops in at the
  // screen edge between rebuilds.
  function curveMargin(map) {
    const b = map.getBounds();
    return (b.getEast() - b.getWest()) * 0.5;
  }

  // Coarse viewport key (integer-degree west,east) for the moveend short-circuit.
  function curveWrapsKey(map) {
    const b = map.getBounds();
    return Math.round(b.getWest()) + ',' + Math.round(b.getEast());
  }

  // ---- Data loading ----

  // Adopt EclipseLoader's catalog once it is populated. besselPolys fills per event in
  // loadCurvesFor; never load every event's elements up front.
  function loadData(cb) {
    if (_loaded) {
      cb && cb();
      return;
    }
    if (cb) _callbacks.push(cb);
    const cat = window.EclipseLoader && EclipseLoader.all ? EclipseLoader.all() : [];
    if (!cat.length) {
      // EclipseLoader.init is not awaited by map-boot, so a shadow redraw can beat it.
      // Poll for the catalog rather than fetching it: a second fetch re-downloads and
      // re-parses the whole index to learn what is already on its way.
      if (!_polling) {
        _polling = true;
        setTimeout(() => {
          _polling = false;
          loadData();
        }, 100);
      }
      return;
    }
    solarEvents = cat.filter((e) => e._kind === 'solar');
    lunarEvents = cat.filter((e) => e._kind === 'lunar');
    _loaded = true;
    _callbacks.forEach((fn) => fn && fn());
    _callbacks = [];
  }

  // ---- Solar Shadow Geometry ----

  // The live footprint uses the same Besselian geometry as the cached contact curves
  // (js/bessel-runtime.js) so the two stay tangent. The sphere version runs only when that
  // module failed to load.

  // Returns { b, sub, isTotal }; sub is null when the shadow axis misses Earth.
  function computeSolarShadow(date, event) {
    const poly = event && besselPolys[event.date];
    const b = poly
      ? BesselRT.evalBessel(poly, date) // this event's own NASA elements
      : BesselRT.coreBesselAE(Astronomy, date); // AE-direct, until they land
    const sub = BesselRT.fundamentalToGeo(b.x, b.y, b);
    return { b, sub, isTotal: b.l2 < 0 };
  }

  // Sphere approximation (fallback only).
  function computeSolarShadowSphere(date) {
    const sun = EphemCorrect.correct(Astronomy.GeoVector(Astronomy.Body.Sun, date, false), Astronomy.Body.Sun, date);
    const moon = EphemCorrect.correct(Astronomy.GeoMoon(date), Astronomy.Body.Moon, date);
    const M = { x: moon.x * AU, y: moon.y * AU, z: moon.z * AU };
    const S = { x: sun.x * AU, y: sun.y * AU, z: sun.z * AU };

    // Umbra cone axis: ray from Moon away from Sun
    const dx = M.x - S.x,
      dy = M.y - S.y,
      dz = M.z - S.z;
    const dlen = Math.hypot(dx, dy, dz);
    const ax = dx / dlen,
      ay = dy / dlen,
      az = dz / dlen;

    // Earth (sphere) intersection: |M + λa|² = R_EARTH²
    const b = 2 * (M.x * ax + M.y * ay + M.z * az);
    const c = M.x * M.x + M.y * M.y + M.z * M.z - R_EARTH * R_EARTH;
    const disc = b * b - 4 * c;
    if (disc < 0) return null; // umbra has left Earth — render nothing
    const lam = (-b - Math.sqrt(disc)) / 2;
    if (lam < 0) return null;

    const P = { x: M.x + lam * ax, y: M.y + lam * ay, z: M.z + lam * az };

    // Sub-shadow lat/lng (account for Earth's sidereal rotation)
    const gast = Astronomy.SiderealTime(date) * 15;
    const lon0 = (Math.atan2(P.y, P.x) * 180) / Math.PI;
    const lat = (Math.asin(P.z / R_EARTH) * 180) / Math.PI;
    const lng = ((lon0 - gast + 540) % 360) - 180;

    // Cone half-angles (topocentric apparent angular radii)
    const dMP = Math.hypot(M.x - P.x, M.y - P.y, M.z - P.z);
    const dSP = Math.hypot(S.x - P.x, S.y - P.y, S.z - P.z);
    const moonAng = Math.atan(R_MOON / dMP);
    const sunAng = Math.atan(R_SUN / dSP);
    const isTotal = moonAng >= sunAng;

    // Surface tilt — incidence angle between umbra axis and surface normal at P
    const cosI = Math.abs(ax * P.x + ay * P.y + az * P.z) / R_EARTH;
    const tilt = Math.max(cosI, 0.2); // clamp at limb

    const umbraR = (Math.abs(moonAng - sunAng) * dMP) / tilt;
    const penumbraR = ((moonAng + sunAng) * dMP) / tilt;

    return { lat, lng, umbraKm: umbraR, penumbraKm: penumbraR, isTotal };
  }

  // ---- Helpers ----

  function findActiveSolar(date) {
    const ms = date.getTime();
    for (const e of solarEvents) {
      if (ms >= e._p1Ms && ms <= e._p4Ms) return e; // NaN bounds compare false
    }
    return null;
  }

  function findActiveLunar(date) {
    const ms = date.getTime();
    for (const e of lunarEvents) {
      if (ms >= e._p1Ms && ms <= e._p4Ms) return e; // NaN bounds compare false
    }
    return null;
  }

  // ---- Local Circumstances And Forecast ----

  // Per-observer geometry for the observation popup, on the same Bessel elements as the live
  // footprint. Refraction applies only to the horizon gate and altitude read-outs; contacts
  // stay geometric.

  // Apparent horizontal coords (az/alt deg) of a body — refraction-corrected.
  function _bodyHorizontal(body, date, lat, lng) {
    try {
      const obs = new Astronomy.Observer(lat, lng, 0);
      const equ = EphemCorrect.equator(body, date, obs);
      const hor = Astronomy.Horizon(date, obs, equ.ra, equ.dec, 'normal');
      return { az: hor.azimuth, alt: hor.altitude };
    } catch (_) {
      return null;
    }
  }

  // Besselian elements at an instant: NASA polynomial when available, else
  // AE-direct (identical evaluator to computeSolarShadow / the cached curves).
  function _besselAt(event, date) {
    const poly = besselPolys[event.date];
    return poly ? BesselRT.evalBessel(poly, date) : BesselRT.coreBesselAE(Astronomy, date);
  }

  function _lcSolar(event, lat, lng, ms) {
    return BesselRT.localCircumstances(lat, lng, _besselAt(event, new Date(ms)));
  }

  // Apparent solar altitude (deg) via the refraction-corrected engine, so a
  // contact clamped at the horizon agrees with the altitude printed beside it.
  function _sunAppAlt(lat, lng, ms) {
    const h = _bodyHorizontal(Astronomy.Body.Sun, new Date(ms), lat, lng);
    return h && isFinite(h.alt) ? h.alt : -90;
  }

  // Disc-overlap tests read straight from the Besselian magnitude geometry: within
  // the ~0.5° band where the Sun is apparently up but zeta<0, localCircumstances
  // labels 'below_horizon' with no class, so the gates must read the raw quantities.
  function _inPartial(lc) {
    return lc.magnitude > 0;
  }

  function _inCentral(lc) {
    return lc.m < Math.abs(lc.L2p);
  }

  // Coarse magnitude sweep across [P1,P4]; tracks the sun-up maximum.
  function _scanSolar(event, lat, lng, N) {
    const p1 = event._p1Ms,
      p4 = event._p4Ms;
    let maxEff = -1,
      peakMs = p1,
      anyUp = false;
    for (let i = 0; i <= N; i++) {
      const ms = p1 + ((p4 - p1) * i) / N;
      const lc = _lcSolar(event, lat, lng, ms);
      const up = _sunAppAlt(lat, lng, ms) >= 0;
      if (up) anyUp = true;
      const eff = up && lc.magnitude > 0 ? lc.magnitude : -1;
      if (eff > maxEff) {
        maxEff = eff;
        peakMs = ms;
      }
    }
    return { maxEff, peakMs, anyUp };
  }

  // Ternary refine of the sun-up magnitude maximum near peakMs.
  function _refineSolarPeak(event, lat, lng, peakMs, halfWin) {
    let lo = Math.max(event._p1Ms, peakMs - halfWin);
    let hi = Math.min(event._p4Ms, peakMs + halfWin);
    for (let k = 0; k < 32; k++) {
      const a = lo + (hi - lo) / 3,
        b = hi - (hi - lo) / 3;
      const la = _lcSolar(event, lat, lng, a),
        lb = _lcSolar(event, lat, lng, b);
      const va = _sunAppAlt(lat, lng, a) >= 0 ? la.magnitude : -1;
      const vb = _sunAppAlt(lat, lng, b) >= 0 ? lb.magnitude : -1;
      if (va < vb) lo = a;
      else hi = b;
    }
    const ms = (lo + hi) / 2;
    return { ms, lc: _lcSolar(event, lat, lng, ms) };
  }

  // Classify a solar event at a point: highest phase the observer would witness.
  // Returns { visible, maxPhase:'none'|'partial'|'annular'|'total', maxMag, peakMs }.
  function classifySolar(event, lat, lng) {
    if (typeof BesselRT === 'undefined' || typeof Astronomy === 'undefined')
      return { visible: false, maxPhase: 'none' };
    if (!isFinite(event._p1Ms) || !isFinite(event._p4Ms) || event._p4Ms <= event._p1Ms)
      return { visible: false, maxPhase: 'none' };
    const N = 24;
    const coarse = _scanSolar(event, lat, lng, N);
    if (coarse.maxEff <= 0) return { visible: false, maxPhase: 'none' };
    if (coarse.maxEff <= 0.8)
      return { visible: true, maxPhase: 'partial', maxMag: coarse.maxEff, peakMs: coarse.peakMs };
    const r = _refineSolarPeak(event, lat, lng, coarse.peakMs, (event._p4Ms - event._p1Ms) / N);
    const maxPhase = _inCentral(r.lc) ? (r.lc.L2p < 0 ? 'total' : 'annular') : 'partial';
    return { visible: true, maxPhase, maxMag: r.lc.magnitude, peakMs: r.ms };
  }

  // C1–C4, local maximum and mid-eclipse sunrise/sunset as Dates, null when absent.
  // Contacts are geometric disc tangency; visibility is apparent, from classifySolar.
  function solarLocalContacts(event, lat, lng) {
    const base = classifySolar(event, lat, lng);
    if (!base.visible) return { visible: false, maxPhase: 'none' };
    const p1 = event._p1Ms,
      p4 = event._p4Ms,
      N = 48;
    const inPartial = (ms) => _inPartial(_lcSolar(event, lat, lng, ms));
    const inCentral = (ms) => _inCentral(_lcSolar(event, lat, lng, ms));
    const bis = (msF, msT, predAt) => {
      let a = msF,
        b = msT;
      for (let k = 0; k < 32; k++) {
        const m = (a + b) / 2;
        if (predAt(m)) b = m;
        else a = m;
      }
      return new Date((a + b) / 2);
    };
    const samples = [];
    for (let i = 0; i <= N; i++) {
      const ms = p1 + ((p4 - p1) * i) / N;
      samples.push({ ms, ecl: inPartial(ms) });
    }
    let c1 = null,
      c4 = null,
      c2 = null,
      c3 = null;
    for (let i = 1; i <= N; i++)
      if (samples[i].ecl && !samples[i - 1].ecl) {
        c1 = bis(samples[i - 1].ms, samples[i].ms, inPartial);
        break;
      }
    for (let i = N; i >= 1; i--)
      if (samples[i - 1].ecl && !samples[i].ecl) {
        c4 = bis(samples[i].ms, samples[i - 1].ms, inPartial);
        break;
      }
    if (!c1 && samples[0].ecl) c1 = new Date(samples[0].ms);
    if (!c4 && samples[N].ecl) c4 = new Date(samples[N].ms);
    if (!c1 || !c4) return { visible: false, maxPhase: 'none' };
    const c1ms = c1.getTime(),
      c4ms = c4.getTime();
    let lo = c1ms,
      hi = c4ms;
    for (let k = 0; k < 40; k++) {
      const a = lo + (hi - lo) / 3,
        b = hi - (hi - lo) / 3;
      if (_lcSolar(event, lat, lng, a).magnitude < _lcSolar(event, lat, lng, b).magnitude) lo = a;
      else hi = b;
    }
    const peakMs = (lo + hi) / 2;
    const peakLc = _lcSolar(event, lat, lng, peakMs);
    const maxPhase = _inCentral(peakLc) ? (peakLc.L2p < 0 ? 'total' : 'annular') : 'partial';
    if ((maxPhase === 'total' || maxPhase === 'annular') && inCentral(peakMs)) {
      const step = (p4 - p1) / (N * 4);
      const edge = (dir) => {
        let last = peakMs;
        for (let i = 1; i <= 96; i++) {
          const t = peakMs + dir * step * i;
          if (t <= c1ms || t >= c4ms) return new Date(Math.max(c1ms, Math.min(c4ms, t)));
          if (!inCentral(t)) return bis(t, last, inCentral);
          last = t;
        }
        return new Date(last);
      };
      c2 = edge(-1);
      c3 = edge(1);

      // Keep [c2,c3] only when strictly inside [c1,c4]; MUST match the offline contact
      // solver's rejection so popup times equal the cached ones.
      if (!(c2.getTime() > c1ms && c3.getTime() < c4ms && c3.getTime() - c2.getTime() > 1000)) {
        c2 = null;
        c3 = null;
      }
    }
    const upAt = (ms) => _sunAppAlt(lat, lng, ms) >= 0;
    const M = 48;
    const up = [];
    for (let i = 0; i <= M; i++) {
      const ms = c1ms + ((c4ms - c1ms) * i) / M;
      up.push({ ms, on: upAt(ms) });
    }
    let sunrise = null,
      sunset = null;
    for (let i = 1; i <= M; i++)
      if (up[i].on && !up[i - 1].on) {
        sunrise = bis(up[i - 1].ms, up[i].ms, upAt);
        break;
      }
    for (let i = M; i >= 1; i--)
      if (up[i - 1].on && !up[i].on) {
        sunset = bis(up[i].ms, up[i - 1].ms, upAt);
        break;
      }
    return {
      visible: true,
      maxPhase,
      maxMag: peakLc.magnitude,
      maxTime: new Date(peakMs),
      c1,
      c2,
      c3,
      c4,
      sunrise,
      sunset,
    };
  }

  // Memoized so a moving time slider does not rerun the root finder.
  let _slcCache = null;
  function solarLocalContactsCached(event, lat, lng) {
    const key = event.date + ',' + lat.toFixed(2) + ',' + lng.toFixed(2) + ',' + _ephemGen;
    if (_slcCache && _slcCache.key === key) return _slcCache.val;
    const val = solarLocalContacts(event, lat, lng);
    _slcCache = { key, val };
    return val;
  }

  // Moon apparent altitude (deg) at an instant for an observer.
  function _moonAlt(date, lat, lng) {
    const obs = new Astronomy.Observer(lat, lng, 0);
    const equ = EphemCorrect.equator(Astronomy.Body.Moon, date, obs);
    return Astronomy.Horizon(date, obs, equ.ra, equ.dec, 'normal').altitude;
  }

  // Classify a lunar event at a point. Contacts are global (whole-Earth
  // simultaneous); "visible" means the Moon is above the horizon during the
  // relevant phase. Penumbral-only events (no umbral contacts) are not counted.
  function classifyLunar(event, lat, lng) {
    if (typeof Astronomy === 'undefined') return { visible: false, maxPhase: 'none' };
    const t = event.times || {};
    const moonUpIn = (aIso, bIso) => {
      const a = Date.parse(aIso),
        b = Date.parse(bIso);
      if (isNaN(a) || isNaN(b)) return false;
      for (let i = 0; i <= 6; i++) if (_moonAlt(new Date(a + ((b - a) * i) / 6), lat, lng) > 0) return true;
      return false;
    };

    // Penumbral eclipses have no umbral contacts; check the penumbral window instead.
    if (isNaN(Date.parse(t.u1)) || isNaN(Date.parse(t.u4))) {
      if (moonUpIn(t.p1, t.p4)) return { visible: true, maxPhase: 'penumbral', peakMs: Date.parse(t.peak) };
      return { visible: false, maxPhase: 'none' };
    }
    if (event.kind === 'Total' && t.u2 && t.u3 && moonUpIn(t.u2, t.u3))
      return { visible: true, maxPhase: 'total', peakMs: Date.parse(t.peak) };
    if (moonUpIn(t.u1, t.u4)) return { visible: true, maxPhase: 'partial', peakMs: Date.parse(t.peak) };
    return { visible: false, maxPhase: 'none' };
  }

  // Next future event visible from (lat,lng) for each of the four categories,
  // scanning forward by peak time over the shared EclipseLoader catalogue (already
  // _kind-tagged and sorted). Each slot is { event, time, phase } or null.
  function nextVisible(lat, lng, fromDate) {
    const all = (window.EclipseLoader && EclipseLoader.all && EclipseLoader.all()) || [];
    if (!all.length) return null;
    const fromMs = fromDate.getTime();
    const slots = { solarPartial: null, solarTotal: null, lunarPartial: null, lunarTotal: null };
    let remaining = 4;
    for (let i = 0; i < all.length && remaining > 0; i++) {
      const e = all[i];
      if (e._peakMs <= fromMs) continue;
      if (e._kind === 'solar') {
        if (slots.solarPartial && slots.solarTotal) continue;
        const c = classifySolar(e, lat, lng);
        if (!c.visible) continue;
        const total = c.maxPhase === 'total' || c.maxPhase === 'annular';
        const slot = total ? 'solarTotal' : 'solarPartial';
        if (!slots[slot]) {
          const pk = _refineSolarPeak(e, lat, lng, c.peakMs, (e._p4Ms - e._p1Ms) / 24);
          slots[slot] = { event: e, time: new Date(pk.ms), phase: c.maxPhase };
          remaining--;
        }
      } else {
        if (slots.lunarPartial && slots.lunarTotal) continue;
        const c = classifyLunar(e, lat, lng);
        if (!c.visible) continue;
        const slot = c.maxPhase === 'total' ? 'lunarTotal' : 'lunarPartial';
        if (!slots[slot]) {
          slots[slot] = { event: e, time: new Date(c.peakMs), phase: c.maxPhase };
          remaining--;
        }
      }
    }
    return slots;
  }

  // Memoized by rounded location and day.
  let _nvCache = null;
  function nextVisibleCached(lat, lng, fromDate) {
    const key =
      lat.toFixed(1) + ',' + lng.toFixed(1) + ',' + Math.floor(fromDate.getTime() / 86400000) + ',' + _ephemGen;
    if (_nvCache && _nvCache.key === key) return _nvCache.slots;
    const slots = nextVisible(lat, lng, fromDate);
    if (slots) _nvCache = { key, slots };
    return slots;
  }

  // Moonlight-veil redness, 0…1: full through U2–U3 with linear ramps on U1–U2 and U3–U4;
  // a partial eclipse peaks at its umbral magnitude; a penumbral one stays 0.
  function lunarRedness(date) {
    // The veil reddens without the Eclipses overlay, so load here; the first call returns 0.
    if (!_loaded) {
      loadData();
      return 0;
    }
    const e = findActiveLunar(date);
    if (!e) return 0;
    const t = date.getTime();
    const T = e.times || {};
    const u1 = Date.parse(T.u1),
      u4 = Date.parse(T.u4);
    if (isNaN(u1) || isNaN(u4) || t < u1 || t > u4) return 0; // penumbral / outside umbra
    const u2 = Date.parse(T.u2),
      u3 = Date.parse(T.u3);
    if (!isNaN(u2) && !isNaN(u3)) {
      // Total: plateau at full red between U2 and U3, ramp on the partial wings.
      if (t >= u2 && t <= u3) return 1;
      if (t < u2) return (t - u1) / (u2 - u1);
      return (u4 - t) / (u4 - u3);
    }

    // Partial: triangular ramp, peak = umbral magnitude (<1) at greatest.
    const peak = Date.parse(T.peak);
    const frac = t <= peak ? (t - u1) / (peak - u1) : (u4 - t) / (u4 - peak);
    const mag = Math.min(1, e.umbralMag || e.magnitude || 1);
    return Math.max(0, Math.min(1, frac)) * mag;
  }

  // ---- Rendering ----

  // Live iso-magnitude levels MUST equal the cached magContours levels. Every ring goes
  // through addPolyline for world copies, antimeridian splits and limb gaps.

  // Read at draw time for the current locale; the fallback stays English.
  function _totalBandLabel() {
    return typeof I18n !== 'undefined' ? I18n.t('eclipse.map.total_band') : 'Totality band';
  }

  // Find the northernmost vertex of a (possibly limb-clipped) ring and drop a
  // wrapped label a touch north of it.
  function placeRingLabel(pts, html, className, layer, isBand) {
    let top = null;
    for (const p of pts) if (p && (!top || p[0] > top[0])) top = p;
    if (!top) return;
    const lat = top[0] + 0.5;
    for (const off of GeoUtils.wrapOffsets(top[1], top[1])) {
      L.marker([lat, top[1] + off], {
        icon: L.divIcon({
          className,
          html: isBand ? '<span aria-hidden="true">' + html + '</span>' : html,
          iconSize: isBand ? [60, 16] : [28, 14],
        }),
        interactive: false,
      }).addTo(layer);
    }
  }

  // Tangent in degrees, measured in Web Mercator pixels so it holds at every zoom. Never
  // measure it in Δlat/Δlng: latitude stretch skews it from the on-screen slope.
  function contourTangentDeg(seg, i) {
    if (!_map || typeof _map.project !== 'function') return 0;
    const n = seg.length,
      K = 3;
    const a = seg[Math.max(0, i - K)],
      b = seg[Math.min(n - 1, i + K)];
    if (!a || !b) return 0;
    if (Math.abs(b[1] - a[1]) > 30) return 0; // antimeridian/seam guard → stay horizontal
    const pa = _map.project(L.latLng(a[0], a[1]));
    const pb = _map.project(L.latLng(b[0], b[1]));
    let deg = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
    while (deg > 90) deg -= 180; // keep text upright (never upside-down)
    while (deg <= -90) deg += 180;
    return deg;
  }

  // A closed ring anchors at its northernmost point so nested labels stack in one column;
  // an open arc anchors at its midpoint, since its ends lie on the limb.
  function anchorIndex(seg, refLng) {
    const n = seg.length;
    const a = seg[0],
      z = seg[n - 1];
    let latMin = Infinity,
      latMax = -Infinity,
      lngMin = Infinity,
      lngMax = -Infinity;
    for (const p of seg) {
      if (p[0] < latMin) latMin = p[0];
      if (p[0] > latMax) latMax = p[0];
      if (p[1] < lngMin) lngMin = p[1];
      if (p[1] > lngMax) lngMax = p[1];
    }
    const diag = Math.hypot(latMax - latMin, lngMax - lngMin) || 1;
    const endGap = Math.hypot(z[0] - a[0], z[1] - a[1]);
    const closed = endGap < 0.15 * diag;
    if (!closed) return Math.floor(n / 2); // open arc: midpoint

    // Closed ring: find the northernmost crossing of the vertical lng = refLng so
    // every nested ring's label shares the same screen x-column (strict ladder).
    if (refLng != null) {
      let bestLat = -Infinity,
        bestIdx = -1;
      for (let k = 0; k < n - 1; k++) {
        const p = seg[k],
          q = seg[k + 1];
        const dp = p[1] - refLng,
          dq = q[1] - refLng;
        if (dp * dq <= 0 && dp !== dq) {
          const t = dp / (dp - dq);
          const crossLat = p[0] + t * (q[0] - p[0]);
          if (crossLat > bestLat) {
            bestLat = crossLat;
            bestIdx = t < 0.5 ? k : k + 1;
          }
        }
      }
      if (bestIdx >= 0) return bestIdx;
    }

    // Fallback: global northernmost vertex (refLng absent or outside ring bbox).
    let bi = 0,
      best = -Infinity;
    for (let k = 0; k < n; k++)
      if (seg[k][0] > best) {
        best = seg[k][0];
        bi = k;
      }
    return bi;
  }

  // Labels every segment at least half as long as the longest, parallel to the contour.
  // Omit color to inherit the className's CSS color.
  function placeContourLabel(segs, text, className, layer, color, refLng, pane) {
    if (!segs || !segs.length) return;
    let maxLen = 0;
    for (const seg of segs) if (seg && seg.length > maxLen) maxLen = seg.length;
    if (maxLen < 6) return;
    for (const seg of segs) {
      if (!seg || seg.length < 6 || seg.length < 0.5 * maxLen) continue;
      const i = anchorIndex(seg, refLng);
      const mid = seg[i];
      if (!mid) continue;
      const deg = contourTangentDeg(seg, i);

      // Rotate the inner span: Leaflet owns the marker div's transform.
      const style =
        'display:inline-block;transform:rotate(' + deg.toFixed(1) + 'deg)' + (color ? ';color:' + color : '');
      const html = '<span style="' + style + '">' + text + '</span>';
      for (const off of GeoUtils.wrapOffsets(mid[1], mid[1])) {
        L.marker(
          [mid[0] + 0.3, mid[1] + off],
          Object.assign(
            {
              icon: L.divIcon({ className, html, iconSize: [32, 14], iconAnchor: [16, 7] }),
              interactive: false,
              keyboard: false,
            },
            pane ? { pane } : {}
          )
        ).addTo(layer);
      }
    }
  }

  // Draw a closed ring with fill when it's "simple" (fully on Earth, no
  // antimeridian wrap) as an L.polygon in each world copy; otherwise fall back to
  // a stroke-only polyline (addPolyline handles wrap/split/limb-clip robustly).
  function drawFilledRing(pts, opts, layer) {
    let simple = pts.every((p) => p != null);
    if (simple) {
      for (let i = 1; i < pts.length; i++) {
        if (Math.abs(pts[i][1] - pts[i - 1][1]) > 180) {
          simple = false;
          break;
        }
      }
    }
    if (simple) {
      // smoothFactor 0: Leaflet's default of 1 drops ring vertices.
      const polyOpts = Object.assign({ pane: 'eclipse-curves', interactive: false, smoothFactor: 0 }, opts);
      let lo = Infinity,
        hi = -Infinity;
      for (const p of pts) {
        if (p[1] < lo) lo = p[1];
        if (p[1] > hi) hi = p[1];
      }
      for (const off of GeoUtils.wrapOffsets(lo, hi)) {
        L.polygon(
          pts.map((p) => [p[0], p[1] + off]),
          polyOpts
        ).addTo(layer);
      }
    } else {
      addPolyline(pts, Object.assign({ fill: false, interactive: false }, opts), layer);
    }
  }

  // Spherical inverse, matching the field's spherical ζ. Never the ellipsoid fundamentalToGeo:
  // it returns null in a band near the limb.
  function fundToGeoSafe(xi, eta, b) {
    const g = BesselRT.fundamentalToGeoSphere(xi, eta, b);
    return [g.lat, g.lng];
  }

  // Bisects in (ξ,η) until every Mercator chord ≤ maxMercDeg. A midpoint that does not
  // project between its endpoints marks the pole singularity: break the line there.
  function densifyContour(chain, b, maxMercDeg) {
    const mc = BesselRT.mercatorChordDeg;
    const pj = chain.map((p) => ({ x: p, g: fundToGeoSafe(p[0], p[1], b) }));
    const out = [];
    for (let i = 1; i < pj.length; i++) {
      const A = pj[i - 1],
        B = pj[i];
      if (!A.g) continue;
      out.push(A.g);
      if (!B.g) {
        out.push(null);
        continue;
      }
      if (Math.abs(A.g[1] - B.g[1]) > 180) continue; // antimeridian: splitter handles
      const dAB = mc(A.g[0], A.g[1], B.g[0], B.g[1]);
      if (dAB <= maxMercDeg) continue;
      const mx = [(A.x[0] + B.x[0]) / 2, (A.x[1] + B.x[1]) / 2];
      const mg = fundToGeoSafe(mx[0], mx[1], b);
      if (!mg || mc(A.g[0], A.g[1], mg[0], mg[1]) > dAB * 1.5 || mc(mg[0], mg[1], B.g[0], B.g[1]) > dAB * 1.5) {
        out.push(null); // singularity → break, no slash
        continue;
      }
      (function rec(ax, ag, bx, bg, depth) {
        if (depth > 14) return;
        if (Math.abs(ag[1] - bg[1]) > 180) return;
        const dd = mc(ag[0], ag[1], bg[0], bg[1]);
        if (dd <= maxMercDeg) return;
        const cx = [(ax[0] + bx[0]) / 2, (ax[1] + bx[1]) / 2];
        const cg = fundToGeoSafe(cx[0], cx[1], b);
        if (!cg) return;
        if (mc(ag[0], ag[1], cg[0], cg[1]) > dd * 1.5 || mc(cg[0], cg[1], bg[0], bg[1]) > dd * 1.5) return;
        rec(ax, ag, cx, cg, depth + 1);
        out.push(cg);
        rec(cx, cg, bx, bg, depth + 1);
      })(A.x, A.g, B.x, B.g, 0);
    }
    const last = pj[pj.length - 1];
    if (last && last.g) out.push(last.g);
    return out;
  }

  // Close over the pole only when the ring winds it (|Σ Δlng| ≈ 360°), never when it
  // merely crosses the antimeridian.
  function _drawShadowBand(ring, color, opacity, layer, poleLat, pane, className) {
    if (!ring || ring.length < 3) return;
    const uw = [[ring[0][0], ring[0][1]]];
    let wind = 0;
    for (let i = 1; i < ring.length; i++) {
      let d = ring[i][1] - ring[i - 1][1];
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      wind += d;
      uw.push([ring[i][0], uw[i - 1][1] + d]);
    }

    // The lunar visibility cap passes its own pane and class.
    const polyOpts = {
      color: 'none',
      weight: 0,
      fillColor: color,
      fillOpacity: opacity,
      className: className || 'eclipse-penumbra-band',
      interactive: false,
      pane: pane || 'eclipse-shadow',
      smoothFactor: 0,
    };

    // Tile every 360° shift of each polygon that overlaps the map window, never a fixed
    // three-copy set: the unwrap can leave longitudes anywhere.
    const LNG_WEST = -200,
      LNG_EAST = 520; // = MAP_LNG_WEST..MAP_LNG_EAST
    const drawPoly = (pts) => {
      let lo = Infinity,
        hi = -Infinity;
      for (const p of pts) {
        if (p[1] < lo) lo = p[1];
        if (p[1] > hi) hi = p[1];
      }
      const wMin = Math.ceil((LNG_WEST - hi) / 360);
      const wMax = Math.floor((LNG_EAST - lo) / 360);
      for (let w = wMin; w <= wMax; w++)
        L.polygon(
          pts.map((p) => [p[0], p[1] + w * 360]),
          polyOpts
        ).addTo(layer);
    };
    if (Math.abs(wind) > 180) {
      // Split into two halves at most 180° wide, never one 360° polygon: under SVG nonzero
      // winding that polygon's edges cancel and the fill goes missing.
      const capLat = poleLat >= 0 ? 90 : -90;
      const target = uw[0][1] + 180;
      let splitIdx = 1,
        minDist = Math.abs(uw[1][1] - target);
      for (let i = 2; i < uw.length - 1; i++) {
        const dist = Math.abs(uw[i][1] - target);
        if (dist < minDist) {
          minDist = dist;
          splitIdx = i;
        }
      }
      const h1 = uw.slice(0, splitIdx + 1);
      h1.push([capLat, uw[splitIdx][1]], [capLat, uw[0][1]]);
      const h2 = uw.slice(splitIdx);
      h2.push([capLat, uw[uw.length - 1][1]], [capLat, uw[splitIdx][1]]);
      drawPoly(h1);
      drawPoly(h2);
      return;
    }

    // Non-polar: the ring is self-closing (uw[0] ≈ uw[last]); no pole closure.
    drawPoly(uw.slice());
  }

  function renderSolarShadow(s, layer, zoom, keyTime) {
    const b = s.b;

    // Umbra ring facets grow with zoom; the dashed contours come from the field below.
    const z = zoom || 4;
    const umbraNAz = Math.max(256, Math.min(1024, Math.round(64 * Math.pow(2, z / 2))));

    // Mercator chord of 4 px at zEff; 1° spans 256·2^z/360 px.
    const zEff = Math.min(z, Z_CAP);
    const maxMercDeg = (4 * 360) / (256 * Math.pow(2, zEff));

    // Each level is two pieces sharing endpoints: the marching-squares arc clipped at ρ=1, and
    // the terminator arc grown from those clip angles. Never snap the arc end to the analytic
    // cusp, and keep fieldStep independent of zoom so contours hold still while zooming.
    const fieldStep = 0.004; // ≈ 25 km in (ξ,η)

    // mag 0 = the penumbra edge, drawn solid-dim; the rest = iso levels matching the
    // cached magContours. Colors resolve from COLOR at render time.
    const LEVELS = [
      { mag: 0, color: COLOR.shadowPenumbra, weight: 1, opacity: 0.55, dash: '4 4', label: null },
      { mag: 0.2, color: COLOR.shadowIso[0], weight: 0.8, opacity: 0.7, dash: '3,5', label: '0.20' },
      { mag: 0.4, color: COLOR.shadowIso[1], weight: 0.8, opacity: 0.7, dash: '5,4', label: '0.40' },
      { mag: 0.6, color: COLOR.shadowIso[2], weight: 0.8, opacity: 0.7, dash: '6,4', label: '0.60' },
      { mag: 0.8, color: COLOR.shadowIso[3], weight: 0.8, opacity: 0.7, dash: '8,3', label: '0.80' },
    ];

    // Cached chains are shared across redraws: never mutate them downstream.
    let chainsByMag;
    const cacheKey = keyTime != null ? String(keyTime) + '|' + _ephemGen : '';
    if (cacheKey && _fieldCache.key === cacheKey && _fieldCache.chainsByMag) {
      chainsByMag = _fieldCache.chainsByMag;
    } else {
      const magField = BesselRT.computeMagFieldFundamental(b, { step: fieldStep });
      chainsByMag = {};
      for (const lvl of LEVELS) {
        chainsByMag[String(lvl.mag)] = BesselRT.chainSegments(
          BesselRT.marchingSquares(magField, magField.mag, lvl.mag)
        );
      }
      if (cacheKey) _fieldCache = { key: cacheKey, chainsByMag };
    }

    // Ink wash: nested lens rings painted outer→inner with incremental alpha, so the band at
    // magnitude k composites to PEN_PEAK·O(k), O being the obscured fraction of the disc.
    const OBSC = (m) => (2 / Math.PI) * (Math.acos(1 - m) - (1 - m) * Math.sqrt(Math.max(0, 1 - (1 - m) * (1 - m))));
    const penAnchor = BesselRT.fundamentalToGeoSphere(b.x, b.y, b);
    const PEN_PEAK = 0.45,
      PEN_STEP = 0.2; // 5 bands; tune for smoothness/DOM
    let prevG = 0;
    for (let k = PEN_STEP; k < 1.0 + 1e-9; k += PEN_STEP) {
      const ring = BesselRT.isoMagLensGeo(b, k, umbraNAz, maxMercDeg);
      if (!ring) continue; // k ≥ this eclipse's max magnitude
      const G = PEN_PEAK * OBSC(k); // target composited opacity at k
      const a = prevG >= 1 ? 0 : (G - prevG) / (1 - prevG); // incremental alpha (painter's)
      prevG = G;
      if (a > 0.002) _drawShadowBand(ring, COLOR.shadowPenumbra, a, layer, penAnchor ? penAnchor.lat : 0);
    }

    // Runtime QC accumulator — read by tests via window.__eclipseShadowQC so the
    // shadow is validated numerically (turn-angle + continuity), not just by eye.
    const qc = {};
    for (const lvl of LEVELS) {
      const interiorGeos = []; // labelled; terminator arcs are not
      let worstTurn = 0,
        worstGap = 0,
        nLines = 0;
      const consider = (geo) => {
        const turn = BesselRT.maxTurnDeg(geo);
        const gap = BesselRT.maxGapKm(geo);
        if (turn > worstTurn) worstTurn = turn;
        if (gap > worstGap) worstGap = gap;
        addPolyline(
          geo,
          {
            color: lvl.color,
            weight: lvl.weight,
            opacity: lvl.opacity,
            dashArray: lvl.dash,
            interactive: false,
            pane: 'eclipse-shadow',
          },
          layer
        );
        nLines++;
      };

      const interiorClipGeo = []; // geo of interior-arc ends that sit on ρ=1
      const clipThetas = []; // limb angles of those ends → terminator boundaries
      const chains = chainsByMag[String(lvl.mag)];
      for (const ch of chains) {
        if (ch.length < 2) continue;
        for (const sub of BesselRT.clipChainToDisc(ch)) {
          if (sub.length < 2) continue;

          // Record sub-arc ends that lie ON the limb (clip points): their angle
          // bounds the terminator, their geo feeds the seam QC. Closed-loop ends
          // sit mid-disc (ρ<1) and are skipped.
          for (const e of [sub[0], sub[sub.length - 1]]) {
            if (Math.abs(Math.hypot(e[0], e[1]) - 1) < 1e-4) {
              clipThetas.push(Math.atan2(e[1], e[0]));
              const g = BesselRT.fundamentalToGeoSphere(e[0], e[1], b);
              interiorClipGeo.push([g.lat, g.lng]);
            }
          }
          const geo = densifyContour(sub, b, maxMercDeg);
          consider(geo);
          interiorGeos.push(geo);
        }
      }

      // Rise/set terminator arc(s) — analytic on the limb circle, spanning between
      // the interior arc's actual clip angles (zero seam) when there were any.
      const termEndGeo = [];
      for (const arc of BesselRT.terminatorArcs(b, lvl.mag, maxMercDeg, clipThetas.length >= 2 ? clipThetas : null)) {
        if (arc.length >= 2) {
          consider(arc);
          termEndGeo.push(arc[0], arc[arc.length - 1]);
        }
      }

      // Seam continuity QC: every interior clip end must coincide with a terminator
      // end. maxGapKm on a 2-pt poly = the haversine distance between the points.
      let seamKm = 0;
      for (const ic of interiorClipGeo) {
        if (!termEndGeo.length) {
          seamKm = Infinity;
          break;
        }
        let best = Infinity;
        for (const te of termEndGeo) best = Math.min(best, BesselRT.maxGapKm([ic, te]));
        if (best > seamKm) seamKm = best;
      }
      qc[lvl.mag] = {
        maxTurn: +worstTurn.toFixed(1),
        maxGap: +worstGap.toFixed(1),
        seamKm: isFinite(seamKm) ? +seamKm.toFixed(1) : -1,
        lines: nLines,
      };
      if (worstTurn > 45 || worstGap > 200 || !(seamKm <= 10)) {
        console.warn(
          '[eclipse-shadow QC] mag=' +
            lvl.mag +
            ' maxTurn=' +
            worstTurn.toFixed(1) +
            '° maxGap=' +
            worstGap.toFixed(1) +
            'km seamKm=' +
            (isFinite(seamKm) ? seamKm.toFixed(1) : '∞')
        );
      }
      if (lvl.label) {
        placeContourLabel(
          interiorGeos,
          lvl.mag.toFixed(2),
          'iso-mag-label data-value',
          layer,
          null,
          s.sub ? s.sub.lng : null,
          'eclipse-labels'
        );
      }
    }
    if (typeof window !== 'undefined') window.__eclipseShadowQC = qc;

    // Umbra or antumbra: the m=|L2'| circle by angle, closed along the terminator when it
    // grazes the limb; null when the shadow misses Earth.
    const umbra = BesselRT.umbraLensGeo(b, umbraNAz, maxMercDeg);
    if (umbra) {
      drawFilledRing(
        umbra,
        {
          color: COLOR.umbraStroke,
          weight: 1.2,
          fillColor: COLOR.umbraFill,
          fillOpacity: COLOR.umbraFillOp,
          className: 'eclipse-umbra',
          pane: 'eclipse-shadow',
        },
        layer
      );
    }
  }

  // Sphere renderer (fallback only — paired with computeSolarShadowSphere).
  function renderSolarShadowSphere(s, layer) {
    // Iso rings interpolate linearly between umbra (mag 1) and penumbra (mag 0).
    const ISO_MAG_LEVELS = [
      { mag: 0.2, dashArray: '3,5', color: COLOR.shadowIso[0] },
      { mag: 0.5, dashArray: '5,4', color: COLOR.shadowIso[1] },
      { mag: 0.8, dashArray: '8,3', color: COLOR.shadowIso[3] },
    ];

    // Longitude half-width of the penumbra circle; a circle over a pole spans every longitude.
    const cosLat = Math.cos((s.lat * Math.PI) / 180);
    const halfLng = cosLat > 1e-6 ? Math.min(180, s.penumbraKm / (111.32 * cosLat)) : 180;
    for (const offset of GeoUtils.wrapOffsets(s.lng - halfLng, s.lng + halfLng)) {
      const center = [s.lat, s.lng + offset];
      L.circle(center, {
        radius: s.penumbraKm * 1000,
        color: COLOR.shadowPenumbra,
        weight: 1,
        fillColor: COLOR.shadowPenumbra,
        fillOpacity: 0.1,
        dashArray: '4 4',
        interactive: false,
        pane: 'eclipse-shadow',
      }).addTo(layer);
      for (const level of ISO_MAG_LEVELS) {
        const radiusKm = s.umbraKm + (s.penumbraKm - s.umbraKm) * (1 - level.mag);
        L.circle(center, {
          radius: radiusKm * 1000,
          color: level.color,
          weight: 0.8,
          fillOpacity: 0,
          dashArray: level.dashArray,
          opacity: 0.7,
          interactive: false,
          pane: 'eclipse-shadow',
        }).addTo(layer);
        if (offset === 0) {
          const dLatDeg = (radiusKm + 30) / 111.0; // km → degrees of latitude
          L.marker([s.lat + dLatDeg, s.lng], {
            icon: L.divIcon({
              className: 'iso-mag-label data-value',
              html: level.mag.toFixed(2),
              iconSize: [28, 14],
            }),
            interactive: false,
            pane: 'eclipse-labels',
          }).addTo(layer);
        }
      }
      L.circle(center, {
        radius: s.umbraKm * 1000,
        color: COLOR.umbraStroke,
        weight: 1.2,
        fillColor: COLOR.umbraFill,
        fillOpacity: COLOR.umbraFillOp,
        className: 'eclipse-umbra',
        interactive: false,
        pane: 'eclipse-shadow',
      }).addTo(layer);

      // Only the total band is named; an annular one gets no label.
      if (offset === 0 && s.isTotal) {
        const labelLatDeg = s.lat + (s.umbraKm + 60) / 111.0;
        L.marker([labelLatDeg, s.lng], {
          icon: L.divIcon({
            className: 'eclipse-edge-label',
            html: '<span aria-hidden="true">' + _totalBandLabel() + '</span>',
            iconSize: [60, 16],
          }),
          interactive: false,
          pane: 'eclipse-labels',
        }).addTo(layer);
      }
    }
  }

  // ---- Contact Curves ----

  // The offline curve builder bakes each event's curves; this lays them down on selection
  // and clears them on close.

  // MUST equal css/tokens.css: Leaflet's color option cannot read var(--…). Pigment names
  // follow the Song light-wash (dan-shese) palette.
  const COLOR = {
    central: '#A8324A', // total: umbral center line (deep madder yanzhi)
    centralAnn: '#B0703C', // annular: antumbral center line (deep zheshi ochre)
    penumbraRim: '#B5645A', // P1/P4 outer penumbral limit (faded terracotta)
    nsLimit: '#3C6E5A', // penumbral N/S limits (deep zhilü, sap-green)
    umbralLimit: '#C06B78', // total: umbral N/S limits (dusty rose, lighter madder)
    umbralLimitAnn: '#C89A6A', // annular: antumbral N/S limits (light ochre)
    visibility: '#3F8378', // lunar visibility outline (piaobe (celadon))
    mag50: '#4E6E86', // 50% magnitude iso-line (huaqing, cornflower-indigo)
    uContact: '#4E948A', // lunar U1–U4 contact arcs (piaobe (celadon))
    greatest: '#CE564C', // greatest-eclipse point (yanzhi spark)

    // Live shadow: a danmo (pale-ink) umbra pool with an ochre rim; iso steps warm from
    // huaqing to zhe (ochre) as magnitude deepens.
    shadowPenumbra: '#1C1C28', // mag-0 penumbra edge + lunar visibility circle (mo ink)

    // Moon-up veil: deep dianqing (indigo-blue) to read on pale basemaps, warming to zhusha
    // (cinnabar) at totality; the red MUST equal the frame's zhupi accent.
    lunarVeilBase: '#465468', // penumbral wash (deep dianqing, reads on cream paper)
    lunarVeilRed: '#C0472E', // totality (zhusha cinnabar, echoes the zhupi accent)
    shadowIso: ['#5A7386', '#6F7B72', '#8A7D5B', '#A2803F'], // mag .2/.4/.6/.8
    umbraStroke: '#A2803F', // zhe (ochre) rim (mirrors --eclipse-mag-90 light)
    umbraFill: '#3A3E44', // danmo (pale-ink) pool
    umbraFillOp: 0.75,
    halo: 'rgba(246, 242, 232, 0.72)', // liubai (reserved-white) paper casing under curve strokes

    // Umbral band wash (danran (light-wash)): tone-on-tone with the center lines — pale yanzhi for
    // totality, pale zhe (ochre) for annularity — so the band reads as one wash stroke.
    bandFillTotal: '#A8324A',
    bandFillAnnular: '#B0703C',
    bandFillOp: 0.11,
    bandFillOpHybrid: 0.08,
  };

  // Detail mode for the selected event's curve set, on by default: magnitude contours,
  // rise/set loops, extreme lines and the faint lunar p1/p4 circles are drawn alongside
  // the narrative core.
  let _curveDetail = true;

  // Tooltips carry the bare curve name, never a definition.
  function curveName(key, mag) {
    const name = typeof I18n !== 'undefined' ? I18n.t('eclipse.curve.' + key) : key;
    return mag != null ? name + ' ' + mag.toFixed(2) : name;
  }

  // Splits at null longitudes (samples at a pole), antimeridian crossings and polar wraps.
  function splitAtAntimeridian(pts) {
    const out = [];
    let cur = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p == null || p[1] == null || !isFinite(p[1])) {
        if (cur.length >= 2) out.push(cur);
        cur = [];
        continue;
      }
      if (cur.length > 0) {
        const prev = cur[cur.length - 1];
        const dLng = Math.abs(p[1] - prev[1]);
        const polarBoth = Math.abs(p[0]) > 75 && Math.abs(prev[0]) > 75;
        if (dLng > 180 || (polarBoth && dLng > 60)) {
          if (cur.length >= 2) out.push(cur);
          cur = [];
        }
      }
      cur.push(p);
    }
    if (cur.length >= 2) out.push(cur);
    return out;
  }

  // Draws the curve once per world copy inside the map's −200…+520 longitude range.
  function addPolyline(pts, opts, layer, tooltip) {
    // smoothFactor 0: Leaflet's default of 1 drops ring vertices.
    const polyOpts = Object.assign({ pane: 'eclipse-curves', smoothFactor: 0 }, opts);

    // Unwrap each longitude to the ±360 copy nearest its predecessor, never per point on its
    // own: a per-point wrap leaves a 360° jump that splitAtAntimeridian cuts into a gap.
    const norm = [];
    let prevLng = null;
    for (const p of pts) {
      if (p == null || p[1] == null) {
        norm.push(p);
        prevLng = null;
        continue;
      }
      let lng = (((p[1] % 360) + 540) % 360) - 180;
      if (prevLng !== null) {
        while (lng - prevLng > 180) lng -= 360;
        while (lng - prevLng < -180) lng += 360;
      }
      prevLng = lng;
      norm.push([p[0], lng]);
    }

    // MUST equal MAP_LNG_WEST / MAP_LNG_EAST in js/map-boot.js.
    const LNG_WEST = -200,
      LNG_EAST = 520;
    let lo = Infinity,
      hi = -Infinity;
    for (const p of norm) {
      if (p && p[1] != null) {
        if (p[1] < lo) lo = p[1];
        if (p[1] > hi) hi = p[1];
      }
    }
    if (!isFinite(lo)) return;
    const wMin = Math.ceil((LNG_WEST - hi) / 360);
    const wMax = Math.floor((LNG_EAST - lo) / 360);
    for (let w = wMin; w <= wMax; w++) {
      if (_curveViewport) {
        const cLo = lo + w * 360,
          cHi = hi + w * 360;
        if (cHi < _curveViewport.west || cLo > _curveViewport.east) continue;
      }
      const shifted = w === 0 ? norm : norm.map((p) => (p == null || p[1] == null ? p : [p[0], p[1] + w * 360]));
      const segments = splitAtAntimeridian(shifted);
      for (const seg of segments) {
        // Halos go in their own pane under every stroke, so no halo covers another curve.
        if (opts.halo) {
          L.polyline(seg, {
            pane: 'eclipse-curves-halo',
            smoothFactor: 0,
            interactive: false,
            color: COLOR.halo,
            weight: (opts.weight || 1) + 2.4,
            opacity: opts.haloOpacity != null ? opts.haloOpacity : opts.dashArray ? 0.5 : 0.75,
          }).addTo(layer);
        }
        const line = L.polyline(seg, polyOpts).addTo(layer);
        if (tooltip) line.bindTooltip(tooltip, { sticky: true, className: 'eclipse-curve-tooltip' });
      }
    }
  }

  // Delegate to js/envelope-ring.js, which index.html must load before this file.
  const splitOnNull = EnvelopeRing.splitOnNull;
  const asCompact = EnvelopeRing.asCompact;

  // Never drawFilledRing here: it falls back to unfilled lines on any >180° longitude jump,
  // which an unwrapped ring contains.
  function addBandPolygon(ring, opts, layer, tooltip) {
    const polyOpts = Object.assign(
      {
        pane: 'eclipse-curves-halo',
        smoothFactor: 0,
        interactive: false,
        stroke: false,
      },
      opts
    );
    if (tooltip) polyOpts.interactive = true;
    const LNG_WEST = -200,
      LNG_EAST = 520;
    let lo = Infinity,
      hi = -Infinity;
    for (const p of ring) {
      if (p[1] < lo) lo = p[1];
      if (p[1] > hi) hi = p[1];
    }
    if (!isFinite(lo)) return;
    const wMin = Math.ceil((LNG_WEST - hi) / 360);
    const wMax = Math.floor((LNG_EAST - lo) / 360);
    for (let w = wMin; w <= wMax; w++) {
      if (_curveViewport) {
        const cLo = lo + w * 360,
          cHi = hi + w * 360;
        if (cHi < _curveViewport.west || cLo > _curveViewport.east) continue;
      }
      const shifted = w === 0 ? ring : ring.map((p) => [p[0], p[1] + w * 360]);
      const poly = L.polygon(shifted, polyOpts).addTo(layer);
      if (tooltip) poly.bindTooltip(tooltip, { sticky: true, className: 'eclipse-curve-tooltip' });
    }
  }

  // One marker in every world copy of the point that falls within the map's range.
  function addWrappedMarker(lat, lng, iconHtmlClass, layer, label) {
    for (const off of GeoUtils.wrapOffsets(lng, lng)) {
      L.marker([lat, lng + off], {
        icon: L.divIcon({
          className: iconHtmlClass,
          html: '<span aria-hidden="true">' + (label || '✶') + '</span>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        interactive: false,
        pane: 'eclipse-markers',
      }).addTo(layer);
    }
  }

  function splitNorthSouth(seg, centralPath) {
    if (seg.length < 4) return [seg];
    const cp = centralPath;
    const sides = seg.map((pt) => {
      let bestI = 0,
        bestD = Infinity;
      for (let i = 0; i < cp.length; i++) {
        if (!cp[i]) continue;
        const d = (pt[0] - cp[i][0]) ** 2 + (pt[1] - cp[i][1]) ** 2;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      let p = Math.max(0, bestI - 3),
        n = Math.min(cp.length - 1, bestI + 3);
      while (p < bestI && !cp[p]) p++;
      while (n > bestI && !cp[n]) n--;
      if (p === n) return 0;
      const dx = cp[n][1] - cp[p][1],
        dy = cp[n][0] - cp[p][0];
      const px = pt[1] - cp[bestI][1],
        py = pt[0] - cp[bestI][0];
      return dx * py - dy * px;
    });
    const arcs = [];
    let arc = [seg[0]];
    let curSign = Math.sign(sides[0]);
    if (curSign === 0) {
      for (let i = 1; i < sides.length; i++) {
        if (Math.sign(sides[i]) !== 0) {
          curSign = Math.sign(sides[i]);
          break;
        }
      }
    }
    for (let i = 1; i < seg.length; i++) {
      const s = Math.sign(sides[i]);
      if (s !== 0 && curSign !== 0 && s !== curSign) {
        if (arc.length >= 4) arcs.push(arc);
        arc = [];
        curSign = s;
      } else if (s !== 0) {
        curSign = s;
      }
      arc.push(seg[i]);
    }
    if (arc.length >= 3) arcs.push(arc);
    if (arcs.length >= 2 && seg.length > 10) {
      const isClosed =
        Math.abs(seg[0][0] - seg[seg.length - 1][0]) < 0.02 && Math.abs(seg[0][1] - seg[seg.length - 1][1]) < 0.02;
      if (isClosed) {
        const fmi = seg.indexOf(arcs[0][Math.floor(arcs[0].length / 2)]);
        const lmi = seg.indexOf(arcs[arcs.length - 1][Math.floor(arcs[arcs.length - 1].length / 2)]);
        if (fmi >= 0 && lmi >= 0 && Math.sign(sides[fmi]) === Math.sign(sides[lmi])) {
          arcs[arcs.length - 1] = arcs[arcs.length - 1].concat(arcs[0]);
          arcs.shift();
        }
      }
    }
    return arcs.length ? arcs : [seg];
  }

  function splitByHybridBreaks(pts, breaks, firstPhase) {
    if (!breaks || !breaks.length || pts.length < 2) {
      return [{ phase: firstPhase || 'total', pts: pts }];
    }
    const breakIndices = [];
    for (const bp of breaks) {
      let bestIdx = -1,
        bestDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        if (!pts[i]) continue;
        const dlat = pts[i][0] - bp[0],
          dlng = pts[i][1] - bp[1];
        const d = dlat * dlat + dlng * dlng;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      if (bestIdx > 0 && bestIdx < pts.length - 1) breakIndices.push(bestIdx);
    }
    breakIndices.sort((a, b) => a - b);
    if (!breakIndices.length) return [{ phase: firstPhase, pts: pts }];

    const result = [];
    let phase = firstPhase;
    let start = 0;
    for (const bi of breakIndices) {
      result.push({ phase, pts: pts.slice(start, bi + 1) });
      phase = phase === 'total' ? 'annular' : 'total';
      start = bi;
    }
    result.push({ phase, pts: pts.slice(start) });
    return result;
  }

  function drawSolarContactCurves(event, layer) {
    const cc = event.contactCurves;
    if (!cc) return;
    const isAnnular = event.kind === 'Annular';
    const isHybrid = event.kind === 'Hybrid';

    // Never pass smoothFactor here: addPolyline's 0 keeps every cached vertex.
    if (_curveDetail && cc.magContours) {
      const opts = {
        color: COLOR.mag50,
        weight: 1.0,
        opacity: 0.75,
        dashArray: '4 3',
        interactive: true,
        halo: true,
        haloOpacity: 0.45,
      };
      for (const lvl of cc.magContours) {
        if (lvl.mag >= 1.0) continue;
        const tip = curveName('magContour', lvl.mag);
        for (const side of [asCompact(lvl.sideA), asCompact(lvl.sideB)]) {
          const segs = splitOnNull(side);
          for (const seg of segs) addPolyline(seg, opts, layer, tip);
          placeContourLabel(
            segs,
            lvl.mag.toFixed(2),
            'iso-mag-curve-label',
            layer,
            COLOR.mag50,
            null,
            'eclipse-labels'
          );
        }
      }
    }
    if (_curveDetail && cc.riseSetLoops) {
      const a = asCompact(cc.riseSetLoops.sideA);
      const b = asCompact(cc.riseSetLoops.sideB);
      const aSegs = splitOnNull(a);
      const bSegs = splitOnNull(b);
      const opts = {
        color: COLOR.penumbraRim,
        weight: 1.4,
        opacity: 0.75,
        dashArray: '5 3',
        interactive: true,
        halo: true,
      };
      const tip = curveName('riseSetLoop');

      // Pair sideA and sideB arcs by shared cusp endpoints, never by array index: the two
      // sides store their arcs in different orders.
      const samePt = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
      const bUsed = new Array(bSegs.length).fill(false);
      const matchBSeg = (aSeg) => {
        const a0 = aSeg[0],
          a1 = aSeg[aSeg.length - 1];
        for (let j = 0; j < bSegs.length; j++) {
          if (bUsed[j]) continue;
          const bSeg = bSegs[j],
            b0 = bSeg[0],
            b1 = bSeg[bSeg.length - 1];

          // same orientation: a0↔b0, a1↔b1 → append reverse(bSeg)
          if (samePt(a0, b0) && samePt(a1, b1)) return { j, seg: bSeg.slice().reverse() };

          // flipped: a0↔b1, a1↔b0 → bSeg already runs back, append as-is
          if (samePt(a0, b1) && samePt(a1, b0)) return { j, seg: bSeg.slice() };
        }
        return null;
      };
      const usedA = new Array(aSegs.length).fill(false);
      for (let i = 0; i < aSegs.length; i++) {
        const m = matchBSeg(aSegs[i]);
        if (!m) continue; // unmatched → drawn as open arc below
        bUsed[m.j] = true;
        usedA[i] = true;
        const loop = aSegs[i].concat(m.seg);
        if (loop.length > 2) {
          loop.push(aSegs[i][0]);
          addPolyline(loop, opts, layer, tip);
        }
      }
      for (let i = 0; i < aSegs.length; i++) if (!usedA[i]) addPolyline(aSegs[i], opts, layer, tip);
      for (let j = 0; j < bSegs.length; j++) if (!bUsed[j]) addPolyline(bSegs[j], opts, layer, tip);
    }
    const riseMax = asCompact(cc.riseMaxEclipse);
    const setMax = asCompact(cc.setMaxEclipse);
    if (_curveDetail && (riseMax.length || setMax.length)) {
      const opts = {
        color: COLOR.penumbraRim,
        weight: 1.4,
        opacity: 0.85,
        interactive: true,
        halo: true,
      };
      for (const seg of splitOnNull(riseMax)) addPolyline(seg, opts, layer, curveName('riseMaxEclipse'));
      for (const seg of splitOnNull(setMax)) addPolyline(seg, opts, layer, curveName('setMaxEclipse'));
    }
    const nl = asCompact(cc.nLimit);
    if (nl.length > 1) {
      const optsLim = {
        color: COLOR.nsLimit,
        weight: 1.4,
        opacity: 0.85,
        dashArray: '8 3 2 3',
        interactive: true,
        halo: true,
      };
      for (const seg of splitOnNull(nl)) addPolyline(seg, optsLim, layer, curveName('nLimit'));
    }
    const sl = asCompact(cc.sLimit);
    if (sl.length > 1) {
      const optsLim = {
        color: COLOR.nsLimit,
        weight: 1.4,
        opacity: 0.85,
        dashArray: '8 3 2 3',
        interactive: true,
        halo: true,
      };
      for (const seg of splitOnNull(sl)) addPolyline(seg, optsLim, layer, curveName('sLimit'));
    }

    // Band wash under the envelope strokes; on a QC failure only the strokes draw and
    // __eclipseBandQC records why.
    const unl = asCompact(cc.umbralNLimit);
    const usl = asCompact(cc.umbralSLimit);
    const bandQC = {
      date: event.date,
      raw: 0,
      dropped: 0,
      rings: 0,
      loops: 0,
      cover: null,
      gapDeg: null,
      filled: false,
    };
    if (unl.length > 1) {
      const r = EnvelopeRing.buildEnvelopeRings(unl);
      bandQC.raw = r.raw;
      bandQC.dropped = r.dropped;
      bandQC.loops = r.loops;
      bandQC.rings = r.rings.length;
      bandQC.cover = r.cover;
      bandQC.gapDeg = r.maxGapDeg;
      if (r.ok) {
        const fillColor = isAnnular || isHybrid ? COLOR.bandFillAnnular : COLOR.bandFillTotal;
        const fillOpacity = isHybrid ? COLOR.bandFillOpHybrid : COLOR.bandFillOp;
        for (const ring of r.rings) {
          addBandPolygon(ring, { fill: true, fillColor, fillOpacity }, layer);
        }
        bandQC.filled = true;
      }
    }
    if (typeof window !== 'undefined') window.__eclipseBandQC = bandQC;
    if (isHybrid && cc.hybridBreaks) {
      // Limit fragments are not stored in path order: phase each one by projecting its
      // midpoint onto the central path.
      const cp = asCompact(cc.centralPath);
      const fp = cc.hybridFirstPhase || 'annular';
      const breakIdxOnCp = cc.hybridBreaks
        .map((bp) => {
          let best = 0,
            bestD = Infinity;
          for (let i = 0; i < cp.length; i++) {
            if (!cp[i]) continue;
            const d = (cp[i][0] - bp[0]) ** 2 + (cp[i][1] - bp[1]) ** 2;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          return best;
        })
        .sort((a, b) => a - b);
      for (const [pts, nOrS] of [
        [unl, 'N'],
        [usl, 'S'],
      ]) {
        if (pts.length < 2) continue;
        for (const rawSeg of splitOnNull(pts)) {
          if (rawSeg.length < 5) continue;
          for (const seg of splitNorthSouth(rawSeg, cp)) {
            const mid = seg[Math.floor(seg.length / 2)];
            let bestCpIdx = 0,
              bestD = Infinity;
            for (let i = 0; i < cp.length; i++) {
              if (!cp[i]) continue;
              const d = (cp[i][0] - mid[0]) ** 2 + (cp[i][1] - mid[1]) ** 2;
              if (d < bestD) {
                bestD = d;
                bestCpIdx = i;
              }
            }
            let crossings = 0;
            for (const bi of breakIdxOnCp) {
              if (bestCpIdx > bi) crossings++;
            }
            let phase = fp;
            for (let j = 0; j < crossings; j++) phase = phase === 'total' ? 'annular' : 'total';
            const c = phase === 'total' ? COLOR.umbralLimit : COLOR.umbralLimitAnn;

            // The stash is one closed envelope (never side-labelled N/S), so the
            // tooltip uses the neutral envelope name rather than a wrong side.
            const k = phase === 'total' ? 'umbralEnvelope' : 'antumbralEnvelope';
            const o = { color: c, weight: 1.6, opacity: 0.9, interactive: true, halo: true };
            addPolyline(seg, o, layer, curveName(k));
          }
        }
      }
    } else {
      const uColor = isAnnular ? COLOR.umbralLimitAnn : COLOR.umbralLimit;

      // umbralNLimit holds the whole closed envelope, so its name is neutral.
      const uKey = isAnnular ? 'antumbralEnvelope' : 'umbralEnvelope';
      if (unl.length > 1) {
        const optsU = { color: uColor, weight: 1.6, opacity: 0.9, interactive: true, halo: true };
        for (const seg of splitOnNull(unl)) addPolyline(seg, optsU, layer, curveName(uKey));
      }
      if (usl.length > 1) {
        const optsU = { color: uColor, weight: 1.6, opacity: 0.9, interactive: true, halo: true };
        for (const seg of splitOnNull(usl)) addPolyline(seg, optsU, layer, curveName(uKey));
      }
    }

    // Bare curve names: the panel already shows the selected event's date and type.
    const cp = asCompact(cc.centralPath);
    if (cp.length > 1) {
      if (isHybrid && cc.hybridBreaks) {
        const fp = cc.hybridFirstPhase || 'annular';
        for (const { phase, pts: seg } of splitByHybridBreaks(cp, cc.hybridBreaks, fp)) {
          const c = phase === 'total' ? COLOR.central : COLOR.centralAnn;
          const k = phase === 'total' ? 'centralTotal' : 'centralAnnular';
          const o = { color: c, weight: 2.6, opacity: 0.95, interactive: true, halo: true };
          for (const s of splitOnNull(seg)) addPolyline(s, o, layer, curveName(k));
        }
      } else {
        const cColor = isAnnular ? COLOR.centralAnn : COLOR.central;
        const cKey = isAnnular ? 'centralAnnular' : 'centralTotal';
        const optsC = { color: cColor, weight: 2.6, opacity: 0.95, interactive: true, halo: true };
        for (const seg of splitOnNull(cp)) addPolyline(seg, optsC, layer, curveName(cKey));
      }
    }
    if (event.peak && typeof event.peak.lat === 'number') {
      addWrappedMarker(event.peak.lat, event.peak.lng, 'eclipse-greatest-marker', layer, '✶');
    }
  }

  function drawLunarContactCurves(event, layer) {
    const cp = event.contactPoints;
    if (!cp) return;

    // One small circle of radius 88.22° per contact: Moon altitude ≥ 1.78° around the
    // sub-lunar point.
    const STYLE = {
      p1: { weight: 0.9, opacity: 0.45, dashArray: '3 4', color: COLOR.uContact },
      u1: { weight: 1.4, opacity: 0.85, color: COLOR.uContact },
      u2: { weight: 1.8, opacity: 0.95, color: COLOR.central, halo: true },
      peak: { weight: 2.2, opacity: 1.0, color: COLOR.greatest, halo: true },
      u3: { weight: 1.8, opacity: 0.95, color: COLOR.central, halo: true },
      u4: { weight: 1.4, opacity: 0.85, color: COLOR.uContact },
      p4: { weight: 0.9, opacity: 0.45, dashArray: '3 4', color: COLOR.uContact },
    };
    const ORDER = ['p1', 'u1', 'u2', 'peak', 'u3', 'u4', 'p4'];
    for (const k of ORDER) {
      const pt = cp[k];
      if (!pt) continue;

      // The faint penumbral circles are detail-mode extras; the u-family and
      // peak carry the narrative on their own.
      if (!_curveDetail && (k === 'p1' || k === 'p4')) continue;
      const arcs = _computeAltitudeContourArcs(pt.lat, pt.lng, 1.78);
      for (const arc of arcs) {
        if (arc.length >= 2) addPolyline(arc, { ...STYLE[k], interactive: false }, layer);
      }
    }
  }

  function drawContactCurves(event, layer) {
    layer.clearLayers();

    // Snapshot the viewport once for this whole draw pass; every addPolyline
    // call below reads it to cull off-screen world-copies.
    _curveViewport = _map ? viewportLngSpan(_map, curveMargin(_map)) : null;
    if (event._kind === 'solar') drawSolarContactCurves(event, layer);
    else drawLunarContactCurves(event, layer);
  }

  // ---- Public Init ----

  function init(map) {
    _map = map; // expose for addPolyline's viewport-wrap culling

    // z-order: curves-halo 592 < curves 593 < shadow 594 < markers 595 < labels 596, all
    // under Leaflet's markerPane 600 so record seals stay clickable.
    if (!map.getPane('eclipse-shadow')) {
      map.createPane('eclipse-shadow');
      map.getPane('eclipse-shadow').style.zIndex = 594;
      map.getPane('eclipse-shadow').style.pointerEvents = 'none';
    }
    if (!map.getPane('eclipse-curves')) {
      map.createPane('eclipse-curves');
      map.getPane('eclipse-curves').style.zIndex = 593;

      // Click-through: the pane floats above grids and UI.
      map.getPane('eclipse-curves').style.pointerEvents = 'none';
    }
    if (!map.getPane('eclipse-curves-halo')) {
      map.createPane('eclipse-curves-halo');
      map.getPane('eclipse-curves-halo').style.zIndex = 592;
      map.getPane('eclipse-curves-halo').style.pointerEvents = 'none';
    }
    if (!map.getPane('eclipse-markers')) {
      map.createPane('eclipse-markers');
      map.getPane('eclipse-markers').style.zIndex = 595;
      map.getPane('eclipse-markers').style.pointerEvents = 'none';
    }
    if (!map.getPane('eclipse-labels')) {
      map.createPane('eclipse-labels');
      map.getPane('eclipse-labels').style.zIndex = 596;
      map.getPane('eclipse-labels').style.pointerEvents = 'none';
    }

    const soloLayer = L.layerGroup();
    const curvesLayer = L.layerGroup().addTo(map); // contact curves of selected event

    // Kept so moveend/zoomend can redraw its curves; the wraps key skips pans that change no
    // drawn world copy.
    let _selectedEvent = null;
    let _lastCurveWrapsKey = '';

    function redrawSelectedCurves(force) {
      if (!_selectedEvent) return;
      const key = curveWrapsKey(map);
      if (!force && key === _lastCurveWrapsKey) return;
      _lastCurveWrapsKey = key;
      drawContactCurves(_selectedEvent, curvesLayer);
    }

    // Rebuilt every tick: the solar shadow, or the lunar moon-up veil and its edge.
    let _shadowGroup = null;
    let _lastShadowKey = null; // (instant|zEff|wraps) gate for the zoom-reuse skip

    // Sun and Moon disks, outside the shadow's zoom gate: they repaint on time and zoom for
    // both kinds of eclipse.
    let _bodyGroup = null;

    function redrawBodies() {
      if (!map.hasLayer(soloLayer)) return;
      if (!_bodyGroup) _bodyGroup = L.layerGroup().addTo(soloLayer);
      _bodyGroup.clearLayers();
      if (typeof BodyMarkers !== 'undefined') BodyMarkers.render(map, _bodyGroup, TimeState.current);
    }

    soloLayer.on('add', () => {
      loadData(() => {
        redrawShadow(soloLayer);
        redrawBodies();
      });
    });
    soloLayer.on('remove', () => {
      clearSelection();
      soloLayer.clearLayers();
      _shadowGroup = null; // dropped by clearLayers; recreate on next add
      _lastShadowKey = null; // force a full rebuild on next add
      _bodyGroup = null; // ditto — recreate on next add
    });

    function redrawShadow(layer) {
      if (!_shadowGroup) _shadowGroup = L.layerGroup().addTo(layer);

      const date = TimeState.current;
      const solar = findActiveSolar(date);

      // The Bessel shadow depends only on instant, zEff, visible world copies and _ephemGen;
      // skip a redraw that changes none of them.
      const _zEff = Math.min(map.getZoom(), Z_CAP);
      const _bessel = solar && typeof BesselRT !== 'undefined' && typeof Astronomy !== 'undefined';

      // Keep _ephemGen in the key: the noFly path has no flyTo or zoom to invalidate it.
      const _gateKey = _bessel ? date.getTime() + '|' + _zEff + '|' + curveWrapsKey(map) + '|' + _ephemGen : null;
      if (_gateKey && _gateKey === _lastShadowKey && _shadowGroup.getLayers().length) return;

      _shadowGroup.clearLayers();

      // Snapshot the viewport so any addPolyline below (lunar realtime visibility
      // hemisphere) culls off-screen world-copies like the contact curves do.
      _curveViewport = _map ? viewportLngSpan(_map, curveMargin(_map)) : null;

      if (solar) {
        if (_bessel) {
          const s = computeSolarShadow(date, solar);
          if (s) {
            renderSolarShadow(s, _shadowGroup, map.getZoom(), date.getTime());
            _lastShadowKey = _gateKey;
          } else _lastShadowKey = null;
        } else {
          const s = computeSolarShadowSphere(date);
          if (s) renderSolarShadowSphere(s, _shadowGroup);
          _lastShadowKey = null;
        }
        return;
      }
      _lastShadowKey = null;

      // Lunar: the moon-up hemisphere as a veil that reddens with umbral depth, under a
      // dashed edge.
      const lunar = findActiveLunar(date);
      if (lunar && typeof Astronomy !== 'undefined' && typeof _computeAltitudeContourArcs === 'function') {
        // Geocentric sub-lunar point; MUST use the same EQJ→EQD transform as bodySubPoint in
        // js/body-markers.js. Never Equator(…, ofdate=false): it adds topocentric parallax.
        const _t = Astronomy.MakeTime(date);
        const _v = Astronomy.RotateVector(
          Astronomy.Rotation_EQJ_EQD(_t),
          EphemCorrect.correct(Astronomy.GeoVector(Astronomy.Body.Moon, _t, true), Astronomy.Body.Moon, date)
        );
        const _d = Math.hypot(_v.x, _v.y, _v.z);
        const gast = Astronomy.SiderealTime(_t) * 15;
        const subLat = (Math.asin(_v.z / _d) * 180) / Math.PI;
        const subLng = (((Math.atan2(_v.y, _v.x) * 180) / Math.PI - gast + 540) % 360) - 180;

        // Moon altitude ≥ 1.78° around the sub-lunar point, never its antipode. Fill before
        // the dashed edge so the edge stays on top.
        const f = lunarRedness(date);
        const tint =
          f > 0 && typeof GeoUtils !== 'undefined'
            ? GeoUtils.lerpHex(COLOR.lunarVeilBase, COLOR.lunarVeilRed, f)
            : COLOR.lunarVeilBase;
        const alpha = 0.18 + 0.2 * f; // dianqing ~0.18 (penumbral) → zhusha ~0.38 (total)
        if (typeof _computeAltitudeContourRing === 'function') {
          const ring = _computeAltitudeContourRing(subLat, subLng, 1.78);

          // poleLat = cap-centre latitude so _drawShadowBand closes over the
          // correct Mercator pole edge when the near-hemisphere cap winds a pole.
          _drawShadowBand(ring, tint, alpha, _shadowGroup, subLat, 'eclipse-shadow', 'lunar-visibility-band');
        }
        const arcs = _computeAltitudeContourArcs(subLat, subLng, 1.78);
        for (const arc of arcs) {
          if (arc.length >= 2)
            addPolyline(
              arc,
              {
                color: COLOR.shadowPenumbra,
                weight: 1,
                opacity: 0.55,
                dashArray: '4 4',
                interactive: false,
                pane: 'eclipse-shadow',
              },
              _shadowGroup
            );
        }
      }
    }

    function clearSelection() {
      curvesLayer.clearLayers();
      _selectedEvent = null;
      if (TimeState.unlockRange) TimeState.unlockRange();
    }

    // Panel close. soloLayer's 'remove' hook clears the selection; never call
    // clearSelection on that path too, or the two recurse.
    function deselect() {
      if (map.hasLayer(soloLayer)) map.removeLayer(soloLayer);
      else clearSelection();
    }

    // Curves live in data/eclipses/events/<date>.json; no-cache revalidates so a rebuild shows
    // without a hard refresh.
    function loadCurvesFor(event) {
      if (!event._curves_url) {
        return Promise.resolve(event.contactCurves || null);
      }

      // Memoize the promise, never the result: two callers ask in the same tick.
      if (event._curvesPromise) return event._curvesPromise;
      const url = `data/eclipses/${event._curves_url}`;
      event._curvesPromise = fetch(url, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          // Adopt the elements the curves were built from, so the live shadow matches them;
          // the first frame after selection is AE-direct until this lands.
          if (data && data.bessel) {
            besselPolys[event.date] = data.bessel;
            _ephemGen++; // the only besselPolys write
            if (map.hasLayer(soloLayer)) redrawShadow(soloLayer);
          }
          const cc = data ? data.contactCurves : null;
          if (cc) event.contactCurves = cc;
          return cc;
        })
        .catch(() => null);
      return event._curvesPromise;
    }

    function selectEvent(e, opts) {
      const noFly = !!(opts && opts.noFly);
      const isSolar = e._kind === 'solar';

      // Set or clear this event's ephemeris correction before anything reads a position.
      EphemCorrect.setEvent(e);

      // Greatest eclipse (GE): the instant the shadow axis passes closest to Earth's
      // centre, the ±slider anchor and the scrubber's GE tick.
      const peakTime = isSolar ? e.peak.time : e.times.peak;

      // The timeline spans P1…P4: the whole event anywhere on Earth.
      const p1Iso = isSolar ? e.p1 : e.times && e.times.p1;
      const p4Iso = isSolar ? e.p4 : e.times && e.times.p4;
      if (p1Iso && p4Iso && TimeState.lockRange) {
        TimeState.lockRange(new Date(p1Iso), new Date(p4Iso), new Date(peakTime));
      } else {
        TimeState.resetTo(new Date(peakTime));
      }

      // Its 'add' hook redraws the shadow at the time locked above.
      if (!map.hasLayer(soloLayer)) soloLayer.addTo(map);
      if (isSolar) {
        loadCurvesFor(e).then((cc) => {
          if (cc) e.contactCurves = cc;
          _selectedEvent = e;
          _lastCurveWrapsKey = curveWrapsKey(map);
          drawContactCurves(e, curvesLayer);
        });
      } else {
        _selectedEvent = e;
        _lastCurveWrapsKey = curveWrapsKey(map);
        drawContactCurves(e, curvesLayer);
      }

      if (isSolar) {
        // noFly: a record-driven selection keeps the view.
        if (!noFly) {
          // Fly even when the peak is off screen, or the selection looks like a dead click.
          map.flyTo([e.peak.lat, e.peak.lng], Math.max(map.getZoom(), 4));
        }
        Sidebar.showEclipse(e, deselect);
      } else {
        Sidebar.showLunarEclipse(e, deselect);
      }
    }

    TimeState.subscribe((date) => {
      if (!_loaded) return;
      if (map.hasLayer(soloLayer)) {
        redrawShadow(soloLayer);
        redrawBodies();
      }
    });

    // Zoom changes the umbra facet count and the visible world copies; the moveend that
    // follows then matches the wraps key.
    map.on('zoomend', () => {
      if (_loaded && map.hasLayer(soloLayer) && findActiveSolar(TimeState.current)) {
        redrawShadow(soloLayer);
      }

      // Disk size follows zoom, for lunar events too.
      if (_loaded && map.hasLayer(soloLayer)) redrawBodies();
      if (_loaded) redrawSelectedCurves(true);
    });

    // Redraws only when the set of visible world copies changes.
    map.on('moveend', () => {
      if (_loaded) redrawSelectedCurves(false);
    });

    // Detail-curve toggle (event panel). Redraw is forced so the fold/unfold
    // is immediate for the currently-selected event.
    function setCurveDetail(on) {
      const v = !!on;
      if (v === _curveDetail) return;
      _curveDetail = v;
      redrawSelectedCurves(true);
    }

    // Band rings of any event for the atlas overview, through the selected fill's QC gate.
    function bandRingsFor(event) {
      return loadCurvesFor(event)
        .then((cc) => {
          if (!cc) return null;
          const unl = asCompact(cc.umbralNLimit || []);
          if (unl.length < 2) return null; // grazing / no umbra → no band
          return EnvelopeRing.buildEnvelopeRings(unl);
        })
        .catch(() => null);
    }

    return {
      soloLayer,
      selectEvent,
      clearSelection,
      deselect,
      setCurveDetail,
      getCurveDetail: () => _curveDetail,
      bandRingsFor,
      // Per-observer local circumstances for the click-a-point observation popup.
      classifySolar,
      solarLocalContacts: solarLocalContactsCached,
      classifyLunar,
      nextVisible: nextVisibleCached,
    };
  }

  return { init, lunarRedness };
})();
