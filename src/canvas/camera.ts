import { CanvasItem, CanvasPlan, Scene, SceneRelation } from '../types';
import { sceneFrames } from '../timing';

/**
 * The virtual camera of the canvas journey. Pure math, no hooks — built once
 * per render and queried per frame.
 *
 * v3 — STORY-DRIVEN FLIGHT GRAMMAR. Every scene carries a `relation` to the
 * story so far (validator-normalised), and the relation shapes the flight:
 *  - "continues"    swooping hop along a bezier whose bend varies per hop.
 *  - "consequence"  the camera RIDES the drawn arrow: tighter, punchier ease,
 *                   a small overshoot-settle on landing.
 *  - "contrast"     the camera pulls out until BOTH scenes share the frame,
 *                   holds the comparison for a beat, then commits to the new.
 *  - "callback"     one long, high, graceful flight back across the map.
 *  - "new_chapter"  / pull_reveal: a wide breath that shows the bigger picture.
 *  - "elaborates"   / zoom_nest: anticipation pull-back, then a straight log
 *                   dive INTO the previous scene's visual.
 * Flights also roll the horizon a few degrees into their curve (always level
 * on arrival), and holds breathe/push/drift with per-scene variation so no
 * two scenes move identically.
 */

export interface CamState {
  x: number;
  y: number;
  scale: number;
  /** Camera roll in degrees — non-zero only mid-flight, always 0 at rest. */
  rot: number;
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
const easeInOutQuint = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);

/** Deterministic pseudo-random in [0,1) — mirrors the PHP validator's seeded(). */
const seeded = (i: number, salt: number): number => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

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
 * Signed bend factor for hop i. The side alternates but the magnitude varies
 * per hop (0.12..0.28) so consecutive flights never trace congruent curves.
 */
export const hopBendFactor = (hopIndex: number): number => {
  const side = hopIndex % 2 === 0 ? 1 : -1;
  return side * (0.12 + seeded(hopIndex, 7) * 0.16);
};

/**
 * Control point for the swoop between two stations. Connector.tsx uses the
 * same helper so the drawn line and the camera's flight path stay one curve.
 */
