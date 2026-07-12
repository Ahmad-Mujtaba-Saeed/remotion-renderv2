import React from 'react';
import { AbsoluteFill } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { easeInOutSine, clamp01 } from '../motion/easing';

export type MatchDissolveProps = Record<string, never>;

/**
 * match_dissolve (copilot.md §3.1) — the signature cut for `callback` (and
 * the classic-documentary style): a slow crossfade on a SHARED scale path —
 * the incoming scene settles 1.06→1.00 while the outgoing recedes 1.00→0.95,
 * so the two read as one continuous camera breath instead of a mix. The
 * gentlest cut in the language; it uses the whole transition window.
 */
const MatchDissolvePresentation: React.FC<
  TransitionPresentationComponentProps<MatchDissolveProps>
> = ({ children, presentationProgress, presentationDirection }) => {
  const t = easeInOutSine(clamp01(presentationProgress));
  const entering = presentationDirection === 'entering';

  const scale = entering ? 1.06 - 0.06 * t : 1 - 0.05 * t;
  const opacity = entering ? t : 1;

  return (
    <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>{children}</AbsoluteFill>
  );
};

export const matchDissolve = (): TransitionPresentation<MatchDissolveProps> => ({
  component: MatchDissolvePresentation,
  props: {},
});
