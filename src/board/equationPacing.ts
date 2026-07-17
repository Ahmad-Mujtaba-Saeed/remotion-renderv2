import { Scene, MathStep } from '../types';

/**
 * equationPacing — WHEN each derivation line lands, shared between
 * BoardEquation (which writes the lines) and boardLayout's camera (which must
 * keep the line being written on screen). If these two ever disagreed the
 * camera would scroll to a line that hasn't been written yet — or worse, let
 * the write-head slip below the bottom of the frame.
 */

const mathSlot = (scene: Scene) =>
  scene.slots?.['slot_math'] ?? Object.values(scene.slots ?? {})[0];

/** The renderable derivation lines of a math_steps scene — the ONE filter
 *  every consumer must share so their step indices agree. */
export const equationSteps = (scene: Scene): MathStep[] => {
  const slot = mathSlot(scene);
  return ((slot?.steps as MathStep[] | undefined) ?? []).filter(
    (s): s is MathStep => !!s && typeof s === 'object' && typeof s.expr === 'string' && s.expr.trim() !== ''
  );
};

export const equationHasHeading = (scene: Scene): boolean =>
  Boolean((mathSlot(scene)?.heading ?? '').toString().trim());

/**
 * The frame (relative to the scene's window) each line lands on — paced to
 * the narration words when timings exist, evenly spread otherwise.
 */
export const equationLandAt = (scene: Scene, durationInFrames: number, fps: number): number[] => {
  const steps = equationSteps(scene);
  const f = (n: number): number => Math.round((n / 30) * fps);
  const firstAt = f(equationHasHeading(scene) ? 20 : 12);
  const words = scene.narration_words ?? [];
  let landAt: number[];
  if (words.length >= steps.length && steps.length > 1) {
    const minGap = f(8);
    const lastOk = Math.max(firstAt + minGap, durationInFrames * 0.85);
    landAt = steps.map((_, i) => {
      const w = words[Math.floor((i * words.length) / steps.length)];
      return Math.round((w?.start ?? 0) * fps);
    });
    landAt[0] = Math.max(firstAt, Math.min(landAt[0], lastOk));
    for (let i = 1; i < landAt.length; i++) {
      landAt[i] = Math.max(landAt[i - 1] + minGap, Math.min(landAt[i], lastOk));
    }
  } else {
    const lastBy = Math.max(firstAt + f(8), durationInFrames * 0.75);
    const gap =
      steps.length > 1
        ? Math.max(f(10), Math.min(f(46), (lastBy - firstAt) / (steps.length - 1)))
        : 0;
    landAt = steps.map((_, i) => Math.round(firstAt + i * gap));
  }
  return landAt;
};
