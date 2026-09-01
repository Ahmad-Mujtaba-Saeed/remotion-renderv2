import React from 'react';
import { useVideoConfig } from 'remotion';
import { Scene } from '../types';
import { SceneLayout } from '../components/SceneRouter';
import { RegionStyleProvider } from '../canvas/RegionStyle';
import { SceneMetaProvider } from '../components/SceneMeta';

/**
 * BoardFigure — a diagram (geometry_diagram / function_plot) rendered small on
 * the board, in the flow of the working. It reuses the REAL layout so every
 * shape, dash-draw and tick behaves exactly as elsewhere: the layout is
 * designed at the frame's resolution and uniformly scaled into the figure box
 * (same trick the canvas journey's SceneRegion uses). The board's SceneClock
 * (provided by MathBoard) drives its reveal timing.
 */
export const BoardFigure: React.FC<{
  scene: Scene;
  boxW: number;
  boxH: number;
  index: number;
  count: number;
}> = ({ scene, boxW, boxH, index, count }) => {
  const { width: designW, height: designH } = useVideoConfig();
  const scale = boxW / designW;

  return (
    <div style={{ width: boxW, height: boxH, overflow: 'hidden' }}>
      <div
        style={{
          width: designW,
          height: designH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'relative',
        }}
      >
        <RegionStyleProvider value={{ frameless: true, mediaRadius: 6, aspect: boxW / Math.max(1, boxH) }}>
          <SceneMetaProvider value={{ index, count, style: scene.style, words: scene.narration_words }}>
            <SceneLayout scene={scene} />
          </SceneMetaProvider>
        </RegionStyleProvider>
      </div>
    </div>
  );
};
