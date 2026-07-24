import React, { useLayoutEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, useVideoConfig } from 'remotion';
import { FormulaPart, Scene } from '../types';
import { useSceneClock } from '../canvas/SceneClock';
import { useSceneMeta } from '../components/SceneMeta';
import { useTheme, useDisplayFont, hairline, MONO_FONT, BODY_FONT } from '../theme';
import { useScaleUnit } from '../responsive';
import { fitText } from '../typography';
import { clamp01, easeOutCubic, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';
import { calloutRevealSchedule } from '../components/CalloutLayer';
import { MathText, parseMath, collectAtoms, mathWidthUnits } from '../math/mathText';

/**
 * formula_anatomy — one equation, anatomized. The formula typesets large and
 * alone; each named part gets an accent underline drawn beneath its atoms, a
 * leader line, and a flat label chip ("−4.9 — half of gravity, pulling
 * down"), landing as the narration names it. The intro beat before the
 * working starts: the viewer meets every piece of the formula before any
 * algebra moves it around.
 *
 * Geometry is exact, not estimated: MathText tags every atom span
 * (data-ma="fa:<i>", collectAtoms order), a part's `match` is parsed with the
 * SAME parser and its atom run located in the formula's atoms (StepArrows'
 * findRun approach), and the union of those spans is measured with
 * offset-walks — transform-free, so the board camera or an entrance
 * translate never pollutes the mapping. Measurement runs under a
 * ResizeObserver + delayRender (the Remotion mount-measures-0×0 gotcha,
 * v27) so probe stills and real renders both see placed labels.
 */

type Box = { x: number; y: number; w: number; h: number };

/** First contiguous occurrence of `needle`'s atoms inside `hay`'s atoms. */
const findRun = (hay: string[], needle: string[]): [number, number] | null => {
  if (needle.length === 0 || hay.length < needle.length) return null;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return [i, i + needle.length - 1];
  }
  return null;
};

/** Layout position of an element relative to `container` (transform-free). */
const offsetBox = (el: HTMLElement, container: HTMLElement): Box => {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
};

interface PlacedPart {
  label: string;
  /** Union box of the part's atoms, in stage coordinates. */
  box: Box;
  side: 'top' | 'bottom';
  chipX: number;
  chipY: number;
  chipW: number;
}

