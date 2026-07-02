import { CanvasItem, CanvasPlan, Scene } from '../types';
import { sceneFrames } from '../timing';

/**
 * The virtual camera of the canvas journey. Pure math, no hooks — built once
 * per render and queried per frame.
 *
 * Choreography per scene (exactly the "guided map tour" the template sells):
 *  - Scene 1 opens ZOOMED TIGHT into its station, then pulls back until the
 *    card is framed — revealing that the visual lives in a box on a canvas.
 *  - Every later scene starts with a TRAVEL: the camera lifts off the previous
 *    station (zoom dips out far enough to see both stations), swoops along a
 *    curved path that matches the connector arrow, and lands on the new one.
 *  - While a station holds focus the camera never sits dead: it breathes,
 *    pushes in, or drifts (the director picks per scene).
 *  - The final scene ends on a pull-back overview of the entire journey.
 */

export interface CamState {
  x: number;
  y: number;
  scale: number;
}

export interface SceneWindow {
  /** Global frame the scene starts at. */
  start: number;
  /** Total frames of the scene. */
  frames: number;
  /** Leading frames used to travel to this scene's station. */
  travel: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Scale that frames a card with breathing room around it. */
const fitScale = (item: CanvasItem, vw: number, vh: number, margin = 1.16): number =>
  Math.min(vw / item.w, vh / item.h) / margin;

/** Scale that frames an arbitrary world-space rect. */
const fitRect = (x0: number, y0: number, x1: number, y1: number, vw: number, vh: number, margin: number): number =>
  Math.min(vw / Math.max(1, x1 - x0), vh / Math.max(1, y1 - y0)) / margin;

/** Quadratic bezier point. */
const qBezier = (p0: [number, number], c: [number, number], p1: [number, number], t: number): [number, number] => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
};

/**
 * Control point for the swoop between two stations. The bend side alternates
 * per hop; Connector.tsx uses the same helper so the drawn arrow and the
 * camera's flight path stay coordinated.
 */
export const travelControl = (
  from: [number, number],
  to: [number, number],
  hopIndex: number
): [number, number] => {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dist = Math.max(1, Math.hypot(dx, dy));
  const bend = (hopIndex % 2 === 0 ? 1 : -1) * 0.18;
  // Perpendicular offset.
  return [mx - (dy / dist) * dist * bend, my + (dx / dist) * dist * bend];
};

export interface CameraTrack {
  windows: SceneWindow[];
  totalFrames: number;
  at: (frame: number) => CamState;
  /** 0..1 progress of the flight INTO scene i (drives connector draw-on). */
  travelProgress: (sceneIndex: number, frame: number) => number;
  /** 0..1 how focused station i is (drives glow/dim on cards). */
  focus: (sceneIndex: number, frame: number) => number;
}

