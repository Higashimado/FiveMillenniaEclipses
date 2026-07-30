# <img src="img/mark.svg" alt="" width="34" style="vertical-align: text-bottom"> 五千年日月食 · Five Millennia of Eclipses

[简体中文](zh-Hans/README.md) · [繁體中文](zh-Hant/README.md) · [English](en/README.md) · [Français](fr/README.md) · [Español](es/README.md) · [Italiano](it/README.md) · [日本語](ja/README.md)

<p align="center">
  <img src="docs/demo/world_map_zh-Hans.png" width="100%">
</p>

**网站链接 · Site**：<https://higashimado.github.io/FiveMillenniaEclipses/>

五千年日月食是取各代天象之记载，归其所记之日、所记之地编成的历史天文图志。其以日食、月食为核心，兼收掩犯、合聚、客星、彗孛，共六类天象，现收万余条。凡可考之记录，皆系于以今法反推之实际事件，并列于横跨五千年之历轴上。无论古今中外，何人见之，何地见之，以何历纪其日，以何名目当之，一目了然。

Five Millennia of Eclipses is a historical atlas of astronomical records. It gathers the accounts written down in every age and returns each one to the day and the place that account names. Solar and lunar eclipses form its core; occultations, conjunctions, guest stars and comets complete six classes of phenomena, and the corpus now holds more than twelve thousand entries. Every datable record is tied to the actual event recovered by modern computation, and all of them are ranged along a single timeline spanning five millennia. Who saw an event, where it was seen, which calendar dated it and what name it was given are legible at a glance, across cultures and across centuries.

## 史籍

本站现收各类天象史籍共 12 026 条。每条分存原文、译文与注解，原始文件见于 [data/](data/) 目录：

| 文件 | 内容 |
|---|---|
| [`data/records/schema.json`](data/records/schema.json) | 字段定义 |
| [`data/records/manifest.json`](data/records/manifest.json) | 文件清单 |
| [`data/records/sources.json`](data/records/sources.json) | 来源目录 |
| `data/records/<现象>/<文明>.jsonl` | 记录本体 |

### 东亚

