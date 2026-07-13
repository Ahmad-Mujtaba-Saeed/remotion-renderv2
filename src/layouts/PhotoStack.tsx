import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene, Slot } from '../types';
import { MediaSlot } from '../components/MediaSlot';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, hairline, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeInCubic, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SfxCue } from '../sfx';

/** Seeded pseudo-random in [-1, 1] so every render lays the prints the same. */
const seeded = (sceneId: string, i: number): number => {
  let h = 2166136261;
  const s = `${sceneId}:${i}`;
  for (let k = 0; k < s.length; k++) {
    h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  }
  return ((h >>> 0) % 2000) / 1000 - 1;
};

/**
 * photo_stack (copilot.md §5.14): 2-4 photos as physical prints — a paper
 * border and an ink hairline, each rotated a couple of degrees (intra-layout
 * art; the registry's max_rotation_deg: 0 governs canvas card placement, not
 * this). The top print slides away (18f, easeInCubic) to reveal the next,
 * paced across the scene so the flips ride the narration. paper_slide on
 * each flip per the §6.5 cue map.
 */
export const PhotoStack: React.FC<{ scene: Scene }> = ({ scene }) => {
  const theme = useTheme();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  const photos: Slot[] = [];
  for (let i = 1; i <= 4; i++) {
    const s = scene.slots[`slot_photo_${i}`];
    if (s) photos.push(s);
  }
  if (photos.length < 2) return null;

  const portrait = height > width;
  const printW = (portrait ? 780 : 980) * u;
  const printH = (portrait ? 620 : 660) * u;
  const kicker = (meta.style?.kicker ?? '').trim();

  // Flip schedule: the stack settles first, then each print (except the last)
  // slides away at the end of its equal share of the active stretch.
  const startAt = f30(fps, 14);
  const endAt = Math.round(durationInFrames * 0.86);
  const seg = Math.max(f30(fps, 30), Math.floor((endAt - startAt) / photos.length));
  const slideDur = f30(fps, 18);
  const slideAt = (i: number): number => startAt + (i + 1) * seg;
  const at = win?.start ?? 0;

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {kicker ? (
        <div
          style={{
            position: 'absolute',
            top: '6%',
            fontFamily: MONO_FONT,
            fontSize: 24 * u,
            letterSpacing: 4 * u,
            textTransform: 'uppercase',
            color: theme.accent,
            opacity: easeOutQuint(clamp01(frame / f30(fps, 12))),
          }}
        >
          {kicker}
        </div>
      ) : null}

      {photos.map((slot, i) => {
        const isLast = i === photos.length - 1;
        const slideP = isLast ? 0 : easeInCubic(clamp01((frame - slideAt(i)) / slideDur));
        if (slideP >= 1) return null;

        // Deeper prints land a touch later, so the stack assembles top-down.
        const inP = easeOutQuint(clamp01((frame - f30(fps, 4 + (photos.length - 1 - i) * 4)) / f30(fps, 12)));

        const rot = seeded(scene.scene_id, i) * 3;
        const ox = seeded(scene.scene_id, i + 10) * 26 * u;
        const oy = seeded(scene.scene_id, i + 20) * 20 * u;
        const dir = seeded(scene.scene_id, i + 30) >= 0 ? 1 : -1;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: printW,
              height: printH,
              // Later prints sit UNDER earlier ones; the top of the stack is
              // photo 1, which flips away first.
              zIndex: photos.length - i,
              opacity: inP * (1 - slideP),
              transform: [
                `translate(${ox + dir * slideP * width * 0.7}px, ${oy + (1 - inP) * 50 * u - slideP * 60 * u}px)`,
                `rotate(${rot + dir * slideP * 14}deg)`,
                `scale(${0.97 + 0.03 * inP})`,
              ].join(' '),
              // Print paper: a warm white border with an ink hairline —
              // identical in every scheme, like a real photo print.
              background: '#F7F2EA',
              padding: 16 * u,
              boxSizing: 'border-box',
              border: `1px solid ${hairline(theme, 0.35)}`,
            }}
          >
            {/* Flip sound rides the top print's departure. */}
            {!isLast ? <SfxCue name="paper_slide" at={at + slideAt(i)} volume={0.28} /> : null}
            <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
              <MediaSlot slot={{ ...slot, label: undefined, camera_move: 'static' }} />
            </div>
            {slot.label ? (
              <div
                style={{
                  position: 'absolute',
                  left: 16 * u,
                  bottom: -44 * u,
                  fontFamily: MONO_FONT,
                  fontSize: 22 * u,
                  letterSpacing: 2 * u,
                  textTransform: 'uppercase',
                  color: theme.muted,
                }}
              >
                {slot.label}
              </div>
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
