/** calendars.js — Sinocentric calendar reckoning for the shu'er chronicle line.

   Turns a proleptic-Gregorian civil date into:
     - the day ganzhi (sexagenary cycle), authoritative & calendar-system-free;
     - the Chinese lunisolar month (dingshuo + dingqi + no-zhongqi intercalation), a *reckoned* reconstruction;
     - the proleptic Julian calendar date (the calendar a pre-1582 European
       chronicler actually used), for Western "cultural equivalent" localization.

   The lunisolar rule mirrors Shouxingli astronomical calendar (sxwnl, lunar.js): months are numbered from the
   month (yue) that contains dongzhi (= 11th month, jianyin/xiazhen (Xia calendar)); a sui (solstice-to-solstice year) holding 13
   new-moon months takes the first zhongqi-less month as its intercalary month (run-yue), shifting later months
   back one. All qi-shuo (solar-term/new-moon) boundaries are judged on the East-8 (UT+8) civil day, per sxwnl,
   so results line up with the historical historical calendar (guli). Unlike sxwnl we take exact dingshuo/dingqi (fixed-new-moon/astronomical-solar-term)
   from astronomy-engine (window.Astronomy, MIT) rather than its bundled eph.js.

   Fidelity notes:
     - Day ganzhi is exact: a continuous, never-broken 60-day count, with K=49
       calibrated against curated Chunqiu (Spring and Autumn Annals) records.
     - The month is computation (tuisuan), not a source quotation. It assumes Xia calendar system (jianyin)
       for all years; pre-104 BCE government-issued calendar month-establishment shifts (Qin jianhài system, extra-ninth-month…)
       are NOT modelled — a documented limitation of the reckoned display.
*/
const SinoCal = (() => {
  'use strict';

  // ---- constants ----
  const STEMS = '甲乙丙丁戊己庚辛壬癸';
  const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
  const GANZHI_K = 49; // ganzhi_index = (JDN + 49) % 60, 0 == 甲子
  const J2000_JD = 2451545.0; // Julian Date of the J2000.0 epoch (astronomy-engine .ut = 0)
  const CST = 8 / 24; // East-8 civil-time offset (Shouxingli convention)
  // Month names by yue-jian (month establishment) index (jianyin), matching YMC below:
  // 0 is the 11th month, 1 the 12th, 2 the 1st (zhengyue), and so on round to 11 = the 10th.
  const YMC = ['十一', '十二', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  // JDN of the Gregorian reform: dates before this were recorded in the Julian calendar.
  const GREGORIAN_REFORM_JDN = 2299161; // 1582-10-15 (proleptic Gregorian)
  const _lsCache = new Map(); // memo: the strip re-renders the same event often

  // Resolve astronomy-engine from the browser global, or an injected one (node tests).
  function ae() {
    const A =
      (typeof globalThis !== 'undefined' && globalThis.Astronomy) ||
      (typeof window !== 'undefined' && window.Astronomy) ||
      (typeof Astronomy !== 'undefined' ? Astronomy : null);
    if (!A) throw new Error('SinoCal: astronomy-engine (Astronomy) not loaded');
    return A;
  }

  // ---- pure day arithmetic ----

  // Julian Day Number of a proleptic-Gregorian date (astronomical year numbering,
  // so year 0 == 1 BCE). Floor division → valid for BCE. Ported verbatim from the
  // build's JDN so the day ganzhi matches the pipeline that wrote the records.
  function jdnGregorian(year, month, day) {
    const a = Math.floor((14 - month) / 12);
    const y = year + 4800 - a;
    const m = month + 12 * a - 3;
    return (
      day +
      Math.floor((153 * m + 2) / 5) +
      365 * y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) -
      32045
    );
  }

  // Proleptic *Julian*-calendar date from a Julian Day Number (Richards' algorithm).
  function julianFromJDN(jdn) {
    const c = jdn + 32082;
    const d = Math.floor((4 * c + 3) / 1461);
    const e = c - Math.floor((1461 * d) / 4);
    const m = Math.floor((5 * e + 2) / 153);
    return {
      d: e - Math.floor((153 * m + 2) / 5) + 1,
      m: m + 3 - 12 * Math.floor(m / 10),
      y: d - 4800 + Math.floor(m / 10),
    };
  }

  /**
   * Day ganzhi of a proleptic-Gregorian date. Authoritative (no calendar-system slack).
   * @returns {{index:number, stem:string, branch:string, str:string}}
   */
  function dayGanzhi(year, month, day) {
    const idx = (((jdnGregorian(year, month, day) + GANZHI_K) % 60) + 60) % 60;
    return { index: idx, stem: STEMS[idx % 10], branch: BRANCHES[idx % 12], str: STEMS[idx % 10] + BRANCHES[idx % 12] };
  }

  /**
   * Proleptic Julian-calendar date of a proleptic-Gregorian date.
   * @returns {{y:number, m:number, d:number, beforeReform:boolean}}
   */
  function toJulian(year, month, day) {
    const jdn = jdnGregorian(year, month, day);
    const jd = julianFromJDN(jdn);
    jd.beforeReform = jdn < GREGORIAN_REFORM_JDN;
    return jd;
  }

  // ---- astronomy-engine helpers ----

  // BCE-safe AstroTime for a UT instant. `new Date(0)` + setUTCFullYear avoids the
  // 0–99 → 1900–1999 remap that Date.UTC applies, as everywhere else here.
  function mkTime(year, month, day, hourUT) {
    const dt = new Date(0);
    dt.setUTCFullYear(year, month - 1, day);
    dt.setUTCHours(hourUT || 0, 0, 0, 0);
    return ae().MakeTime(dt);
  }

  // East-8 civil-day integer of an AstroTime (all qi-shuo (solar-term/new-moon)/target comparisons use this).
  function bjDay(t) {
    return Math.floor(t.ut + J2000_JD + CST + 0.5);
  }

  function nextNewMoon(after) {
    return ae().SearchMoonPhase(0, after.AddDays(1), 40);
  }

  // The new moon whose shuori (new-moon day) ≤ `anchor` and whose successor is > `anchor`
  // (i.e. the shou-shuo (opening new moon) that opens the month containing that instant).
  function newMoonOnOrBefore(anchor) {
    let nm = ae().SearchMoonPhase(0, anchor.AddDays(-40), 45);
    for (;;) {
      const nxt = nextNewMoon(nm);
      if (bjDay(nxt) <= bjDay(anchor)) nm = nxt;
      else break;
    }
    return nm;
  }

  // ---- lunisolar month reckoning ----

  /**
   * Chinese lunisolar month of a proleptic-Gregorian date.
   * @returns {{monthNum:number, isLeap:boolean, season:string, label:string}|null}
   *   monthNum 1..12 (xiazhen (Xia calendar)), isLeap true for a intercalary month (run-yue), season one of chun/xia/qiu/dong (spring/summer/autumn/winter),
   *   label e.g. "夏四月" / "闰四月". null if astronomy-engine is unavailable.
   */
  function lunisolar(year, month, day) {
    let A;
    try {
      A = ae();
    } catch (e) {
      return null;
    } // not cached — AE may load later
    const key = year + ':' + month + ':' + day;
    if (_lsCache.has(key)) return _lsCache.get(key);

    const tgt = mkTime(year, month, day, 4); // 04 UT == Beijing noon (mid-civil-day)
    const tgtDay = bjDay(tgt);

    // Anchoring dongzhi (opening of the sui/year-cycle): the winter solstice with dongzhi ≤ target < next dongzhi.
    const wsCurr = A.SearchSunLongitude(270, mkTime(year, 11, 1, 4), 90); // ~Dec of `year`
    const wsPrev = A.SearchSunLongitude(270, mkTime(year - 1, 11, 1, 4), 90); // ~Dec of `year-1`
    const anchor = tgtDay >= bjDay(wsCurr) ? wsCurr : wsPrev;

    // 13 zhongqi from the anchor dongzhi to the next dongzhi (longitudes 270,300,…,240,270).
    const zqDay = [bjDay(anchor)];
    let prev = anchor;
    for (let k = 1; k <= 12; k++) {
      const t = A.SearchSunLongitude((270 + 30 * k) % 360, prev.AddDays(20), 40);
      zqDay.push(bjDay(t));
      prev = t;
    }

    // 15 new moons bracketing the sui (year-cycle): the shou-shuo, which opens the
    // 11th month, plus its successors.
    const shuo = [newMoonOnOrBefore(anchor)];
    for (let i = 1; i < 15; i++) shuo.push(nextNewMoon(shuo[i - 1]));
    const shuoDay = shuo.map(bjDay);

    // no-zhongqi intercalation: only when the sui (year-cycle) holds 13 new-moon
    // months — i.e. the mo-shuo (final new moon) still falls before the second dongzhi.
    let leap = 0;
    if (shuoDay[13] <= zqDay[12]) {
      for (let i = 1; i <= 12; i++) {
        const a = shuoDay[i],
          b = shuoDay[i + 1];
        const hasZhongqi = zqDay.some((z) => z >= a && z < b);
        if (!hasZhongqi) {
          leap = i;
          break;
        }
      }
    }

    // Locate the month interval containing the target.
    let mi = -1;
    for (let i = 0; i < 14; i++) {
      if (tgtDay >= shuoDay[i] && tgtDay < shuoDay[i + 1]) {
        mi = i;
        break;
      }
    }
    if (mi < 0) {
      _lsCache.set(key, null);
      return null;
    }

    const isLeap = leap > 0 && mi === leap;
    const nameIdx = leap > 0 && mi >= leap ? mi - 1 : mi; // shift after the intercalary month (run-yue)
    const monthNum = ((nameIdx + 10) % 12) + 1; // YMC index → 1..12
    const season = seasonLabel(monthNum);
    const result = { monthNum, isLeap, season, label: season + (isLeap ? '闰' : '') + YMC[nameIdx % 12] + '月' };
    _lsCache.set(key, result);
    return result;
  }

  // ---- label helpers ----

  function seasonLabel(monthNum) {
    return monthNum <= 3 ? '春' : monthNum <= 6 ? '夏' : monthNum <= 9 ? '秋' : '冬';
  }

  // lunisolar month name (xiazhen (Xia calendar)) for a 1..12 month number — no day needed: 1→正月 … 12→十二月.
  // Reuses the YMC yue-jian (month establishment) table (monthNum → YMC index = (monthNum + 1) % 12) so a month-
  // precision record renders the same month name (yue-ming) as day-precise lunisolar().label, minus any leap
  // mark (a coarse date carries no leap information to place a intercalary month (run-yue)).
  function monthName(monthNum) {
    return YMC[(monthNum + 1) % 12] + '月';
  }

  return {
    STEMS,
    BRANCHES,
    jdnGregorian,
    dayGanzhi,
    toJulian,
    lunisolar,
    seasonLabel,
    monthName,
    _internal: { bjDay, mkTime, julianFromJDN }, // exposed for unit tests
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SinoCal;
