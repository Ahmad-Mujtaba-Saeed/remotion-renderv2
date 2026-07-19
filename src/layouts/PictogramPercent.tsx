import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SfxCue } from '../sfx';
import { KineticText } from '../components/KineticText';

/**
 * pictogram_percent — the people-stat as people: "7 in 10" rendered as a row
 * of person silhouettes filling in accent one by one, the fractional last
 * person clipping left-to-right (6.4 of 10 fills six people and 40% of the
 * seventh). More visceral than a meter for shares OF PEOPLE; the meter stays
 * the card for abstract percentages. One stamp as the figure lands (§1.3).
 */

/** Flat person silhouette: head + shoulders-to-feet block, one path pair. */
const Person: React.FC<{
  size: number;
  fillColor: string | null;
  strokeColor: string;
  /** 0..1 horizontal fill fraction (1 = whole person). */
  frac: number;
  id: string;
}> = ({ size, fillColor, strokeColor, frac, id }) => {
  const w = size;
  const h = size * 1.45;
  const body = (color: string, stroke: boolean, clip?: string): React.ReactNode => (
    <g
      clipPath={clip ? `url(#${clip})` : undefined}
      fill={stroke ? 'none' : color}
      stroke={stroke ? color : 'none'}
      strokeWidth={stroke ? 2.2 : 0}
    >
      <circle cx={20} cy={9.5} r={8} />
      <path d="M20 20 C 10.5 20 7 27.5 7 35.5 L 7 58 L 33 58 L 33 35.5 C 33 27.5 29.5 20 20 20 Z" />
    </g>
  );
  return (
    <svg width={w} height={h} viewBox="0 0 40 58" style={{ display: 'block' }}>
      {frac < 1 || !fillColor ? body(strokeColor, true) : null}
      {fillColor && frac > 0 ? (
        <>
          {frac < 1 ? (
            <defs>
              <clipPath id={id}>
                <rect x={0} y={0} width={40 * frac} height={58} />
              </clipPath>
            </defs>
          ) : null}
          {body(fillColor, false, frac < 1 ? id : undefined)}
        </>
      ) : null}
    </svg>
  );
};

export const PictogramPercent: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_pictogram'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;
  const of = Math.max(2, Math.min(20, Math.round(slot.of ?? 10)));
  const filled = Math.max(0, Math.min(of, slot.filled ?? 0));
  if (filled <= 0) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? '').trim();
  const label = (slot.label ?? slot.caption ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  // The figure line: "6.4 in 10" reads as its clean origin ("64%") when the
  // planner carried one via unit; otherwise the honest "7 in 10".
  const figure =
    (slot.unit ?? '') === '%'
      ? `${Math.round((filled / of) * 100)}%`
      : `${Number.isInteger(filled) ? filled : filled.toFixed(1)} in ${of}`;

  const figureAt = f30(fps, 14);
  const figureIn = easeOutQuint(clamp01((frame - figureAt) / f30(fps, 12)));
  const firstFill = f30(fps, 24);
  const step = f30(fps, Math.max(3, Math.min(7, Math.round(56 / of))));

  // Row split: ≤10 one row, otherwise two balanced rows.
  const perRow = of <= 10 ? of : Math.ceil(of / 2);
  const contentW = (portrait ? 940 : 1500) * u;
  const gap = 16 * u;
  const iconW = Math.min((portrait ? 84 : 96) * u, (contentW - gap * (perRow - 1)) / perRow);

  const whole = Math.floor(filled + 1e-6);
  const fracPart = filled - whole;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      <SfxCue name="stamp" at={(win?.start ?? 0) + figureAt} volume={0.55} />

      <div style={{ width: '100%', maxWidth: contentW, textAlign: 'center' }}>
        {kicker ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 24 * u,
              letterSpacing: 4 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              marginBottom: 16 * u,
              opacity: headIn,
            }}
          >
            {kicker}
          </div>
        ) : null}

        <div
          style={{
            fontFamily: displayFont,
            fontWeight: 900,
            fontSize: (portrait ? 110 : 130) * u,
            lineHeight: 1,
            color: theme.text,
            opacity: figureIn,
            transform: `translateY(${(1 - figureIn) * 26 * u}px)`,
          }}
        >
          {figure}
        </div>

        {heading ? (
          <h1
            style={{
              margin: `${22 * u}px 0 0`,
              fontFamily: displayFont,
              fontWeight: 800,
              fontSize: (portrait ? 42 : 48) * u,
              lineHeight: 1.1,
              color: theme.text,
            }}
          >
            <KineticText text={heading} highlight={meta.style?.highlight} />
          </h1>
        ) : null}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap,
            marginTop: 52 * u,
            maxWidth: contentW,
          }}
        >
          {Array.from({ length: of }, (_, i) => {
            const isFilled = i < whole;
            const isPartial = i === whole && fracPart > 0.02;
            const p = easeOutQuint(clamp01((frame - firstFill - i * step) / f30(fps, 9)));
            return (
              <div
                key={i}
                style={{
                  opacity: 0.25 + 0.75 * p,
                  transform: `translateY(${(1 - p) * 14 * u}px) scale(${0.9 + 0.1 * p})`,
                }}
              >
                <Person
                  size={iconW}
                  id={`pict-${scene.scene_id}-${i}`}
                  fillColor={isFilled || isPartial ? theme.accent : null}
                  strokeColor={hairline(theme, 0.4)}
                  frac={isFilled ? p : isPartial ? fracPart * p : 0}
                />
              </div>
            );
          })}
        </div>

        {label ? (
          <div
            style={{
              marginTop: 44 * u,
              fontFamily: BODY_FONT,
              fontSize: (portrait ? 32 : 36) * u,
              fontWeight: 600,
              color: theme.muted,
              opacity: easeOutQuint(clamp01((frame - firstFill - of * step) / f30(fps, 12))),
            }}
          >
            {label}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
