import React, { createContext, useContext } from 'react';
import { NarrationWord, SceneStyle } from '../types';

/**
 * Per-scene presentation metadata, provided by whichever host is rendering
 * the scene (SceneRegion in the canvas journey, SceneRouter in slides mode):
 * the scene's position in the video and its stylist-assigned personality.
 * Deep components (TextBlock, ExplanationBox) consume it to vary their look
 * per scene instead of repeating one layout forever.
 *
 * `words` carries the scene's narration timings down with it (iter 61). A card
 * that gets the scene object can already read them; a SHARED component like
 * TextBlock only ever sees a slot, which is why the workhorse text card paced
 * its bullets on a metronome while `math_steps` — which does get the scene —
 * paced its working on the voice. One field closes that gap for every shared
 * component at once.
 */
export interface SceneMeta {
  /** 0-based position of the scene in the video. */
  index: number;
  /** Total scene count. */
  count: number;
  style?: SceneStyle | null;
  /** The scene's narration word timings, when TTS produced them. */
  words?: NarrationWord[] | null;
}

const SceneMetaContext = createContext<SceneMeta>({ index: 0, count: 1, style: null, words: null });

export const SceneMetaProvider: React.FC<{ value: SceneMeta; children: React.ReactNode }> = ({
  value,
  children,
}) => <SceneMetaContext.Provider value={value}>{children}</SceneMetaContext.Provider>;

export const useSceneMeta = (): SceneMeta => useContext(SceneMetaContext);
