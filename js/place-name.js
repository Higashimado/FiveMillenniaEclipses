/**
 * place-name.js — offline two-tier reverse geocode for the observation popup.
 *
 * A clicked map point is named, never left as bare coordinates:
 *   tier 1 (site)   — nearest historical observation site within SITE_KM →
 *                     its own name (quezhi, exact-place match), e.g. 长安 / Chang'an.
 *   tier 2 (region) — otherwise the nearest broad geographic-region anchor
 *                     (yuezhi), e.g. 蒙古高原 / 中亚 / 太平洋.
 *
 * Data-driven, not hardcoded: sites come from data/duizhao/diming.json (the same published
 * concordance js/atlas.js resolves records against — injected via PlaceName.load
 * so there is no second fetch); regions come from data/duizhao/quyu.json, an authored
 * nearest-anchor Voronoi partition, coarse by design and refined by adding anchors
 * rather than by drawing borders. Both are loaded once at startup; before load()
 * the lookup falls back to bare coordinates.
 *
 * Temporal validity: co-located sites (大都↔京师 = Beijing, 建康↔应天 = Nanjing,
 * 君士坦丁堡↔伊斯坦布尔) and country-name regions carry since/until so a lookup
 * resolves the era-correct name by the selected event's year (葡人登陆前无「巴西」).
 *
 * Both tables key their names by BCP-47 tag, so locale selection is I18n.pick's
 * job here as everywhere else — this module owns the geometry, not a name ladder.
 */
window.PlaceName = (function () {
  'use strict';

  // Populated by load(); empty until then (lookup then falls back to coordinates).
  let _sites = []; // { lat, lon, name:{…}, modern?:{…}, since?, until? }
  let _regions = []; // { lat, lon, name:{…}, since?, before?:{ name:{…} } }

  /**
   * Inject the loaded concordances. `sitesPlaces` is data/duizhao/diming.json's `.places`
   * map (place_key -> block); `regions` is data/duizhao/quyu.json's `.anchors` array.
   * Atlas already fetches both for its own use, so it passes them in rather than
   * triggering a second network round-trip.
   *
   * Sites arrive keyed by place_key and are flattened to a plain array: every lookup
   * is a nearest-neighbour scan over coordinates, and the key is never consulted.
   */
  function load(sitesPlaces, regions) {
    _sites = Object.keys(sitesPlaces || {}).map((k) => sitesPlaces[k]);
    _regions = Array.isArray(regions) ? regions : [];
  }

  const SITE_KM = 90; // within this of a site → quezhi (exact match); else region yuezhi
  const CO_KM = 5; // co-located sites (same spot, different era) within this
  const RAD = Math.PI / 180;

  // Great-circle distance in km (haversine). Coarse enough for a nearest scan.
  function gcKm(aLat, aLng, bLat, bLng) {
    const dLat = (bLat - aLat) * RAD,
      dLng = (bLng - aLng) * RAD;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(s))); // 2·R·asin, R=6371
  }

  function nearest(list, lat, lng) {
    let best = null,
      bestKm = Infinity;
    for (const e of list) {
      const km = gcKm(lat, lng, e.lat, e.lon);
      if (km < bestKm) {
        bestKm = km;
        best = e;
      }
    }
    return { e: best, km: bestKm };
  }

  // Astronomical-year test for a temporal range [since, until) — either bound may
  // be absent (unbounded). `year` may be null (no event context) → always matches.
  function inRange(year, since, until) {
    if (year == null) return true;
    if (since != null && year < since) return false;
    if (until != null && year >= until) return false;
    return true;
  }

  // Nearest site, then disambiguate co-located era-variants by `year`: among sites
  // within CO_KM of the nearest, prefer the one whose [since, until) contains year.
  function nearestSite(lat, lng, year) {
    const near = nearest(_sites, lat, lng);
    if (!near.e) return near;
    const co = _sites.filter((s) => gcKm(near.e.lat, near.e.lon, s.lat, s.lon) <= CO_KM);
    if (co.length > 1) {
      const hit = co.find((s) => inRange(year, s.since, s.until));
      if (hit) return { e: hit, km: near.km };
    }
    return near;
  }

  // A region anchor renamed at `since` carries the earlier, politically neutral
  // geographic name under `before`; a lookup dated before that epoch must use it
  // (there is no "Brazil" before the Portuguese landfall). Anchors with no `since`
  // are timeless and always use `name`.
  function regionNames(anchor, year) {
    const before = anchor.since != null && year != null && year < anchor.since;
    return (before && anchor.before ? anchor.before.name : anchor.name) || {};
  }

  /**
   * Reverse-geocode a point to a display name, two-tier + offline.
   * @param {number} lat
   * @param {number} lng  −180..180
   * @param {string} [locale]  I18n locale; defaults to the live locale.
   * @param {number} [year]  astronomical year of the observation, for era-correct
   *                         naming of renamed sites/regions; omit for present-day.
   * @returns {{tier:'site'|'region', name:string, modern:string}}
   */
  function lookup(lat, lng, locale, year) {
    const loc = locale || (typeof I18n !== 'undefined' ? I18n.getLocale() : 'en');
    const site = nearestSite(lat, lng, year);
    if (site.e && site.km <= SITE_KM) {
      return {
        tier: 'site',
        name: I18n.pick(site.e.name, loc),
        modern: I18n.pick(site.e.modern, loc),
      };
    }
    const reg = nearest(_regions, lat, lng);
    if (!reg.e) return { tier: 'region', name: '', modern: '' };
    return {
      tier: 'region',
      name: I18n.pick(regionNames(reg.e, year), loc),
      modern: '',
    };
  }

  return { load, lookup };
})();
