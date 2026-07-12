import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { easeInOutQuint, clamp01 } from '../motion/easing';

export type SplitSlideProps = {
  /** Seam edge colour (resolved by the caller for contrast). */
  edgeColor?: string;
};

/** How far each outgoing half travels (as % of frame width). */
const TRAVEL = 55;

/**
 * split_slide (copilot.md §3.1) — the signature cut for `contrast`: the
 * outgoing scene splits at a centre seam and its halves slide apart in
 * opposite directions, revealing the incoming scene which settles up from
 * 0.97 scale underneath. The frame literally takes two sides — motion as
 * meaning.
 *
 * Layering note: @remotion/transitions mounts the ENTERING scene on top, so
 * "underneath" is achieved by clipping the entering scene to exactly the gap
 * the departing halves have opened (the two renders never overlap a pixel).
 * The exiting wrapper renders its scene twice, one half-clip each — clip-path
 * + transform only.
 */
const SplitSlidePresentation: React.FC<
  TransitionPresentationComponentProps<SplitSlideProps>
> = ({ children, presentationProgress, presentationDirection, passedProps }) => {
  const { width } = useVideoConfig();
  const t = easeInOutQuint(clamp01(presentationProgress));
  const shift = TRAVEL * t;

  if (presentationDirection === 'exiting') {
    return (
      <AbsoluteFill>
        <AbsoluteFill
          style={{
            clipPath: 'inset(0 50% 0 0)',
            transform: `translateX(${-shift}%)`,
          }}
        >
          {children}
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            clipPath: 'inset(0 0 0 50%)',
            transform: `translateX(${shift}%)`,
          }}
        >
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // The revealed gap: [50 - shift, 50 + shift], clamped to the frame.
  const inset = Math.max(0, 50 - shift);
  const scale = 0.97 + 0.03 * t;
  const edgeColor = passedProps.edgeColor ?? '#FFB020';
  const lineW = Math.max(2, Math.round(width * 0.0022));
  const seamsVisible = t > 0.01 && t < 0.92;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 ${inset}% 0 ${inset}%)` }}>
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>{children}</AbsoluteFill>
      </AbsoluteFill>
      {/* Hairline seams on the departing edges, dissolving as the cut lands. */}
      {seamsVisible ? (
        <>
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: lineW,
              left: `calc(${inset}% - ${lineW / 2}px)`,
              background: edgeColor,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: lineW,
              right: `calc(${inset}% - ${lineW / 2}px)`,
              background: edgeColor,
              pointerEvents: 'none',
            }}
          />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

export const splitSlide = (props: SplitSlideProps = {}): TransitionPresentation<SplitSlideProps> => ({
  component: SplitSlidePresentation,
  props,
});
