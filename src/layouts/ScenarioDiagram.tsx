import React from 'react';
import { AbsoluteFill, Img, useVideoConfig, spring } from 'remotion';
import { Scene, ScenarioEntity, ScenarioConnector } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, inkOn, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeInOutQuint, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { KineticText } from '../components/KineticText';
import { InlineMathText } from '../math/mathText';
import { IconStroke } from '../icons/IconStroke';
import { SfxCue } from '../sfx';

/**
 * scenario_diagram — the word-problem SETUP, drawn the way a teacher sketches
 * it before touching the algebra: each actor is a labelled box (car, tank,
 * worker) with its GIVEN value written underneath, and the relationship rides
 * a connector between them. The question mark of the problem lands last as an
 * accent chip.
 *
 * The SHAPE of the sketch matches the situation (slot.layout):
 *   line  — actors on one baseline, straight arrows (two cars approaching,
 *           A→B distance). The original layout; the default.
 *   arc   — up and back down: end actors on a ground line, the path is a
 *           real parabola with a dashed trajectory ghost (projectiles,
 *           thrown balls). A teacher would never draw a projectile flat.
 *   climb — bottom-left to top-right (rockets rising, tanks filling,
 *           growth to a peak).
 *   fall  — top-left to bottom-down (dropped objects, draining).
 *
 * The boxes pop in reading order, each connector draws toward the next box,
 * so the problem is assembled in front of the viewer — then the working that
 * follows has something to point back at.
 *
 * Flat design rules hold: outlines, solid fills, stroke draws; no shadows.
 * Portrait stacks the line chain vertically; shaped layouts keep their shape
 * on a taller, narrower stage.
 */

type ScenarioLayout = 'line' | 'arc' | 'climb' | 'fall' | 'compare' | 'split' | 'cycle';

type Pt = { x: number; y: number };

const CURVE_LAYOUTS: ScenarioLayout[] = ['arc', 'climb', 'fall'];
const KNOWN_LAYOUTS: ScenarioLayout[] = ['arc', 'climb', 'fall', 'compare', 'split', 'cycle'];

