import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, ScaleItem } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText, fitGroup } from '../typography';
import { clamp01, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { useCardReveal } from '../motion/cardReveal';
import { KineticText } from '../components/KineticText';
import { calloutRevealSchedule } from '../components/CalloutLayer';

/** Thousands-grouped magnitude, decimals kept but never padded. */
const groupNumber = (v: number): string => {
  const fixed = String(Number(Math.abs(v).toFixed(2)));
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
};

/**
 * scale_comparison — how big something really is, next to something known.
 *
 * Two or three shapes share one baseline and are drawn at TRUE relative size:
 * each side is `scale`, the validator's linear fraction of the biggest. Linear,
 * not by area — a viewer reads a square's SIDE, so scaling area would quietly
 * halve every ratio the card printed.
 *
 * **When the spread is too wide to draw, the card says so instead of lying.**
 * The validator sets `to_scale: false` past 40x, and this layout then draws the
 * biggest thing alone and gives every other item a marker at a fixed legible
 * size with an accent chip carrying the real ratio ("1,200x smaller"), under a
 * plain "not to scale" note. A speck at 1/1200 of the frame is not honesty —
 * it is an empty pixel that the viewer reads as nothing at all.
 *
 * Columns are as wide as the LABEL needs even when the shape is tiny, so a
 * small thing keeps a readable name without its shape being inflated: the
 * shapes' sizes stay true, the columns around them just breathe.
 *
 * Deterministic beyond the type solver. Flat law: solid fills, hairline
 * baseline, no shadows. Silent per §1.3.
 */
export const ScaleComparison: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_scale'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();
  const reveal = useCardReveal();

  if (!slot) return null;

  const items: ScaleItem[] = (slot.scale_items ?? [])
    .filter(
      (it) => it && (it.label ?? '').trim() !== '' && typeof it.scale === 'number' && it.scale > 0
    )
    .slice(0, 3);
  if (items.length < 2) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const unit = (slot.unit ?? '').trim();
  const circle = (slot.shape ?? 'square') === 'circle';
  // Back-compat with the captions rule: only an explicit false switches the
  // card into ratio mode, so an older payload draws exactly as it always did.
  const toScale = slot.to_scale !== false;

  const highlight =
    typeof slot.highlight_index === 'number' && items[slot.highlight_index] !== undefined
      ? slot.highlight_index
      : null;

  const headIn = reveal.ease(clamp01(frame / reveal.headFrames));
  const at = calloutRevealSchedule(
    items.map((it) => it.label.trim()),
    scene.narration_words,
    fps,
    { first: reveal.first, step: reveal.step }
  );

  const showValue = (v: number): string => `${groupNumber(v)}${unit ? ` ${unit}` : ''}`;
  const showRatio = (r: number): string => `${groupNumber(r)}x smaller`;

  // ---- Geometry -------------------------------------------------------------
  const stageW = width * (portrait ? 0.88 : 0.7);
  const headW = width * (portrait ? 0.86 : 0.72);
  const headFs = heading
    ? fitText(heading, {
        width: headW,
        max: 54 * u,
        min: 28 * u,
        maxLines: 2,
        font: displayFont,
        weight: 900,
      })
    : 0;
  const headZone = (kicker ? 40 * u : 0) + (heading ? headFs * 1.15 * 2 * 0.62 : 0) + 26 * u;
  const capZone = (caption ? 50 * u : 16 * u) + (toScale ? 0 : 44 * u);
  const gap = 30 * u;
  // The NARROWEST column a label can land in — every column is at least this
  // wide, so it is the honest width to solve against. Solving against
  // stageW/n (which only the widest column ever gets) put three lines under a
  // small shape in the portrait sweep: iter 24's lesson, again.
  const minCol = (stageW - gap * (items.length - 1)) / (items.length * 1.55);
  const labelFs = fitGroup(
    items.map((it) => it.label.trim()),
    {
      width: minCol * 0.94,
      max: 30 * u,
      min: 16 * u,
      maxLines: 2,
      font: BODY_FONT,
      weight: 700,
      kinetic: false,
    }
  );
  const figFs = Math.max(19 * u, labelFs * 0.92);
  const noteFs = Math.max(14 * u, labelFs * 0.6);
  const hasNotes = items.some((it) => (it.note ?? '').trim() !== '');
  // Under the baseline: two label lines, the note, and breathing room.
  const footZone = labelFs * 2.4 + (hasNotes ? noteFs * 1.6 : 0) + 18 * u;
  const figZone = figFs * 1.8;
  const maxShape = Math.max(
    120 * u,
    height * 0.86 - headZone - capZone - footZone - figZone - 30 * u
  );

  // In ratio mode only the biggest is drawn true; the rest take a fixed marker
  // that is small enough to read as "far smaller" and big enough to see.
  const drawn = items.map((it) => (toScale ? it.scale : it.scale >= 1 ? 1 : 0.1));

  // Shrink the shapes (never the labels) until the columns fit the stage. Two
  // or three passes always settle it; the loop is bounded so it cannot hang.
  let S = Math.min(maxShape, (stageW - gap * (items.length - 1)) / Math.max(0.001, drawn.reduce((a, b) => a + b, 0)));
  for (let pass = 0; pass < 6; pass++) {
    const total =
      drawn.reduce((a, d) => a + Math.max(d * S, minCol), 0) + gap * (items.length - 1);
    if (total <= stageW) break;
    S *= 0.88;
  }
  const cols = drawn.map((d) => Math.max(d * S, minCol));

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 24 * u }}>
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
                  fontSize: headFs,
                  lineHeight: 1.05,
                  color: theme.text,
                  maxWidth: headW,
                }}
              >
                <KineticText text={heading} highlight={meta.style?.highlight} />
              </h1>
            ) : null}
          </div>
        )}

        {/* One baseline, everything standing on it. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap,
            width: stageW,
            borderBottom: `${Math.max(2, 2.2 * u)}px solid ${hairline(theme, 0.32)}`,
            paddingBottom: 0,
          }}
        >
          {items.map((it, i) => {
            const grow = spring({
              frame: Math.max(0, frame - at[i]),
              fps,
              config: reveal.config,
              durationInFrames: reveal.popFrames,
            });
            const inP = clamp01(grow);
            const isStar = i === highlight;
            const side = drawn[i] * S;
            return (
              <div
                key={i}
                style={{
                  width: cols[i],
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  style={{
                    fontFamily: MONO_FONT,
                    fontSize: figFs,
                    fontWeight: 700,
                    color: isStar ? theme.accent : theme.text,
                    opacity: inP,
                    marginBottom: 10 * u,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {showValue(it.value)}
                </div>
                <div
                  style={{
                    width: side,
                    height: side,
                    background: isStar ? theme.accent : theme.panel,
                    border: `${Math.max(1.5, 1.8 * u)}px solid ${hairline(theme, isStar ? 0.36 : 0.22)}`,
                    borderRadius: circle ? '50%' : 0,
                    boxSizing: 'border-box',
                    // Grows UP from the baseline it stands on.
                    transform: `scale(${inP})`,
                    transformOrigin: 'bottom center',
                    opacity: Math.min(1, inP * 1.6),
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Under the baseline: names, ratios, notes. */}
        <div style={{ display: 'flex', justifyContent: 'center', gap, width: stageW, marginTop: 12 * u }}>
          {items.map((it, i) => {
            const inP = easeOutQuint(clamp01((frame - at[i] - f30(fps, 4)) / f30(fps, 10)));
            const isStar = i === highlight;
            const note = (it.note ?? '').trim();
            const isBiggest = it.scale >= 1;
            return (
              <div
                key={i}
                style={{
                  width: cols[i],
                  textAlign: 'center',
                  opacity: inP,
                }}
              >
                <div
                  style={{
                    fontFamily: BODY_FONT,
                    fontSize: labelFs,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    color: isStar ? theme.accent : theme.text,
                  }}
                >
                  {it.label.trim()}
                </div>
                {/* The ratio chip is what the DRAWING cannot say. In true-scale
                    mode the shapes already say it, so it is left out. */}
                {!toScale && !isBiggest ? (
                  <div
                    style={{
                      display: 'inline-block',
                      marginTop: 6 * u,
                      padding: `${4 * u}px ${10 * u}px`,
                      background: theme.accent,
                      color: inkOn(theme.accent),
                      fontFamily: MONO_FONT,
                      fontSize: noteFs * 1.05,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {showRatio(it.ratio)}
                  </div>
                ) : null}
                {note !== '' ? (
                  <div
                    style={{
                      marginTop: 6 * u,
                      fontFamily: BODY_FONT,
                      fontSize: noteFs,
                      fontWeight: 500,
                      color: theme.muted,
                      lineHeight: 1.2,
                    }}
                  >
                    {note}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {!toScale ? (
          <div
            style={{
              marginTop: 18 * u,
              fontFamily: MONO_FONT,
              fontSize: 20 * u,
              letterSpacing: 1.4 * u,
              textTransform: 'uppercase',
              color: theme.muted,
              opacity: headIn,
            }}
          >
            Not to scale — the gap is too big to draw
          </div>
        ) : null}

        {caption ? (
          <div
            style={{
              marginTop: 18 * u,
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
