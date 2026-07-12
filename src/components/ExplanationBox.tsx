import React from 'react';
import { useVideoConfig, spring, interpolate } from 'remotion';
import { Slot } from '../types';
import { useTheme, useDisplayFont, BODY_FONT, MONO_FONT } from '../theme';
import { useSurfaceStyle } from './Surface';
import { KineticText } from './KineticText';
import { useScaleUnit } from '../responsive';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from './SceneMeta';
import { f30 } from '../motion/choreo';

/** Typewriter pacing (§4.5): 1.2f/char @30fps, whole body within 45f. */
const TYPE_CHAR_F = 1.2;
const TYPE_CAP_F = 45;

/**
 * A docked explanation card: kicker eyebrow, kinetic heading with accent
 * keyword highlights, then the body. It always sits over media, so unlike the
 * text scenes it keeps a surface — a flat opaque block, not a glass card.
 *
 * The scene stylist may hand suspense/tense scenes the "typewriter" variant:
 * the body then reveals per character behind a solid accent block caret —
 * SILENTLY (per-char sounds are banned; §1.3).
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
  const surface = useSurfaceStyle();
  const inn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.55) });

  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const highlight = meta.style?.highlight;

  // ---- Typewriter body ------------------------------------------------------
  const body = slot.body ?? '';
  const typewriter = meta.style?.variant === 'typewriter' && body.length > 0;
  const typeStart = Math.round(fps * 0.45); // after the kicker/heading lead
  const perChar = Math.min(f30(fps, TYPE_CAP_F) / Math.max(1, body.length), (TYPE_CHAR_F * fps) / 30);
  const typed = typewriter
    ? Math.max(0, Math.min(body.length, Math.floor((frame - typeStart) / perChar)))
    : body.length;
  const typing = typewriter && typed < body.length && frame >= typeStart;
  // After the line completes, the caret blinks twice then rests solid.
  const caretOn = typing || Math.floor(frame / Math.max(1, f30(fps, 9))) % 2 === 0;

  const bodyNode = typewriter ? (
    <p
      style={{
        fontSize: 34 * u,
        lineHeight: 1.42,
        margin: 0,
        color: theme.text,
        fontFamily: MONO_FONT,
        minHeight: '1.42em',
      }}
    >
      {body.slice(0, typed)}
      <span
        style={{
          display: 'inline-block',
          width: '0.55em',
          height: '1.05em',
          verticalAlign: 'text-bottom',
          marginLeft: '0.08em',
          background: theme.accent,
          opacity: caretOn ? 1 : 0,
        }}
      />
    </p>
  ) : (
    <p
      style={{
        fontSize: 34 * u,
        lineHeight: 1.42,
        margin: 0,
        color: theme.muted,
        opacity: inn,
      }}
    >
      {body}
    </p>
  );

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
      {bodyNode}
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
