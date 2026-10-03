import React from 'react';
import { clamp01, easeOutCubic } from '../motion/easing';

/**
 * The mouse pointer that DRIVES a card (interface_morph): it travels on a
 * human arc, dips on every click with an accent ring spreading from the tip,
 * and holds slightly larger while dragging. Screen space and a constant size,
 * so it never scales with whatever camera the card uses.
 *
 * With Motion blur on it smears along its own speed — the one element on
 * screen that can cross half the frame in a few frames, so it is the one
 * that strobes worst without it.
 */
export const Cursor: React.FC<{
  pos: { x: number; y: number };
  prevPos: { x: number; y: number };
  opacity: number;
  t: number;
  clicks: number[];
  drags: [number, number][];
  accent: string;
  u: number;
  blur: boolean;
}> = ({ pos, prevPos, opacity, t, clicks, drags, accent, u, blur }) => {
  if (opacity <= 0.002) return null;
  const size = 56 * u;

  // Press: a quick dip on each click, and held while a drag is on.
  let press = 0;
  for (const c of clicks) {
    const d = t - c;
    if (d >= -0.06 && d < 0.22) press = Math.max(press, Math.sin(clamp01((d + 0.06) / 0.28) * Math.PI));
  }
  const dragging = drags.some(([a, b]) => t >= a - 0.05 && t <= b + 0.05);
  const scale = dragging ? 0.9 : 1 - 0.14 * press;

  const speed = Math.hypot(pos.x - prevPos.x, pos.y - prevPos.y);
  const smear = blur ? Math.min(6, speed * 0.12) : 0;

  return (
    <>
      {clicks.map((c, i) => {
        const d = t - c;
        if (d < 0 || d > 0.5) return null;
        const p = easeOutCubic(clamp01(d / 0.5));
        const r = (10 + 46 * p) * u;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: pos.x - r,
              top: pos.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              border: `${3 * u}px solid ${accent}`,
              opacity: (1 - p) * 0.8 * opacity,
              pointerEvents: 'none',
            }}
          />
        );
      })}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          // The hotspot is the arrow's tip at (3,2) of the 24 grid.
          left: pos.x - (3 / 24) * size,
          top: pos.y - (2 / 24) * size,
          opacity,
          transform: `scale(${scale})`,
          transformOrigin: `${(3 / 24) * 100}% ${(2 / 24) * 100}%`,
          filter: smear > 0.3 ? `blur(${smear.toFixed(2)}px)` : undefined,
          overflow: 'visible',
        }}
      >
        <path
          d="M3 2 L3 19.5 L7.6 15.4 L10.6 22 L13.6 20.7 L10.7 14.2 L17 14.2 Z"
          fill="#FFFFFF"
          stroke="#0B0B0B"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};
