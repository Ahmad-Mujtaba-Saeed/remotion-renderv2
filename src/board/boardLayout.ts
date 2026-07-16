import { Scene, MathStep } from '../types';
import { sceneFrames } from '../timing';
import { clamp01, easeInOutSine } from '../motion/easing';

/**
 * boardLayout — the geometry + camera of the MATH BOARD composition mode.
 *
 * Unlike the canvas journey (scenes scattered across a world, one visible at a
 * time, camera flying between them), the board is ONE continuous vertical
 * surface on which the whole worked solution accumulates and stays put. The
 * camera is a calm teacher's eye: it holds still on a beat, scrolls DOWN as
 * the equation is written, zooms in to look at a diagram, steps aside (left)
 * to a concept and returns to exactly where the working was left off. No roll,
 * no idle breathing, no Prezi swoop — motion happens only when the writing
 * moves or a beat needs a different frame.
 *
 * Pure math, built once per render and queried per frame (no hooks).
 */

export type BoardKind = 'equation' | 'figure' | 'note' | 'concept';

/** One written line's height as a fraction of the frame — shared with
 *  BoardEquation so type sizing and card sizing agree. */
export const LINE_H_FRAC = 0.15;

export interface CamState {
  x: number;
  y: number;
  scale: number;
  rot: number;
}

export interface BoardCard {
  sceneIndex: number;
  kind: BoardKind;
  /** World-space center (post-shift, both >= 0). */
  cx: number;
  cy: number;
  /** World-space box size. */
  w: number;
  h: number;
  /** World-space top edge (cy - h/2). */
  top: number;
}

export interface BoardWindow {
  start: number;
  frames: number;
  travel: number;
}

export interface BoardPlan {
  world: { width: number; height: number };
  cards: BoardCard[];
  windows: BoardWindow[];
  /** Camera pose at a global frame. */
  at: (frame: number) => CamState;
  /** Index of the card whose window the playhead is inside. */
  activeAt: (frame: number) => number;
}

const MATH_TEMPLATES = new Set(['math_steps', 'geometry_diagram', 'function_plot', 'scenario_diagram']);
const isFigureTpl = (s: Scene): boolean =>
  s.layout_template === 'geometry_diagram' ||
  s.layout_template === 'function_plot' ||
  s.layout_template === 'scenario_diagram';
const isEquationTpl = (s: Scene): boolean => s.layout_template === 'math_steps';
const isMathTpl = (s: Scene): boolean => MATH_TEMPLATES.has(s.layout_template);

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Interpolate a camera pose; scale rides log space so zooms feel linear. */
const lerpPose = (a: CamState, b: CamState, t: number): CamState => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  scale: Math.exp(lerp(Math.log(a.scale), Math.log(b.scale), t)),
  rot: 0,
});

/** Steps in a math_steps scene (clamped for height budgeting). */
export const boardStepCount = (scene: Scene): number => {
  const slot = scene.slots?.['slot_math'] ?? Object.values(scene.slots ?? {})[0];
  const steps = ((slot?.steps as MathStep[] | undefined) ?? []).filter(
    (s) => s && typeof s === 'object' && typeof s.expr === 'string' && s.expr.trim() !== ''
  );
  return clamp(steps.length || 1, 1, 8);
};

const boardHasHeading = (scene: Scene): boolean => {
  const slot = scene.slots?.['slot_math'] ?? Object.values(scene.slots ?? {})[0];
  return Boolean((slot?.heading ?? '').toString().trim());
};

/** Whether the equation card carries a rule strip (BoardEquation renders it
 *  under the heading; the card must be budgeted the extra height here or the
 *  camera's scroll math and the strip would fight over the same pixels). */
const boardHasRule = (scene: Scene): boolean => {
  const slot = scene.slots?.['slot_math'] ?? Object.values(scene.slots ?? {})[0];
  const rule = slot?.rule as { name?: string } | null | undefined;
  return Boolean((rule?.name ?? '').toString().trim());
};

/**
 * Classify a scene into a board beat. Figures and equations are obvious;
 * a text scene that sits BETWEEN two math beats is a concept aside (the camera
 * detours left and comes back); everything else (hook, outro, lone text) is a
 * spine note in the main column.
 */
