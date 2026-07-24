import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, QuadrantItem } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useSurfaceStyle } from '../components/Surface';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeInOutSine, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { useCardReveal } from '../motion/cardReveal';
import { KineticText } from '../components/KineticText';
import { calloutRevealSchedule } from '../components/CalloutLayer';

/**
 * quadrant_map — the 2x2 matrix: spectrum_card's two-dimensional sibling.
 *
 * Two axes draw outward from the centre, the four zones name themselves
 * faintly behind the field, then each item's dot pops with its label chip as
 * the narration names it. The item the beat is about takes the accent.
 *
 * Coordinates are DATA (x, y both 0..1, y measured UP from the bottom pole),
 * so the whole card is deterministic — no measure pass, same frame every
 * render. Flat law: hairline axes, solid dots, panel chips, no shadows.
 * Silent per §1.3.
 *
 * The layout problem this card has and spectrum does not: chips can collide in
 * BOTH directions. Two items in the same corner is the normal case (that IS
 * the finding), so chips are placed on the side of their dot that faces the
 * nearest edge and then pushed apart vertically in a single greedy pass —
 * a chip never leaves the stage, and a cluster reads as a stack rather than a
 * pile.
 */
export const QuadrantMap: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_quadrant'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const surface = useSurfaceStyle(false);
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();
  const reveal = useCardReveal();

  if (!slot) return null;

  const items: QuadrantItem[] = (slot.quadrant_items ?? [])
    .filter(
      (it) =>
        it && (it.label ?? '').trim() !== '' && typeof it.x === 'number' && typeof it.y === 'number'
    )
    .slice(0, 6);
  const xLeft = (slot.x_axis?.left_label ?? '').trim();
  const xRight = (slot.x_axis?.right_label ?? '').trim();
  const yBottom = (slot.y_axis?.bottom_label ?? '').trim();
  const yTop = (slot.y_axis?.top_label ?? '').trim();
  if (items.length < 3 || xLeft === '' || xRight === '' || yBottom === '' || yTop === '') {
    return null;
  }

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const zones = slot.zones ?? {};
  const headIn = reveal.ease(clamp01(frame / reveal.headFrames));

  const highlight =
    typeof slot.highlight_index === 'number' && items[slot.highlight_index] !== undefined
      ? slot.highlight_index
      : null;

  // ---- Geometry: a SQUARE field, because both axes mean the same amount ----
  // A stretched matrix reads as "x matters more", which is a claim the data
  // never made. The square is sized from whichever dimension is scarcer once
  // the axis labels have taken their rows.
  const poleRow = 34 * u; // x-axis pole labels, under the field
  const yLabelW = (portrait ? 30 : 34) * u; // y-axis pole labels, beside it
  const headRoom = (heading || kicker ? 150 : 40) * u + (caption ? 60 * u : 0);
  const maxW = width * (portrait ? 0.9 : 0.62) - yLabelW * 2;
  const maxH = height - headRoom - poleRow * 2 - 80 * u;
  const field = Math.max(220 * u, Math.min(maxW, maxH));

  const stageW = field + yLabelW * 2;
  const stageH = field + poleRow * 2;
  const ox = yLabelW; // field origin inside the stage
  const oy = poleRow;

  const chipFs = (portrait ? 22 : 24) * u;
  const chipH = chipFs * 1.95;
  const dotGap = chipFs * 0.55;

  const axisAt = f30(fps, 8);
  const axisP = easeInOutSine(clamp01((frame - axisAt) / f30(fps, 16)));
  const poleP = easeOutQuint(clamp01((frame - axisAt - f30(fps, 10)) / f30(fps, 10)));
  const zoneP = easeOutQuint(clamp01((frame - axisAt - f30(fps, 14)) / f30(fps, 12)));

  const at = calloutRevealSchedule(
    items.map((it) => it.label.trim()),
    scene.narration_words,
    fps,
    { first: axisAt + reveal.first, step: reveal.step }
  );

  // ---- Item placement -------------------------------------------------------
  // Screen y is flipped: y = 1 (the TOP pole) is the top of the field.
  const placed = items
    .map((it, i) => {
      const px = ox + clamp01(it.x) * field;
      const py = oy + (1 - clamp01(it.y)) * field;
      const chipW = Math.min(
        it.label.trim().length * chipFs * 0.56 + chipFs * 1.05,
        field * 0.62
      );
      // The chip hangs on the side facing the nearer vertical edge, so a dot
      // near the right wall labels leftward instead of running off it.
      const toRight = px < ox + field / 2;
      const chipX = toRight ? px + dotGap : px - dotGap - chipW;
      return { it, i, px, py, chipW, chipX, chipY: py - chipH / 2 };
    })
    .sort((a, b) => a.chipY - b.chipY);

  // One greedy pass down the stage: any chip overlapping the previous one on
  // the same side is pushed below it. Clamped so nothing leaves the frame.
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1];
    const cur = placed[i];
    const sameColumn = Math.abs(cur.chipX - prev.chipX) < Math.max(cur.chipW, prev.chipW) * 0.75;
    if (sameColumn && cur.chipY < prev.chipY + chipH + 6 * u) {
      cur.chipY = prev.chipY + chipH + 6 * u;
    }
  }
  for (const p of placed) {
    p.chipY = Math.min(Math.max(p.chipY, 2), stageH - chipH - 2);
    p.chipX = Math.min(Math.max(p.chipX, 2), stageW - p.chipW - 2);
  }

  const poleBase: React.CSSProperties = {
    position: 'absolute',
    fontFamily: MONO_FONT,
    fontSize: (portrait ? 20 : 22) * u,
    fontWeight: 700,
    letterSpacing: 2.4 * u,
    textTransform: 'uppercase',
    color: theme.muted,
    opacity: poleP,
    whiteSpace: 'nowrap',
  };
  const zoneStyle = (align: 'left' | 'right', valign: 'top' | 'bottom'): React.CSSProperties => ({
    position: 'absolute',
    [align]: 14 * u,
    [valign]: 12 * u,
    maxWidth: field / 2 - 26 * u,
    fontFamily: MONO_FONT,
    fontSize: (portrait ? 19 : 21) * u,
    letterSpacing: 1.6 * u,
    textTransform: 'uppercase',
    color: theme.muted,
    opacity: zoneP * 0.55,
    textAlign: align,
    lineHeight: 1.15,
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 26 * u }}>
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
                  fontSize: fitText(heading, {
                    width: width * (portrait ? 0.86 : 0.74),
                    max: 54 * u,
                    min: 28 * u,
                    maxLines: 2,
                    font: displayFont,
                    weight: 900,
                  }),
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
          {/* The zone names sit BEHIND everything, inside their own boxes. */}
          {[
            ['top_left', 'left', 'top'],
            ['top_right', 'right', 'top'],
            ['bottom_left', 'left', 'bottom'],
            ['bottom_right', 'right', 'bottom'],
          ].map(([key, align, valign]) => {
            const text = ((zones as Record<string, string | undefined>)[key] ?? '').trim();
            if (text === '') return null;
            const boxTop = valign === 'top' ? oy : oy + field / 2;
            const boxLeft = align === 'left' ? ox : ox + field / 2;
            return (
              <div
                key={key}
                style={{
                  position: 'absolute',
                  left: boxLeft,
                  top: boxTop,
                  width: field / 2,
                  height: field / 2,
                }}
              >
                <div style={zoneStyle(align as 'left' | 'right', valign as 'top' | 'bottom')}>{text}</div>
              </div>
            );
          })}

          <svg
            width={stageW}
            height={stageH}
            viewBox={`0 0 ${stageW} ${stageH}`}
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          >
            {(() => {
              const cx = ox + field / 2;
              const cy = oy + field / 2;
              const half = (field / 2) * axisP;
              const aw = 11 * u;
              const sw = Math.max(2.5, 2.4 * u);
              return (
                <g stroke={hairline(theme, 0.5)} strokeWidth={sw} strokeLinecap="round" fill="none">
                  {/* The field's own boundary, drawn faint — it is the frame
                      the zone names belong to, not a chart's box. */}
                  <rect
                    x={ox}
                    y={oy}
                    width={field}
                    height={field}
                    stroke={hairline(theme, 0.22)}
                    strokeWidth={Math.max(1.5, 1.6 * u)}
                    opacity={axisP}
                  />
                  <line x1={cx - half} y1={cy} x2={cx + half} y2={cy} />
                  <line x1={cx} y1={cy - half} x2={cx} y2={cy + half} />
                  {axisP > 0.96 ? (
                    <>
                      <path d={`M ${ox + aw} ${cy - aw * 0.7} L ${ox} ${cy} L ${ox + aw} ${cy + aw * 0.7}`} />
                      <path d={`M ${ox + field - aw} ${cy - aw * 0.7} L ${ox + field} ${cy} L ${ox + field - aw} ${cy + aw * 0.7}`} />
                      <path d={`M ${cx - aw * 0.7} ${oy + aw} L ${cx} ${oy} L ${cx + aw * 0.7} ${oy + aw}`} />
                      <path d={`M ${cx - aw * 0.7} ${oy + field - aw} L ${cx} ${oy + field} L ${cx + aw * 0.7} ${oy + field - aw}`} />
                    </>
                  ) : null}
                </g>
              );
            })()}

            {/* A short leader from each dot to its chip. */}
            {placed.map((p) => {
              const dotP = easeOutQuint(clamp01((frame - at[p.i] - f30(fps, 2)) / f30(fps, 9)));
              if (dotP <= 0) return null;
              const target = p.chipX > p.px ? p.chipX : p.chipX + p.chipW;
              return (
                <line
                  key={p.i}
                  x1={p.px}
                  y1={p.py}
                  x2={p.px + (target - p.px) * dotP}
                  y2={p.py + (p.chipY + chipH / 2 - p.py) * dotP}
                  stroke={p.i === highlight ? theme.accent : hairline(theme, 0.4)}
                  strokeWidth={Math.max(1.8, chipFs * 0.07)}
                />
              );
            })}
          </svg>

          {/* Axis pole labels: x under the field, y beside it (rotated). */}
          <div style={{ ...poleBase, left: ox, top: oy + field + 10 * u }}>← {xLeft}</div>
          <div style={{ ...poleBase, right: ox, top: oy + field + 10 * u }}>{xRight} →</div>
          {/* BOTH y poles ride the LEFT edge — low at the bottom, high at the
              top — because that is where the vertical axis actually runs.
              Splitting them across the left and right margins (the first cut
              of this card) read as a second horizontal axis and inverted the
              whole matrix for the viewer. Rotated -90deg the text reads
              bottom-to-top, so each label climbs alongside the axis it names;
              the axis arrowheads already carry the direction. */}
          <div
            style={{
              ...poleBase,
              left: 0,
              top: oy + field * 0.76,
              transform: 'translate(-50%, -50%) rotate(-90deg)',
              transformOrigin: 'center',
            }}
          >
            {yBottom}
          </div>
          <div
            style={{
              ...poleBase,
              left: 0,
              top: oy + field * 0.24,
              transform: 'translate(-50%, -50%) rotate(-90deg)',
              transformOrigin: 'center',
            }}
          >
            {yTop}
          </div>

          {/* Dots + chips. */}
          {placed.map((p) => {
            const pop = spring({
              frame: Math.max(0, frame - at[p.i]),
              fps,
              config: reveal.config,
              durationInFrames: reveal.popFrames,
            });
            const chipP = easeOutQuint(clamp01((frame - at[p.i] - f30(fps, 6)) / f30(fps, 10)));
            const isStar = p.i === highlight;
            const dotR = (isStar ? 12 : 8.5) * u;
            return (
              <React.Fragment key={p.i}>
                <div
                  style={{
                    position: 'absolute',
                    left: p.px - dotR,
                    top: p.py - dotR,
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
                    top: p.chipY,
                    height: chipH,
                    display: 'flex',
                    alignItems: 'center',
                    padding: `0 ${chipFs * 0.52}px`,
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
              marginTop: 24 * u,
              fontFamily: MONO_FONT,
              fontSize: 22 * u,
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
