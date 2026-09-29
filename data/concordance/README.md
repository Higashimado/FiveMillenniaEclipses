# concordance

## Files

| File | Content | Payload | Entries | Read by |
|---|---|---|---:|---|
| [`xingguan.json`](xingguan.json) | Chinese asterisms, lunar mansions, enclosures and named stars; classical planet names | `xingguan`, `planets`: objects keyed by name | 383 + 30 | Not read by the page |
| [`nianhao.json`](nianhao.json) | Chinese reign eras, −139 to 1911, single orthodox line | `eras`: array ordered by `y` | 330 | [`js/atlas.js`](../../js/atlas.js) |
| [`nengo.json`](nengo.json) | Japanese era names, 645 to present, Northern Court line | `eras`: array ordered by `y` | 241 | [`js/atlas.js`](../../js/atlas.js) |
| [`gazetteer.json`](gazetteer.json) | Places referenced by records: coordinates, historical and modern names | `places`: object keyed by `place.key` | 546 | [`js/atlas.js`](../../js/atlas.js), [`js/place-name.js`](../../js/place-name.js) |
| [`civilizations.json`](civilizations.json) | Display names of the `civilization` values | `civs`: object keyed by `civilization` | 33 | [`js/atlas.js`](../../js/atlas.js), [`js/seal.js`](../../js/seal.js) |
| [`regions.json`](regions.json) | Geographic region anchors for places without a gazetteer entry nearby | `anchors`: array | 124 | [`js/atlas.js`](../../js/atlas.js), [`js/place-name.js`](../../js/place-name.js) |
| [`organizations.json`](organizations.json) | News agencies, observatories, academies and societies named by records | `organizations`: object keyed by identifier | 52 | Not read by the page |

Each file starts with `_meta`, a header object that describes the file (see [`data/README.md`](../README.md)); field definitions are in `_meta.fields`, and `nianhao.json` and `nengo.json` add `_meta.line` (the succession followed) and `_meta.yearSpace` (the year numbering). The data follows under the key or keys in the Payload column, one entry per line.

## Lookup

- Years in `y`, `s`, `since`, `until` and `before` are astronomical, including year 0.
- `nianhao`, `nengo`: the era in force in a year is the last entry with `y` not greater than that year. The ordinal year counts from `s` when present, otherwise from `y`. An entry with `gap: true` means no era is in use from that year. A year outside the table's range has no era.
- `xingguan`: keys are simplified-script names; unmatched names are looked up in `alias`. Keys with a parenthesised qualifier name distinct asterisms and are matched whole. `modern` holds the modern identification. `hant` is the traditional-script form; `ja` is `hant` in shinjitai.
- `gazetteer`: `name` holds the historical names by locale, `modern` the modern names where they differ, `aliases` other historical names. Keys sharing coordinates are split by `since` and `until`, which do not overlap. `name.en` is the Latin-script name.
- `regions`: an anchor with `since` or `before` applies only from or before that year.
- `civilizations`: each entry maps the seven locale tags to a display name.
- `organizations`: `latin` is the organization's own name; `abbr` lists printed abbreviations, and an entry with `abbr` carries `provenance`.
