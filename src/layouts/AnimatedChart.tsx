import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene } from '../types';
import { BigCounter } from './BigCounter';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { clamp01, easeOutExpo, easeOutQuint, easeInOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { parseCountable, rollText } from '../motion/CountUp';
import { SfxCue } from '../sfx';

/** A value label that counts up as its mark lands (tabular — never shifts). */
const RollingValue: React.FC<{
  value: number;
  unit: string;
  frame: number;
  fps: number;
  style?: React.CSSProperties;
}> = ({ value, unit, frame, fps, style }) => {
  const token = parseCountable(String(value));
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {token ? rollText(token, Math.max(0, frame), fps) : String(value)}
      {unit}
    </span>
  );
};

/**
 * animated_chart (copilot.md §5.2): a NATIVE animated chart — the antidote to
 * "please upload a screenshot of a sales graph". Shapes:
 *
 *  - bar:     hairline baseline draws first, bars grow bottom-up staggered 3f
 *             (easeOutExpo 18f), value labels count up on top, the
 *             highlight_index bar takes the accent, the rest stay muted;
 *  - line:    the series path draws itself (24f easeInOutQuint) over a solid
 *             10%-alpha accent area fill, a dot snaps onto the end;
 *  - area:    the line, but the fill IS the story — a solid 18%-alpha accent
 *             field revealed left-to-right with the stroke (cumulative growth);
 *  - donut:   an arc sweeps to the highlighted value's share while the value
 *             counts up in the centre;
 *  - pie:     the whole composition — slices sweep in one after another,
 *             the highlighted slice in the accent, share labels at each rim;
 *  - scatter: dots pop onto the plot in sequence and a least-squares trend
 *             line draws through them (correlation beats);
 *  - radar:   3-8 spokes, two hairline web rings, the data polygon draws
 *             itself and settles with a low-alpha accent fill;
 *  - counter: delegates to big_counter (one number IS the chart).
 *
 * SVG stroke/transform/colour only. One chime lands when the drawing
 * completes (§6.5) — never per-bar sounds.
 */
