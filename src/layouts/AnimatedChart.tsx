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
 * "please upload a screenshot of a sales graph". Three shapes:
 *
 *  - bar:   hairline baseline draws first, bars grow bottom-up staggered 3f
 *           (easeOutExpo 18f), value labels count up on top, the
 *           highlight_index bar takes the accent, the rest stay muted;
 *  - line:  the series path draws itself (24f easeInOutQuint) over a solid
 *           10%-alpha accent area fill, a dot snaps onto the end;
 *  - donut: an arc sweeps to the highlighted value's share while the value
 *           counts up in the centre;
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
  const type = slot.chart_type === 'line' || slot.chart_type === 'donut' ? slot.chart_type : 'bar';

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
  } else if (type === 'line') {
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
          {/* Solid 10%-alpha accent area — flat, not a gradient. */}
          <polygon points={area} fill={theme.accent} opacity={0.1 * p} />
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
