import React from 'react';
import { useVideoConfig, spring } from 'remotion';
import { useSceneClock } from '../canvas/SceneClock';
import { useTheme } from '../theme';

/** Normalize for highlight matching (case/punctuation-insensitive). */
const norm = (w: string): string => w.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Kinetic typography: reveals a heading word-by-word with a staggered spring,
 * each word rising into place. Gives headings a designed, animated feel.
 * Uses the scene clock so canvas-journey stations animate on camera arrival.
 *
 * `highlight` paints the given words (verbatim heading words, matched loosely)
 * with the theme's accent gradient — the scene stylist uses it to make the
 * one word that matters carry the line. Gradient text is background-clip
 * only: no filters, so it stays camera-safe inside scaled canvas regions.
 */
export const KineticText: React.FC<{
  text: string;
  style?: React.CSSProperties;
  delay?: number;
  stagger?: number;
  highlight?: string[];
}> = ({ text, style, delay = 0, stagger, highlight }) => {
  const { frame } = useSceneClock();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const words = (text || '').split(' ').filter(Boolean);
  const step = stagger ?? Math.round(fps * 0.07);
  const marked = new Set((highlight ?? []).map(norm).filter(Boolean));

  return (
    <span style={style}>
      {words.map((word, i) => {
        const local = frame - delay - i * step;
        const e = spring({ frame: local, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.45) });
        const hot = marked.size > 0 && marked.has(norm(word));
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: '0.28em',
              opacity: e,
              transform: `translateY(${(1 - e) * 20}px)`,
              ...(hot
                ? {
                    backgroundImage: `linear-gradient(92deg, ${theme.accent}, ${theme.accent2})`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }
                : null),
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
};