export const classifyBoardScene = (scenes: Scene[], i: number): BoardKind => {
  const scene = scenes[i];
  if (isEquationTpl(scene)) return 'equation';
  if (isFigureTpl(scene)) return 'figure';
  const prev = scenes[i - 1];
  const next = scenes[i + 1];
  if (prev && next && isMathTpl(prev) && isMathTpl(next)) return 'concept';
  return 'note';
};

export const buildBoard = (
  scenes: Scene[],
  fps: number,
  vw: number,
  vh: number
): BoardPlan => {
  // ---- Box sizing (fractions of the frame so 16:9 and 9:16 both hold up) ---
  const SPINE_W = vw * 0.8;
  const NOTE_W = vw * 0.78;
  const FIG_W = vw * 0.62;
  // Figures reuse the real diagram layouts, which are designed at the frame's
  // aspect — keep the figure box that aspect so the design-and-scale is a
  // clean uniform fit (no letterboxing/cropping).
  const FIG_H = FIG_W * (vh / vw);
  const CONCEPT_W = vw * 0.66;
  const CONCEPT_H = vh * 0.52;
  const NOTE_H = vh * 0.42;
  // One written equation line. 0.15 (was 0.19): with phase consolidation a
  // section carries 4-8 lines, and at width-fit reading zoom a smaller line
  // height IS smaller handwriting — the "giant text on an empty board" fix.
  const LINE_H = vh * LINE_H_FRAC;
  const HEAD_H = vh * 0.14; // heading zone in an equation card
  const GAP = vh * 0.11; // vertical air between spine cards
  const CONCEPT_LANE_X = -vw * 0.94; // left margin (pre-shift)

  const eqHeight = (scene: Scene): number =>
    (boardHasHeading(scene) ? HEAD_H : LINE_H * 0.35) +
    (boardHasRule(scene) ? LINE_H * 0.85 : 0) +
    boardStepCount(scene) * LINE_H;

  // ---- Constant framing scales -------------------------------------------
  const frameScale = (w: number, h: number, mw = 0.92, mh = 0.9): number =>
    clamp(Math.min((vw * mw) / w, (vh * mh) / h), 0.4, 2.2);
  // Equations share ONE reading zoom (width-fit) so moving between them is a
  // pure vertical scroll — the zoom never changes mid-derivation.
  const S_READ = clamp((vw * 0.9) / SPINE_W, 0.4, 2.2);
  const S_NOTE = frameScale(NOTE_W, NOTE_H);
  const S_FIG = frameScale(FIG_W, FIG_H);
  const S_CONCEPT = frameScale(CONCEPT_W, CONCEPT_H);
  const viewportH = vh / S_READ;

  // ---- Place the cards (pre-shift; spine centered on x=0) ------------------
  const raw: BoardCard[] = [];
  let spineBottom = 0;
  let lastSpineCy = 0;
  scenes.forEach((scene, i) => {
    const kind = classifyBoardScene(scenes, i);
    if (kind === 'concept') {
      // Sit beside the equation we paused on, in the left margin. Does NOT
      // advance the spine — returning to the spine lands where we left off.
      const cy = lastSpineCy || spineBottom + CONCEPT_H / 2;
      raw.push({ sceneIndex: i, kind, cx: CONCEPT_LANE_X, cy, w: CONCEPT_W, h: CONCEPT_H, top: cy - CONCEPT_H / 2 });
      return;
    }
    const w = kind === 'figure' ? FIG_W : kind === 'equation' ? SPINE_W : NOTE_W;
    const h = kind === 'figure' ? FIG_H : kind === 'equation' ? eqHeight(scene) : NOTE_H;
    const top = spineBottom;
    const cy = top + h / 2;
    raw.push({ sceneIndex: i, kind, cx: 0, cy, w, h, top });
    spineBottom = top + h + GAP;
    lastSpineCy = cy;
  });

  // ---- Shift into a positive world box ------------------------------------
  const PAD_X = vw * 0.25;
  const PAD_Y = vh * 0.25;
  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;
  for (const c of raw) {
    minLeft = Math.min(minLeft, c.cx - c.w / 2);
    minTop = Math.min(minTop, c.top);
    maxRight = Math.max(maxRight, c.cx + c.w / 2);
    maxBottom = Math.max(maxBottom, c.top + c.h);
  }
  if (!isFinite(minLeft)) {
    minLeft = 0;
    minTop = 0;
    maxRight = vw;
    maxBottom = vh;
  }
  const dx = PAD_X - minLeft;
  const dy = PAD_Y - minTop;
  const cards: BoardCard[] = raw.map((c) => ({
    ...c,
    cx: c.cx + dx,
    cy: c.cy + dy,
    top: c.top + dy,
  }));
  const spineWorldX = dx; // shifted x of the spine center (world x=0)
  const world = {
    width: maxRight + dx + PAD_X,
    height: maxBottom + dy + PAD_Y,
  };

  // ---- Scene windows (back-to-back, one continuous clock) ------------------
  const windows: BoardWindow[] = [];
  let cursor = 0;
  scenes.forEach((scene, i) => {
    const frames = sceneFrames(scene, fps);
    const travel =
      i === 0
        ? 0
        : Math.min(
            clamp(Math.round(frames * 0.32), Math.round(fps * 0.5), Math.round(fps * 0.9)),
            Math.round(frames * 0.5)
          );
    windows.push({ start: cursor, frames, travel });
    cursor += frames;
  });
  const totalFrames = Math.max(1, cursor);

  // ---- Resting pose of a card during its hold (h in 0..1) ------------------
  const cardByScene = new Map(cards.map((c) => [c.sceneIndex, c]));
  const poseFor = (sceneIndex: number): BoardCard =>
    cardByScene.get(sceneIndex) ?? cards[cards.length - 1];

  // The payoff shot: the outro pulls back to frame the ENTIRE finished board —
  // the whole working visible at once, the thing the accumulating surface has
  // been earning the whole video.
  const lastIsOutro =
    scenes.length > 0 && scenes[scenes.length - 1].layout_template === 'outro_card';
  const bbox = cards.reduce(
    (b, c) => ({
      minX: Math.min(b.minX, c.cx - c.w / 2),
      maxX: Math.max(b.maxX, c.cx + c.w / 2),
      minY: Math.min(b.minY, c.top),
      maxY: Math.max(b.maxY, c.top + c.h),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
  const pullbackPose: CamState = isFinite(bbox.minX)
    ? {
        x: (bbox.minX + bbox.maxX) / 2,
        y: (bbox.minY + bbox.maxY) / 2,
        scale: frameScale(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, 0.88, 0.84),
        rot: 0,
      }
    : { x: vw / 2, y: vh / 2, scale: 1, rot: 0 };

  const restPose = (sceneIndex: number, h: number): CamState => {
    if (lastIsOutro && sceneIndex === scenes.length - 1) {
      return pullbackPose;
    }
    const card = poseFor(sceneIndex);
    if (card.kind === 'equation') {
      let cyTop = card.cy;
      let cyBot = card.cy;
      if (card.h > viewportH * 0.96) {
        // Tall working: scroll the write-head down the card as it fills in.
        cyTop = card.top + viewportH / 2;
        cyBot = card.top + card.h - viewportH / 2;
      }
      const wp = easeInOutSine(clamp01(h / 0.85));
      return { x: spineWorldX, y: lerp(cyTop, cyBot, wp), scale: S_READ, rot: 0 };
    }
    if (card.kind === 'figure') {
      return { x: card.cx, y: card.cy, scale: S_FIG, rot: 0 };
    }
    if (card.kind === 'concept') {
      return { x: card.cx, y: card.cy, scale: S_CONCEPT, rot: 0 };
    }
    return { x: card.cx, y: card.cy, scale: S_NOTE, rot: 0 };
  };

  const activeAt = (frame: number): number => {
    const f = clamp(frame, 0, totalFrames - 1);
    for (let k = 0; k < windows.length; k++) {
      if (f < windows[k].start + windows[k].frames) return k;
    }
    return windows.length - 1;
  };

  const at = (frame: number): CamState => {
    const i = activeAt(frame);
    const w = windows[i];
    const local = clamp(frame, 0, totalFrames - 1) - w.start;

    if (i > 0 && w.travel > 0 && local < w.travel) {
      // Purposeful move from where the previous beat rested to where this one
      // begins — a scroll, a zoom-to-diagram, or a step aside to a concept.
      const t = local / w.travel;
      const e = easeInOutSine(clamp01(t));
      return lerpPose(restPose(i - 1, 1), restPose(i, 0), e);
    }

    const holdFrames = Math.max(1, w.frames - w.travel);
    const h = (local - w.travel) / holdFrames;
    return restPose(i, clamp01(h));
  };

  return { world, cards, windows, at, activeAt };
};
