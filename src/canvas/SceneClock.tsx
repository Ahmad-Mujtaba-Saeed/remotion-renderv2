import React, { createContext, useContext } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * In slides mode every scene lives in its own <Sequence>, so components can
 * time their reveals with useCurrentFrame()/useVideoConfig() directly. In
 * canvas-journey mode ALL station cards are mounted for the whole video (you
 * can see them in wide shots), so a station provides this context to re-base
 * its content's clock onto the window where the camera is actually focused
 * on it — bullets, kinetic headings etc. animate on arrival, not at frame 0.
 */
export interface SceneClockWindow {
  /** Global frame the station's content should start animating at. */
  start: number;
  /** Global frame the station loses focus (end of its scene). */
  end: number;
}

const SceneClockContext = createContext<SceneClockWindow | null>(null);

export const SceneClockProvider: React.FC<{ window: SceneClockWindow; children: React.ReactNode }> = ({
  window,
  children,
}) => <SceneClockContext.Provider value={window}>{children}</SceneClockContext.Provider>;

/**
 * Drop-in clock for reveal animations: local frame + window length. Outside a
 * provider it falls back to the current Sequence's clock (slides mode).
 */
export const useSceneClock = (): { frame: number; durationInFrames: number } => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const window = useContext(SceneClockContext);

  if (!window) {
    return { frame, durationInFrames };
  }

  return {
    frame: frame - window.start,
    durationInFrames: Math.max(1, window.end - window.start),
  };
};
