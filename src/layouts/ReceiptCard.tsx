import React from 'react';
import { AbsoluteFill, useVideoConfig, spring } from 'remotion';
import { Scene, ReceiptRow } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeInOutSine, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { SPRINGS } from '../motion/springs';
import { KineticText } from '../components/KineticText';
import { calloutRevealSchedule } from '../components/CalloutLayer';

/**
 * Group thousands of an UNSIGNED magnitude, keeping any decimals. The sign is
 * deliberately not handled here: on a currency line it belongs outside the
 * symbol ("−$2,400", never "$−2,400"), which only the caller knows.
 */
const groupNumber = (v: number): string => {
  const fixed = Math.abs(v) % 1 === 0 ? String(Math.abs(v)) : Math.abs(v).toFixed(2);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
};

/**
 * receipt_card — the itemised breakdown beat.
 *
 * A till receipt in mono type: each line prints with its figure right-aligned
 * over a dotted leader, a double rule closes the list, and the total stamps in
 * below in accent. Everything is tabular-nums so the column of figures stays
 * dead straight as values land.
 *
 * The figures are NOT this component's problem: the validator has already
 * recomputed the total from the rows, so whatever arrives here adds up. That
 * separation is deliberate — arithmetic is a guarantee made once, server-side,
 * not something re-derived in the renderer where it could drift.
 *
 * Flat law: hairline rules, dotted leaders, no panel behind the list. Silent
 * per §1.3.
 */
export const ReceiptCard: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_receipt'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  if (!slot) return null;

  const rows: ReceiptRow[] = (slot.rows ?? [])
    .filter((r) => r && (r.label ?? '').trim() !== '' && typeof r.value === 'number')
    .slice(0, 8);
  if (rows.length < 2) return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const caption = (slot.caption ?? '').trim();
  const totalLabel = (slot.total_label ?? '').trim() || 'Total';
  const total = typeof slot.total === 'number' ? slot.total : rows.reduce((a, r) => a + r.value, 0);
  const unit = (slot.unit ?? '').trim();

  // A symbol leads the number ("$12"); a word follows it ("12 hrs").
  const money = unit !== '' && !/[a-z]/i.test(unit);
  const show = (v: number): string => {
    const sign = v < 0 ? '−' : '';
    return money ? `${sign}${unit}${groupNumber(v)}` : `${sign}${groupNumber(v)}${unit ? ` ${unit}` : ''}`;
  };

  const headIn = easeOutQuint(clamp01(frame / f30(fps, 10)));
  const at = calloutRevealSchedule(
    rows.map((r) => r.label.trim()),
    scene.narration_words,
    fps,
    { first: f30(fps, 12), step: f30(fps, 9) }
  );
  // The total is the payoff: it lands after the last line, but never so late
  // that it misses its own scene.
  const totalAt = Math.min(Math.max(...at) + f30(fps, 10), Math.round((scene.duration_seconds ?? 8) * fps * 0.78));
  const rulesP = easeInOutSine(clamp01((frame - totalAt + f30(fps, 8)) / f30(fps, 10)));

  // Long lists shrink so eight rows still breathe inside the frame.
  const rowFs = (rows.length > 6 ? 27 : rows.length > 4 ? 30 : 33) * u * (portrait ? 0.92 : 1);
  const totalFs = rowFs * 1.5;
  const listW = portrait ? '94%' : '62%';

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '5%', boxSizing: 'border-box' }}>
      <div style={{ width: listW }}>
        {(kicker || heading) && (
          <div style={{ textAlign: 'center', marginBottom: 26 * u, opacity: headIn }}>
            {kicker ? (
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 24 * u,
                  letterSpacing: 4 * u,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: heading ? 12 * u : 0,
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
                  max: 52 * u,
                  min: 27 * u,
                  maxLines: 2,
                  font: displayFont,
                  weight: 900,
                }),
                  lineHeight: 1.06,
                  color: theme.text,
                }}
              >
                <KineticText text={heading} highlight={meta.style?.highlight} />
              </h1>
            ) : null}
          </div>
        )}

        {/* The itemised lines. */}
        {rows.map((row, i) => {
          const p = easeOutQuint(clamp01((frame - at[i]) / f30(fps, 9)));
          if (p <= 0) return null;
          const credit = row.value < 0;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10 * u,
                padding: `${rowFs * 0.34}px 0`,
                borderBottom: `${Math.max(1, 1.2 * u)}px dotted ${hairline(theme, 0.32)}`,
                opacity: p,
                transform: `translateX(${(1 - p) * -10 * u}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: rowFs,
                  color: theme.text,
                  flex: '1 1 auto',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.label.trim()}
              </span>
              <span
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: rowFs,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: credit ? theme.accent : theme.text,
                  flex: '0 0 auto',
                }}
              >
                {show(row.value)}
              </span>
            </div>
          );
        })}

        {/* Double rule — the accounting close. */}
        <div style={{ marginTop: 14 * u }}>
          <div style={{ height: Math.max(2, 2.2 * u), width: `${rulesP * 100}%`, background: hairline(theme, 0.6) }} />
          <div
            style={{
              height: Math.max(1, 1.2 * u),
              width: `${rulesP * 100}%`,
              marginTop: 4 * u,
              background: hairline(theme, 0.4),
            }}
          />
        </div>

        {/* The total. */}
        {(() => {
          const pop = spring({
            frame: Math.max(0, frame - totalAt),
            fps,
            config: SPRINGS.pop,
            durationInFrames: Math.round(fps * 0.45),
          });
          if (pop <= 0.001) return null;
          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12 * u,
                marginTop: 18 * u,
                opacity: Math.min(1, pop),
                transform: `scale(${Math.min(1.02, 0.98 + pop * 0.04)})`,
                transformOrigin: 'left center',
              }}
            >
              <span
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: totalFs * 0.62,
                  letterSpacing: 3 * u,
                  textTransform: 'uppercase',
                  color: theme.muted,
                }}
              >
                {totalLabel}
              </span>
              <span
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: totalFs,
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  color: theme.accent,
                }}
              >
                {show(total)}
              </span>
            </div>
          );
        })()}

        {caption ? (
          <div
            style={{
              marginTop: 22 * u,
              textAlign: 'center',
              fontFamily: MONO_FONT,
              fontSize: 22 * u,
              letterSpacing: 1.2 * u,
              color: theme.muted,
              opacity: easeOutQuint(clamp01((frame - totalAt - f30(fps, 8)) / f30(fps, 10))),
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
