/**
 * The canonical easing library (copilot.md §2.1). Every entrance, exit, draw
 * and re-frame in the explainer reads its curve from here — components never
 * define their own cubic math, so the whole video shares one motion accent.
 *
 * Naming follows the standard easing families; "out" = decisive arrival
 * (fast start, soft landing — the house default), "in" = exits only.
 */

export const linear = (t: number): number => t;

export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);

export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** Exits only — accelerating away reads as "leaving", never as "arriving". */
export const easeInCubic = (t: number): number => t * t * t;

export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

export const easeInOutQuint = (t: number): number =>
  t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2;

/**
 * Overshoot landing: rides ~10% past the target at s=1.70158 and settles.
 * Use sparingly — badges and stamps, never body copy.
 */
export const easeOutBack =
  (s = 1.70158) =>
  (t: number): number =>
    1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

/**
 * Classic animation anticipation: a 4% pull-back before the launch. The
 * pull eases from zero velocity so the wind-up never reads as a glitch.
 */
export const anticipate = (t: number): number =>
  t < 0.18 ? -0.04 * Math.sin((t / 0.18) * Math.PI) : easeOutExpo((t - 0.18) / 0.82);

export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
