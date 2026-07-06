import React from 'react';
import { AbsoluteFill, useVideoConfig, spring, interpolate } from 'remotion';
import { Scene } from '../types';
import { MediaSlot } from '../components/MediaSlot';
import { PanelContent } from '../components/PanelContent';
import { useIsPortrait } from '../responsive';
import { useSceneClock } from '../canvas/SceneClock';

/**
 * full_bleed_with_side_panel: one full-frame image/video with a floating glass
 * explanation panel docked left or right. This is the "explanation box over the
 * side of an image, wherever the AI wants" layout — constrained to two tested
 * positions and a clamped width so it can never run off-screen or overlap badly.
 *
 * In a 9:16 portrait frame a side dock would leave a sliver-thin column, so
 * the panel re-docks to the bottom at near-full width instead.
 */
export const FullBleedWithSidePanel: React.FC<{ scene: Scene }> = ({ scene }) => {
  const { frame } = useSceneClock();
  const { fps } = useVideoConfig();
  const portrait = useIsPortrait();
  const bg = scene.slots['slot_background'];
  const panel = scene.slots['slot_panel'];
  const dock = panel?.dock === 'left' ? 'left' : 'right';
  // The image is the scene — the panel is a caption on it, never a co-star.
  // Hard cap well under half the frame so no upload ever disappears behind
  // its own explanation.
  const widthPct = Math.max(24, Math.min(38, panel?.width_pct ?? 33));

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });
  const offset = interpolate(enter, [0, 1], [portrait ? 60 : dock === 'left' ? -60 : 60, 0]);

  return (
    <AbsoluteFill>
      <AbsoluteFill>
        <MediaSlot slot={bg} />
      </AbsoluteFill>

      {/* Legibility scrim, kept tight to the docked side so the image stays
          visible across most of the frame. */}
      <AbsoluteFill
        style={{
          background: portrait
            ? 'linear-gradient(0deg, rgba(0,0,0,0.55), transparent 38%)'
            : dock === 'left'
              ? 'linear-gradient(90deg, rgba(0,0,0,0.5), transparent 44%)'
              : 'linear-gradient(270deg, rgba(0,0,0,0.5), transparent 44%)',
        }}
      />

      <AbsoluteFill
        style={{
          flexDirection: 'row',
          alignItems: portrait ? 'flex-end' : 'center',
          justifyContent: portrait ? 'center' : dock === 'left' ? 'flex-start' : 'flex-end',
          padding: '5%',
        }}
      >
        <div
          style={{
            width: portrait ? '86%' : `${widthPct}%`,
            opacity: enter,
            transform: portrait ? `translateY(${offset}px)` : `translateX(${offset}px)`,
          }}
        >
          <PanelContent slot={panel} glass />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
