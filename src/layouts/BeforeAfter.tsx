import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { MediaSlot } from '../components/MediaSlot';
import { useSceneClock } from '../canvas/SceneClock';
import { useTheme } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeInOutSine } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { MONO_FONT } from '../theme';

/**
 * before_after (copilot.md §5.9): both states share one frame — an accent
 * wipe line sweeps across revealing AFTER over BEFORE via clip-path, teases
 * back, then commits to the transformation. BEFORE/AFTER kicker chips label
 * the sides. Clip + transform only.
 */
export const BeforeAfter: React.FC<{ scene: Scene }> = ({ scene }) => {
  const before = scene.slots['slot_before'];
  const after = scene.slots['slot_after'];
  const theme = useTheme();
  const u = useScaleUnit();
  const { fps } = useVideoConfig();
  const { frame } = useSceneClock();

  if (!before && !after) return null;

  // The wipe's x position (percent): sweep 28→72 (44f), tease back to 40
  // (44f), then commit to 86 — the payoff is mostly-after.
  const leg = f30(fps, 44);
  const t0 = f30(fps, 10);
  let x: number;
  if (frame < t0) {
    x = 28;
  } else if (frame < t0 + leg) {
    x = 28 + 44 * easeInOutSine(clamp01((frame - t0) / leg));
  } else if (frame < t0 + 2 * leg) {
    x = 72 - 32 * easeInOutSine(clamp01((frame - t0 - leg) / leg));
  } else {
    x = 40 + 46 * easeInOutSine(clamp01((frame - t0 - 2 * leg) / leg));
  }

  const chip = (label: string, side: 'left' | 'right'): React.ReactNode => (
    <div
      style={{
        position: 'absolute',
        top: 30 * u,
        [side]: 30 * u,
        padding: `${10 * u}px ${22 * u}px`,
        background: theme.bg_from,
        border: `1px solid ${theme.accent}`,
        fontFamily: MONO_FONT,
        fontSize: 24 * u,
        fontWeight: 700,
        letterSpacing: 3 * u,
        textTransform: 'uppercase',
        color: theme.text,
        zIndex: 3,
      }}
    >
      {label}
    </div>
  );

  return (
    <AbsoluteFill>
      {/* BEFORE fills the frame; AFTER sits above it, clipped to the wipe.
          Labels are stripped — MediaSlot would chip them itself, doubling
          the BEFORE/AFTER chips this layout already draws. */}
      <AbsoluteFill>{before ? <MediaSlot slot={{ ...before, label: undefined }} /> : null}</AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}>
        {after ? <MediaSlot slot={{ ...after, label: undefined }} /> : null}
      </AbsoluteFill>

      {/* The 3u accent wipe line. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: Math.max(3, Math.round(3 * u)),
          left: `calc(${x}% - ${Math.max(3, Math.round(3 * u)) / 2}px)`,
          background: theme.accent,
          zIndex: 2,
        }}
      />

      {chip((before?.label ?? 'Before').toUpperCase(), 'left')}
      {chip((after?.label ?? 'After').toUpperCase(), 'right')}
    </AbsoluteFill>
  );
};
