import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { easeInOutQuint, clamp01 } from '../motion/easing';

export type LineSweepProps = {
  /** Sweep-line colour (resolved by the caller for contrast). */
  edgeColor?: string;
};

/**
 * line_sweep (copilot.md §3.1): a thin accent hairline sweeps across the
 * frame in a fast 10-frame move, and everything behind the line simply IS
 * the next scene — the hardest, most minimal reveal in the language. The
 * signature act-break cut for `new_chapter` (until the M4 chapter_cover card
 * lands) and a natural fit for swiss/crisp styles.
 *
 * The sweep finishes at ~60% of the transition window (10f of the 17f
 * overlap) — the remaining frames are already fully the new scene, which is
 * exactly the point: a chapter break should feel abrupt.
 */
const LineSweepPresentation: React.FC<
  TransitionPresentationComponentProps<LineSweepProps>
> = ({ children, presentationProgress, presentationDirection, passedProps }) => {
  const { width } = useVideoConfig();

  if (presentationDirection === 'exiting') {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const t = easeInOutQuint(clamp01(presentationProgress / 0.6));
  const edge = 102 * t;
  const edgeColor = passedProps.edgeColor ?? '#FFB020';
  const lineW = Math.max(3, Math.round(width * 0.0032));

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 ${100 - edge}% 0 0)` }}>{children}</AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: lineW,
          left: `calc(${Math.min(100, edge)}% - ${lineW / 2}px)`,
          background: edgeColor,
          opacity: t > 0 && t < 1 ? 1 : 0,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

export const lineSweep = (props: LineSweepProps = {}): TransitionPresentation<LineSweepProps> => ({
  component: LineSweepPresentation,
  props,
});
