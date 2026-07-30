# Attribution & Licenses

This project reuses code and data from several sources. The project's own code is
GPL-3.0 ([`LICENSE`](LICENSE)); `data/records/` and `data/duizhao/` are published
under CC-BY-SA 4.0. Everything below is somebody else's, with its full license
text under [`licenses/`](licenses/).

## Code
- **Eclipse rendering & Besselian geometry** — vendored from **AstroMeteoMap**
  (sibling project): `js/eclipse.js`, `js/bessel-runtime.js`,
  `js/eclipse-glyph.js`, `js/body-markers.js`, `js/time.js`, `js/i18n.js`,
  `css/tokens.css`, `tools/build-bessel-curves.mjs`, `tools/lib/*.mjs`. Upstream
  is the source of truth; re-sync manually when it changes. The shipped comments
  no longer cite upstream file:line positions — those drift as upstream moves,
  and this file is the durable record.

## Artwork
- **Civilization seals** (`js/seal.js`) — 28 emblems drawn as SVG primitives, the
  project's own, except the `french` motif (fleur-de-lis), which is hand-traced
  from a reference photo at heraldic scale — the shape itself (three lily petals
  over a tie-band) is a centuries-old heraldic charge, not anyone's copyrightable
  expression.
- **Comet & guest-star icons** (`img/comet_icon.svg`, `img/supernova_icon.svg`) —
  the project's own, drawn in an engraving style.
- **Sun & Moon disk textures** (`img/{sun,moon}-{large,xlarge}.svg`) — from
  AstroMeteoMap, with the renderer that places them (`js/body-markers.js`).

Internal design notes, handover documents and visual reference material are kept
in `files/`, which is untracked (see `.gitignore`) and is not part of the
published site.
## Third-party code (vendored under `vendor/`)
Full texts in [`licenses/code/`](licenses/code/); each file is named for the
exact version shipped, so a re-vendor that changes terms shows up as a rename.

- **Leaflet** 1.9.4 (BSD-2-Clause) — © Volodymyr Agafonkin.
- **astronomy-engine** 2.1.19 (MIT) — © Don Cross.
- **MapLibre GL JS** 5.24.0 (BSD-3-Clause) + **maplibre-gl-leaflet** 0.1.3 (ISC)
  — vector basemap rendering for the OpenHistoricalMap layer.
- **@openhistoricalmap/maplibre-gl-dates** 1.3.0 (CC0-1.0) — filters the OHM vector
  basemap to the timeline's current date (`filterByDate`). https://github.com/OpenHistoricalMap/maplibre-gl-dates

## Data
- **Eclipse predictions** © Fred Espenak (NASA GSFC) — 5MCSE / 5MCLE catalogs
  (Public Domain + attribution). https://eclipse.gsfc.nasa.gov/
  Those catalogs begin at −1999. Events before it are computed for this atlas
  rather than transcribed — see the next entry — and every such row is marked
  `source: "computed"` with `_curve_source: "DE441-bessel"`.
- **JPL DE441 planetary and lunar ephemeris** (Park, Folkner, Williams & Boggs
  2021), Public Domain. https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/
  Supplies the Sun and Moon positions behind the self-computed −3000…−2000
  segment: its Besselian elements, event detection and per-event
  astronomy-engine correction. Build-time only — the kernel is excerpted locally
  and never committed or served. Read with **jplephem** (MIT) © Brandon Rhodes.
- **Historical eclipse records** — manually curated from public-domain primary
  sources: Assyrian Eponym Canon, Babylonian Astronomical Diaries, Hittite Annals,
  Greek/Latin classical texts (Herodotus, Thucydides, Diodorus, Livy, Bede, etc.),
  Classical Chinese histories (《春秋》《漢書》《後漢書》etc.), Nihon Shoki,
  Samguk Sagi, Ibn Yunus al-Zij al-Hakimi, al-Battani Zij, Dresden Codex.
  English/Chinese translations are the project's own; original-language excerpts
  are public-domain. Academic reference: Stephenson, Morrison & Hohenkerk 2016
  (CC-BY 4.0), DOI 10.1098/rspa.2016.0404; Xu, Pankenier & Jiang 2000
  (East Asian Archaeoastronomy, Routledge); NASA/Espenak 5MCSE/5MCLE catalogs
  (Public Domain). figshare 4290866 ZIP retained for Phase 5 ΔT use only.
