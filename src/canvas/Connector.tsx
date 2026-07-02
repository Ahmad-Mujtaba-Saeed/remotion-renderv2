import React, { useMemo } from 'react';
import { CanvasItem } from '../types';
import { useTheme } from '../theme';
import { travelControl } from './camera';

/**
 * The journey line between two station cards: a curved arrow that draws
 * itself toward the next station in sync with the camera's flight (the arrow
 * "drags" the camera), tipped with a glowing head and an optional tiny label.
 * Rendered in world coordinates inside the world <svg>.
 */

type Pt = [number, number];

const qPoint = (p0: Pt, c: Pt, p1: Pt, t: number): Pt => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
};

/** Point where a ray from a rect's center exits the rect (plus padding). */
const edgePoint = (item: CanvasItem, towards: Pt, pad: number): Pt => {
  const dx = towards[0] - item.x;
  const dy = towards[1] - item.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  const tEdge = 0.5 / Math.max(Math.abs(ux) / item.w, Math.abs(uy) / item.h, 1e-6);
  const d = Math.min(len / 2, tEdge + pad);
  return [item.x + ux * d, item.y + uy * d];
};

export const Connector: React.FC<{
  from: CanvasItem;
  to: CanvasItem;
  hopIndex: number;
  /** 0..1 draw-on progress (the camera's travel into `to`). */
  progress: number;
  label?: string;
  straight?: boolean;
}> = ({ from, to, hopIndex, progress, label, straight }) => {
  const theme = useTheme();

  const geo = useMemo(() => {
    const p0 = edgePoint(from, [to.x, to.y], 46);
    const p1 = edgePoint(to, [from.x, from.y], 64);
    const c: Pt = straight
      ? [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
      : travelControl(p0, p1, hopIndex);

    // Sample the curve once: cumulative arc lengths let us convert an
    // arc-length fraction (what dashoffset uses) back to a curve parameter.
    const N = 48;
    const pts: Pt[] = [];
    const cum: number[] = [0];
    for (let k = 0; k <= N; k++) {
      pts.push(qPoint(p0, c, p1, k / N));
      if (k > 0) {
        cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      }
    }
    const length = cum[N];

    const atLength = (s: number): { p: Pt; angle: number } => {
      const target = Math.max(0, Math.min(length, s));
      let k = 1;
      while (k < N && cum[k] < target) k++;
      const seg = Math.max(1e-6, cum[k] - cum[k - 1]);
      const f = (target - cum[k - 1]) / seg;
      const p: Pt = [
        pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f,
        pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f,
      ];
      return { p, angle: Math.atan2(pts[k][1] - pts[k - 1][1], pts[k][0] - pts[k - 1][0]) };
    };

    return { p0, p1, c, length, atLength, mid: qPoint(p0, c, p1, 0.5) };
  }, [from, to, hopIndex, straight]);

  if (progress <= 0.001) return null;

  // The arrow tip leads the camera slightly — it finishes just before landing.
  const drawn = Math.min(1, progress * 1.12);
  const tip = geo.atLength(geo.length * drawn);
  const headSize = 34;

  const pathD = `M ${geo.p0[0]} ${geo.p0[1]} Q ${geo.c[0]} ${geo.c[1]} ${geo.p1[0]} ${geo.p1[1]}`;

  return (
    <g>
      {/* Soft under-glow of the line. */}
      <path
        d={pathD}
        fill="none"
        stroke={theme.accent}
        strokeWidth={18}
        strokeLinecap="round"
        opacity={0.16}
        strokeDasharray={geo.length}
        strokeDashoffset={geo.length * (1 - drawn)}
      />
      {/* The line itself. */}
      <path
        d={pathD}
        fill="none"
        stroke={theme.accent}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={geo.length}
        strokeDashoffset={geo.length * (1 - drawn)}
        opacity={0.95}
      />
      {/* Arrowhead riding the tip while drawing, resting at the end after. */}
      <g transform={`translate(${tip.p[0]}, ${tip.p[1]}) rotate(${(tip.angle * 180) / Math.PI})`}>
        <path
          d={`M 0 0 L ${-headSize} ${headSize * 0.55} L ${-headSize * 0.72} 0 L ${-headSize} ${-headSize * 0.55} Z`}
          fill={theme.accent}
        />
        {/* Glowing guide dot that visibly "drags" the camera. */}
        {drawn < 1 ? <circle r={13} fill={theme.accent2} opacity={0.9} /> : null}
      </g>
      {/* Optional tiny label at the midpoint. */}
      {label && drawn > 0.45 ? (
        <g transform={`translate(${geo.mid[0]}, ${geo.mid[1]})`} opacity={Math.min(1, (drawn - 0.45) / 0.3)}>
          <rect
            x={-label.length * 11 - 18}
            y={-30}
            width={label.length * 22 + 36}
            height={60}
            rx={30}
            fill={theme.panel}
            stroke={`${theme.accent}88`}
            strokeWidth={2}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill={theme.text}
            fontSize={30}
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight={700}
          >
            {label}
          </text>
        </g>
      ) : null}
    </g>
  );
};
