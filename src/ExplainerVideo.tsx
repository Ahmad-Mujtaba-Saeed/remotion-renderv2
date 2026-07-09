import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { ExplainerProps, resolveCompositionMode } from './types';
import {
  sceneFrames,
  transitionFrames,
  hasIncomingTransition,
  narrationWindows,
  totalCanvasFrames,
  totalDurationInFrames,
  NarrationWindow,
} from './timing';
import { SceneRouter } from './components/SceneRouter';
import { ThemeProvider, useTheme, hairline } from './theme';
import { presentationFor } from './transitions';
import { GrainOverlay } from './components/AmbientBackground';
import { CanvasJourney } from './canvas/CanvasJourney';
import { SfxProvider, SfxCue } from './sfx';
import { FontLoader } from './fonts';

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
        <div style={{ height: 6, width: '100%', background: hairline(theme, 0.1) }}>
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
 * Sidechain-style music ducking: the bed sits at its base volume, dips under
 * the voice with a soft attack/release whenever narration speaks, swells back
 * in the beats between thoughts, and fades in/out at the video's edges.
 */
const musicVolumeCurve = (
  base: number,
  windows: NarrationWindow[],
  fps: number,
  total: number
): ((f: number) => number) => {
  const ramp = Math.max(1, Math.round(0.35 * fps));
  return (f: number): number => {
    let duck = 0;
    for (const w of windows) {
      const k = Math.min((f - w.start) / ramp, (w.end - f) / ramp, 1);
      if (k > duck) duck = Math.min(1, Math.max(0, k));
    }
    const fadeIn = Math.min(1, f / Math.round(0.8 * fps));
    const fadeOut = Math.min(1, Math.max(0, (total - 1 - f) / Math.round(1.6 * fps)));
    return Math.max(0, base * (1 - 0.6 * duck) * fadeIn * fadeOut);
  };
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

  const musicVolume = music?.url
    ? musicVolumeCurve(
        music.volume ?? 0.12,
        narrationWindows(scenes, fps, canvasMode ? 'canvas' : 'slides'),
        fps,
        canvasMode ? totalCanvasFrames(scenes, fps) : totalDurationInFrames(scenes, fps)
      )
    : null;

  if (canvasMode) {
    return (
      <ThemeProvider theme={shotList?.theme}>
        <SfxProvider config={shotList?.sfx}>
          <AbsoluteFill style={{ background: shotList?.theme?.bg_from ?? '#0f172a' }}>
            <FontLoader />
            {music?.url && musicVolume ? (
              <Audio src={music.url} volume={musicVolume} loop loopVolumeCurveBehavior="extend" />
            ) : null}
            <CanvasJourney shotList={shotList} />
            <GlobalOverlays />
          </AbsoluteFill>
        </SfxProvider>
      </ThemeProvider>
    );
  }

  // Slides mode: a whoosh under every scene transition (the cut itself).
  const transitionCues: React.ReactNode[] = [];
  {
    let cursor = 0;
    scenes.forEach((scene, i) => {
      if (hasIncomingTransition(scenes, i)) {
        cursor -= tf;
        transitionCues.push(
          <SfxCue
            key={`ts-${scene.scene_id}`}
            name={scene.transition === 'zoom_through' ? 'whoosh_deep' : 'whoosh_soft'}
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
    <ThemeProvider theme={shotList?.theme}>
      <SfxProvider config={shotList?.sfx}>
        <AbsoluteFill style={{ background: shotList?.theme?.bg_from ?? '#0f172a' }}>
          <FontLoader />
          {music?.url && musicVolume ? (
            <Audio src={music.url} volume={musicVolume} loop loopVolumeCurveBehavior="extend" />
          ) : null}
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
                    <SceneRouter scene={scene} index={i} count={scenes.length} />
                  </TransitionSeries.Sequence>
                );

                return nodes;
              })}
            </TransitionSeries>
          ) : null}
          {transitionCues}

          <GlobalOverlays />
        </AbsoluteFill>
      </SfxProvider>
    </ThemeProvider>
  );
};
