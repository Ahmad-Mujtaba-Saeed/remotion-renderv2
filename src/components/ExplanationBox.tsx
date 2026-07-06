import React from 'react';
import { useVideoConfig, spring, interpolate } from 'remotion';
import { Slot } from '../types';
import { useTheme } from '../theme';
import { glassStyle } from './GlassCard';
import { KineticText } from './KineticText';
import { useScaleUnit } from '../responsive';
import { useSceneClock } from '../canvas/SceneClock';
import { useRegionStyle } from '../canvas/RegionStyle';

/**
 * A floating explanation card: accent tab, kinetic heading, and a short body.
 * When `transparent` it renders without its own glass surface (the parent
 * banner/panel already provides one).
 */
export const ExplanationBox: React.FC<{ slot: Slot; transparent?: boolean }> = ({ slot, transparent }) => {
  const theme = useTheme();
  const { frame } = useSceneClock();
  const { fps } = useVideoConfig();
  const u = useScaleUnit();
  const region = useRegionStyle();
  const inn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.55) });

  // Frameless canvas regions swap the glass (backdrop-filter would rasterize
  // the region and soften its text under the camera zoom) for a soft plate.
  const surface: React.CSSProperties = region.frameless
    ? {
        background: `linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015)), ${theme.panel}`,
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 30,
        boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
      }
    : glassStyle(theme);

  const inner = (
    <div style={{ padding: transparent ? 0 : '7%', color: theme.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div
        style={{
          width: 54 * u,
          height: 6 * u,
          borderRadius: 999,
          marginBottom: 20 * u,
          background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
        }}
      />
      {slot.heading ? (
        <h2 style={{ fontSize: 50 * u, fontWeight: 800, margin: `0 0 ${18 * u}px 0`, lineHeight: 1.08 }}>
          <KineticText text={slot.heading} delay={Math.round(fps * 0.12)} />
        </h2>
      ) : null}
      <p
        style={{
          fontSize: 34 * u,
          lineHeight: 1.4,
          margin: 0,
          color: theme.text,
          opacity: interpolate(inn, [0, 1], [0, 0.92]),
        }}
      >
        {slot.body}
      </p>
    </div>
  );

  if (transparent) {
    return inner;
  }

  return (
    <div
      style={{
        ...surface,
        opacity: inn,
        transform: `translateY(${interpolate(inn, [0, 1], [24, 0])}px)`,
        width: '100%',
      }}
    >
      {inner}
    </div>
  );
};
