import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';

type WhipPanProps = Record<string, never>;

/** Aggressive symmetric ease — the camera "throws" itself sideways. */
const whipEase = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Custom "whip pan" transition: both scenes fly the same direction at speed —
 * the outgoing exits left as the incoming chases in from the right, with a
 * slight scale dip at the midpoint so the frame appears to lunge. Opacity
 * only crossfades through the middle 15% (the fastest part of the move) so
 * neither scene ever reads as a lingering ghost. Transform + opacity only —
 * no motion blur, per the flat-design rule.
 */
const WhipPanPresentation: React.FC<
  TransitionPresentationComponentProps<WhipPanProps>
> = ({ children, presentationProgress, presentationDirection }) => {
  const entering = presentationDirection === 'entering';
  const t = whipEase(presentationProgress);

  const x = entering
    ? interpolate(t, [0, 1], [110, 0])
    : interpolate(t, [0, 1], [0, -110]);

  // Both scenes share the mid-flight scale dip so the lunge reads as one move.
  const dip = 1 - 0.04 * Math.sin(Math.PI * t);

  const opacity = entering
    ? interpolate(presentationProgress, [0.425, 0.575], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0.425, 0.575], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ transform: `translateX(${x}%) scale(${dip})`, willChange: 'transform' }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const whipPan = (): TransitionPresentation<WhipPanProps> => ({
  component: WhipPanPresentation,
  props: {},
});
