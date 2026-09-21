import React, { createContext, useContext } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { cinematicProgress } from '@webprodigies/flute';
import { BASE_PERSPECTIVE } from '../flute/cinematicRig';
import { useMotionStyle, MotionStyle } from './styles';
import { clamp01, easeInOutSine } from './easing';
import { f30 } from './choreo';

/**
 * depthStage — the FLUTE RIG, generalised out of cinematic_card and handed to
 * the whole renderer.
 *
 * The flow card proved the effect the user wanted everywhere: content that
 * arrives out of the depth of the frame, resolving from soft to sharp as the
 * narrator reaches it, under a camera that dollies instead of zooming. This
 * module is that behaviour as a contract three layers deep:
 *
 *   1. {@link DepthCamera}  — the SCENE's camera: one perspective container
 *      per slide, an arrival out of z, and a slow dolly through the hold.
 *   2. {@link usePlane}     — a card's LAYERS: background, media, body,
 *      accents sit at different z, so the camera's move parallaxes them
 *      against each other instead of scaling one flat picture.
 *   3. {@link useDepthArrival} — an ELEMENT's own arrival: a bullet, a row, a
 *      heading comes forward onto the plane as its cue lands.
 *
 * ## The two laws it obeys
 *
 * **Never random.** The user rejected Flute shots applied for their own sake
 * ("it can destroy flow of video"): every move here is derived from what the
 * scene IS — its story relation, its length, its place in the run — and the
 * same storyboard always renders the same moves. There is no randomness in
 * this file.
 *
 * **Never inside the camera-scaled world.** A CSS filter inside the canvas
 * journey's world transform makes Chromium reuse a mid-flight raster and the
 * text lands soft. So blur is a CAPABILITY, not an assumption: the journey
 * provides `blur: false` and gets the same choreography in transforms alone,
 * while slides (screen space) get the full rig. Every arrival resolves to
 * EXACTLY zero blur, so a settled frame is always byte-sharp.
 */

export type DepthIntensity = 'off' | 'subtle' | 'full';

export interface DepthContext {
  /** How far the rig leans: off = the old flat motion, exactly. */
  intensity: DepthIntensity;
  /** May this host paint CSS blur? False inside the canvas world. */
  blur: boolean;
}

const DEFAULT: DepthContext = { intensity: 'subtle', blur: true };

const Ctx = createContext<DepthContext>(DEFAULT);

export const normalizeDepth = (value?: string | null): DepthIntensity =>
  value === 'off' || value === 'subtle' || value === 'full' ? value : 'subtle';

