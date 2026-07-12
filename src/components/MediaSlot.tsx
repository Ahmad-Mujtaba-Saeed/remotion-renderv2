import React, { useLayoutEffect, useRef, useState } from 'react';
import { Img, Loop, Sequence, Video, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FrameSequence, Slot } from '../types';
import { CameraMove } from './CameraMove';
import { useTheme, inkOn, hairline, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { useRegionStyle } from '../canvas/RegionStyle';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { SPRINGS } from '../motion/springs';
import { clamp01, easeOutCubic } from '../motion/easing';
import { f30 } from '../motion/choreo';

/**
 * Renders an image (or video) slot with its camera move. If no asset has been
 * uploaded yet, a labelled placeholder is shown so previews still render — the
 * PHP render path refuses to start until all image slots are filled, so this
 * placeholder is only ever seen in the storyboard preview.
 *
 * Fit logic: when the media's real aspect (probed by Laravel into asset_ref)
 * fights the slot's shape — a portrait phone shot in a landscape region — the
 * media is CONTAINED at its natural aspect over a flat panel-coloured field
 * instead of being brutally centre-cropped by objectFit: cover.
 */

/**
 * Deterministic video playback from a pre-extracted JPEG frame sequence: the
 * exact still for the current frame is drawn with <Img> — no <video> element,
 * no seeking, so playback can never stick, stutter or step backwards (the
 * html5 <Video> path seeks per frame, and Chrome's snap-to-frame at exact
 * boundaries is what produced the back-and-forward frame jitter). Loops
 * naturally via modulo when the clip is shorter than its scene.
 */
const FrameStrip: React.FC<{ frames: FrameSequence; style: React.CSSProperties }> = ({ frames, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = Math.max(1, frames.count);
  const idx = (((Math.floor((Math.max(0, frame) * frames.fps) / fps) % count) + count) % count) + 1;
  return <Img src={`${frames.url_prefix}${String(idx).padStart(5, '0')}.jpg`} style={style} />;
};

/** Aspect of the slot's box, measured pre-transform (offset* ignores scale). */
const useBoxAspect = (): [React.RefObject<HTMLDivElement>, number | null] => {
  const ref = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.offsetHeight > 0) {
      setAspect(el.offsetWidth / el.offsetHeight);
    }
  }, []);
  return [ref, aspect];
};

