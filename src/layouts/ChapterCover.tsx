import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useTheme, useDisplayFont, inkOn, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { KineticText } from '../components/KineticText';

/** The cover's chapter ordinal, from its id ("scene_cover_3") or label. */
const chapterNumber = (scene: Scene): number => {
  const fromId = /_(\d+)$/.exec(scene.scene_id ?? '');
  if (fromId) return parseInt(fromId[1], 10);
  const slot = Object.values(scene.slots)[0];
  const fromLabel = /(\d+)/.exec(slot?.label ?? '');
  return fromLabel ? parseInt(fromLabel[1], 10) : 1;
};

/**
 * chapter_cover (copilot.md §5.5): the act break. A full-bleed SOLID field —
 * covers alternate between the paper field and a full accent flood — with a
 * huge chapter numeral settling in behind at 6% opacity (the established
 * watermark motif), the chapter title cascading over it, and a 3u accent rule
 * drawing underneath. It carries no narration: the video takes a breath here
 * while the riser→sub_boom act-break cue (chapter boundary, M2) lands.
 */
export const ChapterCover: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_cover'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps } = useVideoConfig();
  const { frame } = useSceneClock();

  const n = chapterNumber(scene);
  // Alternate paper/accent fields so consecutive act breaks never look alike.
  const flare = n % 2 === 0;
  const field = flare ? theme.accent : theme.bg_from;
  const ink = flare ? inkOn(theme.accent) : theme.text;
  const ruleColor = flare ? ink : theme.accent;

  const numeralIn = easeOutQuint(clamp01(frame / f30(fps, 24)));
  const kickerIn = easeOutQuint(clamp01((frame - f30(fps, 4)) / f30(fps, 12)));
  const ruleP = easeOutQuint(clamp01((frame - f30(fps, 20)) / f30(fps, 12)));

  const title = (slot?.heading ?? '').trim() || `Chapter ${n}`;
  const kicker = (slot?.label ?? `Chapter ${String(n).padStart(2, '0')}`).trim();

  return (
    <AbsoluteFill style={{ background: field, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      {/* The giant numeral settles behind everything — texture from type. */}
      <div
        style={{
          position: 'absolute',
          fontFamily: displayFont,
          fontWeight: 900,
          fontSize: 420 * u,
          lineHeight: 1,
          color: ink,
          opacity: 0.06 * numeralIn,
          transform: `scale(${1.06 - 0.06 * numeralIn})`,
          userSelect: 'none',
        }}
      >
        {String(n).padStart(2, '0')}
      </div>

      <div style={{ position: 'relative', textAlign: 'center', maxWidth: '80%' }}>
        <div
          style={{
            fontFamily: MONO_FONT,
            fontSize: 28 * u,
            fontWeight: 700,
            letterSpacing: 6 * u,
            textTransform: 'uppercase',
            color: flare ? ink : theme.accent,
            marginBottom: 30 * u,
            opacity: kickerIn,
            transform: `translateY(${(1 - kickerIn) * 14 * u}px)`,
          }}
        >
          {kicker}
        </div>

        <h1
          style={{
            margin: 0,
            fontFamily: displayFont,
            fontWeight: 900,
            fontSize: 108 * u,
            lineHeight: 1.02,
            letterSpacing: -1.5 * u,
            color: ink,
          }}
        >
          <KineticText text={title} delay={f30(fps, 6)} exit={false} />
        </h1>

        {/* The 3u accent rule draws under the title. */}
        <div
          style={{
            height: 6 * u,
            width: 220 * u,
            margin: `${36 * u}px auto 0`,
            background: ruleColor,
            transformOrigin: 'left center',
            transform: `scaleX(${ruleP})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
