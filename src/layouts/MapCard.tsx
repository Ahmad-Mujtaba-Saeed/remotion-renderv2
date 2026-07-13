import React from 'react';
import { AbsoluteFill, spring, useVideoConfig } from 'remotion';
import { Scene, MapPin } from '../types';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeInOutSine, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { SfxCue } from '../sfx';
import { KineticText } from '../components/KineticText';
import { MAP_REGIONS, WORLD_PATHS, projectLat, projectLon } from '../geo/world';

/**
 * map_card (copilot.md §5.15): a flat vector world map — muted country
 * strokes on the paper field, no fills, no textures. 1-2 labelled pins drop
 * in with a settle spring (+ tick, §6.5), and with two pins an optional
 * route arc stroke-draws from the first to the second, whose drop rides the
 * arc's arrival. The whole map takes a slow push so the frame never freezes.
 */
export const MapCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_map'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame, durationInFrames } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;
  const pins: MapPin[] = (slot.pins ?? [])
    .filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number')
    .slice(0, 2);
  if (pins.length < 1) return null;

  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  // Frame the requested region, padded so pins near an edge keep their label.
  const region = MAP_REGIONS[slot.region ?? 'world'] ?? MAP_REGIONS.world;
  const pad = Math.max(region.w, region.h) * 0.06;
  const vb = {
    x: region.x - pad,
    y: region.y - pad,
    w: region.w + pad * 2,
    h: region.h + pad * 2,
  };
  // Design-space unit: how many viewBox units one on-screen design unit is,
  // so strokes/pins keep a constant apparent size in any region frame.
  const s = vb.w / 1400;

  const mapIn = easeOutQuint(clamp01((frame - f30(fps, 2)) / f30(fps, 16)));
  // Law 6 (never frozen): the map exhales forward for the whole scene.
  const push = 1 + 0.05 * easeInOutSine(clamp01(frame / durationInFrames));

  const dropAt = (i: number): number => f30(fps, 20) + i * f30(fps, 36);
  const at = win?.start ?? 0;

  const route = slot.route === true && pins.length === 2;
  const routeStart = dropAt(0) + f30(fps, 8);
  const routeDur = f30(fps, 26);
  const routeP = route ? easeInOutSine(clamp01((frame - routeStart) / routeDur)) : 0;

  const px = (p: MapPin): number => projectLon(p.lon ?? 0);
  const py = (p: MapPin): number => projectLat(p.lat ?? 0);

  // Route arc: a quadratic lifted perpendicular to the chord.
  let routePath = '';
  let routeLen = 0;
  if (route) {
    const x1 = px(pins[0]);
    const y1 = py(pins[0]);
    const x2 = px(pins[1]);
    const y2 = py(pins[1]);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    // Lift toward the top of the frame (great-circle feel).
    const lift = Math.min(dist * 0.3, vb.h * 0.25);
    const cx = mx - (dy / dist) * lift * (dx >= 0 ? 1 : -1);
    const cy = my - Math.abs(dx / dist) * lift;
    routePath = `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`;
    routeLen = dist * 1.2; // safe overestimate for the dash trick
  }

  const pinEl = (p: MapPin, i: number): React.ReactNode => {
    // The second pin of a route waits for the arc to arrive.
    const dropFrame = route && i === 1 ? routeStart + routeDur - f30(fps, 4) : dropAt(i);
    const drop = spring({
      frame: Math.max(0, frame - dropFrame),
      fps,
      config: SPRINGS.settle,
      durationInFrames: Math.round(fps * 0.5),
    });
    if (frame < dropFrame) return null;
    const x = px(p);
    const y = py(p);
    const r = 11 * s;
    // Keep the label inside the frame: flip sides past the region midline.
    const rightSide = x < vb.x + vb.w / 2;
    const label = (p.label ?? '').trim();
    return (
      <g key={i} opacity={Math.min(1, drop * 1.5)}>
        <g transform={`translate(0 ${(1 - drop) * -40 * s})`}>
          <circle cx={x} cy={y} r={r} fill={theme.accent} />
          <circle cx={x} cy={y} r={r * 0.38} fill={inkOn(theme.accent)} />
          {label ? (
            <g>
              <rect
                x={rightSide ? x + r * 2 : x - r * 2 - (label.length * 13 + 26) * s}
                y={y - 19 * s}
                width={(label.length * 13 + 26) * s}
                height={38 * s}
                fill={theme.panel}
                stroke={hairline(theme, 0.25)}
                strokeWidth={1.2 * s}
              />
              <text
                x={rightSide ? x + r * 2 + 13 * s : x - r * 2 - (label.length * 13 + 13) * s}
                y={y + 8 * s}
                fontFamily={MONO_FONT}
                fontSize={22 * s}
                fontWeight={700}
                letterSpacing={1.5 * s}
                fill={theme.text}
              >
                {label.toUpperCase()}
              </text>
            </g>
          ) : null}
        </g>
      </g>
    );
  };

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* Pin-drop ticks (§6.5) — mounted outside the SVG tree. */}
      {pins.map((_, i) => {
        const dropFrame = route && i === 1 ? routeStart + routeDur - f30(fps, 4) : dropAt(i);
        return <SfxCue key={i} name="tick" at={at + dropFrame} volume={0.3} />;
      })}
      {(kicker || heading) && (
        <div style={{ position: 'absolute', top: '5%', left: 0, right: 0, textAlign: 'center', zIndex: 2 }}>
          {kicker ? (
            <div
              style={{
                fontFamily: MONO_FONT,
                fontSize: 24 * u,
                letterSpacing: 4 * u,
                textTransform: 'uppercase',
                color: theme.accent,
                marginBottom: 12 * u,
                opacity: headIn,
              }}
            >
              {kicker}
            </div>
          ) : null}
          {heading ? (
            <h1
              style={{
                margin: 0,
                fontFamily: displayFont,
                fontWeight: 900,
                fontSize: 58 * u,
                lineHeight: 1.05,
                color: theme.text,
              }}
            >
              <KineticText text={heading} highlight={meta.style?.highlight} />
            </h1>
          ) : null}
        </div>
      )}

      <div
        style={{
          width: '100%',
          height: '100%',
          opacity: mapIn,
          transform: `scale(${(0.98 + 0.02 * mapIn) * push})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: height > width ? '18% 4%' : '9% 6%',
          boxSizing: 'border-box',
        }}
      >
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%' }}
        >
          {/* Country strokes — muted lines on the paper, no fills. */}
          <g fill="none" stroke={hairline(theme, 0.26)} strokeWidth={1.6 * s} strokeLinejoin="round">
            {WORLD_PATHS.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>

          {/* Route arc stroke-draws between the pins. */}
          {route && routeP > 0 ? (
            <path
              d={routePath}
              fill="none"
              stroke={theme.accent}
              strokeWidth={4 * s}
              strokeLinecap="round"
              strokeDasharray={routeLen}
              strokeDashoffset={routeLen * (1 - routeP)}
            />
          ) : null}

          {pins.map((p, i) => pinEl(p, i))}
        </svg>
      </div>
    </AbsoluteFill>
  );
};
