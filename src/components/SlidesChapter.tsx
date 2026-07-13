import React from 'react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { Scene } from '../types';
import { sceneFrames, transitionFrames, hasIncomingTransition } from '../timing';
import { SceneRouter } from './SceneRouter';
import { presentationFor } from '../transitions';
import { useTheme } from '../theme';
import { SfxCue, SfxName } from '../sfx';

/** The sound of a cut, from its story relation (copilot.md §3.2). Falls back
 *  to the old transition-shaped whoosh when the scene carries no relation. */
const cutCues = (
  scene: Scene,
  at: number,
  tf: number,
  fps: number
): Array<{ name: SfxName; at: number; volume: number; playbackRate?: number }> => {
  switch (scene.relation) {
    case 'continues':
      return [{ name: 'whoosh_soft', at, volume: 0.85 }];
    case 'elaborates':
      return [{ name: 'whoosh_deep', at, volume: 0.85 }];
    case 'consequence':
      return [{ name: 'whoosh_impact', at, volume: 0.85 }];
    case 'contrast':
      // The split opens on a soft whoosh; the stamp lands as the cut commits.
      return [
        { name: 'whoosh_soft', at, volume: 0.8 },
        { name: 'stamp', at: at + tf, volume: 0.55 },
      ];
    case 'callback':
      return [{ name: 'whoosh_rise', at, volume: 0.8, playbackRate: 0.8 }];
    case 'new_chapter':
      // Anticipation then arrival: the riser peaks exactly where the cut
      // commits (its file peaks at its end), the boom lands on it.
      return [
        { name: 'riser', at: at + tf - Math.round(1.4 * fps), volume: 0.8 },
        { name: 'sub_boom', at: at + tf, volume: 0.5 },
      ];
    default:
      return [
        {
          name:
            scene.transition === 'zoom_through' || scene.transition === 'whip_pan'
              ? 'whoosh_deep'
              : 'whoosh_soft',
          at,
          volume: 0.85,
          playbackRate: 1.2,
        },
      ];
  }
};

/**
 * A run of classic slide scenes: a TransitionSeries with per-scene transition
 * types and a relation-flavoured cue under every cut. Extracted from
 * ExplainerVideo so the same code renders a whole slides-mode video AND a
 * single slides chapter of a hybrid video. indexOffset/totalCount keep global
 * scene numbering (the "04 —" eyebrow marks) correct when this run is only
 * part of the video.
 */
export const SlidesChapter: React.FC<{
  scenes: Scene[];
  fps: number;
  indexOffset?: number;
  totalCount?: number;
  captions?: boolean;
}> = ({ scenes, fps, indexOffset = 0, totalCount, captions = false }) => {
  const theme = useTheme();
  if (!scenes.length) return null;

  const tf = transitionFrames(fps);
  const count = totalCount ?? scenes.length;

  // A cue under every scene transition (the cut itself), flavoured by the
  // scene's relation. The riser lead is authored at 30fps and rescaled here.
  const transitionCues: React.ReactNode[] = [];
  {
    let cursor = 0;
    scenes.forEach((scene, i) => {
      if (hasIncomingTransition(scenes, i)) {
        cursor -= tf;
        cutCues(scene, cursor, tf, fps).forEach((cue, j) => {
          transitionCues.push(
            <SfxCue
              key={`ts-${scene.scene_id}-${j}`}
              name={cue.name}
              at={cue.at}
              volume={cue.volume}
              playbackRate={cue.playbackRate}
            />
          );
        });
      }
      cursor += sceneFrames(scene, fps);
    });
  }

  return (
    <>
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const nodes: React.ReactNode[] = [];

          if (hasIncomingTransition(scenes, i)) {
            nodes.push(
              <TransitionSeries.Transition
                key={`t-${scene.scene_id}`}
                presentation={presentationFor(scene.transition, theme, scene.focus)}
                timing={linearTiming({ durationInFrames: tf })}
              />
            );
          }

          nodes.push(
            <TransitionSeries.Sequence key={scene.scene_id} durationInFrames={sceneFrames(scene, fps)}>
              <SceneRouter scene={scene} index={indexOffset + i} count={count} captions={captions} />
            </TransitionSeries.Sequence>
          );

          return nodes;
        })}
      </TransitionSeries>
      {transitionCues}
    </>
  );
};
