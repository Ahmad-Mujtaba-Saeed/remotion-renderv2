import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { NarrationWord, Scene } from '../types';
import { useTheme, hairline, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { useSceneWindow } from '../canvas/SceneClock';
import { clamp01, easeOutCubic } from '../motion/easing';
import { f30 } from '../motion/choreo';

/** Max words per caption chip; a pause this long also breaks a group. */
const GROUP_SIZE = 3;
const GROUP_GAP_S = 0.7;

interface CaptionGroup {
  words: NarrationWord[];
  start: number;
  end: number;
}

/** Chunk the narration words into short karaoke groups (≤3 words, split at
 *  real pauses) so the chip reads like speech, not a scrolling ticker. */
const groupWords = (words: NarrationWord[]): CaptionGroup[] => {
  const groups: CaptionGroup[] = [];
  let current: NarrationWord[] = [];
  for (const w of words) {
    const last = current[current.length - 1];
    if (current.length >= GROUP_SIZE || (last && w.start - last.end > GROUP_GAP_S)) {
      groups.push({ words: current, start: current[0].start, end: current[current.length - 1].end });
      current = [];
    }
    current.push(w);
  }
  if (current.length) {
    groups.push({ words: current, start: current[0].start, end: current[current.length - 1].end });
  }
  return groups;
};

/**
 * Karaoke caption track (copilot.md §4.4) — the sound-off experience. Groups
 * of ≤3 spoken words on a solid panel chip, bottom-center at the 8% safe
 * margin (above the progress rule), current word flipped to the accent.
 *
 * SCREEN SPACE ONLY: mounted outside the camera world (CanvasJourney's HUD
 * layer / the slides Sequence) so the type is pixel-crisp at any zoom. Flat
 * per the design law: solid panel field + hairline border, colour swaps only.
 *
 * Clocking mirrors PunchLine: in canvas mode `narrationStart` re-bases the
 * word timestamps; in slides mode the Sequence clock IS the narration clock.
 */
export const CaptionTrack: React.FC<{ scene: Scene }> = ({ scene }) => {
  const theme = useTheme();
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const u = useScaleUnit();
  const win = useSceneWindow();

  const words = scene.narration_words ?? [];
  if (!words.length) return null;

  const base = win?.narrationStart ?? 0;
  const t = (frame - base) / fps;

  const groups = groupWords(words);
  const group = groups.find((g) => t >= g.start - 0.12 && t <= g.end + 0.35);
  if (!group) return null;

  // A quick rise-in as each chip replaces the previous one.
  const inF = (t - (group.start - 0.12)) * fps;
  const e = easeOutCubic(clamp01(inF / f30(fps, 6)));

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '8%',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      <div
        style={{
          background: theme.panel,
          border: `1px solid ${hairline(theme, 0.16)}`,
          borderRadius: 12 * u,
          padding: `${12 * u}px ${26 * u}px`,
          maxWidth: '84%',
          opacity: e,
          transform: `translateY(${(1 - e) * 10 * u}px)`,
          fontFamily: MONO_FONT,
          fontSize: 30 * u,
          fontWeight: 700,
          lineHeight: 1.3,
          textAlign: 'center',
        }}
      >
        {group.words.map((w, i) => {
          const spoken = t >= w.start;
          const current = t >= w.start && t <= w.end + 0.12;
          return (
            <span
              key={i}
              style={{
                marginRight: i < group.words.length - 1 ? '0.42em' : 0,
                color: current ? theme.accent : theme.text,
                opacity: spoken || current ? 1 : 0.5,
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
