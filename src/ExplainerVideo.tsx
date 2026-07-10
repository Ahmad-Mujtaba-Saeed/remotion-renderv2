import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { ExplainerProps, resolveCompositionMode } from './types';
import {
  transitionFrames,
  narrationWindows,
  narrationWindowsHybrid,
  totalCanvasFrames,
  totalDurationInFrames,
  totalHybridFrames,
  chapterFrames,
  chapterWindows,
  NarrationWindow,
} from './timing';
import { normalizeChapters } from './chapters';
import { ThemeProvider, useTheme, hairline } from './theme';
import { presentationFor } from './transitions';
import { CanvasJourney } from './canvas/CanvasJourney';
import { SlidesChapter } from './components/SlidesChapter';
import { SfxProvider, SfxCue } from './sfx';
import { FontLoader } from './fonts';

/**
 * The only thing drawn above every scene: a hairline progress rule along the
 * bottom edge. The film-grain layer is gone — grain is a texture, and this
 * design has none.
 */
const GlobalOverlays: React.FC = () => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 100], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', pointerEvents: 'none' }}>
      <div style={{ height: 4, width: '100%', background: hairline(theme, 0.08) }}>
        <div style={{ height: '100%', width: `${pct}%`, background: theme.accent }} />
      </div>
    </AbsoluteFill>
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
 * Root composition, three shapes picked by composition_mode:
 *  - canvas_journey: one continuous camera flight across every scene;
 *  - slides:         a TransitionSeries of full-screen scenes;
 *  - hybrid:         a TransitionSeries of CHAPTERS, each itself a canvas
 *    journey (with its own world) or a slides run — the Composition Director
 *    on the PHP side decides where the boundaries fall.
 * The music bed always lives OUTSIDE any TransitionSeries so it never
 * remounts (an audible restart) at a boundary.
 */
export const ExplainerVideo: React.FC<ExplainerProps> = ({ shotList, fps }) => {
  const scenes = shotList?.scenes ?? [];
  const tf = transitionFrames(fps);
  const music = shotList?.music;
  const mode = resolveCompositionMode(shotList);

  const chapters = useMemo(
    () => (mode === 'hybrid' && shotList ? normalizeChapters(shotList) : []),
    [mode, shotList]
  );

  // Narration: canvas mode plays it per-station inside CanvasJourney; slides
  // mode plays it per-scene inside SceneRouter (Kokoro, one clip per scene).

  const duckWindows =
    mode === 'hybrid'
      ? narrationWindowsHybrid(chapters, fps)
      : narrationWindows(scenes, fps, mode === 'canvas_journey' ? 'canvas' : 'slides');
  const total =
    mode === 'hybrid'
      ? totalHybridFrames(chapters, fps)
      : mode === 'canvas_journey'
        ? totalCanvasFrames(scenes, fps)
        : totalDurationInFrames(scenes, fps);

  const musicVolume = music?.url ? musicVolumeCurve(music.volume ?? 0.12, duckWindows, fps, total) : null;

  const musicBed =
    music?.url && musicVolume ? (
      <Audio src={music.url} volume={musicVolume} loop loopVolumeCurveBehavior="extend" />
    ) : null;

  if (mode === 'canvas_journey') {
    return (
      <ThemeProvider theme={shotList?.theme}>
        <SfxProvider config={shotList?.sfx}>
          <AbsoluteFill style={{ background: shotList?.theme?.bg_from ?? '#0f172a' }}>
            <FontLoader />
            {musicBed}
            <CanvasJourney scenes={scenes} plan={shotList?.canvas} aspect={shotList?.aspect_ratio} />
            <GlobalOverlays />
          </AbsoluteFill>
        </SfxProvider>
      </ThemeProvider>
    );
  }

  if (mode === 'hybrid') {
    const windows = chapterWindows(chapters, fps);

    // A deep whoosh under every chapter boundary — the act break.
    const chapterCues: React.ReactNode[] = chapters.flatMap((ch, i) =>
      windows[i].hasTransition
        ? [
            <SfxCue
              key={`ct-${ch.chapter.id ?? i}`}
              name={
                ch.chapter.transition_in === 'zoom_through' || ch.chapter.transition_in === 'whip_pan'
                  ? 'whoosh_deep'
                  : 'whoosh_rise'
              }
              at={windows[i].start}
              volume={0.9}
            />,
          ]
        : []
    );

    let sceneCursor = 0;

    return (
      <ThemeProvider theme={shotList?.theme}>
        <SfxProvider config={shotList?.sfx}>
          <AbsoluteFill style={{ background: shotList?.theme?.bg_from ?? '#0f172a' }}>
            <FontLoader />
            {musicBed}
            <TransitionSeries>
              {chapters.flatMap((ch, i) => {
                const nodes: React.ReactNode[] = [];

                if (windows[i].hasTransition) {
                  nodes.push(
                    <TransitionSeries.Transition
                      key={`t-${ch.chapter.id ?? i}`}
                      presentation={presentationFor(ch.chapter.transition_in)}
                      timing={linearTiming({ durationInFrames: tf })}
                    />
                  );
                }

                const indexOffset = sceneCursor;
                sceneCursor += ch.scenes.length;

                nodes.push(
                  <TransitionSeries.Sequence
                    key={ch.chapter.id ?? `ch-${i}`}
                    durationInFrames={chapterFrames(ch, fps)}
                  >
                    {ch.chapter.mode === 'canvas' ? (
                      <CanvasJourney
                        scenes={ch.scenes}
                        plan={ch.chapter.canvas}
                        aspect={shotList?.aspect_ratio}
                      />
                    ) : (
                      <SlidesChapter
                        scenes={ch.scenes}
                        fps={fps}
                        indexOffset={indexOffset}
                        totalCount={scenes.length}
                      />
                    )}
                  </TransitionSeries.Sequence>
                );

                return nodes;
              })}
            </TransitionSeries>
            {chapterCues}
            <GlobalOverlays />
          </AbsoluteFill>
        </SfxProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={shotList?.theme}>
      <SfxProvider config={shotList?.sfx}>
        <AbsoluteFill style={{ background: shotList?.theme?.bg_from ?? '#0f172a' }}>
          <FontLoader />
          {musicBed}
          <SlidesChapter scenes={scenes} fps={fps} />
          <GlobalOverlays />
        </AbsoluteFill>
      </SfxProvider>
    </ThemeProvider>
  );
};
