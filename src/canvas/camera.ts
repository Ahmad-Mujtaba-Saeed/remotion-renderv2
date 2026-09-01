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
  /**
   * Same progress but through the flight's OWN easing curve, so anything
   * synced to it (the connector draw-on) moves at the camera's actual pace
   * instead of falling behind mid-flight.
   */
  travelProgressEased: (sceneIndex: number, frame: number) => number;
  /** 0..1 how focused station i is (drives glow/dim on cards). */
  focus: (sceneIndex: number, frame: number) => number;
}

/** Relations that earn a longer, more expressive travel window. */
const isLongFlight = (item: CanvasItem): boolean =>
  (item.treatment ?? '') !== 'same_frame' &&
  ((item.treatment ?? '') === 'pull_reveal' ||
    ['callback', 'new_chapter', 'contrast'].includes(item.relation ?? ''));

/**
 * A scene that holds the frame: the validator has already placed it exactly
 * where its predecessor sat, so there is nowhere to fly. Its "travel" window
 * is only the crossfade between the two cards.
 */
const isHold = (item: CanvasItem | undefined): boolean => (item?.treatment ?? '') === 'same_frame';

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
    // kinetic_break SMASHES in: the flight is deliberately shorter than any
    // ordinary hop so the arrival lands like a cut, not a glide.
    const smash = (items[i].treatment ?? '') === 'kinetic_break';
    const travel =
      i === 0
        ? Math.min(Math.round(fps * 1.0), Math.round(frames * 0.4))
        : isHold(items[i])
          ? // Not a flight — a cut. Long enough for the two cards to change
            // over cleanly, short enough that it reads as an edit, not a
            // dissolve.
            clamp(Math.round(frames * 0.08), Math.round(fps * 0.3), Math.round(fps * 0.55))
          : smash
            ? clamp(Math.round(frames * 0.14), Math.round(fps * 0.5), Math.round(fps * 0.9))
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

  // Flight profile for the hop INTO scene i, flavoured by its relation.
  // Dips are shallow on purpose: the journey should read as "one scene at a
  // time", never as a pull-back that reveals the whole map.
  const profileFor = (i: number) => {
    const item = items[i];
    const relation: SceneRelation = item.relation ?? 'continues';
    const treatment = item.treatment ?? 'canvas_hop';
    // Treatment outranks relation: a kinetic_break must smash in no matter
    // what the story relation says. Near-straight path, no roll, hard quint
    // ease, and an overshoot so the landing visibly "catches" itself.
    if (treatment === 'kinetic_break') {
      return { ease: easeInOutQuint, dip: 1.0, roll: 0, bendScale: 0.5, overshoot: 0.045 };
    }
    if (relation === 'consequence') {
      return { ease: easeInOutQuint, dip: 1.1, roll: 3.2, bendScale: 1.0, overshoot: 0.03 };
    }
    if (relation === 'callback') {
      return { ease: easeInOutSine, dip: 1.5, roll: 1.6, bendScale: 1.5, overshoot: 0 };
    }
    if (treatment === 'pull_reveal' || relation === 'new_chapter') {
      return { ease: easeInOutCubic, dip: 1.42, roll: 1.2, bendScale: 1.1, overshoot: 0 };
    }
    if (relation === 'elaborates') {
      // The lean-in: a tight, intimate hop with barely any pull-back — the
      // camera moves closer to the thought, it doesn't survey. (zoom_nest
      // elaborations never reach here; the dive has its own branch.)
      return { ease: easeInOutCubic, dip: 1.05, roll: 1.4, bendScale: 0.7, overshoot: 0 };
    }
    // "opening" needs no profile: scene 0 is the cold open, handled in at().
    return { ease: easeInOutCubic, dip: 1.16, roll: 2.2, bendScale: 1.0, overshoot: 0 };
  };

  // ---- Hold moves (per-scene seeded variation so no two feel identical) ----
  // CONTINUITY CONTRACT: every hold move starts EXACTLY at the flight's
  // landing framing (item center, fit scale) with zero velocity. Flights land
  // at that same state with zero velocity too, so arrival→hold is seamless —
  // the old `drift` started offset from center at a different zoom, which
  // read as a visible snap ("camera shake") the instant the flight ended.
  const holdPose = (i: number, h: number): CamState => {
    const item = items[i];
    const move = item.hold_move ?? 'breathe';
    const t = clamp(h, 0, 1);
    // Smooth 0→1 ramp with zero slope at both ends.
    const s = easeInOutSine(t);

    if ((item.treatment ?? '') === 'overlay_focus') {
      // GUIDED SURVEY: the camera lands, rests, pushes into the region's
      // focal point (seeded third-point — off-center so the push reads as
      // "look HERE"), then eases back out to the full frame. Every segment
      // is sine-eased, so the boundaries — including the hand-off into the
      // next flight at t=1 — have zero velocity.
      const fx = item.x + item.w * 0.16 * (seeded(i, 21) > 0.5 ? 1 : -1);
      const fy = item.y + item.h * 0.14 * (seeded(i, 22) > 0.5 ? 1 : -1);
      const push = t < 0.3 ? 0 : t < 0.65 ? easeInOutSine((t - 0.3) / 0.35) : 1 - easeInOutSine((t - 0.65) / 0.35);
      return {
        x: lerp(item.x, fx, push),
        y: lerp(item.y, fy, push),
        scale: fits[i] * (1 + 0.18 * push),
        rot: 0,
      };
    }

    if (move === 'push_in') {
      const target = 0.12 + seeded(i, 11) * 0.06;
      return { x: item.x, y: item.y, scale: fits[i] * (1 + target * s), rot: 0 };
    }
    if (move === 'drift') {
      const sx = seeded(i, 12) > 0.5 ? 1 : -1;
      const sy = seeded(i, 13) > 0.5 ? 1 : -1;
      const dx = item.w * 0.05 * sx;
      const dy = item.h * 0.04 * sy;
      return {
        x: item.x + dx * s,
        y: item.y + dy * s,
        scale: fits[i] * (1 + (0.035 + seeded(i, 14) * 0.025) * s),
        rot: 0,
      };
    }
    if (move === 'orbit') {
      // A gentle elliptical sway that leaves home and returns to it — sin²
      // envelope keeps velocity zero at both ends of the hold.
      const env = Math.sin(Math.PI * t) ** 2;
      const theta = seeded(i, 16) * Math.PI * 2 + t * Math.PI * 0.8;
      return {
        x: item.x + item.w * 0.04 * env * Math.cos(theta),
        y: item.y + item.h * 0.032 * env * Math.sin(theta),
        scale: fits[i] * (1 + 0.03 * env),
        rot: 0,
      };
    }
    if (move === 'rise') {
      // Slow upward reveal with a light push — feels like standing taller.
      return {
        x: item.x,
        y: item.y - item.h * (0.04 + seeded(i, 17) * 0.02) * s,
        scale: fits[i] * (1 + 0.05 * s),
        rot: 0,
      };
    }
    if (move === 'sway') {
      // Lateral glide across a wide visual — a panorama read, no zoom.
      const sx = seeded(i, 18) > 0.5 ? 1 : -1;
      return {
        x: item.x + item.w * 0.055 * sx * s,
        y: item.y,
        scale: fits[i] * (1 + 0.02 * s),
        rot: 0,
      };
    }
    if (move === 'settle_back') {
      // The exhale: ease slightly AWAY so a big statement gets air around it.
      return { x: item.x, y: item.y, scale: fits[i] * (1 - 0.06 * s), rot: 0 };
    }
    // breathe
    const amp = 0.045 + seeded(i, 15) * 0.025;
    return { x: item.x, y: item.y, scale: fits[i] * (1 + amp * s), rot: 0 };
  };

  /**
   * Midpoint re-frame (copilot.md §2.8): a hold longer than 8 seconds earns a
   * SECOND framing — at 55% of the hold the camera eases toward a seeded
   * interior point and tightens ~6.5%, the way an editor cuts to a closer
   * angle, except nothing cuts. The envelope completes by 85% and is flat
   * afterwards, so the hand-off into the next flight still starts from zero
   * velocity — the continuity contract above stays intact. overlay_focus
   * scenes are exempt: their whole hold IS a guided survey already.
   */
  const REFRAME_HOLD_SECONDS = 8;

  const holdFramesOf = (i: number): number => Math.max(1, windows[i].frames - windows[i].travel);

  const holdState = (i: number, h: number, holdFrames = 0): CamState => {
    const base = holdPose(i, h);
    const item = items[i];
    if (holdFrames <= REFRAME_HOLD_SECONDS * fps || (item.treatment ?? '') === 'overlay_focus') {
      return base;
    }
    const t = clamp(h, 0, 1);
    const s2 = easeInOutSine(clamp((t - 0.55) / 0.3, 0, 1));
    if (s2 <= 0) {
      return base;
    }
    return {
      x: base.x + item.w * 0.06 * (seeded(i, 31) > 0.5 ? 1 : -1) * s2,
      y: base.y + item.h * 0.05 * (seeded(i, 32) > 0.5 ? 1 : -1) * s2,
      scale: base.scale * (1 + 0.065 * s2),
      rot: base.rot,
    };
  };

  /** Where the camera is at the END of scene i (start point of the next flight). */
  const sceneEndState = (i: number): CamState => holdState(i, 1, holdFramesOf(i));

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
      const treatment = item.treatment ?? 'same_frame';
      const relation: SceneRelation = item.relation ?? 'continues';

      if (treatment === 'same_frame') {
        // THE QUIET CUT. Both regions occupy the same world box, so there is
        // no journey to make — but the previous scene's hold move will have
        // drifted the camera a little off its framing, and starting the new
        // card from that drifted pose would read as a nudge. Ease back to the
        // clean framing over the changeover and stop. No bezier, no dip, and
        // above all no roll: a cut that tilts the horizon is a flight.
        const e = easeInOutSine(t);
        return {
          x: lerp(fromState.x, item.x, e),
          y: lerp(fromState.y, item.y, e),
          scale: Math.exp(lerp(Math.log(fromState.scale), Math.log(fits[i]), e)),
          rot: 0,
        };
      }

      if (treatment === 'zoom_nest') {
        // DIVE with anticipation: a breath outward (classic animation antic),
        // then a straight log-zoom into the previous scene's focal point.
        // The antic rides a smoothstep so it eases in from zero velocity —
        // no kick the instant the dive starts.
        const e = easeInOutCubic(t);
        const au = clamp(t / 0.24, 0, 1);
        const antic = 1 - 0.04 * Math.sin(Math.PI * (au * au * (3 - 2 * au)));
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
          // Hold the comparison; lean a hair toward where we're going. The
          // lean is eased so both ends of this plateau have zero velocity —
          // segment boundaries must never kick.
          const e = easeInOutSine((t - 0.42) / 0.18);
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
      const profile = profileFor(i);

      const e = profile.ease(t);
      const control = travelControl(from, to, i - 1, profile.bendScale);
      const [x, y] = qBezier(from, control, to, e);

      // Zoom dips through a scale that frames BOTH regions mid-flight — the
      // pull-back-reveal-then-push-in arc, in log space so it feels linear.
      const duo = duoScale(i, profile.dip);
      const straightMid = Math.exp(lerp(Math.log(fromState.scale), Math.log(fits[i]), 0.5));
      const dip = Math.log(Math.min(duo.scale, straightMid) / straightMid);
      let scale = Math.exp(lerp(Math.log(fromState.scale), Math.log(fits[i]), e) + dip * Math.sin(Math.PI * e));

      // Altitude floor: however far apart the scenes sit, the camera never
      // recedes into a map view — mid-flight it cruises, it doesn't survey.
      scale = Math.max(scale, Math.min(fromState.scale, fits[i]) * 0.42);

      // Overshoot-settle: ride slightly past the framing then relax into it
      // (only for punchy arrivals — it reads as the camera "catching" itself).
      // sin² keeps the pulse velocity-continuous at both ends, so the settle
      // is a breath, never a jolt.
      if (profile.overshoot > 0) {
        scale *= 1 + profile.overshoot * Math.sin(Math.PI * clamp((t - 0.7) / 0.3, 0, 1)) ** 2;
      }

      // Roll into the curve, level out on landing.
      const rot = profile.roll * Math.sign(hopBendFactor(i - 1)) * Math.sin(Math.PI * e) * (profile.bendScale >= 1 ? 1 : 0.6);

      return { x, y, scale, rot };
    }

    // ---- Phase 2: hold ----
    // The video ends ON the last scene — no closing pull-back to an overview
    // of the whole journey; each scene lives alone in its stretch of space.
    const holdFrames = Math.max(1, w.frames - w.travel);
    const h = (local - w.travel) / holdFrames;

    return holdState(i, h, holdFrames);
  };

  const travelProgress = (sceneIndex: number, frame: number): number => {
    const w = windows[sceneIndex];
    if (!w || w.travel <= 0) return frame >= (w?.start ?? 0) ? 1 : 0;
    return clamp((frame - w.start) / w.travel, 0, 1);
  };

  const travelProgressEased = (sceneIndex: number, frame: number): number => {
    const t = travelProgress(sceneIndex, frame);
    if (sceneIndex <= 0 || t <= 0 || t >= 1) return t;
    const item = items[sceneIndex];
    if ((item.treatment ?? '') === 'zoom_nest' || (item.relation ?? '') === 'contrast') {
      return easeInOutCubic(t);
    }
    return profileFor(sceneIndex).ease(t);
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

  return { windows, totalFrames, at, travelProgress, travelProgressEased, focus };
};
