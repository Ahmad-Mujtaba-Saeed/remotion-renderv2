import React from 'react';
import { AbsoluteFill } from 'remotion';
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { easeOutQuint, clamp01 } from '../motion/easing';

export type ColumnRevealProps = Record<string, never>;

const COLUMNS = 5;
/** Per-column stagger / open time as fractions of the transition window
 *  (2f stagger, ~10f open inside the 17f overlap @30fps). */
const STAGGER = 2 / 17;
const OPEN = 10 / 17;

const ease = (t: number): number => easeOutQuint(clamp01(t));

/**
 * column_reveal (copilot.md §3.1): five vertical strips open top→bottom with
 * a 2-frame stagger — the analytical, Swiss-minimal cut. Implemented as ONE
 * skyline clip-path polygon over a single mount of the incoming scene (five
 * clipped copies would quintuple layout work per frame for the same pixels).
 * The outgoing scene holds still underneath.
 */
const ColumnRevealPresentation: React.FC<
  TransitionPresentationComponentProps<ColumnRevealProps>
> = ({ children, presentationProgress, presentationDirection }) => {
  if (presentationDirection === 'exiting') {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const opens: number[] = [];
  for (let k = 0; k < COLUMNS; k++) {
    opens.push(102 * ease((presentationProgress - k * STAGGER) / OPEN));
  }

  // Skyline polygon: down the left edge to the first strip's open depth, then
  // step across each strip boundary, back up the right edge.
  const pts: string[] = ['-1% -1%'];
  for (let k = 0; k < COLUMNS; k++) {
    const x0 = (k * 100) / COLUMNS;
    const x1 = ((k + 1) * 100) / COLUMNS;
    pts.push(`${x0}% ${opens[k]}%`, `${x1}% ${opens[k]}%`);
  }
  pts.push('101% -1%');

  return (
    <AbsoluteFill style={{ clipPath: `polygon(${pts.join(', ')})` }}>{children}</AbsoluteFill>
  );
};

export const columnReveal = (): TransitionPresentation<ColumnRevealProps> => ({
  component: ColumnRevealPresentation,
  props: {},
});
