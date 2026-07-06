import { Scene, TRANSITION_SECONDS } from './types';

export const sceneFrames = (scene: Scene, fps: number): number =>
  Math.max(1, Math.round((scene.duration_seconds || 6) * fps));

export const transitionFrames = (fps: number): number =>
  Math.max(1, Math.round(TRANSITION_SECONDS * fps));

/**
 * A transition overlaps the two scenes it sits between, so it consumes frames
 * from the total. The transition for the gap before scene[i] is taken from
 * scene[i].transition; the first scene has no incoming transition.
 */
export const hasIncomingTransition = (scenes: Scene[], index: number): boolean =>
  index > 0 && (scenes[index]?.transition ?? 'fade') !== 'none';

/**
 * Canvas-journey mode plays scenes back to back on one continuous camera
 * timeline — no transition overlap to subtract.
 */
export const totalCanvasFrames = (scenes: Scene[], fps: number): number => {
  if (!scenes.length) return fps;
  return Math.max(1, scenes.reduce((sum, scene) => sum + sceneFrames(scene, fps), 0));
};

export interface NarrationWindow {
  start: number;
  end: number;
}

/**
 * Frame ranges where narration is speaking, used to duck the music bed.
 * Scene pacing gives each narrated scene ~0.6s of tail after the voice ends,
 * so the window stops short of the scene boundary — the music swells back up
 * in the gaps between thoughts.
 */
export const narrationWindows = (
  scenes: Scene[],
  fps: number,
  mode: 'canvas' | 'slides'
): NarrationWindow[] => {
  const tf = transitionFrames(fps);
  const windows: NarrationWindow[] = [];
  let cursor = 0;
  scenes.forEach((scene, i) => {
    if (mode === 'slides' && hasIncomingTransition(scenes, i)) {
      cursor -= tf;
    }
    const frames = sceneFrames(scene, fps);
    if (scene.narration_audio_url) {
      const tail = Math.round(0.6 * fps);
      windows.push({ start: cursor, end: cursor + Math.max(Math.round(frames * 0.4), frames - tail) });
    }
    cursor += frames;
  });
  return windows;
};

export const totalDurationInFrames = (scenes: Scene[], fps: number): number => {
  if (!scenes.length) return fps; // 1s safety
  const tf = transitionFrames(fps);
  let total = 0;
  scenes.forEach((scene, i) => {
    total += sceneFrames(scene, fps);
    if (hasIncomingTransition(scenes, i)) {
      total -= tf;
    }
  });
  return Math.max(1, total);
};
