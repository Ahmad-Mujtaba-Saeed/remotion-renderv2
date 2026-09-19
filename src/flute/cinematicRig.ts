import { cinematicProgress } from '@webprodigies/flute';
import type { CinematicElement, NarrationWord } from '../types';
import { beatFrames, spokenAt } from '../motion/narrationBeats';

/**
 * cinematicRig — the pure maths behind cinematic_card.
 *
 * The design pass says WHAT each part is, WHERE it sits on a 3x3 grid, HOW
 * DEEP it is and WHEN it lands. Everything a model gets wrong when it cannot
 * see its output — pixel positions, camera coordinates, focus distances — is
 * computed here instead, deterministically, from the grid.
 *
 * Two properties make the result safe to hand any storyboard:
 *
 * 1. **The rest layout is exact.** A part at depth z is drawn at scale
 *    (P - z) / P and pulled toward the centre by the same factor, which is the
 *    inverse of perspective. So with the camera at rest every part projects
 *    onto exactly its grid cell — rows share their width, nothing overlaps —
 *    and depth is only FELT: as parallax when the camera moves, and as blur
 *    when the focus is elsewhere.
 * 2. **Every camera framing is solved, not authored.** A push centres the part
 *    and sizes it to a share of the frame; an angle does the same through a
 *    small rotation (the rotated point is solved for, so the part still lands
 *    centred); a rack keeps the camera and moves only the focal plane.
 *
 * Units are frame pixels at 1080p, scaled by `u` so a 720p render frames
 * identically.
 */

/** Perspective distance at 1080p (Flute's default). */
export const BASE_PERSPECTIVE = 1400;

/** Layer depth at 1080p: positive is nearer the viewer. */
export const DEPTH_Z: Record<CinematicElement['depth'], number> = { near: 160, mid: 0, far: -240 };

/** A part's cell: centre offset from the frame centre (y down) and its size. */
export interface Cell {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Camera pose + focus. `blur` scales the depth-of-field cap (1 = full, 0 = everything sharp). */
export interface CamState {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  focus: number;
  blur: number;
}

const ROWS = { top: 0, mid: 1, bottom: 2 } as const;
const COLS = { left: 0, center: 1, right: 2 } as const;

/** Row and column of a grid place. */
export const placeOf = (place: CinematicElement['place']): { row: number; col: number } => {
  const [a, b] = place.split('_');
  if (b !== undefined) return { row: ROWS[a as 'top' | 'bottom'] ?? 1, col: COLS[b as 'left' | 'right'] ?? 1 };
  if (a === 'top' || a === 'bottom') return { row: ROWS[a], col: 1 };
  if (a === 'left' || a === 'right') return { row: 1, col: COLS[a] };
  return { row: 1, col: 1 };
};

/**
 * Lay the parts out: group by row (top to bottom), order by column then by
 * position in the list, split any row wider than the aspect allows, then give
 * every row an equal share of the stage and every part an equal share of its
 * row. Returns cells in the SAME order as `elements`.
 */
export const layoutCells = (
  elements: CinematicElement[],
  stage: { left: number; top: number; width: number; height: number },
  frame: { width: number; height: number },
  u: number
): Cell[] => {
  const portrait = frame.height > frame.width;
  const perRow = portrait ? 2 : 3;
  const gap = 28 * u;

  const indexed = elements.map((e, i) => ({ i, ...placeOf(e.place) }));
  const rows: number[][] = [];
  for (const r of [0, 1, 2]) {
    const inRow = indexed.filter((e) => e.row === r).sort((a, b) => a.col - b.col || a.i - b.i);
    for (let k = 0; k < inRow.length; k += perRow) rows.push(inRow.slice(k, k + perRow).map((e) => e.i));
  }

  const cells: Cell[] = new Array(elements.length);
  const rowH = (stage.height - gap * Math.max(0, rows.length - 1)) / Math.max(1, rows.length);
  // A lone part does not need the whole width: an html fragment scaled up to
  // 1700px reads as a poster, and a sentence that wide is one very long line.
  const loneW = Math.min(stage.width, frame.width * (portrait ? 0.9 : 0.64));
  rows.forEach((row, r) => {
    const n = row.length;
    const w = n === 1 ? loneW : (stage.width - gap * (n - 1)) / n;
    const rowW = w * n + gap * (n - 1);
    const top = stage.top + r * (rowH + gap);
    row.forEach((idx, k) => {
      const left = stage.left + (stage.width - rowW) / 2 + k * (w + gap);
      cells[idx] = {
        cx: left + w / 2 - frame.width / 2,
        cy: top + rowH / 2 - frame.height / 2,
        w,
        h: rowH,
      };
    });
  });
  return cells;
};

/** Scale that undoes perspective for a layer at depth z (so it lands on its cell). */
export const compensation = (z: number, P: number): number => (P - z) / P;

/**
 * A point after the stage rotation. Flute's camera is the CSS transform
 * `translate3d(-x,-y,-z) rotateX(rx) rotateY(ry)` about the frame centre, so a
 * point is rotated by Y first, then X, then translated.
 */
const rotate = (p: { x: number; y: number; z: number }, rx: number, ry: number) => {
  const a = (ry * Math.PI) / 180;
  const b = (rx * Math.PI) / 180;
  const x1 = p.x * Math.cos(a) + p.z * Math.sin(a);
  const z1 = -p.x * Math.sin(a) + p.z * Math.cos(a);
  const y2 = p.y * Math.cos(b) - z1 * Math.sin(b);
  const z2 = p.y * Math.sin(b) + z1 * Math.cos(b);
  return { x: x1, y: y2, z: z2 };
};

/** The rest pose: level, centred, focused on the mid plane, blur fully on. */
export const wide = (P: number): CamState => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, focus: P, blur: 1 });

