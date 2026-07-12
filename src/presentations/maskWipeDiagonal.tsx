import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { easeInOutQuint, clamp01 } from '../motion/easing';

export type MaskWipeDiagonalProps = {
  /** Leading-edge colour (resolved by the caller for contrast). */
  edgeColor?: string;
};

/** The wipe edge leans 14° off vertical — the crisp editorial diagonal. */
const ANGLE_DEG = 14;

/**
 * mask_wipe_diagonal (copilot.md §3.1): a 14°-tilted edge sweeps across the
 * frame revealing the incoming scene, with a thin solid hairline riding the
 * leading edge — the crisp default cut of the new language. Clip-path +
 * transform only: the outgoing scene holds still, the reveal carries all the
 * motion. The sweep completes by ~82% of the window (a 14f move in the 17f
 * overlap) so the frame is seated before the transition ends.
 */
const MaskWipeDiagonalPresentation: React.FC<
  TransitionPresentationComponentProps<MaskWipeDiagonalProps>
> = ({ children, presentationProgress, presentationDirection, passedProps }) => {
  const { width, height } = useVideoConfig();

  if (presentationDirection === 'exiting') {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const t = easeInOutQuint(clamp01(presentationProgress / 0.82));
  // Horizontal drift of the tilted edge across the frame's height, as % width.
  const skew = ((Math.tan((ANGLE_DEG * Math.PI) / 180) * height) / width) * 100;
  const top = t * (100 + skew);
  const bottom = top - skew;

  const edgeColor = passedProps.edgeColor ?? '#FFB020';
  const lineW = Math.max(3, Math.round(width * 0.0032));
  // The hairline stands at the edge's midline, rotated to match its lean; it
  // exists only while the edge is inside the frame, then dissolves with it.
  const mid = (top + bottom) / 2;
  const lineOpacity = t <= 0 || t >= 1 ? 0 : 1;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          clipPath: `polygon(-2% -2%, ${top}% -2%, ${bottom}% 102%, -2% 102%)`,
        }}
      >
        {children}
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          height: '120%',
          width: lineW,
          left: `calc(${mid}% - ${lineW / 2}px)`,
          background: edgeColor,
          transform: `rotate(${ANGLE_DEG}deg)`,
          opacity: lineOpacity,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

export const maskWipeDiagonal = (
  props: MaskWipeDiagonalProps = {}
): TransitionPresentation<MaskWipeDiagonalProps> => ({
  component: MaskWipeDiagonalPresentation,
  props,
});
