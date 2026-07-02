import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { useTheme } from '../theme';

/**
 * Decorative, always-moving motion-graphics layer: a few large blurred orbs
 * and a slow rotating accent ring. Subtle on purpose — adds life behind the
 * content without competing with it. Driven purely by the frame so it renders
 * deterministically.
 */
const Orb: React.FC<{ color: string; size: number; cx: number; cy: number; ax: number; ay: number; speed: number; phase: number }> = ({
  color,
  size,
  cx,
  cy,
  ax,
  ay,
  speed,
  phase,
}) => {
  const frame = useCurrentFrame();
  const x = cx + Math.sin(frame / speed + phase) * ax;
  const y = cy + Math.cos(frame / (speed * 1.2) + phase) * ay;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: '50%',
        background: `radial-gradient(circle at 50% 50%, ${color}, transparent 68%)`,
        filter: 'blur(40px)',
        opacity: 0.5,
      }}
    />
  );
};

export const MotionGraphics: React.FC = () => {
  const theme = useTheme();
  const frame = useCurrentFrame();
  const ringRotate = (frame / 6) % 360;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
      <Orb color={theme.accent} size={520} cx={22} cy={28} ax={6} ay={5} speed={70} phase={0} />
      <Orb color={theme.accent2} size={460} cx={78} cy={72} ax={7} ay={6} speed={85} phase={2} />
      <Orb color={theme.accent} size={360} cx={62} cy={20} ax={5} ay={7} speed={100} phase={4} />

      <div
        style={{
          position: 'absolute',
          right: '-8%',
          top: '-12%',
          width: '46%',
          height: '70%',
          border: `2px solid ${theme.accent2}1f`,
          borderRadius: '50%',
          transform: `rotate(${ringRotate}deg)`,
          maskImage: 'linear-gradient(120deg, black, transparent 60%)',
          WebkitMaskImage: 'linear-gradient(120deg, black, transparent 60%)',
        }}
      />
    </AbsoluteFill>
  );
};
