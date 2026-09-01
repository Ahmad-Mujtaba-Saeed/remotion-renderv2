import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { ExplainerProps, Scene, resolveCompositionMode } from './types';
import { MONO_FONT } from './theme';
import type { ChapterWindow } from './timing';
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
import { ThemeProvider, SkinProvider, useTheme, hairline, skinTheme } from './theme';
import { MotionStyleProvider } from './motion/styles';
import { MotionBlurProvider } from './motion/ghost';
import { DEFAULT_THEME } from './types';
import { presentationFor } from './transitions';
import { CanvasJourney } from './canvas/CanvasJourney';
import { MathBoard } from './board/MathBoard';
import { boardTheme, resolveBoardStyle } from './board/boardTheme';
import { SlidesChapter } from './components/SlidesChapter';
import { BackdropProvider } from './components/AmbientBackground';
import { SfxProvider, SfxCue } from './sfx';
import { FontLoader } from './fonts';

/**
 * Screen-space chrome drawn above every scene: the hairline progress rule
 * along the bottom edge, the optional brand-logo watermark (§10.4, 6%
 * opacity bottom-right — outside every camera world so it never scales), and
 * the optional `02 / 06` chapter chip (§10.3, mono, kicker position, hybrid
 * only). The film-grain layer is gone — grain is a texture, and this design
 * has none.
 */
