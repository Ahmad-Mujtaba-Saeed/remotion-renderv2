import React from 'react';
import { LUCIDE_ICONS, IconNode } from './lucide';
import { clamp01, easeOutQuint } from '../motion/easing';
import { SustainKind, sustainTransform, useSustain } from '../motion/sustain';

/**
 * A Lucide icon rendered as flat stroke primitives that DRAW THEMSELVES in
 * (copilot.md §5.6). SVG `pathLength={1}` normalises every shape's length so
 * one dashoffset drives the whole draw — stroke animation only, which is
 * explicitly flat-law and camera-law safe.
 *
 * Unknown icon names render as a generic dot (the registry whitelists names,
 * but a stale payload must never crash a render).
 *
 * `life` (iter 61) gives a SETTLED icon a sustained loop — the draw-on is over
 * within half a second and an icon grid then holds a still image for the rest
 * of the scene. Opt-in, and every caller must pass a distinct `seed` (the item
 * index): a row of icons sharing one phase moves as a single object, which is
 * worse than not moving at all. Off by default, so a caller that says nothing
 * renders exactly as before.
 */
export const IconStroke: React.FC<{
  name?: string;
  /** 0..1 draw progress (already clocked by the caller). */
  progress: number;
  size: number;
  color: string;
  strokeWidth?: number;
  /** Sustained loop for the settled icon (motion/sustain.ts). Off by default. */
  life?: SustainKind;
  /** Phase seed — pass the item index so siblings never move together. */
  seed?: number;
}> = ({ name, progress, size, color, strokeWidth = 2, life = 'none', seed = 0 }) => {
  const nodes: IconNode[] | undefined = name ? LUCIDE_ICONS[name] : undefined;
  const p = easeOutQuint(clamp01(progress));
  // 0.6 of the house budget: an icon is small, and the same pixel amplitude
  // reads twice as loud on a 100px glyph as on a card. Faded in by the draw
  // progress so the loop never fights the entrance.
  const loop = useSustain({ kind: life, seed, amp: 0.6 * p });
  const lifeTransform = sustainTransform(loop) || undefined;

  if (!nodes) {
    // Generic dot: a small circle that draws like any other icon.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: lifeTransform }}>
        <circle
          cx={12}
          cy={12}
          r={5}
          stroke={color}
          strokeWidth={strokeWidth}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - p}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Shapes draw with a slight per-shape stagger so multi-part icons build up
  // instead of appearing as one simultaneous sweep.
  const n = nodes.length;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: lifeTransform }}
    >
      {nodes.map(([tag, attrs], i) => {
        const local = clamp01((p - (i / Math.max(1, n)) * 0.3) / 0.7);
        return React.createElement(tag, {
          key: i,
          ...attrs,
          pathLength: 1,
          strokeDasharray: 1,
          strokeDashoffset: 1 - local,
        });
      })}
    </svg>
  );
};
