import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene } from '../types';
import { KineticText } from '../components/KineticText';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';

/**
 * quote_card: one slot (slot_quote, explanation_box or text_block) for a
 * verbatim quotation or aphorism. A giant flat accent quotation mark (drawn
 * as type, no shadow, no gradient) anchors the composition; the quote sets in
 * the display face with the stylist's highlights; the kicker doubles as the
 * attribution line. Pure typography on the colour field — identical in slides
 * and frameless canvas regions, per the flat-design rule.
 */
export const QuoteCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_quote'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;

  // explanation_box carries the quote in body; text_block in heading.
  const quote = (slot.body || slot.heading || '').trim();
  const attribution = (meta.style?.kicker || slot.heading === quote ? meta.style?.kicker : slot.heading) || '';
  const highlight = meta.style?.highlight ?? [];

  const chars = quote.length;
  const quoteSize = (chars <= 60 ? 92 : chars <= 120 ? 74 : chars <= 200 ? 60 : 48) * u;

  const markIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });
  const attrIn = spring({
    frame: frame - Math.round(fps * 0.7),
    fps,
    config: { damping: 200 },
    durationInFrames: Math.round(fps * 0.5),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: '8%', boxSizing: 'border-box' }}>
      <div style={{ position: 'relative', maxWidth: 1440 * u, margin: '0 auto', width: '100%' }}>
        {/* The mark: one huge flat glyph, cropped by the composition. */}
        <div
          style={{
            position: 'absolute',
            top: -170 * u,
            left: -30 * u,
            fontFamily: displayFont,
            fontWeight: 800,
            fontSize: 340 * u,
            lineHeight: 1,
            color: theme.accent,
            opacity: 0.9 * markIn,
            transform: `translateY(${(1 - markIn) * -24}px)`,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          &ldquo;
        </div>

        <div style={{ paddingTop: 120 * u }}>
          <KineticText
            text={quote}
            highlight={highlight}
            style={{
              fontFamily: displayFont,
              fontWeight: 700,
              fontSize: quoteSize,
              lineHeight: 1.18,
              letterSpacing: -0.5 * u,
              color: theme.text,
            }}
          />

          {attribution ? (
            <div
              style={{
                marginTop: 44 * u,
                display: 'flex',
                alignItems: 'center',
                gap: 22 * u,
                opacity: attrIn,
              }}
            >
              <div style={{ width: 64 * u, height: 4 * u, background: theme.accent }} />
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 28 * u,
                  letterSpacing: 3 * u,
                  textTransform: 'uppercase',
                  color: theme.muted,
                }}
              >
                {attribution}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
