import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { Scene, ProportionBranch } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, isLightTheme, hairline, inkOn, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText, fitGroup } from '../typography';
import { clamp01, easeInOutSine, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { KineticText } from '../components/KineticText';
import { calloutRevealSchedule } from '../components/CalloutLayer';

/**
 * Group thousands of a magnitude (receipt's rule), but WITHOUT padding the
 * decimals: seven and a half hours is "7.5", not "7.50". Money pads because a
 * price does; a quantity that happens to be fractional does not, and this card
 * is mostly quantities.
 */
const groupNumber = (v: number): string => {
  const fixed = String(Number(Math.abs(v).toFixed(2)));
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
};

/**
 * Integer percentages that SUM TO 100 — largest remainder, not per-item
 * rounding. Three thirds rounded independently print 33/33/33 under a bar that
 * plainly fills, and a viewer who adds the numbers up catches the card lying
 * about the very thing it exists to show. The remainder goes to the parts that
 * were rounded down hardest, so no share moves by more than one point.
 */
const wholePercents = (shares: number[]): number[] => {
  const raw = shares.map((s) => s * 100);
  const out = raw.map((r) => Math.floor(r));
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && left > 0; k++, left--) {
    out[order[k].i] += 1;
  }
  return out;
};

/**
 * proportion_flow — one whole splitting into its parts.
 *
 * The source bar lands whole, a fork drops out of it, and the same bar is
 * re-drawn below as proportional segments that arrive one by one as the
 * narration names them, each with its own legend row. The branch this beat is
 * about takes the accent.
 *
 * **Every width here comes from `share`, which the VALIDATOR computed from the
 * values — the renderer does no arithmetic of its own and never reads a
 * percentage a model wrote.** That is the whole guarantee of the card: the
 * picture cannot disagree with the figure printed beside it.
 *
 * Two deliberate consequences of drawing honestly:
 *  - a 1% part is a 1% sliver, so its percentage prints INSIDE the segment only
 *    when it fits, and its legend row carries the number regardless. Nothing is
 *    ever widened to be readable — that would be the lie.
 *  - the legend is a plain vertical list, so a lopsided split (the normal case
 *    — that IS usually the finding) has nowhere to collide.
 *
 * Deterministic: no measure pass beyond the type solver, same frame every
 * render. Flat law: solid fields, hairline fork, no gradients. Silent per §1.3.
 */
