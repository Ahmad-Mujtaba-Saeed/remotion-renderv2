import React from 'react';
import { useVideoConfig, spring, interpolate } from 'remotion';
import { Slot } from '../types';
import { useTheme, useDisplayFont, BODY_FONT } from '../theme';
import { glassStyle } from './GlassCard';
import { KineticText } from './KineticText';
import { useScaleUnit } from '../responsive';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useRegionStyle } from '../canvas/RegionStyle';
import { useSceneMeta } from './SceneMeta';
import { SfxCue } from '../sfx';

/**
 * A floating explanation card: kicker eyebrow, kinetic heading with accent
 * keyword highlights, and a short body under an oversized editorial quote
 * glyph. When `transparent` it renders without its own surface (the parent
 * banner/panel already provides one).
 */
export const ExplanationBox: React.FC<{ slot: Slot; transparent?: boolean }> = ({ slot, transparent }) => {
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const { fps } = useVideoConfig();
  const u = useScaleUnit();
  const region = useRegionStyle();
  const meta = useSceneMeta();
  const inn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.55) });

  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const highlight = meta.style?.highlight;

  // Frameless canvas regions swap the glass (backdrop-filter would rasterize
  // the region and soften its text under the camera zoom) for a soft plate.
  const surface: React.CSSProperties = region.frameless
    ? {
        background: `linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015)), ${theme.panel}`,
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 30,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 30px 80px rgba(0,0,0,0.45)',
      }
    : glassStyle(theme);

  const inner = (
    <div
      style={{
        padding: transparent ? 0 : '7%',
        color: theme.text,
        fontFamily: BODY_FONT,
        position: 'relative',
      }}
    >
      {/* Soft entrance thunk when the card lands. */}
      <SfxCue name="pop_c" at={(win?.start ?? 0) + Math.round(fps * 0.1)} volume={0.7} />
      {/* Oversized quote glyph anchoring the card (editorial poster feel). */}
      {!transparent ? (
        <div
          style={{
            position: 'absolute',
            top: -26 * u,
            right: 10 * u,
            fontSize: 200 * u,
            lineHeight: 1,
            fontFamily: 'Georgia, serif',
            fontWeight: 900,
            color: theme.accent,
            opacity: 0.12,
            pointerEvents: 'none',
          }}
        >
          &rdquo;
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, marginBottom: 20 * u }}>
        <div
          style={{
            width: 54 * u,
            height: 6 * u,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
          }}
        />
        {kicker ? (
          <span
            style={{
              fontSize: 23 * u,
              fontWeight: 800,
              letterSpacing: 4 * u,
              textTransform: 'uppercase',
              color: theme.accent,
            }}
          >
            {kicker}
          </span>
        ) : null}
      </div>
      {slot.heading ? (
        <h2
          style={{
            fontSize: 50 * u,
            fontWeight: 900,
            margin: `0 0 ${18 * u}px 0`,
            lineHeight: 1.08,
            fontFamily: displayFont,
          }}
        >
          <KineticText text={slot.heading} delay={Math.round(fps * 0.12)} highlight={highlight} />
        </h2>
      ) : null}
      <p
        style={{
          fontSize: 34 * u,
          lineHeight: 1.42,
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
        overflow: 'hidden',
      }}
    >
      {inner}
    </div>
  );
};
