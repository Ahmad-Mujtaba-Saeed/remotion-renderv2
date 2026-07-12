import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { easeOutQuint, clamp01 } from '../motion/easing';

export type StackPushProps = {
  /** Leading-edge colour (resolved by the caller for contrast). */
  edgeColor?: string;
  /** Solid ink used for the outgoing scene's dim wash. */
  inkColor?: string;
};

/**
 * stack_push (copilot.md §3.1) — the signature cut for `continues`: the
 * incoming scene slides in over the top (right→left) carrying a solid accent
 * edge line, while the outgoing scene recedes — scale to 0.96 under a flat
 * ink dim (≤12%, a solid overlay, not a gradient). Depth without shadows:
 * scale + dim is the whole trick.
 */
const StackPushPresentation: React.FC<
  TransitionPresentationComponentProps<StackPushProps>
> = ({ children, presentationProgress, presentationDirection, passedProps }) => {
  const { width } = useVideoConfig();
  const t = easeOutQuint(clamp01(presentationProgress));

  if (presentationDirection === 'exiting') {
    return (
      <AbsoluteFill style={{ transform: `scale(${1 - 0.04 * t})` }}>
        {children}
        <AbsoluteFill
          style={{ background: passedProps.inkColor ?? '#000000', opacity: 0.12 * t }}
        />
      </AbsoluteFill>
    );
  }

  const x = 100 * (1 - t);
  const edgeColor = passedProps.edgeColor ?? '#FFB020';
  const lineW = Math.max(3, Math.round(width * 0.0032));

  return (
    <AbsoluteFill style={{ transform: `translateX(${x}%)` }}>
      {children}
      {/* The accent edge rides the incoming scene's leading (left) edge and
          dissolves once the push has landed. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: lineW,
          background: edgeColor,
          opacity: t < 0.97 ? 1 : 0,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

export const stackPush = (props: StackPushProps = {}): TransitionPresentation<StackPushProps> => ({
  component: StackPushPresentation,
  props,
});
