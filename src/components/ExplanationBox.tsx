import React from 'react';
import { useVideoConfig, spring, interpolate } from 'remotion';
import { Slot } from '../types';
import { useTheme, useDisplayFont, BODY_FONT, MONO_FONT } from '../theme';
import { surfaceStyle } from './Surface';
import { KineticText } from './KineticText';
import { useScaleUnit } from '../responsive';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from './SceneMeta';

/**
 * A docked explanation card: kicker eyebrow, kinetic heading with accent
 * keyword highlights, then the body. It always sits over media, so unlike the
 * text scenes it keeps a surface — a flat opaque block, not a glass card.
 *
 * When `transparent` the parent (a banner strip) already supplies that surface.
 */
export const ExplanationBox: React.FC<{ slot: Slot; transparent?: boolean }> = ({ slot, transparent }) => {
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const { frame } = useSceneClock();
  const { fps } = useVideoConfig();
  const u = useScaleUnit();
  const meta = useSceneMeta();
  const inn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.55) });

  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const highlight = meta.style?.highlight;

  const inner = (
    <div
      style={{
        padding: transparent ? 0 : '7%',
        color: theme.text,
        fontFamily: BODY_FONT,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, marginBottom: 22 * u }}>
        <div style={{ width: 34 * u, height: 3 * u, background: theme.accent, flexShrink: 0 }} />
        {kicker ? (
          <span
            style={{
              fontSize: 21 * u,
              fontWeight: 600,
              letterSpacing: 4 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              fontFamily: MONO_FONT,
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
            margin: `0 0 ${20 * u}px 0`,
            lineHeight: 1.06,
            letterSpacing: -0.6 * u,
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
          color: theme.muted,
          opacity: inn,
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
        ...surfaceStyle(theme),
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
