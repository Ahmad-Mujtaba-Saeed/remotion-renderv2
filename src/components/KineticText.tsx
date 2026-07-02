import React from 'react';
import { useVideoConfig, spring } from 'remotion';
import { useSceneClock } from '../canvas/SceneClock';

/**
 * Kinetic typography: reveals a heading word-by-word with a staggered spring,
 * each word rising into place. Gives headings a designed, animated feel.
 * Uses the scene clock so canvas-journey stations animate on camera arrival.
 */
export const KineticText: React.FC<{
  text: string;
  style?: React.CSSProperties;
  delay?: number;
  stagger?: number;
}> = ({ text, style, delay = 0, stagger }) => {
  const { frame } = useSceneClock();
  const { fps } = useVideoConfig();
  const words = (text || '').split(' ').filter(Boolean);
  const step = stagger ?? Math.round(fps * 0.07);

  return (
    <span style={style}>
      {words.map((word, i) => {
        const local = frame - delay - i * step;
        const e = spring({ frame: local, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.45) });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: '0.28em',
              opacity: e,
              transform: `translateY(${(1 - e) * 20}px)`,
              willChange: 'transform, opacity',
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
};
