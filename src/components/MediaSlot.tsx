import React from 'react';
import { Img, Video } from 'remotion';
import { Slot } from '../types';
import { CameraMove } from './CameraMove';
import { useTheme } from '../theme';
import { useScaleUnit } from '../responsive';

/**
 * Renders an image (or video) slot with its camera move. If no asset has been
 * uploaded yet, a labelled placeholder is shown so previews still render — the
 * PHP render path refuses to start until all image slots are filled, so this
 * placeholder is only ever seen in the storyboard preview.
 */
export const MediaSlot: React.FC<{ slot: Slot }> = ({ slot }) => {
  const theme = useTheme();
  const u = useScaleUnit();
  const url = slot.asset_ref?.url;
  const isVideo = slot.asset_ref?.type === 'video' || slot.content_type === 'video';

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
        }}
      >
        {slot.asset_request?.description || 'Image'}
      </div>
    );
  }

  const media = isVideo ? (
    <Video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
  ) : (
    <Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
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
