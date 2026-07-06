import React from 'react';
import { Img, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { CanvasItem, CanvasProp } from '../types';

/**
 * A small AI-generated decoration floating around a scene region. Props are
 * generated on a pure black background and drawn with mix-blend-mode: screen,
 * which knocks the black out against the dark canvas themes — a free cut-out.
 *
 * Each prop runs an AI-chosen preset: an optional entrance (pop_spring,
 * draw_in) timed to the region's focus window, plus a perpetual idle motion
 * (float / pulse / orbit / drift) so nothing on the canvas is ever frozen.
 */
export const PropSprite: React.FC<{
  prop: CanvasProp;
  item: CanvasItem;
  /** Global frame at which the prop's region gains focus (entrance timing). */
  appearFrame: number;
  /** Isolation visibility of the prop's scene (props die with their scene). */
  alpha?: number;
  /** Stable per-prop seed so identical props on screen don't move in sync. */
  seed: number;
}> = ({ prop, item, appearFrame, alpha = 1, seed }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!prop.url || alpha <= 0.01) return null;

  const size = (prop.size ?? 0.16) * Math.min(item.w, item.h);
  const cx = item.x - item.w / 2 + (prop.x ?? 0.9) * item.w;
  const cy = item.y - item.h / 2 + (prop.y ?? 0.1) * item.h;
  const phase = seed * 137.5; // de-syncs idle loops between props

  // ---- Entrance ------------------------------------------------------------
  const animation = prop.animation ?? 'float';
  let entranceScale = 1;
  let entranceOpacity = 1;
  let entranceY = 0;
  let entranceRotate = 0;

  if (animation === 'pop_spring' || animation === 'draw_in') {
    const local = frame - appearFrame;
    const e = spring({ frame: local, fps, config: { damping: animation === 'pop_spring' ? 12 : 200 }, durationInFrames: Math.round(fps * 0.7) });
    entranceOpacity = interpolate(e, [0, 1], [0, 1]);
    if (animation === 'pop_spring') {
      entranceScale = e; // springy overshoot from damping 12
    } else {
      entranceY = interpolate(e, [0, 1], [size * 0.35, 0]);
      entranceRotate = interpolate(e, [0, 1], [-10, 0]);
    }
  }

  // ---- Idle loop -----------------------------------------------------------
  const t = (frame + phase) / fps;
  let idle = '';
  switch (animation) {
    case 'pulse':
      idle = `scale(${1 + Math.sin(t * 1.6) * 0.06})`;
      break;
    case 'orbit': {
      const r = size * 0.12;
      idle = `translate(${Math.cos(t * 0.9) * r}px, ${Math.sin(t * 0.9) * r}px)`;
      break;
    }
    case 'drift':
      idle = `translate(${Math.sin(t * 0.5) * size * 0.22}px, ${Math.cos(t * 0.35) * size * 0.14}px)`;
      break;
    case 'float':
    case 'pop_spring':
    case 'draw_in':
    default:
      idle = `translateY(${Math.sin(t * 1.1) * size * 0.09}px) rotate(${Math.sin(t * 0.7) * 3}deg)`;
      break;
  }

  return (
    <Img
      src={prop.url}
      style={{
        position: 'absolute',
        left: cx - size / 2,
        top: cy - size / 2,
        width: size,
        height: size,
        objectFit: 'contain',
        // Props are generated on a pure black background. The image is used
        // as its OWN luminance mask, so black becomes genuinely transparent
        // (works regardless of stacking-context isolation). screen blending
        // stays as a graceful fallback for engines without mask-mode.
        maskImage: `url(${prop.url})`,
        WebkitMaskImage: `url(${prop.url})`,
        maskMode: 'luminance',
        maskSize: '100% 100%',
        WebkitMaskSize: '100% 100%',
        mixBlendMode: 'screen',
        opacity: 0.95 * entranceOpacity * alpha,
        transform: `${idle} translateY(${entranceY}px) rotate(${entranceRotate}deg) scale(${entranceScale})`,
        pointerEvents: 'none',
      }}
    />
  );
};
