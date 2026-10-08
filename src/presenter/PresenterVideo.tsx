import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene, ShotList } from '../types';
import { presenterWindows } from '../timing';
import { SceneRouter } from '../components/SceneRouter';
import { CaptionTrack } from '../components/CaptionTrack';
import { SceneMetaProvider } from '../components/SceneMeta';
import { HeroScene } from '../hero/runtime';
import { HeroStageProvider } from '../hero/kit';
import { useTheme } from '../theme';
import { SfxCue } from '../sfx';
import { clamp01 } from '../motion/easing';

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Presenter mode (videos built over MCP): the user's own talking-head
 * recording is the spine of the video, and the model's scenes are windows of
 * it. Each window says where the footage sits:
 *
 *   full    the presenter fills the frame (a custom scene may draw a
 *           transparent overlay on top: titles, keyword pops, arrows)
 *   pip     graphics fill the frame; the presenter shrinks into a corner
 *   split   presenter on one side (top in portrait), graphics on the other
 *   hidden  graphics only — the voice carries on
 *
 * The footage window ANIMATES between those places at every cut (a 0.6 s
 * ease), so "minimise to the corner" and "come back full screen" read as one
 * continuous camera move, not as hard cuts. One <Audio> plays the whole
 * recording; one <OffthreadVideo> reads the footage frame-exactly; the
 * graphics scenes mount under the window (pip/split/hidden) or over it (full).
 */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  opacity: number;
  /** 0..1: how much of the window's frame (border + shadow) shows. */
  chrome: number;
}

const layoutOf = (scene: Scene | undefined): string => scene?.presenter_layout ?? 'full';

/** Where the footage window sits for one scene, in frame pixels. */
export const presenterBox = (scene: Scene, W: number, H: number): Box => {
  const layout = layoutOf(scene);
  const m = Math.min(W, H);
  if (layout === 'split') {
    const portrait = H > W;
    const first = (scene.split_side ?? 'left') === 'left';
    if (portrait) {
      const h = Math.round(H * 0.46);
      return { x: 0, y: first ? 0 : H - h, w: W, h, r: 0, opacity: 1, chrome: 0 };
    }
    const w = Math.round(W * 0.46);
    return { x: first ? 0 : W - w, y: 0, w, h: H, r: 0, opacity: 1, chrome: 0 };
  }
  if (layout === 'pip' || layout === 'hidden') {
    const circle = scene.pip_shape === 'circle';
    const portrait = H > W;
    let w: number;
    let h: number;
    if (circle) {
      w = h = Math.round(portrait ? W * 0.36 : H * 0.3);
    } else if (portrait) {
      w = Math.round(W * 0.4);
      h = Math.round(w * 1.25);
    } else if (W === H) {
      w = h = Math.round(W * 0.32);
    } else {
      w = Math.round(W * 0.27);
      h = Math.round((w * 9) / 16);
    }
    const margin = Math.round(m * 0.045);
    const corner = scene.pip_corner ?? 'bottom_right';
    const x = corner.endsWith('left') ? margin : W - w - margin;
    const y = corner.startsWith('top') ? margin : H - h - margin;
    const r = circle ? w / 2 : Math.round(m * 0.028);
    if (layout === 'hidden') {
      // Hidden = the corner window, shrunk away and faded out: switching
      // pip <-> hidden reads as the window ducking out, full <-> hidden as a
      // zoom out of the footage into the graphics.
      const k = 0.55;
      return { x: x + (w * (1 - k)) / 2, y: y + (h * (1 - k)) / 2, w: w * k, h: h * k, r: r * k, opacity: 0, chrome: 1 };
    }
    return { x, y, w, h, r, opacity: 1, chrome: 1 };
  }
  return { x: 0, y: 0, w: W, h: H, r: 0, opacity: 1, chrome: 0 };
};

const mixBox = (a: Box, b: Box, t: number): Box => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
  r: a.r + (b.r - a.r) * t,
  opacity: a.opacity + (b.opacity - a.opacity) * t,
  chrome: a.chrome + (b.chrome - a.chrome) * t,
});