export const ProportionFlow: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_proportion'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;

  const parts: ProportionBranch[] = (slot.slices ?? [])
    .filter(
      (p) => p && (p.label ?? '').trim() !== '' && typeof p.share === 'number' && p.share > 0
    )
    .slice(0, 5);
  if (parts.length < 2) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const source = (slot.source_label ?? '').trim();
  const unit = (slot.unit ?? '').trim();
  const total = typeof slot.total === 'number' ? slot.total : null;

  // A symbol leads the number ("$12"); a word follows it ("12 hrs"). The
  // trailing symbols are the exception every currency rule forgets — "42¢" and
  // "42%" are never written the other way round.
  const money = unit !== '' && !/[a-z]/i.test(unit) && !/^[%¢°‰]$/.test(unit);
  const show = (v: number): string => {
    if (money) return `${unit}${groupNumber(v)}`;
    if (unit === '') return groupNumber(v);
    // A word gets a space, a trailing symbol does not: "8 hrs", "42¢".
    return `${groupNumber(v)}${/[a-z]/i.test(unit) ? ' ' : ''}${unit}`;
  };

  const pct = wholePercents(parts.map((p) => p.share));
  const highlight =
    typeof slot.highlight_index === 'number' && parts[slot.highlight_index] !== undefined
      ? slot.highlight_index
      : null;

  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  // ---- Geometry: heading zone budgeted FIRST, then the bars, then the list --
  const barW = width * (portrait ? 0.84 : 0.6);
  // The solver is told a column width, so the heading must actually BE in one:
  // the worst-case sweep still ran a 56-character heading off the right edge
  // because the h1 had no max width to wrap against, and a size that "fits in
  // two lines" was rendered as one very long one.
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
  const headZone = (kicker ? 40 * u : 0) + (heading ? headFs * 1.15 * 2 * 0.62 : 0) + 24 * u;
  const capZone = caption ? 50 * u : 16 * u;
  const srcH = (portrait ? 60 : 66) * u;
  const forkH = (portrait ? 46 : 54) * u;
  const segH = (portrait ? 56 : 62) * u;
  const availH = height * 0.86 - headZone - capZone - srcH - forkH - segH - 40 * u;
  const rowH = Math.min(96 * u, Math.max(46 * u, availH / parts.length));

  const hasNotes = parts.some((p) => (p.note ?? '').trim() !== '');
  // One shared size solved from the longest label (iter 24) — a legend whose
  // rows each pick their own size reads as a ransom note.
  const labelFs = fitGroup(
    parts.map((p) => p.label.trim()),
    {
      // The row's text column is materially narrower than the bar: a swatch
      // sits to its left and the figure column to its right (iter 24's lesson —
      // tell the solver the truth about the column it actually gets).
      width: barW * 0.52,
      max: Math.min(32 * u, rowH * (hasNotes ? 0.4 : 0.52)),
      min: 17 * u,
      maxLines: 1,
      font: BODY_FONT,
      weight: 700,
      kinetic: false,
    }
  );
  const noteFs = Math.max(14 * u, labelFs * 0.6);
  const figFs = Math.max(18 * u, labelFs * 0.94);
  const segFs = (portrait ? 22 : 24) * u;

  // Reveals ride the narration's own words; fallback spreads evenly.
  const splitAt = f30(fps, 20);
  const at = calloutRevealSchedule(
    parts.map((p) => p.label.trim()),
    scene.narration_words,
    fps,
    { first: splitAt + f30(fps, 6), step: f30(fps, 10) }
  );

  const srcP = easeOutQuint(clamp01((frame - f30(fps, 6)) / f30(fps, 14)));
  const forkP = easeInOutSine(clamp01((frame - splitAt) / f30(fps, 12)));

  // Depth shading: each segment is the panel pulled a step further toward ink
  // (toward paper on a dark theme would glow). Painted as an inset layer so an
  // accent-highlighted segment keeps its true colour.
  // Capped at four steps: unbounded, the fifth segment sank into the
  // background and read as a missing part rather than a small one.
  const depthTint = (i: number): string => {
    const step = Math.min(i, 4);
    return isLightTheme(theme) ? `rgba(23,18,14,${0.04 * step})` : `rgba(0,0,0,${0.07 * step})`;
  };

  // Segment left edges, in the same units the fork uses.
  const lefts: number[] = [];
  {
    let acc = 0;
    for (const p of parts) {
      lefts.push(acc * barW);
      acc += p.share;
    }
  }

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 22 * u }}>
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

        {/* ---- The whole ---------------------------------------------------- */}
        <div
          style={{
            width: barW,
            height: srcH,
            position: 'relative',
            background: theme.panel,
            border: `1px solid ${hairline(theme, 0.2)}`,
            boxSizing: 'border-box',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `0 ${20 * u}px`,
          }}
        >
          {/* The bar fills from the left as it lands — the whole arriving. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: barW * srcP,
              background: isLightTheme(theme) ? 'rgba(23,18,14,0.07)' : 'rgba(255,255,255,0.07)',
            }}
          />
          <div
            style={{
              position: 'relative',
              fontFamily: BODY_FONT,
              fontSize: Math.max(19 * u, labelFs * 0.92),
              fontWeight: 700,
              color: theme.text,
              opacity: srcP,
              whiteSpace: 'nowrap',
            }}
          >
            {source || 'The whole'}
          </div>
          {total !== null ? (
            <div
              style={{
                position: 'relative',
                fontFamily: MONO_FONT,
                fontSize: Math.max(18 * u, labelFs * 0.86),
                fontWeight: 700,
                color: theme.muted,
                opacity: srcP,
                whiteSpace: 'nowrap',
              }}
            >
              {show(total)}
            </div>
          ) : null}
        </div>

        {/* ---- The fork: one line out of the whole, one into each part ------- */}
        <svg
          width={barW}
          height={forkH}
          viewBox={`0 0 ${barW} ${forkH}`}
          style={{ overflow: 'visible' }}
        >
          <g stroke={hairline(theme, 0.42)} strokeWidth={Math.max(2, 2.2 * u)} fill="none" strokeLinecap="round">
            <line x1={barW / 2} y1={0} x2={barW / 2} y2={forkH * 0.42 * Math.min(1, forkP * 2)} />
            {forkP > 0.4
              ? parts.map((p, i) => {
                  const cx = lefts[i] + (p.share * barW) / 2;
                  // Each leg waits for the segment it feeds. Drawing all five
                  // at the split pointed four of them at empty space.
                  const t = clamp01(
                    Math.min((forkP - 0.4) / 0.6, (frame - (at[i] - f30(fps, 5))) / f30(fps, 8))
                  );
                  if (t <= 0) return null;
                  const y0 = forkH * 0.42;
                  return (
                    <path
                      key={i}
                      d={`M ${barW / 2} ${y0} L ${barW / 2 + (cx - barW / 2) * t} ${y0} L ${
                        barW / 2 + (cx - barW / 2) * t
                      } ${y0 + (forkH - y0) * t}`}
                      opacity={i === highlight ? 1 : 0.75}
                      stroke={i === highlight ? theme.accent : hairline(theme, 0.42)}
                    />
                  );
                })
              : null}
          </g>
        </svg>

        {/* ---- The parts: the same bar, divided ------------------------------ */}
        <div style={{ width: barW, height: segH, display: 'flex', position: 'relative' }}>
          {parts.map((p, i) => {
            const w = p.share * barW;
            const inP = easeOutQuint(clamp01((frame - at[i]) / f30(fps, 10)));
            const isStar = i === highlight;
            // The percentage only prints inside a segment wide enough to hold
            // it. A sliver stays a sliver; its legend row carries the number.
            const fits = w > segFs * 3.1;
            return (
              <div
                key={i}
                style={{
                  width: w,
                  height: '100%',
                  position: 'relative',
                  background: isStar ? theme.accent : theme.panel,
                  borderRight:
                    i < parts.length - 1 ? `${Math.max(2, 2.4 * u)}px solid ${theme.bg_from}` : 'none',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: inP,
                  transform: `scaleY(${0.55 + 0.45 * inP})`,
                  overflow: 'hidden',
                }}
              >
                {!isStar && i > 0 ? (
                  <div style={{ position: 'absolute', inset: 0, background: depthTint(i) }} />
                ) : null}
                {fits ? (
                  <div
                    style={{
                      position: 'relative',
                      fontFamily: MONO_FONT,
                      fontSize: segFs,
                      fontWeight: 700,
                      color: isStar ? inkOn(theme.accent) : theme.text,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pct[i]}%
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* ---- The legend: label, its figure, its share ---------------------- */}
        <div style={{ width: barW, marginTop: 18 * u }}>
          {parts.map((p, i) => {
            const inP = easeOutQuint(clamp01((frame - at[i] - f30(fps, 3)) / f30(fps, 9)));
            const isStar = i === highlight;
            const note = (p.note ?? '').trim();
            return (
              <div
                key={i}
                style={{
                  height: rowH,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14 * u,
                  borderTop: `1px solid ${hairline(theme, 0.12)}`,
                  opacity: inP,
                  transform: `translateX(${(1 - inP) * -12 * u}px)`,
                }}
              >
                {/* The key is a SOLID chip, not the segment's own panel fill:
                    on a dark scheme a panel square on a panel-ish field reads
                    as an empty checkbox (the first probe still showed exactly
                    that). It steps down in weight the way the segments do. */}
                <div
                  style={{
                    width: 16 * u,
                    height: 16 * u,
                    flex: '0 0 auto',
                    background: isStar ? theme.accent : theme.muted,
                    opacity: isStar ? 1 : Math.max(0.4, 1 - i * 0.17),
                  }}
                />
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: BODY_FONT,
                      fontSize: labelFs,
                      fontWeight: 700,
                      color: isStar ? theme.accent : theme.text,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.label.trim()}
                  </div>
                  {note !== '' && rowH > 58 * u ? (
                    <div
                      style={{
                        marginTop: 3 * u,
                        fontFamily: BODY_FONT,
                        fontSize: noteFs,
                        fontWeight: 500,
                        color: theme.muted,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {note}
                    </div>
                  ) : null}
                </div>
                <div
                  style={{
                    flex: '0 0 auto',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 12 * u,
                    fontFamily: MONO_FONT,
                    fontWeight: 700,
                  }}
                >
                  <div style={{ fontSize: figFs, color: theme.text, whiteSpace: 'nowrap' }}>
                    {show(p.value)}
                  </div>
                  <div style={{ fontSize: figFs * 0.82, color: theme.muted, whiteSpace: 'nowrap' }}>
                    {pct[i]}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {caption ? (
          <div
            style={{
              marginTop: 20 * u,
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
