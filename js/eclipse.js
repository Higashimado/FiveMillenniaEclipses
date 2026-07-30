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

  // Views onto EclipseLoader's single merged catalog — NOT copies. It already
  // fetches solar.json + lunar.json (13.5 MB), tags each event with _kind and
  // pre-parses the _p1Ms/_p4Ms contact bounds this module scans on every
  // TimeState tick; fetching and annotating a second private copy here doubled
  // both the parse cost and the resident event objects for no added information.
  let solarEvents = [];
  let lunarEvents = [];
  let besselPolys = {}; // date → NASA Besselian polynomial, filled per-event
  // from events/<date>.json's bessel block on selection
  // Bumped on every besselPolys mutation. ANY memo whose value derives from the
  // Bessel-element vector b MUST fold this into its key: the same instant + place
  // resolves to DIFFERENT elements before vs after an event's NASA polynomial
  // lands (b = f(instant, ephemeris), not f(instant) alone), so a key without it
  // hands back geometry from the superseded ephemeris — e.g. a fresh-b NASA
  // penumbra wash drawn over stale AE dashed iso-lines, which then cross.
  let _ephemGen = 0;
  let _loaded = false;
  let _polling = false;
  let _callbacks = [];

  // At zoom ≥ Z_CAP the shadow densify density and umbra seed azimuth count are
  // frozen: finer steps only insert invisible collinear vertices, so a zoomend
  // beyond Z_CAP that changes neither the instant nor zEff can be skipped by
  // redrawShadow's zoom-reuse gate. Module-scoped so renderSolarShadow and the
  // gate share the one constant. (See AstroMeteoMap eclipse.js:38.)
  const Z_CAP = 9;
  // Per-instant memo of the marching-squares iso/penumbra chains: a function of the
  // Bessel elements (b), so a zoom-only redraw of the same instant + ephemeris
  // reuses them and skips the field build + marching-squares. Keyed by keyTime +
  // _ephemGen — the instant alone is NOT enough, since b also depends on which
  // ephemeris is loaded (AE-direct until the event's NASA polynomial lands).
  let _fieldCache = { key: '', chainsByMag: null };

  // Map reference + per-redraw viewport snapshot, used by addPolyline to skip
  // world-wrap copies that fall entirely outside the current viewport. Set once
  // per draw pass (drawContactCurves / redrawShadow) so individual addPolyline
  // calls don't each hit map.getBounds(). _curveViewport === null disables
  // culling (no map ref yet, e.g. tests) → draw every wrap as before.
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

  // Adopt EclipseLoader's catalog once it is populated. besselPolys stays lazily
  // filled per event from events/<date>.json (see loadCurvesFor) — the old eager
  // data/eclipses/bessel-poly.json (4 events, no writer, a 2.9 MB liability at full
  // coverage) is retired; every event now carries its NASA elements in its own file.
  function loadData(cb) {
    if (_loaded) {
      cb && cb();
      return;
    }
    if (cb) _callbacks.push(cb);
    // The same service-window view every other consumer reads. The catalog files
    // carry a post-1999 tail that nothing here can reach: findActiveSolar and
    // findActiveLunar are only ever passed TimeState.current, and TimeState hard-
    // clamps at 1999-12-31 (time.js _RANGE_MAX), while nextVisible() scans
    // EclipseLoader.all() directly.
    const cat = window.EclipseLoader && EclipseLoader.all ? EclipseLoader.all() : [];
    if (!cat.length) {
      // EclipseLoader.init is not awaited by map-boot, so a shadow redraw can beat it.
      // Poll rather than fetch: a second fetch would re-download and re-parse 13.5 MB
      // to learn what is already on its way.
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

  // ---- Solar shadow geometry (real-time) ----
  //
  // The shadow footprint is drawn with the SAME Besselian geometry as the cached
  // contact curves (js/bessel-runtime.js), so the live umbra/antumbra and
  // iso-magnitude rings stay tangent to the cached limit/iso-mag curves. The
  // legacy sphere approximation below is kept only as a fallback for the
  // (practically impossible) case that the runtime module fails to load.

  // Besselian path — returns { b (elements), sub, isTotal }. sub is null when
  // the shadow axis doesn't intersect Earth (partial eclipses, or partial phases
  // P1→U1 / U4→P4 of total/annular eclipses); penumbra/iso-mag rings are still
  // rendered via projectRing's per-azimuth boundary search.
  function computeSolarShadow(date, event) {
    const poly = event && besselPolys[event.date];
    const b = poly
      ? BesselRT.evalBessel(poly, date) // NASA-transcribed (4 events)
      : BesselRT.coreBesselAE(Astronomy, date); // AE-direct (== build)
    const sub = BesselRT.fundamentalToGeo(b.x, b.y, b);
    return { b, sub, isTotal: b.l2 < 0 };
  }

  // Legacy sphere approximation (fallback only).
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

  // ---- Local circumstances & forecast (ported verbatim from AstroMeteoMap) ----
  //
  // Per-observer geometry for the click-a-point observation popup: which phase a
  // location would witness (classifySolar / classifyLunar), the observer's own
  // contact times (solarLocalContacts), and — when the selected eclipse isn't
  // visible there — the next eclipse of each kind visible from that point
  // (nextVisible). Solar geometry runs through BesselRT.localCircumstances with
  // the SAME coreBesselAE the real-time footprint uses, so the popup agrees with
  // the drawn shadow. Refraction is confined to the horizon gate / altitude
  // read-outs (Astronomy.Horizon 'normal'); the disc-tangency contacts stay
  // geometric, so the map's drawn geometry is untouched.

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

  // Full local contact times for a solar eclipse at the observer: C1/C4 (partial
  // limits), C2/C3 (central limits, null if not central), the local maximum, and
  // sunrise/sunset markers when the Sun crosses the horizon mid-eclipse. Contacts
  // are GEOMETRIC disc-tangency (refraction never moves them); visibility is gated
  // by classifySolar (apparent). Times are Dates; null when absent.
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
      // Reject an edge-clamp collapse (grazing/midnight/bad point): keep only a
      // strictly-interior [c2,c3] — the same rejection the offline contact solver
      // applies, so the popup's times agree with the cached ones.
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

  // Local solar contacts depend on event elements + location; memoize so a moving
  // time slider doesn't re-run the root-finder each tick. _ephemGen is in the key
  // too: the elements flip AE→NASA when the event's polynomial loads, and a key
  // without it would pin the popup's contact times to the pre-NASA (AE) solution.
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

  // nextVisible is expensive (hundreds of ephemeris evals); memoize by rounded
  // location + day (+ _ephemGen, since the underlying elements flip AE→NASA on
  // load) so it recomputes only when the observer moves, the date rolls, or the
  // ephemeris generation advances.
  let _nvCache = null;
  function nextVisibleCached(lat, lng, fromDate) {
    const key =
      lat.toFixed(1) + ',' + lng.toFixed(1) + ',' + Math.floor(fromDate.getTime() / 86400000) + ',' + _ephemGen;
    if (_nvCache && _nvCache.key === key) return _nvCache.slots;
    const slots = nextVisible(lat, lng, fromDate);
    if (slots) _nvCache = { key, slots };
    return slots;
  }

  // Umbral-eclipse "redness" driving the moonlight veil tint below, and exported
  // on the public API for any future veil consumer.
  // 0 = no umbral phase active … 1 = deepest red.
  //   Total   eclipse: FULL red throughout totality (U2..U3); linear ramp
  //                    across the partial ingress (U1..U2) and egress (U3..U4).
  //   Partial eclipse: no totality → triangular ramp peaking at the umbral
  //                    magnitude (<1) at greatest.
  //   Penumbral-only (no U contacts): 0 — too faint to tint.
  function lunarRedness(date) {
    // Lazy-load the catalog so the moonlight veil can redden during normal
    // sky viewing without the (mutually-exclusive) Eclipses overlay being on.
    // First call kicks off the fetch and returns 0; the next TimeState tick
    // (mask rebuild) picks up the loaded data.
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

  // ---- Besselian instantaneous-footprint renderer ----
  // Draws the umbra/antumbra, iso-magnitude rings (0.2/0.4/0.6/0.8 — matching
  // the cached magContours), and the partial-visibility (penumbra) edge by
  // projecting fundamental-plane contours through BesselRT.projectRing. Each
  // ring is laid down via addPolyline so it gets ±360° world copies, antimeridian
  // splitting and null-gap (limb-clip) handling for free.

  // Localized "totality band" map label. Read at draw time so a fresh path picks
  // up the current locale. The bare-English literal covers only the case where
  // i18n never loaded at all — it must not be a Chinese string, which would put
  // Han script on a French or Spanish map.
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
    for (let w = -1; w <= 1; w++) {
      L.marker([lat, top[1] + w * 360], {
        icon: L.divIcon({
          className,
          html: isBand ? '<span aria-hidden="true">' + html + '</span>' : html,
          iconSize: isBand ? [60, 16] : [28, 14],
        }),
        interactive: false,
      }).addTo(layer);
    }
  }

  // On-screen tangent (deg) of seg at index i, measured in _map's Web Mercator
  // pixel space so it matches the drawn polyline's slope EXACTLY (the polyline is
  // drawn in that same space). Zoom-invariant — Mercator scales x/y isotropically,
  // so the chord angle is independent of zoom (and of pan, which is translation),
  // letting us bake it once at render time. Computing the angle in geographic
  // (Δlat,Δlng) space instead and applying it as a screen-space CSS rotate() is the
  // classic bug (latitude stretch desyncs it from the on-screen slope) — don't.
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

  // Anchor index for a contour label, decided by the segment's TOPOLOGY. A CLOSED
  // loop (a concentric iso-magnitude ring around the point of greatest eclipse) is
  // anchored at its NORTHERNMOST vertex: nested rings' top vertices line up
  // vertically, so the labels stack into a readable 0.80→0.20 ladder (and the tangent
  // there is ~horizontal, so the text sits flat). An OPEN arc (terminator-clipped, or
  // a cached ground-envelope branch) has its ends out on the limb, so its midpoint is
  // the true visual centre — anchor there (and NOT at the northernmost vertex, which
  // for an open arc is just the clipped end). Topology is judged by endpoint
  // coincidence relative to the segment's own bbox, so the test is scale-free.
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
          // Edge straddles refLng
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

  // Drop a value label on each sufficiently-long segment in `segs`, rotated to run
  // PARALLEL to the contour's on-screen tangent at the anchor. The anchor is chosen by
  // `anchorIndex` per topology: closed iso rings get their northernmost vertex (so
  // nested rings stack into a 0.80→0.20 ladder), open arcs get their midpoint (inside
  // the drawn arc, not at a clip/limb end). Labelling every segment ≥ 0.5× the longest
  // gives one label for a single arc and one per branch when north and south arcs are
  // both substantial. `color`, when given, is applied inline (cached magContour); omit
  // it to inherit the className's CSS color (real-time grey .iso-mag-label).
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
      // Rotate the inner span (the marker div itself is owned by Leaflet for
      // positioning); the same deg serves all ±360 wrap copies (angle is invariant
      // under a longitude shift).
      const style =
        'display:inline-block;transform:rotate(' + deg.toFixed(1) + 'deg)' + (color ? ';color:' + color : '');
      const html = '<span style="' + style + '">' + text + '</span>';
      for (let w = -1; w <= 1; w++) {
        L.marker(
          [mid[0] + 0.3, mid[1] + w * 360],
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
      // smoothFactor:0 — disable Leaflet's Douglas-Peucker simplification so our
      // carefully densified vertices are all used. The default smoothFactor:1 drops
      // any vertex whose on-screen deviation from the straight chord is < 1px,
      // reducing a 34px-radius ring to ~13 sides regardless of vertex count.
      const polyOpts = Object.assign({ pane: 'eclipse-curves', interactive: false, smoothFactor: 0 }, opts);
      for (const off of [0, -360, 360]) {
        L.polygon(
          pts.map((p) => [p[0], p[1] + off]),
          polyOpts
        ).addTo(layer);
      }
    } else {
      addPolyline(pts, Object.assign({ fill: false, interactive: false }, opts), layer);
    }
  }

  // Project a fundamental-plane (ξ,η) interior-iso vertex to [lat,lng] with the
  // self-consistent SPHERICAL inverse (the field uses the spherical ζ too). Smooth
  // and defined everywhere on the disc — unlike the ellipsoid fundamentalToGeo,
  // which returns null in the thin near-limb band and makes contours break/zigzag.
  function fundToGeoSafe(xi, eta, b) {
    const g = BesselRT.fundamentalToGeoSphere(xi, eta, b);
    return [g.lat, g.lng];
  }

  // Project a fundamental-plane (ξ,η) contour chain to a [lat,lng] polyline,
  // adaptively closing the geographic facets that appear where the (ξ,η)→geo
  // projection stretches (the rise/set limb, and high latitude where sec φ blows
  // up): consecutive cell-step vertices there can be hundreds of km apart on the
  // ground even though they're ~one grid cell apart in (ξ,η). We bisect IN (ξ,η)
  // and project each sub-vertex (grid-scale segments are locally straight in ξ,η,
  // so no contour re-snap is needed) until the on-map Mercator chord ≤ maxMercDeg,
  // the same discipline the cached rise/set curves are densified under.
  //   The off-chord guard does double duty: when the (ξ,η) midpoint does NOT
  // project between its endpoints, the segment isn't a stretch but a PROJECTION
  // SINGULARITY (the contour passing the geographic pole, where longitude is
  // undefined). Densifying across it would draw a slash, so insert a null break
  // instead and let splitAtAntimeridian cut it cleanly.
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

  // Fill one closed shadow ring (a lens from isoMagLensGeo) as a flat-opacity band,
  // repeated across world copies. Unwraps longitude into a continuous run; only when the
  // ring truly winds a pole (|Σ Δlng| ≈ 360°) does it close over the Mercator-clamped
  // pole edge so the enclosed polar cap fills too. Merely CROSSING the antimeridian
  // must not trigger that close, or the fill is slashed across the map. Bands carry
  // className 'eclipse-penumbra-band'.
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
    // Default pane/class = the solar penumbra choropleth (unchanged for solar).
    // The lunar visibility cap passes its own class so it isn't repainted as
    // the shadowPenumbra band.
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
    // World-copy offsets derived from each polygon's OWN longitude extent, not a
    // fixed [0,-360,+360] triple. Even with a normalized cap centre, the unwrap
    // above (and the pole-winding split below) can leave a polygon's longitudes
    // anywhere in [0,360) or beyond — so when the cap crosses the antimeridian a
    // fixed triple misses the far-west copy of the -200..520 window (720° wide).
    // Tile every 360° shift overlapping the window instead. Mirrors addPolyline's
    // derivation.
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
      // Polar-winding cap: the unwrapped ring spans ~360° of longitude. A single
      // 360°-wide Leaflet polygon triggers an SVG nonzero-winding pathology — the
      // east-side, west-side, and polar-closure edges cancel to winding=0 at the
      // cap interior, leaving most of the fill missing. Fix: split at the
      // antimeridian crossing (uw ≈ start + 180°) into two ≤180°-wide halves;
      // each half cleanly winds to −1 inside its region.
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
    // Azimuth count scales with zoom so the umbra ring stays sub-pixel-smooth at
    // any zoom (the runtime point math is already meter-accurate; this only
    // controls polygon faceting). The umbra/antumbra is the hero feature → most
    // samples. The faint dashed iso/penumbra contours now come from a marching-
    // squares field (below), not the radial sweep. Redrawn on zoomend.
    const z = zoom || 4;
    const umbraNAz = Math.max(256, Math.min(1024, Math.round(64 * Math.pow(2, z / 2))));
    // Web-Mercator chord threshold derived from pixels at the current zoom: at
    // zoom z, 1° of Mercator-equivalent ≈ 256·2^z/360 px, so a 4 px target gives a
    // sub-pixel-visible bound. Every contour densifier below bisects and
    // re-projects until each on-map chord ≤ maxMercDeg, because sec φ stretches
    // polar arcs by ~3× at 70° and ~6× at 80°.
    //   The density freezes at Z_CAP: past it, finer steps only insert invisible
    // collinear vertices. redrawShadow's zoom-reuse gate keys on the same zEff, so
    // a zoom change above Z_CAP skips the rebuild entirely. Capping cannot jitter a
    // line, because the shape comes from the zoom-independent field below.
    const zEff = Math.min(z, Z_CAP);
    const maxMercDeg = (4 * 360) / (256 * Math.pow(2, zEff));

    // Partial-visibility contours — the penumbra (mag=0) edge and the iso-magnitude
    // levels. Each level is the boundary of {mag ≥ k} ∩ {sunlit disc}, drawn as TWO
    // pieces that share exact endpoints:
    //   • interior iso arc — marching squares on the CONTINUOUS magnitude field
    //     (ζ clamped to 0 off-disc), then clipChainToDisc cuts it at the exact ρ=1
    //     root; projected with the self-consistent spherical inverse.
    //   • rise/set terminator — the limb arc closing the lens, grown analytically
    //     by terminatorArcs FROM the interior arc's own clip angles, so the two
    //     endpoints coincide.
    // The two must stay apart: one combined min-of-two-constraints field creases
    // where the iso arc runs tangent to the limb. Do NOT snap the interior endpoint
    // to the analytic cusp — near the bottom of the disc the spherical inverse is
    // sensitive enough that a few-km tangential snap spikes the arc. The narrow
    // umbra (~30 km) is beyond any practical grid and keeps the radial projector.
    //   The field step is zoom-INDEPENDENT: the interior arc's (ξ,η) geometry must
    // be identical at every zoom, or the contour walks as the reader zooms.
    // densifyContour's maxMercDeg still scales with zoom, but it only inserts
    // collinear points along the same curve. 0.004 ≈ 25 km in (ξ,η).
    const fieldStep = 0.004;
    // mag 0 = penumbra (solid-dim, matches old penumbra style); the rest = iso
    // levels matching the cached magContours. Colors resolve from COLOR at
    // render time.
    const LEVELS = [
      { mag: 0, color: COLOR.shadowPenumbra, weight: 1, opacity: 0.55, dash: '4 4', label: null },
      { mag: 0.2, color: COLOR.shadowIso[0], weight: 0.8, opacity: 0.7, dash: '3,5', label: '0.20' },
      { mag: 0.4, color: COLOR.shadowIso[1], weight: 0.8, opacity: 0.7, dash: '5,4', label: '0.40' },
      { mag: 0.6, color: COLOR.shadowIso[2], weight: 0.8, opacity: 0.7, dash: '6,4', label: '0.60' },
      { mag: 0.8, color: COLOR.shadowIso[3], weight: 0.8, opacity: 0.7, dash: '8,3', label: '0.80' },
    ];
    // The magnitude field and per-level marching-squares chains are a function of
    // b, so memoise by keyTime + _ephemGen: a zoom-only redraw of the same instant
    // AND ephemeris reuses them and skips the field build + marching-squares. The
    // _ephemGen tag is essential — b also depends on which ephemeris is loaded, so
    // keying by the instant alone serves AE chains after NASA elements land, and
    // the dashed iso-lines then lag the fresh-b penumbra wash (they cross). Cached
    // chains are read-only downstream (clipChainToDisc/densifyContour copy), safe.
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
    // Penumbra ink wash — a choropleth of nested iso-magnitude lens rings. Each ring is the
    // mag=k contour (isoMagLensGeo → SAME formula as the dashed lines, so bands hug them);
    // opacity follows the obscuration O(k) = (2/π)[acos(1−k) − (1−k)√(1−(1−k)²)] = the light
    // actually removed = the darkening seen from space. Painted outer→inner with per-ring
    // incremental alpha so the composited opacity in band [k_i,k_{i+1}] equals PEAK·O(k_i):
    // it fades to ~0 at the mag=0 edge (in EVERY direction, unlike a Mercator-radial
    // gradient) and deepens toward the axis, staying correct at oblique geometry. The axis
    // ground point only picks the pole side for a genuinely pole-winding ring.
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
      const interiorGeos = []; // interior iso arcs only (terminator limb arc excluded from labelling)
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
      // Interior iso arc(s). The continuous (no +Inf) field lets the contour
      // cross ρ=1 inside a real cell; clipChainToDisc cuts each chain at the
      // EXACT ρ=1 root and drops the off-disc part. We record the limb ANGLE of
      // each clip point and feed those to terminatorArcs, so the terminator is
      // grown FROM the interior arc's own crossing — the two pieces meet with zero
      // seam, and we never snap the (singularity-sensitive) interior endpoint.
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
        // Label the interior iso arc(s). Closed rings (around greatest eclipse) are
        // anchored on the vertical line through the sub-solar point so all rings
        // share the same screen column. Open arcs anchor at their midpoint.
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

    // Umbra (total) / antumbra (annular) — palette rim stroke + ink-wash fill. The
    // shadow boundary is the m=|L2'| circle in the fundamental plane; umbraLensGeo
    // parametrises it by angle (defined for every azimuth) and closes any grazing
    // day-side lens along the terminator, so it stays smooth both when the axis is
    // on the disc (a closed ellipse) and at a sunset-terminus eclipse where the axis
    // grazes just off-disc — the regime that defeats a radial boundary search.
    // Returns null only when the shadow misses Earth entirely (partial phase / no
    // landfall).
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

  // Legacy sphere renderer (fallback only — paired with computeSolarShadowSphere).
  function renderSolarShadowSphere(s, layer) {
    // Iso-magnitude rings: linear approximation between umbra (mag=1) and
    // penumbra (mag=0). Placeholder for v1.0; v1.1 will replace with Bessel
    // element exact contours.
    const ISO_MAG_LEVELS = [
      { mag: 0.2, dashArray: '3,5', color: COLOR.shadowIso[0] },
      { mag: 0.5, dashArray: '5,4', color: COLOR.shadowIso[1] },
      { mag: 0.8, dashArray: '8,3', color: COLOR.shadowIso[3] },
    ];

    for (const offset of [0, -360, 360]) {
      const center = [s.lat, s.lng + offset];

      // Penumbra (outer soft edge)
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

      // Iso-magnitude rings between umbra and penumbra
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
          // Label at north edge of each iso-mag ring (a bit outside)
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

      // Umbra: palette rim stroke + ink-wash fill (geometry self-explains)
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

      // Edge label at north umbra rim (only the on-screen copy). Annular eclipses
      // get no label — only the total-eclipse band is called out by name.
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

  // ---- Contact-curve rendering (P1/P4 envelope, N/S limits, central path,
  //      iso-magnitude contours, lunar U1–U4 visibility hemispheres). The
  //      curves are time-independent for a given event — built once at
  //      build-eclipses.js time — so we just need to lay them down on the
  //      map when the user selects an eclipse, and clear when they close.

  // Hard-coded to match tokens.css: Leaflet's polyline `color` does not accept a
  // `var(--…)` string, so these cannot be read from CSS. There is no dark theme —
  // one Song-painting light-wash (dan-shese) family, hued by family and layered by
  // lightness so the ~8 curve types stay pairwise-distinguishable on the
  // desaturated basemap without going neon. Totality = warm madder (the hero
  // band), annular = ochre, penumbral N/S = zhilü (sap-green), lunar family =
  // piaobe (celadon), iso-lines = huaqing (cornflower-indigo), greatest = yanzhi.
  const COLOR = {
    central: '#A8324A', // total: umbral center line (deep madder yanzhi)
    centralAnn: '#B0703C', // annular: antumbral center line (deep zheshi ochre)
    penumbraRim: '#B5645A', // P1/P4 outer penumbral limit (faded terracotta)
    nsLimit: '#3C6E5A', // penumbral N/S limits (zhilü (sap-green)-deep)
    umbralLimit: '#C06B78', // total: umbral N/S limits (dusty rose, lighter madder)
    umbralLimitAnn: '#C89A6A', // annular: antumbral N/S limits (light ochre)
    visibility: '#3F8378', // lunar visibility outline (piaobe (celadon))
    mag50: '#4E6E86', // 50% magnitude iso-line (huaqing (cornflower-indigo) indigo)
    uContact: '#4E948A', // lunar U1–U4 contact arcs (piaobe (celadon))
    greatest: '#CE564C', // greatest-eclipse point (yanzhi spark)
    // Real-time shadow, ink-wash register: the dark set's navy/gold umbra reads
    // as a hole punched in light paper, so the sweeping umbra becomes a danmo (pale-ink)
    // pool with an ochre rim, and the iso steps ramp huaqing (cornflower-indigo)→zhe (ochre) (deeper magnitude
    // = warmer + darker, still recessive against the desaturated basemap).
    shadowPenumbra: '#1C1C28', // mag-0 penumbra edge + lunar visibility circle (mo ink)
    // Lunar visibility veil (filled moon-up hemisphere): dianqing (indigo-blue)-to-zhusha (cinnabar). The old milky
    // a white base suits a dark basemap — invisible on this project's pale
    // paper basemaps (Positron/OHM). On light paper the base must be DARK to read,
    // so it's a deep dianqing (night hemisphere) warming to zhusha cinnabar at totality —
    // the same zhu-red as the woodblock frame's zhupi, so the map's red has one origin.
    lunarVeilBase: '#465468', // penumbral wash (deep dianqing, reads on cream paper)
    lunarVeilRed: '#C0472E', // totality (zhusha cinnabar, echoes the zhupi accent)
    shadowIso: ['#5A7386', '#6F7B72', '#8A7D5B', '#A2803F'], // mag .2/.4/.6/.8 huaqing (cornflower-indigo)→zhe (ochre)
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

  // Detail mode for the selected event's curve set. Default OFF = only the
  // Detail curves always on: magnitude contours, rise/set loops, extreme
  // lines, and faint lunar p1/p4 circles are drawn alongside the narrative core.
  let _curveDetail = true;

  // ---- Eclipse Curve Names ----
  // Map tooltips carry the bare curve name only. An encyclopedia-style definition
  // trailing after an em dash turns every hover into a wall of text over the map,
  // and the names alone already identify the lines.
  function curveName(key, mag) {
    const name = typeof I18n !== 'undefined' ? I18n.t('eclipse.curve.' + key) : key;
    return mag != null ? name + ' ' + mag.toFixed(2) : name;
  }

  // Split a polyline at:
  //   – null-lng sentinels (data signals "this sample is at the pole; lng
  //     is undefined" — the build script emits these so the renderer can
  //     leave a clean gap instead of an arbitrary chord across the pole),
  //   – antimeridian crossings (|ΔLng| > 180°),
  //   – polar wraps (both ends within 15° of a pole + ΔLng > 60°).
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

  // The Leaflet map is configured with MAP_LNG_WEST = -200, MAP_LNG_EAST = 520
  // (a ~720° span so the user can pan across the antimeridian without a void
  // edge). Each curve must be drawn in every world-copy that falls inside
  // those bounds — otherwise the eclipse only shows in one of the wraps.
  // ±360° is enough since the span is just under 2 full worlds.
  function addPolyline(pts, opts, layer, tooltip) {
    // Route event polylines through eclipse-curves(z=628) by default; shadow
    // callers override with pane:'eclipse-shadow'(z=629) so the real-time wash
    // sits above the historical contact curves.
    // smoothFactor:0 — keep every vertex we computed; the default Leaflet value
    // of 1 would apply Douglas-Peucker with a 1px on-screen tolerance and silently
    // discard most of the ring vertices, turning a smooth curve into a coarse polygon.
    const polyOpts = Object.assign({ pane: 'eclipse-curves', smoothFactor: 0 }, opts);
    // Normalize longitudes with ADJACENT-POINT CONTINUITY: the first point of
    // each segment goes to [-180,180); every following point takes the ±360
    // representative nearest its predecessor, so a curve that crosses the
    // antimeridian stays continuous (output lng may exceed ±180 — Leaflet draws
    // it correctly and the ±360 world copies still cover the visible span).
    // Normalizing each point independently would reintroduce a 360° jump at the
    // dateline that splitAtAntimeridian then cuts, leaving a visible gap
    // (2024-10-02 sLimit crosses 180° twice → two ~25 km breaks).
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
    // Draw a world-copy for every 360° shift that overlaps the map's longitude
    // span (MAP_LNG_WEST..MAP_LNG_EAST = -200..520, set in js/map-boot.js). The
    // continuity unwrap above can leave lng well outside [-180,180] (e.g.
    // 2024-04-08 nLimit spans -290..-129), so a fixed w∈{-1,0,1} misses copies —
    // the 70°E arc would show but its 430°E copy would not. Derive the range from
    // the curve's own extent so every visible world copy is drawn.
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
      // Skip world-copies entirely outside the current viewport (perf at high
      // zoom: at z≥9 only 1 wrap overlaps a ~35° span, so we draw 1 polyline
      // instead of 3-7). _curveViewport is null when no map ref → draw all.
      if (_curveViewport) {
        const cLo = lo + w * 360,
          cHi = hi + w * 360;
        if (cHi < _curveViewport.west || cLo > _curveViewport.east) continue;
      }
      const shifted = w === 0 ? norm : norm.map((p) => (p == null || p[1] == null ? p : [p[0], p[1] + w * 360]));
      const segments = splitAtAntimeridian(shifted);
      for (const seg of segments) {
        // Casing: a solid paper ribbon in the dedicated underlay pane (z=627,
        // one below eclipse-curves) so ALL halos sit under ALL colored strokes
        // — same-pane interleaving would let a later curve's halo overpaint an
        // earlier curve's stroke where they cross. Solid even under dashed
        // strokes (reads as engraved casing); dashed strokes get a fainter one.
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

  // Add a single 2-point segment (from a marching-squares contour) and its
  // ±360° copies. Skips the antimeridian-split check because contour segments
  // are inherently local (≤4° cell width); they can't span the antimeridian.
  function addContourSegment(lat1, lng1, lat2, lng2, opts, layer) {
    const polyOpts = Object.assign({ pane: 'eclipse-curves' }, opts);
    for (let w = -1; w <= 1; w++) {
      L.polyline(
        [
          [lat1, lng1 + w * 360],
          [lat2, lng2 + w * 360],
        ],
        polyOpts
      ).addTo(layer);
    }
  }

  // Delegate to js/envelope-ring.js (loaded before this file). These aliases
  // preserve all downstream call sites unchanged.
  const splitOnNull = EnvelopeRing.splitOnNull;
  const asCompact = EnvelopeRing.asCompact;

  // Fill an unwrapped envelope ring as a polygon in every visible world copy.
  // Deliberately NOT drawFilledRing: that helper bails to unfilled polylines on
  // any >180° lng jump, which an unwrapped ring legitimately contains.
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

  // Add a wrapped marker (point + ±360° copies of itself).
  function addWrappedMarker(lat, lng, iconHtmlClass, layer, label) {
    for (let w = -1; w <= 1; w++) {
      L.marker([lat, lng + w * 360], {
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

    // 1. Equal-magnitude contours (cyan dashed, mag < 1.0 only)
    // smoothFactor omitted → inherits addPolyline's default 0 (keep every cached
    // vertex). The cached envelope for mag=0.2 has 1056+671=1727 raw points; the
    // old explicit smoothFactor:1 collapsed them to ~28, making the smooth envelope
    // look like a coarse polygon and visually mis-comparable to the live ring.
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

    // 2. Sunrise/sunset 8-loop (pink dashed) — detail mode only
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
      // Each loop of a multi-loop envelope (total/annular eclipses split at P2/P3
      // into two rings) is the union of a sideA "plus" arc and a sideB "minus" arc
      // sharing the SAME P-cusp endpoints. Pair them by SHARED ENDPOINTS, never by
      // array index: the two sides do not store their arcs in a matching order, so
      // aSegs[i]/bSegs[i] stitches arcs from different rings and draws a line
      // across the globe. Same-ring arcs have byte-identical cusp coordinates
      // (both pinned to the same anchor), so exact matching is robust and
      // antimeridian-immune.
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
      // Any arcs without an endpoint-matched partner are drawn as open polylines.
      for (let i = 0; i < aSegs.length; i++) if (!usedA[i]) addPolyline(aSegs[i], opts, layer, tip);
      for (let j = 0; j < bSegs.length; j++) if (!bUsed[j]) addPolyline(bSegs[j], opts, layer, tip);
    }

    // 3. Rise-max + set-max eclipse curves (pink solid) — detail mode only
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

    // 4. Penumbral N/S limits (green, always green)
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

    // 5. Umbral/antumbral envelope — Total: madder, Annular: ochre, Hybrid: split.
    // 5a. Band wash first: the envelope re-chained into a closed ring and laid
    // down as a translucent danran (light-wash) polygon in the underlay pane (the song-paper
    // reading of Espenak's path band). QC-gated — on failure the strokes below
    // still tell the story and __eclipseBandQC records why.
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
      // Umbral-limit segments are null-separated fragments whose array order
      // does NOT follow the central path's spatial order.  Instead of splitting
      // the flat array by break coordinates, project each segment's midpoint
      // onto the central path to determine its phase.
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
      // umbralNLimit holds the whole closed envelope (umbralSLimit is always
      // empty in current builds) — label it neutrally, not "northern".
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

    // 6. Central path — Total: deep magenta, Annular: orange, Hybrid: split
    // Bare curve name, no date/type header: these curves only ever draw for the
    // already-selected event, so the header repeated what the panel states. The
    // date · type line belongs to the unselected overview bands (js/atlas.js),
    // where hovering is how you tell one event's band from another's.
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

    // 7. Greatest-eclipse marker
    if (event.peak && typeof event.peak.lat === 'number') {
      addWrappedMarker(event.peak.lat, event.peak.lng, 'eclipse-greatest-marker', layer, '✶');
    }
  }

  function drawLunarContactCurves(event, layer) {
    const cp = event.contactPoints;
    if (!cp) return;
    // Each contact instant gets an 88.22° small circle (visibility hemisphere
    // outline — Moon alt ≥ 1.78°). Penumbral contacts (P1/P4) are dashed and dim; partial
    // contacts (U1/U4) are solid medium; total contacts (U2/U3) are solid
    // bright; greatest (G) is the highlight.
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
      // 88.22° visibility hemisphere = small circle of radius 90−1.78 around
      // the SUB-lunar point (Moon above the horizon). Reuse the shell's arc
      // machinery (720-pt sweep + antimeridian split + polar double-arc) so the
      // outline stays smooth and geometry-correct across poles — no 96-pt creases.
      // addPolyline handles world-wrap copies and antimeridian re-splitting.
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

  // ---- Public init ----

  function init(map) {
    _map = map; // expose for addPolyline's viewport-wrap culling
    // Create eclipse panes eagerly so drawSolarContactCurves can always use them.
    // z-order: eclipse-curves-halo(627) < eclipse-curves(628) < eclipse-shadow(629) < eclipse-markers(630) < eclipse-labels(631)
    if (!map.getPane('eclipse-shadow')) {
      // One of the highest eclipse panes: real-time shadow fills (penumbra
      // gradient, iso-mag rings, umbra polygon) sit above the cached contact
      // curves so the live shadow wash is never buried under the historical path.
      map.createPane('eclipse-shadow');
      map.getPane('eclipse-shadow').style.zIndex = 629;
      map.getPane('eclipse-shadow').style.pointerEvents = 'none';
    }
    if (!map.getPane('eclipse-curves')) {
      map.createPane('eclipse-curves');
      map.getPane('eclipse-curves').style.zIndex = 628; // above twilight-mask(612) + coord grids
      // Curves are added with interactive:false; keep the pane itself click-
      // through too (it floats above grids/UI) so it never steals pointer events.
      map.getPane('eclipse-curves').style.pointerEvents = 'none';
    }
    if (!map.getPane('eclipse-curves-halo')) {
      // Underlay pane for curve casings + the umbral band wash: one z below the
      // strokes so every halo/fill stays beneath every colored line.
      map.createPane('eclipse-curves-halo');
      map.getPane('eclipse-curves-halo').style.zIndex = 627;
      map.getPane('eclipse-curves-halo').style.pointerEvents = 'none';
    }
    if (!map.getPane('eclipse-markers')) {
      // Point markers (greatest-eclipse ✶) must sit above shadow fills and curve strokes.
      map.createPane('eclipse-markers');
      map.getPane('eclipse-markers').style.zIndex = 630;
      map.getPane('eclipse-markers').style.pointerEvents = 'none';
    }
    if (!map.getPane('eclipse-labels')) {
      // Text labels (iso-mag contour values, edge labels) must sit above every line
      // type and point marker so they are never painted over by geometry added later
      // in the same pane. Pane z=631 beats eclipse-markers(630) and eclipse-curves(629).
      map.createPane('eclipse-labels');
      map.getPane('eclipse-labels').style.zIndex = 631;
      map.getPane('eclipse-labels').style.pointerEvents = 'none';
    }

    const soloLayer = L.layerGroup();
    const curvesLayer = L.layerGroup().addTo(map); // contact curves of selected event

    // Currently-selected event, kept so moveend/zoomend can re-draw its contact
    // curves with viewport-restricted world-copies. _lastCurveWrapsKey short-
    // circuits redraws when the visible viewport hasn't changed enough to alter
    // the drawn wrap set (intra-wrap pans cost 0).
    let _selectedEvent = null;
    let _lastCurveWrapsKey = '';

    function redrawSelectedCurves(force) {
      if (!_selectedEvent) return;
      const key = curveWrapsKey(map);
      if (!force && key === _lastCurveWrapsKey) return;
      _lastCurveWrapsKey = key;
      drawContactCurves(_selectedEvent, curvesLayer);
    }

    // Ephemeral per-tick group: solar shadow circles + the lunar visibility veil
    // (filled moon-up hemisphere, milky→red by Eclipse.lunarRedness) and its
    // dashed edge. Both are rebuilt each TimeState tick.
    let _shadowGroup = null;
    let _lastShadowKey = null; // (instant|zEff|wraps) gate for the zoom-reuse skip

    // Sun/Moon disk textures at their sub-points (js/body-markers.js). Own group
    // so it lives independently of _shadowGroup's solar/zoom gate — the disks must
    // repaint on BOTH time and zoom (their px size follows zoom), for solar AND
    // lunar events alike. Markers land in the eclipse-markers pane (z 630), above
    // the shadow band, so paint order is fine regardless of layer-add order.
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
      // Rebuild the cheap vector overlay each tick (solar shadow circles only).
      if (!_shadowGroup) _shadowGroup = L.layerGroup().addTo(layer);

      const date = TimeState.current;
      const solar = findActiveSolar(date);

      // Zoom-reuse gate. For an active solar eclipse drawn by the Bessel renderer
      // the whole shadow geometry is a pure function of (instant, zEff) — past
      // Z_CAP the densify density and umbra seed azimuth count are frozen, so a
      // zoomend that changes neither the instant nor zEff (e.g. 9→10→…→13) would
      // rebuild the same field-cached densify + projection for no visible change.
      // Skip it and let Leaflet reproject the few existing paths for free.
      // curveWrapsKey guards a redraw revealing a new world-copy. _lastShadowKey is
      // cleared on layer remove and whenever a non-Bessel / no-eclipse path runs.
      const _zEff = Math.min(map.getZoom(), Z_CAP);
      const _bessel = solar && typeof BesselRT !== 'undefined' && typeof Astronomy !== 'undefined';
      // The 4th key component is the ephemeris generation (_ephemGen): it advances
      // when an event's NASA elements replace the AE-direct default, so the first
      // (AE) frame's key no longer matches the later NASA frame's and the stale
      // shadow is not pinned — most visibly on the noFly (record-driven) path,
      // which has no flyTo/zoom to invalidate it (1141 km off at -762). Sharing the
      // one counter with _fieldCache keeps both halves of the shadow on the same b.
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
      // Lunar eclipse: real-time visibility hemisphere (Moon above the horizon
      // = where the eclipse is visible right now). Filled as a milky→blood-red
      // veil tinted by the umbral depth (lunarRedness), so the visible region
      // reads at a glance and reddens as totality deepens while the time axis
      // scrubs — with a dashed great-circle edge on top for a crisp boundary.
      const lunar = findActiveLunar(date);
      if (lunar && typeof Astronomy !== 'undefined' && typeof _computeAltitudeContourArcs === 'function') {
        // Geocentric equator-of-date sub-lunar point. Mirror of js/body-markers.js:73
        // bodySubPoint — same EQJ→EQD transform so live veil and disk marker are co-located.
        // Do NOT use Equator(…,ofdate=false,…): that adds ~1° topocentric parallax via Observer.
        const _t = Astronomy.MakeTime(date);
        const _v = Astronomy.RotateVector(
          Astronomy.Rotation_EQJ_EQD(_t),
          EphemCorrect.correct(Astronomy.GeoVector(Astronomy.Body.Moon, _t, true), Astronomy.Body.Moon, date)
        );
        const _d = Math.hypot(_v.x, _v.y, _v.z);
        const gast = Astronomy.SiderealTime(_t) * 15;
        const subLat = (Math.asin(_v.z / _d) * 180) / Math.PI;
        const subLng = (((Math.atan2(_v.y, _v.x) * 180) / Math.PI - gast + 540) % 360) - 180;
        // Visibility hemisphere = where the Moon is above the horizon = small
        // circle of radius 90−1.78 = 88.22° around the SUB-lunar point (Moon alt
        // ≥ 1.78°, a display tolerance for parallax/refraction/semidiameter).
        // Same machinery as drawLunarContactCurves — both cap on the sub-lunar
        // point, NOT its antipode (the sub-solar / daytime hemisphere).
        // Fill first so the dashed edge below stays on top. lunarRedness is 0 in
        // penumbral / pre-umbral phases → pure milky base (a pale but visible cap
        // since baseAlpha stays > 0); ramps to 1 (blood red) through totality.
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

    // Deselect entry point (panel close): drop the live footprint layer, whose
    // 'remove' hook already tears down the selected curves + unlocks the range.
    // Kept separate from clearSelection to avoid a removeLayer→'remove'→
    // clearSelection self-recursion; falls back to a bare clear if it's already off.
    function deselect() {
      if (map.hasLayer(soloLayer)) map.removeLayer(soloLayer);
      else clearSelection();
    }

    // Solar contact curves live in per-event JSON files (data/eclipses/
    // events/<date>.json) to keep the master index small. Fetched on demand;
    // cache:'no-cache' ensures the browser revalidates (304 if unchanged)
    // so rebuilds are picked up without a hard refresh.
    function loadCurvesFor(event) {
      if (!event._curves_url) {
        return Promise.resolve(event.contactCurves || null);
      }
      // Memoize the PROMISE on the event, not just its result. Selecting an event
      // calls this from two places in the same tick — selectEvent for the curves and
      // drawBands' bandRingsFor for the band envelope — and a result-only memo is
      // still empty while the first fetch is in flight, so the file was fetched twice.
      if (event._curvesPromise) return event._curvesPromise;
      const url = `data/eclipses/${event._curves_url}`;
      event._curvesPromise = fetch(url, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          // Adopt the elements the curves were actually built from. Without this
          // the live shadow stays on the AE-direct path, whose Moon carries no
          // secular-acceleration correction and so drifts visibly from the
          // 5MCSE-derived path it is drawn over. This fetch resolves AFTER the
          // first post-selection redraw (the 'add' hook and the lockRange
          // subscriber both fire synchronously in selectEvent), so that first frame
          // is legitimately AE-direct; assigning besselPolys and forcing one redraw
          // swaps it the moment the elements land. The event file is the authority,
          // so assign unconditionally — no stale value can win.
          if (data && data.bessel) {
            besselPolys[event.date] = data.bessel;
            _ephemGen++; // sole besselPolys write; advance the generation so every
            // element-derived memo (_fieldCache / _slcCache / _nvCache
            // / _lastShadowKey) misses its pre-NASA (AE) entry.
            // _ephemGen just advanced, so this redraw's gate key differs and is not
            // short-circuited; it repaints the umbra AND the dashed iso-lines on NASA
            // elements even on the noFly path, which has no flyTo/zoom otherwise.
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
      // Adopt (or clear) this event's astronomy-engine correction before anything
      // reads a position. Events from -1999 on carry none and this switches it
      // off, so the 97 % of the atlas that never needed it is untouched.
      EphemCorrect.setEvent(e);
      // Greatest eclipse on the SAME axis the scrubber ticks and the contact
      // table use (peakLocal for solar, falling back to the geocentric peak) —
      // this is what the ±slider anchors on, so the read-out lands exactly on
      // the G tick instead of a hair off it.
      const peakTime = isSolar ? (e.peakLocal && e.peakLocal.peak) || e.peak.time : e.times.peak;
      // Timeline window = classical local first/last contact so its ends coincide
      // with the P1/P4 (first contact/fourth contact) ticks the scrubber draws (ev-scrub.js reads the
      // SAME peakLocal.c1/c4). Solar e.p1/e.p4 are the GEOCENTRIC outer penumbral
      // contacts (penumbra first touches / last leaves Earth anywhere) — wider than
      // the local partial span, which left the P1/P4 ticks inset from the axis ends.
      // Lunar times.p1/p4 (penumbra begin/end) are already the local values the ticks use.
      // Fall back to geocentric p1/p4 for legacy index entries lacking peakLocal.
      const p1Iso = isSolar ? (e.peakLocal && e.peakLocal.c1) || e.p1 : e.times && e.times.p1;
      const p4Iso = isSolar ? (e.peakLocal && e.peakLocal.c4) || e.p4 : e.times && e.times.p4;
      if (p1Iso && p4Iso && TimeState.lockRange) {
        TimeState.lockRange(new Date(p1Iso), new Date(p4Iso), new Date(peakTime));
      } else {
        TimeState.resetTo(new Date(peakTime));
      }
      // Live footprint tracks selection: bring the real-time umbra/visibility
      // layer onto the map (its 'add' hook redraws the shadow at the time just
      // locked above). Idempotent when stepping between already-selected events.
      if (!map.hasLayer(soloLayer)) soloLayer.addTo(map);
      // For solar events, fetch the per-event curves file before rendering.
      if (isSolar) {
        loadCurvesFor(e).then((cc) => {
          // Splice fetched curves in, then render.
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
        // noFly: keep the view put (record-driven selection from the atlas should
        // not jump to the greatest-eclipse point). Time baseline + curves + sidebar
        // still update below.
        if (!noFly) {
          // Always fly, even when the peak is off the current view — flyTo eases
          // over any distance, and a silent no-op (the old in-bounds-only gate)
          // reads as "selecting did nothing" from the caller's side.
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

    // Re-render the shadow after a zoom so the umbra/antumbra ring picks the
    // zoom-appropriate azimuth count (keeps it smooth when zoomed in, cheap when
    // zoomed out). Only the real-time solar shadow is zoom-resolution-dependent.
    // Also force a contact-curve redraw: zoom changes both the visible wrap set
    // and the per-vertex reprojection cost, so always rebuild (the moveend that
    // follows a zoom gesture then short-circuits on the now-matching wrap key).
    map.on('zoomend', () => {
      if (_loaded && map.hasLayer(soloLayer) && findActiveSolar(TimeState.current)) {
        redrawShadow(soloLayer);
      }
      // Disk textures scale with zoom (footprintPx ∝ 2^zoom), so they must rebuild
      // on every zoom — unconditionally, for lunar events too (the shadow rebuild
      // above is solar-only).
      if (_loaded && map.hasLayer(soloLayer)) redrawBodies();
      if (_loaded) redrawSelectedCurves(true);
    });

    // Pan: re-draw the selected event's contact curves so curves appear in the
    // world-copies that just scrolled into view (and drop those that left).
    // Gated by the wrap-key short-circuit so intra-wrap pans pay 0 cost.
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

    // Expose the totality/annularity band rings for an arbitrary event so the
    // atlas can draw a multi-event band overlay (its own interactive layer).
    // Pure read of the cached curve file + the same buildEnvelopeRings QC gate
    // the single-event fill uses — no geometry recomputation.
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
