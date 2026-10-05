# 署名 · Attribution

本项目自有代码以 [GPL-3.0](LICENSE) 发布。[`data/records/`](data/records/)、[`data/eclipses/`](data/eclipses/) 与 [`data/concordance/`](data/concordance/) 以 [CC-BY-SA 4.0](licenses/data/CC-BY-SA-4.0.txt) 发布。第三方组件遵循各自的许可，相关全文存于 [`licenses/`](licenses/)．本文档列出在转载项目代码、数据库时与署名相关的注意事项。

The project's own code is released under [GPL-3.0](LICENSE). [`data/records/`](data/records/), [`data/eclipses/`](data/eclipses/) and [`data/concordance/`](data/concordance/) are released under [CC-BY-SA 4.0](licenses/data/CC-BY-SA-4.0.txt). Third-party components keep their own licenses; full texts are in [`licenses/`](licenses/). This document lists what must be credited when the project's code or databases are reused.

## 姊妹项目

| 项目 | 用途 | 所涉文件 | 版权人 | 许可 |
|---|---|---|---|---|
| [SubstellarAtlas](https://github.com/Higashimado/SubstellarAtlas) | 日月食渲染器与贝塞尔几何 | [`js/eclipse.js`](js/eclipse.js)、[`js/bessel-runtime.js`](js/bessel-runtime.js)、[`js/eclipse-glyph.js`](js/eclipse-glyph.js)、[`js/body-markers.js`](js/body-markers.js)、[`js/time.js`](js/time.js)、[`js/i18n.js`](js/i18n.js)、[`css/tokens.css`](css/tokens.css) | Higashimado | [GPL-3.0](LICENSE) |

## 外部库

外部库存放于 [`vendor/`](vendor/)，许可全文见 [`licenses/code/`](licenses/code/)．

| 名称 | 版本 | 用途 | 版权人 | 许可 |
|---|---|---|---|---|
| [Leaflet](https://leafletjs.com/) | 1.9.4 | 地图引擎 | Volodymyr Agafonkin | [BSD-2-Clause](licenses/code/Leaflet-1.9.4-BSD-2-Clause.txt) |
| [MapLibre GL JS](https://maplibre.org/) | 5.24.0 | 矢量渲染 | MapLibre | [BSD-3-Clause](licenses/code/MapLibreGLJS-5.24.0-BSD-3-Clause.txt) |
| [maplibre-gl-leaflet](https://github.com/maplibre/maplibre-gl-leaflet) | 0.1.3 | 图层桥接 | MapLibre | [ISC](licenses/code/maplibre-gl-leaflet-0.1.3-ISC.txt) |
| [maplibre-gl-dates](https://github.com/OpenHistoricalMap/maplibre-gl-dates) | 1.3.0 | 日期过滤 | OpenHistoricalMap | [CC0-1.0](licenses/code/maplibre-gl-dates-1.3.0-CC0-1.0.txt) |
| [Astronomy Engine](https://github.com/cosinekitty/astronomy) | 2.1.19 | 天文计算 | Don Cross | [MIT](licenses/code/astronomy-engine-2.1.19-MIT.txt) |

## 底图

底图在运行时从各提供方加载，本项目不分发任何瓦片。

| 名称 | 用途 | 版权人 | 许可 |
|---|---|---|---|
| [OpenHistoricalMap](https://www.openhistoricalmap.org/) | 默认底图 | OpenHistoricalMap 贡献者 | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [CARTO](https://carto.com/) Positron 与 Voyager | 现代底图 | CARTO；数据来源为 OpenStreetMap 贡献者 | 地图数据为 [ODbL](https://opendatacommons.org/licenses/odbl/) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | 现代底图 | OpenStreetMap 贡献者 | [ODbL](https://opendatacommons.org/licenses/odbl/) |
| [Esri World Shaded Relief](https://www.esri.com/) | 地形底图 | Esri；数据来源为 Esri 与 USGS | Esri 使用条款 |

## 字体

许可全文见 [`licenses/fonts/`](licenses/fonts/)．

| 名称 | 用途 | 版权人 | 许可 |
|---|---|---|---|
| [思源宋体 Source Han Serif](https://github.com/adobe-fonts/source-han-serif) | 经子集化后由 [`css/fonts/`](css/fonts/) 提供 | Adobe | [SIL OFL 1.1](licenses/fonts/SourceHanSerif-OFL-1.1.txt) |
| [Spectral](https://github.com/productiontype/Spectral) | 经子集化后由 [`css/fonts/`](css/fonts/) 提供 | The Spectral Project Authors、Production Type | [SIL OFL 1.1](licenses/fonts/Spectral-OFL-1.1.txt) |
| [Noto Serif、Noto Naskh Arabic、Noto Serif Armenian、Noto Serif Hebrew](https://fonts.google.com/noto) | 运行时从 Google Fonts 加载 | Google | [SIL OFL 1.1](https://openfontlicense.org/) |
| 京華老宋体 KingHwaOldSong | 运行时从 ZeoSeven Fonts 加载 | 2022 TerryWang，保留所有权利 | [作者条款](licenses/fonts/KingHwaOldSong-LICENSE.md)：可免费商用，不得作为独立字体文件转售，不得再分发修改后的字形，须保留版权声明 |

## 史料

本库收集的历史记录存于 [`data/records/`](data/records/)，以 [CC-BY-SA 4.0](licenses/data/CC-BY-SA-4.0.txt) 发布。所有记录均转录自公有领域文本或版权过期的文本，来源及参考版本列于 [`data/records/sources.json`](data/records/sources.json)。日期、地点、可见性等字段，以及译文、注释和其多语言翻译，均为本库原创。

记录底本主要来自如下 8 所数字图书馆，在此按记录条数排列：

| 图书馆 | 内容 | 所用文本的条款 |
|---|---|---|
| [维基文库](https://wikisource.org/) | 中国典籍等史册 | [CC-BY-SA 4.0](licenses/data/CC-BY-SA-4.0.txt)，维基文库贡献者 |
| [Delpher](https://www.delpher.nl/) | 荷兰报纸 | 公有领域 |
| [Gallica](https://gallica.bnf.fr/) | 法国报纸与期刊 | 公有领域 |
| [互联网档案馆](https://archive.org/) | 印本书籍与期刊 | 公有领域 |
| [Chronicling America](https://chroniclingamerica.loc.gov/) | 美国报纸 | 公有领域 |
| [台灣歷史數位圖書館](http://thdl.ntu.edu.tw/) | 《宋会要辑稿》 | 公有领域 |
| [德意志历史文献集成 dMGH](https://www.dmgh.de/) | 中世纪拉丁文编年史的校勘本 | 公有领域 |
| [NASA ADS](https://ui.adsabs.harvard.edu/) | 天文学期刊 | 公有领域 |

另有少量底本出自 ORACC、CDLI、Perseus 数字图书馆、The Latin Library、Polona、Papers Past、FAMSI、古腾堡计划，详见 [`sources.json`](data/records/sources.json)．

## 全表

本库计算的日月食全表存于 [`data/eclipses/`](data/eclipses/)，以 [CC-BY-SA 4.0](licenses/data/CC-BY-SA-4.0.txt) 发布。日食、月食索引及接触曲线为本库原创，计算所用的根数及相关引擎依各自的许可发布。

| 名称 | 用途 | 作者 | 许可 |
|---|---|---|---|
| [五千年日月食典 5MCSE / 5MCLE](https://eclipse.gsfc.nasa.gov/) | 天文纪年 −1999 至 1999 年的贝塞尔根数、沙罗数与伽马数 | Fred Espenak，NASA GSFC | 公有领域，须署名 |
| [JPL DE441](https://ssd.jpl.nasa.gov/planets/eph_export.html) 行星与月球星历 | 天文纪年 −3000 至 −2000 年的日月位置 | Park, Folkner, Williams & Boggs 2021 | 公有领域 |
| ΔT 模型 | Astronomy Engine 内置模型，衔接自算根数与 5MCSE 根数 | Espenak & Meeus 2006 | 公有领域 |
| ΔT 不确定度 | 早期日月食接触曲线的不确定度 | [Stephenson, Morrison & Hohenkerk 2016](https://doi.org/10.1098/rspa.2016.0404)，*Proceedings of the Royal Society A* 第 472 卷 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

## 对照

本库所用对照表存于 [`data/concordance/`](data/concordance/)，以 [CC-BY-SA 4.0](licenses/data/CC-BY-SA-4.0.txt) 发布。摘录、翻译、格式和年代匹配等多为本库原创，详见 [`data/concordance/README.md`](data/concordance/README.md)．特别地，星官表 [`xingguan.json`](data/concordance/xingguan.json) 转自姊妹项目 [SubstellarAtlas](https://github.com/Higashimado/SubstellarAtlas)．

| 文件 | 内容 | 来源 |
|---|---|---|
| [`xingguan.json`](data/concordance/xingguan.json) | 中国星官、二十八宿与恒星的名称、别名与现代星名 | 提取自 SubstellarAtlas 的 [`data/sky/`](https://github.com/Higashimado/SubstellarAtlas/tree/main/data/sky)，其上游来源为维基百科与 Wikidata、Stellarium 的 `constellations.cn`，以及 HYG 与 SIMBAD 恒星数据，均为 CC-BY-SA；`src: hand` 条目为本库原创 |

---

## Sibling project

| Project | Purpose | Files | Copyright | License |
|---|---|---|---|---|
| [SubstellarAtlas](https://github.com/Higashimado/SubstellarAtlas) | Eclipse renderer and Besselian geometry | [`js/eclipse.js`](js/eclipse.js), [`js/bessel-runtime.js`](js/bessel-runtime.js), [`js/eclipse-glyph.js`](js/eclipse-glyph.js), [`js/body-markers.js`](js/body-markers.js), [`js/time.js`](js/time.js), [`js/i18n.js`](js/i18n.js), [`css/tokens.css`](css/tokens.css) | Higashimado | [GPL-3.0](LICENSE) |

## Vendor

Vendored under [`vendor/`](vendor/); full license texts are in [`licenses/code/`](licenses/code/).

| Name | Version | Purpose | Copyright | License |
|---|---|---|---|---|
| [Leaflet](https://leafletjs.com/) | 1.9.4 | Map engine | Volodymyr Agafonkin | [BSD-2-Clause](licenses/code/Leaflet-1.9.4-BSD-2-Clause.txt) |
| [MapLibre GL JS](https://maplibre.org/) | 5.24.0 | Vector rendering | MapLibre | [BSD-3-Clause](licenses/code/MapLibreGLJS-5.24.0-BSD-3-Clause.txt) |
| [maplibre-gl-leaflet](https://github.com/maplibre/maplibre-gl-leaflet) | 0.1.3 | Layer bridge | MapLibre | [ISC](licenses/code/maplibre-gl-leaflet-0.1.3-ISC.txt) |
| [maplibre-gl-dates](https://github.com/OpenHistoricalMap/maplibre-gl-dates) | 1.3.0 | Date filtering | OpenHistoricalMap | [CC0-1.0](licenses/code/maplibre-gl-dates-1.3.0-CC0-1.0.txt) |
| [Astronomy Engine](https://github.com/cosinekitty/astronomy) | 2.1.19 | Astronomical computation | Don Cross | [MIT](licenses/code/astronomy-engine-2.1.19-MIT.txt) |

## Basemaps

Basemaps are loaded at runtime from each provider; the project distributes no tiles.

| Name | Purpose | Copyright | License |
|---|---|---|---|
| [OpenHistoricalMap](https://www.openhistoricalmap.org/) | Default basemap | OpenHistoricalMap contributors | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [CARTO](https://carto.com/) Positron and Voyager | Modern basemap | CARTO; data from OpenStreetMap contributors | Map data under [ODbL](https://opendatacommons.org/licenses/odbl/) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Modern basemap | OpenStreetMap contributors | [ODbL](https://opendatacommons.org/licenses/odbl/) |
| [Esri World Shaded Relief](https://www.esri.com/) | Terrain basemap | Esri; data from Esri and USGS | Esri terms of use |

## Fonts

Full license texts are in [`licenses/fonts/`](licenses/fonts/).

| Name | Purpose | Copyright | License |
|---|---|---|---|
| [Source Han Serif](https://github.com/adobe-fonts/source-han-serif) | Subset and served from [`css/fonts/`](css/fonts/) | Adobe | [SIL OFL 1.1](licenses/fonts/SourceHanSerif-OFL-1.1.txt) |
| [Spectral](https://github.com/productiontype/Spectral) | Subset and served from [`css/fonts/`](css/fonts/) | The Spectral Project Authors, Production Type | [SIL OFL 1.1](licenses/fonts/Spectral-OFL-1.1.txt) |
| [Noto Serif, Noto Naskh Arabic, Noto Serif Armenian, Noto Serif Hebrew](https://fonts.google.com/noto) | Loaded at runtime from Google Fonts | Google | [SIL OFL 1.1](https://openfontlicense.org/) |
| KingHwaOldSong (Jinghua Laosong) | Loaded at runtime from ZeoSeven Fonts | 2022 TerryWang, all rights reserved | [Author's terms](licenses/fonts/KingHwaOldSong-LICENSE.md): free for commercial use; no resale as a standalone font file, no redistribution of modified glyphs, copyright notice retained |

## Records

The records collected by the project are stored in [`data/records/`](data/records/) and released under [CC-BY-SA 4.0](licenses/data/CC-BY-SA-4.0.txt). All are transcribed from public-domain texts or texts whose copyright has expired; sources and the editions consulted are listed in [`data/records/sources.json`](data/records/sources.json). Fields such as date, place and visibility, together with the translations, the notes and their versions in other languages, are the project's own.

The source texts come mainly from the following 8 digital libraries, listed by number of records:

| Library | Content | Terms of the texts used |
|---|---|---|
| [Wikisource](https://wikisource.org/) | Chinese classics and other histories | [CC-BY-SA 4.0](licenses/data/CC-BY-SA-4.0.txt), Wikisource contributors |
| [Delpher](https://www.delpher.nl/) | Dutch newspapers | Public domain |
| [Gallica](https://gallica.bnf.fr/) | French newspapers and journals | Public domain |
| [Internet Archive](https://archive.org/) | Printed books and journals | Public domain |
| [Chronicling America](https://chroniclingamerica.loc.gov/) | American newspapers | Public domain |
| [Taiwan History Digital Library](http://thdl.ntu.edu.tw/) | *Song huiyao jigao* | Public domain |
| [Monumenta Germaniae Historica dMGH](https://www.dmgh.de/) | Critical editions of medieval Latin chronicles | Public domain |
| [NASA ADS](https://ui.adsabs.harvard.edu/) | Astronomical journals | Public domain |

A few texts come from ORACC, CDLI, the Perseus Digital Library, The Latin Library, Polona, Papers Past, FAMSI and Project Gutenberg; see [`sources.json`](data/records/sources.json).

## Tables

The eclipse tables computed by the project are stored in [`data/eclipses/`](data/eclipses/) and released under [CC-BY-SA 4.0](licenses/data/CC-BY-SA-4.0.txt). The solar and lunar eclipse indexes and the contact curves are the project's own; the elements and engines used in the computation keep their own licenses.

| Name | Purpose | Author | License |
|---|---|---|---|
| [Five Millennium Canons 5MCSE / 5MCLE](https://eclipse.gsfc.nasa.gov/) | Besselian elements, saros numbers and gamma from −1999 to 1999 | Fred Espenak, NASA GSFC | Public domain, attribution requested |
| [JPL DE441](https://ssd.jpl.nasa.gov/planets/eph_export.html) planetary and lunar ephemeris | Positions of the Sun and Moon from −3000 to −2000 | Park, Folkner, Williams & Boggs 2021 | Public domain |
| ΔT model | Astronomy Engine's built-in model, joining the project's own elements to the 5MCSE elements | Espenak & Meeus 2006 | Public domain |
| ΔT uncertainty | Uncertainty of the contact curves of early eclipses | [Stephenson, Morrison & Hohenkerk 2016](https://doi.org/10.1098/rspa.2016.0404), *Proceedings of the Royal Society A*, vol. 472 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

## Concordance

The concordance tables used by the project are stored in [`data/concordance/`](data/concordance/) and released under [CC-BY-SA 4.0](licenses/data/CC-BY-SA-4.0.txt). The excerpts, translations, formats and date matching are mostly the project's own; see [`data/concordance/README.md`](data/concordance/README.md). The asterism table [`xingguan.json`](data/concordance/xingguan.json), in particular, comes from the sibling project [SubstellarAtlas](https://github.com/Higashimado/SubstellarAtlas).

| File | Content | Source |
|---|---|---|
| [`xingguan.json`](data/concordance/xingguan.json) | Names, alternative names and modern identifications of Chinese asterisms, lunar mansions and stars | Extracted from [`data/sky/`](https://github.com/Higashimado/SubstellarAtlas/tree/main/data/sky) of SubstellarAtlas, whose upstream sources are Wikipedia and Wikidata, the `constellations.cn` file of Stellarium, and the HYG and SIMBAD star data, all CC-BY-SA; the `src: hand` entries are the project's own |
