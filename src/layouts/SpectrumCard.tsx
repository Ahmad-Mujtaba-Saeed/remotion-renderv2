import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, SpectrumItem } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useSurfaceStyle } from '../components/Surface';
import { useScaleUnit } from '../responsive';
import { clamp01, easeInOutSine, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { KineticText } from '../components/KineticText';
import { calloutRevealSchedule } from '../components/CalloutLayer';

/**
 * spectrum_card — the "where does X sit" beat: a labelled axis (cheap ↔
 * expensive, safe ↔ risky) with 2-5 items dropped onto it at their real
 * positions. The axis draws first, pole labels land at its ends, then each
 * item's dot pops with a short leader to its label chip — chips alternate
 * above/below the line so neighbours never collide, and the highlighted item
 * (the subject of the question) takes the accent. Item positions are DATA
 * (0..1 from the left pole), so the whole card is deterministic. Flat law:
 * hairline axis, solid dots, panel chips. Silent per §1.3.
 */
export const SpectrumCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_spectrum'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const surface = useSurfaceStyle(false);
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;
  const items: SpectrumItem[] = (slot.spectrum_items ?? [])
    .filter((it) => it && (it.label ?? '').trim() !== '' && typeof it.position === 'number')
    .slice(0, 5);
  const leftPole = (slot.axis?.left_label ?? '').trim();
  const rightPole = (slot.axis?.right_label ?? '').trim();
  if (items.length < 2 || leftPole === '' || rightPole === '') return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  const highlight =
    typeof slot.highlight_index === 'number' && items[slot.highlight_index] !== undefined
      ? slot.highlight_index
      : null;

  // ---- Geometry ------------------------------------------------------------
  const stageW = width * (portrait ? 0.88 : 0.8);
  const axisPad = 30 * u; // breathing room past the extreme dots
  const axisW = stageW - axisPad * 2;
  const chipFs = (portrait ? 25 : 27) * u;
  const chipH = chipFs * 2.05;
  const lead = chipFs * 1.7;
  // The pole labels own a reserved row under the axis; bottom chips clear it
  // (a slightly longer bottom leader beats a pole word struck by a chip).
  const poleRow = 36 * u;
  const bottomLead = poleRow + lead;
  const axisY = lead + chipH + 20 * u;
  const stageH = axisY + bottomLead + chipH + 20 * u;

  const axisAt = f30(fps, 8);
  const axisP = easeInOutSine(clamp01((frame - axisAt) / f30(fps, 14)));
  const poleP = easeOutQuint(clamp01((frame - axisAt - f30(fps, 10)) / f30(fps, 10)));

  const at = calloutRevealSchedule(
    items.map((it) => it.label.trim()),
    scene.narration_words,
    fps,
    { first: axisAt + f30(fps, 18), step: f30(fps, 13) }
  );

  // ---- Chip placement: alternate above/below in x order, then de-overlap ---
  const placed = items
    .map((it, i) => {
      const x = axisPad + clamp01(it.position) * axisW;
      const chipW = Math.min(it.label.trim().length * chipFs * 0.58 + chipFs * 1.1, stageW * 0.4);
      return { it, i, x, chipW, side: 'top' as 'top' | 'bottom', chipX: 0 };
    })
    .sort((a, b) => a.x - b.x);
  placed.forEach((p, order) => {
    p.side = order % 2 === 0 ? 'top' : 'bottom';
    p.chipX = Math.min(Math.max(p.x - p.chipW / 2, 2), stageW - p.chipW - 2);
  });
  for (const side of ['top', 'bottom'] as const) {
    const group = placed.filter((p) => p.side === side);
    for (let i = 1; i < group.length; i++) {
      const minX = group[i - 1].chipX + group[i - 1].chipW + chipFs * 0.7;
      if (group[i].chipX < minX) {
        group[i].chipX = Math.min(minX, stageW - group[i].chipW - 2);
      }
    }
  }

  const poleStyle: React.CSSProperties = {
    position: 'absolute',
    top: axisY + 24 * u,
    fontFamily: MONO_FONT,
    fontSize: 23 * u,
    fontWeight: 700,
    letterSpacing: 3 * u,
    textTransform: 'uppercase',
    color: theme.muted,
    opacity: poleP,
    whiteSpace: 'nowrap',
  };

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 34 * u }}>
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
                  fontSize: (portrait ? 52 : 58) * u,
                  lineHeight: 1.05,
                  color: theme.text,
                }}
              >
                <KineticText text={heading} highlight={meta.style?.highlight} />
              </h1>
            ) : null}
          </div>
        )}

        <div style={{ position: 'relative', width: stageW, height: stageH }}>
          {/* The axis, drawn outward from its centre, arrowheads both ways. */}
          <svg
            width={stageW}
            height={stageH}
            viewBox={`0 0 ${stageW} ${stageH}`}
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          >
            {(() => {
              const cx = stageW / 2;
              const half = (axisW / 2 + axisPad * 0.4) * axisP;
              const aw = 12 * u;
              const sw = Math.max(2.5, 2.6 * u);
              return (
                <g stroke={hairline(theme, 0.5)} strokeWidth={sw} strokeLinecap="round" fill="none">
                  <line x1={cx - half} y1={axisY} x2={cx + half} y2={axisY} />
                  {axisP > 0.96 ? (
                    <>
                      <path d={`M ${cx - half + aw} ${axisY - aw * 0.7} L ${cx - half} ${axisY} L ${cx - half + aw} ${axisY + aw * 0.7}`} />
                      <path d={`M ${cx + half - aw} ${axisY - aw * 0.7} L ${cx + half} ${axisY} L ${cx + half - aw} ${axisY + aw * 0.7}`} />
                    </>
                  ) : null}
                </g>
              );
            })()}
            {/* Leaders from each dot to its chip. */}
            {placed.map((p) => {
              const dotP = easeOutQuint(clamp01((frame - at[p.i] - f30(fps, 2)) / f30(fps, 9)));
              if (dotP <= 0) return null;
              const y2 = p.side === 'top' ? axisY - lead : axisY + bottomLead;
              return (
                <line
                  key={p.i}
                  x1={p.x}
                  y1={axisY}
                  x2={p.x}
                  y2={axisY + (y2 - axisY) * dotP}
                  stroke={p.i === highlight ? theme.accent : hairline(theme, 0.4)}
                  strokeWidth={Math.max(2, chipFs * 0.08)}
                />
              );
            })}
          </svg>

          {/* Pole labels under the axis ends. */}
          <div style={{ ...poleStyle, left: 0 }}>← {leftPole}</div>
          <div style={{ ...poleStyle, right: 0 }}>{rightPole} →</div>

          {/* Dots + chips. */}
          {placed.map((p) => {
            const pop = spring({
              frame: Math.max(0, frame - at[p.i]),
              fps,
              config: SPRINGS.pop,
              durationInFrames: Math.round(fps * 0.4),
            });
            const chipP = easeOutQuint(clamp01((frame - at[p.i] - f30(fps, 6)) / f30(fps, 10)));
            const isStar = p.i === highlight;
            const dotR = (isStar ? 13 : 9) * u;
            const chipY = p.side === 'top' ? axisY - lead - chipH : axisY + bottomLead;
            return (
              <React.Fragment key={p.i}>
                <div
                  style={{
                    position: 'absolute',
                    left: p.x - dotR,
                    top: axisY - dotR,
                    width: dotR * 2,
                    height: dotR * 2,
                    borderRadius: '50%',
                    background: isStar ? theme.accent : theme.text,
                    opacity: Math.min(1, pop),
                    transform: `scale(${Math.min(1.1, pop)})`,
                  }}
                />
                <div
                  style={{
                    ...surface,
                    position: 'absolute',
                    left: p.chipX,
                    top: chipY + (1 - chipP) * chipFs * 0.5 * (p.side === 'top' ? -1 : 1),
                    height: chipH,
                    display: 'flex',
                    alignItems: 'center',
                    padding: `0 ${chipFs * 0.55}px`,
                    background: isStar ? theme.accent : theme.panel,
                    color: isStar ? inkOn(theme.accent) : theme.text,
                    fontFamily: BODY_FONT,
                    fontSize: chipFs,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    opacity: chipP,
                    boxSizing: 'border-box',
                  }}
                >
                  {p.it.label.trim()}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {caption ? (
          <div
            style={{
              marginTop: 26 * u,
              fontFamily: MONO_FONT,
              fontSize: 23 * u,
              letterSpacing: 1.4 * u,
              color: theme.muted,
              opacity: headIn,
              textAlign: 'center',
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