/** Camera-axis distance to a part's centre under a pose (what focus.distance means). */
export const depthUnder = (cam: CamState, cell: Cell, z: number, P: number): number => {
  const c = compensation(z, P);
  const q = rotate({ x: cell.cx * c, y: cell.cy * c, z }, cam.rx, cam.ry);
  return P - (q.z - cam.z);
};

/**
 * Whether a part sits comfortably inside the shot a pose gives: its projected
 * cell within the middle 92% of the frame. A rack only makes sense for a part
 * the viewer can already see — racking focus onto something half off the edge
 * of a close-up is a focus pull onto nothing — so a rack that fails this is
 * upgraded to a push.
 */
export const inShot = (
  cam: CamState,
  cell: Cell,
  z: number,
  P: number,
  frame: { width: number; height: number }
): boolean => {
  const c = compensation(z, P);
  const q = rotate({ x: cell.cx * c, y: cell.cy * c, z }, cam.rx, cam.ry);
  const zz = q.z - cam.z;
  if (zz >= P * 0.95) return false;
  const k = P / (P - zz);
  const x = (q.x - cam.x) * k;
  const y = (q.y - cam.y) * k;
  const hw = (cell.w * c * k) / 2;
  const hh = (cell.h * c * k) / 2;
  return Math.abs(x) + hw <= frame.width * 0.46 && Math.abs(y) + hh <= frame.height * 0.46;
};

/**
 * The pose that frames one part: centred, sized to a share of the frame, in
 * focus. `angle` looks at it through a small rotation — across the stage from
 * the side it sits on, and slightly from above — and the rotated point is
 * solved for, so the part still lands centred.
 */
export const framing = (
  shot: 'push' | 'angle',
  cell: Cell,
  z: number,
  P: number,
  frame: { width: number; height: number }
): CamState => {
  // A part alone in its row owns a very wide cell but sits centred in it at
  // its natural width, so the cell's width overstates what there is to frame:
  // cap it at a generous landscape box around the cell's height.
  const w = Math.min(cell.w, cell.h * 2.4);
  // Portrait is width-bound, so a part may take more of the width there.
  const share = frame.height > frame.width ? 0.84 : 0.6;
  const s = Math.max(1.12, Math.min(1.85, Math.min((share * frame.width) / w, (0.58 * frame.height) / cell.h)));
  const ry = shot === 'angle' ? (cell.cx <= 0 ? 11 : -11) : 0;
  const rx = shot === 'angle' ? 6 : 0;
  const c = compensation(z, P);
  const q = rotate({ x: cell.cx * c, y: cell.cy * c, z }, rx, ry);
  // projected scale = c * P / (P - (q.z - camZ)) = s
  const camZ = q.z - P + (c * P) / s;
  return { x: q.x, y: q.y, z: camZ, rx, ry, focus: (c * P) / s, blur: 1 };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpCam = (a: CamState, b: CamState, t: number): CamState => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
  rx: lerp(a.rx, b.rx, t),
  ry: lerp(a.ry, b.ry, t),
  focus: lerp(a.focus, b.focus, t),
  blur: lerp(a.blur, b.blur, t),
});

interface Segment {
  start: number;
  end: number;
  /** Where the camera actually is at `start` (mid-move if interrupted). */
  from: CamState;
  to: CamState;
}

/**
 * The whole camera path for one scene, as an evaluator of frame → pose.
 *
 * One move per part, starting a beat before its landing frame so the camera
 * arrives WITH the part rather than chasing it; then the finale pulls back to
 * the rest pose and ramps the blur to zero, so the last thing on screen is
 * the whole explanation, readable. A move that is interrupted by the next one
 * hands over from wherever it had got to — no snap.
 */
