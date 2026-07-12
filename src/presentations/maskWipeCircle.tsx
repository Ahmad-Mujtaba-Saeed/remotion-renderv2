import React from 'react';
import { AbsoluteFill } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { easeInOutQuint, clamp01 } from '../motion/easing';

export type MaskWipeCircleProps = {
  /** Reveal origin, 0..1 of the frame (media focal point when known). */
  fx?: number;
  fy?: number;
};

/**
 * mask_wipe_circle (copilot.md §3.1): the incoming scene is revealed inside a
 * growing `clip-path: circle()` from a focal point — the signature cut for
 * `elaborates` (a detail opening out of the previous idea). The outgoing
 * scene never moves; the reveal IS the motion. Clip-path only — no filters,
 * no gradients — so it is flat-law and camera-law safe.
 *
 * The circle completes early (by ~85% of the window) so the incoming scene
 * is fully seated before the cut ends — Law 2, decisive arrivals.
 */
const MaskWipeCirclePresentation: React.FC<
  TransitionPresentationComponentProps<MaskWipeCircleProps>
> = ({ children, presentationProgress, presentationDirection, passedProps }) => {
  const fx = (passedProps.fx ?? 0.5) * 100;
  const fy = (passedProps.fy ?? 0.5) * 100;
  const t = easeInOutQuint(clamp01(presentationProgress / 0.85));

  if (presentationDirection === 'exiting') {
    // The outgoing scene holds still underneath the reveal.
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  // 150% radius guarantees full coverage from any origin point.
  return (
    <AbsoluteFill style={{ clipPath: `circle(${t * 150}% at ${fx}% ${fy}%)` }}>
      {children}
    </AbsoluteFill>
  );
};

export const maskWipeCircle = (
  props: MaskWipeCircleProps = {}
): TransitionPresentation<MaskWipeCircleProps> => ({
  component: MaskWipeCirclePresentation,
  props,
});
