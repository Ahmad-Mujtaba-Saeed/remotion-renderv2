import React, { useMemo } from 'react';
import { CanvasItem } from '../types';
import { useTheme, MONO_FONT, hairline } from '../theme';
import { travelControl } from './camera';

/**
 * The guide line between two scene regions, drawn in sync with the camera's
 * flight. Two styles:
 *  - "dotted": a breadcrumb path with a solid scout dot at its tip.
 *  - "arrow":  an accent arrow for hops where direction/causality matters.
 * Single-weight strokes: the old halo/under-glow pair was drawing each line
 * twice to fake a bloom.
 * The draw-on progress arrives ALREADY eased to the camera's own flight curve
 * (travelProgressEased), and the tip runs ~16% ahead of it, so the line always
 * leads the camera instead of trailing behind mid-flight. All strokes scale
 * with the regions they connect so they stay bold at flight altitude.
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
  /** 0..1 draw-on progress, pre-eased to the camera's flight curve. */
  progress: number;
  /** Whole-connector fade (the line dissolves shortly after touchdown). */
  opacity?: number;
  label?: string;
  style?: 'dotted' | 'arrow';
}> = ({ from, to, hopIndex, progress, opacity = 1, label, style = 'dotted' }) => {
  const theme = useTheme();

  // Everything scales with the smaller of the two regions, so connectors keep
  // the same visual weight whether the cards are 700 or 3000 world units.
  const u = Math.max(0.7, Math.min(2.2, Math.min(from.w, from.h, to.w, to.h) / 1000));

  // Per-hop rhythm: the dot spacing varies so no two trails read identical.
  const seeded = Math.abs(Math.sin(hopIndex * 127.1 + 7 * 311.7) * 43758.5453) % 1;
  const dashGap = (56 + seeded * 20) * u;

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

  if (progress <= 0.001 || opacity <= 0.01) return null;

  // The tip leads the camera — the line lands well before we do.
  const drawn = Math.min(1, progress * 1.16);
  const upto = Math.max(2, Math.ceil(drawn * (pts.length - 1)) + 1);
  const visible = pts.slice(0, upto);
  const tip = visible[visible.length - 1];
  const prevPt = visible[visible.length - 2];
  const angle = Math.atan2(tip[1] - prevPt[1], tip[0] - prevPt[0]);

  const d = `M ${visible.map((p) => `${p[0]} ${p[1]}`).join(' L ')}`;
  const mid = pts[Math.floor(pts.length / 2)];
  const isArrow = style === 'arrow';
  const headSize = 64 * u;
  const fs = 42 * u; // label font size

  return (
    <g opacity={opacity}>
      {isArrow ? (
        <>
          <path d={d} fill="none" stroke={theme.accent} strokeWidth={10 * u} strokeLinecap="round" />
          <g transform={`translate(${tip[0]}, ${tip[1]}) rotate(${(angle * 180) / Math.PI})`}>
            <path
              d={`M 0 0 L ${-headSize} ${headSize * 0.55} L ${-headSize * 0.72} 0 L ${-headSize} ${-headSize * 0.55} Z`}
              fill={theme.accent}
            />
            {drawn < 1 ? <circle r={18 * u} fill={theme.accent} /> : null}
          </g>
        </>
      ) : (
        <>
          <path
            d={d}
            fill="none"
            stroke={theme.accent}
            strokeWidth={12 * u}
            strokeLinecap="round"
            strokeDasharray={`0.1 ${dashGap}`}
            opacity={0.8}
          />
          {drawn < 1 ? <circle cx={tip[0]} cy={tip[1]} r={16 * u} fill={theme.accent} /> : null}
        </>
      )}

      {label && drawn > 0.45 ? (
        <g transform={`translate(${mid[0]}, ${mid[1]})`} opacity={Math.min(1, (drawn - 0.45) / 0.3)}>
          <rect
            x={-(label.length * fs * 0.36 + fs * 0.75)}
            y={-fs * 0.95}
            width={label.length * fs * 0.72 + fs * 1.5}
            height={fs * 1.9}
            fill={theme.panel}
            stroke={hairline(theme, 0.12)}
            strokeWidth={2 * u}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill={theme.text}
            fontSize={fs * 0.78}
            fontFamily={MONO_FONT}
            fontWeight={600}
            letterSpacing={fs * 0.1}
          >
            {label.toUpperCase()}
          </text>
        </g>
      ) : null}
    </g>
  );
};
