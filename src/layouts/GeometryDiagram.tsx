import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, GeoPoint, AngleMark, Theme } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeInOutQuint, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { KineticText } from '../components/KineticText';
import { parseMath, mathToPlain } from '../math/mathText';

/**
 * geometry_diagram — a native, fully dynamic geometry figure. The analyzer
 * hands normalized coordinates (0..1, y up) and labels; the renderer draws
 * the figure the way a teacher would: graph-paper grid fades in, the outline
 * draws itself stroke-first, vertex letters land, side measurements fade in
 * at each edge's midpoint, angle arcs sweep (right angles get the square
 * marker), and an optionally highlighted side re-draws in the accent.
 *
 * triangle / right_triangle / rectangle / square / polygon are all the same
 * machine (the PHP validator synthesizes default points when the model gives
 * none); circle and angle have their own draw paths. SVG stroke/transform
 * only — flat rules hold. Silent by design: narration + motion carry it.
 */

const W = 1000;
const H = 640;
const PAD = 90;

type Pt = { x: number; y: number; label?: string };

const mapPt = (p: GeoPoint): Pt => ({
  x: PAD + clamp01(p.x ?? 0.5) * (W - 2 * PAD),
  y: PAD + (1 - clamp01(p.y ?? 0.5)) * (H - 2 * PAD),
  label: (p.label ?? '').trim() || undefined,
});

/** Unicode scripts for a square's area label: "a^2" → "a²". SVG <text> cannot
 *  host the HTML typesetter, and these labels are always short enough that
 *  unicode does the whole job. */
const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', n: 'ⁿ', i: 'ⁱ',
};

const toSuperscripts = (s: string): string =>
  s.replace(/\^\{?([0-9+\-ni]+)\}?/g, (_m, g: string) =>
    [...g].map((c) => SUPERSCRIPTS[c] ?? c).join('')
  );

/**
 * A figure label written in the linear notation, projected into real glyphs:
 * "3theta" → "3θ", "a^2" → "a²", "cos(theta)" → "cos(θ)". SVG <text> cannot
 * host the HTML typesetter, so the plain projection plus unicode scripts is
 * the whole toolkit here — enough for the short labels a figure carries.
 */
const mathLabel = (s: string): string => toSuperscripts(mathToPlain(parseMath(s)));

/** `nx`/`ny` is the edge's OUTWARD unit normal — the direction the square was
 *  stood up in. It is a direction, not a point, so the reframe never touches
 *  it (a uniform scale leaves directions alone). */
type Square = { pts: Pt[]; label: string; edge: number; nx: number; ny: number };

/**
 * A square standing on each labelled edge, on the far side from the figure's
 * middle. Positional per edge exactly like side_labels/side_ticks: entry i
 * belongs to edge i, and an empty entry means no square.
 */
const erectSquares = (base: Pt[], labels: string[]): Square[] => {
  const n = base.length;
  const cx = base.reduce((a, p) => a + p.x, 0) / n;
  const cy = base.reduce((a, p) => a + p.y, 0) / n;
  const out: Square[] = [];

  base.forEach((a, i) => {
    const label = String(labels[i] ?? '').trim();
    if (!label) return;
    const b = base[(i + 1) % n];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len < 1) return; // degenerate edge — nothing to stand a square on

    // Of the two edge normals, keep the one that walks AWAY from the centroid.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    let nx = ey / len;
    let ny = -ex / len;
    if (Math.hypot(mx + nx - cx, my + ny - cy) < Math.hypot(mx - nx - cx, my - ny - cy)) {
      nx = -nx;
      ny = -ny;
    }

    out.push({
      edge: i,
      label: mathLabel(label),
      nx,
      ny,
      pts: [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
        { x: b.x + nx * len, y: b.y + ny * len },
        { x: a.x + nx * len, y: a.y + ny * len },
      ],
    });
  });

  return out;
};

/** Uniform scale + offset that fits a point cloud into the drawing box, with
 *  room left around it for the labels that get pushed outward. Never enlarges. */
const fitTransform = (all: Pt[]): { s: number; tx: number; ty: number } => {
  const M = 54; // outward label overhang
  const FIT_PAD = 50;
  const x0 = Math.min(...all.map((p) => p.x)) - M;
  const x1 = Math.max(...all.map((p) => p.x)) + M;
  const y0 = Math.min(...all.map((p) => p.y)) - M;
  const y1 = Math.max(...all.map((p) => p.y)) + M;
  const availW = W - 2 * FIT_PAD;
  const availH = H - 2 * FIT_PAD;
  const s = Math.min(availW / Math.max(1, x1 - x0), availH / Math.max(1, y1 - y0), 1);

  return {
    s,
    tx: FIT_PAD + (availW - (x1 - x0) * s) / 2 - x0 * s,
    ty: FIT_PAD + (availH - (y1 - y0) * s) / 2 - y0 * s,
  };
};

const DEFAULT_POINTS: Record<string, GeoPoint[]> = {
  triangle: [
    { x: 0.5, y: 0.92 },
    { x: 0.06, y: 0.06 },
    { x: 0.94, y: 0.06 },
  ],
  right_triangle: [
    { x: 0.08, y: 0.92 },
    { x: 0.08, y: 0.08 },
    { x: 0.92, y: 0.08 },
  ],
  rectangle: [
    { x: 0.08, y: 0.85 },
    { x: 0.92, y: 0.85 },
    { x: 0.92, y: 0.15 },
    { x: 0.08, y: 0.15 },
  ],
  square: [
    { x: 0.235, y: 0.95 },
    { x: 0.765, y: 0.95 },
    { x: 0.765, y: 0.05 },
    { x: 0.235, y: 0.05 },
  ],
  angle: [
    { x: 0.85, y: 0.75 },
    { x: 0.15, y: 0.2 },
    { x: 0.9, y: 0.2 },
  ],
};

