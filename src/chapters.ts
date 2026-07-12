import { Chapter, Scene, ShotList } from './types';

/** A chapter paired with the actual scene objects it covers, in order. */
export interface ResolvedChapter {
  chapter: Chapter;
  scenes: Scene[];
}

/**
 * Deterministic repair of the chapter plan, mirroring the PHP
 * ChapterPlanValidator so a malformed payload can never crash the render:
 *  - every scene appears exactly once, in storyboard order — the plan only
 *    gets a vote on WHERE the chapter boundaries fall, never on ordering;
 *  - chapters are contiguous runs (rebuilt by walking the scenes in order and
 *    splitting wherever the claimed chapter changes);
 *  - unknown modes become slides; a 1-scene canvas chapter becomes slides
 *    (a journey of one stop is just a slide with extra steps);
 *  - a missing/empty/unusable plan collapses to a single chapter covering
 *    everything — canvas when a world plan exists, else slides — which is
 *    exactly the pre-hybrid behaviour.
 */
export const normalizeChapters = (shotList: ShotList): ResolvedChapter[] => {
  const scenes = [...(shotList.scenes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const fallback = (): ResolvedChapter[] => [
    {
      chapter: {
        id: 'ch_1',
        mode: shotList.canvas ? 'canvas' : 'slides',
        scene_ids: scenes.map((s) => s.scene_id),
        transition_in: 'none',
        canvas: shotList.canvas ?? null,
      },
      scenes,
    },
  ];

  const declared = shotList.chapters?.chapters;
  if (!scenes.length || !Array.isArray(declared) || declared.length === 0) {
    return fallback();
  }

  // Which chapter (index) claims each scene — first claim wins.
  const claimedBy = new Map<string, number>();
  declared.forEach((ch, idx) => {
    for (const sid of ch?.scene_ids ?? []) {
      if (!claimedBy.has(sid)) claimedBy.set(sid, idx);
    }
  });

  // Walk scenes in storyboard order; split runs where the claimed chapter
  // changes. Unclaimed scenes stick to the current run (or start a slides run).
  const runs: { chapterIdx: number | null; scenes: Scene[] }[] = [];
  for (const scene of scenes) {
    const idx = claimedBy.get(scene.scene_id) ?? null;
    const current = runs[runs.length - 1];
    if (current && (idx === null || idx === current.chapterIdx)) {
      current.scenes.push(scene);
    } else if (current && current.chapterIdx === null && idx !== null) {
      // A leading unclaimed run adopts the first claimed chapter it meets.
      current.chapterIdx = idx;
      current.scenes.push(scene);
    } else {
      runs.push({ chapterIdx: idx, scenes: [scene] });
    }
  }

  const resolved: ResolvedChapter[] = runs.map((run, i) => {
    const source = run.chapterIdx !== null ? declared[run.chapterIdx] : undefined;
    let mode = source?.mode === 'canvas' ? 'canvas' : 'slides';
    // A canvas journey needs somewhere to fly; a single stop is a slide.
    if (mode === 'canvas' && run.scenes.length < 2) mode = 'slides';
    return {
      chapter: {
        id: source?.id ?? `ch_${i + 1}`,
        mode: mode as Chapter['mode'],
        scene_ids: run.scenes.map((s) => s.scene_id),
        transition_in: i === 0 ? 'none' : source?.transition_in ?? 'fade',
        canvas: mode === 'canvas' ? source?.canvas ?? null : null,
        accent: source?.accent ?? null,
      },
      scenes: run.scenes,
    };
  });

  return resolved.length ? resolved : fallback();
};
