import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { Ghost, useMotionBlurOn } from '../motion/ghost';
import { shutterAlphas } from '../canvas/motionBlur';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';

export type WhipPanProps = {
  /**
   * The transition's own length in frames. It has to be passed in: inside a
   * presentation `useVideoConfig().durationInFrames` reports the SCENE's
   * sequence, not the transition's, so deriving the shutter from it would
   * silently make the ghosts a twentieth of a frame apart — a blur that costs
   * three extra renders and shows nothing.
   */
  frames?: number;
};

/** Aggressive symmetric ease — the camera "throws" itself sideways. */
const whipEase = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Custom "whip pan" transition: both scenes fly the same direction at speed —
 * the outgoing exits left as the incoming chases in from the right, with a
 * slight scale dip at the midpoint so the frame appears to lunge. Opacity
 * only crossfades through the middle 15% (the fastest part of the move) so
 * neither scene ever reads as a lingering ghost. Transform + opacity only.
 *
 * MOTION BLUR (§2.10): a whip crosses 110% of the frame in the length of a
 * transition — around 175px per frame at 1080p/30 — which is well past where
 * hard edges stop reading as speed and start reading as steps. The scene is
 * therefore drawn a few times across one shutter, exactly like the canvas
 * camera and with the same falloff. The duplicates are wrapped in `<Ghost>`
 * so the scene inside them draws without playing its narration again.
 *
 * The old comment here said "no motion blur, per the flat-design rule". That
 * read the rule too broadly: §1.1 bans the CSS blur FILTER, and stacked
 * transform+opacity samples are the technique §2.10 asks for precisely
 * because they do not touch it.
 */
const WhipPanPresentation: React.FC<
  TransitionPresentationComponentProps<WhipPanProps>
> = ({ children, presentationProgress, presentationDirection, passedProps }) => {
  const entering = presentationDirection === 'entering';
  const blurOn = useMotionBlurOn();
  const frames = Math.max(1, passedProps?.frames ?? 12);

  const poseAt = (progress: number): string => {
    const t = whipEase(Math.max(0, Math.min(1, progress)));
    const x = entering ? interpolate(t, [0, 1], [110, 0]) : interpolate(t, [0, 1], [0, -110]);
    // Both scenes share the mid-flight scale dip so the lunge reads as one move.
    const dip = 1 - 0.04 * Math.sin(Math.PI * t);
    return `translateX(${x}%) scale(${dip})`;
  };

  // The shutter, in progress units: 0.72 of a frame out of the transition's
  // own length. A very long whip needs less of it, which falls out for free.
  const shutter = 0.72 / frames;
  const ghosts = blurOn ? 3 : 0;
  const alphas = shutterAlphas(Math.max(1, ghosts), ghosts ? 0.5 : 0);
  // Back to front: the oldest sample is painted first, the live scene last.
  const samples = (ghosts ? alphas : [1])
    .map((alpha, step) => ({
      alpha,
      step,
      transform: poseAt(presentationProgress - (shutter * step) / Math.max(1, ghosts)),
    }))
    .reverse();

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
      {samples.map((s) => (
        <AbsoluteFill
          key={s.step}
          style={{
            opacity: s.alpha < 1 ? s.alpha : undefined,
            transform: s.transform,
            // Only the live copy is worth promoting to its own layer; four
            // promoted layers costs more than the blur saves.
            willChange: s.step === 0 ? 'transform' : undefined,
          }}
        >
          {s.step === 0 ? children : <Ghost>{children}</Ghost>}
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};

export const whipPan = (props: WhipPanProps = {}): TransitionPresentation<WhipPanProps> => ({
  component: WhipPanPresentation,
  props,
});
