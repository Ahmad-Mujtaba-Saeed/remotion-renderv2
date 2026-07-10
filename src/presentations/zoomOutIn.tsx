import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';

type ZoomOutInProps = Record<string, never>;

/**
 * Custom "zoom out-in" transition — the exhale to zoomThrough's punch-in: the
 * outgoing scene recedes slightly and fades while the incoming grows from the
 * same recessed scale up to full. Reads as stepping BACK before turning to a
 * new topic, where zoom_through reads as diving INTO a detail.
 */
const ZoomOutInPresentation: React.FC<
  TransitionPresentationComponentProps<ZoomOutInProps>
> = ({ children, presentationProgress, presentationDirection }) => {
  const entering = presentationDirection === 'entering';

  const scale = entering
    ? interpolate(presentationProgress, [0, 1], [0.86, 1])
    : interpolate(presentationProgress, [0, 1], [1, 0.86]);

  const opacity = entering ? presentationProgress : 1 - presentationProgress;

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, willChange: 'transform' }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const zoomOutIn = (): TransitionPresentation<ZoomOutInProps> => ({
  component: ZoomOutInPresentation,
  props: {},
});
