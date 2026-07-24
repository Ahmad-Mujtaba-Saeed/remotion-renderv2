import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, Slot } from '../types';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutExpo, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { useCardReveal } from '../motion/cardReveal';
import { parseCountable, CountableToken } from '../motion/CountUp';
import { SfxCue } from '../sfx';

/** Odometer roll length (frames @30fps) — copilot.md §5.3. */
const ROLL_F = 26;

/** The counter's figure/unit from either content shape. */
const readCounter = (slot: Slot): { token: CountableToken | null; raw: string; unit: string } => {
  if (slot.content_type === 'chart') {
    const values = slot.values ?? [];
    const idx = slot.highlight_index != null && values[slot.highlight_index] !== undefined
      ? slot.highlight_index
      : values.length - 1;
    const v = values[idx];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const raw = String(v);
      return { token: parseCountable(raw), raw, unit: slot.unit ?? '' };
    }
    return { token: null, raw: '', unit: slot.unit ?? '' };
  }
  // text_block: the heading IS the figure ("$4.2 billion").
  const heading = (slot.heading ?? '').trim();
  const m = /^(.*?)(\s*\S*\d[\d,\.]*\S*)(.*)$/.exec(heading);
  const token = parseCountable((m?.[2] ?? heading).trim());
  const unit = (m?.[3] ?? '').trim();
  return { token, raw: heading, unit };
};

/** Format a rolled value in the token's own notation. */
const fmt = (v: number, t: CountableToken): string => {
  const fixed = v.toFixed(t.decimals);
  if (!t.grouped) return `${t.prefix}${fixed}${t.suffix}`;
  const [int, frac] = fixed.split('.');
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${t.prefix}${frac !== undefined ? `${g}.${frac}` : g}${t.suffix}`;
};

/**
 * big_counter (copilot.md §5.3): one colossal figure odometer-rolls up under
 * the tick loop, its unit stamps in a beat after the number lands, a kicker
 * sits above and one support line below — with an optional sparkline drawing
 * itself beneath when the content carries a series. Pure typography + one
 * SVG stroke; flat by construction.
 */
export const BigCounter: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot =
    scene.slots['slot_counter'] ?? scene.slots['slot_chart'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const reveal = useCardReveal();
  const { fps } = useVideoConfig();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;

  const { token, raw, unit } = readCounter(slot);
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const support = (slot.caption ?? (slot.bullets ?? [])[0] ?? '').trim();
  const values = slot.content_type === 'chart' ? (slot.values ?? []) : [];
  const spark = values.length >= 3 ? values.slice(-5) : null;

  const startAt = f30(fps, 8);
  const rollDur = f30(fps, ROLL_F);
  const local = frame - startAt;
  const p = easeOutExpo(clamp01(local / rollDur));

  const from = token && token.value >= 100 ? token.value * 0.65 : 0;
  const figure = token ? fmt(from + (token.value - from) * (p >= 1 ? 1 : p), token) : raw;

  // The unit stamps in 4f after the number lands (Law 3: never simultaneous).
  const unitAt = startAt + rollDur + f30(fps, 4);
  const unitIn = spring({
    frame: Math.max(0, frame - unitAt),
    fps,
    config: reveal.config,
    durationInFrames: reveal.popFrames,
  });

  const kickerIn = reveal.ease(clamp01(frame / reveal.headFrames));
  const supportIn = easeOutQuint(clamp01((frame - unitAt - f30(fps, 4)) / f30(fps, 12)));
  const sparkP = easeOutQuint(clamp01((frame - unitAt - f30(fps, 8)) / f30(fps, 20)));

  // Sparkline geometry (normalized into a 360x80 box).
  let sparkPoints = '';
  if (spark) {
    const min = Math.min(...spark);
    const max = Math.max(...spark);
    const range = max - min || 1;
    sparkPoints = spark
      .map((v, i) => `${(i / (spark.length - 1)) * 360},${76 - ((v - min) / range) * 72}`)
      .join(' ');
  }

  const at = win?.start ?? 0;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '7%', boxSizing: 'border-box' }}>
      {/* Landmark counter sounds (§6.5): the tick loop rides the roll, the
          stamp lands with the unit. */}
      {token ? <SfxCue name="tick_loop" at={at + startAt} volume={1} playbackRate={1.15} /> : null}
      {token && unit ? <SfxCue name="stamp" at={at + unitAt} volume={0.67} /> : null}

      <div style={{ textAlign: 'center', maxWidth: 1500 * u }}>
        {kicker ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 30 * u,
              letterSpacing: 5 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              marginBottom: 34 * u,
              opacity: kickerIn,
              transform: `translateY(${(1 - kickerIn) * 14 * u}px)`,
            }}
          >
            {kicker}
          </div>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 22 * u }}>
          <span
            style={{
              fontFamily: displayFont,
              fontWeight: 800,
              fontSize: 240 * u,
              lineHeight: 1,
              letterSpacing: -4 * u,
              color: theme.text,
              fontVariantNumeric: 'tabular-nums',
              opacity: clamp01(local / f30(fps, 6) + 0.001),
            }}
          >
            {figure}
          </span>
          {unit ? (
            <span
              style={{
                fontFamily: displayFont,
                fontWeight: 800,
                fontSize: 84 * u,
                color: theme.accent,
                opacity: unitIn,
                display: 'inline-block',
                transform: `scale(${0.6 + 0.4 * unitIn})`,
                transformOrigin: 'left bottom',
              }}
            >
              {unit}
            </span>
          ) : null}
        </div>

        {spark ? (
          <svg
            width={360 * u}
            height={80 * u}
            viewBox="0 0 360 80"
            fill="none"
            style={{ marginTop: 40 * u, opacity: sparkP > 0 ? 1 : 0 }}
          >
            <polyline
              points={sparkPoints}
              stroke={theme.accent}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - sparkP}
            />
          </svg>
        ) : null}

        {support ? (
          <div
            style={{
              marginTop: 36 * u,
              paddingTop: 30 * u,
              borderTop: `2px solid ${hairline(theme, 0.18)}`,
              fontFamily: BODY_FONT,
              fontSize: 34 * u,
              color: theme.muted,
              opacity: supportIn,
              transform: `translateY(${(1 - supportIn) * 14 * u}px)`,
              display: 'inline-block',
              maxWidth: 900 * u,
            }}
          >
            {support}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
