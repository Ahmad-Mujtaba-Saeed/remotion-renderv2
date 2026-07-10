import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { CameraMove as CameraMoveType } from '../types';

/**
 * Wraps a media element and applies a slow, continuous camera move across the
 * full duration of the current Sequence so nothing is ever a dead static frame.
 * The slight base over-scale (>=1.04) hides edges introduced by panning.
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

  const transform = transformFor(move, p);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', transform, transformOrigin: 'center center' }}>
        {children}
      </div>
    </div>
  );
};

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

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
