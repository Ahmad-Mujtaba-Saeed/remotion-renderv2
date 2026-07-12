import React from 'react';
import { AbsoluteFill, spring, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { useTheme, inkOn, DISPLAY_FONT, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { KineticText } from '../components/KineticText';
import { SPRINGS } from '../motion/springs';
import { enter, f30 } from '../motion/choreo';
import { clamp01, easeOutQuint } from '../motion/easing';
import { SfxCue } from '../sfx';

/**
 * outro_card — the auto-appended closing end card (copilot.md §10.2). Flat by
 * law: solid field, hairline-weight rule, one accent chip. Choreography per
 * the beat sheet: kicker → title cascade → rule draw → CTA chip pop → handle.
 * The validator builds its slot as a plain text_block (heading = title recap,
 * bullets = [cta, handle?]) so every storage/UI path treats it as text.
 */
export const OutroCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_outro'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const u = useScaleUnit();
  const { fps } = useVideoConfig();
  const { frame } = useSceneClock();

  const win = useSceneWindow();

  const title = (slot?.heading ?? '').trim() || 'Thanks for watching';
  const bullets = slot?.bullets ?? [];
  const cta = (bullets[0] ?? 'Follow for more').trim();
  const handle = (bullets[1] ?? '').trim();

  const chipIn = spring({ frame: Math.max(0, frame - f30(fps, 30)), fps, config: SPRINGS.pop });
  const rule = easeOutQuint(clamp01((frame - f30(fps, 22)) / f30(fps, 12)));

  // A single warm chime as the CTA chip lands — the completion landmark
  // (SfxCue reads the CURRENT clock: scene-relative in slides, global in
  // canvas, hence the window offset).
  const chimeAt = (win?.start ?? 0) + f30(fps, 30);

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 34 * u,
        padding: '8%',
        boxSizing: 'border-box',
        textAlign: 'center',
        color: theme.text,
      }}
    >
      <SfxCue name="chime" at={chimeAt} volume={0.8} />
      <div
        style={{
          fontFamily: MONO_FONT,
          fontSize: 24 * u,
          fontWeight: 600,
          letterSpacing: 6 * u,
          textTransform: 'uppercase',
          color: theme.muted,
          ...enter(frame, { dur: f30(fps, 12), y: 18 * u }),
        }}
      >
        Thanks for watching
      </div>

      <div
        style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 800,
          fontSize: (title.length > 32 ? 72 : 96) * u,
          lineHeight: 1.04,
          letterSpacing: -1.5 * u,
          maxWidth: '86%',
        }}
      >
        <KineticText text={title} delay={f30(fps, 6)} />
      </div>

      <div
        style={{
          width: 130 * u,
          height: 4 * u,
          background: theme.accent,
          transformOrigin: 'center',
          transform: `scaleX(${rule})`,
        }}
      />

      <div
        style={{
          padding: `${16 * u}px ${40 * u}px`,
          background: theme.accent,
          color: inkOn(theme.accent),
          fontFamily: MONO_FONT,
          fontSize: 28 * u,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 3 * u,
          opacity: clamp01(chipIn * 1.4),
          transform: `scale(${0.9 + 0.1 * chipIn})`,
        }}
      >
        {cta}
      </div>

      {handle ? (
        <div
          style={{
            fontFamily: MONO_FONT,
            fontSize: 26 * u,
            letterSpacing: 2 * u,
            color: theme.muted,
            ...enter(frame, { delay: f30(fps, 40), dur: f30(fps, 12), y: 14 * u }),
          }}
        >
          {handle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
