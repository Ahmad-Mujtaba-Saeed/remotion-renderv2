import React from 'react';
import { AbsoluteFill, Freeze, Loop, Sequence, Video, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Box, Panel, ShortEvent, ShortProps } from './types';
import { cropAt, outToSrc, type PlacedSegment } from './timeline';

/**
 * The video panels of a short.
 *
 * Every panel is the same trick: a clipped rectangle on the 1080x1920 canvas
 * with the source <Video> scaled and offset inside it so exactly the crop
 * window shows. A following crop recomputes that offset every frame from the
 * face track; a static crop (a facecam inset, a gameplay area) never moves.
 *
 * HTML5 <Video>, not <OffthreadVideo>: on Windows the Rust compositor races
 * its own download of served mp4s ("No frame found"); the browser tag streams
 * the same files reliably (see components/MediaSlot.tsx).
 */

type Rect = { x: number; y: number; w: number; h: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A crop window of the requested aspect, centred on (cx, cy), inside the frame. */
const windowAt = (cx: number, cy: number, cw: number, ch: number, sw: number, sh: number): Rect => {
  const w = Math.min(cw, sw);
  const h = Math.min(ch, sh);
  return {
    x: clamp(cx - w / 2, 0, sw - w),
    y: clamp(cy - h / 2, 0, sh - h),
    w,
    h,
  };
};

/** Grow a box to the destination aspect around its centre (cover semantics). */
const fitBox = (box: Box, aspect: number, sw: number, sh: number, inset = false): Rect => {
  let w = box[2] * sw;
  let h = box[3] * sh;
  const cx = (box[0] + box[2] / 2) * sw;
  const cy = (box[1] + box[3] / 2) * sh;
  if (inset) {
    // Trim inside the box (cover within it), keeping the upper part: a
    // webcam's face sits high and the strip under it is overlay chrome.
    if (w / h > aspect) {
      w = h * aspect;
      return windowAt(cx, box[1] * sh + h / 2, w, h, sw, sh);
    }
    const nh = w / aspect;
    return windowAt(cx, box[1] * sh + nh / 2 + (h - nh) * 0.25, w, nh, sw, sh);
  }
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  // Too big for the frame: shrink back to fit, keeping the aspect.
  const k = Math.min(1, sw / w, sh / h);
  w *= k;
  h *= k;
  return windowAt(cx, cy, w, h, sw, sh);
};

/** The main video (or gameplay) as timeline segments, positioned by `style`. */
const SegmentVideo: React.FC<{
  props: ShortProps;
  placed: PlacedSegment[];
  source: 'main' | 'gameplay';
  style: React.CSSProperties;
}> = ({ props, placed, source, style }) => {
  const { fps } = useVideoConfig();
  if (source === 'gameplay' && props.gameplay) {
    const g = props.gameplay;
    const loopFrames = Math.max(1, Math.floor((g.duration - (g.startFrom || 0)) * fps) - 2);
    return (
      <Loop durationInFrames={loopFrames} layout="none">
        <Video src={g.url} muted trimBefore={Math.round((g.startFrom || 0) * fps)} style={style} />
      </Loop>
    );
  }
  return (
    <>
      {placed.map((seg, i) => {
        const from = Math.round(seg.out * fps);
        const frames = Math.max(1, Math.round((seg.out + seg.dur) * fps) - from);
        const trim = Math.max(0, Math.round(seg.src * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={frames} layout="none">
            {seg.freeze ? (
              <Freeze frame={0}>
                <Video src={props.video.url} muted trimBefore={trim} style={style} />
              </Freeze>
            ) : (
              <Video
                src={props.video.url}
                muted
                trimBefore={trim}
                playbackRate={seg.rate || 1}
                style={style}
              />
            )}
          </Sequence>
        );
      })}
    </>
  );
};

/** Punch-in scale on the primary panel at output time t. */
export const zoomAt = (events: ShortEvent[], t: number, drift: number, total: number): number => {
  let z = 1 + (drift - 1) * Math.min(1, t / Math.max(1, total));
  for (const e of events) {
    if (e.type !== 'zoom' || t < e.start || t > e.end) continue;
    const len = Math.max(0.05, e.end - e.start);
    const inT = Math.min(1, (t - e.start) / Math.min(0.12, len / 2));
    const outT = Math.min(1, (e.end - t) / Math.min(0.18, len / 2));
    const k = Math.min(inT, outT);
    const ease = 1 - Math.pow(1 - k, 3);
    z *= 1 + (e.scale - 1) * ease;
  }
  return z;
};

/**
 * How far a reaction takeover has progressed at output time t (0 = the normal
 * layout, 1 = the streamer's cam fills the screen). The classic stream-clip
 * move: on the big reaction the game gets out of the way.
 */
export const takeoverAt = (events: ShortEvent[], t: number): { k: number; dest: Box } => {
  let k = 0;
  let dest: Box = TAKEOVER_DEST;
  for (const e of events) {
    if (e.type !== 'takeover' || t < e.start || t > e.end) continue;
    const len = Math.max(0.1, e.end - e.start);
    const inT = Math.min(1, (t - e.start) / Math.min(0.22, len / 3));
    const outT = Math.min(1, (e.end - t) / Math.min(0.3, len / 3));
    const x = Math.min(inT, outT);
    const eased = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    if (eased > k) {
      k = eased;
      dest = e.dest ?? TAKEOVER_DEST;
    }
  }
  return { k, dest };
};

/**
 * Where a takeover grows the cam to: full width, a near-square in the middle.
 * Not the whole 9:16 — a webcam is ~4:3, so filling the phone means cropping
 * away most of it and upscaling what is left several times over.
 */
const TAKEOVER_DEST: Box = [0, 0.16, 1, 0.56];

const lerpBox = (a: Box, b: Box, k: number): Box =>
  [0, 1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * k) as Box;

const PanelView: React.FC<{
  panel: Panel;
  props: ShortProps;
  placed: PlacedSegment[];
  zoom: number;
  filter?: string;
}> = ({ panel, props, placed, zoom, filter }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const dest: Rect = {
    x: panel.dest[0] * width,
    y: panel.dest[1] * height,
    w: panel.dest[2] * width,
    h: panel.dest[3] * height,
  };
  const aspect = dest.w / Math.max(1, dest.h);
  const isGameplay = panel.source === 'gameplay';
  const sw = isGameplay ? 1080 : props.video.width;
  const sh = isGameplay ? 768 : props.video.height;

  let win: Rect;
  if (panel.track && panel.track.keys.length && !isGameplay) {
    const cw = panel.track.width * sw;
    const ch = cw / aspect;
    const scale = ch > sh ? sh / ch : 1;
    const c = cropAt(panel.track.keys, outToSrc(placed, t));
    win = windowAt(c.cx * sw, c.cy * sh, cw * scale, ch * scale, sw, sh);
  } else if (panel.crop) {
    win = fitBox(panel.crop, aspect, sw, sh, !!panel.inset);
  } else {
    win = fitBox([0, 0, 1, 1], aspect, sw, sh);
  }

  const contain = panel.fit === 'contain';
  let videoStyle: React.CSSProperties;
  if (contain) {
    // Whole crop visible, centred, letterboxed.
    const box = panel.crop ?? [0, 0, 1, 1];
    const cw = box[2] * sw;
    const ch = box[3] * sh;
    const s = Math.min(dest.w / cw, dest.h / ch);
    videoStyle = {
      position: 'absolute',
      width: sw * s,
      height: sh * s,
      left: (dest.w - cw * s) / 2 - box[0] * sw * s,
      top: (dest.h - ch * s) / 2 - box[1] * sh * s,
      maxWidth: 'none',
    };
  } else {
    const s = dest.w / win.w;
    videoStyle = {
      position: 'absolute',
      width: sw * s,
      height: sh * s,
      left: -win.x * s,
      top: -win.y * s,
      maxWidth: 'none',
    };
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: dest.x,
        top: dest.y,
        width: dest.w,
        height: dest.h,
        overflow: 'hidden',
        borderRadius: panel.radius ?? 0,
        border: panel.border,
        boxSizing: 'border-box',
      }}
    >
      {contain ? (
        <div style={{ position: 'absolute', inset: -40, filter: 'blur(28px) brightness(0.55)', overflow: 'hidden' }}>
          <SegmentVideo
            props={props}
            placed={placed}
            source={panel.source}
            style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: zoom !== 1 ? `scale(${zoom})` : undefined,
          transformOrigin: '50% 42%',
          filter,
        }}
      >
        <SegmentVideo props={props} placed={placed} source={panel.source} style={videoStyle} />
      </div>
    </div>
  );
};