/** The graphics' region for one scene: the frame, minus the presenter's side in a split. */
const stageFor = (scene: Scene, W: number, H: number) => {
  const layout = layoutOf(scene);
  const box = presenterBox(scene, W, H);
  if (layout === 'split') {
    if (H > W) {
      return box.y === 0 ? { x: 0, y: box.h, width: W, height: H - box.h } : { x: 0, y: 0, width: W, height: H - box.h };
    }
    return box.x === 0 ? { x: box.w, y: 0, width: W - box.w, height: H } : { x: 0, y: 0, width: W - box.w, height: H };
  }
  return { x: 0, y: 0, width: W, height: H };
};

/** Frame ranges where the presenter is speaking (for ducking the music). */
export const presenterSpeechWindows = (shotList: ShotList, fps: number): Array<{ start: number; end: number }> => {
  const windows = presenterWindows(shotList, fps);
  const merge = Math.round(1.2 * fps);
  const out: Array<{ start: number; end: number }> = [];
  (shotList.scenes ?? []).forEach((scene, i) => {
    const base = windows[i]?.start ?? 0;
    for (const w of scene.narration_words ?? []) {
      const s = base + Math.round(w.start * fps);
      const e = base + Math.round(w.end * fps);
      const last = out[out.length - 1];
      if (last && s - last.end < merge) {
        last.end = Math.max(last.end, e);
      } else {
        out.push({ start: s, end: e });
      }
    }
  });
  return out;
};

