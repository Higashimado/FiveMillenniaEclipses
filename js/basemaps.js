/** basemaps.js — light-first base tile layers + topbar layer switcher (NEW).
 *
 * Builds the basemap group and drives the topbar layer <select> (#layer-select
 * in index.html) via selectBase(). We switch layers programmatically (no on-map
 * L.control.layers), so selectBase() owns the whole swap itself rather than
 * relying on Leaflet's `baselayerchange` event (which only fires from a
 * layers-control input).
 *
 * Default basemap is OpenHistoricalMap — a TIME-AWARE VECTOR basemap (MapLibre
 * GL), bound via maplibre-gl-leaflet (L.maplibreGL). The user asked for
 * "OpenHistoryMap"; openhistorymap.org publishes no clean style URL, whereas the
 * sibling OpenHistoricalMap ships a canonical, CDN-hosted MapLibre style + CC0
 * vector tiles — so we use that. If the MapLibre stack or the style fails to
 * load, OHM is dropped / falls back to Carto Positron so the map is never blank.
 *
 * Public API:
 *   Basemaps.init(map) -> { selectBase, chooseBase, getBase }
 */

const Basemaps = (() => {
  'use strict';

  // OpenHistoricalMap "main" MapLibre style (site-hosted; tiles CC0).
  const OHM_STYLE = 'https://www.openhistoricalmap.org/map-styles/main/main.json';

  const ATTR_OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const ATTR_CARTO = ATTR_OSM + ' © <a href="https://carto.com/">CARTO</a>';
  // OHM's dataset is its own CC0-licensed fork, independently edited since the
  // split — it doesn't track upstream OSM copyright, so crediting OSM alongside
  // it would be misleading; OHM's own contributors are the correct credit.
  const ATTR_OHM = '<a href="https://www.openhistoricalmap.org/">OpenHistoricalMap</a> contributors (CC0)';
  const ATTR_ESRI_RELIEF = 'Tiles © <a href="https://www.esri.com/">Esri</a> | Source: Esri, USGS';

  // ---- OHM time-slice filtering ----
  // OHM's "main" style draws every historical period at once. The
  // maplibre-gl-dates plugin patches maplibregl.Map with filterByDate(date),
  // hiding features whose start_decdate/end_decdate don't bracket the date. We
  // drive it from TimeState.current so the basemap follows the timeline; the
  // plugin accepts a Date object and supports negative (BCE) years directly.
  let _dateDebounce = null;

  function _currentDate() {
    return typeof TimeState !== 'undefined' && TimeState ? TimeState.current : null;
  }

  // Apply the current timeline date to one GL map. No-op (guarded) if the
  // plugin didn't load or the date is unavailable.
  function _applyOhmDate(gl) {
    if (!gl || typeof gl.filterByDate !== 'function') return;
    const d = _currentDate();
    if (!d) return;
    try {
      gl.filterByDate(d);
    } catch (e) {
      /* style not ready / no dated layers */
    }
  }

  // Grab OHM's inner GL map and apply the current date once its style is loaded.
  // NOTE: do NOT re-apply on the `styledata` event — filterByDate() calls
  // setFilter() on every layer, each of which re-fires styledata, so a styledata
  // listener would snap the slice back to TimeState.current and loop. The only
  // setStyle in normal flow is the initial style load (handled here); a basemap
  // re-add builds a fresh GL map and is re-bound via baselayerchange.
  function _bindOhmDate(ohm) {
    const gl = ohm && ohm.getMaplibreMap && ohm.getMaplibreMap();
    if (!gl) return;
    if (gl.isStyleLoaded && gl.isStyleLoaded()) {
      _applyOhmDate(gl);
    } else {
      gl.once('style.load', () => _applyOhmDate(gl));
    }
  }

  // ---- Chrome-skin axis (spec M0) ----
  // The three LIGHT skins (song / azurite / sutra) are selected via
  // body[data-skin] (css/tokens.css) — the only chrome-colour axis FME has (no
  // dark theme). Persisted to localStorage; restored on boot. 'song'
  // (Song-painting light-wash, dan-shese) is the default.
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
    // leaflet-maplibre-gl overrides getAttribution() to return '' (it expects
    // the GL style to carry per-source attribution, which OHM main.json does
    // not), so Leaflet's attribution control never registers the credit. Force
    // the plain-options path — attribution visibility is a license requirement.
    layer.getAttribution = function () {
      return this.options.attribution || '';
    };
    return layer;
  }

  function init(map) {
    initSkin(); // restore/default the chrome skin before any skin-coloured draw

    const positron = _raster('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: ATTR_CARTO,
    });
    const voyager = _raster('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: ATTR_CARTO,
    });
    const osm = _raster('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: ATTR_OSM,
    });
    // Esri's tile URL is {z}/{y}/{x} (ArcGIS row/col order) — the reverse of
    // OSM's {z}/{x}/{y}. Getting this backwards fails silently (wrong or
    // missing tiles, no console error), so it's called out here. maxNativeZoom
    // lets Leaflet upsample the last real tile level past the service's native
    // resolution instead of requesting nonexistent zooms (which paints blank)
    // — this repo's first use of the option.
    const esriRelief = _raster(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
      { maxNativeZoom: 13, maxZoom: 19, attribution: ATTR_ESRI_RELIEF }
    );

    // The MapLibre stack loads `async` (index.html) so a slow/hung jsdelivr can
    // never deadlock app boot. Consequently OHM is usually NOT ready at init —
    // we boot on Carto Positron and register OHM later once the stack finishes.
    // `ohm` is a `let` so the selectBase closure below sees the layer once it
    // arrives. `userChoseBase` guards late promotion: if the user already picked a
    // base from the topbar switcher, we don't yank it away.
    let ohm = _ohm();
    let userChoseBase = false;

    // Ordered base list [{id,label,layer}]. OHM first (preferred default) when
    // already available. The layer switcher now lives in the topbar (index.html
    // #layer-select) rather than an on-map Leaflet control.
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

    // Explicit base pick (user switcher OR a restored permalink). Sets the
    // userChoseBase guard so the late-OHM promotion below never yanks it away.
    function chooseBase(id) {
      userChoseBase = true;
      selectBase(id);
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

    // Wire the OHM runtime (GL-error fallback + timeline date filtering) — factored
    // out so it serves both a synchronously-ready OHM and one promoted late.
    function _wireOhmRuntime(layer) {
      let fellBack = false;
      const fallback = () => {
        if (fellBack) return;
        fellBack = true;
        console.warn('[Basemaps] OpenHistoricalMap failed; fell back to Carto Positron.');
        selectBase('positron');
      };
      map.whenReady(() => {
        try {
          const gl = layer.getMaplibreMap && layer.getMaplibreMap();
          if (gl && gl.on) gl.on('error', fallback);
        } catch (e) {
          /* ignore — fallback also covers construct issues */
        }
        _bindOhmDate(layer); // initial time-slice filter
      });

      // Re-filter when the timeline moves. Debounced — the slider fires fast and
      // filterByDate walks every style layer. Only runs while OHM is shown.
      if (typeof TimeState !== 'undefined' && TimeState.subscribe) {
        TimeState.subscribe(() => {
          if (!map.hasLayer(layer)) return;
          if (_dateDebounce) clearTimeout(_dateDebounce);
          _dateDebounce = setTimeout(() => {
            _applyOhmDate(layer.getMaplibreMap && layer.getMaplibreMap());
          }, 180);
        });
      }
    }

    if (ohm) _wireOhmRuntime(ohm);

    // Default: OHM if it loaded synchronously, else Positron. Always a working base.
    selectBase(ohm ? 'ohm' : 'positron');
    populateLayerSelect();

    // Late registration: the async MapLibre stack wasn't ready at init. Poll for
    // it (bounded), then add OHM to the switcher and — unless the user already
    // chose a base — promote it to the default, honouring OHM-as-preferred while
    // never having blocked the initial render.
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

    // getBase() → current base id ('ohm'|'positron'|'voyager'|'osm'|'esri-relief');
    // chooseBase() for permalink restore (see above). Exposed to window.BasemapsCtl
    // in map-boot.
    return { selectBase, chooseBase, getBase: () => currentBase && currentBase.id };
  }

  return { init, setSkin, getSkin: () => document.body.dataset.skin || 'song', SKINS };
})();
window.Basemaps = Basemaps;
