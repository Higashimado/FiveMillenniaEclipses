# records

## Files

| File | Content | Read by |
|---|---|---|
| [`schema.json`](schema.json) | JSON Schema 2020-12 for one record; `additionalProperties: false` | Not read by the page |
| [`manifest.json`](manifest.json) | Index of the record files | [`js/atlas.js`](../../js/atlas.js) |
| [`sources.json`](sources.json) | Catalogue of the works and observers that records cite | [`js/atlas.js`](../../js/atlas.js) |
| [`visibility.json`](visibility.json) | Computed local visibility of each solar and lunar eclipse record | [`js/atlas.js`](../../js/atlas.js) |
| `<phenomenon>/<civilization>.jsonl` | Records | [`js/atlas.js`](../../js/atlas.js) |

`<phenomenon>` is one of `solar`, `lunar`, `appulse`, `conjunction`, `guest`, `comet`. `<civilization>` is a key of [`civilizations.json`](../concordance/civilizations.json).

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
| `supplied` token `era=<key>` | an entry of [`eras.json`](../concordance/eras.json) |
| `supplied` token `year=N`, `month=N` | written by `ordinal()` in [`js/supplied.js`](../../js/supplied.js) |
| `supplied` token `subject=<token>` | an entry of [`bodies.json`](../concordance/bodies.json) carrying that `token` |

A record's coordinates are those of its `place.key` in the gazetteer. Every gazetteer entry is a settlement. A record whose text names a commandery, province or kingdom is filed at that region's seat in the period of the record and carries `place.basis: "region"`.

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
| `title` | Titles by language: `zh-Hans` and `zh-Hant` as a pair, `rom` (romanisation or Latin-script title), `en` (English title), and `ja`, `fr`, `es`, `it` only for an edition that a note names; omitted for an observer or a source cited by its author alone |
| `form` | How a note sets the title it cites: `book` (default), `part`, `article`, `edition` or `cite` (printed as `edition`); written only on an entry a note cites |
| `author` | Array of `{name, rom, role, dates, kind, et_al}`; `role` is `comp` (compiler), `ed` (editor), `trans` (translator), `annot` (annotator), `obs` (observer) or `attr` (traditionally attributed author); `kind: "group"` marks an institution or collective |
| `attribution` | Statement of responsibility other than transmission |
| `year` | Date of composition as printed |
| `genre` | Class of the source, omitted on an entry that only a note cites; values and grouping in `_meta.fields` |
| `editions` | Array of editions, exactly one of which has `consulted: true`; omitted when no edition is recorded |

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

`records` is an object keyed by `record_id`, with one row per record under `solar/` and `lunar/` whose event was not plainly visible; a record without a row was visible. Row fields are defined in `_meta.fields`. `bucket` thresholds:

| `bucket` | Condition |
|---|---|
| `low-sun` | Solar: `local_mag` ≥ 0.03 and `sun_alt` < 3° |
| `grazing` | Solar: 0.005 ≤ `local_mag` < 0.03 |
| `night` | Solar: `local_mag` < 0.005 and `geom_mag` ≥ 0.005 |
| `no-reach` | Solar: `geom_mag` < 0.005 |
| `horizon` | Lunar: −5° ≤ `max_alt` < 2° |
| `deep` | Lunar: `max_alt` < −5° |
| `untested` | No verdict; reason in `why` |

The table is derived from [`data/eclipses/`](../eclipses/) and the gazetteer coordinates, and is independent of the record field `source_claim`.

## supplied

A `year` token (1 to 99) and a `month` token (1 to 12, and `i1` to `i12` for an intercalary month) expand through `ordinal()` of [`js/supplied.js`](../../js/supplied.js), which prints the ordinal of each locale: 元年 and 正月 for the first, `first year`, `1ʳᵉ année` but `1ᵉʳ mois`, `1.er año` and `3.er año` before the masculine noun, `1º anno`; an intercalary month adds 闰/閏, `intercalary`, `intercalaire`, `intercalar`, `intercalare`. A `subject` token expands through the bodies of [`bodies.json`](../concordance/bodies.json). A record's `supplied` array lists the words its translations add where the source leaves them to its context. A word printed in the usual form is a token: `era=hongwu` (an entry of `eras.json`), `year=23`, `month=3`, `month=i4` or `subject=moon`; any other span is a written-out unit `{kind, text}` whose `text` gives the exact substring of each locale's translation. A token stands for the span of all seven locales and each must occur in its translation. A subject written in Han is not read after a numeral, `正` (the first month's other name) or `閏` (intercalary), so the Japanese `月` (moon) is not found inside a month name. [`js/supplied.js`](../../js/supplied.js) expands the tokens on the page.