东亚记录 11 804 共条，占全库 98.2%，年代自公元前 2137 年迄于 1911 年。有中国一支，涉二十四史中十六部及《清史稿》，取其天文、五行、律历诸志与本纪。别有经部之《尚书》《诗经》[《春秋》](https://zh.wikisource.org/wiki/春秋經)[《左传》](https://zh.wikisource.org/wiki/春秋左氏傳)、殷墟甲骨，日本、韩国、越南史料，及笔记诗文若干。文本多据 [维基文库](https://zh.wikisource.org/) 之校点本。

主干来源二十三种，合 11 666 条，占东亚一支之 98.8%，按所记年代先后为序：

| 来源 | 年代 | 日 | 月 | 掩 | 合 | 客 | 彗 | 条数 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| [《汉书·五行志》](https://zh.wikisource.org/wiki/%E6%BC%A2%E6%9B%B8/%E5%8D%B7027)| 前 205 – 2 | 45 | | | | | | 45 |
| [《三国史记》](https://zh.wikisource.org/wiki/%E4%B8%89%E5%9C%8B%E5%8F%B2%E8%A8%98/%E5%8D%B701)| 前 54 – 911 | 44 | | | | 3 | 7 | 54 |
| [《后汉书·五行志六》](https://zh.wikisource.org/wiki/%E5%BE%8C%E6%BC%A2%E6%9B%B8/%E5%8D%B7108)| 26 – 219 | 65 | | | | | | 65 |
| [《后汉书·天文志》](https://zh.wikisource.org/wiki/%E5%BE%8C%E6%BC%A2%E6%9B%B8/%E5%8D%B7102)| 55 – 213 | 1 | | | | 11 | 17 | 29 |
| [《宋书·五行志》](https://zh.wikisource.org/wiki/%E5%AE%8B%E6%9B%B8/%E5%8D%B734)| 221 – 479 | 73 | | | | | | 73 |
| [《晋书·天文志》](https://zh.wikisource.org/wiki/%E6%99%89%E6%9B%B8/%E5%8D%B7013)| 222 – 418 | | 1 | | | 6 | 47 | 54 |
| [《魏书·天象志》](https://zh.wikisource.org/wiki/%E9%AD%8F%E6%9B%B8/%E5%8D%B7105%E4%B9%8B%E4%B8%80)| 400 – 549 | 32 | 36 | | | 3 | 23 | 94 |
| [《隋书·天文志》](https://zh.wikisource.org/wiki/%E9%9A%8B%E6%9B%B8/%E5%8D%B721)| 502 – 617 | 11 | 3 | 175 | 12 | 4 | 14 | 219 |
| [《新唐书·天文志》](https://zh.wikisource.org/wiki/%E6%96%B0%E5%94%90%E6%9B%B8/%E5%8D%B7033)| 618 – 906 | 90 | | 389 | 1 | 6 | 48 | 534 |
| [《旧唐书·天文志》](https://zh.wikisource.org/wiki/%E8%88%8A%E5%94%90%E6%9B%B8/%E5%8D%B736)| 626 – 839 | 1 | 1 | | | | 18 | 20 |
| [六国史](https://zh.wikisource.org/wiki/%E6%97%A5%E6%9C%AC%E6%9B%B8%E7%B4%80/%E5%8D%B7%E7%AC%AC%E4%B8%89%E5%8D%81) | 680 – 887 | 97 | 4 | | | | | 101 |
| [《扶桑略记》](https://zh.wikisource.org/wiki/%E6%89%B6%E6%A1%91%E7%95%A5%E8%A8%98/%E7%AC%AC023)《百炼抄》《吾妻镜》| 898 – 1265 | 20 | | | | | | 20 |
| [《旧五代史·天文志》](https://zh.wikisource.org/wiki/%E8%88%8A%E4%BA%94%E4%BB%A3%E5%8F%B2/%E5%8D%B7139)| 911 – 958 | 9 | 11 | | | | 6 | 26 |
| [《宋史·天文志》](https://zh.wikisource.org/wiki/%E5%AE%8B%E5%8F%B2/%E5%8D%B7053)| 960 – 1275 | 121 | 149 | 4 819 | | 17 | 21 | 5 127 |
| [《大越史记全书》](https://zh.wikisource.org/wiki/%E5%A4%A7%E8%B6%8A%E5%8F%B2%E8%A8%98%E5%85%A8%E6%9B%B8/%E6%9C%AC%E7%B4%80%E5%8D%B7%E4%B9%8B%E4%BA%94)| 993 – 1774 | 46 | 32 | | | | | 78 |
| [《高丽史·天文志》](https://zh.wikisource.org/wiki/%E9%AB%98%E9%BA%97%E5%8F%B2/%E5%8D%B7%E5%9B%9B%E5%8D%81%E5%85%AB)| 1012 – 1393 | 119 | 97 | 1 911 | 4 | 3 | 15 | 2 149 |
| [《金史·天文志》](https://zh.wikisource.org/wiki/%E9%87%91%E5%8F%B2/%E5%8D%B720)| 1120 – 1232 | 8 | 25 | 209 | 4 | 2 | 5 | 253 |
| [《元史·天文志》](https://zh.wikisource.org/wiki/%E5%85%83%E5%8F%B2/%E5%8D%B7049)| 1264 – 1367 | 35 | | 571 | 8 | 1 | 18 | 633 |
| [《明史·天文志》](https://zh.wikisource.org/wiki/%E6%98%8E%E5%8F%B2/%E5%8D%B726)| 1368 – 1642 | | | 972 | 45 | | 38 | 1 055 |
| [《明史·本纪》](https://zh.wikisource.org/wiki/%E6%98%8E%E5%8F%B2/%E5%8D%B72)| 1371 – 1643 | 75 | | | | | | 75 |
| [《朝鲜王朝实录》](https://zh.wikisource.org/wiki/%E6%9C%9D%E9%AE%AE%E7%8E%8B%E6%9C%9D%E5%AF%A6%E9%8C%84/%E5%93%B2%E5%AE%97%E5%AF%A6%E9%8C%84/%E5%8D%81%E4%BA%8C%E5%B9%B4)| 1400 – 1863 | 84 | 32 | | | 84 | 297 | 497 |
| [《清史稿·天文志》](https://zh.wikisource.org/wiki/%E6%B8%85%E5%8F%B2%E7%A8%BF/%E5%8D%B737)| 1618 – 1796 | 50 | | 357 | | | 25 | 432 |
| [《清史稿·本纪》](https://zh.wikisource.org/wiki/%E6%B8%85%E5%8F%B2%E7%A8%BF/%E5%8D%B716)| 1646 – 1911 | 33 | | | | | | 33 |

其余二十七种、138 条，含[《尚书·胤征》](https://zh.wikisource.org/wiki/尚書/胤征)之仲康日食、殷墟甲骨、[《诗经·小雅·十月之交》](https://zh.wikisource.org/wiki/詩經/十月之交)、卢仝[《月蚀诗》](https://zh.wikisource.org/wiki/全唐詩/卷388)与韩愈[《月蚀诗效玉川子作》](https://zh.wikisource.org/wiki/全唐詩/卷340)、[《辽史》](https://zh.wikisource.org/wiki/%E9%81%BC%E5%8F%B2/%E5%8D%B722)、藤原定家《明月记》、[《西夏书事》](https://zh.wikisource.org/wiki/%E8%A5%BF%E5%A4%8F%E6%9B%B8%E4%BA%8B/29)、[《长春真人西游记》](https://zh.wikisource.org/wiki/%E9%95%B7%E6%98%A5%E7%9C%9F%E4%BA%BA%E8%A5%BF%E9%81%8A%E8%A8%98/%E5%8D%B7%E4%B8%8A)、[《续资治通鉴》](https://zh.wikisource.org/wiki/續資治通鑑)、舒岳祥《日食》诗等。

### 其他

东亚以外 222 条，涉 21 个文明，其非设官连续记注，而以单点见证为主。中世纪以前所据者为编年、史著、抄本与泥板。十七世纪以后，则不复有「书」，代之以天文台报告、学会通讯与私人书信。下表兼列典籍与观测者。

| 文明 | 年代 | 典籍与报告 | 日 | 月 | 条数 |
|---|---|---|---:|---:|---:|
| 阿拉伯 | 829 – 1226 | [Ḥabash al-Ḥāsib](https://gallica.bnf.fr/ark:/12148/bpt6k5626201z)、[al-Māhānī](https://gallica.bnf.fr/ark:/12148/bpt6k5626201z)、al-Battānī、[Ibn Amājūr](https://gallica.bnf.fr/ark:/12148/bpt6k5626201z)、[Ibn Yūnus](https://gallica.bnf.fr/ark:/12148/bpt6k5626201z)、[al-Bīrūnī](https://archive.org/details/chronologyofanci00biru)、Ibn al-Athīr[《历史大全》](https://archive.org/details/kamil-Tornberg)、[Ibn ʿIdhārī](https://archive.org/details/bub_gb_MiyHAAAAMAAJ) | 19 | 27 | 46 |
| 不列颠 | 664 – 1919 | 比德[《英吉利教会史》](https://www.gutenberg.org/cache/epub/38326/pg38326-images.html)、[《盎格鲁-撒克逊编年史》](https://en.wikisource.org/wiki/Anglo-Saxon_Chronicle)、伍斯特的约翰[《编年纪事》](https://archive.org/details/florentiiwigorn00florgoog)、马姆斯伯里的威廉[《新近史》](https://archive.org/details/stubdegestisregumanglorum1)、亨廷登的亨利[《英吉利史》](https://archive.org/details/henriciarchidia00unkngoog)、坎特伯雷的杰维斯[《编年史》](https://archive.org/details/thehistoricalworksofgerva1)、马修·帕里斯[《大编年史》](https://archive.org/details/matthiparisiensi03pari)、沃尔辛厄姆[《英吉利史》](https://archive.org/details/thomaewalsingham01wals)、鲍尔[《苏格兰纪年》](https://archive.org/details/scotichronicon-v-1-bks-1-2)、John Lamont、John Nicoll、[Alice Thornton](https://archive.org/details/autobiographyofm00thor)、[John Evelyn](https://archive.org/details/in.ernet.dli.2015.272771)、[Halley](https://archive.org/details/bim_eighteenth-century_a-description-of-the-pas_halley-edmund_1715_0)、[Baily](https://archive.org/details/paper-doi-10_1093_mnras_4_2_15)、[De la Rue](https://archive.org/details/ontotalsolarecli00dela)、[Lockyer](https://archive.org/details/contributionsto00lockgoog)、Copeland、[Dyson](https://archive.org/details/philtrans06337895)、Eddington | 31 | 8 | 39 |
| 神圣罗马 | 806 – 1852 | [《法兰克王家年代记》](https://thelatinlibrary.com/annalesregnifrancorum.html)、[《贝尔廷编年史》](https://archive.org/stream/annalesbertinian00wait/annalesbertinian00wait_djvu.txt)、[《希尔德斯海姆年代记》](https://www.dmgh.de/mgh_ss_3/index.htm)、[《马尔巴赫年代记》](https://www.dmgh.de/mgh_ss_rer_germ_9/index.htm)、[Annalista Saxo](https://www.dmgh.de/mgh_ss_6/index.htm)、普吕姆的雷吉诺[《编年史》](https://www.dmgh.de/mgh_ss_rer_germ_50/)、让布卢的西格贝特[《编年史》](https://www.dmgh.de/mgh_ss_6/index.htm)、齐陶的彼得[《兹布拉斯拉夫编年史》](https://archive.org/details/fontesrerumbohem04emle)、布热佐瓦的瓦夫日涅茨[《胡斯派编年史》](https://archive.org/details/fontesrerumbohe00goog)、[Gemma Frisius](https://archive.org/details/gemmaefrisiimedi00gemm)、David Fabricius、开普勒[《对维特洛的补遗》](https://archive.org/details/advitellionempar00kepl)、[《论新星》](https://archive.org/details/10873675bsb)、Heinsius、Rümker、Busch、Galle、d'Arrest、Wolf、Klinkerfues | 12 | 16 | 28 |
| 美利坚 | 1806 – 1918 | [Ferrer](https://archive.org/details/jstor-1004811)、玛丽亚·米切尔、Harkness、Gilman、Rogers、Young、Lockett、Willson、Seagrave、[Campbell](https://archive.org/details/jstor-984400)、Hammond、Adams、[Stebbins](https://archive.org/details/jstor-984404)、Morehouse、Pettit | 19 | 0 | 19 |
| 巴比伦 | 前 1223 – 前 183 | [《巴比伦天文日志》](http://oracc.museum.upenn.edu/adsd/)、托勒密[《至大论》](https://archive.org/details/bub_gb_a9nvvbG-OOIC)、泥板 [BM 33066](https://cdli.earth/search?q=BM+33066)、乌加里特泥板 [KTU 1.78](https://cdli.earth/search?q=RS+12.061) | 1 | 11 | 12 |
| 意大利 | 1178 – 1852 | 萨莱诺的罗慕铎[《编年史》](https://www.dmgh.de/mgh_ss_19/)、阿雷佐的里斯托罗[《世界的构成》](https://archive.org/details/lacomposizionedelmondo)、萨林贝内[《纪年》](https://www.dmgh.de/mgh_ss_32/index.htm)、[《皮亚琴察吉伯林党年代记》](https://www.dmgh.de/mgh_ss_18/)、[《弗利编年史》](https://archive.org/details/rerumitalicarums271mura)、巴尔巴罗[《君士坦丁堡围城日记》](https://vec.wikisource.org/wiki/Giornale_dell%27assedio_di_Costantinopoli_1453)、坎特伯雷的杰维斯[《编年史》](https://archive.org/details/thehistoricalworksofgerva1)、[克拉维乌斯](https://archive.org/details/christophoriclau00clav_1)、开普勒[《论新星》](https://archive.org/details/10873675bsb)、塞奇 | 8 | 4 | 12 |
| 叙利亚 | 512 – 1191 | 米海尔一世[《编年史》](https://archive.org/details/chroniquedemiche01mich) | 9 | 2 | 11 |
| 法兰西 | 1033 – 1905 | 拉乌尔·格拉贝尔[《历史五书》](https://archive.org/details/rodulfiglabrihis0000glab)、托里尼的罗贝尔[《编年史》](https://www.dmgh.de/mgh_ss_6/index.htm)、[《蒙彼利埃小塔拉姆》](https://archive.org/details/thalamusparvusmontpellierma)、圣德尼修士[《查理六世纪年》](https://gallica.bnf.fr/ark:/12148/bpt6k6224315z)、Maraldi、Cassini、Janssen、Lescarbault、Štefánik | 8 | 2 | 10 |
| 伊比利亚 | 939 – 1560 | [《卡斯蒂利亚古年代记》](https://archive.org/details/espanasagradathe23flor)、[《托莱多第一年代记》](https://archive.org/details/espanasagradathe23flor)、[《塞拉托编年史》](https://archive.org/details/espanasagradathe23flor)、[《科英布拉编年史》](https://archive.org/details/portugaliaemonumentahistoricascrv1)、贝尔纳尔德斯[《天主教双王纪》](https://archive.org/details/historiadelosrey00bern)、斐迪南·哥伦布 *Historie*、[克拉维乌斯](https://archive.org/details/christophoriclau00clav_1) | 7 | 1 | 8 |
| 亚美尼亚 | 1099 – 1736 | [埃德萨的马修](https://archive.org/details/bub_gb_YlkuAAAAQAAJ)、[格里高利神父](https://archive.org/details/bub_gb_YlkuAAAAQAAJ)、阿尼的萨穆埃尔[《年表》](https://archive.org/details/collectiondhist00arhagoog)、[大不里士的阿拉克尔](https://archive.org/details/collectiondhist00arhagoog)、[克里特的亚伯拉罕](https://archive.org/details/collectiondhist00arhagoog) | 4 | 3 | 7 |
| 希腊 | 前 648 – 71 | 阿尔基洛科斯[《残篇》](https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.01.0060:bekker+page=1418b)、希罗多德[《历史》](https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.01.0126:book=1:chapter=74)、修昔底德[《伯罗奔尼撒战争史》](https://en.wikisource.org/wiki/History_of_the_Peloponnesian_War/Book_7)、狄奥多罗斯[《历史丛书》](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Diodorus_Siculus/20A*.html)、帕普斯[《至大论注》](https://archive.nyu.edu/bitstream/2451/61288/56/11.%20Carman.pdf)、普鲁塔克[《论月面》](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Plutarch/Moralia/The_Face_in_the_Moon*/home.html) | 6 | 1 | 7 |
| 北欧 | 1030 – 1581 | 斯诺里[《奥拉夫圣王传》](https://www.gutenberg.org/files/598/598-h/598-h.htm)、斯图拉[《哈康松传》](https://archive.org/details/icelandicsagasot02stur)、第谷 [*Astronomiae Instauratae Progymnasmata*](https://archive.org/details/bub_gb_CVOItHLenPEC)、[伽桑狄](https://archive.org/details/den-kbd-pil-130018157889-001) | 3 | 2 | 5 |
| 斯拉夫 | 1185 – 1406 | [《伊帕提耶夫编年史》](https://archive.org/details/Complete_Collection_of_Russian_Chronicles_1923_Vol_2_Hypatian_Chronicle)、[《劳伦特编年史》](https://archive.org/details/Complete_Collection_of_Russian_Chronicles_1926_Vol_1_Laurentian_Chronicle)、[《诺夫哥罗德第一编年史》](https://archive.org/details/chronicleofnovgo00michrich)、[《扬科编年史》](https://archive.org/details/monumentapoloni00bielgoog) | 4 | 0 | 4 |
| 拜占庭 | 968 – 1453 | 利奥执事[《历史》](https://archive.org/details/corpusscriptoru12unkngoog)、[安娜·科穆宁娜](https://en.wikisource.org/wiki/The_Alexiad)、伪斯弗朗齐斯《大编年史》 | 2 | 1 | 3 |
| 俄罗斯 | 1748 – 1791 | Braun、Popov、Rumovsky、Inochodzov | 3 | 0 | 3 |
| 罗马 | 前 190 – 前 168 | 李维[《建城以来》](https://www.thelatinlibrary.com/livy/liv.37.shtml)、普鲁塔克[《埃米利乌斯·保卢斯传》](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Plutarch/Lives/Aemilius*.html) | 1 | 1 | 2 |
| 玛雅 | 755 · 859 | [《德累斯顿抄本》](https://www.famsi.org/mayawriting/codices/dresden.html) | 2 | 0 | 2 |
| 赫梯 | 前 1312 | 《穆尔西里二世年代记》 | 1 | 0 | 1 |
| 亚述 | 前 763 | [《名年官表》](https://oracc.museum.upenn.edu/saao/saas2/) | 1 | 0 | 1 |
| 阿兹特克 | 1496 | 《特列里亚诺-雷门西斯古抄本》 | 1 | 0 | 1 |
| 拉丁美洲 | 1923 | Joaquín Gallo | 1 | 0 | 1 |


## 全表

本站日月食全表的计算引擎同 [星下点地图](https://github.com/Higashimado/SubstellarAtlas)，而日月食元素多取自 NASA/Espenak 之五千年正典（[5MCSE / 5MCLE](https://eclipse.gsfc.nasa.gov/)），计日食 9 506 次、月食 9 650 次。正典起于天文年 −1999，即公元前 2000 年；更早一段无典可依，贝塞尔元素改由 [JPL DE441](https://ssd.jpl.nasa.gov/planets/eph_export.html) 星历自算，计日食 2 365 次、月食 2 381 次，另附经度中误差一项，其值在 4.48° 与 7.30° 之间。

**目录结构**

| 文件 | 内容 | 体量 |
|---|---|---|
| [`data/eclipses/solar.json`](data/eclipses/solar.json) | 日食索引 | 11 871 条 · 9.1 MB |
| [`data/eclipses/lunar.json`](data/eclipses/lunar.json) | 月食索引 | 12 031 条 · 9.3 MB |
| [`data/eclipses/events/`](data/eclipses/events/) `<date>.json` |接触曲线与贝塞尔多项式 | 11 871 个 · 219 MB |
| [`data/eclipses/bessel-5mcse.json`](data/eclipses/bessel-5mcse.json) | NASA 5MCSE 元素 | 9 506 条 |


## 对照

本站以六份对照表索引史籍所记之地点、时间与对象，为史籍与全表相联之据。

**目录结构**

| 文件 | 内容 | 条目 |
|---|---|---:|
| [`data/duizhao/xingguan.json`](data/duizhao/xingguan.json) | 天文对象 | 391 |
| [`data/duizhao/nianhao.json`](data/duizhao/nianhao.json) | 中国年号（前 140 – 1911）| 330 |
| [`data/duizhao/nengo.json`](data/duizhao/nengo.json) | 日本元号（645 – 今）| 241 |
| [`data/duizhao/diming.json`](data/duizhao/diming.json) | 观测地点 | 164 |
| [`data/duizhao/wenming.json`](data/duizhao/wenming.json) | 文明身份 | 28 |
| [`data/duizhao/quyu.json`](data/duizhao/quyu.json) | 地理区域 | 124 |

## 致谢与许可

本项目自有代码以 [**GNU General Public License v3.0**](LICENSE) 发布；[`data/records/`](data/records/README.md) 与 [`data/duizhao/`](data/duizhao/README.md) 以 [**CC-BY-SA 4.0**](https://creativecommons.org/licenses/by-sa/4.0/) 发布；第三方代码、数据、字体依其各自之许可。

| 用途 | 组件 (版本) | 作者 / 来源 | 许可 |
|---|---|---|---|
| 影锥几何 | [SubstellarAtlas](https://github.com/Higashimado/SubstellarAtlas) | Higashimado | GPL-3.0 |
| 地图引擎 | [Leaflet](https://leafletjs.com/) 1.9.4 | Volodymyr Agafonkin | BSD-2-Clause |
| 矢量渲染 | [MapLibre GL JS](https://maplibre.org/) 5.24.0 | MapLibre | BSD-3-Clause |
| 图层桥接 | [maplibre-gl-leaflet](https://github.com/maplibre/maplibre-gl-leaflet) 0.1.3 | MapLibre | ISC |
| 时间过滤 | [maplibre-gl-dates](https://github.com/OpenHistoricalMap/maplibre-gl-dates) 1.3.0 | OpenHistoricalMap | ISC |
| 天文计算 | [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19 | Don Cross | MIT |
| 日月食正典 | [5MCSE / 5MCLE](https://eclipse.gsfc.nasa.gov/) | Fred Espenak（NASA GSFC）| 公有领域 + 署名 |
| 古代星历 | [JPL DE441](https://ssd.jpl.nasa.gov/planets/eph_export.html) | JPL | 公有领域 |
| 地球自转 | [Stephenson, Morrison & Hohenkerk 2016](https://doi.org/10.1098/rspa.2016.0404) | Royal Society | CC BY-SA 4.0 |
| 历史底图 | [OpenHistoricalMap](https://www.openhistoricalmap.org/) | OHM 社区 | 数据 CC0 |
| 现代底图 | [CARTO](https://carto.com/) Positron · Voyager | CARTO | © CARTO |
| 现代底图 | [OpenStreetMap](https://www.openstreetmap.org/) 标准图层 | OSM 贡献者 | ODbL |
| 地形底图 | [Esri World Shaded Relief](https://www.esri.com/) | Esri / USGS | © Esri |
| 底图数据 | [OpenStreetMap](https://www.openstreetmap.org/copyright) | OSM 贡献者 | ODbL |
| 正史文本 | [维基文库](https://zh.wikisource.org/) | Wikisource 贡献者 | CC-BY-SA 4.0 |
| CJK 字体 | [Source Han Serif](https://github.com/adobe-fonts/source-han-serif) 思源宋体 | Adobe | OFL |
| 西文字体 | [Spectral](https://fonts.google.com/specimen/Spectral) | Production Type | OFL |
| 多文字衬线 | [Noto Serif](https://fonts.google.com/noto) · Naskh Arabic · Serif Armenian · Serif Hebrew | Google | OFL |
| 题铭字体 | [KingHwaOldSong](https://fonts.zeoseven.com/) 京華老宋体 | ZeoSeven Fonts | 见 [licenses](licenses/) |

五千年之事，浩如烟海，疏漏舛误所不能免。同好如有可补之史料、可正之错讹、可申之考证，望于 [issues](https://github.com/Higashimado/FiveMillenniaEclipses/issues) 见告，不胜感激。

---

## Records

The corpus holds 12,026 records from 26 civilizations. Each record stores the original text, its translations and an editorial note as separate fields. The source files live under [data/](data/):

| File | Contents |
|---|---|
| [`data/records/schema.json`](data/records/schema.json) | Field definitions |
| [`data/records/manifest.json`](data/records/manifest.json) | File inventory |
| [`data/records/sources.json`](data/records/sources.json) | Bibliography |
| `data/records/<phenomenon>/<civilization>.jsonl` | The records themselves |

### East Asia

East Asia supplies 11,804 records, 98.2% of the corpus, running from 2137 BCE to 1911 CE. The Chinese branch draws on sixteen of the Twenty-Four Histories together with the Draft History of Qing, taking their treatises on astronomy, on the five phases and on the calendar along with their basic annals. It also draws on the classics (Shangshu, Shijing, [Chunqiu](https://zh.wikisource.org/wiki/春秋經) and [Zuozhuan](https://zh.wikisource.org/wiki/春秋左氏傳)), on the Yinxu oracle bones, and on a number of miscellanies and poems. Most texts follow the punctuated editions at [Wikisource](https://zh.wikisource.org/).

Twenty-three principal sources account for 11,666 records, 98.8% of the East Asian branch, ordered here by the earliest year each one records:

| Source | Period | Sol. | Lun. | Occ. | Conj. | Nov. | Com. | Records |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| [Book of Han, Treatise on the Five Phases](https://zh.wikisource.org/wiki/%E6%BC%A2%E6%9B%B8/%E5%8D%B7027) | 205 BCE – 2 CE | 45 |  |  |  |  |  | 45 |
| [Samguk sagi](https://zh.wikisource.org/wiki/%E4%B8%89%E5%9C%8B%E5%8F%B2%E8%A8%98/%E5%8D%B701) | 54 BCE – 911 CE | 44 |  |  |  | 3 | 7 | 54 |
| [Book of Later Han, Treatise on the Five Phases VI](https://zh.wikisource.org/wiki/%E5%BE%8C%E6%BC%A2%E6%9B%B8/%E5%8D%B7108) | 26–219 | 65 |  |  |  |  |  | 65 |
| [Book of Later Han, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E5%BE%8C%E6%BC%A2%E6%9B%B8/%E5%8D%B7102) | 55–213 | 1 |  |  |  | 11 | 17 | 29 |
| [Book of Song, Treatise on the Five Phases](https://zh.wikisource.org/wiki/%E5%AE%8B%E6%9B%B8/%E5%8D%B734) | 221–479 | 73 |  |  |  |  |  | 73 |
| [Book of Jin, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E6%99%89%E6%9B%B8/%E5%8D%B7013) | 222–418 |  | 1 |  |  | 6 | 47 | 54 |
| [Book of Wei, Treatise on Celestial Phenomena](https://zh.wikisource.org/wiki/%E9%AD%8F%E6%9B%B8/%E5%8D%B7105%E4%B9%8B%E4%B8%80) | 400–549 | 32 | 36 |  |  | 3 | 23 | 94 |
| [Book of Sui, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E9%9A%8B%E6%9B%B8/%E5%8D%B721) | 502–617 | 11 | 3 | 175 | 12 | 4 | 14 | 219 |
| [New Book of Tang, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E6%96%B0%E5%94%90%E6%9B%B8/%E5%8D%B7033) | 618–906 | 90 |  | 389 | 1 | 6 | 48 | 534 |
| [Old Book of Tang, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E8%88%8A%E5%94%90%E6%9B%B8/%E5%8D%B736) | 626–839 | 1 | 1 |  |  |  | 18 | 20 |
| [Rikkokushi](https://zh.wikisource.org/wiki/%E6%97%A5%E6%9C%AC%E6%9B%B8%E7%B4%80/%E5%8D%B7%E7%AC%AC%E4%B8%89%E5%8D%81) | 680–887 | 97 | 4 |  |  |  |  | 101 |
| [Fusō ryakki](https://zh.wikisource.org/wiki/%E6%89%B6%E6%A1%91%E7%95%A5%E8%A8%98/%E7%AC%AC023); Hyakurenshō; Azuma kagami | 898–1265 | 20 |  |  |  |  |  | 20 |
| [Old History of the Five Dynasties, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E8%88%8A%E4%BA%94%E4%BB%A3%E5%8F%B2/%E5%8D%B7139) | 911–958 | 9 | 11 |  |  |  | 6 | 26 |
| [History of Song, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E5%AE%8B%E5%8F%B2/%E5%8D%B7053) | 960–1275 | 121 | 149 | 4,819 |  | 17 | 21 | 5,127 |
| [Đại Việt sử ký toàn thư](https://zh.wikisource.org/wiki/%E5%A4%A7%E8%B6%8A%E5%8F%B2%E8%A8%98%E5%85%A8%E6%9B%B8/%E6%9C%AC%E7%B4%80%E5%8D%B7%E4%B9%8B%E4%BA%94) | 993–1774 | 46 | 32 |  |  |  |  | 78 |
| [Goryeosa, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E9%AB%98%E9%BA%97%E5%8F%B2/%E5%8D%B7%E5%9B%9B%E5%8D%81%E5%85%AB) | 1012–1393 | 119 | 97 | 1,911 | 4 | 3 | 15 | 2,149 |
| [History of Jin, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E9%87%91%E5%8F%B2/%E5%8D%B720) | 1120–1232 | 8 | 25 | 209 | 4 | 2 | 5 | 253 |
| [History of Yuan, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E5%85%83%E5%8F%B2/%E5%8D%B7049) | 1264–1367 | 35 |  | 571 | 8 | 1 | 18 | 633 |
| [History of Ming, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E6%98%8E%E5%8F%B2/%E5%8D%B726) | 1368–1642 |  |  | 972 | 45 |  | 38 | 1,055 |
| [History of Ming, Basic Annals](https://zh.wikisource.org/wiki/%E6%98%8E%E5%8F%B2/%E5%8D%B72) | 1371–1643 | 75 |  |  |  |  |  | 75 |
| [Veritable Records of the Joseon Dynasty](https://zh.wikisource.org/wiki/%E6%9C%9D%E9%AE%AE%E7%8E%8B%E6%9C%9D%E5%AF%A6%E9%8C%84/%E5%93%B2%E5%AE%97%E5%AF%A6%E9%8C%84/%E5%8D%81%E4%BA%8C%E5%B9%B4) | 1400–1863 | 84 | 32 |  |  | 84 | 297 | 497 |
| [Draft History of Qing, Treatise on Astronomy](https://zh.wikisource.org/wiki/%E6%B8%85%E5%8F%B2%E7%A8%BF/%E5%8D%B737) | 1618–1796 | 50 |  | 357 |  |  | 25 | 432 |
| [Draft History of Qing, Basic Annals](https://zh.wikisource.org/wiki/%E6%B8%85%E5%8F%B2%E7%A8%BF/%E5%8D%B716) | 1646–1911 | 33 |  |  |  |  |  | 33 |

The remaining twenty-seven sources hold 138 records, among them the Zhongkang eclipse in the [Shangshu, "Yinzheng"](https://zh.wikisource.org/wiki/尚書/胤征), the Yinxu oracle bones, the [Shijing, "Xiaoya, Shiyue zhi jiao"](https://zh.wikisource.org/wiki/詩經/十月之交), Lu Tong's [Yueshi shi](https://zh.wikisource.org/wiki/全唐詩/卷388) and Han Yu's [Yueshi shi xiao Yuchuanzi zuo](https://zh.wikisource.org/wiki/全唐詩/卷340), the [Liaoshi](https://zh.wikisource.org/wiki/%E9%81%BC%E5%8F%B2/%E5%8D%B722), Fujiwara no Teika's Meigetsuki, the [Xixia shushi](https://zh.wikisource.org/wiki/%E8%A5%BF%E5%A4%8F%E6%9B%B8%E4%BA%8B/29), the [Changchun zhenren xiyou ji](https://zh.wikisource.org/wiki/%E9%95%B7%E6%98%A5%E7%9C%9F%E4%BA%BA%E8%A5%BF%E9%81%8A%E8%A8%98/%E5%8D%B7%E4%B8%8A), the [Xu Zizhi Tongjian](https://zh.wikisource.org/wiki/續資治通鑑) and Shu Yuexiang's Rishi.

### Elsewhere

Beyond East Asia lie 222 records across 21 civilizations. They are not the product of an office keeping watch day by day; they are single witnesses, one event at a time. Before the modern period the sources are chronicles, histories, codices and tablets. From the seventeenth century onward there are no longer books but observatory reports, learned-society communications and private letters, so the third column below lists works and observers together.

| Civilization | Period | Works and reports | Sol. | Lun. | Records |
|---|---|---|---:|---:|---:|
| Islamic | 829–1226 | [Ḥabash al-Ḥāsib](https://gallica.bnf.fr/ark:/12148/bpt6k5626201z), [al-Māhānī](https://gallica.bnf.fr/ark:/12148/bpt6k5626201z), al-Battānī, [Ibn Amājūr](https://gallica.bnf.fr/ark:/12148/bpt6k5626201z), [Ibn Yūnus](https://gallica.bnf.fr/ark:/12148/bpt6k5626201z), [al-Bīrūnī](https://archive.org/details/chronologyofanci00biru), [Ibn al-Athīr, *al-Kamil fi al-Ta'rikh*](https://archive.org/details/kamil-Tornberg), [Ibn ʿIdhārī](https://archive.org/details/bub_gb_MiyHAAAAMAAJ) | 19 | 27 | 46 |
| Britain | 664–1919 | [Bede, *Historia Ecclesiastica*](https://www.gutenberg.org/cache/epub/38326/pg38326-images.html), [*Anglo-Saxon Chronicle*](https://en.wikisource.org/wiki/Anglo-Saxon_Chronicle), [John of Worcester, *Chronicon ex chronicis*](https://archive.org/details/florentiiwigorn00florgoog), [William of Malmesbury, *Historia Novella*](https://archive.org/details/stubdegestisregumanglorum1), [Henry of Huntingdon, *Historia Anglorum*](https://archive.org/details/henriciarchidia00unkngoog), [Gervase of Canterbury, *Chronica*](https://archive.org/details/thehistoricalworksofgerva1), [Matthew Paris, *Chronica Majora*](https://archive.org/details/matthiparisiensi03pari), [Thomas Walsingham, *Historia Anglicana*](https://archive.org/details/thomaewalsingham01wals), [Walter Bower, *Scotichronicon*](https://archive.org/details/scotichronicon-v-1-bks-1-2), John Lamont, John Nicoll, [Alice Thornton](https://archive.org/details/autobiographyofm00thor), [John Evelyn](https://archive.org/details/in.ernet.dli.2015.272771), [Halley](https://archive.org/details/bim_eighteenth-century_a-description-of-the-pas_halley-edmund_1715_0), [Baily](https://archive.org/details/paper-doi-10_1093_mnras_4_2_15), [De la Rue](https://archive.org/details/ontotalsolarecli00dela), [Lockyer](https://archive.org/details/contributionsto00lockgoog), Copeland, [Dyson](https://archive.org/details/philtrans06337895), Eddington | 31 | 8 | 39 |
| HRE | 806–1852 | [*Annales regni Francorum*](https://thelatinlibrary.com/annalesregnifrancorum.html), [*Annales Bertiniani*](https://archive.org/stream/annalesbertinian00wait/annalesbertinian00wait_djvu.txt), [*Annales Hildesheimenses*](https://www.dmgh.de/mgh_ss_3/index.htm), [*Annales Marbacenses*](https://www.dmgh.de/mgh_ss_rer_germ_9/index.htm), [Annalista Saxo](https://www.dmgh.de/mgh_ss_6/index.htm), [Regino of Prüm, *Chronicon*](https://www.dmgh.de/mgh_ss_rer_germ_50/), [Sigebert of Gembloux, *Chronicon*](https://www.dmgh.de/mgh_ss_6/index.htm), [Peter of Zittau, *Zbraslav Chronicle*](https://archive.org/details/fontesrerumbohem04emle), [Vavřinec of Březová, *Historia Hussitica*](https://archive.org/details/fontesrerumbohe00goog), [Gemma Frisius](https://archive.org/details/gemmaefrisiimedi00gemm), David Fabricius, [Kepler, *Ad Vitellionem Paralipomena*](https://archive.org/details/advitellionempar00kepl), [*De Stella Nova*](https://archive.org/details/10873675bsb), Heinsius, Rümker, Busch, Galle, d'Arrest, Wolf, Klinkerfues | 12 | 16 | 28 |
| America | 1806–1918 | [Ferrer](https://archive.org/details/jstor-1004811), Maria Mitchell, Harkness, Gilman, Rogers, Young, Lockett, Willson, Seagrave, [Campbell](https://archive.org/details/jstor-984400), Hammond, Adams, [Stebbins](https://archive.org/details/jstor-984404), Morehouse, Pettit | 19 | 0 | 19 |
| Babylon | 1223–183 BCE | [*Babylonian Astronomical Diaries*](http://oracc.museum.upenn.edu/adsd/), [Ptolemy, *Almagest*](https://archive.org/details/bub_gb_a9nvvbG-OOIC), [tablet BM 33066](https://cdli.earth/search?q=BM+33066), [Ugaritic tablet KTU 1.78](https://cdli.earth/search?q=RS+12.061) | 1 | 11 | 12 |
| Italy | 1178–1852 | [Romuald II Guarna, *Chronicon*](https://www.dmgh.de/mgh_ss_19/), [Ristoro d'Arezzo, *La composizione del mondo*](https://archive.org/details/lacomposizionedelmondo), [Salimbene de Adam, *Cronica*](https://www.dmgh.de/mgh_ss_32/index.htm), [*Annales Placentini Gibellini*](https://www.dmgh.de/mgh_ss_18/), [*Chronicon Foroliviense*](https://archive.org/details/rerumitalicarums271mura), [Nicolò Barbaro, *Giornale dell'assedio di Costantinopoli*](https://vec.wikisource.org/wiki/Giornale_dell%27assedio_di_Costantinopoli_1453), [Gervase of Canterbury, *Chronica*](https://archive.org/details/thehistoricalworksofgerva1), [Clavius](https://archive.org/details/christophoriclau00clav_1), [Kepler, *De Stella Nova*](https://archive.org/details/10873675bsb), Secchi | 8 | 4 | 12 |
| Syriac | 512–1191 | [Michael the Syrian, *Chronicle*](https://archive.org/details/chroniquedemiche01mich) | 9 | 2 | 11 |
| France | 1033–1905 | [Rodulfus Glaber, *Historiarum libri quinque*](https://archive.org/details/rodulfiglabrihis0000glab), [Robert of Torigny, *Chronica*](https://www.dmgh.de/mgh_ss_6/index.htm), [*Le Petit Thalamus de Montpellier*](https://archive.org/details/thalamusparvusmontpellierma), [Michel Pintoin, *Chronicorum Karoli Sexti*](https://gallica.bnf.fr/ark:/12148/bpt6k6224315z), Maraldi, Cassini, Janssen, Lescarbault, Štefánik | 8 | 2 | 10 |
| Iberia | 939–1560 | [*Annales Castellani Antiquiores*](https://archive.org/details/espanasagradathe23flor), [*Anales Toledanos Primeros*](https://archive.org/details/espanasagradathe23flor), [*Crónica de Cerrato*](https://archive.org/details/espanasagradathe23flor), [*Chronicon Conimbricense*](https://archive.org/details/portugaliaemonumentahistoricascrv1), [Andrés Bernáldez, *Historia de los Reyes Católicos*](https://archive.org/details/historiadelosrey00bern), Ferdinand Columbus, *Historie*, [Clavius](https://archive.org/details/christophoriclau00clav_1) | 7 | 1 | 8 |
| Armenia | 1099–1736 | [Matthew of Edessa](https://archive.org/details/bub_gb_YlkuAAAAQAAJ), [Gregory the Priest](https://archive.org/details/bub_gb_YlkuAAAAQAAJ), [Samuel of Ani, *Tables chronologiques*](https://archive.org/details/collectiondhist00arhagoog), [Arakel of Tabriz](https://archive.org/details/collectiondhist00arhagoog), [Abraham of Crete](https://archive.org/details/collectiondhist00arhagoog) | 4 | 3 | 7 |
| Greek | 648 BCE – 71 CE | [Archilochus, fr. 122 West](https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.01.0060:bekker+page=1418b), [Herodotus, *Historiae*](https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.01.0126:book=1:chapter=74), [Thucydides, *History of the Peloponnesian War*](https://en.wikisource.org/wiki/History_of_the_Peloponnesian_War/Book_7), [Diodorus Siculus, *Bibliotheca Historica*](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Diodorus_Siculus/20A*.html), [Pappus of Alexandria, *Commentary on the Almagest*](https://archive.nyu.edu/bitstream/2451/61288/56/11.%20Carman.pdf), [Plutarch, *De facie in orbe lunae*](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Plutarch/Moralia/The_Face_in_the_Moon*/home.html) | 6 | 1 | 7 |
| Norse | 1030–1581 | [Snorri Sturluson, *Heimskringla*](https://www.gutenberg.org/files/598/598-h/598-h.htm), [Sturla Þórðarson, *Saga of Haakon Haakonsson*](https://archive.org/details/icelandicsagasot02stur), [Tycho Brahe, *Astronomiae Instauratae Progymnasmata*](https://archive.org/details/bub_gb_CVOItHLenPEC), [Gassendi](https://archive.org/details/den-kbd-pil-130018157889-001) | 3 | 2 | 5 |
| Slavic | 1185–1406 | [*Hypatian Chronicle*](https://archive.org/details/Complete_Collection_of_Russian_Chronicles_1923_Vol_2_Hypatian_Chronicle), [*Laurentian Chronicle*](https://archive.org/details/Complete_Collection_of_Russian_Chronicles_1926_Vol_1_Laurentian_Chronicle), [*Novgorod First Chronicle*](https://archive.org/details/chronicleofnovgo00michrich), [*Chronicle of Janko z Czarnkowa*](https://archive.org/details/monumentapoloni00bielgoog) | 4 | 0 | 4 |
| Byzantium | 968–1453 | [Leo the Deacon, *Historia*](https://archive.org/details/corpusscriptoru12unkngoog), [Anna Komnene](https://en.wikisource.org/wiki/The_Alexiad), Pseudo-Sphrantzes, *Chronicon Maius* | 2 | 1 | 3 |
| Russia | 1748–1791 | Braun, Popov, Rumovsky, Inochodzov | 3 | 0 | 3 |
| Rome | 190–168 BCE | [Livy, *Ab Urbe Condita*](https://www.thelatinlibrary.com/livy/liv.37.shtml), [Plutarch, *Aemilius Paullus*](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Plutarch/Lives/Aemilius*.html) | 1 | 1 | 2 |
| Maya | 755, 859 | [*Dresden Codex*](https://www.famsi.org/mayawriting/codices/dresden.html) | 2 | 0 | 2 |
| Hittite | 1312 BCE | *Annals of Mursili II* | 1 | 0 | 1 |
| Assyria | 763 BCE | [*Limmu list*](https://oracc.museum.upenn.edu/saao/saas2/) | 1 | 0 | 1 |
| Aztec | 1496 | *Codex Telleriano-Remensis* | 1 | 0 | 1 |
| Latin America | 1923 | Joaquín Gallo | 1 | 0 | 1 |

## Tables

The eclipse tables share their computing engine with [Substellar Atlas](https://github.com/Higashimado/SubstellarAtlas), while the elements themselves come mostly from the NASA/Espenak five-millennium canons ([5MCSE / 5MCLE](https://eclipse.gsfc.nasa.gov/)): 9,506 solar and 9,650 lunar eclipses. The canon opens at astronomical year −1999, that is 2000 BCE; for the stretch before it no canon exists, so the Besselian elements are computed from the [JPL DE441](https://ssd.jpl.nasa.gov/planets/eph_export.html) ephemeris, giving a further 2,365 solar and 2,381 lunar eclipses, each carrying a longitude standard error between 4.48° and 7.30°.

**Directory**

| File | Contents | Size |
|---|---|---|
| [`data/eclipses/solar.json`](data/eclipses/solar.json) | Solar index | 11,871 entries · 9.1 MB |
| [`data/eclipses/lunar.json`](data/eclipses/lunar.json) | Lunar index | 12,031 entries · 9.3 MB |
| [`data/eclipses/events/`](data/eclipses/events/) `<date>.json` | Contact curves and Besselian polynomials | 11,871 files · 219 MB |
| [`data/eclipses/bessel-5mcse.json`](data/eclipses/bessel-5mcse.json) | NASA 5MCSE elements | 9,506 entries |

## Cross-references

Six lookup tables index the places, the dates and the objects named in the records, and they are what binds a record to its event.

**Directory**

| File | Contents | Entries |
|---|---|---:|
| [`data/duizhao/xingguan.json`](data/duizhao/xingguan.json) | Celestial objects | 391 |
| [`data/duizhao/nianhao.json`](data/duizhao/nianhao.json) | Chinese era names (140 BCE – 1911) | 330 |
| [`data/duizhao/nengo.json`](data/duizhao/nengo.json) | Japanese era names (645 – present) | 241 |
| [`data/duizhao/diming.json`](data/duizhao/diming.json) | Observation sites | 164 |
| [`data/duizhao/wenming.json`](data/duizhao/wenming.json) | Civilization identities | 28 |
| [`data/duizhao/quyu.json`](data/duizhao/quyu.json) | Geographic regions | 124 |

## Credits & License

The project's own code is released under the [**GNU General Public License v3.0**](LICENSE); [`data/records/`](data/records/README.md) and [`data/duizhao/`](data/duizhao/README.md) are released under [**CC-BY-SA 4.0**](https://creativecommons.org/licenses/by-sa/4.0/). Third-party code, data and fonts keep their own licences.

| Purpose | Component (version) | Author / Source | License |
|---|---|---|---|
| Shadow geometry | [SubstellarAtlas](https://github.com/Higashimado/SubstellarAtlas) | Higashimado | GPL-3.0 |
| Map engine | [Leaflet](https://leafletjs.com/) 1.9.4 | Volodymyr Agafonkin | BSD-2-Clause |
| Vector rendering | [MapLibre GL JS](https://maplibre.org/) 5.24.0 | MapLibre | BSD-3-Clause |
| Layer bridge | [maplibre-gl-leaflet](https://github.com/maplibre/maplibre-gl-leaflet) 0.1.3 | MapLibre | ISC |
| Time filtering | [maplibre-gl-dates](https://github.com/OpenHistoricalMap/maplibre-gl-dates) 1.3.0 | OpenHistoricalMap | ISC |
| Astronomy | [Astronomy Engine](https://github.com/cosinekitty/astronomy) 2.1.19 | Don Cross | MIT |
| Eclipse canon | [5MCSE / 5MCLE](https://eclipse.gsfc.nasa.gov/) | Fred Espenak (NASA GSFC) | Public domain + attribution |
| Ancient ephemeris | [JPL DE441](https://ssd.jpl.nasa.gov/planets/eph_export.html) | JPL | Public domain |
| Earth rotation | [Stephenson, Morrison & Hohenkerk 2016](https://doi.org/10.1098/rspa.2016.0404) | Royal Society | CC BY-SA 4.0 |
| Historical basemap | [OpenHistoricalMap](https://www.openhistoricalmap.org/) | OHM community | Data CC0 |
| Modern basemap | [CARTO](https://carto.com/) Positron · Voyager | CARTO | © CARTO |
| Modern basemap | [OpenStreetMap](https://www.openstreetmap.org/) standard layer | OSM contributors | ODbL |
| Terrain basemap | [Esri World Shaded Relief](https://www.esri.com/) | Esri / USGS | © Esri |
| Basemap data | [OpenStreetMap](https://www.openstreetmap.org/copyright) | OSM contributors | ODbL |
| Dynastic texts | [Wikisource](https://zh.wikisource.org/) | Wikisource contributors | CC-BY-SA 4.0 |
| CJK fonts | [Source Han Serif](https://github.com/adobe-fonts/source-han-serif) | Adobe | OFL |
| Latin fonts | [Spectral](https://fonts.google.com/specimen/Spectral) | Production Type | OFL |
| Multi-script serif | [Noto Serif](https://fonts.google.com/noto) · Naskh Arabic · Serif Armenian · Serif Hebrew | Google | OFL |
| Display font | [KingHwaOldSong](https://fonts.zeoseven.com/) | ZeoSeven Fonts | see [licenses](licenses/) |

Five millennia make a wide field, and omissions and errors are unavoidable. Further sources, corrections and arguments on dating or identification are all welcome: just open an [issue](https://github.com/Higashimado/FiveMillenniaEclipses/issues).
