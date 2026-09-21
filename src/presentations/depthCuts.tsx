import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { BASE_PERSPECTIVE } from '../flute/cinematicRig';
import { useDepth, depthGain } from '../motion/depthStage';

type Props = Record<string, never>;

/**
 * depthCuts — the cut itself, through the lens.
 *
 * Every scene now arrives and holds on a perspective camera
 * ({@see motion/depthStage}); a cut that cross-fades two flat pictures is the
 * one place the video still admits it is a slideshow. These two presentations
 * put the cut on the same rig: the outgoing scene falls AWAY from the lens and
 * softens, the incoming one comes FORWARD out of the same depth it would have
 * arrived from anyway.
 *
 * Both read the depth setting, and at `off` they are exactly the fade and the
 * zoom-through they replace — the switch turns the whole rig off, including
 * the cuts.
 */

const Stage: React.FC<{
  progress: number;
  entering: boolean;
  /** How far the scenes travel, in rig units at the far end of the cut. */
  reach: number;
  /** Peak blur on the half of the cut that is leaving. */
  soft: number;
  children: React.ReactNode;
}> = ({ progress, entering, reach, soft, children }) => {
  // Entering: from -reach to 0. Leaving: from 0 to +reach (toward the lens),
  // which reads as the old picture being pulled off the front of the frame.
  const z = entering ? interpolate(progress, [0, 1], [-reach, 0]) : interpolate(progress, [0, 1], [0, reach * 0.85]);
  const blur = entering
    ? interpolate(progress, [0, 0.75], [soft, 0], { extrapolateRight: 'clamp' })
    : interpolate(progress, [0.25, 1], [0, soft], { extrapolateLeft: 'clamp' });
  const opacity = entering ? Math.min(1, progress * 1.35) : Math.max(0, 1 - progress * 1.35);

  return (
    <AbsoluteFill style={{ perspective: `${BASE_PERSPECTIVE}px`, perspectiveOrigin: '50% 50%' }}>
      <AbsoluteFill
        style={{
          opacity,
          transform: `translate3d(0px, 0px, ${z.toFixed(1)}px)`,
          filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** A cross-fade that happens in depth rather than on one flat plane. */
const DepthFadePresentation: React.FC<TransitionPresentationComponentProps<Props>> = ({
  children,
  presentationProgress,
  presentationDirection,
}) => {
  const gain = depthGain(useDepth().intensity);
  const entering = presentationDirection === 'entering';

  if (gain === 0) {
    const opacity = entering ? presentationProgress : 1 - presentationProgress;
    return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
  }

  return (
    <Stage progress={presentationProgress} entering={entering} reach={230 * gain} soft={5 * gain}>
      {children}
    </Stage>
  );
};

/** The punch-in cut: the same move, several times further. */
const DollyThroughPresentation: React.FC<TransitionPresentationComponentProps<Props>> = ({
  children,
  presentationProgress,
  presentationDirection,
}) => {
  const gain = depthGain(useDepth().intensity);
  const entering = presentationDirection === 'entering';

  if (gain === 0) {
    const scale = entering
      ? interpolate(presentationProgress, [0, 1], [1.35, 1])
      : interpolate(presentationProgress, [0, 1], [1, 1.6]);
    const opacity = entering ? presentationProgress : 1 - presentationProgress;
    return (
      <AbsoluteFill style={{ opacity }}>
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    );
  }

  return (
    <Stage progress={presentationProgress} entering={entering} reach={620 * gain} soft={9 * gain}>
      {children}
    </Stage>
  );
};

export const depthFade = (): TransitionPresentation<Props> => ({
  component: DepthFadePresentation,
  props: {},
});

export const dollyThrough = (): TransitionPresentation<Props> => ({
  component: DollyThroughPresentation,
  props: {},
});