export const ScenarioDiagram: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_scenario'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width, height } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;
  const entities: ScenarioEntity[] = (slot.entities ?? [])
    .filter((e): e is ScenarioEntity => !!e && typeof e === 'object' && (e.label ?? '').trim() !== '')
    .slice(0, 4);
  if (entities.length < 2) return null;
  const connectors: ScenarioConnector[] = slot.connectors ?? [];
  const question = (slot.question ?? '').trim();
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const layout: ScenarioLayout = KNOWN_LAYOUTS.includes(slot.layout as ScenarioLayout)
    ? (slot.layout as ScenarioLayout)
    : 'line';
  const curveShaped = CURVE_LAYOUTS.includes(layout);

  const portrait = height > width;
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  // ---- Beat clock: box 0 → connector 0 → box 1 → ... → question ------------
  const boxAt = (i: number): number => f30(fps, (heading ? 18 : 10) + i * 22);
  const connAt = (i: number): number => boxAt(i) + f30(fps, 11);
  const questionAt = boxAt(entities.length - 1) + f30(fps, 14);

  const n = entities.length;
  const shaped = layout !== 'line';
  const boxW = (portrait ? (shaped ? 300 : 620) : shaped ? 330 : Math.min(360, 1180 / n)) * u;
  const boxH = (portrait ? (shaped ? 190 : 210) : shaped ? 210 : 230) * u;
  const gap = (portrait ? 150 : Math.min(230, 640 / (n - 1))) * u;

  // The inner content of one actor: box (or free sprite) + label + value.
  // Shared by both modes; the wrapper decides where it sits.
  const entityInner = (e: ScenarioEntity, i: number, drift: Pt): React.ReactNode => {
    const pop = spring({
      frame: Math.max(0, frame - boxAt(i)),
      fps,
      config: SPRINGS.settle,
      durationInFrames: Math.round(fps * 0.4),
    });
    const iconP = clamp01((frame - boxAt(i) - f30(fps, 2)) / f30(fps, 12));
    const valueP = easeOutQuint(clamp01((frame - boxAt(i) - f30(fps, 6)) / f30(fps, 9)));
    const value = (e.value ?? '').trim();
    const sprite = (e.sprite_url ?? '').trim();
    // Emphasis lifts one actor out of the crowd — the star of the question,
    // the "winner", the branch that pays off — with an accent frame and label.
    const emphasized = e.emphasis === 'key' || e.emphasis === 'accent';
    const frameColor = emphasized ? theme.accent : theme.text;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14 * u,
          opacity: Math.min(1, pop * 1.3),
          transform: `scale(${0.92 + 0.08 * Math.min(1.04, pop)}) translate(${drift.x}px, ${drift.y}px)`,
        }}
      >
        {sprite ? (
          <div
            style={{
              width: boxW,
              height: boxH,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8 * u,
            }}
          >
            <Img
              src={sprite}
              style={{
                maxWidth: '92%',
                maxHeight: boxH - 44 * u,
                objectFit: 'contain',
                opacity: Math.min(1, iconP * 1.6),
              }}
            />
            <div
              style={{
                fontFamily: displayFont,
                fontWeight: 800,
                fontSize: 30 * u,
                color: frameColor,
                textAlign: 'center',
              }}
            >
              {e.label}
            </div>
          </div>
        ) : (
          <div
            style={{
              width: boxW,
              height: boxH,
              border: `${Math.max(2.5, (emphasized ? 5 : 4) * u)}px solid ${frameColor}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10 * u,
              // Transparent so a board render keeps its graph paper showing
              // through — the box reads as drawn ON the surface, not stuck over
              // it. Full-frame renders sit on the ambient background anyway.
              background: 'transparent',
            }}
          >
            {e.icon ? <IconStroke name={e.icon} progress={iconP} size={64 * u} color={theme.accent} strokeWidth={2} /> : null}
            <div
              style={{
                fontFamily: displayFont,
                fontWeight: 800,
                fontSize: (shaped ? 30 : 34) * u,
                color: frameColor,
                textAlign: 'center',
                padding: `0 ${16 * u}px`,
              }}
            >
              {e.label}
            </div>
          </div>
        )}
        {value ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 27 * u,
              color: theme.accent,
              opacity: valueP,
              transform: `translateY(${(1 - valueP) * 8 * u}px)`,
              textAlign: 'center',
            }}
          >
            <InlineMathText text={value} />
          </div>
        ) : null}
      </div>
    );
  };

  const qPop = spring({
    frame: Math.max(0, frame - questionAt),
    fps,
    config: SPRINGS.pop,
    durationInFrames: Math.round(fps * 0.4),
  });

  const questionChip = question ? (
    <div
      style={{
        background: theme.accent,
        color: inkOn(theme.accent),
        fontFamily: displayFont,
        fontWeight: 800,
        fontSize: 34 * u,
        padding: `${12 * u}px ${26 * u}px`,
        opacity: Math.min(1, qPop * 1.4),
        transform: `scale(${0.9 + 0.1 * Math.min(1.05, qPop)})`,
        whiteSpace: 'nowrap',
      }}
    >
      <InlineMathText text={question} />
    </div>
  ) : null;

  // ======================= LINE (the original chain) =======================

  const lineEntity = (e: ScenarioEntity, i: number): React.ReactNode => {
    // The FIRST entity's sprite drifts a little toward its connector once the
    // arrow is drawn: the car pulls away toward the destination.
    const sprite = (e.sprite_url ?? '').trim();
    const drift =
      sprite && i === 0 && n > 1 && !portrait
        ? easeInOutQuint(clamp01((frame - connAt(0) - f30(fps, 10)) / f30(fps, 70))) * 22 * u
        : 0;
    return <div key={`e${i}`}>{entityInner(e, i, { x: drift, y: 0 })}</div>;
  };

  const lineConnector = (i: number): React.ReactNode => {
    const c = connectors[i] ?? {};
    const style = c.style === 'line' || c.style === 'both' ? c.style : 'arrow';
    const p = easeInOutQuint(clamp01((frame - connAt(i)) / f30(fps, 12)));
    const labelP = easeOutQuint(clamp01((frame - connAt(i) - f30(fps, 6)) / f30(fps, 9)));
    const label = (c.label ?? '').trim();
    const sub = (c.sub ?? '').trim();
    const L = portrait ? 110 * u : gap;
    const T = 12 * u; // arrowhead size
    const sw = Math.max(2.5, 4 * u);

    // Horizontal in landscape, vertical in portrait — one SVG each way.
    const svg = portrait ? (
      <svg width={T * 3} height={L} viewBox={`0 0 ${T * 3} ${L}`} fill="none" style={{ overflow: 'visible' }}>
        <line x1={T * 1.5} y1={0} x2={T * 1.5} y2={L * p - (style !== 'line' ? T : 0)} stroke={theme.text} strokeWidth={sw} strokeLinecap="round" />
        {style !== 'line' && p > 0.75 ? (
          <polyline
            points={`${T * 0.6},${L - T * 1.4} ${T * 1.5},${L - 2} ${T * 2.4},${L - T * 1.4}`}
            stroke={theme.text}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={clamp01((p - 0.75) / 0.25)}
          />
        ) : null}
      </svg>
    ) : (
      <svg width={L} height={T * 3} viewBox={`0 0 ${L} ${T * 3}`} fill="none" style={{ overflow: 'visible' }}>
        <line x1={0} y1={T * 1.5} x2={L * p - (style !== 'line' ? T : 0)} y2={T * 1.5} stroke={theme.text} strokeWidth={sw} strokeLinecap="round" />
        {style === 'both' ? (
          <polyline
            points={`${T * 1.4},${T * 0.6} ${2},${T * 1.5} ${T * 1.4},${T * 2.4}`}
            stroke={theme.text}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={clamp01(p * 2)}
          />
        ) : null}
        {style !== 'line' && p > 0.75 ? (
          <polyline
            points={`${L - T * 1.4},${T * 0.6} ${L - 2},${T * 1.5} ${L - T * 1.4},${T * 2.4}`}
            stroke={theme.text}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={clamp01((p - 0.75) / 0.25)}
          />
        ) : null}
      </svg>
    );

    return (
      <div
        key={`c${i}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8 * u,
          // Sit the connector on the boxes' vertical middle, not the column's
          // (values under a box would otherwise push the line off-axis).
          alignSelf: 'flex-start',
          marginTop: portrait ? 0 : boxH / 2 - T * 1.5,
        }}
      >
        {label ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 25 * u,
              color: theme.muted,
              opacity: labelP,
              whiteSpace: 'nowrap',
            }}
          >
            <InlineMathText text={label} />
          </div>
        ) : null}
        {svg}
        {sub ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 23 * u,
              color: theme.accent,
              opacity: labelP,
              whiteSpace: 'nowrap',
            }}
          >
            <InlineMathText text={sub} />
          </div>
        ) : null}
      </div>
    );
  };

  // ==================== SHAPED (arc / climb / fall) =========================
  // Actors sit on a real curve inside a fixed stage; connectors are segments
  // OF that curve, so the drawing IS the motion the problem describes.

  const SW = (portrait ? 900 : 1560) * u;
  let SH = (portrait ? 940 : 680) * u;
  const padX = boxW / 2 + 24 * u;
  let baseY = SH - boxH / 2 - 72 * u; // room for the value line under low boxes
  let topY = boxH / 2 + 26 * u;

  // Cap the arc's rise against the horizontal span — on a narrow portrait
  // stage a full-height parabola degenerates into two near-vertical strokes
  // that read as straight arrows, not a flight — then shrink the stage to
  // the arc so the capped curve doesn't leave a band of dead sky above it.
  const arcRise = Math.min(baseY - topY, (SW - 2 * padX) * 0.85);
  if (layout === 'arc') {
    SH = arcRise + boxH + 98 * u;
    baseY = SH - boxH / 2 - 72 * u;
    topY = baseY - arcRise;
  }

  const curvePoint = (t: number): Pt => {
    const x = padX + (SW - 2 * padX) * t;
    if (layout === 'arc') {
      return { x, y: baseY - 4 * arcRise * t * (1 - t) };
    }
    if (layout === 'climb') {
      return { x, y: baseY + (topY - baseY) * t };
    }
    // fall
    return { x, y: topY + (baseY - topY) * t };
  };

  const anchorT = (i: number): number => (n === 1 ? 0 : i / (n - 1));

  const samplePts = (t0: number, t1: number, steps = 26): Pt[] => {
    const pts: Pt[] = [];
    for (let s = 0; s <= steps; s++) {
      pts.push(curvePoint(t0 + ((t1 - t0) * s) / steps));
    }
    return pts;
  };

  const polyLength = (pts: Pt[]): number => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return len;
  };

  const toPath = (pts: Pt[]): string =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // A two-barb arrowhead centred at `base`, opening back along `theta` (the
  // direction the stroke is travelling). Shared by every layout that ends a
  // line in an arrow — the same measured head the shaped stage draws.
  const arrowBarb = (base: Pt, theta: number, size = 15 * u, into = (Math.PI * 30) / 180): string => {
    const p1 = { x: base.x + size * Math.cos(theta + Math.PI + into), y: base.y + size * Math.sin(theta + Math.PI + into) };
    const p2 = { x: base.x + size * Math.cos(theta + Math.PI - into), y: base.y + size * Math.sin(theta + Math.PI - into) };
    return `${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${base.x.toFixed(1)},${base.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  };

  const shapedStage = (): React.ReactNode => {
    const sw = Math.max(2.5, 4 * u);
    const ghostP = easeInOutQuint(clamp01((frame - boxAt(0) - f30(fps, 4)) / f30(fps, 26)));

    // Ground line: where the situation starts/ends resting. Full-width under
    // an arc (both feet on the ground), under the landing end of a fall,
    // under the start of a climb. Below the value line — a ground stroke
    // through "h0 = 3 m" reads as a strikethrough.
    const groundY = baseY + boxH / 2 + 66 * u;
    const ground =
      layout === 'arc'
        ? { x1: padX - 40 * u, x2: SW - padX + 40 * u }
        : layout === 'fall'
          ? { x1: SW / 2, x2: SW - padX + 40 * u }
          : { x1: padX - 40 * u, x2: SW / 2 };

    // Connector segments ride the curve between anchors, trimmed so they
    // start/end just outside the boxes.
    const segments: React.ReactNode[] = [];
    const labels: React.ReactNode[] = [];
    for (let i = 0; i < n - 1; i++) {
      const c = connectors[i] ?? {};
      const styleC = c.style === 'line' || c.style === 'both' ? c.style : 'arrow';
      const p = easeInOutQuint(clamp01((frame - connAt(i)) / f30(fps, 14)));
      const labelP = easeOutQuint(clamp01((frame - connAt(i) - f30(fps, 6)) / f30(fps, 9)));
      const t0 = anchorT(i);
      const t1 = anchorT(i + 1);
      const a = curvePoint(t0);
      const b = curvePoint(t1);
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      const trim = Math.min(0.34, (boxW * 0.62) / Math.max(1, chord));
      const pts = samplePts(t0 + (t1 - t0) * trim, t1 - (t1 - t0) * trim);
      const len = polyLength(pts);

      // Arrowhead barbs off the END tangent (a fixed-down V reads as a stray
      // mark — same lesson as the step arrows).
      const e1 = pts[pts.length - 1];
      const e0 = pts[pts.length - 2] ?? pts[0];
      const ang = Math.atan2(e1.y - e0.y, e1.x - e0.x);
      const barb = (base: Pt, theta: number, into: number): string => {
        const bl = 15 * u;
        const p1 = { x: base.x + bl * Math.cos(theta + into), y: base.y + bl * Math.sin(theta + into) };
        const p2 = { x: base.x + bl * Math.cos(theta - into), y: base.y + bl * Math.sin(theta - into) };
        return `${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${base.x.toFixed(1)},${base.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
      };
      const s0 = pts[0];
      const s1 = pts[1] ?? pts[pts.length - 1];
      const angStart = Math.atan2(s0.y - s1.y, s0.x - s1.x);

      segments.push(
        <g key={`seg${i}`}>
          <path
            d={toPath(pts)}
            stroke={theme.text}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={len}
            strokeDashoffset={(1 - p) * len}
          />
          {styleC !== 'line' && p > 0.8 ? (
            <polyline
              points={barb(e1, ang + Math.PI, (Math.PI * 30) / 180)}
              stroke={theme.text}
              strokeWidth={sw}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={clamp01((p - 0.8) / 0.2)}
            />
          ) : null}
          {styleC === 'both' && p > 0.1 ? (
            <polyline
              points={barb(s0, angStart + Math.PI, (Math.PI * 30) / 180)}
              stroke={theme.text}
              strokeWidth={sw}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={clamp01(p * 2)}
            />
          ) : null}
        </g>
      );

      const label = (c.label ?? '').trim();
      const sub = (c.sub ?? '').trim();
      if (label || sub) {
        // Label above the curve, sub below it — offset along the LOCAL
        // normal at the midpoint (the chord's normal drifts off a curved
        // segment and the label ends up struck through by its own arrow).
        const midI = Math.floor(pts.length / 2);
        const mid = pts[midI];
        const mA = pts[Math.max(0, midI - 1)];
        const mB = pts[Math.min(pts.length - 1, midI + 1)];
        const tangent = Math.atan2(mB.y - mA.y, mB.x - mA.x);
        let nx = Math.sin(tangent);
        let ny = -Math.cos(tangent);
        if (ny > 0) {
          nx = -nx;
          ny = -ny; // normal always points upward-ish
        }
        const off = 42 * u;
        const clampX = (x: number): number => Math.min(SW - 50 * u, Math.max(50 * u, x));
        labels.push(
          <React.Fragment key={`lb${i}`}>
            {label ? (
              <div
                style={{
                  position: 'absolute',
                  left: clampX(mid.x + nx * off),
                  top: mid.y + ny * off,
                  transform: 'translate(-50%, -50%)',
                  fontFamily: MONO_FONT,
                  fontSize: 25 * u,
                  color: theme.muted,
                  opacity: labelP,
                  whiteSpace: 'nowrap',
                }}
              >
                <InlineMathText text={label} />
              </div>
            ) : null}
            {sub ? (
              <div
                style={{
                  position: 'absolute',
                  left: clampX(mid.x - nx * off),
                  top: mid.y - ny * off,
                  transform: 'translate(-50%, -50%)',
                  fontFamily: MONO_FONT,
                  fontSize: 23 * u,
                  color: theme.accent,
                  opacity: labelP,
                  whiteSpace: 'nowrap',
                }}
              >
                <InlineMathText text={sub} />
              </div>
            ) : null}
          </React.Fragment>
        );
      }
    }

    // The dashed trajectory ghost — faint, sketched first so the viewer sees
    // the SHAPE of the motion before the actors land on it. Trimmed around
    // the boxes exactly like the segments: a dash crossing through a box's
    // interior reads as clutter, not as a path. x is monotonic in every
    // layout, so a widening clip rect draws it left-to-right.
    const ghostParts: string[] = [];
    for (let i = 0; i < n - 1; i++) {
      const t0 = anchorT(i);
      const t1 = anchorT(i + 1);
      const a = curvePoint(t0);
      const b = curvePoint(t1);
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      const trim = Math.min(0.34, (boxW * 0.62) / Math.max(1, chord));
      ghostParts.push(toPath(samplePts(t0 + (t1 - t0) * trim, t1 - (t1 - t0) * trim, 30)));
    }
    const ghostPath = ghostParts.join(' ');

    // Question chip placement: the layout's natural empty space — for the
    // arc that is the middle of its interior, clear of both the peak's
    // value line above and the ground boxes below.
    const qPos: Pt =
      layout === 'arc'
        ? { x: SW / 2, y: baseY - arcRise * 0.5 }
        : layout === 'climb'
          ? { x: SW - padX - boxW * 0.2, y: baseY }
          : { x: SW - padX - boxW * 0.2, y: topY };

    // Sprite drift for the first actor: along the launch tangent.
    const d0 = curvePoint(anchorT(0));
    const d1 = curvePoint(anchorT(0) + 0.08);
    const dLen = Math.hypot(d1.x - d0.x, d1.y - d0.y) || 1;
    const driftP =
      (entities[0].sprite_url ?? '').trim() !== ''
        ? easeInOutQuint(clamp01((frame - connAt(0) - f30(fps, 10)) / f30(fps, 70))) * 22 * u
        : 0;
    const drift0: Pt = { x: ((d1.x - d0.x) / dLen) * driftP, y: ((d1.y - d0.y) / dLen) * driftP };

    return (
      <div style={{ position: 'relative', width: SW, height: SH }}>
        <svg
          width={SW}
          height={SH}
          viewBox={`0 0 ${SW} ${SH}`}
          fill="none"
          style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        >
          <defs>
            <clipPath id={`ghost-${scene.scene_id}`}>
              <rect x={0} y={-60 * u} width={SW * ghostP} height={SH + 120 * u} />
            </clipPath>
          </defs>
          <line
            x1={ground.x1}
            y1={groundY}
            x2={ground.x1 + (ground.x2 - ground.x1) * ghostP}
            y2={groundY}
            stroke={theme.muted}
            strokeWidth={Math.max(2, 2.6 * u)}
            strokeLinecap="round"
            opacity={0.55}
          />
          <path
            d={ghostPath}
            stroke={theme.muted}
            strokeWidth={Math.max(2, 2.8 * u)}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${13 * u} ${11 * u}`}
            opacity={0.38}
            clipPath={`url(#ghost-${scene.scene_id})`}
          />
          {segments}
        </svg>
        {labels}
        {entities.map((e, i) => {
          const a = curvePoint(anchorT(i));
          return (
            <div
              key={`e${i}`}
              style={{
                position: 'absolute',
                left: a.x,
                top: a.y,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {entityInner(e, i, i === 0 ? drift0 : { x: 0, y: 0 })}
            </div>
          );
        })}
        {questionChip ? (
          <div
            style={{
              position: 'absolute',
              left: qPos.x,
              top: qPos.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {questionChip}
          </div>
        ) : null}
      </div>
    );
  };

  // ==================== COMPARE (parallel lanes) ===========================
  // Two or more contenders each run on their own horizontal track, stacked so
  // the viewer weighs them side by side. Each lane draws its own arrow and
  // carries its rate/price on the connector; the question lands underneath.

  const compareStage = (): React.ReactNode => {
    const sw = Math.max(2.5, 4 * u);
    const laneH = boxH + (portrait ? 100 : 92) * u;
    const CW = (portrait ? 900 : 1500) * u;
    const qZone = question ? 96 * u : 14 * u;
    const CH = n * laneH + qZone;
    const leftX = boxW / 2 + 16 * u; // box centre column
    const trackX0 = boxW + 40 * u; // track starts past the box
    const trackX1 = CW - 60 * u; // finish line
    const boxCenterY = (i: number): number => i * laneH + 20 * u + boxH / 2;

    const svgBits: React.ReactNode[] = [];
    const overlays: React.ReactNode[] = [];
    for (let i = 0; i < n; i++) {
      const cy = boxCenterY(i);
      const p = easeInOutQuint(clamp01((frame - connAt(i)) / f30(fps, 16)));
      const tipX = trackX0 + (trackX1 - trackX0) * p;
      svgBits.push(
        <g key={`lane${i}`}>
          <line x1={trackX0} y1={cy} x2={tipX - (p > 0.8 ? 10 * u : 0)} y2={cy} stroke={theme.text} strokeWidth={sw} strokeLinecap="round" />
          {p > 0.8 ? (
            <polyline
              points={arrowBarb({ x: tipX, y: cy }, 0)}
              stroke={theme.text}
              strokeWidth={sw}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={clamp01((p - 0.8) / 0.2)}
            />
          ) : null}
        </g>
      );

      overlays.push(
        <div key={`box${i}`} style={{ position: 'absolute', left: leftX, top: i * laneH + 20 * u, transform: 'translateX(-50%)' }}>
          {entityInner(entities[i], i, { x: 0, y: 0 })}
        </div>
      );

      const c = connectors[i] ?? {};
      const cLabel = (c.label ?? '').trim();
      if (cLabel) {
        const labelP = easeOutQuint(clamp01((frame - connAt(i) - f30(fps, 6)) / f30(fps, 9)));
        overlays.push(
          <div
            key={`clab${i}`}
            style={{
              position: 'absolute',
              left: (trackX0 + trackX1) / 2,
              top: cy - 30 * u,
              transform: 'translate(-50%, -50%)',
              fontFamily: MONO_FONT,
              fontSize: 25 * u,
              color: theme.accent,
              opacity: labelP,
              whiteSpace: 'nowrap',
            }}
          >
            <InlineMathText text={cLabel} />
          </div>
        );
      }
    }

    return (
      <div style={{ position: 'relative', width: CW, height: CH }}>
        <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} fill="none" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {svgBits}
        </svg>
        {overlays}
        {questionChip ? (
          <div style={{ position: 'absolute', left: CW / 2, top: n * laneH + qZone / 2, transform: 'translate(-50%, -50%)' }}>
            {questionChip}
          </div>
        ) : null}
      </div>
    );
  };

  // ==================== SPLIT (one source → outcomes) ======================
  // The first actor is the SOURCE; the rest fan out to the right as the
  // outcomes/branches. The source shoots a straight arrow to each, and the
  // connector on that gap carries the branch's probability / share.

  const splitStage = (): React.ReactNode => {
    const sw = Math.max(2.5, 4 * u);
    const branchN = Math.max(1, n - 1);
    const laneH = boxH + (portrait ? 96 : 92) * u;
    const SWs = (portrait ? 900 : 1400) * u;
    const SHs = Math.max(branchN * laneH, boxH + 120 * u);
    const srcX = boxW / 2 + 20 * u;
    const srcY = SHs / 2;
    const brX = SWs - boxW / 2 - 20 * u;
    const brY = (j: number): number =>
      branchN === 1 ? SHs / 2 : boxH / 2 + 24 * u + (j * (SHs - boxH - 48 * u)) / (branchN - 1);

    const svgBits: React.ReactNode[] = [];
    const overlays: React.ReactNode[] = [];
    for (let j = 0; j < branchN; j++) {
      const a: Pt = { x: srcX + boxW / 2 + 8 * u, y: srcY };
      const b: Pt = { x: brX - boxW / 2 - 8 * u, y: brY(j) };
      const p = easeInOutQuint(clamp01((frame - connAt(j)) / f30(fps, 16)));
      const theta = Math.atan2(b.y - a.y, b.x - a.x);
      const end: Pt = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
      svgBits.push(
        <g key={`br${j}`}>
          <line
            x1={a.x}
            y1={a.y}
            x2={end.x - (p > 0.85 ? 10 * u * Math.cos(theta) : 0)}
            y2={end.y - (p > 0.85 ? 10 * u * Math.sin(theta) : 0)}
            stroke={theme.text}
            strokeWidth={sw}
            strokeLinecap="round"
          />
          {p > 0.85 ? (
            <polyline
              points={arrowBarb(b, theta)}
              stroke={theme.text}
              strokeWidth={sw}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={clamp01((p - 0.85) / 0.15)}
            />
          ) : null}
        </g>
      );
      const c = connectors[j] ?? {};
      const cLabel = (c.label ?? '').trim();
      if (cLabel) {
        const labelP = easeOutQuint(clamp01((frame - connAt(j) - f30(fps, 6)) / f30(fps, 9)));
        overlays.push(
          <div
            key={`brl${j}`}
            style={{
              position: 'absolute',
              left: (a.x + b.x) / 2,
              top: (a.y + b.y) / 2 - 20 * u,
              transform: 'translate(-50%, -50%)',
              fontFamily: MONO_FONT,
              fontSize: 24 * u,
              color: theme.accent,
              opacity: labelP,
              whiteSpace: 'nowrap',
            }}
          >
            <InlineMathText text={cLabel} />
          </div>
        );
      }
    }

    return (
      <div style={{ position: 'relative', width: SWs, height: SHs }}>
        <svg width={SWs} height={SHs} viewBox={`0 0 ${SWs} ${SHs}`} fill="none" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {svgBits}
        </svg>
        <div style={{ position: 'absolute', left: srcX, top: srcY, transform: 'translate(-50%, -50%)' }}>
          {entityInner(entities[0], 0, { x: 0, y: 0 })}
        </div>
        {entities.slice(1).map((e, j) => (
          <div key={`bre${j}`} style={{ position: 'absolute', left: brX, top: brY(j), transform: 'translate(-50%, -50%)' }}>
            {entityInner(e, j + 1, { x: 0, y: 0 })}
          </div>
        ))}
        {overlays}
        {questionChip ? (
          <div style={{ position: 'absolute', left: srcX, top: SHs - 4 * u, transform: 'translate(-50%, -50%)' }}>
            {questionChip}
          </div>
        ) : null}
      </div>
    );
  };

  // ==================== CYCLE (closed loop) ================================
  // Stages sit around a ring and hand off clockwise, the last arc closing back
  // to the first — the drawing IS the "and round we go again" the problem
  // describes. The question rests in the middle of the loop.

  const cycleStage = (): React.ReactNode => {
    const sw = Math.max(2.5, 4 * u);
    const CS = (portrait ? 900 : 820) * u; // square stage
    const cx = CS / 2;
    const cy = CS / 2;
    const R = CS / 2 - Math.max(boxW, boxH) * 0.62; // ring radius: boxes sit inside
    const angleAt = (i: number): number => (-90 + (i * 360) / n) * (Math.PI / 180);
    const posAt = (i: number): Pt => ({ x: cx + R * Math.cos(angleAt(i)), y: cy + R * Math.sin(angleAt(i)) });

    const stepRad = (2 * Math.PI) / n;
    const inset = Math.min(0.42, (Math.max(boxW, boxH) * 0.7) / (2 * R * stepRad));
    const arcR = R * 0.9;
    const sampleArc = (a0: number, a1: number, steps = 24): Pt[] => {
      const pts: Pt[] = [];
      for (let s = 0; s <= steps; s++) {
        const a = a0 + (a1 - a0) * (s / steps);
        pts.push({ x: cx + arcR * Math.cos(a), y: cy + arcR * Math.sin(a) });
      }
      return pts;
    };

    const svgBits: React.ReactNode[] = [];
    const overlays: React.ReactNode[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = angleAt(i) + stepRad * inset;
      const a1 = angleAt(i) + stepRad * (1 - inset);
      const pts = sampleArc(a0, a1);
      const len = polyLength(pts);
      // Non-closing arcs ride their source box's beat; the closing arc waits a
      // touch so the loop visibly "comes back" last.
      const p = easeInOutQuint(
        clamp01((frame - connAt(Math.min(i, n - 2)) - (i === n - 1 ? f30(fps, 8) : 0)) / f30(fps, 16))
      );
      const e1 = pts[pts.length - 1];
      const e0 = pts[pts.length - 2] ?? pts[0];
      const theta = Math.atan2(e1.y - e0.y, e1.x - e0.x);
      svgBits.push(
        <g key={`arc${i}`}>
          <path
            d={toPath(pts)}
            stroke={theme.text}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={len}
            strokeDashoffset={(1 - p) * len}
          />
          {p > 0.82 ? (
            <polyline
              points={arrowBarb(e1, theta)}
              stroke={theme.text}
              strokeWidth={sw}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={clamp01((p - 0.82) / 0.18)}
            />
          ) : null}
        </g>
      );
      // connector i labels the arc from box i to box i+1 (the closing arc,
      // i === n-1, has no connector of its own).
      const c = connectors[i] ?? {};
      const cLabel = (c.label ?? '').trim();
      if (cLabel && i < n - 1) {
        const mid = pts[Math.floor(pts.length / 2)];
        const outward = Math.atan2(mid.y - cy, mid.x - cx);
        overlays.push(
          <div
            key={`arcl${i}`}
            style={{
              position: 'absolute',
              left: mid.x + Math.cos(outward) * 26 * u,
              top: mid.y + Math.sin(outward) * 26 * u,
              transform: 'translate(-50%, -50%)',
              fontFamily: MONO_FONT,
              fontSize: 23 * u,
              color: theme.accent,
              opacity: easeOutQuint(clamp01((frame - connAt(i) - f30(fps, 6)) / f30(fps, 9))),
              whiteSpace: 'nowrap',
            }}
          >
            <InlineMathText text={cLabel} />
          </div>
        );
      }
    }

    return (
      <div style={{ position: 'relative', width: CS, height: CS }}>
        <svg width={CS} height={CS} viewBox={`0 0 ${CS} ${CS}`} fill="none" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {svgBits}
        </svg>
        {entities.map((e, i) => {
          const pos = posAt(i);
          return (
            <div key={`ce${i}`} style={{ position: 'absolute', left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}>
              {entityInner(e, i, { x: 0, y: 0 })}
            </div>
          );
        })}
        {overlays}
        {questionChip ? (
          <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%, -50%)' }}>{questionChip}</div>
        ) : null}
      </div>
    );
  };

  // ============================== Compose ===================================

  const chain: React.ReactNode[] = [];
  if (layout === 'line') {
    entities.forEach((e, i) => {
      chain.push(lineEntity(e, i));
      if (i < n - 1) chain.push(lineConnector(i));
    });
  }

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      {question ? <SfxCue name="stamp" at={questionAt + f30(fps, 2)} volume={0.8} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 * u, maxWidth: '100%' }}>
        {kicker ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 25 * u,
              letterSpacing: 4.5 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              opacity: headIn,
              transform: `translateY(${(1 - headIn) * 10 * u}px)`,
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
                  width: width * (portrait ? 0.86 : 0.78),
                  max: 56 * u,
                  min: 29 * u,
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

        {curveShaped ? (
          shapedStage()
        ) : layout === 'compare' ? (
          compareStage()
        ) : layout === 'split' ? (
          splitStage()
        ) : layout === 'cycle' ? (
          cycleStage()
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: portrait ? 'column' : 'row',
              alignItems: 'center',
              gap: 18 * u,
            }}
          >
            {chain}
          </div>
        )}

        {layout === 'line' && question ? questionChip : null}
      </div>
    </AbsoluteFill>
  );
};
