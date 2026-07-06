import React from 'react';
import { useVideoConfig, spring, interpolate } from 'remotion';
import { Slot } from '../types';
import { useTheme } from '../theme';
import { KineticText } from './KineticText';
import { useScaleUnit } from '../responsive';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useRegionStyle } from '../canvas/RegionStyle';

/** Deterministic per-scene variation seed (scene windows differ per scene). */
const seeded = (n: number, salt: number): number => {
  const v = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * Heading + bullet list. Three surfaces:
 *  - slides mode: the classic semi-transparent themed panel;
 *  - frameless canvas regions: a SOFT PLATE — a subtle translucent backdrop
 *    with a hairline border and an accent corner glow, so copy never floats
 *    naked on the world canvas but the look stays collage-soft (no glass
 *    blur: backdrop-filter would rasterize the region and soften the text);
 *  - `compact` (banners): heading + bullets as inline chips in a strip.
 * Bullets reveal one at a time on soft pill rows, evenly spread across the
 * scene's focus window; entrance direction varies per scene so long videos
 * don't repeat one move. All sizes scale with the frame's short side.
 */
export const TextBlock: React.FC<{ slot: Slot; transparent?: boolean; compact?: boolean }> = ({
  slot,
  transparent,
  compact,
}) => {
  const theme = useTheme();
  const { fps } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const win = useSceneWindow();
  const u = useScaleUnit();
  const region = useRegionStyle();
  const bullets = slot.bullets ?? [];
  const sequential = (slot.reveal ?? 'sequential') === 'sequential';
  // Frameless canvas regions get the soft plate instead of the slides panel.
  const plated = !transparent && !compact && region.frameless;
  const bare = transparent || region.frameless;

  const seed = (win?.start ?? 0) + bullets.length * 13;
  const fromLeft = seeded(seed, 3) > 0.35; // most scenes slide in from the left
  const accentCornerRight = seeded(seed, 4) > 0.5;

  const headingIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.6) });

  const startAt = Math.round(durationInFrames * 0.12);
  const endAt = Math.round(durationInFrames * 0.92);
  const step = bullets.length > 0 ? (endAt - startAt) / bullets.length : 0;

  // ---- Compact banner strip: heading + bullets as inline chips -------------
  if (compact) {
    return (
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16 * u,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: theme.text,
        }}
      >
        {slot.heading ? (
          <div style={{ opacity: headingIn, display: 'flex', alignItems: 'center', gap: 20 * u }}>
            <div
              style={{
                width: 10 * u,
                height: 42 * u,
                borderRadius: 999,
                background: `linear-gradient(180deg, ${theme.accent}, ${theme.accent2})`,
                flexShrink: 0,
              }}
            />
            <h1 style={{ fontSize: 52 * u, margin: 0, fontWeight: 800, lineHeight: 1.05 }}>
              <KineticText text={slot.heading} delay={Math.round(fps * 0.15)} />
            </h1>
          </div>
        ) : null}
        {bullets.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 * u }}>
            {bullets.slice(0, 4).map((bullet, i) => {
              const appearFrame = sequential ? startAt + step * i : startAt;
              const enter = spring({
                frame: frame - appearFrame,
                fps,
                config: { damping: 200 },
                durationInFrames: Math.round(fps * 0.45),
              });
              return (
                <div
                  key={i}
                  style={{
                    padding: `${10 * u}px ${22 * u}px`,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    fontSize: 30 * u,
                    fontWeight: 600,
                    opacity: sequential ? enter : 1,
                    transform: `translateY(${interpolate(sequential ? enter : 1, [0, 1], [14 * u, 0])}px)`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12 * u,
                  }}
                >
                  <span
                    style={{
                      width: 10 * u,
                      height: 10 * u,
                      borderRadius: 999,
                      flexShrink: 0,
                      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
                    }}
                  />
                  {bullet}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  const content = (
    <>
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
          const slide = interpolate(opacity, [0, 1], [fromLeft ? -34 * u : 34 * u, 0]);
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 20 * u,
                fontSize: 46 * u,
                lineHeight: 1.32,
                marginBottom: 18 * u,
                opacity,
                transform: `translateX(${slide}px)`,
                // Each revealed point sits on its own soft pill, so what is
                // being "shown" always has a backdrop of its own.
                padding: plated || bare ? `${14 * u}px ${20 * u}px` : `0 0 ${8 * u}px 0`,
                borderRadius: 20 * u,
                background: plated || bare ? 'rgba(255,255,255,0.045)' : 'transparent',
                border: plated || bare ? '1px solid rgba(255,255,255,0.07)' : 'none',
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
    </>
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: plated ? '7%' : '8%',
        boxSizing: 'border-box',
        position: 'relative',
        background: plated
          ? `linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012)), ${theme.panel}`
          : bare
            ? 'transparent'
            : theme.panel,
        border: plated ? '1px solid rgba(255,255,255,0.10)' : 'none',
        borderRadius: plated ? 40 : 0,
        boxShadow: plated ? '0 34px 90px rgba(0,0,0,0.42)' : 'none',
        backdropFilter: bare || plated ? undefined : 'blur(6px)',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: theme.text,
        overflow: plated ? 'hidden' : undefined,
      }}
    >
      {/* Accent corner glow anchors the plate to the theme (seeded corner). */}
      {plated ? (
        <div
          style={{
            position: 'absolute',
            width: '52%',
            height: '52%',
            top: '-18%',
            [accentCornerRight ? 'right' : 'left']: '-14%',
            background: `radial-gradient(50% 50% at 50% 50%, ${theme.accent}26, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {content}
    </div>
  );
};