export const DepthProvider: React.FC<{
  intensity?: string | null;
  blur?: boolean;
  children: React.ReactNode;
}> = ({ intensity, blur, children }) => {
  const parent = useContext(Ctx);
  return (
    <Ctx.Provider
      value={{
        intensity: intensity === undefined ? parent.intensity : normalizeDepth(intensity),
        blur: blur === undefined ? parent.blur : blur,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const useDepth = (): DepthContext => useContext(Ctx);

/** How much of the full rig an intensity asks for (0 = nothing at all). */
export const depthGain = (intensity: DepthIntensity): number =>
  intensity === 'off' ? 0 : intensity === 'full' ? 1 : 0.55;

/**
 * The planes a card's parts sit on, in rig units at 1080p. Positive is nearer
 * the viewer. These are small on purpose: the depth has to be FELT under a
 * moving camera, not seen as a diorama.
 */
export const PLANE = {
  ambient: -320,
  media: -120,
  body: 0,
  accent: 90,
} as const;

export type PlaneName = keyof typeof PLANE;

/**
 * A layer's resting transform. Perspective-compensated, exactly like the flow
 * card's rest layout: a part at depth z is drawn at scale (P - z) / P, so with
 * the camera at rest it projects onto the same rectangle it would have had
 * with no depth at all. Nothing shifts, nothing crops; the depth only shows
 * itself when the camera moves.
 */
export const usePlane = (plane: PlaneName): React.CSSProperties => {
  const { intensity } = useDepth();
  const gain = depthGain(intensity);
  if (gain === 0 || plane === 'body') return {};
  const z = PLANE[plane] * gain;
  const k = (BASE_PERSPECTIVE - z) / BASE_PERSPECTIVE;

  return { transform: `translateZ(${z}px) scale(${k})`, transformStyle: 'preserve-3d' };
};

/** The shots a scene's camera can take. Chosen from the scene, never rolled. */
export type DepthShot = 'dolly_in' | 'dolly_out' | 'drift' | 'arc' | 'settle';

/**
 * Which shot this scene gets.
 *
 * The story relation decides it wherever the validator wrote one — the same
 * grammar the canvas journey flies by, so a slides video and a canvas video
 * move for the same reasons. Without a relation the index alternates a push
 * with a drift, which keeps a long run of plain cards from breathing in
 * lockstep.
 */
export const shotFor = (relation: string | undefined, index: number): DepthShot => {
  switch (relation) {
    case 'elaborates':
      return 'dolly_in';
    case 'callback':
      return 'dolly_out';
    case 'contrast':
      return 'arc';
    case 'consequence':
      return 'settle';
    case 'new_chapter':
      return 'drift';
    default:
      return index % 2 === 0 ? 'dolly_in' : 'drift';
  }
};

interface Pose {
  z: number;
  x: number;
  ry: number;
  rx: number;
  blur: number;
  opacity: number;
}

/**
 * The scene's pose at a frame: an arrival out of depth, then the shot's own
 * slow move through the hold.
 *
 * The arrival is Flute's own easing (`cinematicProgress`), which is what makes
 * this read as the same rig as the flow card rather than a second, similar
 * one. The hold moves on a sine so it has no visible start or stop, and it
 * completes by 88% of the scene — a transition must never begin on a frame
 * that is still travelling.
 */
export const poseAt = (
  frame: number,
  fps: number,
  seconds: number,
  shot: DepthShot,
  motion: MotionStyle,
  gain: number
): Pose => {
  const total = Math.max(1, Math.round(seconds * fps));
  const enterF = f30(fps, Math.max(8, Math.round(motion.baseF * 1.5)));
  const enter = cinematicProgress(clamp01(frame / enterF));
  const hold = easeInOutSine(clamp01((frame - enterF) / Math.max(1, total * 0.88 - enterF)));

  // A style that snaps arrives from closer and settles sooner; one that
  // breathes comes from further back.
  const reach = (0.6 + motion.baseF / 26) * gain;

  const arrive = 1 - enter;
  const pose: Pose = {
    z: -260 * reach * arrive,
    x: 0,
    ry: 0,
    rx: 2.2 * reach * arrive,
    blur: 7 * reach * arrive,
    opacity: clamp01(frame / Math.max(1, enterF * 0.55)),
  };

  switch (shot) {
    case 'dolly_in':
      pose.z += 120 * gain * hold;
      break;
    case 'dolly_out':
      pose.z += 130 * gain * (1 - hold) - 130 * gain;
      break;
    case 'drift':
      pose.x += 26 * gain * (hold - 0.5);
      pose.ry += 1.6 * gain * (0.5 - hold);
      pose.z += 60 * gain * hold;
      break;
    case 'arc':
      pose.ry += 3.2 * gain * (0.5 - hold);
      pose.z += 80 * gain * hold;
      break;
    case 'settle':
      // Lands with a touch of overshoot, then holds almost still: the beat
      // after a consequence should feel arrived at, not restless.
      pose.z += 150 * gain * Math.sin(Math.PI * Math.min(1, hold * 1.4)) * 0.4 + 40 * gain * hold;
      break;
  }

  return pose;
};

/**
 * The scene camera. One perspective container per slide; everything inside it
 * shares the same lens, which is what lets the planes parallax.
 *
 * Replaces the old flat `scale()` entrance and mid-hold push — at
 * `intensity: 'off'` it reproduces them, so a video can always be rendered the
 * way it was before.
 */
export const DepthCamera: React.FC<{
  seconds: number;
  relation?: string;
  index?: number;
  children: React.ReactNode;
}> = ({ seconds, relation, index = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const motion = useMotionStyle();
  const { intensity, blur: mayBlur } = useDepth();
  const gain = depthGain(intensity);

  // The flat fallback: the entrance and mid-hold push this used to be.
  if (gain === 0) {
    const r = motion.baseF / 13;
    const p = clamp01(frame / f30(fps, Math.round(18 * r)));
    const total = Math.max(1, Math.round(seconds * fps));
    const push = seconds > 8 ? easeInOutSine(clamp01((frame - total * 0.55) / (total * 0.3))) : 0;
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: clamp01(frame / f30(fps, Math.round(12 * r))),
          transform: `scale(${(0.986 + 0.014 * p) * (1 + 0.035 * push)})`,
        }}
      >
        {children}
      </div>
    );
  }

  const pose = poseAt(frame, fps, seconds, shotFor(relation, index), motion, gain);
  // The lens scales with the frame so a 720p render frames identically.
  const P = BASE_PERSPECTIVE * (height / 1080);
  const soft = mayBlur ? Math.round(pose.blur * 100) / 100 : 0;

  return (
    <div style={{ position: 'absolute', inset: 0, perspective: `${P}px`, perspectiveOrigin: '50% 50%' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformStyle: 'preserve-3d',
          transform:
            `translate3d(${pose.x.toFixed(2)}px, 0px, ${pose.z.toFixed(2)}px) ` +
            `rotateX(${pose.rx.toFixed(2)}deg) rotateY(${pose.ry.toFixed(2)}deg)`,
          opacity: pose.opacity < 1 ? pose.opacity : undefined,
          // Resolves to exactly 0: a settled frame is never filtered.
          filter: soft > 0.05 ? `blur(${soft}px)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * An element's own arrival, for the shared pieces every card is built from
 * (a bullet, a row, a heading, a picture).
 *
 * `enter` is the card's existing 0..1 progress for that element — this does
 * not re-time anything, it gives the same beat a third dimension. Cards keep
 * their own stagger, their own springs and their own cue words.
 */
export const useDepthArrival = (
  enter: number,
  options: { z?: number; blur?: number } = {}
): React.CSSProperties => {
  const { intensity, blur: mayBlur } = useDepth();
  const gain = depthGain(intensity);
  if (gain === 0) return {};

  const t = 1 - clamp01(enter);
  if (t <= 0.001) return {};
  const z = (options.z ?? -150) * gain * t;
  const soft = mayBlur ? (options.blur ?? 5) * gain * t : 0;

  return {
    transform: `translateZ(${z.toFixed(1)}px)`,
    filter: soft > 0.05 ? `blur(${soft.toFixed(2)}px)` : undefined,
  };
};

/**
 * The same arrival as {@link useDepthArrival}, handed back as a pure function
 * so a card can call it inside a `.map()` — every card staggers its own rows,
 * and a hook cannot run in a loop.
 *
 * Returns the style to spread onto the row: the card's own transform with the
 * z appended, plus the blur that resolves to nothing.
 */
export const useDepthRows = (
  options: { z?: number; blur?: number } = {}
): ((enter: number, transform?: string) => React.CSSProperties) => {
  const { intensity, blur: mayBlur } = useDepth();
  const gain = depthGain(intensity);

  return (enter: number, transform?: string) => {
    if (gain === 0) return transform ? { transform } : {};
    const t = 1 - clamp01(enter);
    if (t <= 0.001) return transform ? { transform } : {};
    const z = (options.z ?? -150) * gain * t;
    const soft = mayBlur ? (options.blur ?? 4.5) * gain * t : 0;
    const move = `translateZ(${z.toFixed(1)}px)`;

    return {
      transform: transform ? `${transform} ${move}` : move,
      filter: soft > 0.05 ? `blur(${soft.toFixed(2)}px)` : undefined,
    };
  };
};

/**
 * Merge a depth arrival into a transform a card has already written. The
 * card's own `translateY(...)` stays first, so the rise it was designed with
 * still reads; the z is appended on the same element.
 */
export const withDepth = (transform: string | undefined, depth: React.CSSProperties): React.CSSProperties => {
  if (!depth.transform) return transform ? { transform } : {};

  return {
    transform: transform ? `${transform} ${depth.transform}` : depth.transform,
    filter: depth.filter,
  };
};
