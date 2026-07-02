import React from 'react';
import { Composition } from 'remotion';
import { ExplainerVideo } from '../ExplainerVideo';
import { ExplainerProps, ShotList, resolveCompositionMode } from '../types';
import { totalCanvasFrames, totalDurationInFrames } from '../timing';

const EMPTY_SHOT_LIST: ShotList = { project_id: 'preview', scenes: [] };

/**
 * The composition's real size/duration come from inputProps via
 * calculateMetadata, so Laravel fully controls them per render.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Explainer"
      component={ExplainerVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        shotList: EMPTY_SHOT_LIST,
        fps: 30,
        width: 1920,
        height: 1080,
      } as ExplainerProps}
      calculateMetadata={({ props }) => {
        const p = props as unknown as ExplainerProps;
        const fps = p.fps || 30;
        const scenes = p.shotList?.scenes ?? [];
        const canvasMode = resolveCompositionMode(p.shotList) === 'canvas_journey';
        return {
          durationInFrames: canvasMode
            ? totalCanvasFrames(scenes, fps)
            : totalDurationInFrames(scenes, fps),
          fps,
          width: p.width || 1920,
          height: p.height || 1080,
        };
      }}
    />
  );
};
