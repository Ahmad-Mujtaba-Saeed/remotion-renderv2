import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { QuoteCard } from './QuoteCard';
import { MediaSlot } from '../components/MediaSlot';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';

/**
 * quote_portrait (copilot.md §5.12): the quote_card upgrade — a round-masked
 * portrait (hairline ring, no shadows) beside a pull-quote whose words TINT
 * to the accent as the voice reaches them, with the source as a kicker
 * attribution. When the portrait upload is missing the scene renders as the
 * plain quote_card (never an empty circle) — the degrade is render-time
 * because uploads happen after validation.
 */
export const QuotePortrait: React.FC<{ scene: Scene }> = ({ scene }) => {
  const portrait = scene.slots['slot_portrait'];
  const quote = scene.slots['slot_quote'];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const meta = useSceneMeta();

  const hasPortrait = Boolean(portrait?.asset_ref?.url);
  const text = (quote?.body ?? quote?.heading ?? '').trim();
  if (!hasPortrait || !text) {
    return <QuoteCard scene={scene} />;
  }

  const source = (quote?.body ? quote?.heading : quote?.label) ?? '';
  const vertical = height > width;
  const words = text.split(/\s+/).filter(Boolean);

  // Karaoke tint: with real word timings the tint follows the voice; without
  // them it paces evenly across the narrated stretch of the scene.
  const narr = scene.narration_words ?? [];
  const tintedCount = (): number => {
    if (narr.length) {
      const t = frame / fps;
      // Map narration progress onto the quote linearly — the quote is the
      // narration's core, so proportional progress reads word-accurate.
      const end = narr[narr.length - 1].end || 1;
      return Math.floor(clamp01(t / end) * words.length);
    }
    const start = durationInFrames * 0.15;
    const end = durationInFrames * 0.8;
    return Math.floor(clamp01((frame - start) / Math.max(1, end - start)) * words.length);
  };
  const tinted = tintedCount();

  const inP = easeOutQuint(clamp01(frame / f30(fps, 16)));
  const ring = 8 * u;
  const size = (vertical ? 380 : 460) * u;

  const portraitEl = (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `1px solid ${hairline(theme, 0.3)}`,
        padding: ring,
        boxSizing: 'border-box',
        flexShrink: 0,
        opacity: inP,
        transform: `scale(${0.94 + 0.06 * inP})`,
      }}
    >
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', position: 'relative' }}>
        <MediaSlot slot={portrait!} />
      </div>
    </div>
  );

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          alignItems: 'center',
          gap: (vertical ? 50 : 80) * u,
          maxWidth: 1500 * u,
        }}
      >
        {portraitEl}
        <div style={{ textAlign: vertical ? 'center' : 'left' }}>
          <div
            style={{
              fontFamily: displayFont,
              fontWeight: 700,
              fontStyle: 'italic',
              fontSize: (vertical ? 46 : 54) * u,
              lineHeight: 1.28,
              color: theme.text,
            }}
          >
            <span style={{ color: theme.accent }}>“</span>
            {words.map((w, i) => (
              <span key={i} style={{ color: i < tinted ? theme.accent : theme.text }}>
                {w}
                {i < words.length - 1 ? ' ' : ''}
              </span>
            ))}
            <span style={{ color: theme.accent }}>”</span>
          </div>
          {source ? (
            <div
              style={{
                marginTop: 30 * u,
                display: 'flex',
                alignItems: 'center',
                gap: 14 * u,
                justifyContent: vertical ? 'center' : 'flex-start',
                fontFamily: MONO_FONT,
                fontSize: 26 * u,
                fontWeight: 700,
                letterSpacing: 3 * u,
                textTransform: 'uppercase',
                color: theme.muted,
                opacity: inP,
              }}
            >
              <span style={{ width: 34 * u, height: 3 * u, background: theme.accent, flexShrink: 0 }} />
              {source}
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
