import type { CropKey, Segment } from './types';

export interface PlacedSegment extends Segment {
  /** Output start (s). */
  out: number;
}

/** Segments with their output start times. */
export const placeSegments = (segments: Segment[]): PlacedSegment[] => {
  let out = 0;
  return segments.map((s) => {
    const placed = { ...s, out };
    out += Math.max(0, s.dur);
    return placed;
  });
};

export const totalSeconds = (segments: Segment[]): number =>
  segments.reduce((sum, s) => sum + Math.max(0, s.dur), 0);

/** Source time shown at output time `t` (a freeze holds its source frame). */
export const outToSrc = (placed: PlacedSegment[], t: number): number => {
  if (!placed.length) return t;
  let seg = placed[0];
  for (const s of placed) {
    if (t >= s.out) seg = s;
    else break;
  }
  const local = Math.max(0, Math.min(seg.dur, t - seg.out));
  return seg.freeze ? seg.src : seg.src + local * (seg.rate || 1);
};

const smooth = (u: number) => u * u * (3 - 2 * u);

/**
 * Crop centre at a source time. Between two samples the camera glides with an
 * ease; a `jump` sample (a hard cut in the footage) is held-then-snapped, so
 * the crop never pans across a cut.
 */
export const cropAt = (keys: CropKey[], t: number): { cx: number; cy: number } => {
  if (!keys.length) return { cx: 0.5, cy: 0.5 };
  if (t <= keys[0].t) return { cx: keys[0].cx, cy: keys[0].cy };
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t < b.t) {
      const a = keys[i - 1];
      if (b.jump) return { cx: a.cx, cy: a.cy };
      const u = smooth(Math.max(0, Math.min(1, (t - a.t) / Math.max(1e-3, b.t - a.t))));
      return { cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u };
    }
  }
  const last = keys[keys.length - 1];
  return { cx: last.cx, cy: last.cy };
};
