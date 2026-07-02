import React from 'react';
import { useVideoConfig, spring, interpolate } from 'remotion';
import { Slot } from '../types';
import { useTheme } from '../theme';
import { KineticText } from './KineticText';
import { useScaleUnit } from '../responsive';
import { useSceneClock } from '../canvas/SceneClock';

/**
 * Heading + bullet list rendered on a semi-transparent themed panel (so the
 * ambient background shows through). Bullets reveal one at a time, evenly
 * spread across the scene's focus window. All sizes scale with the frame's
 * short side so 9:16 renders type at the same visual weight as 16:9.
 */
export const TextBlock: React.FC<{ slot: Slot; transparent?: boolean }> = ({ slot, transparent }) => {
  const theme = useTheme();
  const { fps } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const u = useScaleUnit();
  const bullets = slot.bullets ?? [];
  const sequential = (slot.reveal ?? 'sequential') === 'sequential';

  const headingIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });

  const startAt = Math.round(durationInFrames * 0.12);
  const endAt = Math.round(durationInFrames * 0.92);
  const step = bullets.length > 0 ? (endAt - startAt) / bullets.length : 0;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '8%',
        boxSizing: 'border-box',
        background: transparent ? 'transparent' : theme.panel,
        backdropFilter: transparent ? undefined : 'blur(6px)',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: theme.text,
      }}
    >
      {slot.heading ? (
        <div style={{ opacity: headingIn, transform: `translateY(${interpolate(headingIn, [0, 1], [22 * u, 0])}px)` }}>
          <div
            style={{
              width: 64 * u,
              height: 6 * u,
              borderRadius: 999,
              marginBottom: 22 * u,
              background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`,
            }}
          />
          <h1
            style={{
              fontSize: 66 * u,
              margin: `0 0 ${36 * u}px 0`,
              fontWeight: 800,
              lineHeight: 1.05,
              color: theme.text,
            }}
          >
            <KineticText text={slot.heading} delay={Math.round(fps * 0.15)} />
          </h1>
        </div>
      ) : null}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {bullets.map((bullet, i) => {
          const appearFrame = sequential ? startAt + step * i : startAt;
          const local = frame - appearFrame;
          const enter = spring({ frame: local, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.5) });
          const opacity = sequential ? enter : 1;
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 20 * u,
                fontSize: 46 * u,
                lineHeight: 1.32,
                marginBottom: 26 * u,
                opacity,
                transform: `translateX(${interpolate(opacity, [0, 1], [-34 * u, 0])}px)`,
              }}
            >
              <span
                style={{
                  marginTop: 14 * u,
                  width: 16 * u,
                  height: 16 * u,
                  borderRadius: 4 * u,
                  flexShrink: 0,
                  background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
                }}
              />
              <span>{bullet}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
