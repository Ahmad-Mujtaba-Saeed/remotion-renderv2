import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { useTheme, isLightTheme } from '../theme';
import { AmbientBackground } from '../components/AmbientBackground';
import { CaptionTrack } from '../components/CaptionTrack';
import { SceneClockProvider } from '../canvas/SceneClock';
import { SfxCue } from '../sfx';
import { clamp01, easeInOutSine } from '../motion/easing';
import { buildBoard, EQ_REF_UNITS } from './boardLayout';
import { BoardEquation } from './BoardEquation';
import { BoardNote } from './BoardNote';
import { BoardFigure } from './BoardFigure';
import { parseMath, mathWidthUnits } from '../math/mathText';
import { MathStep } from '../types';

/**
 * MathBoard — the worked-math composition mode.
 *
 * The whole solution lives on ONE continuous board: the problem written at the
 * top, the derivation written line by line down the spine, diagrams drawn
 * small in the flow, concept asides pinned in the left margin. Nothing is ever
 * cleared — the board accumulates, so the finished frame shows the full
 * working. A single calm camera (boardLayout) writes with the equation,
 * glances at diagrams, steps aside to concepts and returns; there is no flight,
 * no roll, no idle push. The music bed lives in ExplainerVideo, outside this.
 */
export const MathBoard: React.FC<{ scenes: Scene[]; captions?: boolean }> = ({
  scenes: scenesProp,
  captions = false,
}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { fps, width: vw, height: vh } = useVideoConfig();

  const scenes = useMemo(
    () => [...(scenesProp ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [scenesProp]
  );

  const plan = useMemo(() => buildBoard(scenes, fps, vw, vh), [scenes, fps, vw, vh]);

  // ONE handwriting size for the entire board: the widest line anywhere sets
  // it, so a two-character line never renders as a headline.
  const globalMaxUnits = useMemo(() => {
    let max = 0;
    let anyRef = false;
    for (const scene of scenes) {
      if (scene.layout_template !== 'math_steps') continue;
      const slot = scene.slots?.['slot_math'] ?? Object.values(scene.slots ?? {})[0];
      for (const s of (slot?.steps as MathStep[] | undefined) ?? []) {
        if (s && typeof s.expr === 'string' && s.expr.trim() !== '') {
          max = Math.max(max, mathWidthUnits(parseMath(s.expr)));
        }
        if (s && typeof s.ref === 'string' && s.ref.trim() !== '') {
          anyRef = true;
        }
      }
    }
    // Reserve the citation margin board-wide so the working never has to share
    // its line with an "as we know" note.
    return anyRef ? max + EQ_REF_UNITS : max;
  }, [scenes]);

  if (!scenes.length) return null;

  const cam = plan.at(frame);
  const f = (n: number): number => Math.round((n / 30) * fps);

  // Graph-paper surface: faint square grid pinned to the world (the one
  // texture — a math board should read as a grid). Ink on light themes,
  // light on dark themes, barely there either way.
  const line = isLightTheme(theme) ? 'rgba(23,30,40,0.06)' : 'rgba(255,255,255,0.06)';
  const cell = Math.round(vw * 0.055);

  // Per-card presence: appears as the board reaches it, then eases back to a
  // soft dim once the NEXT beat takes focus — the current line owns the eye
  // while everything already written stays legible.
  const cardOpacity = (idx: number): number => {
    const w = plan.windows[idx];
    if (frame < w.start) return 0;
    const appear = clamp01((frame - w.start) / f(10));
    const next = plan.windows[idx + 1];
    let focus = 1;
    if (next && frame >= next.start) {
      focus = 1 - 0.45 * easeInOutSine(clamp01((frame - next.start) / Math.max(1, next.travel)));
    }
    return appear * focus;
  };

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AmbientBackground />

      {/* THE BOARD — one camera transform moves the whole surface. No roll, no
          will-change: an un-promoted layer rasters at the true scale every
          frame so written equations stay vector-crisp when the camera rests. */}
      <div
        style={{
          position: 'absolute',
          width: plan.world.width,
          height: plan.world.height,
          transform: `translate(${vw / 2 - cam.x * cam.scale}px, ${vh / 2 - cam.y * cam.scale}px) scale(${cam.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {/* Graph-paper grid across the whole board. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
            backgroundSize: `${cell}px ${cell}px, ${cell}px ${cell}px`,
          }}
        />

        {plan.cards.map((card) => {
          const opacity = cardOpacity(card.sceneIndex);
          if (opacity <= 0.01) return null;
          const scene = scenes[card.sceneIndex];
          const w = plan.windows[card.sceneIndex];
          const clock = {
            start: w.start,
            end: w.start + w.frames,
            narrationStart: w.start,
          };
          return (
            <div
              key={scene.scene_id}
              style={{
                position: 'absolute',
                left: card.cx - card.w / 2,
                top: card.top,
                width: card.w,
                height: card.h,
                opacity,
              }}
            >
              <SceneClockProvider window={clock}>
                {card.kind === 'equation' ? (
                  <BoardEquation scene={scene} boxW={card.w} boxH={card.h} globalMaxUnits={globalMaxUnits} />
                ) : card.kind === 'figure' ? (
                  <BoardFigure scene={scene} boxW={card.w} boxH={card.h} index={card.sceneIndex} count={scenes.length} />
                ) : (
                  <BoardNote scene={scene} boxW={card.w} boxH={card.h} variant={card.kind === 'concept' ? 'concept' : 'note'} />
                )}
              </SceneClockProvider>
            </div>
          );
        })}
      </div>

      {/* A soft page-turn under each PURPOSEFUL camera move (glancing at a
          diagram, stepping aside to a concept) — the spine's own scroll is
          silent so the board never feels busy. */}
      <SfxCue name="shimmer" at={2} volume={0.7} />
      {plan.cards.map((card) => {
        if (card.kind !== 'figure' && card.kind !== 'concept') return null;
        const w = plan.windows[card.sceneIndex];
        if (!w || w.travel <= 0) return null;
        return <SfxCue key={`w-${card.sceneIndex}`} name="whoosh_soft" at={w.start} volume={0.5} />;
      })}

      {/* CAPTIONS in screen space (crisp at any zoom), re-based to each
          scene's narration start exactly like the canvas journey.

          NO karaoke punchlines on the board: under a written working they are
          a THIRD rendition of the same fact (the line shows it, the narration
          says it) — pure noise on the least noisy mode we have. */}

      {captions
        ? scenes.map((scene, i) => {
            if (!scene.narration_words?.length) return null;
            const w = plan.windows[i];
            return (
              <SceneClockProvider
                key={`cap-${scene.scene_id}`}
                window={{ start: w.start, end: w.start + w.frames, narrationStart: w.start }}
              >
                <CaptionTrack scene={scene} />
              </SceneClockProvider>
            );
          })
        : null}

      {/* Per-scene narration, timed to each beat's window. */}
      {scenes.map((scene, i) =>
        scene.narration_audio_url ? (
          <Sequence key={`n-${scene.scene_id}`} from={plan.windows[i].start} durationInFrames={plan.windows[i].frames}>
            <Audio src={scene.narration_audio_url} volume={1.3} />
          </Sequence>
        ) : null
      )}
    </AbsoluteFill>
  );
};
