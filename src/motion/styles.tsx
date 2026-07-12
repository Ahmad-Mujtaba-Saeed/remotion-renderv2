import React, { createContext, useContext } from 'react';
import {
  easeInOutQuint,
  easeInOutSine,
  easeOutBack,
  easeOutExpo,
  easeOutQuint,
} from './easing';

/**
 * Motion style presets (copilot.md §2.5) — "the same script cut by five
 * different editors". ONE style per video, chosen by the planner from the
 * mood (or by the user), shipped on shot_list.motion_style and provided here
 * as context. Every entrance/stagger/exit in the typography system reads its
 * numbers from the active style, so switching the style re-times the whole
 * video without touching a component.
 *
 * Mirrors registry `motion_styles` (v12) — that block is the contract; this
 * table is its executable twin (the ease names resolve to real curves here).
 */

export type MotionStyleName = 'crisp' | 'classic' | 'bounce' | 'elegant' | 'swiss';

export type EntranceName = 'rise_mask' | 'fade_settle' | 'pop_rise' | 'tracking_in' | 'column_snap';

export interface MotionStyle {
  name: MotionStyleName;
  /** Base entrance duration, frames @30fps. */
  baseF: number;
  /** Sibling stagger, frames @30fps. */
  staggerF: number;
  ease: (t: number) => number;
  /** Landing overshoot (0 = none); drives the back-ease strength. */
  overshoot: number;
  entrance: EntranceName;
  /** Exits run at this fraction of the entrance duration (Law 5). */
  exitRatio: number;
  /** Accent word mark: the sweep block or the drawn underline (§4.2). */
  highlight: 'sweep' | 'underline';
}

/** ~overshoot → easeOutBack strength (1.70158 ≈ 10%). */
const backFor = (overshoot: number): ((t: number) => number) => easeOutBack(overshoot * 17);

export const MOTION_STYLES: Record<MotionStyleName, MotionStyle> = {
  crisp: {
    name: 'crisp', baseF: 13, staggerF: 3, ease: easeOutExpo,
    overshoot: 0.02, entrance: 'rise_mask', exitRatio: 0.6, highlight: 'sweep',
  },
  classic: {
    name: 'classic', baseF: 20, staggerF: 5, ease: easeInOutSine,
    overshoot: 0, entrance: 'fade_settle', exitRatio: 0.7, highlight: 'underline',
  },
  bounce: {
    name: 'bounce', baseF: 10, staggerF: 2, ease: backFor(0.06),
    overshoot: 0.06, entrance: 'pop_rise', exitRatio: 0.5, highlight: 'sweep',
  },
  elegant: {
    name: 'elegant', baseF: 24, staggerF: 6, ease: easeInOutQuint,
    overshoot: 0, entrance: 'tracking_in', exitRatio: 0.7, highlight: 'underline',
  },
  swiss: {
    name: 'swiss', baseF: 8, staggerF: 2, ease: easeOutQuint,
    overshoot: 0, entrance: 'column_snap', exitRatio: 0.5, highlight: 'underline',
  },
};

/** Laravel resolves 'auto' before shipping; unknown/missing = crisp. */
export const normalizeMotionStyle = (name?: string | null): MotionStyle =>
  MOTION_STYLES[(name ?? '') as MotionStyleName] ?? MOTION_STYLES.crisp;

const MotionStyleContext = createContext<MotionStyle>(MOTION_STYLES.crisp);

export const MotionStyleProvider: React.FC<{ style?: string | null; children: React.ReactNode }> = ({
  style,
  children,
}) => (
  <MotionStyleContext.Provider value={normalizeMotionStyle(style)}>
    {children}
  </MotionStyleContext.Provider>
);

export const useMotionStyle = (): MotionStyle => useContext(MotionStyleContext);