- **对照库 `data/duizhao/`** (star-name & reign-era concordances) — published as a
  standalone themed database under **CC-BY-SA 4.0** — full text in
  [`licenses/data/CC-BY-SA-4.0.txt`](licenses/data/CC-BY-SA-4.0.txt), which covers
  `data/records/` on the same terms. The attribution chain is below; the
  per-table field gloss lives in the database's own README, still being written.
  - `xingguan.json` — 星官/宿/恒星 names, 7-locale glosses and modern
    authentications are mechanically extracted from **AstroMeteoMap**
    (sibling project, `data/sky/`), whose upstreams are Wikipedia/Wikidata
    (CC-BY-SA), Stellarium's `constellations.cn` lineage, and HYG/SIMBAD star
    data. CC-BY-SA is inherited from that chain — hence the whole bundle's terms.
    Hand-supplemented entries are marked `src:hand`. The `planets` section is the
    project's own. 藪内清《回回暦》star table (1964) was used for offline
    cross-checking only; **none of its data is included**.
  - `nianhao.json` / `nengo.json` — hand-entered by this project against standard
    Chinese/Japanese chronological tables. Reign dates are facts and not
    copyrightable; the orthodox-single-line selection, field design and data entry
    are the project's own.
- **二十四史 text** © Wikisource contributors (CC-BY-SA 4.0) — *deferred*.
- **Wikidata** (CC0) — *deferred*.
- **Base map tiles** © OpenStreetMap contributors (ODbL), via these providers:
  - **OpenHistoricalMap** (default) — historical, time-aware vector tiles, data
    CC0; rendered from the site-hosted `main` MapLibre style. https://www.openhistoricalmap.org/
  - **CARTO** Positron & Voyager raster basemaps — © CARTO. https://carto.com/
  - **OpenStreetMap** standard raster tiles. https://www.openstreetmap.org/
  - **Esri** World Shaded Relief raster basemap — © Esri, source Esri/USGS.
    https://www.esri.com/
- ΔT model reference: ytliu0/DeltaT (MIT-style) — *deferred*.

Capital/site coordinates in `data/duizhao/diming.json` are bare numbers (not
copyrightable), informed by CHGIS/Pleiades/Stephenson 2018.

## Fonts
Full texts in [`licenses/fonts/`](licenses/fonts/).

- **Source Han Serif 思源宋体** © Adobe (SIL OFL 1.1) — vendored subsetted under
  `css/fonts/`. Subsetting is a permitted modification; the Reserved Font Name
  'Source' is not used in the subset filenames.
  https://github.com/adobe-fonts/source-han-serif
- **Spectral** © The Spectral Project Authors, Production Type (SIL OFL 1.1) —
  vendored subsetted under `css/fonts/`. https://github.com/productiontype/Spectral
- **Noto Serif · Noto Naskh Arabic · Noto Serif Armenian · Noto Serif Hebrew**
  © Google (SIL OFL 1.1) — loaded at runtime from Google Fonts, not vendored, so
  the license travels with the served files rather than this repository.
- **KingHwaOldSong 京華老宋体** © 2022 TerryWang（特里王）, all rights reserved — author-declared
  free-commercial-use license (no resale as a standalone font file, no redistributing modified
  glyphs, copyright notice must be retained). Loaded at runtime via ZeoSeven Fonts CDN, not vendored.
  Full terms: [`licenses/fonts/KingHwaOldSong-LICENSE.md`](licenses/fonts/KingHwaOldSong-LICENSE.md).
