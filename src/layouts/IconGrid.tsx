import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { IconStroke } from '../icons/IconStroke';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText, fitGroup } from '../typography';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { KineticText } from '../components/KineticText';

/**
 * icon_grid (copilot.md §5.6): a 2×2 to 3×3 grid of flat line icons that
 * stroke-draw themselves in (10f) with a 1-2 word label rising under each,
 * cells staggered 4f in reading order. Ink strokes on the colour field; the
 * highlighted cell takes the accent. This is the sanctioned "props" — inline
 * SVG strokes, never raster images. No per-cell sounds (§1.3).
 */
export const IconGrid: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_icons'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;

  const items = (slot.items ?? [])
    .filter((it): it is import('../types').IconItem => typeof it === 'object' && it !== null)
    .slice(0, 9);
  if (!items.length) return null;

  const hi = slot.highlight_index ?? null;
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const heading = (slot.heading ?? '').trim();
  const labelFs = fitGroup(items.map((i) => (typeof i === 'string' ? i : i.label ?? '')), {
    width: width * (height > width ? 0.36 : 0.21),
    max: 26 * u,
    min: 16 * u,
    maxLines: 2,
    font: MONO_FONT,
    weight: 700,
  });
  const portrait = height > width;

  // Reading-order grid: 2 columns up to 4 items, else 3 (2 in portrait).
  const cols = portrait ? 2 : items.length <= 4 ? 2 : 3;

  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));
  const firstAt = f30(fps, 10);
  const stagger = f30(fps, 4);

  const cell = (i: number): React.ReactNode => {
    const item = items[i];
    const t = firstAt + i * stagger;
    const drawP = clamp01((frame - t) / f30(fps, 10));
    const labelP = easeOutQuint(clamp01((frame - t - f30(fps, 4)) / f30(fps, 10)));
    const hot = hi === i;
    const color = hot ? theme.accent : theme.text;
    return (
      <div
        key={i}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20 * u,
          padding: `${30 * u}px ${16 * u}px`,
        }}
      >
        <IconStroke
          name={item.icon}
          progress={drawP}
          size={104 * u}
          color={color}
          strokeWidth={1.8}
          life="float"
          seed={i}
        />
        {item.label ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: labelFs,
              fontWeight: 700,
              letterSpacing: 2.5 * u,
              textTransform: 'uppercase',
              textAlign: 'center',
              color: hot ? theme.accent : theme.muted,
              opacity: labelP,
              transform: `translateY(${(1 - labelP) * 12 * u}px)`,
            }}
          >
            {item.label}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 1360 * u, textAlign: 'center' }}>
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
              margin: `0 0 ${34 * u}px 0`,
              fontFamily: displayFont,
              fontWeight: 900,
              fontSize: fitText(heading, {
                  width: width * (portrait ? 0.86 : 0.78),
                  max: 62 * u,
                  min: 34 * u,
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            justifyItems: 'center',
          }}
        >
          {items.map((_, i) => cell(i))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