const PresenterWindow: React.FC<{ shotList: ShotList; windows: Array<{ start: number; frames: number }> }> = ({
  shotList,
  windows,
}) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const theme = useTheme();
  const track = shotList.presenter;
  const scenes = shotList.scenes ?? [];
  if (!track?.video_url || scenes.length === 0) return null;

  // Which scene the playhead is in, and how far into its move we are.
  let i = 0;
  for (let k = 0; k < windows.length; k++) {
    if (frame >= windows[k].start) i = k;
  }
  const scene = scenes[i];
  const target = presenterBox(scene, W, H);
  const prev = i > 0 ? presenterBox(scenes[i - 1], W, H) : target;
  const moveFrames = Math.max(1, Math.min(Math.round(0.6 * fps), Math.floor((windows[i]?.frames ?? fps) / 2)));
  const t = easeInOutCubic(clamp01((frame - (windows[i]?.start ?? 0)) / moveFrames));
  const box = layoutOf(scenes[i - 1]) === layoutOf(scene) && i > 0 ? target : mixBox(prev, target, t);
  if (box.opacity <= 0.002) return null; // fully hidden: do not decode frames nobody sees

  const offsetFrames = Math.round((track.offset_seconds ?? 0) * fps);
  const u = Math.min(W, H) / 1080;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: box.x,
          top: box.y,
          width: box.w,
          height: box.h,
          borderRadius: box.r,
          overflow: 'hidden',
          opacity: box.opacity,
          background: '#000',
          // The corner window wears a frame so it reads as a window, not a crop.
          boxShadow: box.chrome > 0.01
            ? `0 ${Math.round(14 * u)}px ${Math.round(44 * u)}px rgba(0,0,0,${(0.38 * box.chrome).toFixed(3)}), 0 0 0 ${Math.max(1, Math.round(4 * u * box.chrome))}px ${theme.accent}`
            : undefined,
        }}
      >
        {track.frames?.count ? (
          <Img
            src={`${track.frames.url_prefix}${String(
              Math.min(
                track.frames.count,
                Math.max(1, Math.floor((frame / fps + (track.offset_seconds ?? 0)) * track.frames.fps + 1e-6) + 1)
              )
            ).padStart(6, '0')}.jpg`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <OffthreadVideo
            src={track.video_url}
            muted
            trimBefore={offsetFrames > 0 ? offsetFrames : undefined}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Opacity ramp at the head of a graphics scene that follows another one (a short dissolve). */
const FadeIn: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const frame = useCurrentFrame();
  const o = frames > 0 ? clamp01(frame / frames) : 1;
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const PresenterVideo: React.FC<{ shotList: ShotList; captions: boolean }> = ({ shotList, captions }) => {
  const { width: W, height: H, fps } = useVideoConfig();
  const scenes = shotList.scenes ?? [];
  const windows = presenterWindows(shotList, fps);
  const track = shotList.presenter;
  const offsetFrames = Math.round((track?.offset_seconds ?? 0) * fps);
  const fade = Math.round(0.25 * fps);

  const under: React.ReactNode[] = [];
  const over: React.ReactNode[] = [];
  const cues: React.ReactNode[] = [];

  scenes.forEach((scene, i) => {
    const w = windows[i];
    if (!w) return;
    const layout = layoutOf(scene);
    const stage = stageFor(scene, W, H);
    const box = presenterBox(scene, W, H);
    const presenterInfo =
      layout === 'pip' || layout === 'split'
        ? { layout, box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) } }
        : null;

    // A soft whoosh under every move of the footage window.
    if (i > 0 && layoutOf(scenes[i - 1]) !== layout) {
      cues.push(<SfxCue key={`pw-${scene.scene_id}`} name="whoosh_soft" at={w.start} volume={0.45} />);
    }

    if (scene.graphics === false) return;

    if (layout === 'full') {
      // Over the footage: only custom code, drawn transparently.
      if (!scene.hero?.js) return;
      over.push(
        <Sequence key={`o-${scene.scene_id}`} from={w.start} durationInFrames={w.frames} layout="none">
          <HeroStageProvider stage={{ ...stage, overlay: true, presenter: null }}>
            <SceneMetaProvider value={{ index: i, count: scenes.length, style: scene.style, words: scene.narration_words }}>
              <AbsoluteFill>
                <HeroScene scene={scene} fallback={null} />
              </AbsoluteFill>
            </SceneMetaProvider>
          </HeroStageProvider>
        </Sequence>
      );
      return;
    }

    // Under the window: a full scene (card or custom code). It runs a few
    // frames past its own end so the NEXT graphics scene can dissolve over
    // it instead of hard-cutting.
    const prevHasGraphics = i > 0 && scenes[i - 1].graphics !== false && layoutOf(scenes[i - 1]) !== 'full';
    const nextHasGraphics = i < scenes.length - 1 && scenes[i + 1].graphics !== false && layoutOf(scenes[i + 1]) !== 'full';
    const content = (
      <HeroStageProvider stage={{ ...stage, overlay: false, presenter: presenterInfo }}>
        <SceneRouter scene={scene} index={i} count={scenes.length} captions={false} />
      </HeroStageProvider>
    );
    under.push(
      <Sequence
        key={`u-${scene.scene_id}`}
        from={w.start}
        durationInFrames={w.frames + (nextHasGraphics ? fade : 0)}
        layout="none"
      >
        {layout === 'split' ? (
          // The scene's own backdrop would sit under the footage anyway;
          // clip the graphics to their side so nothing bleeds behind it.
          <AbsoluteFill style={{ clipPath: `inset(${stage.y}px ${W - stage.x - stage.width}px ${H - stage.y - stage.height}px ${stage.x}px)` }}>
            {prevHasGraphics ? <FadeIn frames={fade}>{content}</FadeIn> : content}
          </AbsoluteFill>
        ) : prevHasGraphics ? (
          <FadeIn frames={fade}>{content}</FadeIn>
        ) : (
          content
        )}
      </Sequence>
    );
  });

  return (
    <AbsoluteFill>
      {track?.audio_url ? <Audio src={track.audio_url} trimBefore={offsetFrames > 0 ? offsetFrames : undefined} volume={1} /> : null}
      {under}
      <PresenterWindow shotList={shotList} windows={windows} />
      {over}
      {captions
        ? scenes.map((scene, i) =>
            windows[i] && (scene.narration_words?.length ?? 0) > 0 ? (
              <Sequence key={`c-${scene.scene_id}`} from={windows[i].start} durationInFrames={windows[i].frames} layout="none">
                <AbsoluteFill style={{ pointerEvents: 'none' }}>
                  <CaptionTrack scene={scene} />
                </AbsoluteFill>
              </Sequence>
            ) : null
          )
        : null}
      {cues}
    </AbsoluteFill>
  );
};
