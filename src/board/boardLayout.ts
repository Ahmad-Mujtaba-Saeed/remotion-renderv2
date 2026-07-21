import { Scene, MathStep } from '../types';
import { sceneFrames } from '../timing';
import { clamp01, easeInOutSine } from '../motion/easing';
import { parseMath, mathWidthUnits } from '../math/mathText';
import { equationSteps, equationLandAt } from './equationPacing';

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

/** One written line's height as a fraction of the frame — an upper bound;
 *  buildBoard shrinks it to hug the width-fit type size (see EQ_* below). */
export const LINE_H_FRAC = 0.15;

/** Fraction of the equation box the longest line may span, and the extra
 *  width units a row spends beside the expression (number column, gap,
 *  answer-chip padding). Shared with BoardEquation so the size the layout
 *  budgets rows for IS the size the card actually renders — and so a full
 *  row, chrome included, can never spill past the box in a narrow frame. */
export const EQ_WIDTH_BUDGET = 0.88;
export const EQ_EXTRA_UNITS = 2.2;
/** Width units reserved for the right-margin "as we know" citation column,
 *  added to the board-wide max when ANY step carries a `ref`. Reserving it
 *  board-wide (rather than per card) keeps the one-size-for-the-whole-board
 *  rule: every line still renders at the same size, there is simply a margin
 *  the citations can live in without squeezing the working. */
export const EQ_REF_UNITS = 7;
/** A board of only short lines still writes at a calm size, never a shout. */
export const EQ_MIN_UNITS = 14;

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

/*
 * Deliberately NOT the same list as the validator's MATH_TEMPLATES: this one
 * only decides how a scene is DRAWN once a video is already on the board, so
 * practice_card belongs here (its problem and answer are maths and it has no
 * heading/bullets for a spine note to render). The PHP list also decides
 * whether a video boards AT ALL, and a "try one yourself" beat is not evidence
 * of a derivation — adding it there would drag quiz-ish videos onto the board.
 */
const MATH_TEMPLATES = new Set([
  'math_steps',
  'geometry_diagram',
  'function_plot',
  'scenario_diagram',
  'formula_anatomy',
  'practice_card',
  'common_mistake',
]);
const isFigureTpl = (s: Scene): boolean =>
  s.layout_template === 'geometry_diagram' ||
  s.layout_template === 'function_plot' ||
  s.layout_template === 'scenario_diagram' ||
  s.layout_template === 'formula_anatomy' ||
  s.layout_template === 'practice_card' ||
  s.layout_template === 'common_mistake';
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
  // 12 matches the validator's per-card step cap: budgeting for fewer lines
  // than a card can actually carry under-sized the card and the tail of the
  // working overflowed its box.
  return clamp(steps.length || 1, 1, 12);
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
  // One written equation line. The frame fraction is only an upper bound:
  // the type itself is WIDTH-fit (the longest line on the board spans the
  // spine), so the line height hugs that size — otherwise a portrait frame
  // (narrow width-fit type, tall vh-sized rows) writes small text with huge
  // dead air between lines, and the rowH-capped size turns into giant type.
  let maxUnits = 0;
  for (const scene of scenes) {
    if (!isEquationTpl(scene)) continue;
    for (const s of equationSteps(scene)) {
      maxUnits = Math.max(maxUnits, mathWidthUnits(parseMath(s.expr)));
    }
  }
  const SPINE_UNIT = (SPINE_W * EQ_WIDTH_BUDGET) / (Math.max(maxUnits, EQ_MIN_UNITS) * 0.6 + EQ_EXTRA_UNITS);
  const LINE_H = Math.min(vh * LINE_H_FRAC, SPINE_UNIT * 2.15);
  const HEAD_H = Math.min(vh * 0.14, LINE_H * 0.95); // heading zone in an equation card
  const GAP = Math.min(vh * 0.11, LINE_H * 0.7); // vertical air between spine cards
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

  // NOTE: the outro used to pull the camera back to frame the entire finished
  // board. It was rejected — a zoom-out at the end reads as the video backing
  // away from the work rather than landing on it. The outro now rests on its
  // own card like any other note, at the same scale as the beat before it.

  // Land times per equation scene, window-relative — the camera follows the
  // SAME pacing BoardEquation writes with, so the two can never drift apart.
  const landCache = new Map<number, number[]>();
  const landFor = (sceneIndex: number): number[] => {
    let land = landCache.get(sceneIndex);
    if (!land) {
      land = equationLandAt(scenes[sceneIndex], windows[sceneIndex].frames, fps);
      landCache.set(sceneIndex, land);
    }
    return land;
  };

  const restPose = (sceneIndex: number, h: number): CamState => {
    const card = poseFor(sceneIndex);
    if (card.kind === 'equation') {
      let y = card.cy;
      if (card.h > viewportH * 0.96) {
        // Tall working: the camera rests ON the active line and nudges down
        // one quiet step as each new line lands — never a continuous drift.
        // The line being written sits ~2/3 down the frame, so the write-head
        // can never sink below the bottom of the shot.
        const scene = scenes[sceneIndex];
        const cyTop = card.top + viewportH / 2;
        // The bottom bound may look up to ~30% of a viewport past the card:
        // a hard card-bottom clamp pinned the LAST lines of a card barely
        // taller than the frame against the bottom edge, and a stripe of
        // empty grid under the answer is what a real board looks like anyway.
        const cyBot = Math.max(cyTop, card.top + card.h - viewportH * 0.3);
        const headZone =
          (boardHasHeading(scene) ? HEAD_H : LINE_H * 0.35) +
          (boardHasRule(scene) ? LINE_H * 0.85 : 0);
        const lineY = (k: number): number => card.top + headZone + (k + 0.5) * LINE_H;
        const target = (k: number): number => clamp(lineY(k) - viewportH * 0.18, cyTop, cyBot);
        const land = landFor(sceneIndex);
        const w = windows[sceneIndex];
        const local = w.travel + h * Math.max(1, w.frames - w.travel);
        y = target(0);
        for (let k = 1; k < land.length; k++) {
          const move = Math.max(1, Math.min(Math.round(fps * 0.55), land[k] - land[k - 1]));
          const t0 = land[k] - move;
          if (local <= t0) break;
          y = lerp(target(k - 1), target(k), easeInOutSine(clamp01((local - t0) / move)));
        }
      }
      return { x: spineWorldX, y, scale: S_READ, rot: 0 };
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
