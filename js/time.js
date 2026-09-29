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

  // ---- Valid Range Clamp And Out-Of-Range Notification ----

  // All date mutations funnel through here so the service window cannot be escaped.
  // Date.UTC is safe for these two literals only because it mis-maps years 0–99;
  // wherever the year is a variable instead, build the instant with setUTCFullYear.
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

    // ---- Playback ----

    _playInterval: null,
    _playSpeed: 1,

    isPlaying() {
      return this._playInterval !== null;
    },

    startPlayback(speed) {
      if (typeof speed === 'number') this._playSpeed = speed;
      if (this._playInterval) return;

      // `_playSpeed` is the simulated-to-real ratio: 1x is realtime, 60x is one
      // simulated minute per real second. The frame interval is fixed at 50 ms,
      // so each tick advances `_playSpeed * 50` simulated ms.
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

    // ---- Range Lock ----
    // When a lock is active the slider's effective range narrows to the
    // window. Subscribers can read `lockedRange` to size their own controls.
    _lockedRange: null,
    get lockedRange() {
      return this._lockedRange;
    },
    // `anchor` is where the slider sits at 0 offset — always pass the event's greatest-
    // eclipse instant. The contact window is asymmetric, so its midpoint would put the
    // read-out at odds with the event card and the scrubber's G tick.
    lockRange(from, to, anchor) {
      if (!(from instanceof Date) || !(to instanceof Date)) return;
      if (to <= from) return;

      // Clamp both ends to the service window — the one setter that writes baseline
      // outside the central _clampWithFlag funnel, since a lock built from
      // out-of-range times must not let baseline escape it either.
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
