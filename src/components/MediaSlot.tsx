import React from 'react';
import { Img, Loop, Video, useVideoConfig } from 'remotion';
import { Slot } from '../types';
import { CameraMove } from './CameraMove';
import { useTheme } from '../theme';
import { useScaleUnit } from '../responsive';
import { useRegionStyle } from '../canvas/RegionStyle';

/**
 * Renders an image (or video) slot with its camera move. If no asset has been
 * uploaded yet, a labelled placeholder is shown so previews still render — the
 * PHP render path refuses to start until all image slots are filled, so this
 * placeholder is only ever seen in the storyboard preview.
 */
export const MediaSlot: React.FC<{ slot: Slot }> = ({ slot }) => {
  const theme = useTheme();
  const u = useScaleUnit();
  const region = useRegionStyle();
  const { fps } = useVideoConfig();
  const url = slot.asset_ref?.url;
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

  // Frameless canvas regions: media masks itself with big soft corners and a
  // deep shadow for depth (no borders, no card chrome).
  const framelessWrap: React.CSSProperties = region.frameless
    ? {
        borderRadius: region.mediaRadius,
        overflow: 'hidden',
        boxShadow: '0 40px 110px rgba(0,0,0,0.55)',
      }
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
          background: 'linear-gradient(135deg, #1f2937, #111827)',
          color: '#9ca3af',
          fontSize: 28 * u,
          fontFamily: 'sans-serif',
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

  // Html5 <Video>, NOT <OffthreadVideo>: the Rust compositor races its own
  // asset download on Windows and dies with "No frame found at position N"
  // on the first frames of remote mp4s (reproduced repeatedly, even with
  // +faststart files). The browser video tag streams the same files fine
  // now that assets are served by this host process (see server.ts).
  const video = <Video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />;

  // Canvas-journey mode mounts every scene's media for the WHOLE composition,
  // so a clip shorter than the video must loop — seeking a <video> past its
  // end never completes and times out the render.
  const clipFrames = slot.asset_ref?.duration_seconds
    ? Math.max(1, Math.floor(slot.asset_ref.duration_seconds * fps))
    : null;

  const media = isVideo ? (
    clipFrames ? <Loop durationInFrames={clipFrames}>{video}</Loop> : video
  ) : (
    <Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', ...framelessWrap }}>
      <CameraMove move={slot.camera_move}>{media}</CameraMove>
      {slot.label ? (
        <div
          style={{
            position: 'absolute',
            left: 32 * u,
            bottom: 32 * u,
            padding: `${10 * u}px ${24 * u}px`,
            background: theme.panel,
            backdropFilter: 'blur(6px)',
            color: theme.text,
            borderRadius: 12 * u,
            borderLeft: `${5 * u}px solid ${theme.accent}`,
            fontSize: 34 * u,
            fontWeight: 700,
            fontFamily: 'Inter, system-ui, sans-serif',
            letterSpacing: 0.5,
          }}
        >
          {slot.label}
        </div>
      ) : null}
    </div>
  );
};
