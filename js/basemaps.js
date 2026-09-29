/** basemaps.js — the light base tile layers and the topbar layer switcher.
 *
 * Drives the topbar layer <select> (#layer-select in index.html) through selectBase(),
 * which owns the whole swap: layers switch programmatically with no on-map
 * L.control.layers, so Leaflet's `baselayerchange` never fires.
 *
 * Default is OpenHistoricalMap, a TIME-AWARE VECTOR basemap (MapLibre GL) sliced to the
 * timeline's year; falls back to Carto Positron until the MapLibre stack arrives.
 *
 * Public API: Basemaps.init(map) -> { selectBase, chooseBase, getBase, getPick }
 */

const Basemaps = (() => {
  'use strict';

  // OpenHistoricalMap "main" MapLibre style (site-hosted; tiles CC0).
  const OHM_STYLE = 'https://www.openhistoricalmap.org/map-styles/main/main.json';

  const ATTR_OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const ATTR_CARTO = ATTR_OSM + ' © <a href="https://carto.com/">CARTO</a>';

  // Carto's raster basemaps are keyed and served from ONE host, so `{s}` must not
  // appear in these URLs — there are no sharded subdomains to fill it. This is a
  // client-side key, meant to ship in the page like every web-map tile key does.
  const CARTO_KEY = 'cb1_29kp_1_aeab4d954a96fb23556da6bb';
  const _carto = (style) => 'https://basemaps.cartocdn.com/' + style + '/{z}/{x}/{y}{r}.png?key=' + CARTO_KEY;

  // OHM's dataset is its own CC0-licensed fork, independently edited since the
  // split — it doesn't track upstream OSM copyright, so crediting OSM alongside
  // it would be misleading; OHM's own contributors are the correct credit.
  const ATTR_OHM = '<a href="https://www.openhistoricalmap.org/">OpenHistoricalMap</a> contributors (CC0)';
  const ATTR_ESRI_RELIEF = 'Tiles © <a href="https://www.esri.com/">Esri</a> | Source: Esri, USGS';

  // ---- OHM time-slice filtering ----
  // filterByDate(date) hides features whose start/end decdate don't bracket the date.
  // Authoritative clock: TimeState.current with an event selected, else the needle's year.
  let _dateDebounce = null;
  let _lastOhmDate = null;

  function _currentDate() {
    const sel = window.EclipseLoader && EclipseLoader.selected && EclipseLoader.selected();
    if (!sel && window.Atlas && Atlas.focusYear) {
      // Build the instant by mutating an epoch Date: Date.UTC(y, …) remaps years
      // 0–99 into 1900–1999, which would silently misdate a third of the atlas.
      // Mid-year, so the slice never straddles a year boundary.
      const d = new Date(0);
      d.setUTCFullYear(Atlas.focusYear(), 6, 1);
      return d;
    }
    return typeof TimeState !== 'undefined' && TimeState ? TimeState.current : null;
  }

  // Apply the current timeline date to one GL map; no-op if the plugin didn't load
  // or the date is unavailable. Idempotence is load-bearing: filterByDate walks
  // every style layer, while this fires on every marker redraw and needle drag.
  function _applyOhmDate(gl) {
    if (!gl || typeof gl.filterByDate !== 'function') return;
    const d = _currentDate();
    if (!d) return;
    const stamp = d.getTime();
    if (stamp === _lastOhmDate) return;
    try {
      gl.filterByDate(d);
    } catch (e) {
      // Stamp ONLY on success — a throw (style layers not queryable yet) must stay
      // retryable, or the failure latches for the session, drawing every OHM period at once.
      return;
    }
    _lastOhmDate = stamp;
  }

  // Grab OHM's inner GL map and apply the current date once its style is loaded.
  // Never re-apply on `styledata`: filterByDate's own setFilter() calls re-fire it
  // on every layer, so a styledata listener would loop.
  function _bindOhmDate(ohm) {
    const gl = ohm && ohm.getMaplibreMap && ohm.getMaplibreMap();
    if (!gl) return;

    // This is the fresh-GL-map entry point, and a fresh map carries no filters —
    // so the idempotence stamp has to be dropped here or the re-added layer would
    // be skipped as "already at that date" and render unsliced.
    _lastOhmDate = null;
    if (gl.isStyleLoaded && gl.isStyleLoaded()) {
      _applyOhmDate(gl);
    } else {
      gl.once('style.load', () => _applyOhmDate(gl));
    }

    // Second, later shot at the same slice: `idle` follows the first complete
    // render, when the layer list is certainly queryable. The stamp makes this
    // free once style.load already succeeded.
    if (gl.once) gl.once('idle', () => _applyOhmDate(gl));
  }

  // Report GL trouble; never act on it. MapLibre funnels every severity down one
  // `error` channel, so a fatal style-load failure arrives the same as a routine
  // 404'd tile/glyph. A per-GL-map latch tells them apart by style-load timing.
  function _logGlErrors(gl) {
    let styleUp = !!(gl.isStyleLoaded && gl.isStyleLoaded());
    if (gl.once) gl.once('style.load', () => (styleUp = true));
    gl.on('error', (e) => {
      const err = (e && e.error) || e;
      if (styleUp) {
        console.debug('[Basemaps] OHM tile/glyph error (ignored):', err);
      } else {
        console.warn('[Basemaps] OpenHistoricalMap style failed to load; the base may render blank:', err);
      }
    });
  }

  // ---- Chrome-skin axis ----
  // The three LIGHT skins (song / azurite / sutra) are selected via body[data-skin],
  // persisted to localStorage. No page control calls this; switch via Basemaps.setSkin().
  const SKINS = ['song', 'azurite', 'sutra'];
  const SKIN_KEY = 'fme.skin';

  function setSkin(name) {
    const skin = SKINS.indexOf(name) >= 0 ? name : 'song';
    document.body.dataset.skin = skin;
    try {
      localStorage.setItem(SKIN_KEY, skin);
    } catch (e) {
      /* private mode */
    }
    return skin;
  }

  function initSkin() {
    let saved = 'song';
    try {
      saved = localStorage.getItem(SKIN_KEY) || 'song';
    } catch (e) {
      /* ignore */
    }
    return setSkin(saved);
  }

  function _raster(url, opts) {
    return L.tileLayer(url, opts);
  }

  // OHM vector basemap via MapLibre GL. Returns null if the MapLibre stack
  // didn't load (CDN blocked / unsupported) — caller drops it and defaults to
  // Carto Positron.
  function _ohm() {
    if (typeof L.maplibreGL !== 'function' || typeof window.maplibregl === 'undefined') return null;
    let layer;
    try {
      layer = L.maplibreGL({ style: OHM_STYLE, attribution: ATTR_OHM });
    } catch (e) {
      console.warn('[Basemaps] OHM layer construct failed:', e);
      return null;
    }
    layer.__ohm = true;

    // leaflet-maplibre-gl overrides getAttribution() to return '' (it expects the GL
    // style to carry per-source attribution, which OHM's does not). Force the plain-
    // options path — attribution visibility is a license requirement.
    layer.getAttribution = function () {
      return this.options.attribution || '';
    };
    return layer;
  }

  function init(map) {
    initSkin(); // restore/default skin before any skin-coloured draw

    const positron = _raster(_carto('light_all'), {
      maxZoom: 20,
      attribution: ATTR_CARTO,
    });
    const voyager = _raster(_carto('rastertiles/voyager'), {
      maxZoom: 20,
      attribution: ATTR_CARTO,
    });
    const osm = _raster('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: ATTR_OSM,
    });

    // Esri's tile URL is {z}/{y}/{x} (ArcGIS row/col order), the reverse of OSM's
    // {z}/{x}/{y} — swapping them fails silently, with no console error. maxNativeZoom
    // lets Leaflet upsample past native resolution instead of requesting nonexistent zooms.
    const esriRelief = _raster(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
      { maxNativeZoom: 13, maxZoom: 19, attribution: ATTR_ESRI_RELIEF }
    );

    // App boot must never depend on the MapLibre stack having landed. OHM is probed
    // here and, if missing, registered later by the poll at the foot of this function;
    // `ohm` is a `let` so the selectBase closure sees it once it arrives.
    let ohm = _ohm();
    let userChoseBase = false;

    // The id the reader (or a restored permalink) explicitly asked for, as opposed
    // to whatever is on screen — only an explicit pick belongs in a shareable URL.
    let pickedBase = null;

    // Ordered base list [{id,label,layer}]. OHM first (preferred default) when already
    // available. The switcher is #layer-select in the topbar (index.html), not an
    // on-map Leaflet control, so nothing here depends on baselayerchange.
    const bases = [];
    if (ohm) bases.push({ id: 'ohm', label: 'OpenHistoricalMap', layer: ohm });
    bases.push({ id: 'positron', label: 'Carto Positron', layer: positron });
    bases.push({ id: 'voyager', label: 'Carto Voyager', layer: voyager });
    bases.push({ id: 'osm', label: 'OpenStreetMap', layer: osm });
    bases.push({ id: 'esri-relief', label: 'Esri Shaded Relief', layer: esriRelief });
    const _byId = (id) => bases.find((b) => b.id === id);

    let currentBase = null;

    // Switch base layer programmatically. Leaflet fires `baselayerchange` only
    // from a layers-control input; we have no such control, so this owns the
    // whole swap itself (no separate side-effect replication needed).
    function selectBase(id) {
      const b = _byId(id);
      if (!b) return;
      if (currentBase && currentBase.layer !== b.layer && map.hasLayer(currentBase.layer))
        map.removeLayer(currentBase.layer);
      currentBase = b;
      if (!map.hasLayer(b.layer)) b.layer.addTo(map);
      if (ohm && b.layer === ohm) _bindOhmDate(ohm); // OHM GL map is rebuilt on re-add
      _syncSelect();
    }

    // Explicit base pick (topbar switcher OR a restored permalink). Resolve the id
    // BEFORE setting the guard: a stale or mistyped base= must not latch userChoseBase,
    // or late-OHM promotion is suppressed for a base that does not exist.
    function chooseBase(id) {
      if (!_byId(id)) return;
      userChoseBase = true;
      pickedBase = id;
      selectBase(id);

      // Nothing else writes the URL on a base switch — Permalink watches only
      // moveend/zoomend and the clocks, so without this the pick lands in the
      // address bar only after the reader happens to pan.
      if (window.Permalink && Permalink.touch) Permalink.touch();
    }

    // Topbar <select>: populated + kept in sync here. Basemaps.init runs before
    // UI.init and OHM registers late, so this file owns the select's lifecycle.
    let _selWired = false;
    function populateLayerSelect() {
      const sel = document.getElementById('layer-select');
      if (!sel) return;
      sel.innerHTML = '';
      bases.forEach((b) => {
        const o = document.createElement('option');
        o.value = b.id;
        o.textContent = b.label;
        if (currentBase && b.id === currentBase.id) o.selected = true;
        sel.appendChild(o);
      });
      if (!_selWired) {
        sel.addEventListener('change', () => chooseBase(sel.value));
        _selWired = true;
      }
    }

    function _syncSelect() {
      const sel = document.getElementById('layer-select');
      if (sel && currentBase) sel.value = currentBase.id;
    }

    // Wire the OHM runtime (GL error logging + timeline date filtering) — factored
    // out so it serves both a synchronously-ready OHM and one promoted late.
    function _wireOhmRuntime(layer) {
      // Bind on the layer's own `add`, not map.whenReady: the map is already ready
      // by the time init runs, so whenReady fires before this layer is ever added,
      // and getMaplibreMap() would hand back nothing.
      const onAdd = () => {
        try {
          const gl = layer.getMaplibreMap && layer.getMaplibreMap();
          if (gl && gl.on) _logGlErrors(gl);
        } catch (e) {
          /* ignore — a GL map we cannot reach reports nothing, and draws nothing */
        }
        _bindOhmDate(layer); // initial time-slice filter
      };
      layer.on('add', onAdd);
      if (map.hasLayer(layer)) onAdd();

      // Re-filter when either clock moves. Debounced — the scrubber and needle drag
      // both fire fast, and filterByDate walks every style layer. One shared debounce:
      // _currentDate re-reads the authoritative clock at fire time.
      const scheduleDate = () => {
        if (!map.hasLayer(layer)) return;
        if (_dateDebounce) clearTimeout(_dateDebounce);
        _dateDebounce = setTimeout(() => {
          _applyOhmDate(layer.getMaplibreMap && layer.getMaplibreMap());
        }, 180);
      };
      if (typeof TimeState !== 'undefined' && TimeState.subscribe) TimeState.subscribe(scheduleDate);
      if (window.Atlas && Atlas.subscribeFocus) Atlas.subscribeFocus(scheduleDate);
    }

    if (ohm) _wireOhmRuntime(ohm);

    // Default: OHM if it loaded synchronously, else Positron. Always a working base.
    selectBase(ohm ? 'ohm' : 'positron');
    populateLayerSelect();

    // Late registration: the async MapLibre stack wasn't ready at init. Poll for it
    // (bounded), then add OHM to the switcher and, unless the reader already chose
    // a base, promote it to the default.
    if (!ohm) {
      let tries = 0;
      const timer = setInterval(() => {
        const late = _ohm();
        if (late) {
          clearInterval(timer);
          ohm = late; // close over for selectBase
          bases.unshift({ id: 'ohm', label: 'OpenHistoricalMap', layer: ohm });
          _wireOhmRuntime(ohm);
          if (!userChoseBase) selectBase('ohm');
          populateLayerSelect();
        } else if (++tries >= 100) {
          // ~15s: give up, stay on Carto
          clearInterval(timer);
        }
      }, 150);
    }

    // getBase() → the base id on screen ('ohm'|'positron'|'voyager'|'osm'|'esri-relief');
    // getPick() → the id someone explicitly asked for, else null. chooseBase() for
    // permalink restore (see above). Exposed to window.BasemapsCtl in map-boot.
    return {
      selectBase,
      chooseBase,
      getBase: () => currentBase && currentBase.id,
      getPick: () => pickedBase,
    };
  }

  return { init, setSkin, getSkin: () => document.body.dataset.skin || 'song', SKINS };
})();
window.Basemaps = Basemaps;