const GlobalOverlays: React.FC<{
  logoUrl?: string | null;
  chapterChip?: boolean;
  chapterWindowList?: ChapterWindow[];
}> = ({ logoUrl, chapterChip = false, chapterWindowList = [] }) => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const pct = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 100], {
    extrapolateRight: 'clamp',
  });

  // Which chapter the playhead is inside (chip is hybrid-only by contract:
  // no windows, no chip).
  let chipText: string | null = null;
  if (chapterChip && chapterWindowList.length > 1) {
    let current = 0;
    chapterWindowList.forEach((w, i) => {
      if (frame >= w.start) current = i;
    });
    const pad = (n: number): string => String(n).padStart(2, '0');
    chipText = `${pad(current + 1)} / ${pad(chapterWindowList.length)}`;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {logoUrl ? (
        <Img
          src={logoUrl}
          style={{
            position: 'absolute',
            right: 40 * u,
            bottom: 40 * u,
            maxWidth: 150 * u,
            maxHeight: 76 * u,
            objectFit: 'contain',
            opacity: 0.06,
          }}
        />
      ) : null}
      {chipText ? (
        <div
          style={{
            position: 'absolute',
            top: 44 * u,
            left: 48 * u,
            fontFamily: MONO_FONT,
            fontSize: 26 * u,
            fontWeight: 700,
            letterSpacing: 4 * u,
            color: theme.muted,
          }}
        >
          {chipText}
        </div>
      ) : null}
      <AbsoluteFill style={{ justifyContent: 'flex-end' }}>
        <div style={{ height: 4, width: '100%', background: hairline(theme, 0.08) }}>
          <div style={{ height: '100%', width: `${pct}%`, background: theme.accent }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Sidechain-style music ducking (copilot.md §6.2). A real compressor
 * envelope, not a symmetric ramp: a FAST attack (5f @30, starting a hair
 * before the word onset so the voice is never fighting the bed) down to a
 * 0.35× floor while words are active, and a SLOWER release (12f) so the
 * swell back never pumps. Word-level windows (timing.ts) mean any real pause
 * ≥1.2s inside a scene lets the music breathe. An optional swell window
 * (the outro card) lifts the bed ~15% so the video RESOLVES, riding into a
 * 2-second fade that reaches silence exactly on the last frame.
 */
export const musicVolumeCurve = (
  base: number,
  windows: NarrationWindow[],
  fps: number,
  total: number,
  // One or many swell windows (chapter covers + the outro); a bare window is
  // accepted for back-compat with the audio audit script.
  swellWindow: NarrationWindow[] | NarrationWindow | null = null
): ((f: number) => number) => {
  const attack = Math.max(1, Math.round((5 / 30) * fps));
  const release = Math.max(1, Math.round((12 / 30) * fps));
  const lead = Math.max(1, Math.round(attack * 0.6));
  const swellRamp = Math.max(1, Math.round((24 / 30) * fps));
  const swells: NarrationWindow[] =
    swellWindow == null ? [] : Array.isArray(swellWindow) ? swellWindow : [swellWindow];
  return (f: number): number => {
    let duck = 0;
    for (const w of windows) {
      let k = 0;
      const attackStart = w.start - lead;
      if (f >= attackStart && f <= w.end) {
        k = Math.min(1, (f - attackStart) / attack);
      } else if (f > w.end) {
        k = Math.max(0, 1 - (f - w.end) / release);
      }
      if (k > duck) duck = k;
      if (duck >= 1) break;
    }
    let swell = 1;
    for (const sw of swells) {
      if (f >= sw.start && f <= sw.end) {
        swell = 1 + 0.15 * Math.min(1, (f - sw.start) / swellRamp);
        break;
      }
    }
    const fadeIn = Math.min(1, f / Math.round(0.8 * fps));
    const fadeOut = Math.min(1, Math.max(0, (total - 1 - f) / Math.round(2.0 * fps)));
    return Math.max(0, base * (1 - 0.65 * duck) * swell * fadeIn * fadeOut);
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
  // Karaoke captions (§4.4): Laravel resolves the default (on for 9:16, off
  // for 16:9) — the renderer only obeys an explicit true.
  const captions = shotList?.captions?.enabled === true;
  const fontPack = shotList?.font_pack ?? undefined;
  // The blueprint skin carries a fixed palette (theme.tsx) — resolved ONCE
  // here so every branch below mounts the same theme, exactly as the board
  // skins do for the math board.
  const theme = skinTheme(shotList?.skin, shotList?.theme ?? DEFAULT_THEME);
  // Camera motion blur (§2.10): stacked shutter samples on fast flights. ON
  // unless the payload explicitly disables it — the strobe it removes is a
  // defect, not a style, so this one defaults on rather than opting in.
  const motionBlurOn = shotList?.motion_blur?.enabled !== false;
  // Mood backdrop field (§11.5): only an explicit true turns it on, so
  // payloads from before the field existed render byte-identically.
  const backdropOn = shotList?.backdrop?.enabled === true;

  const chapters = useMemo(
    () => (mode === 'hybrid' && shotList ? normalizeChapters(shotList) : []),
    [mode, shotList]
  );

  // Narration: canvas mode plays it per-station inside CanvasJourney; slides
  // mode plays it per-scene inside SceneRouter (Kokoro, one clip per scene).

  // math_board plays scenes back-to-back on one continuous camera clock, just
  // like the canvas journey — no transition overlaps to subtract.
  const boardish = mode === 'canvas_journey' || mode === 'math_board';
  const duckWindows =
    mode === 'hybrid'
      ? narrationWindowsHybrid(chapters, fps)
      : narrationWindows(scenes, fps, boardish ? 'canvas' : 'slides');
  const total =
    mode === 'hybrid'
      ? totalHybridFrames(chapters, fps)
      : boardish
        ? totalCanvasFrames(scenes, fps)
        : totalDurationInFrames(scenes, fps);

  // The outro card carries no narration — the bed swells there so the video
  // resolves musically instead of just stopping (its window is always the
  // tail of the global clock: the outro is by construction the last scene).
  const lastScene = scenes[scenes.length - 1];
  const swellWindows: NarrationWindow[] = [];
  if (lastScene?.layout_template === 'outro_card') {
    swellWindows.push({
      start: total - Math.round((lastScene.duration_seconds || 3.2) * fps),
      end: total,
    });
  }

  // Chapter covers (§5.5) are single-scene slides mini-chapters — the bed
  // swells across each one so the act break lands musically too.
  const isCoverChapter = (rc: { scenes: Scene[] }): boolean =>
    rc.scenes.length === 1 && rc.scenes[0].layout_template === 'chapter_cover';
  const hybridWindows = mode === 'hybrid' ? chapterWindows(chapters, fps) : [];
  if (mode === 'hybrid') {
    chapters.forEach((ch, i) => {
      if (isCoverChapter(ch)) {
        swellWindows.push({
          start: hybridWindows[i].start,
          end: hybridWindows[i].start + hybridWindows[i].frames,
        });
      }
    });
  }

  const musicVolume = music?.url
    ? musicVolumeCurve(music.volume ?? 0.12, duckWindows, fps, total, swellWindows)
    : null;

  const musicBed =
    music?.url && musicVolume ? (
      <Audio src={music.url} volume={musicVolume} loop loopVolumeCurveBehavior="extend" />
    ) : null;

  if (mode === 'math_board') {
    // A separate paradigm for worked-math videos (copilot.md math board): the
    // whole solution accumulates on ONE continuous surface and a calm
    // teacher's-eye camera writes the equation, glances at a diagram, steps
    // aside to a concept and returns — none of the canvas journey's flight.
    //
    // The board may carry its own SKIN (chalk / notebook): a fixed palette
    // provided as THE theme, so every board component restyles at once. The
    // base is the skin-resolved theme, so a slate board under the blueprint
    // skin draws on navy; chalk/notebook's fixed palettes still win.
    const boardStyle = resolveBoardStyle(shotList?.board_style);
    const bTheme = boardTheme(boardStyle, theme);
    return (
      <ThemeProvider theme={bTheme}>
        <SkinProvider skin={shotList?.skin}>
        <BackdropProvider enabled={backdropOn}>
        <MotionStyleProvider style={shotList?.motion_style}>
        <MotionBlurProvider enabled={motionBlurOn}>
        <SfxProvider config={shotList?.sfx}>
          <AbsoluteFill style={{ background: bTheme.bg_from }}>
            <FontLoader pack={fontPack} />
            {musicBed}
            <MathBoard scenes={scenes} captions={captions} boardStyle={boardStyle} />
            <GlobalOverlays logoUrl={shotList?.brand?.logo_url} />
          </AbsoluteFill>
        </SfxProvider>
        </MotionBlurProvider>
        </MotionStyleProvider>
        </BackdropProvider>
        </SkinProvider>
      </ThemeProvider>
    );
  }

  if (mode === 'canvas_journey') {
    return (
      <ThemeProvider theme={theme}>
        <SkinProvider skin={shotList?.skin}>
        <BackdropProvider enabled={backdropOn}>
        <MotionStyleProvider style={shotList?.motion_style}>
        <MotionBlurProvider enabled={motionBlurOn}>
        <SfxProvider config={shotList?.sfx}>
          <AbsoluteFill style={{ background: theme.bg_from ?? '#0f172a' }}>
            <FontLoader pack={fontPack} />
            {musicBed}
            <CanvasJourney
              scenes={scenes}
              plan={shotList?.canvas}
              aspect={shotList?.aspect_ratio}
              captions={captions}
              motionBlur={motionBlurOn}
            />
            <GlobalOverlays logoUrl={shotList?.brand?.logo_url} chapterChip={shotList?.chapter_chip?.enabled === true} chapterWindowList={hybridWindows} />
          </AbsoluteFill>
        </SfxProvider>
        </MotionBlurProvider>
        </MotionStyleProvider>
        </BackdropProvider>
        </SkinProvider>
      </ThemeProvider>
    );
  }

  if (mode === 'hybrid') {
    const windows = hybridWindows;

    // The act break (copilot.md §6.5): a riser leads INTO every chapter
    // boundary and a soft sub boom lands ON it — anticipation, then arrival,
    // the way a trailer cuts. The riser peaks at its end, so it starts early
    // enough to top out exactly on the boundary frame. A boundary OUT of a
    // chapter cover stays silent: its act break already fired going in —
    // cueing both sides would double-hit 3 seconds apart.
    const riserLead = Math.round(1.4 * fps);
    const chapterCues: React.ReactNode[] = chapters.flatMap((ch, i) =>
      windows[i].hasTransition && !(i > 0 && isCoverChapter(chapters[i - 1]))
        ? [
            <SfxCue
              key={`ct-riser-${ch.chapter.id ?? i}`}
              name="riser"
              at={windows[i].start - riserLead}
              volume={0.85}
            />,
            <SfxCue
              key={`ct-boom-${ch.chapter.id ?? i}`}
              name="sub_boom"
              at={windows[i].start}
              volume={0.55}
            />,
          ]
        : []
    );

    let sceneCursor = 0;

    return (
      <ThemeProvider theme={theme}>
        <SkinProvider skin={shotList?.skin}>
        <BackdropProvider enabled={backdropOn}>
        <MotionStyleProvider style={shotList?.motion_style}>
        <MotionBlurProvider enabled={motionBlurOn}>
        <SfxProvider config={shotList?.sfx}>
          <AbsoluteFill style={{ background: theme.bg_from ?? '#0f172a' }}>
            <FontLoader pack={fontPack} />
            {musicBed}
            <TransitionSeries>
              {chapters.flatMap((ch, i) => {
                const nodes: React.ReactNode[] = [];

                if (windows[i].hasTransition) {
                  nodes.push(
                    <TransitionSeries.Transition
                      key={`t-${ch.chapter.id ?? i}`}
                      presentation={presentationFor(ch.chapter.transition_in, theme, null, tf)}
                      timing={linearTiming({ durationInFrames: tf })}
                    />
                  );
                }

                const indexOffset = sceneCursor;
                sceneCursor += ch.scenes.length;

                const body =
                  ch.chapter.mode === 'canvas' ? (
                    <CanvasJourney
                      scenes={ch.scenes}
                      plan={ch.chapter.canvas}
                      aspect={shotList?.aspect_ratio}
                      captions={captions}
                      motionBlur={motionBlurOn}
                    />
                  ) : (
                    <SlidesChapter
                      scenes={ch.scenes}
                      fps={fps}
                      indexOffset={indexOffset}
                      totalCount={scenes.length}
                      captions={captions}
                    />
                  );

                nodes.push(
                  <TransitionSeries.Sequence
                    key={ch.chapter.id ?? `ch-${i}`}
                    durationInFrames={chapterFrames(ch, fps)}
                  >
                    {/* §11.4 accent shift: a chapter may carry its own hue-
                        rotated accent (computed server-side — no runtime
                        filters). The rest of the scheme stays put. Skipped
                        under blueprint: the accent was rotated from the
                        SCHEME the fixed palette just replaced. */}
                    {ch.chapter.accent && shotList?.skin !== 'blueprint' ? (
                      <ThemeProvider theme={{ ...theme, accent: ch.chapter.accent }}>
                        {body}
                      </ThemeProvider>
                    ) : (
                      body
                    )}
                  </TransitionSeries.Sequence>
                );

                return nodes;
              })}
            </TransitionSeries>
            {chapterCues}
            <GlobalOverlays logoUrl={shotList?.brand?.logo_url} chapterChip={shotList?.chapter_chip?.enabled === true} chapterWindowList={hybridWindows} />
          </AbsoluteFill>
        </SfxProvider>
        </MotionBlurProvider>
        </MotionStyleProvider>
        </BackdropProvider>
        </SkinProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <SkinProvider skin={shotList?.skin}>
        <BackdropProvider enabled={backdropOn}>
      <MotionStyleProvider style={shotList?.motion_style}>
        <MotionBlurProvider enabled={motionBlurOn}>
      <SfxProvider config={shotList?.sfx}>
        <AbsoluteFill style={{ background: theme.bg_from ?? '#0f172a' }}>
          <FontLoader pack={fontPack} />
          {musicBed}
          <SlidesChapter scenes={scenes} fps={fps} captions={captions} />
          <GlobalOverlays logoUrl={shotList?.brand?.logo_url} chapterChip={shotList?.chapter_chip?.enabled === true} chapterWindowList={hybridWindows} />
        </AbsoluteFill>
      </SfxProvider>
      </MotionBlurProvider>
        </MotionStyleProvider>
      </BackdropProvider>
        </SkinProvider>
    </ThemeProvider>
  );
};