export const cameraPath = (
  elements: CinematicElement[],
  cells: Cell[],
  landAt: number[],
  opts: { P: number; u: number; fps: number; sceneFrames: number; frame: { width: number; height: number } }
): ((f: number) => CamState) => {
  const { P, u, fps, sceneFrames, frame } = opts;
  const lead = Math.round(fps * 0.35);
  const move = Math.round(fps * 1.05);
  const segments: Segment[] = [];

  // Between moves the camera never quite stops: it creeps forward, slowly,
  // keeping its focal plane on the same subject. Without it the opening (the
  // heading alone until the first part is named) and every long hold read as
  // a still frame.
  const creepRate = (16 * u) / fps;
  const creepMax = 110 * u;
  const creep = (pose: CamState, since: number): CamState => {
    const d = Math.min(creepMax, Math.max(0, since) * creepRate);
    return d > 0 ? { ...pose, z: pose.z - d, focus: pose.focus - d } : pose;
  };

  /** The latest move that has started owns the frame. */
  const evalAt = (f: number): CamState => {
    let seg: Segment | null = null;
    for (const s of segments) {
      if (f >= s.start) seg = s;
      else break;
    }
    if (!seg) return creep(wide(P), f);
    if (f >= seg.end) return creep(seg.to, f - seg.end);
    const t = seg.end <= seg.start ? 1 : (f - seg.start) / (seg.end - seg.start);
    return lerpCam(seg.from, seg.to, cinematicProgress(t));
  };
  const push = (start: number, end: number, to: (pose: CamState) => CamState) => {
    // Starts never go backwards, so a crowded beat queues rather than rewinds.
    const s = Math.max(start, segments.length ? segments[segments.length - 1].start + 1 : 0);
    const from = evalAt(s);
    segments.push({ start: s, end: Math.max(s + 1, end + (s - start)), from, to: to(from) });
  };

  const order = elements.map((_, i) => i).sort((a, b) => landAt[a] - landAt[b] || a - b);
  for (const i of order) {
    const el = elements[i];
    const z = DEPTH_Z[el.depth] * u;
    const start = Math.max(0, landAt[i] - lead);
    push(start, start + move, (pose) =>
      // A rack keeps the pose the camera actually has and moves only the focal
      // plane onto the part.
      el.camera === 'rack' && inShot(pose, cells[i], z, P, frame)
        ? { ...pose, focus: depthUnder(pose, cells[i], z, P), blur: 1 }
        : framing(el.camera === 'angle' ? 'angle' : 'push', cells[i], z, P, frame)
    );
  }

  // The finale: back to the rest pose with the blur ramped out, held for the
  // last fifth of the scene (never less than ~1.8s) so the whole explanation
  // is on screen, sharp, long enough to read.
  const lastLand = order.length ? landAt[order[order.length - 1]] : 0;
  const finaleLen = Math.round(fps * 1.2);
  const hold = Math.max(finaleLen + Math.round(fps * 0.6), Math.round(sceneFrames * 0.2));
  const finaleStart = Math.min(
    Math.max(lastLand + Math.round(fps * 1.1), sceneFrames - hold),
    sceneFrames - finaleLen
  );
  push(finaleStart, finaleStart + finaleLen, () => ({ ...wide(P), blur: 0 }));

  return evalAt;
};

/**
 * The frame each part lands on, in LIST order (the design pass lists parts in
 * the order they should arrive).
 *
 * A `word` cue lands on the narrator saying it; an `at` cue on its share of
 * the scene; anything else (or a word never spoken) takes its slot in an even
 * spread. Then the same clamping narrationBeats applies: never before the
 * heading settles, never two within `minGap`, and the last one early enough to
 * leave the finale its hold.
 */
export const landFrames = (
  elements: CinematicElement[],
  words: NarrationWord[] | undefined,
  fps: number,
  sceneFrames: number,
  first: number
): number[] => {
  const n = elements.length;
  if (n === 0) return [];
  const minGap = Math.round(fps * 0.7);
  const reserve = Math.max(Math.round(fps * 1.8), Math.round(sceneFrames * 0.2)) + Math.round(fps * 0.9);
  const last = Math.max(first + minGap * (n - 1), sceneFrames - reserve);
  const even = beatFrames(undefined, n, fps, { first, last, minGap });

  const out: number[] = [];
  elements.forEach((el, i) => {
    const spoken = el.word ? spokenAt(words, el.word, fps) : null;
    const wanted =
      spoken ?? (typeof el.at === 'number' && isFinite(el.at) ? Math.round(el.at * sceneFrames) : even[i]);
    const floor = i === 0 ? first : out[i - 1] + minGap;
    const ceil = last - (n - 1 - i) * minGap;
    out.push(Math.round(Math.min(Math.max(wanted, floor), Math.max(floor, ceil))));
  });
  return out;
};

/** Entrance progress 0..1 for a part landing at `land` (cinematic ease). */
export const entrance = (f: number, land: number, fps: number): number => {
  const start = land - Math.round(fps * 0.25);
  const len = Math.round(fps * 0.8);
  return cinematicProgress(Math.max(0, Math.min(1, (f - start) / len)));
};