export const MediaSlot: React.FC<{ slot: Slot }> = ({ slot }) => {
  const theme = useTheme();
  const u = useScaleUnit();
  const region = useRegionStyle();
  const { fps } = useVideoConfig();
  const { frame: clockFrame } = useSceneClock();
  const sceneWindow = useSceneWindow();
  const [boxRef, boxAspect] = useBoxAspect();
  const url = slot.asset_ref?.url;

  // Media settle (Law 2: decisive arrivals): every asset LANDS with a small
  // scale exhale over a fast fade instead of being baked into the frame —
  // the cut reads "edited", not "assembled". Runs on the scene clock so
  // canvas stations settle on camera arrival. Transform + opacity only.
  const settle = spring({ frame: Math.max(0, clockFrame), fps, config: SPRINGS.settle });
  const entrance: React.CSSProperties = {
    opacity: easeOutCubic(clamp01(clockFrame / f30(fps, 10))),
    transform: `scale(${1.025 - 0.025 * settle})`,
  };
  // Decide image-vs-video from the ACTUAL file, not the slot's declared
  // content_type — users may upload a jpg into a slot the AI marked `video`
  // (and vice versa), and feeding an image to <Video> throws media error 4.
  const ext = (url ?? '').split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'];
  const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v'];
  const isVideo = VIDEO_EXTS.includes(ext)
    ? true
    : IMAGE_EXTS.includes(ext)
      ? false
      : slot.asset_ref?.type
        ? slot.asset_ref.type === 'video'
        : slot.content_type === 'video';

  // Frameless canvas regions: media is a crisp rectangle on the field. No
  // shadow — depth belongs to the camera, not to a drop shadow under a photo.
  const framelessWrap: React.CSSProperties = region.frameless
    ? { borderRadius: region.mediaRadius, overflow: 'hidden' }
    : {};

  if (!url) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: theme.panel,
          // A hairline edge and mono type so the placeholder reads as a
          // reserved slot rather than a hole in the design. Storyboard preview
          // only — the render path refuses to start with an empty image slot.
          border: `1px solid ${hairline(theme, 0.14)}`,
          color: theme.muted,
          fontSize: 26 * u,
          fontFamily: MONO_FONT,
          textTransform: 'uppercase',
          letterSpacing: 2 * u,
          textAlign: 'center',
          padding: 48 * u,
          boxSizing: 'border-box',
          ...framelessWrap,
        }}
      >
        {slot.asset_request?.description || 'Image'}
      </div>
    );
  }

  // ---- Fit: contain-over-blur when the shapes disagree ----------------------
  const mediaW = slot.asset_ref?.width ?? null;
  const mediaH = slot.asset_ref?.height ?? null;
  const mediaAspect = mediaW && mediaH ? mediaW / mediaH : null;
  const mismatch =
    boxAspect && mediaAspect ? Math.max(boxAspect / mediaAspect, mediaAspect / boxAspect) : 1;
  const contained = mismatch > 1.25;
  const fitStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: contained ? 'contain' : 'cover',
  };

  // Behind a contained image or clip: one flat panel colour. The old blurred,
  // blown-up copy of the image was a `filter` living inside the camera-scaled
  // canvas world — the exact thing that forces Chromium to rasterize a subtree
  // and lands the region's text soft. A letterbox is not a place for texture.
  const containBackdrop = contained ? (
    <div style={{ position: 'absolute', inset: 0, background: theme.panel }} />
  ) : null;

  // Html5 <Video>, NOT <OffthreadVideo>: the Rust compositor races its own
  // asset download on Windows and dies with "No frame found at position N"
  // on the first frames of remote mp4s (reproduced repeatedly, even with
  // +faststart files). The browser video tag streams the same files fine
  // now that assets are served by this host process (see server.ts).
  //
  // Deliberately no onError. While rendering, Remotion never forwards it to
  // the <video> element; it only reads it as "the caller handles errors",
  // then swallows the MediaPlaybackError WITHOUT clearing its own
  // delayRender() handle. A bad clip therefore killed the render two minutes
  // later with an opaque delayRender timeout instead of reporting the media
  // error. Fail fast instead — and note this whole path is a fallback, since
  // RemotionRenderService pre-extracts every slot clip to a frame sequence.
  const video = <Video src={url} style={fitStyle} muted />;

  // A clip shorter than its scene must loop; the loop stops a couple of frames
  // short of the probed duration because seeking a <video> AT its very end
  // never completes and times out the render.
  const clipFrames = slot.asset_ref?.duration_seconds
    ? Math.max(1, Math.floor(slot.asset_ref.duration_seconds * fps) - 2)
    : null;

  // Prefer the extracted frame sequence when the backend shipped one — it is
  // the only fully deterministic playback path. <Video> stays as fallback for
  // clips without frames (extraction failed / too long).
  const frames = slot.asset_ref?.frames;

  let media = isVideo ? (
    frames?.count && frames.url_prefix ? (
      <FrameStrip frames={frames} style={fitStyle} />
    ) : clipFrames ? (
      <Loop durationInFrames={clipFrames}>{video}</Loop>
    ) : (
      video
    )
  ) : (
    <Img src={url} style={fitStyle} />
  );

  // Canvas-journey mode: mount the video ONLY while its region is on screen.
  // With scene isolation nothing else is visible anyway, and this means one
  // or two <video> elements seek per frame instead of every scene's — the
  // main cause of "stuck", repeating frames in long journeys. The clip also
  // starts from ITS first frame as the camera flies in.
  if (isVideo && sceneWindow?.mediaFrom !== undefined && sceneWindow.mediaUntil !== undefined) {
    media = (
      <Sequence
        from={sceneWindow.mediaFrom}
        durationInFrames={Math.max(1, sceneWindow.mediaUntil - sceneWindow.mediaFrom)}
        layout="none"
      >
        {media}
      </Sequence>
    );
  }

  return (
    <div ref={boxRef} style={{ width: '100%', height: '100%', position: 'relative', ...framelessWrap, ...entrance }}>
      {containBackdrop}
      {/* Panning letterboxed media around looks broken — contained assets get
          a gentle push-in instead of their assigned pan. */}
      <CameraMove move={contained ? 'slow_zoom_in' : slot.camera_move}>{media}</CameraMove>
      {slot.label ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 40 * u,
            padding: `${12 * u}px ${26 * u}px`,
            background: theme.accent,
            color: inkOn(theme.accent),
            fontSize: 32 * u,
            fontWeight: 700,
            fontFamily: MONO_FONT,
            textTransform: 'uppercase',
            letterSpacing: 2 * u,
          }}
        >
          {slot.label}
        </div>
      ) : null}
    </div>
  );
};
