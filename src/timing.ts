import { Scene, ShotList, TRANSITION_SECONDS, resolveCompositionMode } from './types';
import { normalizeChapters } from './chapters';
import type { ResolvedChapter } from './chapters';

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

/** Intra-scene speech gaps shorter than this merge into one duck window —
 *  the music must breathe between THOUGHTS, not pump between words. */
const SPEECH_MERGE_GAP_S = 1.2;

/**
 * Frame ranges where narration is actually SPEAKING, used to duck the music
 * bed (copilot.md §6.2). When a scene ships word-level timings (Kokoro /
 * Whisper sidecar) the windows follow the voice itself — merged across gaps
 * under 1.2s so only real pauses let the music swell. Scenes without timings
 * fall back to the old whole-scene window (which already stops ~0.6s short of
 * the boundary thanks to pacing tails).
 */
export const narrationWindows = (
  scenes: Scene[],
  fps: number,
  mode: 'canvas' | 'slides'
): NarrationWindow[] => {
  const tf = transitionFrames(fps);
  const mergeGap = Math.round(SPEECH_MERGE_GAP_S * fps);
  const windows: NarrationWindow[] = [];
  let cursor = 0;
  scenes.forEach((scene, i) => {
    if (mode === 'slides' && hasIncomingTransition(scenes, i)) {
      cursor -= tf;
    }
    const frames = sceneFrames(scene, fps);
    if (scene.narration_audio_url) {
      const words = scene.narration_words ?? [];
      if (words.length > 0) {
        // Word timings are seconds relative to the narration audio, which
        // plays from the scene start in every mode.
        let start = cursor + Math.round(words[0].start * fps);
        let end = cursor + Math.round(words[0].end * fps);
        for (let k = 1; k < words.length; k++) {
          const ws = cursor + Math.round(words[k].start * fps);
          const we = cursor + Math.round(words[k].end * fps);
          if (ws - end < mergeGap) {
            end = Math.max(end, we);
          } else {
            windows.push({ start, end });
            start = ws;
            end = we;
          }
        }
        windows.push({ start, end });
      } else {
        const tail = Math.round(0.6 * fps);
        windows.push({ start: cursor, end: cursor + Math.max(Math.round(frames * 0.4), frames - tail) });
      }
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

// ---------------------------------------------------------------------------
// Hybrid chapters
// ---------------------------------------------------------------------------

/** Frames a chapter occupies on its own clock (canvas: back-to-back scenes;
 *  slides: internal transition overlaps already subtracted). */
export const chapterFrames = (ch: ResolvedChapter, fps: number): number =>
  ch.chapter.mode === 'canvas'
    ? totalCanvasFrames(ch.scenes, fps)
    : totalDurationInFrames(ch.scenes, fps);

export interface ChapterWindow {
  /** Global frame the chapter's own clock starts at (overlaps subtracted). */
  start: number;
  frames: number;
  /** Whether the chapter-level transition INTO this chapter is active. */
  hasTransition: boolean;
}

/**
 * Global start frames for each chapter, mirroring TransitionSeries math: an
 * active chapter transition overlaps the two chapters it joins, pulling every
 * later chapter earlier by one transition length.
 */
export const chapterWindows = (chapters: ResolvedChapter[], fps: number): ChapterWindow[] => {
  const tf = transitionFrames(fps);
  const windows: ChapterWindow[] = [];
  let cursor = 0;
  chapters.forEach((ch, i) => {
    const hasTransition = i > 0 && (ch.chapter.transition_in ?? 'fade') !== 'none';
    if (hasTransition) cursor -= tf;
    const frames = chapterFrames(ch, fps);
    windows.push({ start: cursor, frames, hasTransition });
    cursor += frames;
  });
  return windows;
};

export const totalHybridFrames = (chapters: ResolvedChapter[], fps: number): number => {
  if (!chapters.length) return fps;
  const windows = chapterWindows(chapters, fps);
  const last = windows[windows.length - 1];
  return Math.max(1, last.start + last.frames);
};

/** Music-duck windows across all chapters, offset to the global clock. */
export const narrationWindowsHybrid = (
  chapters: ResolvedChapter[],
  fps: number
): NarrationWindow[] => {
  const windows = chapterWindows(chapters, fps);
  const out: NarrationWindow[] = [];
  chapters.forEach((ch, i) => {
    const local = narrationWindows(ch.scenes, fps, ch.chapter.mode === 'canvas' ? 'canvas' : 'slides');
    for (const w of local) {
      out.push({ start: windows[i].start + w.start, end: windows[i].start + w.end });
    }
  });
  return out;
};

// ---------------------------------------------------------------------------
// The whole-composition clock
// ---------------------------------------------------------------------------

/**
 * Total frames for a shot list, in whatever mode it is in.
 *
 * This is the number `calculateMetadata` hands the renderer, lifted out of
 * Root.tsx so that anything else needing the composition's length — the
 * dashboard's in-browser player, above all — asks the SAME function rather
 * than reimplementing the mode rules and drifting.
 */
export const totalFramesFor = (shotList: ShotList, fps: number): number => {
  const mode = resolveCompositionMode(shotList);
  const scenes = shotList.scenes ?? [];
  if (mode === 'hybrid') return totalHybridFrames(normalizeChapters(shotList), fps);
  if (mode === 'canvas_journey' || mode === 'math_board') return totalCanvasFrames(scenes, fps);
  return totalDurationInFrames(scenes, fps);
};

/**
 * The global start frame of every scene, in storyboard order.
 *
 * Scene durations do NOT lay end to end: in slides mode each transition
 * overlaps the two scenes it joins, so every later scene sits one transition
 * earlier than naive addition suggests, and in hybrid mode the same is true of
 * chapters. Anything drawing a scene ruler against the playhead has to use the
 * renderer's own arithmetic or its markers will drift further out of place with
 * every cut — which is why this lives here beside that arithmetic, and not in
 * whatever UI happens to need it.
 *
 * Returns one start frame per scene, matching `shotList.scenes` order.
 */
export const sceneStartFrames = (shotList: ShotList, fps: number): number[] => {
  const mode = resolveCompositionMode(shotList);
  const tf = transitionFrames(fps);

  if (mode === 'hybrid') {
    const chapters = normalizeChapters(shotList);
    const windows = chapterWindows(chapters, fps);
    const starts: number[] = [];
    chapters.forEach((ch, ci) => {
      const base = windows[ci]?.start ?? 0;
      let cursor = 0;
      ch.scenes.forEach((scene, i) => {
        // A canvas chapter plays its scenes back to back; a slides chapter
        // overlaps them exactly like a top-level slides run.
        if (ch.chapter.mode !== 'canvas' && hasIncomingTransition(ch.scenes, i)) cursor -= tf;
        starts.push(base + cursor);
        cursor += sceneFrames(scene, fps);
      });
    });
    return starts;
  }

  const scenes = shotList.scenes ?? [];
  const overlaps = mode === 'slides';
  let cursor = 0;
  return scenes.map((scene, i) => {
    if (overlaps && hasIncomingTransition(scenes, i)) cursor -= tf;
    const start = cursor;
    cursor += sceneFrames(scene, fps);
    return start;
  });
};