export const travelControl = (
  from: [number, number],
  to: [number, number],
  hopIndex: number,
  bendScale = 1
): [number, number] => {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dist = Math.max(1, Math.hypot(dx, dy));
  const bend = hopBendFactor(hopIndex) * bendScale;
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

/** Relations that earn a longer, more expressive travel window. */
const isLongFlight = (item: CanvasItem): boolean =>
  (item.treatment ?? '') === 'pull_reveal' ||
  ['callback', 'new_chapter', 'contrast'].includes(item.relation ?? '');

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
    const long = isLongFlight(items[i]);
    const travel =
      i === 0
        ? Math.min(Math.round(fps * 1.0), Math.round(frames * 0.4))
        : clamp(
            Math.round(frames * (long ? 0.34 : 0.24)),
            Math.round(fps * 0.8),
            Math.round(fps * (long ? 2.4 : 1.7))
          );
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

  // ---- Hold moves (per-scene seeded variation so no two feel identical) ----
  const holdState = (i: number, h: number): CamState => {
    const item = items[i];
    const move = item.hold_move ?? 'breathe';
    const e = easeInOutSine(clamp(h, 0, 1));

    if (move === 'push_in') {
      const target = 1.12 + seeded(i, 11) * 0.06;
      return { x: item.x, y: item.y, scale: lerp(fits[i], fits[i] * target, e), rot: 0 };
    }
    if (move === 'drift') {
      const sx = seeded(i, 12) > 0.5 ? 1 : -1;
      const sy = seeded(i, 13) > 0.5 ? 1 : -1;
      const dx = item.w * 0.035 * sx;
      const dy = item.h * 0.03 * sy;
      const zoom = 1.04 + seeded(i, 14) * 0.03;
      return { x: lerp(item.x - dx, item.x + dx, e), y: lerp(item.y - dy, item.y + dy, e), scale: fits[i] * zoom, rot: 0 };
    }
    // breathe
    const amp = 1.045 + seeded(i, 15) * 0.025;
    return { x: item.x, y: item.y, scale: lerp(fits[i], fits[i] * amp, e), rot: 0 };
  };

  /** Where the camera is at the END of scene i (start point of the next flight). */
  const sceneEndState = (i: number): CamState => holdState(i, 1);

  /** Scale that frames scene i-1 and scene i together. */
  const duoScale = (i: number, margin: number): { scale: number; cx: number; cy: number } => {
    const prev = items[i - 1];
    const item = items[i];
    const x0 = Math.min(prev.x - prev.w / 2, item.x - item.w / 2);
    const y0 = Math.min(prev.y - prev.h / 2, item.y - item.h / 2);
    const x1 = Math.max(prev.x + prev.w / 2, item.x + item.w / 2);
    const y1 = Math.max(prev.y + prev.h / 2, item.y + item.h / 2);
    return { scale: fitRect(x0, y0, x1, y1, vw, vh, margin), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };

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
        return { x: item.x, y: item.y, scale: lerp(fits[0] * 1.55, fits[0], e), rot: 0 };
      }

      const fromState = sceneEndState(i - 1);
      const from: [number, number] = [fromState.x, fromState.y];
      const to: [number, number] = [item.x, item.y];
      const treatment = item.treatment ?? 'canvas_hop';
      const relation: SceneRelation = item.relation ?? 'continues';

      if (treatment === 'zoom_nest') {
        // DIVE with anticipation: a breath outward (classic animation antic),
        // then a straight log-zoom into the previous scene's focal point.
        const e = easeInOutCubic(t);
        const antic = 1 - 0.05 * Math.sin(Math.PI * clamp(t / 0.24, 0, 1));
        return {
          x: lerp(from[0], to[0], e),
          y: lerp(from[1], to[1], e),
          scale: Math.exp(lerp(Math.log(fromState.scale), Math.log(fits[i]), e)) * antic,
          rot: 0,
        };
      }

      if (relation === 'contrast') {
        // COMPARISON BEAT: fly out until both scenes share the frame, hold
        // the duo for a moment, then commit to the new scene.
        const duo = duoScale(i, 1.42);
        if (t < 0.42) {
          const e = easeInOutCubic(t / 0.42);
          return {
            x: lerp(from[0], duo.cx, e),
            y: lerp(from[1], duo.cy, e),
            scale: Math.exp(lerp(Math.log(fromState.scale), Math.log(duo.scale), e)),
            rot: 0,
          };
        }
        if (t < 0.6) {
          // Hold the comparison; lean a hair toward where we're going.
          const e = (t - 0.42) / 0.18;
          return {
            x: lerp(duo.cx, lerp(duo.cx, to[0], 0.08), e),
            y: lerp(duo.cy, lerp(duo.cy, to[1], 0.08), e),
            scale: duo.scale,
            rot: 0,
          };
        }
        const e = easeInOutCubic((t - 0.6) / 0.4);
        return {
          x: lerp(lerp(duo.cx, to[0], 0.08), to[0], e),
          y: lerp(lerp(duo.cy, to[1], 0.08), to[1], e),
          scale: Math.exp(lerp(Math.log(duo.scale), Math.log(fits[i]), e)),
          rot: 0,
        };
      }

      // ---- Standard curved flights, flavoured by relation ----
      const profile = (() => {
        if (relation === 'consequence') {
          return { ease: easeInOutQuint, dip: 1.18, roll: 3.2, bendScale: 1.0, overshoot: 0.045 };
        }
        if (relation === 'callback') {
          return { ease: easeInOutSine, dip: 2.0, roll: 1.6, bendScale: 1.5, overshoot: 0 };
        }
        if (treatment === 'pull_reveal' || relation === 'new_chapter') {
          return { ease: easeInOutCubic, dip: 1.78, roll: 1.2, bendScale: 1.1, overshoot: 0 };
        }
        return { ease: easeInOutCubic, dip: 1.3, roll: 2.2, bendScale: 1.0, overshoot: 0 };
      })();

      const e = profile.ease(t);
      const control = travelControl(from, to, i - 1, profile.bendScale);
      const [x, y] = qBezier(from, control, to, e);

      // Zoom dips through a scale that frames BOTH regions mid-flight — the
      // pull-back-reveal-then-push-in arc, in log space so it feels linear.
      const duo = duoScale(i, profile.dip);
      const straightMid = Math.exp(lerp(Math.log(fromState.scale), Math.log(fits[i]), 0.5));
      const dip = Math.log(Math.min(duo.scale, straightMid) / straightMid);
      let scale = Math.exp(lerp(Math.log(fromState.scale), Math.log(fits[i]), e) + dip * Math.sin(Math.PI * e));

      // Overshoot-settle: ride slightly past the framing then relax into it
      // (only for punchy arrivals — it reads as the camera "catching" itself).
      if (profile.overshoot > 0) {
        scale *= 1 + profile.overshoot * Math.sin(Math.PI * clamp((t - 0.7) / 0.3, 0, 1));
      }

      // Roll into the curve, level out on landing.
      const rot = profile.roll * Math.sign(hopBendFactor(i - 1)) * Math.sin(Math.PI * e) * (profile.bendScale >= 1 ? 1 : 0.6);

      return { x, y, scale, rot };
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
          rot: 0,
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
