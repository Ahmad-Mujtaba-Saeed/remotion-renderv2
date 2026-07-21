import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene, HeadlineItem } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, BODY_FONT, MONO_FONT } from '../theme';
import { useSurfaceStyle } from '../components/Surface';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeOutCubic, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { KineticText } from '../components/KineticText';

/**
 * headline_ticker (copilot.md §5.16): 2-3 press/reaction chips stack in with
 * an 8f stagger — solid panels with a hairline edge and a mono source label,
 * the headline text arriving via a clip reveal. Deliberately silent: a
 * typewriter clatter on every chip is exactly the per-item noise §1.3 bans.
 */
export const HeadlineTicker: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_headlines'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const surface = useSurfaceStyle(false);
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;
  const items = (slot.items ?? [])
    .filter((it): it is HeadlineItem => typeof it === 'object' && it !== null && 'text' in it)
    .filter((it) => (it.text ?? '').trim() !== '')
    .slice(0, 3);
  if (items.length < 2) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  const firstAt = f30(fps, 14);
  const step = f30(fps, 8);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '7%', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: (portrait ? 900 : 1180) * u }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 48 * u }}>
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
                  fontSize: 60 * u,
                  lineHeight: 1.05,
                  color: theme.text,
                }}
              >
                <KineticText text={heading} highlight={meta.style?.highlight} />
              </h1>
            ) : null}
          </div>
        )}

        {items.map((item, i) => {
          const chipAt = firstAt + i * step;
          const rise = easeOutQuint(clamp01((frame - chipAt) / f30(fps, 12)));
          // The text clip-reveals once its chip has landed.
          const reveal = easeOutCubic(clamp01((frame - chipAt - f30(fps, 6)) / f30(fps, 14)));
          const source = (item.source ?? '').trim();
          return (
            <div
              key={i}
              style={{
                ...surface,
                position: 'relative',
                marginBottom: 26 * u,
                padding: `${26 * u}px ${34 * u}px`,
                opacity: rise,
                transform: `translateY(${(1 - rise) * 36 * u}px)`,
                overflow: 'hidden',
              }}
            >
              {/* Accent tab: which chip is "newest" as they stack. */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 6 * u,
                  background: theme.accent,
                  transformOrigin: 'top',
                  transform: `scaleY(${rise})`,
                }}
              />
              {source ? (
                <div
                  style={{
                    fontFamily: MONO_FONT,
                    fontSize: 21 * u,
                    letterSpacing: 3 * u,
                    textTransform: 'uppercase',
                    color: theme.muted,
                    marginBottom: 10 * u,
                    opacity: reveal,
                  }}
                >
                  {source}
                </div>
              ) : null}
              <div
                style={{
                  fontFamily: BODY_FONT,
                  fontSize: fitText(heading, {
                  width: width * (portrait ? 0.86 : 0.78),
                  max: 38 * u,
                  min: 24 * u,
                  maxLines: 2,
                  font: displayFont,
                  weight: 900,
                }),
                  fontWeight: 700,
                  lineHeight: 1.25,
                  color: theme.text,
                  clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`,
                }}
              >
                “{(item.text ?? '').trim()}”
              </div>
              {/* Hairline underline finishing the chip. */}
              <div
                style={{
                  marginTop: 16 * u,
                  height: 1,
                  background: hairline(theme, 0.16),
                  transformOrigin: 'left',
                  transform: `scaleX(${reveal})`,
                }}
              />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
