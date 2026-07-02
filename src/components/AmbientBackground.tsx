import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useTheme } from '../theme';
import { MotionGraphics } from './MotionGraphics';

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Soft dark vignette to focus the eye toward the centre. */
export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        'radial-gradient(120% 120% at 50% 45%, transparent 55%, rgba(0,0,0,0.45) 100%)',
      pointerEvents: 'none',
    }}
  />
);

/** Subtle film grain via SVG turbulence (cheap, static, blended). */
export const GrainOverlay: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => (
  <AbsoluteFill style={{ opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
    <svg width="100%" height="100%">
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  </AbsoluteFill>
);

/**
 * Per-scene living background: theme gradient, two slowly drifting accent
 * glows, an optional blurred AI ambient image, and a vignette. Guarantees the
 * frame is never flat — even pure-text scenes feel alive.
 */
export const AmbientBackground: React.FC<{ imageUrl?: string }> = ({ imageUrl }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const x1 = 32 + Math.sin(frame / 90) * 12;
  const y1 = 30 + Math.cos(frame / 110) * 12;
  const x2 = 68 + Math.cos(frame / 100) * 12;
  const y2 = 70 + Math.sin(frame / 120) * 12;

  return (
    <AbsoluteFill
      style={{ background: `linear-gradient(135deg, ${theme.bg_from}, ${theme.bg_to})` }}
    >
      {imageUrl ? (
        <AbsoluteFill>
          <Img
            src={imageUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(22px) brightness(0.45) saturate(1.1)',
              transform: `scale(${lerp(1.12, 1.22, p)})`,
            }}
          />
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill
        style={{
          background: `radial-gradient(42% 42% at ${x1}% ${y1}%, ${theme.accent}33, transparent 70%), radial-gradient(46% 46% at ${x2}% ${y2}%, ${theme.accent2}2b, transparent 72%)`,
        }}
      />

      {/* Decorative motion graphics are skipped when a photo background is present
          so they don't muddy the image. */}
      {imageUrl ? null : <MotionGraphics />}

      <Vignette />
    </AbsoluteFill>
  );
};
