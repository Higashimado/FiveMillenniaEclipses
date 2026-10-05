# data

## Conventions

- Encoding: UTF-8.
- Years: astronomical numbering.
- Dates: extended ISO 8601, proleptic Gregorian calendar; years outside 0000–9999 take a sign and six digits.
- Keys and enumerated values: English `snake_case`, except in `eclipses/`, which keeps the upstream `camelCase`.
- Multilingual values: objects keyed by BCP-47 tag (`zh-Hans`, `zh-Hant`, `en`, `fr`, `es`, `it`, `ja`).
- `.jsonl`: one JSON object per line, no enclosing array.
- `.json` under `records/` and `concordance/`: a JSON object whose first key is `_meta`, a header describing the file; the data follows under the key or keys named in each directory's README. `_meta` carries `title`, `scope` and `count`, and where applicable `fields` (field definitions), `provenance`, `license` and `updated`.

## Directories

| Path | Content | Format | Read by |
|---|---|---|---|
| [`records/`](records/) | Historical records, source catalogue, file index, local visibility | [`records/README.md`](records/README.md) | [`js/atlas.js`](../js/atlas.js) |
| [`concordance/`](concordance/) | Lookup tables: star names, era names, places, civilizations, regions, organizations, calendars, persons, terms, celestial bodies | [`concordance/README.md`](concordance/README.md) | [`js/atlas.js`](../js/atlas.js), [`js/place-name.js`](../js/place-name.js), [`js/seal.js`](../js/seal.js), [`js/notes.js`](../js/notes.js), [`js/supplied.js`](../js/supplied.js) |
| [`eclipses/`](eclipses/) | Solar and lunar eclipse catalogue, per-event contact curves, Besselian elements | [`eclipses/README.md`](eclipses/README.md) | [`js/eclipse-loader.js`](../js/eclipse-loader.js), [`js/eclipse.js`](../js/eclipse.js) |
| [`i18n/`](i18n/) | Interface strings | Below | [`js/i18n.js`](../js/i18n.js) |

## i18n/

| File | Content | Format | Read by |
|---|---|---|---|
| [`manifest.json`](i18n/manifest.json) | Supported locales and the fallback locale | JSON object: `locales` (array of BCP-47 tags), `fallback` (one tag) | Not read by the page |
| `<locale>/ui.json` | Interface strings for one locale | Flat JSON object from string key to text; the seven files have identical key sets, except the keys scoped to one writing system | [`js/i18n.js`](../js/i18n.js) |
