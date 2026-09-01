import { CamState } from './camera';

/**
 * CAMERA MOTION BLUR (copilot.md §2.10).
 *
 * Specced in the design contract from day one and never built. The canvas
 * camera legitimately moves very fast — `scripts/camera-continuity.ts` on the
 * golden fixture peaks at **533 px/frame** at 1080p/30fps, half the screen in
 * one frame — and a hard-edged frame that jumps half a screen does not read as
 * "fast", it reads as a strobe. Every consumer motion-graphics reference is
 * either shot at 60fps, blurred, or both.
 *
 * The technique is fixed by §1.2: `filter: blur()` anywhere on the camera path
 * makes Chromium promote the world into a cached compositor layer and reuse a
 * mid-flight raster, which is the "text lands permanently blurry" bug that was
 * diagnosed and fixed twice. So the blur is built the only way the law allows:
 * **stacked temporal samples**. The world is drawn several times at the camera
 * states it occupied across one shutter, each copy transform + opacity only.
 * Text inside every copy is still vector-crisp; the smear is real accumulated
 * exposure, exactly like a shutter.
 *
 * Only the CAMERA is re-sampled, never the content: each copy renders the same
 * frame of every card, so a bullet mid-pop does not ghost against itself.
 * Content motion is small and slow; camera motion is what strobes.
 *
 * Cost is linear in ghost count and is why this is gated hard: below the
 * threshold `cameraTrail()` returns an empty array and the caller draws the
 * world exactly once, byte-identically to before. Holds — the great majority
 * of every video's frames — never pay anything.
 */

/**
 * Screen-space movement, in px, between two camera states: how far a fixed
 * world point travels, plus the drift zoom and roll induce out at the frame
 * edge. This is the same metric `scripts/camera-continuity.ts` audits with, so
 * the number that decides "blur this frame" is the number the smoothness
 * report prints — one definition of "fast", not two.
 */
export const camDisplacement = (a: CamState, b: CamState, vw: number, vh: number): number => {
  const pan = Math.hypot(b.x - a.x, b.y - a.y) * ((a.scale + b.scale) / 2);
  const zoom = Math.abs(Math.log(Math.max(1e-6, b.scale / a.scale))) * (vw / 2);
  const roll = ((Math.abs(b.rot - a.rot) * Math.PI) / 180) * (Math.hypot(vw, vh) / 2);
  return pan + zoom + roll;
};

/** One copy of the world: the camera to draw it at, and the alpha to paint it. */
export interface BlurSample {
  cam: CamState;
  /** Paint alpha for this copy, in the order returned (back to front). */
  opacity: number;
  /**
   * Shutter step: 0 is the sharp, current camera; 1..n are ghosts, counted
   * back along the exposure. Use it as the React key — the ghost count varies
   * with speed, and keying by step means a frame that gains a ghost mounts ONE
   * new subtree instead of remounting the whole stack.
   */
  step: number;
}

export interface BlurOptions {
  /** Master switch — false returns [] and the caller draws one sharp world. */
  enabled?: boolean;
  /** px/frame (1080p-normalised) where the trail starts to appear. */
  threshold?: number;
  /** px/frame at which the trail reaches full strength. */
  full?: number;
  /** Frames of shutter the trail spans. 1.0 = a full frame of exposure. */
  shutter?: number;
  /** Hard cap on GHOST copies (total copies = ghosts + 1). Render cost. */
  maxGhosts?: number;
  /** Fraction of the exposure the ghosts may take at full strength. */
  depth?: number;
}

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
/** Smoothstep, so the trail fades in over the ramp instead of switching on. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

export const BLUR_DEFAULTS: Required<Omit<BlurOptions, 'enabled'>> = {
  // A 1080-tall frame moving ~2.5% of its width per frame is where the eye
  // starts to see steps rather than motion.
  threshold: 26,
  full: 190,
  // A hair under a full frame: a 180° shutter (0.5) is film-correct but reads
  // thin against DOM's perfectly hard edges, and a full 1.0 smears the
  // arrival. 0.72 keeps landings crisp while killing the strobe.
  shutter: 0.72,
  // The camera peaks near 530px/frame at 1080p/30. Three ghosts across that
  // leaves ~130px between copies, which the eye resolves as four cards rather
  // than one smear — the sample count has to follow the speed or the blur
  // just multiplies the object. Six is the cap because it only ever applies to
  // the handful of frames at the top of a long hop.
  maxGhosts: 6,
  depth: 0.5,
};

/**
 * Paint alphas for a stack of shutter samples, front (sharp) first.
 *
 * The exposure weights are the physical quantity — the sharp copy keeps
 * `1 - ghostShare`, the ghosts split the rest and fall off linearly — but DOM
 * paints "over", not "add". These alphas are the ones that reproduce those
 * weights exactly when the stack is painted back to front, which also keeps
 * total coverage at 1.0: the background never bleeds through a fast frame, so
 * the result is a smear and not a fade-out.
 *
 * Shared by the canvas camera and the whip-pan transition so both blurs have
 * the same falloff.
 */
export const shutterAlphas = (ghosts: number, ghostShare: number): number[] => {
  const ramp = Array.from({ length: ghosts }, (_, i) => ghosts - i);
  const rampTotal = ramp.reduce((a, b) => a + b, 0) || 1;
  const weights = [1 - ghostShare, ...ramp.map((r) => (ghostShare * r) / rampTotal)];

  const alphas: number[] = [];
  let remaining = 1;
  weights.forEach((w, i) => {
    alphas.push(i === weights.length - 1 ? 1 : Math.min(1, w / Math.max(1e-6, remaining)));
    remaining -= w;
  });

  return alphas;
};

/**
 * The camera copies to draw for one frame, ordered BACK TO FRONT — the last
 * entry is always the sharp, current camera, so a caller that ignores the rest
 * still renders the correct frame.
 *
 * Returns `[]` when the frame is slow enough not to need it: that is the
 * common case and it costs one `at()` call.
 */
export const cameraTrail = (
  at: (frame: number) => CamState,
  frame: number,
  vw: number,
  vh: number,
  options: BlurOptions = {}
): BlurSample[] => {
  const o = { ...BLUR_DEFAULTS, ...options };
  if (options.enabled === false) return [];

  const now = at(frame);
  // Trailing measurement: the exposure we are about to draw covers the motion
  // that just happened, so the ghosts point back the way the camera came.
  const vel = camDisplacement(at(frame - 1), now, vw, vh);
  // Normalise to a 1080-short-edge frame so one threshold serves 9:16 and
  // 16:9, 1080p and 4K.
  const u = Math.max(0.1, Math.min(vw, vh) / 1080);
  const vn = vel / u;
  if (vn <= o.threshold) return [];

  const k = smooth(clamp01((vn - o.threshold) / Math.max(1, o.full - o.threshold)));
  // One ghost per ~75px/frame of travel: a slow drift gets a single soft
  // trail, a whip gets the full stack. Cost scales with the speed, which is
  // also the only thing that needs it.
  const ghosts = Math.max(1, Math.min(o.maxGhosts, Math.round(vn / 75)));

  const alphas = shutterAlphas(ghosts, k * o.depth);

  const samples: BlurSample[] = alphas.map((_, i) => ({
    // i = 0 is the sharp copy at the current camera; ghost i sits i steps back
    // along the shutter.
    cam: i === 0 ? now : at(frame - (o.shutter * i) / ghosts),
    opacity: alphas[i],
    step: i,
  }));

  // Back to front: the oldest ghost is painted first.
  return samples.reverse();
};
