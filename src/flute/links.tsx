import React from 'react';
import { CinematicLink, Theme } from '../types';
import { hairline, MONO_FONT } from '../theme';
import { BAD } from './parts';
import { CamState, Cell, project } from './cinematicRig';

/**
 * The lines between the parts — the half of a diagram that says how the
 * pieces RELATE: the request going to the server, the balancer fanning out to
 * three machines, the answer coming back into the cache.
 *
 * Drawn in SCREEN space on top of the Flute scene rather than on a 3D layer:
 * a line on one plane joining parts on two other planes would slide off both
 * ends the moment the camera moved. Instead both ends are projected every
 * frame through the same maths Flute's CSS performs (`project`), so a line
 * stays glued to its parts through every push, angle and entrance. It fades
 * with its endpoints' blur, so a line into an out-of-focus part is soft too.
 *
 * A link draws on once BOTH its parts have landed; a flowing link then
 * carries a small packet along itself, forever, so a held frame still shows
 * the thing working.
 */

export interface LinkEnd {
  cell: Cell;
  /** Content box (px, cell-local, before perspective). */
  box: { w: number; h: number };
  /** Current depth of the part (entrance included). */
  z: number;
  /** Perspective compensation of the part (its final depth). */
  c: number;
  /** 0..1 entrance. */
  enter: number;
  /** 0..1 how soft the part is at this pose. */
  blur: number;
}

type Pt = { x: number; y: number };

