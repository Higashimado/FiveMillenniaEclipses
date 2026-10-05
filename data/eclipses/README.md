# eclipses

## Files

| File | Content | Format | Read by |
|---|---|---|---|
| [`solar.json`](solar.json) | Every solar eclipse, −3000 to 1999 | JSON array, one object per eclipse, ordered by `date` | [`js/eclipse-loader.js`](../../js/eclipse-loader.js) |
| [`lunar.json`](lunar.json) | Every lunar eclipse, −3000 to 1999 | JSON array, one object per line, ordered by `date` | [`js/eclipse-loader.js`](../../js/eclipse-loader.js) |
| `events/<date>.json` | Contact curves and Besselian elements of one solar eclipse | JSON object; `<date>` is the `date` of the `solar.json` entry | [`js/eclipse.js`](../../js/eclipse.js), through `_curves_url` in `solar.json` |
| [`bessel-5mcse.json`](bessel-5mcse.json) | Besselian elements from NASA 5MCSE, −1999 to 1999 | JSON object: header keys, then `eclipses` | Build input for `events/`; not read by the page |
| [`bessel-ancient.json`](bessel-ancient.json) | Besselian elements computed from JPL DE441, −3000 to −2000 | Same as `bessel-5mcse.json` | Build input for `events/`; not read by the page |

Times are UTC, as extended ISO 8601 strings. Coordinates are degrees, latitude north positive, longitude east positive. Durations are seconds. A field that does not apply to an eclipse is `null`.

## solar.json

| Field | Content |
|---|---|
| `date` | UT date of greatest eclipse |
| `kind` | `Total`, `Annular`, `Partial` or `Hybrid` |
| `type` | NASA 5MCSE type code, [key](https://eclipse.gsfc.nasa.gov/SEcat5/SEcatkey.html) |
| `peak` | Greatest eclipse: `time`, `lat`, `lng`, `gamma` |
| `p1`, `p4` | First and last contact of the penumbra with Earth |
| `p2`, `p3` | First and last contact of the umbra or antumbra with Earth |
| `peakLocal` | Local contacts at the point of greatest eclipse: `c1`, `c2`, `peak`, `c3`, `c4`, and `phase` (`total`, `annular` or `partial`) |
| `magnitude`, `gamma`, `saros`, `obscuration` | At greatest eclipse |
| `central` | Whether the eclipse has a central line |
| `centralDurationSec` | Duration of the central phase at greatest eclipse |
| `partialDurSec` | Duration of the partial phase at greatest eclipse |
| `_curves_url` | Path of the event file, relative to this directory |
| `_curve_source` | `NASA-5MCSE-bessel` or `DE441-bessel` |
| `path_confidence` | `exact` for NASA elements, `computed` for DE441 elements |
| `source_citation` | Source of the elements |
| `schema_version` | `1.0` |

Entries from DE441 elements also carry:

| Field | Content |
|---|---|
| `source` | `computed` |
| `sigma_deltat_sec` | One standard deviation of ΔT |
| `_sigma_lon_deg` | One standard deviation of longitude implied by `sigma_deltat_sec` |
| `aeCorr` | Correction of astronomy-engine to DE441: `epoch`; `moon` and `sun`, cubic coefficients of a geocentric EQJ offset in km against hours from `epoch`, applied within 12 hours of it; `residual_km`, `residual_arcsec` |

## lunar.json

| Field | Content |
|---|---|
| `date` | UT date of greatest eclipse |
| `kind` | `Total`, `Partial` or `Penumbral` |
| `times` | Contacts `p1`, `u1`, `u2`, `peak`, `u3`, `u4`, `p4` (penumbral and umbral) |
| `contactPoints` | Sub-lunar point at each contact in `times`: `lat`, `lng` |
| `subLunar` | Sub-lunar point at greatest eclipse |
| `magnitude`, `umbralMag`, `penumbralMag`, `obscuration`, `gamma`, `saros` | At greatest eclipse |
| `totalDurSec`, `partialDurSec`, `penumbralDurSec` | Durations of the total, umbral and penumbral phases |
| `glyph` | Eclipse diagram geometry in radians: `sd_primary` (lunar semi-diameter), `rho_umbra`, `rho_penum` (shadow radii), `sep` (Moon–shadow separation), `pa` (position angle) |

Entries from DE441 elements also carry `source`, `sigma_deltat_sec`, `_sigma_lon_deg` and `aeCorr`, as in `solar.json`.

## events/

| Field | Content |
|---|---|
| `date` | As in `solar.json` |
| `contactCurves` | Curves as arrays of `[lat, lng]`: `centralPath`; `nLimit`, `sLimit` (penumbral limits); `umbralNLimit`, `umbralSLimit`; `magContours` (array of `{mag, sideA, sideB}`); `riseSetLoops` (`sideA`, `sideB`); `riseMaxEclipse`, `setMaxEclipse`; `anchorPoints` (`P1`–`P4`, `U1`–`U4`, `G` for greatest eclipse, `ExtN`, `ExtS`, each `{utc, lat, lng}`); `rimCrossings` (where `riseMaxEclipse` and `setMaxEclipse` meet `riseSetLoops`); `hybridBreaks`, `hybridFirstPhase` (hybrid eclipses) |
| `bessel` | `t0_tdt_hours`, `delta_t_seconds`, `tan_f1`, `tan_f2`, `polynomials` (`x`, `y`, `d`, `l1`, `l2`, `mu`), `_source` (`NASA-5MCSE` or `DE441`) |
| `path_confidence`, `schema_version` | As in `solar.json` |

Files from DE441 elements also carry `source` and `sigma_deltat_sec`, as in `solar.json`.

## bessel-5mcse.json, bessel-ancient.json

Header keys: `_` (units and sign conventions), `source`, `source_url`, `generated_from`, `count`. `eclipses` is an array with one object per eclipse:

| Field | Content |
|---|---|
| `id` | `date_utc`, a hyphen, and `T`, `A`, `P` or `H` |
| `date_utc` | As `date` in `solar.json` |
| `type` | `total`, `annular`, `partial` or `hybrid` |
| `t0_tdt_hours` | Reference time, TT hours |
| `delta_t_seconds` | ΔT |
| `polynomials` | Cubic coefficients in hours from `t0_tdt_hours`: `x`, `y`, `d`, `l1`, `l2`, `mu` |
| `tan_f1`, `tan_f2` | Tangents of the penumbral and umbral cone angles |
| `greatest_eclipse_utc`, `gamma`, `magnitude_max`, `saros` | At greatest eclipse |
| `t_range` | Validity range of the polynomials, hours from `t0_tdt_hours` |
| `greatest_eclipse_lat`, `greatest_eclipse_lng`, `nasa_date` | `bessel-5mcse.json` only; `nasa_date` is NASA's own calendar date |
| `source` | `bessel-ancient.json` only |
