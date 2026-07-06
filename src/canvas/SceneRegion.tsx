import React from 'react';
import { useVideoConfig } from 'remotion';
import { CanvasItem, Scene } from '../types';
import { SceneLayout } from '../components/SceneRouter';
import { SceneClockProvider, SceneClockWindow } from './SceneClock';
import { RegionStyleProvider } from './RegionStyle';

/**
 * One scene as a FRAMELESS composition region on the world canvas (the soft
 * collage look): media masks itself with big rounded corners and a deep
 * shadow, text floats directly on the world background. No cards, no borders,
 * no rotation, no badges.
 *
 * The content is the scene's REGULAR layout rendered at the composition's
 * design resolution and uniformly scaled into the region — every layout,
 * theme token and responsive fix behaves identically in slides mode and here.
 *
 * `focus` (0..1) drives brightness/saturation and a micro scale-pop;
 * `lod` (0..1) fades regions that are too small to matter at the current
 * camera distance (deeply nested scenes stay invisible until you dive).
 */
export const SceneRegion: React.FC<{
  item: CanvasItem;
  scene: Scene;
  focus: number;
  lod: number;
  /** Isolation visibility (0..1): scenes off the camera's beat don't exist. */
  alpha?: number;
  clock: SceneClockWindow;
}> = ({ item, scene, focus, lod, alpha = 1, clock }) => {
  const { width: designW } = useVideoConfig();

  // Content is designed at the viewport's width with the height that keeps
  // the region's own aspect, then scaled uniformly into place.
  const scale = item.w / designW;
  const contentH = item.h / scale;

  const opacity = lod * alpha;
  if (opacity <= 0.01) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: item.x - item.w / 2,
        top: item.y - item.h / 2,
        width: item.w,
        height: item.h,
        opacity,
        transform: `scale(${1 + 0.015 * focus})`,
        transformOrigin: 'center center',
        filter: `brightness(${0.7 + 0.3 * focus}) saturate(${0.85 + 0.15 * focus})`,
      }}
    >
      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <div
          style={{
            width: designW,
            height: contentH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'relative',
          }}
        >
          <RegionStyleProvider value={{ frameless: true, mediaRadius: 48, aspect: item.w / Math.max(1, item.h) }}>
            <SceneClockProvider window={clock}>
              <SceneLayout scene={scene} />
            </SceneClockProvider>
          </RegionStyleProvider>
        </div>
      </div>
    </div>
  );
};
