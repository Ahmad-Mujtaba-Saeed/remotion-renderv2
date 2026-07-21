import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, PlotMark } from '../types';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeInOutQuint, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { compileExpression } from '../math/expr';
import { MathText } from '../math/mathText';
import { KineticText } from '../components/KineticText';
import { SfxCue } from '../sfx';

/**
 * function_plot — y = f(x), drawn live. The analyzer emits a calculator-style
 * expression ("x^2 - 4", "sin(x)", "2^x"); the bundled evaluator (no eval,
 * fully deterministic) samples it, the axes + faint grid land first, then the
 * curve draws itself left-to-right and labelled marks pop onto their exact
 * (x, f(x)) points. Discontinuities (1/x) break the stroke instead of drawing
 * through the asymptote. One chime when the curve completes — the landmark.
 *
 * If the expression doesn't compile the card degrades gracefully: the
 * expression typesets big in the centre and the scene still reads.
 */

const W = 1200;
const H = 600;
const PAD_X = 90;
const PAD_Y = 60;

export const FunctionPlot: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_plot'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width: frameW, height: frameH } = useVideoConfig();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;
  const expression = (slot.expression ?? '').trim();
  if (expression === '') return null;

  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const heading = (slot.heading ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));
  const portrait = frameH > frameW;
  const fit = Math.min(1, (frameW * (portrait ? 0.94 : 0.84)) / (W * u));
  const at = win?.start ?? 0;

  const fn = compileExpression(expression);
  // Optional second curve (comparisons/intersections) — drawn in ink, after
  // the accent curve. A non-compiling second expression is simply ignored.
  const expression2 = (slot.expression2 ?? '').trim();
  const fn2 = expression2 !== '' ? compileExpression(expression2) : null;

  // ---- Sample the function(s) ----------------------------------------------
  let xMin = typeof slot.x_min === 'number' && Number.isFinite(slot.x_min) ? slot.x_min : -5;
  let xMax = typeof slot.x_max === 'number' && Number.isFinite(slot.x_max) ? slot.x_max : 5;
  if (xMax <= xMin) [xMin, xMax] = [Math.min(xMin, xMax) - 1, Math.max(xMin, xMax) + 1];

  const N = 240;
  const sampleFn = (f: (x: number) => number): Array<{ x: number; y: number } | null> => {
    const out: Array<{ x: number; y: number } | null> = [];
    for (let i = 0; i <= N; i++) {
      const x = xMin + ((xMax - xMin) * i) / N;
      const y = f(x);
      out.push(Number.isFinite(y) ? { x, y } : null);
    }
    return out;
  };
  const samples = fn ? sampleFn(fn) : [];
  const samples2 = fn2 ? sampleFn(fn2) : [];
  const finite = [...samples, ...samples2].filter((s): s is { x: number; y: number } => s !== null);

  // Fallback: no compilable curve — typeset the expression instead.
  if (!fn || finite.length < 8) {
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '8%', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center' }}>
          {kicker ? (
            <div style={{ fontFamily: MONO_FONT, fontSize: 26 * u, letterSpacing: 5 * u, textTransform: 'uppercase', color: theme.accent, marginBottom: 20 * u, opacity: headIn }}>
              {kicker}
            </div>
          ) : null}
          <MathText
            expr={`y = ${expression}`}
            color={theme.text}
            style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 76 * u, opacity: headIn, justifyContent: 'center' }}
          />
          {caption ? (
            <div style={{ marginTop: 24 * u, fontFamily: MONO_FONT, fontSize: 24 * u, color: theme.muted, opacity: headIn }}>
              {caption}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }

  // ---- Frame the plot ------------------------------------------------------
  let yMin = Math.min(...finite.map((s) => s.y));
  let yMax = Math.max(...finite.map((s) => s.y));
  if (yMax - yMin < 1e-9) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad;
  yMax += yPad;

  const px = (x: number): number => PAD_X + ((x - xMin) / (xMax - xMin)) * (W - 2 * PAD_X);
  const py = (y: number): number => PAD_Y + (1 - (y - yMin) / (yMax - yMin)) * (H - 2 * PAD_Y);

  // ---- Clocks ---------------------------------------------------------------
  const gridP = easeOutQuint(clamp01((frame - f30(fps, 2)) / f30(fps, 10)));
  const axisP = easeInOutQuint(clamp01((frame - f30(fps, 5)) / f30(fps, 10)));
  const drawAt = f30(fps, 14);
  const drawDur = f30(fps, 28);
  const drawP = easeInOutQuint(clamp01((frame - drawAt) / drawDur));
  const doneAt = drawAt + drawDur;

  // ---- Curve path, revealed left-to-right, broken at asymptotes ------------
  const yRange = yMax - yMin;
  const buildPath = (
    src: Array<{ x: number; y: number } | null>,
    reveal: number
  ): string => {
    const upTo = Math.floor(reveal * N);
    let d = '';
    let pen = false;
    for (let i = 0; i <= upTo; i++) {
      const s = src[i];
      const prev = i > 0 ? src[i - 1] : null;
      if (!s) {
        pen = false;
        continue;
      }
      // A jump larger than the whole visible range = asymptote crossing.
      if (pen && prev && Math.abs(s.y - prev.y) > yRange * 2) {
        pen = false;
      }
      d += pen
        ? ` L ${px(s.x).toFixed(2)} ${py(clampY(s.y, yMin, yMax)).toFixed(2)}`
        : ` M ${px(s.x).toFixed(2)} ${py(clampY(s.y, yMin, yMax)).toFixed(2)}`;
      pen = true;
    }
    return d;
  };
  const d = buildPath(samples, drawP);
  // The second curve draws right after the first completes.
  const draw2P = fn2 ? easeInOutQuint(clamp01((frame - doneAt) / f30(fps, 22))) : 0;
  const d2 = fn2 ? buildPath(samples2, draw2P) : '';
  const done2At = fn2 ? doneAt + f30(fps, 22) : doneAt;

  // Axes sit at 0 when 0 is in range, else hug the plot edge.
  const axisY = py(0 >= yMin && 0 <= yMax ? 0 : yMin);
  const axisX = px(0 >= xMin && 0 <= xMax ? 0 : xMin);

  // ---- Shaded region under the primary curve (integral/area beats) ---------
  const shade = slot.shade ?? null;
  let shadePath = '';
  if (fn && shade && (Number.isFinite(shade.from as number) || Number.isFinite(shade.to as number))) {
    const sFrom = Math.max(xMin, Number.isFinite(shade.from as number) ? (shade.from as number) : xMin);
    const sTo = Math.min(xMax, Number.isFinite(shade.to as number) ? (shade.to as number) : xMax);
    if (sTo > sFrom) {
      const baseY = py(0 >= yMin && 0 <= yMax ? 0 : yMin);
      const steps = 80;
      let top = '';
      for (let i = 0; i <= steps; i++) {
        const x = sFrom + ((sTo - sFrom) * i) / steps;
        const y = clampY(fn(x), yMin, yMax);
        top += `${i === 0 ? 'M' : 'L'} ${px(x).toFixed(2)} ${py(y).toFixed(2)} `;
      }
      shadePath = `${top} L ${px(sTo).toFixed(2)} ${baseY.toFixed(2)} L ${px(sFrom).toFixed(2)} ${baseY.toFixed(2)} Z`;
    }
  }
  const shadeP = easeOutQuint(clamp01((frame - doneAt + f30(fps, 8)) / f30(fps, 12)));

  // ---- Tangent line at a point (slope/derivative beats) --------------------
  const tangentAt = typeof slot.tangent_at === 'number' && Number.isFinite(slot.tangent_at) ? slot.tangent_at : null;
  let tangent: { x1: number; y1: number; x2: number; y2: number; tx: number; ty: number } | null = null;
  if (fn && tangentAt != null && tangentAt >= xMin && tangentAt <= xMax) {
    const y0 = fn(tangentAt);
    const h = (xMax - xMin) / 2000;
    const slope = (fn(tangentAt + h) - fn(tangentAt - h)) / (2 * h);
    if (Number.isFinite(y0) && Number.isFinite(slope)) {
      // Extend the tangent a fixed fraction of the domain each side.
      const dx = (xMax - xMin) * 0.28;
      tangent = {
        x1: px(tangentAt - dx),
        y1: py(clampY(y0 - slope * dx, yMin, yMax)),
        x2: px(tangentAt + dx),
        y2: py(clampY(y0 + slope * dx, yMin, yMax)),
        tx: px(tangentAt),
        ty: py(clampY(y0, yMin, yMax)),
      };
    }
  }
  const tangentP = easeInOutQuint(clamp01((frame - doneAt - f30(fps, 2)) / f30(fps, 14)));

  const marks: PlotMark[] = (slot.marks ?? []).filter(
    (m): m is PlotMark => typeof m === 'object' && m !== null && typeof m.x === 'number' && m.x >= xMin && m.x <= xMax
  );

  const fmt = (v: number): string => {
    const r = Math.round(v * 100) / 100;
    return Object.is(r, -0) ? '0' : String(r);
  };

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      <SfxCue name="chime" at={at + done2At} volume={1} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 * u, maxWidth: '100%' }}>
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
              fontSize: fitText(heading, {
                  width: frameW * (portrait ? 0.86 : 0.78),
                  max: 58 * u,
                  min: 30 * u,
                  maxLines: 2,
                  font: displayFont,
                  weight: 900,
                }),
              lineHeight: 1.05,
              color: theme.text,
              textAlign: 'center',
            }}
          >
            <KineticText text={heading} highlight={meta.style?.highlight} />
          </h1>
        ) : null}

        <div style={{ position: 'relative', transform: fit < 1 ? `scale(${fit})` : undefined, transformOrigin: 'center top' }}>
          <svg width={W * u} height={H * u} viewBox={`0 0 ${W} ${H}`} fill="none" style={{ overflow: 'hidden' }}>
            {/* Graph paper */}
            <g opacity={gridP}>
              {Array.from({ length: 13 }, (_, i) => (
                <line key={`v${i}`} x1={(i * W) / 12} y1={0} x2={(i * W) / 12} y2={H} stroke={hairline(theme, 0.07)} strokeWidth={1.5} />
              ))}
              {Array.from({ length: 7 }, (_, i) => (
                <line key={`h${i}`} x1={0} y1={(i * H) / 6} x2={W} y2={(i * H) / 6} stroke={hairline(theme, 0.07)} strokeWidth={1.5} />
              ))}
            </g>

            {/* Axes grow outward from the origin in both directions */}
            <g opacity={axisP}>
              <line
                x1={axisX + (PAD_X - axisX) * axisP}
                y1={axisY}
                x2={axisX + (W - PAD_X - axisX) * axisP}
                y2={axisY}
                stroke={hairline(theme, 0.4)}
                strokeWidth={2.5}
              />
              <line
                x1={axisX}
                y1={axisY + (PAD_Y - axisY) * axisP}
                x2={axisX}
                y2={axisY + (H - PAD_Y - axisY) * axisP}
                stroke={hairline(theme, 0.4)}
                strokeWidth={2.5}
              />
            </g>

            {/* Shaded region under the curve (revealed after the draw). */}
            {shadePath !== '' && shadeP > 0.01 ? (
              <path d={shadePath} fill={theme.accent} opacity={0.16 * shadeP} />
            ) : null}

            {/* Second curve (ink) — comparisons / intersections. */}
            {d2 !== '' ? <path d={d2} stroke={theme.text} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} /> : null}

            {/* Primary curve (accent). */}
            {d !== '' ? <path d={d} stroke={theme.accent} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" /> : null}

            {/* Tangent line + touch point. */}
            {tangent && tangentP > 0.01 ? (
              <g>
                <line
                  x1={tangent.x1}
                  y1={tangent.y1}
                  x2={tangent.x1 + (tangent.x2 - tangent.x1) * tangentP}
                  y2={tangent.y1 + (tangent.y2 - tangent.y1) * tangentP}
                  stroke={theme.text}
                  strokeWidth={3.5}
                  strokeDasharray="10 8"
                  strokeLinecap="round"
                  opacity={0.7}
                />
                <circle cx={tangent.tx} cy={tangent.ty} r={11 * clamp01((tangentP - 0.3) / 0.7)} fill={theme.text} />
              </g>
            ) : null}

            {/* Marked points pop onto the curve after the draw */}
            {marks.map((m, i) => {
              const y = fn(m.x);
              if (!Number.isFinite(y) || y < yMin || y > yMax) return null;
              const pop = spring({
                frame: Math.max(0, frame - doneAt - i * f30(fps, 5)),
                fps,
                config: SPRINGS.pop,
                durationInFrames: Math.round(fps * 0.4),
              });
              const label = (m.label ?? '').trim() || `(${fmt(m.x)}, ${fmt(y)})`;
              const above = py(y) > H / 2;
              return (
                <g key={`m${i}`}>
                  <circle cx={px(m.x)} cy={py(y)} r={11 * Math.min(1.06, pop)} fill={theme.accent} />
                  <circle cx={px(m.x)} cy={py(y)} r={18} stroke={theme.accent} strokeWidth={2.5} opacity={0.5 * Math.min(1, pop)} />
                  <text
                    x={px(m.x)}
                    y={py(y) + (above ? -34 : 46)}
                    textAnchor="middle"
                    fontFamily={MONO_FONT}
                    fontSize={26}
                    fill={theme.text}
                    opacity={Math.min(1, pop)}
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* Domain labels */}
            <g opacity={axisP}>
              <text x={PAD_X} y={axisY + 34} textAnchor="middle" fontFamily={MONO_FONT} fontSize={24} fill={theme.muted}>
                {fmt(xMin)}
              </text>
              <text x={W - PAD_X} y={axisY + 34} textAnchor="middle" fontFamily={MONO_FONT} fontSize={24} fill={theme.muted}>
                {fmt(xMax)}
              </text>
            </g>
          </svg>

          {/* The equation chip(s) ride the plot's top-left corner */}
          <div
            style={{
              position: 'absolute',
              left: PAD_X * u * fitSafe(fit),
              top: 6 * u,
              display: 'flex',
              flexDirection: 'column',
              gap: 4 * u,
              opacity: headIn,
            }}
          >
            <MathText
              expr={`y = ${expression}`}
              color={theme.accent}
              style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 38 * u }}
            />
            {fn2 ? (
              <MathText
                expr={`y = ${expression2}`}
                color={theme.text}
                style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 32 * u, opacity: draw2P > 0 ? 1 : 0.4 }}
              />
            ) : null}
          </div>
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

const clampY = (y: number, yMin: number, yMax: number): number =>
  Math.max(yMin - (yMax - yMin), Math.min(yMax + (yMax - yMin), y));

const fitSafe = (fit: number): number => (fit < 1 ? fit : 1);
