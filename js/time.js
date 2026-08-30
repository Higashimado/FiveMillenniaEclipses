/**
 * time.js — TimeState: the one instant the map, the shadow geometry and the scrubber
 * all read, published to subscribers on every change.
 *
 * The instant is baseline + offset, clamped to the service window −3000…1999. Everything
 * is UTC: this atlas has no timezone axis, and the two places that do need a local
 * reckoning derive it themselves (the twelve shichen in the observation popup, the
 * East-8 civil day in the chronicle line).
 *
 * TimeState is a LEXICAL global — this module does NOT attach it to window, so reach it
 * by bareword behind a `typeof` guard, never as window.TimeState.
 */
const TimeState = (() => {
  let baseline = new Date();
  let offsetMinutes = 0;

  const subscribers = [];

  function _compute() {
    return new Date(baseline.getTime() + offsetMinutes * 60000);
  }

  function _notify(date) {
    subscribers.forEach((fn) => fn(date));
  }

  // ---- Valid range clamp + out-of-range notification ----
  // All date mutations funnel through here so the service window cannot be escaped:
  // −3000-01-01 … 1999-12-31 UTC, astronomical years, the span the catalogue covers.
  // Date.UTC is safe for these two literals in particular — it mis-maps only years 0–99,
  // and JS Date reaches ±273790 years from 1970, so −3000 sits well inside. Wherever the
  // year is a variable instead, build the instant with setUTCFullYear.
  const _RANGE_MIN = Date.UTC(-3000, 0, 1, 0, 0, 0);
  const _RANGE_MAX = Date.UTC(1999, 11, 31, 23, 59, 59); // service window −3000…1999 (≈5 millennia)
  const _rangeSubs = [];

  // Clamp `date` to the valid range, reporting whether it was changed.
  function _clampWithFlag(date) {
    const t = date.getTime();
    if (t < _RANGE_MIN) return { date: new Date(_RANGE_MIN), clamped: true };
    if (t > _RANGE_MAX) return { date: new Date(_RANGE_MAX), clamped: true };
    return { date: date, clamped: false };
  }

  function _notifyRange() {
    _rangeSubs.forEach((fn) => fn());
  }

  // Commit a new baseline (slider offset reset to 0), clamping to the valid range and
  // emitting a range event if the target fell outside it.
  function _commitBaseline(date) {
    const r = _clampWithFlag(date);
    baseline = r.date;
    offsetMinutes = 0;
    _notify(_compute());
    if (r.clamped) _notifyRange();
  }

  // ---- Public API ----

  return {
    get current() {
      return _compute();
    },

    setTime(date) {
      // Clamp the effective time but keep the baseline/offset model intact
      // (resetting baseline would break the locked-range slider centering).
      const r = _clampWithFlag(date);
      offsetMinutes = (r.date.getTime() - baseline.getTime()) / 60000;
      _notify(_compute());
      if (r.clamped) _notifyRange();
    },

    subscribe(fn) {
      subscribers.push(fn);
    },

    /** Register a callback fired whenever a date is clamped to the valid range. */
    onRangeClamp(fn) {
      _rangeSubs.push(fn);
    },

    /** Reset baseline to `date` and clear the slider offset. */
    resetTo(date) {
      _commitBaseline(new Date(date));
    },

    // ---- Timezone ----

    // ---- Preset jumps (adjust baseline, reset slider) ----

    // ---- Playback (60 fps loop, configurable speed multiplier) ----
    // Each frame advances simulated time by `baseSecondsPerFrame * speed`.
    // 1× ≈ 1 simulated minute per real second; 16× compresses ~16 minutes/sec.
    _playInterval: null,
    _playSpeed: 1,

    isPlaying() {
      return this._playInterval !== null;
    },

    startPlayback(speed) {
      if (typeof speed === 'number') this._playSpeed = speed;
      if (this._playInterval) return;
      // `_playSpeed` is the simulated-to-real ratio (spec 4.3):
      //   1x = realtime, 60x = 1 minute/sec, 360x = 6 minutes/sec.
      // Real frame interval is 50 ms (20 fps), so simulated ms per frame =
      // _playSpeed * 50.
      const frameMs = 50;
      const self = this;
      this._playInterval = setInterval(function () {
        const next = new Date(_compute().getTime() + self._playSpeed * frameMs);
        const r = _clampWithFlag(next);
        self.setTime(r.date);
        // Hitting a boundary auto-stops playback and notifies once, rather than
        // pinning at the edge and re-firing the range event every frame.
        if (r.clamped) {
          self.stopPlayback();
          _notifyRange();
        }
      }, frameMs);
    },

    stopPlayback() {
      if (this._playInterval) {
        clearInterval(this._playInterval);
        this._playInterval = null;
      }
    },

    // ---- Formatting ----

    // ---- Range lock (for eclipse playback windows) ----
    // When a lock is active the slider's effective range narrows to the
    // window. Subscribers can read `lockedRange` to size their own controls.
    _lockedRange: null,
    get lockedRange() {
      return this._lockedRange;
    },
    // `anchor` is where the slider should sit at 0 offset — pass the event's
    // greatest-eclipse instant. Without it the baseline falls on the window's
    // midpoint, which is NOT greatest: the contact window is asymmetric about G
    // (1179-09-10 is 43m12s from c1 to G but 42m17s from G to c4), so the
    // midpoint sat ~28s early and the read-out disagreed with the card and the
    // scrubber's own G tick by a whole displayed minute.
    lockRange(from, to, anchor) {
      if (!(from instanceof Date) || !(to instanceof Date)) return;
      if (to <= from) return;
      // Clamp both ends to the service window — the one setter that writes
      // baseline outside the central _clampWithFlag funnel. In-window event
      // data never trips this, but a lock built from out-of-range times (or a
      // future extended catalog) must not let baseline escape −3000…1999.
      const cf = _clampWithFlag(from),
        ct = _clampWithFlag(to);
      from = cf.date;
      to = ct.date;
      if (to <= from) return;
      this._lockedRange = { from: new Date(from), to: new Date(to) };
      // Re-anchor baseline on G so the ±slider stays centered on greatest
      // eclipse; midpoint only as a fallback when no anchor is supplied.
      const a = anchor instanceof Date ? _clampWithFlag(anchor).date : null;
      baseline = a && a >= from && a <= to ? new Date(a) : new Date((from.getTime() + to.getTime()) / 2);
      offsetMinutes = 0;
      _notify(_compute());
      if (cf.clamped || ct.clamped) _notifyRange();
    },
    unlockRange() {
      if (this._lockedRange) {
        this._lockedRange = null;
        _notify(_compute());
      }
    },
  };
})();
