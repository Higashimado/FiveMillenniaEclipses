/**
 * place-name.js — offline two-tier reverse geocode for the observation popup.
 *
 * A clicked map point is named, never left as bare coordinates: tier 1 (site) is the
 * nearest historical observation site within SITE_KM, e.g. 长安 (Chang'an); tier 2
 * (region) is otherwise the nearest broad geographic-region anchor. Sites come from
 * data/concordance/gazetteer.json, regions from data/concordance/regions.json,
 * both injected via PlaceName.load; before that, lookup falls back to coordinates.
 *
 * Co-located sites (e.g. 大都↔京师 = Dadu/Beijing) and renamed regions carry
 * since/until so a lookup resolves the era-correct name by the event's year.
 */
window.PlaceName = (function () {
  'use strict';

  // Populated by load(); empty until then (lookup then falls back to coordinates).
  let _sites = []; // { lat, lon, name:{…}, modern?:{…}, since?, until? }
  let _regions = []; // { lat, lon, name:{…}, since?, before?:{ name:{…} } }

  /**
   * Inject the loaded concordances. `sitesPlaces` is gazetteer.json's `.places` map
   * (place_key -> block), flattened to a plain array here; `regions` is
   * regions.json's `.anchors` array.
   */
  function load(sitesPlaces, regions) {
    _sites = Object.keys(sitesPlaces || {}).map((k) => sitesPlaces[k]);
    _regions = Array.isArray(regions) ? regions : [];
  }

  const SITE_KM = 90; // within this of a site: exact match; else region fallback
  const CO_KM = 5; // co-located sites (same spot, different era) within this
  const RAD = Math.PI / 180;

  // 2R, the haversine constant, spelled once: the formula below ends in 2·R·asin(…).
  const EARTH_DIAM_KM = 12742;

  // Great-circle distance in km, haversine formula.
  function gcKm(aLat, aLng, bLat, bLng) {
    const dLat = (bLat - aLat) * RAD,
      dLng = (bLng - aLng) * RAD;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2;
    return EARTH_DIAM_KM * Math.asin(Math.min(1, Math.sqrt(s)));
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

  // A region anchor renamed at `since` carries the earlier geographic name under
  // `before` (e.g. 巴西 = Brazil reads "Eastern South America" before 1500). Anchors
  // with no `since` are timeless and always use `name`.
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
        // pickDistinct, not pick: a locale in which the place was never renamed
        // resolves `modern` back to the historical name, and the caller would then
        // print the name twice.
        modern: I18n.pickDistinct(site.e.modern, site.e.name, loc),
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
