import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';

type ZoomThroughProps = Record<string, never>;

/**
 * Custom "zoom through" transition: the outgoing scene pushes toward the viewer
 * and fades, while the incoming scene rushes in from slightly oversized and
 * settles — a punchy reveal that built-in presentations don't cover.
 */
const ZoomThroughPresentation: React.FC<
  TransitionPresentationComponentProps<ZoomThroughProps>
> = ({ children, presentationProgress, presentationDirection }) => {
  const entering = presentationDirection === 'entering';

  const scale = entering
    ? interpolate(presentationProgress, [0, 1], [1.35, 1])
    : interpolate(presentationProgress, [0, 1], [1, 1.6]);

  const opacity = entering ? presentationProgress : 1 - presentationProgress;

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, willChange: 'transform' }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const zoomThrough = (): TransitionPresentation<ZoomThroughProps> => ({
  component: ZoomThroughPresentation,
  props: {},
});
