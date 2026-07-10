import React from 'react';
import { AbsoluteFill, useVideoConfig, spring, interpolate } from 'remotion';
import { Scene } from '../types';
import { KineticText } from '../components/KineticText';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';

/**
 * stat_spotlight: one slot (slot_stat, text_block) for the scene whose whole
 * point is a single number or short claim. The heading fills the frame as a
 * giant display setting — the stylist's highlight words carry the accent —
 * and up to two bullets sit beneath it as small support lines on a hairline
 * rule. Works identically in slides and frameless canvas regions: it is pure
 * typography on the colour field, so there is no panel to drop.
 */
export const StatSpotlight: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_stat'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;

  const heading = slot.heading ?? '';
  const support = (slot.bullets ?? []).slice(0, 2);
  const kicker = meta.style?.kicker ?? '';
  const highlight = meta.style?.highlight ?? [];

  // Big-number sizing: short stats ("$4.2B") earn a poster-size setting;
  // longer claims scale down so they still fit as one composed block.
  const chars = heading.length;
  const headingSize = (chars <= 8 ? 260 : chars <= 16 ? 190 : chars <= 28 ? 140 : 104) * u;

  const ruleDelay = Math.round(fps * 0.5);
  const rule = spring({
    frame: frame - ruleDelay,
    fps,
    config: { damping: 200 },
    durationInFrames: Math.round(fps * 0.5),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 1500 * u, textAlign: 'center' }}>
        {kicker ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 30 * u,
              letterSpacing: 5 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              marginBottom: 30 * u,
            }}
          >
            {kicker}
          </div>
        ) : null}

        <KineticText
          text={heading}
          highlight={highlight}
          style={{
            fontFamily: displayFont,
            fontWeight: 800,
            fontSize: headingSize,
            lineHeight: 1.02,
            letterSpacing: -2 * u,
            color: theme.text,
          }}
        />

        {support.length > 0 ? (
          <div
            style={{
              marginTop: 44 * u,
              paddingTop: 36 * u,
              borderTop: `2px solid ${hairline(theme, 0.18)}`,
              display: 'flex',
              justifyContent: 'center',
              gap: 70 * u,
              transformOrigin: 'center top',
              opacity: rule,
              transform: `translateY(${interpolate(rule, [0, 1], [24, 0])}px)`,
            }}
          >
            {support.map((line, i) => (
              <div
                key={i}
                style={{
                  fontFamily: BODY_FONT,
                  fontSize: 34 * u,
                  lineHeight: 1.35,
                  color: theme.muted,
                  maxWidth: 620 * u,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
