import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { CameraMove as CameraMoveType } from '../types';
import { BASE_PERSPECTIVE } from '../flute/cinematicRig';
import { useDepth, depthGain } from '../motion/depthStage';

/**
 * Wraps a media element and applies a slow, continuous camera move across the
 * full duration of the current Sequence so nothing is ever a dead static frame.
 * The slight base over-scale (>=1.04) hides edges introduced by panning.
 *
 * With the depth rig on (motion/depthStage) the zoom moves become real
 * DOLLIES: the picture rides its own short perspective track, so a push-in
 * gains the parallax of a lens moving toward a subject rather than a
 * rectangle being scaled. The pans lean a degree into their direction for the
 * same reason. Everything is derived from the move the storyboard already
 * chose — no move is invented here, and `motion_depth: off` restores the
 * exact 2D transforms.
 */
export const CameraMove: React.FC<{
  move?: CameraMoveType;
  children: React.ReactNode;
}> = ({ move = 'ken_burns', children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const gain = depthGain(useDepth().intensity);
  const dolly = gain > 0 ? dollyFor(move, p, gain) : null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        perspective: dolly ? `${BASE_PERSPECTIVE}px` : undefined,
        perspectiveOrigin: dolly ? '50% 50%' : undefined,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: dolly ?? transformFor(move, p),
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * The same move as a track in z.
 *
 * A scale of s and a dolly to z = P(1 - 1/s) frame identically at the centre;
 * the difference is at the edges, where the dolly gives the perspective shift
 * a real lens would. The base over-scale that hides pan edges is kept as a
 * scale, because it is a crop, not a move.
 */
const dollyFor = (move: CameraMoveType, p: number, gain: number): string | null => {
  const zFor = (scale: number) => BASE_PERSPECTIVE * (1 - 1 / scale);
  const lean = (deg: number) => (deg * gain).toFixed(2);

  switch (move) {
    case 'slow_zoom_in':
      return `translateZ(${zFor(lerp(1.04, 1.16, p)).toFixed(1)}px)`;
    case 'slow_zoom_out':
      return `translateZ(${zFor(lerp(1.16, 1.04, p)).toFixed(1)}px)`;
    case 'push_in':
      return `translateZ(${zFor(lerp(1.05, 1.32, p)).toFixed(1)}px)`;
    case 'pull_out':
      return `translateZ(${zFor(lerp(1.32, 1.05, p)).toFixed(1)}px)`;
    case 'pan_left':
      return `scale(1.14) translateX(${lerp(4, -4, p)}%) rotateY(${lean(lerp(-1.2, 1.2, p))}deg)`;
    case 'pan_right':
      return `scale(1.14) translateX(${lerp(-4, 4, p)}%) rotateY(${lean(lerp(1.2, -1.2, p))}deg)`;
    default:
      // ken_burns, the pans up/down and static keep their authored transform:
      // a vertical drift gains nothing from a lens, and static must stay
      // static.
      return null;
  }
};

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clampP = (p: number) => Math.max(0, Math.min(1, p));

function transformFor(move: CameraMoveType, p: number): string {
  switch (move) {
    case 'static':
      return 'scale(1.0)';
    case 'slow_zoom_in':
      return `scale(${lerp(1.04, 1.16, p)})`;
    case 'slow_zoom_out':
      return `scale(${lerp(1.16, 1.04, p)})`;
    case 'push_in':
      return `scale(${lerp(1.05, 1.32, p)})`;
    case 'pull_out':
      return `scale(${lerp(1.32, 1.05, p)})`;
    case 'pan_left':
      return `scale(1.14) translateX(${lerp(4, -4, p)}%)`;
    case 'pan_right':
      return `scale(1.14) translateX(${lerp(-4, 4, p)}%)`;
    case 'pan_up':
      return `scale(1.14) translateY(${lerp(4, -4, p)}%)`;
    case 'pan_down':
      return `scale(1.14) translateY(${lerp(-4, 4, p)}%)`;
    case 'tilt_zoom':
      return `scale(${lerp(1.06, 1.18, p)}) rotate(${lerp(-1.4, 1.4, p)}deg)`;
    case 'zoom_in_snap': {
      // The attention snap: a fast easeOut zoom over the first 30% of the
      // scene, then hold — for the reveal the narration lands on.
      const s = Math.min(1, p / 0.3);
      const eased = 1 - Math.pow(1 - s, 3);
      return `scale(${lerp(1.06, 1.22, eased)})`;
    }
    case 'pan_up_zoom_in':
      // Climb + push — made for tall subjects and 9:16 portrait frames.
      return `scale(${lerp(1.1, 1.22, p)}) translateY(${lerp(4, -4, p)}%)`;
    case 'arc_pan': {
      // A filmic arced move: the frame pans left→right while bowing gently
      // through a shallow parabola, so the drift traces a curve instead of a
      // straight line. Zoom holds — the arc is the whole gesture.
      const tx = lerp(-4.5, 4.5, p);
      const ty = -2.4 * Math.sin(Math.PI * p); // rise into the middle, settle level
      return `scale(1.13) translate(${tx}%, ${ty}%)`;
    }
    case 'whip_settle': {
      // A fast lateral throw that overshoots its mark and catches: 80% of the
      // travel lands in the first third on a hard easeOut, then a sin² settle
      // eases the last few percent back — the camera "arrives with weight".
      const lead = 1 - Math.pow(1 - Math.min(1, p / 0.34), 3);
      const overshoot = 1.6 * Math.sin(Math.PI * clampP((p - 0.34) / 0.28)) ** 2;
      const tx = lerp(-6, 5, lead) + overshoot; // past 5%, then eased back
      return `scale(1.12) translateX(${tx}%)`;
    }
    case 'pedestal_up':
      // A true vertical dolly: the frame RISES while pushing in a touch, the
      // way a camera on a column reveals a tall subject top-down. Distinct from
      // pan_up (no push) — the coupled zoom is what sells the climb.
      return `scale(${lerp(1.08, 1.2, p)}) translateY(${lerp(6, -3, p)}%)`;
    case 'pedestal_down':
      // The descent: sink while easing OUT, giving a subject room as we drop.
      return `scale(${lerp(1.2, 1.08, p)}) translateY(${lerp(-6, 3, p)}%)`;
    case 'hover': {
      // Two full breaths per scene, ±1.5% around a fixed over-scale: motion
      // that never leaves the frame, for diagrams/maps that must stay legible.
      const s = 1.08 + 0.015 * Math.sin(p * Math.PI * 4);
      return `scale(${s})`;
    }
    case 'ken_burns_reverse':
      // The opposite diagonal of ken_burns, so photo sequences can alternate.
      return `scale(${lerp(1.2, 1.08, p)}) translate(${lerp(3, -3, p)}%, ${lerp(-2, 2, p)}%)`;
    case 'ken_burns':
    default:
      // Diagonal drift + gentle zoom — the classic documentary move.
      return `scale(${lerp(1.08, 1.2, p)}) translate(${lerp(-3, 3, p)}%, ${lerp(2, -2, p)}%)`;
  }
}