export const GeometryDiagram: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_geometry'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width: frameW, height: frameH } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;
  const shape = (slot.shape ?? 'triangle') as string;
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const heading = (slot.heading ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  const portrait = frameH > frameW;
  const fit = Math.min(1, (frameW * (portrait ? 0.92 : 0.82)) / (W * u));

  // ---- Shared draw clock ---------------------------------------------------
  const gridP = easeOutQuint(clamp01((frame - f30(fps, 2)) / f30(fps, 10)));
  const drawAt = f30(fps, 8);
  const drawDur = f30(fps, 24);
  const drawP = easeInOutQuint(clamp01((frame - drawAt) / drawDur));
  const drawDone = drawAt + drawDur;

  const ink = theme.text;
  const gridStroke = hairline(theme, 0.07);

  const grid: React.ReactNode = (
    <g opacity={gridP}>
      {Array.from({ length: 11 }, (_, i) => (
        <line key={`v${i}`} x1={(i * W) / 10} y1={0} x2={(i * W) / 10} y2={H} stroke={gridStroke} strokeWidth={1.5} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={(i * H) / 7} x2={W} y2={(i * H) / 7} stroke={gridStroke} strokeWidth={1.5} />
      ))}
    </g>
  );

  let figure: React.ReactNode = null;

  if (shape === 'circle') {
    figure = (
      <CircleFigure
        slot={{ radius_label: slot.radius_label, center_label: slot.center_label, fill: slot.fill }}
        frame={frame}
        fps={fps}
        drawP={drawP}
        drawDone={drawDone}
        ink={ink}
        theme={theme}
        displayFont={displayFont}
      />
    );
  } else if (shape === 'number_line') {
    figure = (
      <NumberLineFigure slot={slot} frame={frame} fps={fps} drawP={drawP} drawDone={drawDone} ink={ink} theme={theme} displayFont={displayFont} />
    );
  } else if (shape === 'coordinate_plane') {
    figure = (
      <CoordinatePlaneFigure slot={slot} frame={frame} fps={fps} drawDone={drawDone} ink={ink} theme={theme} displayFont={displayFont} />
    );
  } else if (shape === 'fraction_bar') {
    figure = (
      <FractionBarFigure slot={slot} frame={frame} fps={fps} ink={ink} theme={theme} displayFont={displayFont} />
    );
  } else if (shape === 'unit_circle') {
    figure = (
      <UnitCircleFigure slot={slot} frame={frame} fps={fps} drawP={drawP} drawDone={drawDone} ink={ink} theme={theme} displayFont={displayFont} />
    );
  } else {
    const raw =
      Array.isArray(slot.points) && slot.points.length >= 3
        ? slot.points
        : DEFAULT_POINTS[shape] ?? DEFAULT_POINTS.triangle;
    const base = raw.slice(0, 8).map(mapPt);
    const n = base.length;
    const isAngle = shape === 'angle' && n >= 3;

    // Squares erected outward on named edges — the Pythagoras figure, and any
    // "the area sitting on this side" argument. Built in PIXEL space, because
    // the normalized space is anisotropic (x and y map to different spans) and
    // a square built there would come out a rectangle. An angle has no
    // interior, so nothing to be outside of.
    const squares = isAngle ? [] : erectSquares(base, slot.side_squares ?? []);

    // Erected squares are far bigger than the figure they hang off, so the
    // whole assembly is re-framed to fit. A UNIFORM scale keeps squares square,
    // and it is baked into the points rather than applied as an SVG group
    // transform so stroke widths stay the authored weight. Identity — and
    // therefore byte-identical to a figure without squares — when there are
    // none.
    const fit = squares.length ? fitTransform([...base, ...squares.flatMap((s) => s.pts)]) : null;
    const F = (p: Pt): Pt => (fit ? { x: fit.tx + p.x * fit.s, y: fit.ty + p.y * fit.s, label: p.label } : p);
    const pts = base.map(F);
    const sqs = squares.map((sq) => ({ ...sq, pts: sq.pts.map(F) }));

    const cx = pts.reduce((a, p) => a + p.x, 0) / n;
    const cy = pts.reduce((a, p) => a + p.y, 0) / n;
    // Label offsets ride the reframe, so they stay visually tight to a figure
    // that just shrank to make room for its squares.
    const oScale = fit ? Math.max(0.55, fit.s) : 1;
    const outward = (px: number, py: number, dist: number): Pt => {
      const dx = px - cx;
      const dy = py - cy;
      const len = Math.hypot(dx, dy) || 1;
      return { x: px + (dx / len) * dist * oScale, y: py + (dy / len) * dist * oScale };
    };
    // Measurements carry maths as often as plain numbers ("x + 2", "r^2").
    const sideLabels = (slot.side_labels ?? []).map((s) => mathLabel(String(s ?? '').trim()));
    const marks: AngleMark[] = (slot.angle_marks ?? []).filter(
      (m): m is AngleMark => typeof m === 'object' && m !== null && typeof m.at === 'number' && m.at >= 0 && m.at < n
    );
    // right_triangle implies the square marker at its corner vertex even when
    // the model forgot to mark it.
    if (shape === 'right_triangle' && !marks.some((m) => m.right)) {
      marks.push({ at: 1, right: true });
    }
    const hi = slot.highlight_side != null && slot.highlight_side >= 0 && slot.highlight_side < (isAngle ? 2 : n)
      ? slot.highlight_side
      : null;

    // Edges: closed ring for polygons, two open rays (vertex in the middle)
    // for a bare angle figure.
    const edges: Array<[Pt, Pt]> = isAngle
      ? [
          [pts[1], pts[0]],
          [pts[1], pts[2]],
        ]
      : pts.map((p, i) => [p, pts[(i + 1) % n]] as [Pt, Pt]);
    const ringPath = isAngle
      ? `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y}`
      : `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`;

    const labelIn = (i: number): number =>
      easeOutQuint(clamp01((frame - drawDone - i * f30(fps, 3)) / f30(fps, 9)));
    const fillP = slot.fill
      ? easeOutQuint(clamp01((frame - drawDone - f30(fps, 2)) / f30(fps, 10)))
      : 0;
    const hiP = hi != null ? easeInOutQuint(clamp01((frame - drawDone - f30(fps, 4)) / f30(fps, 10))) : 0;

    figure = (
      <>
        {/* Erected squares stand up one at a time once the figure is drawn —
            outline first, then the area floods, then it names itself. Behind
            the figure so its outline always reads on top. */}
        {sqs.map((sq, k) => {
          const at = drawDone + k * f30(fps, 7);
          const dur = f30(fps, 16);
          const p = easeInOutQuint(clamp01((frame - at) / dur));
          if (p <= 0) return null;
          const areaP = easeOutQuint(clamp01((frame - at - dur) / f30(fps, 8)));
          const nameP = easeOutQuint(clamp01((frame - at - dur - f30(fps, 3)) / f30(fps, 8)));
          const side = Math.hypot(sq.pts[1].x - sq.pts[0].x, sq.pts[1].y - sq.pts[0].y);
          const mid = sq.pts.reduce((a, q) => ({ x: a.x + q.x / 4, y: a.y + q.y / 4 }), { x: 0, y: 0 });
          const isHi = hi === sq.edge;
          return (
            <g key={`sq${k}`}>
              <polygon
                points={sq.pts.map((q) => `${q.x},${q.y}`).join(' ')}
                fill={theme.accent}
                opacity={(isHi ? 0.26 : 0.13) * areaP}
              />
              <polygon
                points={sq.pts.map((q) => `${q.x},${q.y}`).join(' ')}
                fill="none"
                stroke={isHi ? theme.accent : ink}
                strokeWidth={4}
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - p}
              />
              {sq.label ? (
                <text
                  x={mid.x}
                  y={mid.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily={displayFont}
                  fontWeight={800}
                  fontSize={Math.max(15, Math.min(58, side * 0.26))}
                  fill={isHi ? theme.accent : ink}
                  opacity={nameP}
                >
                  {sq.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {slot.fill ? <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={theme.accent} opacity={0.1 * fillP} /> : null}
        <path
          d={ringPath}
          fill="none"
          stroke={ink}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - drawP}
        />
        {/* Highlighted side re-draws in the accent once the figure stands. */}
        {hi != null && edges[hi] ? (
          <line
            x1={edges[hi][0].x}
            y1={edges[hi][0].y}
            x2={edges[hi][1].x}
            y2={edges[hi][1].y}
            stroke={theme.accent}
            strokeWidth={8}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - hiP}
          />
        ) : null}

        {/* Vertex letters land outward from the centroid. */}
        {pts.map((p, i) =>
          p.label ? (
            <text
              key={`vl${i}`}
              {...(() => {
                const pos = outward(p.x, p.y, 42);
                return { x: pos.x, y: pos.y };
              })()}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily={displayFont}
              fontWeight={800}
              fontSize={34}
              fill={ink}
              opacity={labelIn(i)}
            >
              {p.label}
            </text>
          ) : null
        )}

        {/* Side measurements at edge midpoints, pushed outward. */}
        {edges.map(([a, b], i) => {
          const label = sideLabels[i];
          if (!label) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          // An edge carrying a square has no room outside it. The measurement
          // tucks in against its OWN edge (back along the normal the square
          // was raised on) rather than toward the middle — three labels all
          // walking to the centroid would pile up on each other.
          const sq = sqs.find((s) => s.edge === i);
          const pos = sq
            ? { x: mx - sq.nx * 26 * oScale, y: my - sq.ny * 26 * oScale }
            : outward(mx, my, 46);
          const p = labelIn(n + i);
          return (
            <text
              key={`sl${i}`}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily={MONO_FONT}
              fontSize={27}
              fill={hi === i ? theme.accent : theme.muted}
              opacity={p}
            >
              {label}
            </text>
          );
        })}

        {/* Angle arcs sweep; right angles get the square marker. */}
        {marks.map((m, k) => (
          <AngleGlyph
            key={`am${k}`}
            pts={pts}
            at={isAngle ? 1 : m.at}
            mark={m}
            progress={easeInOutQuint(clamp01((frame - drawDone - f30(fps, 3) - k * f30(fps, 4)) / f30(fps, 10)))}
            accent={theme.accent}
            ink={ink}
            isAngleShape={isAngle}
          />
        ))}

        {/* Equal-side tick marks (1-3 short perpendicular dashes per edge). */}
        {(slot.side_ticks ?? []).map((count, i) => {
          const edge = edges[i];
          const nTicks = Math.max(0, Math.min(3, Math.round(Number(count) || 0)));
          if (!edge || nTicks === 0) return null;
          const [a, b] = edge;
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const dx = (b.x - a.x) / len;
          const dy = (b.y - a.y) / len;
          const p = labelIn(2 * n + i);
          return (
            <g key={`tk${i}`} opacity={p}>
              {Array.from({ length: nTicks }, (_, k) => {
                const off = (k - (nTicks - 1) / 2) * 13;
                const mx = (a.x + b.x) / 2 + dx * off;
                const my = (a.y + b.y) / 2 + dy * off;
                return (
                  <line
                    key={k}
                    x1={mx - dy * 11}
                    y1={my + dx * 11}
                    x2={mx + dy * 11}
                    y2={my - dx * 11}
                    stroke={ink}
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          );
        })}

        {/* Parallel-side chevron arrows (1-2 per edge, pointing along it). */}
        {(slot.side_arrows ?? []).map((count, i) => {
          const edge = edges[i];
          const nArr = Math.max(0, Math.min(2, Math.round(Number(count) || 0)));
          if (!edge || nArr === 0) return null;
          const [a, b] = edge;
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const dx = (b.x - a.x) / len;
          const dy = (b.y - a.y) / len;
          const p = labelIn(2 * n + edges.length + i);
          const ts = nArr === 1 ? [0.5] : [0.44, 0.58];
          return (
            <g key={`ar${i}`} opacity={p}>
              {ts.map((t, k) => {
                const tipX = a.x + (b.x - a.x) * t + dx * 8;
                const tipY = a.y + (b.y - a.y) * t + dy * 8;
                return (
                  <polyline
                    key={k}
                    points={`${tipX - dx * 15 - dy * 9},${tipY - dy * 15 + dx * 9} ${tipX},${tipY} ${tipX - dx * 15 + dy * 9},${tipY - dy * 15 - dx * 9}`}
                    fill="none"
                    stroke={ink}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
            </g>
          );
        })}

        {/* Named points ON an edge — midpoints, feet, problem-named points. */}
        {(slot.extra_points ?? []).map((ep, i) => {
          const edge = edges[Math.max(0, Math.min(edges.length - 1, Math.round(Number(ep.on_side) || 0)))];
          if (!edge) return null;
          const t = clamp01(Number(ep.t) || 0.5);
          const [a, b] = edge;
          const px2 = a.x + (b.x - a.x) * t;
          const py2 = a.y + (b.y - a.y) * t;
          const pos = outward(px2, py2, 36);
          const p = labelIn(2 * n + 2 * edges.length + i);
          const label = (ep.label ?? '').trim();
          return (
            <g key={`ep${i}`} opacity={p}>
              <circle cx={px2} cy={py2} r={7} fill={ink} />
              {label ? (
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle" fontFamily={displayFont} fontWeight={800} fontSize={30} fill={ink}>
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
      </>
    );
  }

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 * u, maxWidth: '100%' }}>
        {kicker ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 26 * u,
              letterSpacing: 5 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              opacity: headIn,
              transform: `translateY(${(1 - headIn) * 12 * u}px)`,
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
              fontSize: (portrait ? 52 : 58) * u,
              lineHeight: 1.05,
              color: theme.text,
              textAlign: 'center',
            }}
          >
            <KineticText text={heading} highlight={meta.style?.highlight} />
          </h1>
        ) : null}
        <div style={{ transform: fit < 1 ? `scale(${fit})` : undefined, transformOrigin: 'center top' }}>
          <svg width={W * u} height={H * u} viewBox={`0 0 ${W} ${H}`} fill="none" style={{ overflow: 'hidden' }}>
            {grid}
            {figure}
          </svg>
        </div>
      </div>

      {caption ? (
        <div
          style={{
            position: 'absolute',
            left: '6%',
            bottom: '5%',
            fontFamily: MONO_FONT,
            fontSize: 22 * u,
            color: theme.muted,
            opacity: 0.85 * headIn,
          }}
        >
          {caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------

/** One marked angle: sweeping interior arc + label on the bisector, or the
 *  right-angle square marker. Pure geometry from the figure's own points. */
const AngleGlyph: React.FC<{
  pts: Pt[];
  at: number;
  mark: AngleMark;
  progress: number;
  accent: string;
  ink: string;
  isAngleShape: boolean;
}> = ({ pts, at, mark, progress, accent, ink, isAngleShape }) => {
  const n = pts.length;
  const v = pts[at];
  const prev = isAngleShape ? pts[0] : pts[(at - 1 + n) % n];
  const next = isAngleShape ? pts[2] : pts[(at + 1) % n];
  if (!v || !prev || !next) return null;

  const a1 = Math.atan2(prev.y - v.y, prev.x - v.x);
  const a2 = Math.atan2(next.y - v.y, next.x - v.x);
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const dir = (a: number, r: number): Pt => ({ x: v.x + Math.cos(a) * r, y: v.y + Math.sin(a) * r });
  const label = (mark.label ?? '').trim();
  const bis = dir(a1 + delta / 2, 96);
  const labelP = clamp01((progress - 0.5) * 2);

  if (mark.right) {
    const s = 34;
    const p1 = dir(a1, s);
    const corner = { x: v.x + Math.cos(a1) * s + Math.cos(a2) * s, y: v.y + Math.sin(a1) * s + Math.sin(a2) * s };
    const p2 = dir(a2, s);
    return (
      <>
        <polyline
          points={`${p1.x},${p1.y} ${corner.x},${corner.y} ${p2.x},${p2.y}`}
          fill="none"
          stroke={accent}
          strokeWidth={4.5}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - progress}
        />
        {label ? (
          <text x={bis.x} y={bis.y} textAnchor="middle" dominantBaseline="middle" fontFamily={MONO_FONT} fontSize={26} fill={accent} opacity={labelP}>
            {label}
          </text>
        ) : null}
      </>
    );
  }

  const r = 56;
  const end = a1 + delta * progress;
  const start = dir(a1, r);
  const tip = dir(end, r);
  const large = 0;
  const sweep = delta > 0 ? 1 : 0;
  return (
    <>
      {progress > 0.02 ? (
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${large} ${sweep} ${tip.x} ${tip.y}`}
          fill="none"
          stroke={accent}
          strokeWidth={4.5}
          strokeLinecap="round"
        />
      ) : null}
      {label ? (
        <text x={bis.x} y={bis.y} textAnchor="middle" dominantBaseline="middle" fontFamily={MONO_FONT} fontSize={28} fill={accent} opacity={labelP}>
          {label}
        </text>
      ) : null}
    </>
  );
};

/** The circle figure: outline sweeps, radius draws, labels land. */
const CircleFigure: React.FC<{
  slot: { radius_label?: string; center_label?: string; fill?: boolean };
  frame: number;
  fps: number;
  drawP: number;
  drawDone: number;
  ink: string;
  theme: { accent: string; muted: string };
  displayFont: string;
}> = ({ slot, frame, fps, drawP, drawDone, ink, theme, displayFont }) => {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.36;
  const C = 2 * Math.PI * R;

  const radiusP = easeInOutQuint(clamp01((frame - drawDone) / f30(fps, 10)));
  const labelP = easeOutQuint(clamp01((frame - drawDone - f30(fps, 6)) / f30(fps, 9)));
  const dotPop = spring({
    frame: Math.max(0, frame - drawDone + f30(fps, 2)),
    fps,
    config: SPRINGS.settle,
    durationInFrames: Math.round(fps * 0.35),
  });
  const fillP = slot.fill ? easeOutQuint(clamp01((frame - drawDone - f30(fps, 2)) / f30(fps, 10))) : 0;

  const ang = -Math.PI / 5.5;
  const ex = cx + Math.cos(ang) * R;
  const ey = cy + Math.sin(ang) * R;
  const mx = cx + Math.cos(ang) * R * 0.5;
  const my = cy + Math.sin(ang) * R * 0.5;

  const radiusLabel = (slot.radius_label ?? '').trim();
  const centerLabel = (slot.center_label ?? '').trim();

  return (
    <>
      {slot.fill ? <circle cx={cx} cy={cy} r={R} fill={theme.accent} opacity={0.1 * fillP} /> : null}
      <circle
        cx={cx}
        cy={cy}
        r={R}
        stroke={ink}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${C * drawP} ${C}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <line
        x1={cx}
        y1={cy}
        x2={ex}
        y2={ey}
        stroke={theme.accent}
        strokeWidth={4.5}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - radiusP}
      />
      <circle cx={cx} cy={cy} r={7 * Math.min(1, dotPop)} fill={ink} />
      {radiusLabel ? (
        <text
          x={mx}
          y={my - 22}
          textAnchor="middle"
          fontFamily={MONO_FONT}
          fontSize={28}
          fill={theme.accent}
          opacity={labelP}
        >
          {radiusLabel}
        </text>
      ) : null}
      {centerLabel ? (
        <text
          x={cx - 18}
          y={cy + 34}
          textAnchor="middle"
          fontFamily={displayFont}
          fontWeight={800}
          fontSize={30}
          fill={ink}
          opacity={labelP}
        >
          {centerLabel}
        </text>
      ) : null}
    </>
  );
};

// ---------------------------------------------------------------------------

/** Picks a "nice" tick step (1/2/5 x 10^k) so a number line or plane never
 *  shows more than ~12 divisions. */
const niceStep = (range: number): number => {
  const raw = Math.max(1e-9, range / 10);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) {
    if (raw <= m * mag) return m * mag;
  }
  return 10 * mag;
};

const fmtNum = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** number_line: the line draws, integer ticks land, accent marks pop onto
 *  their values, and an optional accent segment spans [from, to] --
 *  inequalities, intervals, absolute-value beats. */
const NumberLineFigure: React.FC<{
  slot: { x_min?: number; x_max?: number; marks?: Array<{ x: number; label?: string }>; segment?: { from?: number; to?: number } | null };
  frame: number;
  fps: number;
  drawP: number;
  drawDone: number;
  ink: string;
  theme: Theme;
  displayFont: string;
}> = ({ slot, frame, fps, drawP, drawDone, ink, theme, displayFont }) => {
  const marks = (slot.marks ?? []).filter((m) => Number.isFinite(m?.x));
  let xMin = Number.isFinite(slot.x_min as number) ? (slot.x_min as number) : NaN;
  let xMax = Number.isFinite(slot.x_max as number) ? (slot.x_max as number) : NaN;
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) {
    const vals = marks.map((m) => m.x);
    const lo = vals.length ? Math.min(...vals) : 0;
    const hi = vals.length ? Math.max(...vals) : 10;
    const pad = Math.max(1, (hi - lo) * 0.3);
    xMin = Math.floor(lo - pad);
    xMax = Math.ceil(hi + pad);
  }
  const cy = H * 0.55;
  const x0 = 70;
  const x1 = W - 70;
  const px = (v: number): number => x0 + ((v - xMin) / (xMax - xMin)) * (x1 - x0);

  const step = niceStep(xMax - xMin);
  const firstTick = Math.ceil(xMin / step) * step;
  const ticks: number[] = [];
  for (let v = firstTick; v <= xMax + 1e-9; v += step) ticks.push(v);

  const tickP = easeOutQuint(clamp01((frame - drawDone + f30(fps, 6)) / f30(fps, 10)));
  const seg = slot.segment ?? null;
  const segFrom = seg && Number.isFinite(seg.from as number) ? Math.max(xMin, seg.from as number) : null;
  const segTo = seg && Number.isFinite(seg.to as number) ? Math.min(xMax, seg.to as number) : null;
  const segP = easeInOutQuint(clamp01((frame - drawDone - f30(fps, 4)) / f30(fps, 12)));

  return (
    <>
      <line
        x1={x0}
        y1={cy}
        x2={x0 + (x1 - x0) * drawP}
        y2={cy}
        stroke={ink}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <g opacity={tickP}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={px(v)} y1={cy - 12} x2={px(v)} y2={cy + 12} stroke={ink} strokeWidth={2.5} />
            <text x={px(v)} y={cy + 46} textAnchor="middle" fontFamily={MONO_FONT} fontSize={24} fill={theme.muted}>
              {fmtNum(v)}
            </text>
          </g>
        ))}
      </g>
      {segFrom != null && segTo != null && segTo > segFrom ? (
        <>
          <line
            x1={px(segFrom)}
            y1={cy}
            x2={px(segFrom) + (px(segTo) - px(segFrom)) * segP}
            y2={cy}
            stroke={theme.accent}
            strokeWidth={10}
            strokeLinecap="round"
            opacity={0.85}
          />
          <circle cx={px(segFrom)} cy={cy} r={11 * segP} fill={theme.accent} />
          <circle cx={px(segTo)} cy={cy} r={11 * clamp01((segP - 0.7) / 0.3)} fill={theme.accent} />
        </>
      ) : null}
      {marks.map((m, i) => {
        const pop = spring({
          frame: Math.max(0, frame - drawDone - i * f30(fps, 5)),
          fps,
          config: SPRINGS.pop,
          durationInFrames: Math.round(fps * 0.4),
        });
        const label = (m.label ?? '').trim() || fmtNum(m.x);
        return (
          <g key={`m${i}`}>
            <circle cx={px(m.x)} cy={cy} r={12 * Math.min(1.05, pop)} fill={theme.accent} />
            <text
              x={px(m.x)}
              y={cy - 34}
              textAnchor="middle"
              fontFamily={displayFont}
              fontWeight={800}
              fontSize={30}
              fill={theme.accent}
              opacity={Math.min(1, pop)}
            >
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
};

/** coordinate_plane: real-value points pop onto a framed plane, default
 *  "(x, y)" labels, optional line THROUGH two of them extended to the plot
 *  edges -- slope, midpoint, distance beats. No function needed. */
const CoordinatePlaneFigure: React.FC<{
  slot: {
    coords?: Array<{ x: number; y: number; label?: string }>;
    line_through?: number[];
    rise_run?: boolean;
  };
  frame: number;
  fps: number;
  drawDone: number;
  ink: string;
  theme: Theme;
  displayFont: string;
}> = ({ slot, frame, fps, drawDone, ink, theme, displayFont }) => {
  const coords = (slot.coords ?? []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y)).slice(0, 6);
  if (coords.length === 0) return null;

  const xs = coords.map((c) => c.x);
  const ys = coords.map((c) => c.y);
  const padSpan = (lo: number, hi: number): [number, number] => {
    const span = Math.max(4, (hi - lo) * 1.5);
    const mid = (lo + hi) / 2;
    return [mid - span / 2, mid + span / 2];
  };
  const [xMin, xMax] = padSpan(Math.min(...xs, 0), Math.max(...xs, 0));
  const [yMin, yMax] = padSpan(Math.min(...ys, 0), Math.max(...ys, 0));

  const x0 = 90;
  const x1 = W - 90;
  const y0 = 40;
  const y1 = H - 40;
  const px = (v: number): number => x0 + ((v - xMin) / (xMax - xMin)) * (x1 - x0);
  const py = (v: number): number => y0 + (1 - (v - yMin) / (yMax - yMin)) * (y1 - y0);

  const axisP = easeInOutQuint(clamp01((frame - f30(fps, 5)) / f30(fps, 10)));
  const axisX = px(0);
  const axisY = py(0);

  // Line through two named points, clipped to the plot rectangle.
  const lt = (slot.line_through ?? []).map((i) => coords[Math.round(Number(i))]).filter(Boolean);
  let lineSeg: [number, number, number, number] | null = null;
  if (lt.length >= 2 && (lt[0]!.x !== lt[1]!.x || lt[0]!.y !== lt[1]!.y)) {
    const pA = lt[0]!;
    const pB = lt[1]!;
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    let tMin = -Infinity;
    let tMax = Infinity;
    const clip = (d: number, lo: number, hi: number, o: number): void => {
      if (Math.abs(d) < 1e-12) return;
      const tA = (lo - o) / d;
      const tB = (hi - o) / d;
      tMin = Math.max(tMin, Math.min(tA, tB));
      tMax = Math.min(tMax, Math.max(tA, tB));
    };
    clip(dx, xMin, xMax, pA.x);
    clip(dy, yMin, yMax, pA.y);
    if (tMin < tMax) {
      lineSeg = [px(pA.x + dx * tMin), py(pA.y + dy * tMin), px(pA.x + dx * tMax), py(pA.y + dy * tMax)];
    }
  }
  const lineAt = drawDone + coords.length * f30(fps, 4) + f30(fps, 4);
  const lineP = easeInOutQuint(clamp01((frame - lineAt) / f30(fps, 14)));

  // The slope triangle: dashed legs from A across to (xB, yA), then up to B,
  // labelled Δx / Δy — the picture "rise over run" IS. Drawn after the line.
  const rr = slot.rise_run && lt.length >= 2 ? { a: lt[0]!, b: lt[1]! } : null;
  const rrP = rr ? easeInOutQuint(clamp01((frame - lineAt - f30(fps, 12)) / f30(fps, 14))) : 0;

  return (
    <>
      <g opacity={axisP}>
        <line x1={x0} y1={axisY} x2={x1} y2={axisY} stroke={hairline(theme, 0.4)} strokeWidth={2.5} />
        <line x1={axisX} y1={y0} x2={axisX} y2={y1} stroke={hairline(theme, 0.4)} strokeWidth={2.5} />
        <text x={x1 - 6} y={axisY - 12} textAnchor="end" fontFamily={MONO_FONT} fontSize={22} fill={theme.muted}>x</text>
        <text x={axisX + 14} y={y0 + 20} fontFamily={MONO_FONT} fontSize={22} fill={theme.muted}>y</text>
      </g>
      {lineSeg && lineP > 0.01 ? (
        <line
          x1={lineSeg[0]}
          y1={lineSeg[1]}
          x2={lineSeg[0] + (lineSeg[2] - lineSeg[0]) * lineP}
          y2={lineSeg[1] + (lineSeg[3] - lineSeg[1]) * lineP}
          stroke={theme.accent}
          strokeWidth={5}
          strokeLinecap="round"
          opacity={0.85}
        />
      ) : null}
      {rr && rrP > 0.01
        ? (() => {
            const A = rr.a;
            const B = rr.b;
            const corner = { x: px(B.x), y: py(A.y) };
            const runP = clamp01(rrP * 2);
            const riseP = clamp01((rrP - 0.5) * 2);
            const labelP = clamp01((rrP - 0.8) / 0.2);
            const dx = fmtNum(B.x - A.x);
            const dy = fmtNum(B.y - A.y);
            const runMidX = (px(A.x) + corner.x) / 2;
            const riseMidY = (corner.y + py(B.y)) / 2;
            const below = py(A.y) <= py(B.y);
            return (
              <g>
                <line
                  x1={px(A.x)}
                  y1={py(A.y)}
                  x2={px(A.x) + (corner.x - px(A.x)) * runP}
                  y2={py(A.y)}
                  stroke={ink}
                  strokeWidth={3.5}
                  strokeDasharray="10 8"
                />
                {riseP > 0 ? (
                  <line
                    x1={corner.x}
                    y1={corner.y}
                    x2={corner.x}
                    y2={corner.y + (py(B.y) - corner.y) * riseP}
                    stroke={ink}
                    strokeWidth={3.5}
                    strokeDasharray="10 8"
                  />
                ) : null}
                <text
                  x={runMidX}
                  y={py(A.y) + (below ? -16 : 34)}
                  textAnchor="middle"
                  fontFamily={MONO_FONT}
                  fontSize={26}
                  fill={ink}
                  opacity={labelP}
                >
                  {`Δx = ${dx}`}
                </text>
                <text
                  x={corner.x + 16}
                  y={riseMidY}
                  dominantBaseline="middle"
                  fontFamily={MONO_FONT}
                  fontSize={26}
                  fill={ink}
                  opacity={labelP}
                >
                  {`Δy = ${dy}`}
                </text>
              </g>
            );
          })()
        : null}
      {coords.map((c, i) => {
        const pop = spring({
          frame: Math.max(0, frame - drawDone - i * f30(fps, 4)),
          fps,
          config: SPRINGS.settle,
          durationInFrames: Math.round(fps * 0.35),
        });
        const label = (c.label ?? '').trim() || `(${fmtNum(c.x)}, ${fmtNum(c.y)})`;
        const above = py(c.y) > H / 2;
        return (
          <g key={i}>
            <circle cx={px(c.x)} cy={py(c.y)} r={11 * Math.min(1.05, pop)} fill={theme.accent} />
            <text
              x={px(c.x)}
              y={py(c.y) + (above ? -28 : 42)}
              textAnchor="middle"
              fontFamily={MONO_FONT}
              fontSize={26}
              fill={ink}
              opacity={Math.min(1, pop)}
            >
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
};

/**
 * unit_circle: the trig / complex-number figure. Axes, the unit circle, then a
 * radius SWINGS from 0 to its angle (the arc sweeping with it) and the point
 * lands on the circumference. A second angle can swing after the first, so a
 * beat can show one angle turning into another — which is what "raising to the
 * n multiplies the angle" actually looks like. Angles arrive in degrees
 * (what a model writes reliably) and are drawn counter-clockwise from the
 * positive x-axis, the maths convention — so the y term is NEGATED into
 * screen space, where y grows downward.
 */
const UnitCircleFigure: React.FC<{
  slot: {
    angle_deg?: number;
    angle2_deg?: number;
    angle_label?: string;
    angle2_label?: string;
    point_label?: string;
    show_coords?: boolean;
  };
  frame: number;
  fps: number;
  drawP: number;
  drawDone: number;
  ink: string;
  theme: Theme;
  displayFont: string;
}> = ({ slot, frame, fps, drawP, drawDone, ink, theme, displayFont }) => {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.34;
  const C = 2 * Math.PI * R;

  const a1 = Number.isFinite(slot.angle_deg as number) ? (slot.angle_deg as number) : null;
  const a2 = Number.isFinite(slot.angle2_deg as number) ? (slot.angle2_deg as number) : null;

  // Screen space: y grows downward, so a maths angle is negated.
  const at = (deg: number, r: number): { x: number; y: number } => ({
    x: cx + Math.cos((deg * Math.PI) / 180) * r,
    y: cy - Math.sin((deg * Math.PI) / 180) * r,
  });

  const axisP = easeOutQuint(clamp01((frame - f30(fps, 2)) / f30(fps, 8)));
  const swing1 = easeInOutQuint(clamp01((frame - drawDone) / f30(fps, 16)));
  const swing2 = easeInOutQuint(clamp01((frame - drawDone - f30(fps, 22)) / f30(fps, 16)));

  // Two angles share a vertex, so their arcs are concentric at DIFFERENT radii
  // and each label sits in the clear ring between its own arc and the next —
  // one radius for both would stack the arcs and collide the labels.
  const solo = a2 == null;
  const ARC_R = { a1: R * (solo ? 0.26 : 0.2), a2: R * 0.46 };
  const LABEL_R = { a1: solo ? R * 0.26 + 42 : R * 0.32, a2: R * 0.46 + 44 };

  /** One radius + its swept arc + the point where it meets the circle. */
  const ray = (deg: number, p: number, color: string, label: string, showPoint: boolean, key: 'a1' | 'a2') => {
    if (p <= 0) return null;
    const cur = deg * p;
    const tip = at(cur, R);
    const arcR = ARC_R[key];
    const arcEnd = at(cur, arcR);
    const arcStart = at(0, arcR);
    // >180° needs the large-arc flag or SVG takes the short way round.
    const large = Math.abs(cur) > 180 ? 1 : 0;
    const labelPos = at(cur / 2, LABEL_R[key]);
    const pop = spring({
      frame: Math.max(0, frame - drawDone - (key === 'a2' ? f30(fps, 38) : f30(fps, 16))),
      fps,
      config: SPRINGS.pop,
      durationInFrames: Math.round(fps * 0.4),
    });

    return (
      <g key={key}>
        {cur > 0.5 ? (
          <path
            d={`M ${arcStart.x} ${arcStart.y} A ${arcR} ${arcR} 0 ${large} 0 ${arcEnd.x} ${arcEnd.y}`}
            fill="none"
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.9}
          />
        ) : null}
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke={color} strokeWidth={5} strokeLinecap="round" />
        {showPoint ? <circle cx={tip.x} cy={tip.y} r={11 * Math.min(1.05, Math.max(0, pop))} fill={color} /> : null}
        {label && p > 0.6 ? (
          <text
            x={labelPos.x}
            y={labelPos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={displayFont}
            fontWeight={800}
            fontSize={32}
            fill={color}
            opacity={clamp01((p - 0.6) / 0.4)}
          >
            {mathLabel(label)}
          </text>
        ) : null}
      </g>
    );
  };

  const pointLabel = (slot.point_label ?? '').trim();
  const showCoords = !!slot.show_coords;
  // The point names itself off the LAST angle drawn — that is the one the beat
  // is about.
  const nameAngle = a2 ?? a1;
  const namePos = nameAngle != null ? at(nameAngle, R + 66) : null;
  const nameP = easeOutQuint(clamp01((frame - drawDone - f30(fps, a2 != null ? 40 : 20)) / f30(fps, 10)));
  const nameText =
    pointLabel !== ''
      ? pointLabel
      : showCoords && nameAngle != null
        ? `(${fmtNum(Math.cos((nameAngle * Math.PI) / 180))}, ${fmtNum(Math.sin((nameAngle * Math.PI) / 180))})`
        : '';

  return (
    <>
      <g opacity={axisP}>
        <line x1={cx - R * 1.45} y1={cy} x2={cx + R * 1.45} y2={cy} stroke={hairline(theme, 0.4)} strokeWidth={2.5} />
        <line x1={cx} y1={cy - R * 1.45} x2={cx} y2={cy + R * 1.45} stroke={hairline(theme, 0.4)} strokeWidth={2.5} />
        <text x={cx + R * 1.45 - 4} y={cy - 14} textAnchor="end" fontFamily={MONO_FONT} fontSize={22} fill={theme.muted}>
          Re
        </text>
        <text x={cx + 14} y={cy - R * 1.45 + 18} fontFamily={MONO_FONT} fontSize={22} fill={theme.muted}>
          Im
        </text>
        <text x={cx + R + 10} y={cy + 30} fontFamily={MONO_FONT} fontSize={20} fill={theme.muted}>
          1
        </text>
      </g>
      <circle
        cx={cx}
        cy={cy}
        r={R}
        fill="none"
        stroke={ink}
        strokeWidth={4}
        strokeDasharray={`${C * drawP} ${C}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* The first angle stays visible in ink once the second swings past it —
          the comparison IS the point. */}
      {a1 != null
        ? ray(a1, swing1, a2 != null ? ink : theme.accent, (slot.angle_label ?? '').trim(), a2 == null, 'a1')
        : null}
      {a2 != null ? ray(a2, swing2, theme.accent, (slot.angle2_label ?? '').trim(), true, 'a2') : null}
      <circle cx={cx} cy={cy} r={6} fill={ink} opacity={axisP} />
      {nameText && namePos ? (
        <text
          x={namePos.x}
          y={namePos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily={displayFont}
          fontWeight={800}
          fontSize={30}
          fill={theme.accent}
          opacity={nameP}
        >
          {mathLabel(nameText)}
        </text>
      ) : null}
    </>
  );
};

/** fraction_bar: a bar of `denominator` cells outlines itself, `numerator`
 *  cells flood accent one by one, and the fraction typesets beside it --
 *  arithmetic and proportion beats. */
const FractionBarFigure: React.FC<{
  slot: { numerator?: number; denominator?: number };
  frame: number;
  fps: number;
  ink: string;
  theme: Theme;
  displayFont: string;
}> = ({ slot, frame, fps, ink, theme, displayFont }) => {
  const den = Math.max(1, Math.min(24, Math.round(Number(slot.denominator) || 1)));
  const num = Math.max(0, Math.min(den, Math.round(Number(slot.numerator) || 0)));

  const barX = 320;
  const barW = W - barX - 80;
  const barY = H / 2 - 70;
  const barH = 140;
  const cellW = barW / den;

  const outlineP = easeOutQuint(clamp01((frame - f30(fps, 8)) / f30(fps, 12)));
  const fillAt = (i: number): number => f30(fps, 22) + i * f30(fps, 4);

  const fracX = 170;
  const fracMid = H / 2;

  return (
    <>
      {/* The fraction itself, stacked, beside the bar. */}
      <g opacity={outlineP}>
        <text x={fracX} y={fracMid - 28} textAnchor="middle" fontFamily={displayFont} fontWeight={800} fontSize={84} fill={theme.accent}>
          {num}
        </text>
        <line x1={fracX - 62} y1={fracMid} x2={fracX + 62} y2={fracMid} stroke={ink} strokeWidth={6} strokeLinecap="round" />
        <text x={fracX} y={fracMid + 86} textAnchor="middle" fontFamily={displayFont} fontWeight={800} fontSize={84} fill={ink}>
          {den}
        </text>
      </g>
      {/* Cells: filled ones flood accent one by one. */}
      {Array.from({ length: den }, (_, i) => {
        const fillP = i < num ? easeOutQuint(clamp01((frame - fillAt(i)) / f30(fps, 8))) : 0;
        return (
          <g key={i}>
            {fillP > 0 ? (
              <rect
                x={barX + i * cellW + 3}
                y={barY + 3 + (barH - 6) * (1 - fillP)}
                width={cellW - 6}
                height={(barH - 6) * fillP}
                fill={theme.accent}
                opacity={0.9}
              />
            ) : null}
            <rect
              x={barX + i * cellW}
              y={barY}
              width={cellW}
              height={barH}
              stroke={ink}
              strokeWidth={3}
              fill="none"
              opacity={outlineP}
            />
          </g>
        );
      })}
    </>
  );
};
