import React from 'react';
import { Composition } from 'remotion';
import { ExplainerVideo } from '../ExplainerVideo';
import { ThumbnailComp, ThumbnailProps } from '../ThumbnailComp';
import { ExplainerProps, ShotList } from '../types';
import { totalFramesFor } from '../timing';
import { ViralShort, shortDurationFrames } from '../shorts/ViralShort';
import type { ShortProps } from '../shorts/types';

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
        // The mode rules live in timing.ts so the dashboard's in-browser
        // player computes the same length from the same payload.
        const durationInFrames = totalFramesFor(p.shotList ?? EMPTY_SHOT_LIST, fps);
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
    {/* Long Video to Shorts: one fully edited vertical short (src/shorts). */}
    <Composition
      id="ViralShort"
      component={ViralShort as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{} as Record<string, unknown>}
      calculateMetadata={({ props }) => {
        const p = props as unknown as ShortProps;
        return {
          durationInFrames: shortDurationFrames(p),
          fps: p.fps || 30,
          width: p.width || 1080,
          height: p.height || 1920,
        };
      }}
    />
    </>
  );
};
