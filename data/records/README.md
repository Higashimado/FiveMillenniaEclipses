# records

## Files

| File | Content | Read by |
|---|---|---|
| [`schema.json`](schema.json) | JSON Schema 2020-12 for one record; `additionalProperties: false` | Not read by the page |
| [`manifest.json`](manifest.json) | Index of the record files | [`js/atlas.js`](../../js/atlas.js) |
| [`sources.json`](sources.json) | Catalogue of the works and observers that records cite | [`js/atlas.js`](../../js/atlas.js) |
| [`visibility.json`](visibility.json) | Computed local visibility of each solar and lunar eclipse record | [`js/atlas.js`](../../js/atlas.js) |
| `<phenomenon>/<civilization>.jsonl` | Records | [`js/atlas.js`](../../js/atlas.js) |

`<phenomenon>` is one of `solar`, `lunar`, `occultation`, `conjunction`, `guest`, `comet`. `<civilization>` is a key of [`civilizations.json`](../concordance/civilizations.json).

`manifest.json`, `sources.json` and `visibility.json` each start with `_meta`, a header object that describes the file (see [`data/README.md`](../README.md)); the data follows under the single key named in each section below.

## Record files

- One record per line, validated by `schema.json`. Each field is defined in the `description` string of its entry under `properties` in the schema; required fields are listed under `required`.
- `record_id` is unique across the corpus and does not change once published.
- `text` and `note` are objects keyed by BCP-47 tag. `text_orig` and `translit` are plain strings.
- Enumerated fields take only the values listed in the schema.

Keys that resolve outside the record:

| Field | Resolves to |
|---|---|
| `place.key` | [`gazetteer.json`](../concordance/gazetteer.json) |
| `civilization` | [`civilizations.json`](../concordance/civilizations.json) |
| `source.key` | `sources.json` |

`place.observed_at` in a record overrides the gazetteer coordinates for that record only.

## manifest.json

`_meta.count` gives the number of files and of records. `files` is an array with one object per record file:

| Field | Content |
|---|---|
| `path` | Path of the file, relative to this directory |
| `phenomenon` | The `<phenomenon>` part of `path` |
| `civilization` | The `<civilization>` part of `path` |
| `count` | Number of records in the file |

## sources.json

`sources` is an object keyed by `source.key`. An absent field is omitted, never `null`.

| Field | Content |
|---|---|
| `title` | Titles by language: `zh-Hans` and `zh-Hant` as a pair, `rom` (romanisation), `en` (English title); omitted for an observer |
| `author` | Array of `{name, rom, role, dates, kind, et_al}`; `role` is `comp` (compiler), `ed` (editor), `trans` (translator), `annot` (annotator), `obs` (observer) or `attr` (traditionally attributed author); `kind: "group"` marks an institution or collective |
| `attribution` | Statement of responsibility other than transmission |
| `year` | Date of composition as printed |
| `genre` | Class of the source; values and grouping in `_meta.fields` |
| `editions` | Array of editions, exactly one of which has `consulted: true` |

Edition fields:

| Field | Content |
|---|---|
| `kind` | Kind of edition, below |
| `consulted` | `true` on the edition the records were taken from |
| `by` | Translator, editor or intermediary; required when `kind` is `trans` or `quot` |
| `title` | Title of the edition |
| `year` | Year of the edition |
| `url` | Location of the edition; required when `kind` is `trans` or `quot` |
| `license` | License of the edition's text |
| `locus_url` | URL template for one position in the edition; its placeholders are `source.locus` key names in braces, each substituted percent-encoded |

| `kind` | Edition |
|---|---|
| `orig` | Full text in the original language |
| `crit` | Modern critical edition in the original language |
| `facsim` | Facsimile, rubbing or photographic reproduction |
| `trans` | Translation used in place of the original |
| `quot` | Lost work known only through quotation in another |
| `cite` | Catalogue entry without full text |

`source.locus` in a record gives the position within the consulted edition. Its keys are those listed under `source.locus` in `schema.json`; values are free text in the numbering of that edition.

## visibility.json

`records` is an object keyed by `record_id`, with one row for every record under `solar/` and `lunar/`. Row fields are defined in `_meta.fields`. `bucket` thresholds:

| `bucket` | Condition |
|---|---|
| `visible` | Solar: `local_mag` ≥ 0.03 and `sun_alt` ≥ 3°. Lunar: `max_alt` ≥ 2° |
| `low-sun` | Solar: `local_mag` ≥ 0.03 and `sun_alt` < 3° |
| `grazing` | Solar: 0.005 ≤ `local_mag` < 0.03 |
| `night` | Solar: `local_mag` < 0.005 and `geom_mag` ≥ 0.005 |
| `no-reach` | Solar: `geom_mag` < 0.005 |
| `horizon` | Lunar: −5° ≤ `max_alt` < 2° |
| `deep` | Lunar: `max_alt` < −5° |
| `untested` | No verdict; reason in `why` |

The table is derived from [`data/eclipses/`](../eclipses/) and the gazetteer coordinates, and is independent of the record field `source_claim`.
