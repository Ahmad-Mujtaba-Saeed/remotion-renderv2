import React from 'react';
import { AbsoluteFill, useVideoConfig, spring, interpolate } from 'remotion';
import { Scene } from '../types';
import { MediaSlot } from '../components/MediaSlot';
import { PanelContent } from '../components/PanelContent';
import { surfaceStyle } from '../components/Surface';
import { useTheme } from '../theme';
import { useSceneClock } from '../canvas/SceneClock';

/**
 * full_bleed_with_banner: one full-frame image/video with a flat heading/stat
 * banner docked across the top or bottom, edged with an accent rule on the side
 * that faces the image.
 */
export const FullBleedWithBanner: React.FC<{ scene: Scene }> = ({ scene }) => {
  const theme = useTheme();
  const { frame } = useSceneClock();
  const { fps } = useVideoConfig();
  const bg = scene.slots['slot_background'];
  const banner = scene.slots['slot_banner'];
  const dock = banner?.dock === 'top' ? 'top' : 'bottom';

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });
  const offset = interpolate(enter, [0, 1], [dock === 'top' ? -50 : 50, 0]);

  return (
    <AbsoluteFill>
      <AbsoluteFill>
        <MediaSlot slot={bg} />
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: dock === 'top' ? 'flex-start' : 'flex-end' }}>
        <div
          style={{
            ...surfaceStyle(theme),
            border: 'none',
            // The accent rule is the only edge the banner needs; it reads as a
            // deliberate mark rather than a card outline.
            [dock === 'top' ? 'borderBottom' : 'borderTop']: `4px solid ${theme.accent}`,
            width: '100%',
            boxSizing: 'border-box',
            // A banner is a strip, not a wall: compact content (inline bullets)
            // plus a hard height cap keep the image the star even when the AI
            // writes five long bullets.
            maxHeight: '32%',
            overflow: 'hidden',
            padding: '2.6% 4%',
            opacity: enter,
            transform: `translateY(${offset}px)`,
          }}
        >
          <PanelContent slot={banner} glass={false} compact />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
