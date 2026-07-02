import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { ExplainerProps, resolveCompositionMode } from './types';
import { sceneFrames, transitionFrames, hasIncomingTransition } from './timing';
import { SceneRouter } from './components/SceneRouter';
import { ThemeProvider, useTheme } from './theme';
import { presentationFor } from './transitions';
import { GrainOverlay } from './components/AmbientBackground';
import { CanvasJourney } from './canvas/CanvasJourney';

/** Global overlays drawn above every scene: a progress bar + film grain. */
const GlobalOverlays: React.FC = () => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 100], {
    extrapolateRight: 'clamp',
  });

  return (
    <>
      <GrainOverlay opacity={0.045} />
      <AbsoluteFill style={{ justifyContent: 'flex-end', pointerEvents: 'none' }}>
        <div style={{ height: 6, width: '100%', background: 'rgba(255,255,255,0.10)' }}>
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
            }}
          />
        </div>
      </AbsoluteFill>
    </>
  );
};

/**
 * Root composition. Theme-wrapped TransitionSeries with per-scene transition
 * types, plus global overlays. Scene durations come straight from the shot list.
 */
export const ExplainerVideo: React.FC<ExplainerProps> = ({ shotList, fps }) => {
  const scenes = shotList?.scenes ?? [];
  const tf = transitionFrames(fps);
  const music = shotList?.music;
  const canvasMode = resolveCompositionMode(shotList) === 'canvas_journey';
  // Narration: canvas mode plays it per-station inside CanvasJourney; slides
  // mode plays it per-scene inside SceneRouter (Kokoro, one clip per scene).

  if (canvasMode) {
    return (
      <ThemeProvider theme={shotList?.theme}>
        <AbsoluteFill style={{ background: shotList?.theme?.bg_from ?? '#0f172a' }}>
          {music?.url ? <Audio src={music.url} volume={music.volume ?? 0.16} loop /> : null}
          <CanvasJourney shotList={shotList} />
          <GlobalOverlays />
        </AbsoluteFill>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={shotList?.theme}>
      <AbsoluteFill style={{ background: shotList?.theme?.bg_from ?? '#0f172a' }}>
        {music?.url ? <Audio src={music.url} volume={music.volume ?? 0.16} loop /> : null}
        {scenes.length ? (
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
                  <SceneRouter scene={scene} />
                </TransitionSeries.Sequence>
              );

              return nodes;
            })}
          </TransitionSeries>
        ) : null}

        <GlobalOverlays />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
