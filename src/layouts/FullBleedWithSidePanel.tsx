import React from 'react';
import { AbsoluteFill, useVideoConfig, spring, interpolate } from 'remotion';
import { Scene } from '../types';
import { MediaSlot } from '../components/MediaSlot';
import { PanelContent } from '../components/PanelContent';
import { useIsPortrait } from '../responsive';
import { useSceneClock } from '../canvas/SceneClock';

/**
 * full_bleed_with_side_panel: one full-frame image/video with a flat explanation
 * panel docked left or right. This is the "explanation box over the side of an
 * image, wherever the AI wants" layout — constrained to two tested positions and
 * a clamped width so it can never run off-screen or overlap badly.
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
  // 36 by default: at 33 the text column was ~420px, too narrow for a heading
  // and three reasons without every line wrapping.
  const widthPct = Math.max(28, Math.min(40, panel?.width_pct ?? 36));
  // The panel's width is a share of the PADDED row (90% of the frame); the
  // surface pads 7% a side and the text block another 7% — hand the solver
  // the real line length.
  const boxFrac = ((portrait ? 86 : widthPct) / 100) * 0.9 * 0.86 * 0.86;
  const boxHeightFrac = portrait ? 0.5 : 0.9 * 0.86;

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });
  const offset = interpolate(enter, [0, 1], [portrait ? 60 : dock === 'left' ? -60 : 60, 0]);

  return (
    <AbsoluteFill>
      <AbsoluteFill>
        <MediaSlot slot={bg} />
      </AbsoluteFill>

      {/* No legibility scrim: the panel is opaque, so the image keeps its
          colour right up to the panel's edge. */}
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
            maxHeight: '100%',
            opacity: enter,
            transform: portrait ? `translateY(${offset}px)` : `translateX(${offset}px)`,
          }}
        >
          <PanelContent slot={panel} glass columnFrac={boxFrac} heightFrac={boxHeightFrac} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
