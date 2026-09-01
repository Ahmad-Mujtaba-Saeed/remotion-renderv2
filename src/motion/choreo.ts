import type React from 'react';
import { clamp01, easeInCubic, easeOutCubic, easeOutExpo } from './easing';
import { sustainAt } from './sustain';

/**
 * Choreography primitives (copilot.md §2.3). The Seven Laws in code form:
 * elements enter with direction, land decisively, stagger when plural, and
 * are never frozen. Transform + opacity only — camera-world safe.
 *
 * All frame constants are authored at 30fps; scale them with f30() so the
 * choreography keeps its feel at any render fps.
 */

/** Default entrance duration (frames @30fps). */
export const ENTER_F = 13;

/** Default sibling stagger (frames @30fps) — reading order, never simultaneous. */
export const STAGGER_F = 3;

/** Scale a 30fps-authored frame count to the running fps. */
export const f30 = (fps: number, frames: number): number =>
  Math.max(1, Math.round((frames * fps) / 30));

export interface EnterSpec {
  /** Frames before the entrance starts. */
  delay?: number;
  /** Entrance duration in frames (already fps-scaled by the caller). */
  dur?: number;
  /** Entry travel in px — positive y enters from below (Law 1: direction, not fade). */
  x?: number;
  y?: number;
  /** Starting scale (1 = no scale component). */
  scale?: number;
  ease?: (t: number) => number;
}

/** 0..1 eased progress of an entrance. */
export const enterProgress = (frame: number, spec: EnterSpec = {}): number => {
  const { delay = 0, dur = ENTER_F, ease = easeOutExpo } = spec;
  return (ease)(clamp01((frame - delay) / Math.max(1, dur)));
};

/**
 * Entrance style for a local frame: opacity + transform. The fade resolves
 * over the first ~75% of the travel so elements are solid while still
 * settling (Law 2: decisive arrivals).
 */
export const enter = (frame: number, spec: EnterSpec = {}): React.CSSProperties => {
  const { delay = 0, dur = ENTER_F, x = 0, y = 0, scale = 1 } = spec;
  const e = enterProgress(frame, spec);
  const fade = easeOutCubic(clamp01((frame - delay) / Math.max(1, dur * 0.75)));
  const parts: string[] = [];
  if (x !== 0 || y !== 0) {
    parts.push(`translate(${x * (1 - e)}px, ${y * (1 - e)}px)`);
  }
  if (scale !== 1) {
    parts.push(`scale(${scale + (1 - scale) * e})`);
  }
  return { opacity: fade, ...(parts.length ? { transform: parts.join(' ') } : {}) };
};

/** Frame offset for sibling i (Law 3: stagger everything plural). */
export const stagger = (i: number, step = STAGGER_F): number => i * step;

/**
 * 0..1 progress of an exit starting at `outAt`. Exits accelerate away
 * (easeInCubic) and run at 0.6x of their entrance (Law 5) — apply as
 * opacity: 1 - p and a translate OPPOSITE the entrance direction.
 */
export const exitProgress = (frame: number, outAt: number, dur: number): number =>
  easeInCubic(clamp01((frame - outAt) / Math.max(1, dur)));

/**
 * Subliminal life for ONE hero element per scene (Law 6: never frozen).
 * A ±0.3% scale breath on an 8-second period — beneath conscious notice,
 * above "frozen". Never on text blocks, never faster than 6s.
 *
 * This is now the `breathe` kind of `motion/sustain.ts`, called with an
 * explicit phase so the numbers are bit-for-bit what they always were. Reach
 * for `useSustain()` in new work — this one loop was the whole vocabulary for
 * a settled scene, which is why every hold looked frozen.
 */
export const idleScale = (frame: number, fps: number, seed = 0): number =>
  sustainAt(frame / fps, { kind: 'breathe', phase: seed * Math.PI * 2 }).scale;
