import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText, fitGroup } from '../typography';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SfxCue } from '../sfx';
import { KineticText } from '../components/KineticText';

/**
 * list_ranking (copilot.md §5.10): the countdown. Rows slide in from N down
 * to #1 (10f apart, bottom of the list first), rank badges as solid accent
 * squares with ink numerals — and the #1 row lands with a stamp and an
 * accent flood across the whole row (8f), its text flipping to the opposite
 * ink. Restyled flat from the ranking_moments_short timing ideas.
 */
export const ListRanking: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_ranking'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;
  // Content arrives BEST LAST; display is rank 1 at the top.
  const items = (slot.items ?? []).filter((it): it is string => typeof it === 'string').slice(0, 6);
  if (items.length < 3) return null;
  const ranked = [...items].reverse(); // ranked[0] = #1

  const heading = (slot.heading ?? '').trim();
  const rankFs = fitGroup(items, {
    width: width * (height > width ? 0.62 : 0.56),
    max: 32 * u,
    min: 20 * u,
    maxLines: 1,
    font: BODY_FONT,
    weight: 700,
  });
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  const firstAt = f30(fps, 16);
  const step = f30(fps, 10);
  // Display row d (0 = #1) reveals in countdown order: last row first.
  const rowAt = (d: number): number => firstAt + (ranked.length - 1 - d) * step;
  const oneAt = rowAt(0);
  const at = win?.start ?? 0;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      {/* The #1 landing is the landmark (§6.5) — one stamp, nothing per-row. */}
      <SfxCue name="stamp" at={at + oneAt} volume={0.58} />

      <div style={{ width: '100%', maxWidth: 1240 * u }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 40 * u }}>
            {kicker ? (
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 24 * u,
                  letterSpacing: 4 * u,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: 14 * u,
                  opacity: headIn,
                }}
              >
                {kicker}
              </div>
            ) : null}
            {heading ? (
              <h1
                style={{
                  margin: 0,
                  fontFamily: displayFont,
                  fontWeight: 900,
                  fontSize: fitText(heading, {
                  width: width * (height > width ? 0.86 : 0.78),
                  max: 60 * u,
                  min: 33 * u,
                  maxLines: 2,
                  font: displayFont,
                  weight: 900,
                }),
                  lineHeight: 1.05,
                  color: theme.text,
                }}
              >
                <KineticText text={heading} highlight={meta.style?.highlight} />
              </h1>
            ) : null}
          </div>
        )}

        {ranked.map((text, d) => {
          const rank = d + 1;
          const p = easeOutQuint(clamp01((frame - rowAt(d)) / f30(fps, 10)));
          const isOne = rank === 1;
          // The #1 flood wipes across the row right as it lands.
          const flood = isOne ? easeOutQuint(clamp01((frame - oneAt - f30(fps, 2)) / f30(fps, 8))) : 0;
          const floodInk = inkOn(theme.accent);
          return (
            <div
              key={d}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 28 * u,
                padding: `${16 * u}px ${20 * u}px`,
                borderTop: d > 0 ? `1px solid ${hairline(theme, 0.12)}` : undefined,
                opacity: p,
                transform: `translateX(${(1 - p) * 40 * u}px)`,
                overflow: 'hidden',
              }}
            >
              {/* Accent flood under the champion row. */}
              {isOne ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: theme.accent,
                    transformOrigin: 'left center',
                    transform: `scaleX(${flood})`,
                  }}
                />
              ) : null}
              <div
                style={{
                  position: 'relative',
                  width: 64 * u,
                  height: 64 * u,
                  background: flood > 0.5 ? floodInk : theme.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: displayFont,
                  fontWeight: 900,
                  fontSize: rankFs,
                  color: flood > 0.5 ? theme.accent : inkOn(theme.accent),
                  flexShrink: 0,
                }}
              >
                {rank}
              </div>
              <div
                style={{
                  position: 'relative',
                  fontFamily: BODY_FONT,
                  fontSize: isOne ? 42 * u : 36 * u,
                  fontWeight: isOne ? 800 : 600,
                  color: flood > 0.5 ? floodInk : theme.text,
                }}
              >
                {text}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