export const buildCamera = (
  plan: CanvasPlan,
  scenes: Scene[],
  fps: number,
  vw: number,
  vh: number
): CameraTrack => {
  const items = scenes.map(
    (scene, i) => plan.items.find((it) => it.scene_id === scene.scene_id) ?? plan.items[i]
  );

  // ---- Scene windows -------------------------------------------------------
  const windows: SceneWindow[] = [];
  let cursor = 0;
  scenes.forEach((scene, i) => {
    const frames = sceneFrames(scene, fps);
    const travel =
      i === 0
        ? Math.min(Math.round(fps * 1.0), Math.round(frames * 0.4))
        : clamp(Math.round(frames * 0.24), Math.round(fps * 0.8), Math.round(fps * 1.7));
    windows.push({ start: cursor, frames, travel: Math.min(travel, Math.round(frames * 0.45)) });
    cursor += frames;
  });
  const totalFrames = Math.max(1, cursor);

  // ---- Precomputed framing scales -----------------------------------------
  const fits = items.map((item) => fitScale(item, vw, vh));

  // Overview of the whole journey (the closing shot).
  const minX = Math.min(...items.map((i) => i.x - i.w / 2));
  const maxX = Math.max(...items.map((i) => i.x + i.w / 2));
  const minY = Math.min(...items.map((i) => i.y - i.h / 2));
  const maxY = Math.max(...items.map((i) => i.y + i.h / 2));
  const overviewScale = fitRect(minX, minY, maxX, maxY, vw, vh, 1.12);
  const overviewCenter: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];

  // Hold-end scale (what the camera reaches by the end of a scene's hold).
  const holdEndScale = (i: number): number => {
    const move = items[i].hold_move ?? 'breathe';
    if (move === 'push_in') return fits[i] * 1.14;
    if (move === 'drift') return fits[i] * 1.05;
    return fits[i] * 1.055; // breathe
  };

  const holdState = (i: number, h: number): CamState => {
    const item = items[i];
    const move = item.hold_move ?? 'breathe';
    const e = easeInOutSine(clamp(h, 0, 1));

    if (move === 'push_in') {
      return { x: item.x, y: item.y, scale: lerp(fits[i], fits[i] * 1.14, e) };
    }
    if (move === 'drift') {
      // Glide gently along the card's diagonal while slightly zoomed.
      const dx = item.w * 0.035;
      const dy = item.h * 0.03;
      return { x: lerp(item.x - dx, item.x + dx, e), y: lerp(item.y - dy, item.y + dy, e), scale: fits[i] * 1.05 };
    }
    // breathe
    return { x: item.x, y: item.y, scale: lerp(fits[i], fits[i] * 1.055, e) };
  };

  /** Where the camera is at the END of scene i (start point of the next flight). */
  const sceneEndState = (i: number): CamState => holdState(i, 1);

  const at = (frame: number): CamState => {
    const f = clamp(frame, 0, totalFrames - 1);

    // Locate the active scene.
    let i = windows.length - 1;
    for (let k = 0; k < windows.length; k++) {
      if (f < windows[k].start + windows[k].frames) {
        i = k;
        break;
      }
    }

    const w = windows[i];
    const item = items[i];
    const local = f - w.start;

    // ---- Phase 1: travel / arrive ----
    if (local < w.travel && w.travel > 0) {
      const t = local / w.travel;

      if (i === 0) {
        // Cold open: extreme close-up on station 1, settling back to its frame.
        const e = easeOutCubic(t);
        return { x: item.x, y: item.y, scale: lerp(fits[0] * 1.55, fits[0], e) };
      }

      const fromState = sceneEndState(i - 1);
      const from: [number, number] = [fromState.x, fromState.y];
      const to: [number, number] = [item.x, item.y];
      const control = travelControl(from, to, i - 1);
      const e = easeInOutCubic(t);
      const [x, y] = qBezier(from, control, to, e);

      // Zoom dips through a scale that frames BOTH stations mid-flight —
      // the pull-back-reveal-then-push-in arc, in log space so it feels linear.
      const prev = items[i - 1];
      const bothScale = fitRect(
        Math.min(prev.x - prev.w / 2, item.x - item.w / 2),
        Math.min(prev.y - prev.h / 2, item.y - item.h / 2),
        Math.max(prev.x + prev.w / 2, item.x + item.w / 2),
        Math.max(prev.y + prev.h / 2, item.y + item.h / 2),
        vw,
        vh,
        1.28
      );
      const straightMid = Math.exp(lerp(Math.log(fromState.scale), Math.log(fits[i]), 0.5));
      const dip = Math.log(Math.min(bothScale, straightMid) / straightMid);
      const scale = Math.exp(lerp(Math.log(fromState.scale), Math.log(fits[i]), e) + dip * Math.sin(Math.PI * e));

      return { x, y, scale };
    }

    // ---- Phase 2: hold (with a closing overview on the last scene) ----
    const holdFrames = Math.max(1, w.frames - w.travel);
    const h = (local - w.travel) / holdFrames;

    if (i === windows.length - 1 && windows.length > 1) {
      const outroFrames = Math.min(Math.round(fps * 1.8), Math.round(w.frames * 0.35));
      const outroStart = w.frames - w.travel - outroFrames;
      const holdLocal = local - w.travel;

      if (holdLocal >= outroStart && outroFrames > 0) {
        // Final pull-back: reveal the whole journey map.
        const t = easeInOutCubic(clamp((holdLocal - outroStart) / outroFrames, 0, 1));
        const fromState = holdState(i, outroStart / Math.max(1, holdFrames));
        return {
          x: lerp(fromState.x, overviewCenter[0], t),
          y: lerp(fromState.y, overviewCenter[1], t),
          scale: Math.exp(lerp(Math.log(fromState.scale), Math.log(overviewScale), t)),
        };
      }
      return holdState(i, holdLocal / Math.max(1, outroStart > 0 ? outroStart : holdFrames));
    }

    return holdState(i, h);
  };

  const travelProgress = (sceneIndex: number, frame: number): number => {
    const w = windows[sceneIndex];
    if (!w || w.travel <= 0) return frame >= (w?.start ?? 0) ? 1 : 0;
    return clamp((frame - w.start) / w.travel, 0, 1);
  };

  const focus = (sceneIndex: number, frame: number): number => {
    const w = windows[sceneIndex];
    if (!w) return 0;

    // Ramp up over this scene's travel, hold at 1, ramp down over next travel.
    const next = windows[sceneIndex + 1];
    const upStart = w.start;
    const upEnd = w.start + Math.max(1, w.travel);

    if (frame < upStart) return 0;
    if (frame < upEnd) return easeInOutSine(clamp((frame - upStart) / Math.max(1, w.travel), 0, 1));

    if (!next) return 1;
    const downStart = next.start;
    const downEnd = next.start + Math.max(1, next.travel);
    if (frame < downStart) return 1;
    return 1 - easeInOutSine(clamp((frame - downStart) / Math.max(1, next.travel), 0, 1));
  };

  return { windows, totalFrames, at, travelProgress, focus };
};
