import React from 'react';
import { AbsoluteFill, useVideoConfig, spring, interpolate } from 'remotion';
import { Scene } from '../types';
import { MediaSlot } from '../components/MediaSlot';
import { PanelContent } from '../components/PanelContent';
import { glassStyle } from '../components/GlassCard';
import { useTheme } from '../theme';
import { useSceneClock } from '../canvas/SceneClock';

/**
 * full_bleed_with_banner: one full-frame image/video with a frosted-glass
 * heading/stat banner docked across the top or bottom.
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

      <AbsoluteFill
        style={{
          background:
            dock === 'top'
              ? 'linear-gradient(180deg, rgba(0,0,0,0.5), transparent 38%)'
              : 'linear-gradient(0deg, rgba(0,0,0,0.5), transparent 38%)',
        }}
      />

      <AbsoluteFill style={{ justifyContent: dock === 'top' ? 'flex-start' : 'flex-end', padding: '4%' }}>
        <div
          style={{
            ...glassStyle(theme, 22),
            width: '100%',
            padding: '3.4% 4%',
            opacity: enter,
            transform: `translateY(${offset}px)`,
          }}
        >
          <PanelContent slot={banner} glass={false} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
