import React, { createContext, useContext } from 'react';
import { SceneStyle } from '../types';

/**
 * Per-scene presentation metadata, provided by whichever host is rendering
 * the scene (SceneRegion in the canvas journey, SceneRouter in slides mode):
 * the scene's position in the video and its stylist-assigned personality.
 * Deep components (TextBlock, ExplanationBox) consume it to vary their look
 * per scene instead of repeating one layout forever.
 */
export interface SceneMeta {
  /** 0-based position of the scene in the video. */
  index: number;
  /** Total scene count. */
  count: number;
  style?: SceneStyle | null;
}

const SceneMetaContext = createContext<SceneMeta>({ index: 0, count: 1, style: null });

export const SceneMetaProvider: React.FC<{ value: SceneMeta; children: React.ReactNode }> = ({
  value,
  children,
}) => <SceneMetaContext.Provider value={value}>{children}</SceneMetaContext.Provider>;

export const useSceneMeta = (): SceneMeta => useContext(SceneMetaContext);
