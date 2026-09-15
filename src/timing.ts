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

/**
 * The frame at which each scene has actually TAKEN THE SCREEN.
 *
 * `sceneStartFrames` returns when a scene's own clock begins, which is not
 * when you can see it. A scene's first frames are still showing the beat
 * before it: in slides mode the incoming transition overlaps the two scenes it
 * joins, so at `start` the previous card is at full opacity and this one at
 * zero; in canvas mode the camera is only just leaving the previous card and
 * takes up to 2.4 seconds to arrive (see canvas/camera.ts `travel`).
 *
 * Anything that shows a still of "scene i" — a filmstrip tile — or parks the
 * playhead on a scene the user just clicked has to use THIS frame, or it
 * shows the neighbouring beat and the whole editor reads one card out of step.
 *
 * Returns one frame per scene, matching `shotList.scenes` order.
 */
export const sceneSettledFrames = (shotList: ShotList, fps: number): number[] => {
  const scenes = shotList.scenes ?? [];
  if (!scenes.length) return [];

  const starts = sceneStartFrames(shotList, fps);
  const total = totalFramesFor(shotList, fps);
  const tf = transitionFrames(fps);

  // How long the frame still belongs to the PREVIOUS beat, per scene.
  const busy: number[] = [];
  const pushRun = (run: Scene[], mode: 'canvas' | 'slides') => {
    run.forEach((scene, i) => {
      const frames = sceneFrames(scene, fps);
      if (mode !== 'canvas') {
        busy.push(hasIncomingTransition(run, i) ? tf : 0);
        return;
      }
      // The camera's flight in. camera.ts picks the length from the scene's
      // treatment, which is not in the shot list's timing view — so take the
      // LONGEST flight it could have chosen (and its frames*0.45 ceiling),
      // because landing late in a scene is harmless and landing early shows
      // the wrong card.
      busy.push(
        i === 0
          ? Math.min(Math.round(fps * 1.0), Math.round(frames * 0.4))
          : Math.min(
              Math.max(Math.round(fps * 0.8), Math.min(Math.round(frames * 0.34), Math.round(fps * 2.4))),
              Math.round(frames * 0.45)
            )
      );
    });
  };

  const mode = resolveCompositionMode(shotList);
  if (mode === 'hybrid') {
    for (const ch of normalizeChapters(shotList)) {
      pushRun(ch.scenes, ch.chapter.mode === 'canvas' ? 'canvas' : 'slides');
    }
  } else {
    pushRun(scenes, mode === 'slides' ? 'slides' : 'canvas');
  }

  return scenes.map((scene, i) => {
    const start = starts[i] ?? 0;
    const span = Math.max(1, (starts[i + 1] ?? total) - start);
    // A beat and a half in was the old rule of thumb and it is still a good
    // one — reveals have landed by then — so take whichever is later, the
    // settled camera or that. Never past three quarters of the scene, which
    // is where the NEXT transition starts eating the frame.
    const want = Math.max(
      (busy[i] ?? 0) + Math.round(fps * 0.35),
      Math.min(Math.round(fps * 1.5), Math.floor(span / 2))
    );
    return Math.max(0, Math.min(total - 1, start + Math.min(want, Math.floor(span * 0.75))));
  });
};