export const AnimatedChart: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_chart'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, width: frameW } = useVideoConfig();
  const { frame } = useSceneClock();
  const win = useSceneWindow();
  const meta = useSceneMeta();

  if (!slot) return null;
  if (slot.chart_type === 'counter') return <BigCounter scene={scene} />;

  const values = (slot.values ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (values.length < 2) return <BigCounter scene={scene} />;

  const labels = slot.labels ?? [];
  const unit = slot.unit ?? '';
  const hi = slot.highlight_index != null && values[slot.highlight_index] !== undefined
    ? slot.highlight_index
    : null;
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const source = (slot.source ?? '').trim();
  const KNOWN = ['bar', 'line', 'area', 'donut', 'pie', 'scatter', 'radar'] as const;
  let type: (typeof KNOWN)[number] = (KNOWN as readonly string[]).includes(slot.chart_type ?? '')
    ? (slot.chart_type as (typeof KNOWN)[number])
    : 'bar';
  // A radar below 3 axes is a line with delusions; bars tell it honestly.
  if (type === 'radar' && values.length < 3) type = 'bar';

  const at = win?.start ?? 0;
  const kickerIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  // ---- Shared chart frame -------------------------------------------------
  const W = 1200;
  const H = 560;
  const max = Math.max(...values, 1);
  // Portrait fit: the 1200u-wide plot scales down (transform only) so it
  // never overflows a 1080-wide 9:16 frame.
  const fit = Math.min(1, (frameW * 0.88) / (W * u));

  let chart: React.ReactNode = null;
  let doneAt = 0; // local frame the drawing completes (the chime moment)

  if (type === 'bar') {
    const baseAt = f30(fps, 4);
    const baseP = easeOutQuint(clamp01((frame - baseAt) / f30(fps, 8)));
    const growDur = f30(fps, 18);
    const stagger = f30(fps, 3);
    const firstBar = baseAt + f30(fps, 8);
    doneAt = firstBar + (values.length - 1) * stagger + growDur;

    const slotW = W / values.length;
    const barW = Math.min(120, slotW * 0.52);

    chart = (
      <div style={{ position: 'relative', width: W * u, height: H * u }}>
        {values.map((v, i) => {
          const p = easeOutExpo(clamp01((frame - firstBar - i * stagger) / growDur));
          const h = (v / max) * (H - 120) * p;
          const cx = (i + 0.5) * slotW;
          const isHot = hi === i;
          return (
            <React.Fragment key={i}>
              <div
                style={{
                  position: 'absolute',
                  left: (cx - barW / 2) * u,
                  bottom: 60 * u,
                  width: barW * u,
                  height: h * u,
                  background: isHot ? theme.accent : theme.muted,
                  opacity: isHot ? 1 : 0.55,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: (cx - slotW / 2) * u,
                  width: slotW * u,
                  bottom: (72 + h) * u,
                  textAlign: 'center',
                  fontFamily: displayFont,
                  fontWeight: 800,
                  fontSize: 40 * u,
                  color: isHot ? theme.accent : theme.text,
                  opacity: p > 0.05 ? 1 : 0,
                }}
              >
                <RollingValue value={v} unit={unit} frame={frame - firstBar - i * stagger} fps={fps} />
              </div>
              {labels[i] ? (
                <div
                  style={{
                    position: 'absolute',
                    left: (cx - slotW / 2) * u,
                    width: slotW * u,
                    bottom: 8 * u,
                    textAlign: 'center',
                    fontFamily: MONO_FONT,
                    fontSize: 24 * u,
                    letterSpacing: 1.5 * u,
                    textTransform: 'uppercase',
                    color: isHot ? theme.text : theme.muted,
                    opacity: baseP,
                  }}
                >
                  {labels[i]}
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
        {/* Baseline draws before anything grows. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 58 * u,
            height: 2,
            width: `${baseP * 100}%`,
            background: hairline(theme, 0.3),
          }}
        />
      </div>
    );
  } else if (type === 'line' || type === 'area') {
    const drawAt = f30(fps, 6);
    const drawDur = f30(fps, 24);
    doneAt = drawAt + drawDur;
    const p = easeInOutQuint(clamp01((frame - drawAt) / drawDur));

    const min = Math.min(...values);
    const range = max - min || 1;
    const px = (i: number): number => 40 + (i / (values.length - 1)) * (W - 80);
    const py = (v: number): number => 60 + (1 - (v - min) / range) * (H - 180);
    const pts = values.map((v, i) => `${px(i)},${py(v)}`).join(' ');
    const area = `${pts} ${px(values.length - 1)},${H - 60} ${px(0)},${H - 60}`;

    // The dot snaps onto the line's end as the draw completes.
    const dotIn = spring({
      frame: Math.max(0, frame - doneAt + f30(fps, 2)),
      fps,
      config: SPRINGS.snap,
      durationInFrames: Math.round(fps * 0.35),
    });
    const endV = values[values.length - 1];

    chart = (
      <div style={{ position: 'relative', width: W * u, height: H * u }}>
        <svg width={W * u} height={H * u} viewBox={`0 0 ${W} ${H}`} fill="none">
          {/* Solid low-alpha accent area — flat, not a gradient. The area
              variant reveals its fill WITH the stroke, left to right. */}
          <polygon
            points={area}
            fill={theme.accent}
            opacity={type === 'area' ? 0.18 : 0.1 * p}
            style={type === 'area' ? { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` } : undefined}
          />
          <polyline
            points={pts}
            stroke={theme.accent}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - p}
          />
          <line x1={40} y1={H - 60} x2={W - 40} y2={H - 60} stroke={hairline(theme, 0.3)} strokeWidth={2} />
          <circle
            cx={px(values.length - 1)}
            cy={py(endV)}
            r={14 * Math.min(1, dotIn)}
            fill={theme.accent}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: py(endV) * u - 64 * u,
            fontFamily: displayFont,
            fontWeight: 800,
            fontSize: 44 * u,
            color: theme.accent,
            opacity: dotIn,
          }}
        >
          <RollingValue value={endV} unit={unit} frame={frame - drawAt} fps={fps} />
        </div>
        {labels.length ? (
          <div
            style={{
              position: 'absolute',
              left: 40 * u,
              right: 40 * u,
              bottom: 8 * u,
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: MONO_FONT,
              fontSize: 24 * u,
              letterSpacing: 1.5 * u,
              textTransform: 'uppercase',
              color: theme.muted,
            }}
          >
            {labels.slice(0, values.length).map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        ) : null}
      </div>
    );
  } else if (type === 'pie') {
    // The whole composition: slices sweep in clockwise, one after another.
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const hiIdx = hi ?? values.indexOf(Math.max(...values));
    const R = 200;
    const CX = 300;
    const CY = H / 2;
    const sliceAt = (i: number): number => f30(fps, 6) + i * f30(fps, 4);
    const sliceDur = f30(fps, 14);
    doneAt = sliceAt(values.length - 1) + sliceDur;

    const polar = (a: number, r: number): [number, number] => [
      CX + Math.cos(a) * r,
      CY + Math.sin(a) * r,
    ];

    let angle = -Math.PI / 2;
    const slices = values.map((v, i) => {
      const span = (v / total) * Math.PI * 2;
      const a0 = angle;
      angle += span;
      const p = easeOutQuint(clamp01((frame - sliceAt(i)) / sliceDur));
      const aEnd = a0 + span * p;
      const [sx, sy] = polar(a0, R);
      const [ex, ey] = polar(aEnd, R);
      const largeArc = aEnd - a0 > Math.PI ? 1 : 0;
      const mid = a0 + span / 2;
      const share = v / total;
      const isHot = hiIdx === i;
      return { d: `M ${CX} ${CY} L ${sx} ${sy} A ${R} ${R} 0 ${largeArc} 1 ${ex} ${ey} Z`, p, mid, share, isHot, i, v };
    });

    chart = (
      <div style={{ position: 'relative', width: 1000 * u, height: H * u }}>
        <svg width={1000 * u} height={H * u} viewBox={`0 0 1000 ${H}`} fill="none">
          {slices.map((s) =>
            s.p > 0.01 ? (
              <path
                key={s.i}
                d={s.d}
                fill={s.isHot ? theme.accent : theme.muted}
                opacity={s.isHot ? 1 : 0.6 - (s.i % 4) * 0.12}
                stroke={theme.bg_from}
                strokeWidth={3}
              />
            ) : null
          )}
          {/* Rim labels: share percentage + name at each slice's mid-angle. */}
          {slices.map((s) => {
            if (s.share < 0.04) return null;
            const [lx, ly] = polar(s.mid, R + 56);
            return (
              <g key={`l${s.i}`} opacity={clamp01((s.p - 0.6) * 2.5)}>
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  fontFamily={displayFont}
                  fontWeight={800}
                  fontSize={34}
                  fill={s.isHot ? theme.accent : theme.text}
                >
                  {Math.round(s.share * 100)}%
                </text>
                {labels[s.i] ? (
                  <text
                    x={lx}
                    y={ly + 30}
                    textAnchor="middle"
                    fontFamily={MONO_FONT}
                    fontSize={22}
                    fill={theme.muted}
                    style={{ textTransform: 'uppercase', letterSpacing: 1.5 }}
                  >
                    {labels[s.i]}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {/* Legend column on the right balances the composition in 16:9. */}
        <div
          style={{
            position: 'absolute',
            left: 620 * u,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16 * u,
          }}
        >
          {values.map((v, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 * u, opacity: clamp01((frame - sliceAt(i) - 4) / 8) }}>
              <span
                style={{
                  width: 22 * u,
                  height: 22 * u,
                  background: hiIdx === i ? theme.accent : theme.muted,
                  opacity: hiIdx === i ? 1 : 0.6 - (i % 4) * 0.12,
                }}
              />
              <span style={{ fontFamily: MONO_FONT, fontSize: 24 * u, color: hiIdx === i ? theme.text : theme.muted }}>
                {labels[i] ?? `#${i + 1}`}
                {'  '}
                <RollingValue value={v} unit={unit} frame={frame - sliceAt(i)} fps={fps} />
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (type === 'scatter') {
    // Dots land in sequence; a least-squares trend line draws through them.
    const min = Math.min(...values);
    const range = max - min || 1;
    const px = (i: number): number => 60 + (i / (values.length - 1)) * (W - 120);
    const py = (v: number): number => 60 + (1 - (v - min) / range) * (H - 180);

    const dotAt = (i: number): number => f30(fps, 8) + i * f30(fps, 3);
    const trendAt = dotAt(values.length - 1) + f30(fps, 6);
    const trendDur = f30(fps, 12);
    doneAt = trendAt + trendDur;
    const trendP = easeInOutQuint(clamp01((frame - trendAt) / trendDur));

    // Least squares over (index, value).
    const nPts = values.length;
    const meanX = (nPts - 1) / 2;
    const meanY = values.reduce((a, b) => a + b, 0) / nPts;
    let num = 0;
    let den = 0;
    values.forEach((v, i) => {
      num += (i - meanX) * (v - meanY);
      den += (i - meanX) * (i - meanX);
    });
    const slope = den !== 0 ? num / den : 0;
    const yAt = (i: number): number => meanY + slope * (i - meanX);

    chart = (
      <div style={{ position: 'relative', width: W * u, height: H * u }}>
        <svg width={W * u} height={H * u} viewBox={`0 0 ${W} ${H}`} fill="none">
          <line x1={40} y1={H - 60} x2={W - 40} y2={H - 60} stroke={hairline(theme, 0.3)} strokeWidth={2} />
          {trendP > 0.01 ? (
            <line
              x1={px(0)}
              y1={py(yAt(0))}
              x2={px(0) + (px(nPts - 1) - px(0)) * trendP}
              y2={py(yAt(0)) + (py(yAt(nPts - 1)) - py(yAt(0))) * trendP}
              stroke={theme.accent}
              strokeWidth={4}
              opacity={0.65}
              strokeLinecap="round"
            />
          ) : null}
          {values.map((v, i) => {
            const pop = spring({
              frame: Math.max(0, frame - dotAt(i)),
              fps,
              config: SPRINGS.settle,
              durationInFrames: Math.round(fps * 0.35),
            });
            const isHot = hi === i;
            return (
              <circle
                key={i}
                cx={px(i)}
                cy={py(v)}
                r={(isHot ? 16 : 11) * Math.min(1.05, pop)}
                fill={isHot ? theme.accent : theme.muted}
                opacity={isHot ? 1 : 0.75}
              />
            );
          })}
        </svg>
        {hi != null ? (
          <div
            style={{
              position: 'absolute',
              left: px(hi) * u - 100 * u,
              width: 200 * u,
              top: py(values[hi]) * u - 62 * u,
              textAlign: 'center',
              fontFamily: displayFont,
              fontWeight: 800,
              fontSize: 38 * u,
              color: theme.accent,
              opacity: clamp01((frame - dotAt(hi) - 4) / 8),
            }}
          >
            <RollingValue value={values[hi]} unit={unit} frame={frame - dotAt(hi)} fps={fps} />
          </div>
        ) : null}
        {labels.length ? (
          <div
            style={{
              position: 'absolute',
              left: 60 * u,
              right: 60 * u,
              bottom: 8 * u,
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: MONO_FONT,
              fontSize: 24 * u,
              letterSpacing: 1.5 * u,
              textTransform: 'uppercase',
              color: theme.muted,
            }}
          >
            {labels.slice(0, values.length).map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        ) : null}
      </div>
    );
  } else if (type === 'radar') {
    // 3-8 axes; the data polygon draws itself around the web.
    const nAx = values.length;
    const CX = W / 2;
    const CY = H / 2 + 10;
    const R = 200;
    const angleOf = (i: number): number => (i / nAx) * Math.PI * 2 - Math.PI / 2;
    const polar = (a: number, r: number): [number, number] => [
      CX + Math.cos(a) * r,
      CY + Math.sin(a) * r,
    ];

    const webP = easeOutQuint(clamp01((frame - f30(fps, 3)) / f30(fps, 12)));
    const drawAt = f30(fps, 12);
    const drawDur = f30(fps, 20);
    doneAt = drawAt + drawDur + f30(fps, 6);
    const dataP = easeInOutQuint(clamp01((frame - drawAt) / drawDur));
    const fillP = easeOutQuint(clamp01((frame - drawAt - drawDur) / f30(fps, 8)));

    const vertex = (i: number): [number, number] => polar(angleOf(i), (values[i] / max) * R);
    const dataPath = `M ${values.map((_, i) => vertex(i).join(' ')).join(' L ')} Z`;
    const ring = (r: number): string => values.map((_, i) => polar(angleOf(i), r).join(',')).join(' ');

    chart = (
      <div style={{ position: 'relative', width: W * u, height: (H + 40) * u }}>
        <svg width={W * u} height={(H + 40) * u} viewBox={`0 0 ${W} ${H + 40}`} fill="none">
          <g opacity={webP}>
            <polygon points={ring(R)} stroke={hairline(theme, 0.18)} strokeWidth={2} />
            <polygon points={ring(R * 0.5)} stroke={hairline(theme, 0.12)} strokeWidth={2} />
            {values.map((_, i) => {
              const [ex, ey] = polar(angleOf(i), R);
              return <line key={i} x1={CX} y1={CY} x2={CX + (ex - CX) * webP} y2={CY + (ey - CY) * webP} stroke={hairline(theme, 0.14)} strokeWidth={2} />;
            })}
          </g>
          <polygon points={values.map((_, i) => vertex(i).join(',')).join(' ')} fill={theme.accent} opacity={0.12 * fillP} />
          <path
            d={dataPath}
            stroke={theme.accent}
            strokeWidth={5.5}
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - dataP}
          />
          {values.map((v, i) => {
            const [vx, vy] = vertex(i);
            const pop = spring({
              frame: Math.max(0, frame - drawAt - drawDur - i * f30(fps, 2)),
              fps,
              config: SPRINGS.settle,
              durationInFrames: Math.round(fps * 0.3),
            });
            return <circle key={`d${i}`} cx={vx} cy={vy} r={8 * Math.min(1, pop)} fill={theme.accent} />;
          })}
          {values.map((v, i) => {
            const [lx, ly] = polar(angleOf(i), R + 46);
            const isHot = hi === i;
            return (
              <text
                key={`t${i}`}
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily={MONO_FONT}
                fontSize={24}
                fill={isHot ? theme.accent : theme.muted}
                opacity={webP}
                style={{ textTransform: 'uppercase', letterSpacing: 1.5 }}
              >
                {labels[i] ?? `#${i + 1}`}
              </text>
            );
          })}
        </svg>
      </div>
    );
  } else {
    // donut
    const sweepAt = f30(fps, 6);
    const sweepDur = f30(fps, 20);
    doneAt = sweepAt + sweepDur;
    const p = easeInOutQuint(clamp01((frame - sweepAt) / sweepDur));

    const total = values.reduce((a, b) => a + b, 0) || 1;
    const idx = hi ?? values.length - 1;
    const share = values[idx] / total;
    const R = 190;
    const C = 2 * Math.PI * R;

    chart = (
      <div style={{ position: 'relative', width: 560 * u, height: H * u, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={520 * u} height={520 * u} viewBox="0 0 520 520" fill="none">
          <circle cx={260} cy={260} r={R} stroke={hairline(theme, 0.16)} strokeWidth={44} />
          <circle
            cx={260}
            cy={260}
            r={R}
            stroke={theme.accent}
            strokeWidth={44}
            strokeLinecap="butt"
            strokeDasharray={`${C * share * p} ${C}`}
            transform="rotate(-90 260 260)"
          />
        </svg>
        <div style={{ position: 'absolute', textAlign: 'center' }}>
          <div style={{ fontFamily: displayFont, fontWeight: 800, fontSize: 96 * u, color: theme.text }}>
            <RollingValue value={values[idx]} unit={unit} frame={frame - sweepAt} fps={fps} />
          </div>
          {labels[idx] ? (
            <div
              style={{
                fontFamily: MONO_FONT,
                fontSize: 26 * u,
                letterSpacing: 2 * u,
                textTransform: 'uppercase',
                color: theme.muted,
                marginTop: 8 * u,
              }}
            >
              {labels[idx]}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '6%', boxSizing: 'border-box' }}>
      {/* One chime when the drawing completes (§6.5) — the chart's landmark. */}
      <SfxCue name="chime" at={at + doneAt} volume={1} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 * u, maxWidth: '100%' }}>
        {kicker ? (
          <div
            style={{
              fontFamily: MONO_FONT,
              fontSize: 28 * u,
              letterSpacing: 5 * u,
              textTransform: 'uppercase',
              color: theme.accent,
              opacity: kickerIn,
              transform: `translateY(${(1 - kickerIn) * 14 * u}px)`,
            }}
          >
            {kicker}
          </div>
        ) : null}
        {caption ? (
          <div
            style={{
              fontFamily: displayFont,
              fontWeight: 800,
              fontSize: 54 * u,
              color: theme.text,
              textAlign: 'center',
              opacity: kickerIn,
            }}
          >
            {caption}
          </div>
        ) : null}
        <div style={{ transform: fit < 1 ? `scale(${fit})` : undefined, transformOrigin: 'center top' }}>
          {chart}
        </div>
      </div>

      {source ? (
        <div
          style={{
            position: 'absolute',
            left: '6%',
            bottom: '5%',
            fontFamily: MONO_FONT,
            fontSize: 22 * u,
            color: theme.muted,
            opacity: 0.8,
          }}
        >
          {source}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
