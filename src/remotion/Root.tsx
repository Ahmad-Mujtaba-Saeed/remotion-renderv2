import React from 'react';
import { Composition } from 'remotion';
import { ExplainerVideo } from '../ExplainerVideo';
import { ThumbnailComp, ThumbnailProps } from '../ThumbnailComp';
import { ExplainerProps, ShotList, resolveCompositionMode } from '../types';
import { totalCanvasFrames, totalDurationInFrames, totalHybridFrames } from '../timing';
import { normalizeChapters } from '../chapters';

const EMPTY_SHOT_LIST: ShotList = { project_id: 'preview', scenes: [] };

/**
 * The composition's real size/duration come from inputProps via
 * calculateMetadata, so Laravel fully controls them per render.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
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
        const mode = resolveCompositionMode(p.shotList);
        const durationInFrames =
          mode === 'hybrid'
            ? totalHybridFrames(normalizeChapters(p.shotList), fps)
            : mode === 'canvas_journey' || mode === 'math_board'
              ? totalCanvasFrames(scenes, fps)
              : totalDurationInFrames(scenes, fps);
        return {
          durationInFrames,
          fps,
          width: p.width || 1920,
          height: p.height || 1080,
        };
      }}
    />
    {/* One-frame still for the §10.5 thumbnail generator (renderStill only). */}
    <Composition
      id="ExplainerThumbnail"
      component={ThumbnailComp}
      durationInFrames={1}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{ title: 'Explainer' } as ThumbnailProps}
      calculateMetadata={({ props }) => {
        const p = props as unknown as ThumbnailProps;
        return {
          durationInFrames: 1,
          fps: 30,
          width: p.width || 1280,
          height: p.height || 720,
        };
      }}
    />
    </>
  );
};
