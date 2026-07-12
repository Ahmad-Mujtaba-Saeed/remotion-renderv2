import React from 'react';
import { LUCIDE_ICONS, IconNode } from './lucide';
import { clamp01, easeOutQuint } from '../motion/easing';

/**
 * A Lucide icon rendered as flat stroke primitives that DRAW THEMSELVES in
 * (copilot.md §5.6). SVG `pathLength={1}` normalises every shape's length so
 * one dashoffset drives the whole draw — stroke animation only, which is
 * explicitly flat-law and camera-law safe.
 *
 * Unknown icon names render as a generic dot (the registry whitelists names,
 * but a stale payload must never crash a render).
 */
export const IconStroke: React.FC<{
  name?: string;
  /** 0..1 draw progress (already clocked by the caller). */
  progress: number;
  size: number;
  color: string;
  strokeWidth?: number;
}> = ({ name, progress, size, color, strokeWidth = 2 }) => {
  const nodes: IconNode[] | undefined = name ? LUCIDE_ICONS[name] : undefined;
  const p = easeOutQuint(clamp01(progress));

  if (!nodes) {
    // Generic dot: a small circle that draws like any other icon.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
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
