/**
 * springTrack — a value that changes target many times, as ONE pure function
 * of time.
 *
 * Ported from the motion-kit engine in Barty-Bart/motion-graphics (MIT,
 * skills/motion-broll/engine/motion.js): a closed-form spring step response,
 * and a track that is the SUM of one spring per change. Summing springs is
 * what lets a value re-target mid-flight without a jump — the old spring is
 * still settling while the new one starts — and every frame can be rendered
 * on its own, which is the only way Remotion renders.
 *
 * Times are in SECONDS here (the springs' ω are tuned for seconds); callers
 * pass `frame / fps`.
 */

/** [stiffness ω (rad/s), damping ζ]. */
export type SpringSpec = readonly [number, number];

/** The engine's presets. FAST/SLOW are the leading/trailing edges of a
 *  liquid indicator; MORPH is the shape; CAM the camera; INSTANT a reset. */
export const SPR = {
  MORPH: [15, 0.84] as SpringSpec,
  FAST: [27, 0.86] as SpringSpec,
  SLOW: [12.5, 0.9] as SpringSpec,
  SOFT: [10, 0.95] as SpringSpec,
  CAM: [7.5, 1] as SpringSpec,
  PRESS: [30, 0.8] as SpringSpec,
  INSTANT: [Infinity, 1] as SpringSpec,
} as const;

/** Closed-form step response 0 → 1 (zero initial velocity) after `tau` s. */
export const springStep = (tau: number, w: number, z: number): number => {
  if (tau <= 0) return 0;
  if (!isFinite(w)) return 1;
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
  }
  return 1 - Math.exp(-w * tau) * (1 + w * tau);
};

/** One change of target: at time `t` (s) go to `value`, on `spring`. */
export type TrackKey = readonly [t: number, value: number, spring?: SpringSpec];

/**
 * `track(v0, keys)` → `t => value`. Keys must be in time order. A key whose
 * value equals the running target adds nothing.
 */
export const track = (v0: number, keys: readonly TrackKey[], def: SpringSpec = SPR.MORPH): ((t: number) => number) => {
  let prev = v0;
  const ks: [number, number, number, number][] = [];
  for (const k of keys) {
    const d = k[1] - prev;
    prev = k[1];
    const sp = k[2] ?? def;
    if (d !== 0) ks.push([k[0], d, sp[0], sp[1]]);
  }
  return (t: number) => {
    let v = v0;
    for (const [t0, d, w, z] of ks) v += d * springStep(t - t0, w, z);
    return v;
  };
};

/**
 * A liquid indicator: two edges that move to each new [left, right] on
 * DIFFERENT springs — the edge moving forward leads on FAST, the trailing
 * one follows on SLOW — so the pill stretches toward its target and snaps
 * shut behind it.
 */
export const liquidEdges = (
  start: readonly [number, number],
  keys: readonly (readonly [t: number, left: number, right: number])[]
): ((t: number) => { left: number; right: number }) => {
  const lk: TrackKey[] = [];
  const rk: TrackKey[] = [];
  let [l0, r0] = start;
  for (const [t, l, r] of keys) {
    const forward = l + r > l0 + r0;
    lk.push([t, l, forward ? SPR.SLOW : SPR.FAST]);
    rk.push([t, r, forward ? SPR.FAST : SPR.SLOW]);
    l0 = l;
    r0 = r;
  }
  const L = track(start[0], lk);
  const R = track(start[1], rk);
  return (t: number) => {
    const left = L(t);
    const right = R(t);
    return right >= left ? { left, right } : { left: right, right: left };
  };
};

/** Content swap: exit blurs out fast, entry waits a beat then settles in. */
export const swapVis = (
  t: number,
  tin: number | null,
  tout: number | null,
  o: { din?: number; lin?: number; lout?: number } = {}
): { o: number; s: number; blurT: number } => {
  const din = o.din ?? 0.07;
  const lin = o.lin ?? 0.26;
  const lout = o.lout ?? 0.12;
  const eo = (x: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const a = tin == null ? 1 : eo((t - tin - din) / lin);
  const b = tout == null ? 0 : eo((t - tout) / lout);
  return {
    o: a * (1 - b),
    s: (0.94 + 0.06 * a) * (1 - 0.03 * b),
    // 0 = sharp; 1 = fully soft. The caller decides whether it may blur.
    blurT: Math.max(1 - a, b * 0.8),
  };
};
