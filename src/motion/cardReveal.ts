import { useVideoConfig } from 'remotion';
import { SPRINGS } from './springs';
import { useMotionStyle, MotionStyleName } from './styles';
import { f30 } from './choreo';

/**
 * cardReveal — the structured cards' answer to "the same script cut by five
 * editors" (copilot.md §2.5).
 *
 * KineticText already re-times every heading from the active motion style, but
 * the structured cards (hierarchy, layer_stack, quadrant, scale, decision…)
 * used to hardcode `SPRINGS.pop` + fixed frame constants for their node/row/bar
 * pops — so a `bounce` video and an `elegant` video revealed a chart
 * IDENTICALLY. This resolves the style into one reveal contract every card
 * reads, so switching the style re-times the card internals too.
 *
 * Pure math off the style + fps — safe to call in render, deterministic.
 */
export interface CardReveal {
  /** Spring config for an element's pop/settle (one of the four house springs). */
  config: (typeof SPRINGS)[keyof typeof SPRINGS];
  /** Spring durationInFrames for an element pop (fps applied). */
  popFrames: number;
  /** Fade window for a heading/kicker, in frames. */
  headFrames: number;
  /** calloutRevealSchedule fallback `first` (frames). */
  first: number;
  /** calloutRevealSchedule fallback `step` (frames). */
  step: number;
  /** The style's easing curve (for non-spring fades/draw-ons). */
  ease: (t: number) => number;
  /** Entrance travel, as a multiplier on the card's scale unit `u` (0 = none). */
  rise: number;
  /** Explicit landing overshoot for a scale kicker (0..~0.06). */
  overshoot: number;
}

/** Each style borrows the house spring whose personality matches its editor. */
const SPRING_FOR: Record<MotionStyleName, keyof typeof SPRINGS> = {
  crisp: 'pop', // clean, light overshoot
  classic: 'settle', // confident documentary settle
  bounce: 'pop', // playful — differentiated from crisp by rise + overshoot
  elegant: 'silk', // zero overshoot, long exhale
  swiss: 'snap', // fast, minimal overshoot
};

/** Entrance travel per style (× the card's `u`); swiss barely moves. */
const RISE_FOR: Record<MotionStyleName, number> = {
  crisp: 8,
  classic: 6,
  bounce: 11,
  elegant: 6,
  swiss: 4,
};

/**
 * Resolve the card-reveal contract from a motion style at a given fps.
 * Exposed as a plain function so tests and the canvas miniatures can call it
 * without a hook; `useCardReveal()` is the component entry point.
 */
export const cardRevealFor = (
  motion: { name: MotionStyleName; baseF: number; overshoot: number; ease: (t: number) => number },
  fps: number
): CardReveal => {
  const { baseF, overshoot, ease } = motion;
  return {
    config: SPRINGS[SPRING_FOR[motion.name] ?? 'pop'],
    // Longer baseF (classic/elegant) = a slower settle; bounce/swiss snap.
    popFrames: Math.max(6, Math.round(fps * (0.24 + baseF / 60))),
    headFrames: f30(fps, Math.max(6, Math.round(baseF * 0.85))),
    first: f30(fps, Math.round(baseF * 1.1 + 2)),
    step: f30(fps, Math.max(5, Math.round(baseF * 0.85))),
    ease,
    rise: RISE_FOR[motion.name] ?? 8,
    // bounce reads as bounce because it keeps its style overshoot AND a bigger
    // rise; crisp's 0.02 is a whisper, elegant/swiss/classic settle flat.
    overshoot,
  };
};

/** Component entry point: the reveal contract for the active style + fps. */
export const useCardReveal = (): CardReveal => {
  const motion = useMotionStyle();
  const { fps } = useVideoConfig();
  return cardRevealFor(motion, fps);
};