export const Panels: React.FC<{
  props: ShortProps;
  placed: PlacedSegment[];
  total: number;
  filter?: string;
}> = ({ props, placed, total, filter }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const layout = props.layout;
  const { k: take, dest: takeDest } = takeoverAt(props.events, t);
  // During a takeover the primary panel is drawn last so it covers the rest.
  const order = layout.panels
    .map((panel, i) => ({ panel, i }))
    .sort((a, b) => (take > 0 ? Number(!!a.panel.primary) - Number(!!b.panel.primary) : a.i - b.i));

  return (
    <AbsoluteFill>
      {layout.background === 'blur' ? (
        <AbsoluteFill style={{ filter: 'blur(40px) brightness(0.5) saturate(1.2)', transform: 'scale(1.15)' }}>
          <SegmentVideo
            props={props}
            placed={placed}
            source="main"
            style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      ) : layout.background === 'gradient' ? (
        <AbsoluteFill style={{ background: `linear-gradient(160deg, #111 0%, ${props.style.accent}55 100%)` }} />
      ) : null}
      {order.map(({ panel, i }) => (
        <PanelView
          key={i}
          panel={
            take > 0 && panel.primary
              ? { ...panel, dest: lerpBox(panel.dest, takeDest, take), radius: (panel.radius ?? 0) * (1 - take) }
              : panel
          }
          props={props}
          placed={placed}
          zoom={panel.primary ? zoomAt(props.events, t, props.style.drift, total) : 1}
          filter={filter}
        />
      ))}
      {layout.divider && take < 0.05 ? (
        <DividerLines panels={layout.panels} color={layout.divider.color} thickness={layout.divider.thickness} />
      ) : null}
    </AbsoluteFill>
  );
};

/** A hairline between stacked panels (only on horizontal seams). */
const DividerLines: React.FC<{ panels: Panel[]; color: string; thickness: number }> = ({ panels, color, thickness }) => {
  const { width, height } = useVideoConfig();
  const seams = new Set<number>();
  panels.forEach((p) => {
    const bottom = p.dest[1] + p.dest[3];
    if (bottom > 0.02 && bottom < 0.98) seams.add(Math.round(bottom * 1000) / 1000);
  });
  return (
    <>
      {[...seams].map((y) => (
        <div
          key={y}
          style={{
            position: 'absolute',
            left: 0,
            width,
            top: y * height - thickness / 2,
            height: thickness,
            background: color,
          }}
        />
      ))}
    </>
  );
};
