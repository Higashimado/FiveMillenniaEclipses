/**
 * envelope-ring.js — re-chain the umbral envelope's null-split fragments into closed rings.
 *
 * Public API: EnvelopeRing.{splitOnNull, asCompact, buildEnvelopeRings}.
 *
 * Why its own file rather than living inside eclipse.js: it carries a CJS footer so the
 * off-line regression harness can require the chainer directly. Every other module here is
 * a `<script defer>` IIFE with no export, and so cannot be exercised outside a browser.
 *
 * Fragments are gated on ARC SPAN, never on point count. The curve data ships already
 * thinned by a Ramer-Douglas-Peucker pass, after which a straight 100° arc can survive on
 * two points while a noise sliver keeps four.
 */

const EnvelopeRing = (() => {
  'use strict';

  // Tuned constants — validated against all 6304 umbral-envelope events; do not adjust.
  const MIN_FRAG_DEG = 0.35; // fragment arc-span threshold (replaces length >= 4)
  const MAX_JOIN_DEG = 15; // max allowed gap when chaining fragments
  const MIN_LOOP_SPAN = 1.0; // minimum arc-span for a finished loop to be accepted
  const COVER_MIN = 0.9; // a fill is ok only if loops cover ≥90% of total arc

  // ---- geometric helpers ----

  // Approximate great-circle distance in degrees (lat-lng Euclidean with longitude wrap).
  function gapDeg(p, q) {
    let dLng = Math.abs(p[1] - q[1]) % 360;
    if (dLng > 180) dLng = 360 - dLng;
    return Math.hypot(p[0] - q[0], dLng);
  }

  // Arc-length of a segment as sum of consecutive gapDeg values.
  function arcSpan(seg) {
    let s = 0;
    for (let i = 1; i < seg.length; i++) s += gapDeg(seg[i - 1], seg[i]);
    return s;
  }

  // Continuity-unwrap longitudes so the ring can be filled across the antimeridian.
  // Same rule as addPolyline / buildEnvelopeRing in eclipse.js.
  function unwrapLng(chain) {
    const ring = [];
    let prevLng = null;
    for (const p of chain) {
      let lng = (((p[1] % 360) + 540) % 360) - 180;
      if (prevLng !== null) {
        while (lng - prevLng > 180) lng -= 360;
        while (lng - prevLng < -180) lng += 360;
      }
      prevLng = lng;
      ring.push([p[0], lng]);
    }
    return ring;
  }

  // ---- public helpers (re-exported for eclipse.js callers) ----

  // Split a curve at null sentinels — the build script inserts null between
  // contiguous segments when the source data has a real time gap.
  function splitOnNull(pts) {
    if (!pts || !pts.length) return [];
    const segs = [];
    let cur = [];
    for (const p of pts) {
      if (p == null) {
        if (cur.length >= 2) segs.push(cur);
        cur = [];
      } else {
        cur.push(p);
      }
    }
    if (cur.length >= 2) segs.push(cur);
    return segs;
  }

  // Convert legacy {t, lat, lng} object lists to compact [lat, lng] arrays.
  function asCompact(pts) {
    if (!pts || !pts.length) return [];
    if (Array.isArray(pts[0])) return pts;
    return pts.map((p) => (p == null ? null : [p.lat, p.lng]));
  }

  // ---- main export ----

  // Re-chain the null-split segments of the closed umbral envelope back into one
  // or more closed rings. Returns:
  //   { rings, raw, dropped, loops, cover, maxGapDeg, ok }
  //
  // rings   — array of [lat,lng][] rings, longitude-unwrapped for polygon fill
  // raw     — number of fragments before filtering
  // dropped — number of fragments removed by the arc-span gate
  // loops   — number of candidate loops extracted by the chainer
  // cover   — fraction of total arc-length covered by accepted rings (0–1)
  // maxGapDeg — largest end-to-end closure gap among accepted rings
  // ok      — true when ≥1 ring passes all QC gates and cover ≥ COVER_MIN
  function buildEnvelopeRings(compactPts) {
    const result = { rings: [], raw: 0, dropped: 0, loops: 0, cover: 0, maxGapDeg: null, ok: false };

    // 1. Split at nulls and filter by arc-span (not point count).
    const allSegs = splitOnNull(compactPts);
    result.raw = allSegs.length;
    const segs = allSegs.filter((s) => arcSpan(s) >= MIN_FRAG_DEG);
    result.dropped = result.raw - segs.length;

    if (!segs.length) return result;

    // Total arc of the raw input (used to compute cover fraction).
    const totalArc = segs.reduce((acc, s) => acc + arcSpan(s), 0);

    // Sort descending by arc-span so we always start a new loop with the longest
    // unassigned fragment.
    segs.sort((a, b) => arcSpan(b) - arcSpan(a));

    const used = new Array(segs.length).fill(false);
    const loops = []; // each loop is an array of chained [lat,lng] points

    // 2. Bidirectional greedy chaining. Repeat until no more fragments remain.
    for (let s0 = 0; s0 < segs.length; s0++) {
      if (used[s0]) continue;
      used[s0] = true;
      let chain = segs[s0].slice();

      // Grow the chain: at each step probe both chain[0] (head) and chain[end] (tail)
      // against all remaining fragments' start and end points — pick the globally
      // closest attachment. This is the bidirectional fix for the spike artifact.
      let improved = true;
      while (improved) {
        improved = false;
        let bestI = -1,
          bestRev = false,
          bestHead = false,
          bestD = MAX_JOIN_DEG;
        const head = chain[0],
          tail = chain[chain.length - 1];
        for (let i = 0; i < segs.length; i++) {
          if (used[i]) continue;
          const seg = segs[i];
          const s0pt = seg[0],
            sNpt = seg[seg.length - 1];
          // Attach to tail (fwd / rev)
          const dTF = gapDeg(tail, s0pt),
            dTR = gapDeg(tail, sNpt);
          // Attach to head (fwd / rev)
          const dHF = gapDeg(head, sNpt),
            dHR = gapDeg(head, s0pt);
          if (dTF < bestD) {
            bestD = dTF;
            bestI = i;
            bestRev = false;
            bestHead = false;
          }
          if (dTR < bestD) {
            bestD = dTR;
            bestI = i;
            bestRev = true;
            bestHead = false;
          }
          if (dHF < bestD) {
            bestD = dHF;
            bestI = i;
            bestRev = false;
            bestHead = true;
          }
          if (dHR < bestD) {
            bestD = dHR;
            bestI = i;
            bestRev = true;
            bestHead = true;
          }
        }
        if (bestI < 0) break; // nothing reachable within MAX_JOIN_DEG → loop closes
        used[bestI] = true;
        improved = true;
        const piece = bestRev ? segs[bestI].slice().reverse() : segs[bestI];
        if (bestHead) {
          chain = piece.concat(chain);
        } else {
          chain = chain.concat(piece);
        }
      }
      loops.push(chain);
    }

    result.loops = loops.length;

    // 3. Validate and unwrap each loop.
    let coveredArc = 0;
    let maxGap = 0;
    for (const chain of loops) {
      // Minimum length and arc-span gates.
      if (chain.length < 4) continue;
      const span = arcSpan(chain);
      if (span < MIN_LOOP_SPAN) continue;

      // Closure gap.
      const gap = gapDeg(chain[0], chain[chain.length - 1]);
      if (gap > MAX_JOIN_DEG) continue;

      // Longitude unwrap.
      const ring = unwrapLng(chain);

      // Polar-jump check: reject if the ring crosses a pole region with a large
      // longitude jump (would need cap geometry a lat/lng polygon can't express).
      let polarJump = false;
      for (let i = 1; i < ring.length; i++) {
        if (Math.abs(ring[i][0]) > 75 && Math.abs(ring[i - 1][0]) > 75 && Math.abs(ring[i][1] - ring[i - 1][1]) > 30) {
          polarJump = true;
          break;
        }
      }
      if (polarJump) continue;

      // Longitude-span check: a >350° ring needs cap geometry.
      let lo = Infinity,
        hi = -Infinity;
      for (const p of ring) {
        if (p[1] < lo) lo = p[1];
        if (p[1] > hi) hi = p[1];
      }
      if (hi - lo > 350) continue;

      result.rings.push(ring);
      coveredArc += span;
      if (gap > maxGap) maxGap = gap;
    }

    result.cover = totalArc > 0 ? +(coveredArc / totalArc).toFixed(4) : 0;
    result.maxGapDeg = result.rings.length ? +maxGap.toFixed(2) : null;
    result.ok = result.rings.length > 0 && result.cover >= COVER_MIN;
    return result;
  }

  return { splitOnNull, asCompact, buildEnvelopeRings };
})();

// CJS footer: lets the off-line regression harness require the chainer directly.
if (typeof module !== 'undefined' && module.exports) module.exports = EnvelopeRing;
// Browser global.
if (typeof window !== 'undefined') window.EnvelopeRing = EnvelopeRing;
