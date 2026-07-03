import React, { useMemo } from 'react';
import { CanvasItem } from '../types';
import { useTheme } from '../theme';
import { travelControl } from './camera';

/**
 * The guide line between two scene regions, drawn in sync with the camera's
 * flight. Two styles:
 *  - "dotted": a subtle breadcrumb path — the default; decoration, not chrome.
 *  - "arrow":  a bold accent arrow for hops where direction/causality matters.
 * Draw-on works by emitting only the sampled sub-path up to the current
 * progress, so dash patterns and heads stay correct for both styles.
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
  style?: 'dotted' | 'arrow';
}> = ({ from, to, hopIndex, progress, label, style = 'dotted' }) => {
  const theme = useTheme();

  const pts = useMemo(() => {
    const p0 = edgePoint(from, [to.x, to.y], 60);
    const p1 = edgePoint(to, [from.x, from.y], 80);
    const c = travelControl(p0, p1, hopIndex);
    const sampled: Pt[] = [];
    const N = 48;
    for (let k = 0; k <= N; k++) {
      sampled.push(qPoint(p0, c, p1, k / N));
    }
    return sampled;
  }, [from, to, hopIndex]);

  if (progress <= 0.001) return null;

  // The tip leads the camera slightly — the line lands just before we do.
  const drawn = Math.min(1, progress * 1.12);
  const upto = Math.max(2, Math.ceil(drawn * (pts.length - 1)) + 1);
  const visible = pts.slice(0, upto);
  const tip = visible[visible.length - 1];
  const prevPt = visible[visible.length - 2];
  const angle = Math.atan2(tip[1] - prevPt[1], tip[0] - prevPt[0]);

  const d = `M ${visible.map((p) => `${p[0]} ${p[1]}`).join(' L ')}`;
  const mid = pts[Math.floor(pts.length / 2)];
  const isArrow = style === 'arrow';
  const headSize = 34;

  return (
    <g>
      {isArrow ? (
        <>
          {/* Soft under-glow, then the bold line. */}
          <path d={d} fill="none" stroke={theme.accent} strokeWidth={18} strokeLinecap="round" opacity={0.16} />
          <path d={d} fill="none" stroke={theme.accent} strokeWidth={7} strokeLinecap="round" opacity={0.95} />
          <g transform={`translate(${tip[0]}, ${tip[1]}) rotate(${(angle * 180) / Math.PI})`}>
            <path
              d={`M 0 0 L ${-headSize} ${headSize * 0.55} L ${-headSize * 0.72} 0 L ${-headSize} ${-headSize * 0.55} Z`}
              fill={theme.accent}
            />
            {drawn < 1 ? <circle r={13} fill={theme.accent2} opacity={0.9} /> : null}
          </g>
        </>
      ) : (
        <>
          {/* Subtle dotted breadcrumb with a small glowing scout at the tip. */}
          <path
            d={d}
            fill="none"
            stroke={theme.accent}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray="1 30"
            opacity={0.55}
          />
          {drawn < 1 ? <circle cx={tip[0]} cy={tip[1]} r={11} fill={theme.accent2} opacity={0.8} /> : null}
        </>
      )}

      {label && drawn > 0.45 ? (
        <g transform={`translate(${mid[0]}, ${mid[1]})`} opacity={Math.min(1, (drawn - 0.45) / 0.3)}>
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