export const FormulaAnatomy: React.FC<{ scene: Scene }> = ({ scene }) => {
  const slot = scene.slots['slot_formula'] ?? Object.values(scene.slots)[0];
  const theme = useTheme();
  const displayFont = useDisplayFont();
  const u = useScaleUnit();
  const { fps, height, width } = useVideoConfig();
  const { frame } = useSceneClock();
  const meta = useSceneMeta();

  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ parts: (Box | null)[]; formula: Box } | null>(null);
  const [handle] = useState(() => delayRender('FormulaAnatomy measure'));

  const formula = (slot?.formula ?? '').trim();
  const parts: FormulaPart[] = (slot?.parts ?? [])
    .filter((p) => p && (p.match ?? '').trim() !== '' && (p.label ?? '').trim() !== '')
    .slice(0, 4);
  const sig = formula + '§' + parts.map((p) => p.match + '>' + p.label).join('|');

  // Measure each part's atom-run union whenever the stage has real pixels.
  // The observer also catches a late font swap changing the metrics.
  useLayoutEffect(() => {
    if (!stage || formula === '') {
      continueRender(handle);
      return;
    }
    let done = false;
    const finish = (): void => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    const atoms = collectAtoms(parseMath(formula));
    const measure = (): void => {
      if (stage.offsetWidth === 0 || stage.offsetHeight === 0) return;
      const root = stage.querySelector<HTMLElement>('[data-fa-root]');
      if (!root || root.offsetWidth === 0) return;
      const formulaBox = offsetBox(root, stage);
      const partBoxes = parts.map((p) => {
        const run = findRun(atoms, collectAtoms(parseMath(p.match)));
        if (!run) return null;
        let box: Box | null = null;
        for (let k = run[0]; k <= run[1]; k++) {
          const el = stage.querySelector<HTMLElement>(`[data-ma="fa:${k}"]`);
          if (!el) return null;
          const b = offsetBox(el, stage);
          box = box
            ? {
                x: Math.min(box.x, b.x),
                y: Math.min(box.y, b.y),
                w: Math.max(box.x + box.w, b.x + b.w) - Math.min(box.x, b.x),
                h: Math.max(box.y + box.h, b.y + b.h) - Math.min(box.y, b.y),
              }
            : b;
        }
        return box;
      });
      const next = { parts: partBoxes, formula: formulaBox };
      setMeasured((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      finish();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    const t = setTimeout(finish, 1500);
    return () => {
      ro.disconnect();
      clearTimeout(t);
      finish();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, sig, handle]);

  if (!slot || formula === '') return null;

  const portrait = height > width;
  const heading = (slot.heading ?? '').trim();
  const kicker = (meta.style?.kicker ?? slot.label ?? '').trim();
  const headIn = easeOutQuint(clamp01(frame / f30(fps, 12)));

  // ---- Type size: the formula is the hero — width-fit, one line ------------
  const units = Math.max(mathWidthUnits(parseMath(formula)), 6);
  const availW = (portrait ? 940 : 1460) * u;
  const exprSize = Math.max(30 * u, Math.min((portrait ? 72 : 84) * u, availW / (units * 0.6 + 1)));

  const chipFs = Math.max(17, Math.min(30 * u, exprSize * 0.36));
  const chipH = chipFs * 2.1;
  const chipPad = chipFs * 0.55;
  const lead = chipFs * 2.4;
  // The stage spans the padded frame exactly — its width is also the SVG
  // coordinate space, so it must never be clamped by the parent.
  const stageW = width * 0.9;
  // A stacked fraction typesets ~2.5× the base size tall — the stage must
  // budget the real formula height or the chips sit on the denominator.
  const formulaAllowance = formula.includes('frac{') ? exprSize * 2.9 : exprSize * 1.35;
  const stageH = formulaAllowance + (lead + chipH + chipFs * 1.1) * 2;

  const formulaAt = f30(fps, 10);
  const formulaIn = easeOutQuint(clamp01((frame - formulaAt) / f30(fps, 14)));

  const labels = parts.map((p) => p.label.trim());
  const at = calloutRevealSchedule(labels, scene.narration_words, fps, {
    first: formulaAt + f30(fps, 22),
    step: f30(fps, 16),
  });

  // ---- Place chips in rows above/below the WHOLE formula -------------------
  // Chips never sit relative to their own part's box: in a stacked fraction
  // "below the numerator" is ON the denominator. Each part picks its side by
  // where it sits inside the formula (numerator → above, denominator →
  // below); a flat formula alternates for de-clutter. The leader then runs
  // from the part's underline to its chip row without crossing the type.
  const placed: PlacedPart[] = [];
  if (measured) {
    const fBox = measured.formula;
    const fMidY = fBox.y + fBox.h / 2;
    const topRowY = Math.max(fBox.y - lead - chipH, 2);
    const bottomRowY = Math.min(fBox.y + fBox.h + lead, stageH - chipH - 2);
    const withBox = parts
      .map((p, i) => ({ part: p, box: measured.parts[i], i }))
      .filter((e): e is { part: FormulaPart; box: Box; i: number } => e.box !== null)
      .sort((a, b) => a.box.x - b.box.x);
    withBox.forEach((e, order) => {
      const cx = e.box.x + e.box.w / 2;
      const cy = e.box.y + e.box.h / 2;
      const chipW = Math.min(e.part.label.trim().length * chipFs * 0.56 + chipPad * 2, stageW * 0.46);
      const offMid = cy - fMidY;
      const side: PlacedPart['side'] =
        Math.abs(offMid) > exprSize * 0.2 ? (offMid < 0 ? 'top' : 'bottom') : order % 2 === 0 ? 'bottom' : 'top';
      const chipX = Math.min(Math.max(cx - chipW / 2, 4), stageW - chipW - 4);
      const chipY = side === 'bottom' ? bottomRowY : topRowY;
      placed[e.i] = { label: e.part.label.trim(), box: e.box, side, chipX, chipY, chipW };
    });
    // Same-side neighbours must not collide: sweep left→right, push right.
    for (const side of ['top', 'bottom'] as const) {
      const group = placed.filter((p) => p && p.side === side).sort((a, b) => a.chipX - b.chipX);
      for (let i = 1; i < group.length; i++) {
        const minX = group[i - 1].chipX + group[i - 1].chipW + chipFs * 0.8;
        if (group[i].chipX < minX) {
          group[i].chipX = Math.min(minX, stageW - group[i].chipW - 4);
        }
      }
    }
  }

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
                  width: width * (portrait ? 0.86 : 0.78),
                  max: 58 * u,
                  min: 30 * u,
                  maxLines: 2,
                  font: displayFont,
                  weight: 900,
                }),
                  lineHeight: 1.05,
                  color: theme.text,
                  opacity: headIn,
                }}
              >
                {heading}
              </h1>
            ) : null}
          </div>
        )}

        {/* The stage: formula centered, labels hung above and below it. */}
        <div
          ref={setStage}
          style={{
            position: 'relative',
            width: stageW,
            height: stageH,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div data-fa-root style={{ display: 'flex', opacity: formulaIn }}>
            <MathText
              expr={formula}
              color={theme.text}
              atomMark="fa"
              style={{
                fontFamily: displayFont,
                fontWeight: 800,
                fontSize: exprSize,
                lineHeight: 1.2,
                justifyContent: 'center',
              }}
            />
          </div>

          <svg
            width={stageW}
            height={stageH}
            viewBox={`0 0 ${stageW} ${stageH}`}
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          >
            {placed.map((p, i) => {
              if (!p) return null;
              const underP = easeOutCubic(clamp01((frame - at[i]) / f30(fps, 10)));
              const lineP = easeOutCubic(clamp01((frame - at[i] - f30(fps, 5)) / f30(fps, 10)));
              if (underP <= 0) return null;
              const cx = p.box.x + p.box.w / 2;
              const underY = p.side === 'bottom' ? p.box.y + p.box.h + 4 : p.box.y - 4;
              const y2 = p.side === 'bottom' ? p.chipY : p.chipY + chipH;
              const x2 = Math.min(Math.max(cx, p.chipX + chipFs), p.chipX + p.chipW - chipFs);
              const len = Math.hypot(x2 - cx, y2 - underY);
              return (
                <g key={i}>
                  {/* The part's underline — drawn outward from its centre. */}
                  <line
                    x1={cx - (p.box.w / 2) * underP}
                    y1={underY}
                    x2={cx + (p.box.w / 2) * underP}
                    y2={underY}
                    stroke={theme.accent}
                    strokeWidth={Math.max(3, exprSize * 0.06)}
                    strokeLinecap="round"
                  />
                  {/* Leader from the underline down/up into the chip. */}
                  <line
                    x1={cx}
                    y1={underY}
                    x2={x2}
                    y2={y2}
                    stroke={theme.accent}
                    strokeWidth={Math.max(2, chipFs * 0.09)}
                    strokeDasharray={len}
                    strokeDashoffset={(1 - lineP) * len}
                  />
                  {/* The nib: a pen tip riding the leader's draw frontier as it
                      runs from the underline into the chip, gone once it lands —
                      the same write-cursor the flowchart/cycle cards use. */}
                  {lineP > 0.06 && lineP < 0.94 ? (
                    <circle
                      cx={cx + (x2 - cx) * lineP}
                      cy={underY + (y2 - underY) * lineP}
                      r={Math.max(3, chipFs * 0.12)}
                      fill={theme.accent}
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>

          {placed.map((p, i) => {
            if (!p) return null;
            const chipP = easeOutQuint(clamp01((frame - at[i] - f30(fps, 10)) / f30(fps, 11)));
            if (chipP <= 0) return null;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: p.chipX,
                  top: p.chipY + (1 - chipP) * chipFs * 0.5 * (p.side === 'bottom' ? 1 : -1),
                  height: chipH,
                  display: 'flex',
                  alignItems: 'center',
                  padding: `0 ${chipPad}px`,
                  maxWidth: stageW * 0.46,
                  background: theme.panel,
                  border: `1px solid ${hairline(theme, 0.28)}`,
                  color: theme.text,
                  fontFamily: BODY_FONT,
                  fontSize: chipFs,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  opacity: chipP,
                  boxSizing: 'border-box',
                }}
              >
                {p.label}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