export const LinkLayer: React.FC<{
  links: CinematicLink[];
  ends: Map<string, LinkEnd>;
  landAt: Map<string, number>;
  cam: CamState;
  P: number;
  u: number;
  frame: number;
  fps: number;
  width: number;
  height: number;
  theme: Theme;
}> = ({ links, ends, landAt, cam, P, u, frame, fps, width, height, theme }) => {
  if (!links.length) return null;
  const view = { width, height };
  const drawLen = Math.round(fps * 0.6);
  const period = Math.round(fps * 1.4);

  const paths: React.ReactNode[] = [];
  links.forEach((link, i) => {
    const a = ends.get(link.from);
    const b = ends.get(link.to);
    const la = landAt.get(link.from);
    const lb = landAt.get(link.to);
    if (!a || !b || la === undefined || lb === undefined) return;

    const start = Math.max(la, lb) + Math.round(fps * 0.3);
    const drawn = Math.max(0, Math.min(1, (frame - start) / drawLen));
    if (drawn <= 0) return;

    // Attach to the FACING edges of the two content boxes, a hair outside.
    const dx = b.cell.cx - a.cell.cx;
    const dy = b.cell.cy - a.cell.cy;
    const horizontal = Math.abs(dx) >= Math.abs(dy) * 0.9;
    const pad = 12 * u;
    const edge = (end: LinkEnd, towardX: number, towardY: number): Pt =>
      horizontal
        ? { x: end.cell.cx + Math.sign(towardX) * (end.box.w / 2 + pad), y: end.cell.cy }
        : { x: end.cell.cx, y: end.cell.cy + Math.sign(towardY) * (end.box.h / 2 + pad) };
    const sa = edge(a, dx, dy);
    const sb = edge(b, -dx, -dy);
    const toScreen = (p: Pt, end: LinkEnd) => project(cam, { x: p.x * end.c, y: p.y * end.c, z: end.z }, P, view);
    const S = toScreen(sa, a);
    const T = toScreen(sb, b);

    // Shape: the planner's choice, or the one that reads cleanest for the
    // geometry — straight when aligned, a curve fanning across rows, an elbow
    // stepping between columns.
    const aligned = horizontal ? Math.abs(T.y - S.y) < 18 * u : Math.abs(T.x - S.x) < 18 * u;
    const style = link.style ?? (aligned ? 'straight' : horizontal ? 'curve' : 'elbow');
    let d: string;
    let mid: Pt;
    let tail: Pt; // direction the path arrives from, for the arrowhead
    if (style === 'straight' || aligned) {
      d = `M ${S.x} ${S.y} L ${T.x} ${T.y}`;
      mid = { x: (S.x + T.x) / 2, y: (S.y + T.y) / 2 };
      tail = S;
    } else if (style === 'curve') {
      if (horizontal) {
        const k = (T.x - S.x) * 0.5;
        d = `M ${S.x} ${S.y} C ${S.x + k} ${S.y} ${T.x - k} ${T.y} ${T.x} ${T.y}`;
        tail = { x: T.x - k, y: T.y };
      } else {
        const k = (T.y - S.y) * 0.5;
        d = `M ${S.x} ${S.y} C ${S.x} ${S.y + k} ${T.x} ${T.y - k} ${T.x} ${T.y}`;
        tail = { x: T.x, y: T.y - k };
      }
      mid = { x: (S.x + T.x) / 2, y: (S.y + T.y) / 2 };
    } else {
      if (horizontal) {
        const mx = (S.x + T.x) / 2;
        d = `M ${S.x} ${S.y} H ${mx} V ${T.y} H ${T.x}`;
        mid = { x: mx, y: (S.y + T.y) / 2 };
        tail = { x: mx, y: T.y };
      } else {
        const my = (S.y + T.y) / 2;
        d = `M ${S.x} ${S.y} V ${my} H ${T.x} V ${T.y}`;
        mid = { x: (S.x + T.x) / 2, y: my };
        tail = { x: T.x, y: my };
      }
    }

    const flow = link.flow ?? link.tone !== 'muted';
    const tone = link.tone ?? (flow ? 'accent' : 'muted');
    const color = tone === 'accent' ? theme.accent : tone === 'bad' ? BAD : hairline(theme, 0.38);
    const opacity = Math.min(a.enter, b.enter) * (1 - 0.6 * Math.max(a.blur, b.blur));
    // Lines thicken as the camera closes in, like everything else in shot.
    const sw = (tone === 'accent' || tone === 'bad' ? 2.2 : 1.6) * u * ((S.k + T.k) / 2);

    // Arrowhead on the target end, along the arriving direction.
    const ang = Math.atan2(T.y - tail.y, T.x - tail.x);
    const ah = 11 * u;
    const arrow = `M ${T.x - ah * Math.cos(ang - 0.5)} ${T.y - ah * Math.sin(ang - 0.5)} L ${T.x} ${T.y} L ${T.x - ah * Math.cos(ang + 0.5)} ${T.y - ah * Math.sin(ang + 0.5)}`;

    const phase = ((frame - start - drawLen) / period) % 1;

    // A label rides ALONG a horizontal link, so it must fit the gap between
    // the two parts or it prints over them: shrink it to fit, and drop it if
    // it still cannot (the link itself still says "these connect").
    const label = (link.label ?? '').toUpperCase();
    const perChar = (fs: number) => fs * 0.62 + 2 * u;
    let labelFs = 14 * u;
    if (label && horizontal) {
      const room = Math.abs(T.x - S.x) - 16 * u;
      if (label.length * perChar(labelFs) > room) labelFs = Math.max(0, (room / label.length - 2 * u) / 0.62);
    }
    const showLabel = label !== '' && labelFs >= 10 * u;
    paths.push(
      <g key={i} opacity={opacity}>
        <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn} />
        {drawn >= 1 ? <path d={arrow} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {flow && drawn >= 1 ? (
          <path
            d={d}
            fill="none"
            stroke={tone === 'bad' ? BAD : theme.accent}
            strokeWidth={sw * 2.2}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="0.06 0.94"
            strokeDashoffset={-phase}
          />
        ) : null}
        {showLabel ? (
          <text
            x={horizontal ? mid.x : mid.x + 14 * u}
            y={horizontal ? mid.y - 12 * u : mid.y}
            textAnchor={horizontal ? 'middle' : 'start'}
            dominantBaseline={horizontal ? 'auto' : 'middle'}
            fontFamily={MONO_FONT}
            fontSize={labelFs}
            fontWeight={700}
            letterSpacing={2 * u}
            fill={tone === 'muted' ? theme.muted : color}
            stroke={theme.bg_from}
            strokeWidth={6 * u}
            paintOrder="stroke"
            opacity={drawn}
          >
            {label}
          </text>
        ) : null}
      </g>
    );
  });

  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
      {paths}
    </svg>
  );
};
