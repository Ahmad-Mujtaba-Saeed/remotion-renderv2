import { useCurrentFrame, useVideoConfig } from 'remotion';
import { useMotionStyle, MotionStyleName } from './styles';

/**
 * SUSTAINED MOTION — the vocabulary `motion/` never had.
 *
 * `choreo.ts` covers entrances, exits and stagger: how a thing ARRIVES. After
 * that the module has exactly one idea for the next ten seconds — `idleScale`,
 * a 0.3% breath — and most cards do not even call it. So a scene reaches its
 * final composition around 0.6s in and then holds a still image until the cut,
 * which is the difference between "a card animating" and motion graphics.
 *
 * Law 6 says nothing is ever frozen, and it means it about the WHOLE hold, not
 * the first half second. This is that law with more than one word in its
 * vocabulary: a small set of endless, deterministic loops a settled element can
 * ride.
 *
 * Three rules the amplitudes are built around:
 *
 * **Beneath notice, above frozen.** A viewer must never be able to point at the
 * motion; they should only notice its absence. The budget is ±0.3% scale and a
 * few pixels at a 1080 basis — an order of magnitude below an entrance.
 *
 * **Never in sync.** Every loop takes a seed, and the seed offsets the phase.
 * Six nodes breathing together is a pulse; six nodes breathing at their own
 * phases is a living frame. Each kind also runs two incommensurate frequencies
 * so the loop never audibly repeats over a 12-second hold.
 *
 * **Not for body copy.** Drifting text is a readability bug, not a style. Use
 * these on figures, nodes, chips, media and hero marks. The one exception is a
 * heading treated as a graphic (a single hero statement), which may `breathe`.
 *
 * Transform + opacity only, deterministic per frame, no hooks in the math — so
 * it is camera-world safe (§1.2) and the flat law (§1.1) has nothing to object
 * to.
 */

export type SustainKind = 'none' | 'breathe' | 'float' | 'sway' | 'orbit' | 'pulse';

export interface SustainOptions {
  /** Which loop. Default 'breathe' — the quietest one. */
  kind?: SustainKind;
  /**
   * Per-element seed. Siblings MUST pass different seeds (their index is
   * usually right) or the whole group moves as one object.
   */
  seed?: number;
  /** Loop length in seconds. Defaults are per-kind and deliberately slow. */
  period?: number;
  /** Amplitude multiplier on the house budget. Keep at or below ~1.5. */
  amp?: number;
  /**
   * Explicit phase in radians, overriding the seeded one. Only `idleScale`
   * uses it, to reproduce its historical numbers exactly.
   */
  phase?: number;
}

/** What one loop is doing this frame. Lengths are at a 1080 design basis. */
export interface SustainState {
  /** Scale multiplier around 1. */
  scale: number;
  /** Offset in design px (multiply by the scene's `u` before use). */
  dx: number;
  dy: number;
  /** Rotation in degrees. */
  rotate: number;
}

/** Deterministic 0..1 from a seed — same generator as camera.ts/TextBlock. */
const seeded = (n: number, salt: number): number => {
  const v = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Per-kind defaults: [period seconds, the house amplitude budget]. */
const PERIOD: Record<Exclude<SustainKind, 'none'>, number> = {
  breathe: 8,
  float: 9,
  sway: 11,
  orbit: 12,
  pulse: 3.6,
};

/**
 * How loudly each motion style sustains. `swiss` is a design that holds still
 * on purpose, so it barely moves; `bounce` is allowed to be felt. This is the
 * same idea as `cardReveal.ts` — one picker re-times everything — applied to
 * the part of the scene that happens after the reveal.
 */
const STYLE_AMP: Record<MotionStyleName, number> = {
  crisp: 1,
  classic: 0.9,
  bounce: 1.4,
  elegant: 0.8,
  swiss: 0.4,
};

/**
 * The loop's state at a given time. Pure — callable from tests, probes and the
 * canvas miniatures without a React tree.
 *
 * @param seconds Elapsed seconds (frame / fps). Continuous, so it is safe to
 *                sample at fractional frames (the motion-blur shutter does).
 */
export const sustainAt = (
  seconds: number,
  { kind = 'breathe', seed = 0, period, amp = 1, phase: fixedPhase }: SustainOptions = {}
): SustainState => {
  const still: SustainState = { scale: 1, dx: 0, dy: 0, rotate: 0 };
  if (kind === 'none' || amp <= 0) return still;

  const T = Math.max(0.5, period ?? PERIOD[kind]);
  const phase = fixedPhase ?? seeded(seed + 1, 3) * Math.PI * 2;
  // A second, deliberately incommensurate frequency. Two sines at a 1:1.37
  // ratio never line up inside a hold, so the loop reads as drift rather than
  // as a metronome.
  const w1 = (Math.PI * 2) / T;
  const w2 = w1 / 1.37;
  const a = Math.sin(seconds * w1 + phase);
  const b = Math.sin(seconds * w2 + phase * 1.7);

  switch (kind) {
    case 'breathe':
      // The old idleScale, exactly: ±0.3% and nothing else.
      return { ...still, scale: 1 + 0.003 * amp * a };
    case 'float':
      return {
        ...still,
        dy: 5 * amp * a,
        scale: 1 + 0.002 * amp * b,
      };
    case 'sway':
      return {
        ...still,
        dx: 6 * amp * a,
        rotate: 0.25 * amp * b,
      };
    case 'orbit':
      // Ellipse: the two axes run at the two frequencies, so the path is a
      // slow Lissajous rather than a circle anything could trace.
      return { ...still, dx: 5 * amp * a, dy: 4 * amp * b };
    case 'pulse':
      // The one kind that is meant to be felt: a small chip or badge keeping
      // a heartbeat. Still under 1.5%.
      return { ...still, scale: 1 + 0.012 * amp * a };
    default:
      return still;
  }
};

/** `sustainAt` as a CSS transform, with lengths already scaled by `u`. */
export const sustainTransform = (state: SustainState, u = 1): string => {
  const parts: string[] = [];
  if (state.dx !== 0 || state.dy !== 0) {
    parts.push(`translate(${state.dx * u}px, ${state.dy * u}px)`);
  }
  if (state.scale !== 1) parts.push(`scale(${state.scale})`);
  if (state.rotate !== 0) parts.push(`rotate(${state.rotate}deg)`);
  return parts.join(' ');
};

/**
 * Component entry point: the loop's state for this frame, with the active
 * motion style's amplitude already applied.
 *
 * Deliberately reads the GLOBAL frame rather than the scene clock: a sustained
 * loop belongs to the element's life on screen, not to a reveal, and using the
 * scene clock would restart every loop at each cut — which is exactly the
 * synchronised pulse the seeds exist to avoid.
 */
export const useSustain = (options: SustainOptions = {}): SustainState => useSustainMany()(options);

/**
 * The same thing for a LIST of elements: one hook call at the top of the card,
 * then a plain function per node.
 *
 * A card cannot call `useSustain()` inside its per-item render function without
 * breaking the rules of hooks, and per-item seeds are the whole point — six
 * nodes sharing one loop move as one object. This returns the resolved loop so
 * `nodes.map((n, i) => life({ kind: 'float', seed: i }))` is legal and each
 * node gets its own phase.
 */
export const useSustainMany = (): ((options?: SustainOptions) => SustainState) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const motion = useMotionStyle();
  const styleAmp = STYLE_AMP[motion.name] ?? 1;
  return (options: SustainOptions = {}) =>
    sustainAt(frame / fps, { ...options, amp: (options.amp ?? 1) * styleAmp });
};
