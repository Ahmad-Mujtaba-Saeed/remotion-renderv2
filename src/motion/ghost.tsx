import React, { createContext, useContext } from 'react';

/**
 * GHOST CONTEXT — the safety rail under every stacked-sample motion blur
 * (§2.10).
 *
 * A shutter sample is the SAME subtree drawn again at a different camera or
 * transition offset. That is fine for pixels and catastrophic for anything a
 * subtree does besides draw: an `<Audio>` inside a scene would play three
 * times at once, an `<SfxCue>` would fire three whooshes, and the mix would
 * quietly go to pieces on exactly the frames the blur is trying to improve.
 *
 * So every ghost copy is wrapped in `<Ghost>`, and anything with a side effect
 * asks `useIsGhost()` first and renders nothing when the answer is yes. The
 * default is `false`, so a component that forgets to ask behaves exactly as it
 * did before this existed — the rail only matters inside a blur stack.
 */
const GhostContext = createContext<boolean>(false);

/** Wraps ONE shutter sample. Everything inside is a duplicate of the frame. */
export const Ghost: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <GhostContext.Provider value={true}>{children}</GhostContext.Provider>
);

/** True inside a motion-blur duplicate: draw, but never make a sound. */
export const useIsGhost = (): boolean => useContext(GhostContext);

/**
 * Whether motion blur is on at all, delivered the same way Skin and
 * MotionStyle are: mounted once in `ExplainerVideo` off the shot list. The
 * canvas takes the flag as a prop because its mounter knows it, but a
 * TRANSITION presentation is constructed deep inside `@remotion/transitions`
 * and can only be reached through context.
 */
const BlurEnabledContext = createContext<boolean>(true);

export const MotionBlurProvider: React.FC<{ enabled: boolean; children: React.ReactNode }> = ({
  enabled,
  children,
}) => <BlurEnabledContext.Provider value={enabled}>{children}</BlurEnabledContext.Provider>;

export const useMotionBlurOn = (): boolean => useContext(BlurEnabledContext);
