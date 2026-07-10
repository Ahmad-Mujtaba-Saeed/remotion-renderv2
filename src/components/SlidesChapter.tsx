import React from 'react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { Scene } from '../types';
import { sceneFrames, transitionFrames, hasIncomingTransition } from '../timing';
import { SceneRouter } from './SceneRouter';
import { presentationFor } from '../transitions';
import { SfxCue } from '../sfx';

/**
 * A run of classic slide scenes: a TransitionSeries with per-scene transition
 * types and a whoosh under every cut. Extracted from ExplainerVideo so the
 * same code renders a whole slides-mode video AND a single slides chapter of
 * a hybrid video. indexOffset/totalCount keep global scene numbering (the
 * "04 —" eyebrow marks) correct when this run is only part of the video.
 */
export const SlidesChapter: React.FC<{
  scenes: Scene[];
  fps: number;
  indexOffset?: number;
  totalCount?: number;
}> = ({ scenes, fps, indexOffset = 0, totalCount }) => {
  if (!scenes.length) return null;

  const tf = transitionFrames(fps);
  const count = totalCount ?? scenes.length;

  // A whoosh under every scene transition (the cut itself).
  const transitionCues: React.ReactNode[] = [];
  {
    let cursor = 0;
    scenes.forEach((scene, i) => {
      if (hasIncomingTransition(scenes, i)) {
        cursor -= tf;
        transitionCues.push(
          <SfxCue
            key={`ts-${scene.scene_id}`}
            name={
              scene.transition === 'zoom_through' || scene.transition === 'whip_pan'
                ? 'whoosh_deep'
                : 'whoosh_soft'
            }
            at={cursor}
            volume={0.85}
            playbackRate={1.2}
          />
        );
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
                presentation={presentationFor(scene.transition)}
                timing={linearTiming({ durationInFrames: tf })}
              />
            );
          }

          nodes.push(
            <TransitionSeries.Sequence key={scene.scene_id} durationInFrames={sceneFrames(scene, fps)}>
              <SceneRouter scene={scene} index={indexOffset + i} count={count} />
            </TransitionSeries.Sequence>
          );

          return nodes;
        })}
      </TransitionSeries>
      {transitionCues}
    </>
  );
};
