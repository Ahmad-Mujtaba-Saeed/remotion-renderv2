import React, { useLayoutEffect, useState } from 'react';
import { MathStep } from '../types';
import { parseMath, collectAtoms } from './mathText';
import { clamp01, easeInOutQuint, easeOutQuint } from '../motion/easing';

/**
 * StepArrows — the teacher's pen strokes between two lines of working.
 *
 * A step may declare arrows: [{from, to}] — "the 5 in the previous line
 * BECOMES the -5 in this one", "this x distributes onto that x^2". The tokens
 * are matched against the atoms of each line (MathText tags every atom span
 * with data-ma="r<row>:<atomIndex>" when given an atomMark, in collectAtoms
 * order), their layout positions are measured, and a curved accent arrow is
 * drawn from the source atom down to the target atom as the step lands.
 *
 * Measurement uses offsetLeft/offsetTop walked up to the positioned container,
 * NOT getBoundingClientRect — offsets are transform-free, so neither the row's
 * landing translateY nor the board camera's scale pollutes the coordinates.
 * Layout is static after mount (rows animate with transform/clip/opacity
 * only), so one measurement per steps-signature is enough.
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

type Curve = { d: string; step: number; tipX: number; tipY: number; ang: number };

export const StepArrows: React.FC<{
  /**
   * The positioned element the atom spans live in (offsetParent chain root).
   * Passed as STATE (callback ref), not a ref object: a child's layout effect
   * runs BEFORE its parent's ref attaches, so a plain ref would still be null
   * on the first pass and the measurement would silently never happen.
   */
  container: HTMLDivElement | null;
  steps: MathStep[];
  /** Frame each step lands at (the card's own pacing). */
  landAt: number[];
  frame: number;
  fps: number;
  color: string;
  strokeWidth: number;
  /** Per-step opacity so arrows dim exactly with their rows. */
  dimOf: (step: number) => number;
}> = ({ container, steps, landAt, frame, fps, color, strokeWidth, dimOf }) => {
  const [curves, setCurves] = useState<Curve[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // One signature per content so we re-measure only when the working changes.
  const sig = steps.map((s) => `${s.expr}|${(s.arrows ?? []).map((a) => a.from + '>' + a.to).join(',')}`).join('§');

  useLayoutEffect(() => {
    if (!container) return;

    const rowAtoms = steps.map((s) => collectAtoms(parseMath(s.expr)));
    const out: Curve[] = [];

    steps.forEach((step, i) => {
      const arrows = (step.arrows ?? []).slice(0, 3);
      if (i === 0 || arrows.length === 0) return;

      for (const a of arrows) {
        const fromRun = findRun(rowAtoms[i - 1], collectAtoms(parseMath(a.from)));
        const toRun = findRun(rowAtoms[i], collectAtoms(parseMath(a.to)));
        if (!fromRun || !toRun) continue;

        const union = (row: number, run: [number, number]): Box | null => {
          let box: Box | null = null;
          for (let k = run[0]; k <= run[1]; k++) {
            const el = container.querySelector<HTMLElement>(`[data-ma="r${row}:${k}"]`);
            if (!el) return null;
            const b = offsetBox(el, container);
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
        };

        const src = union(i - 1, fromRun);
        const dst = union(i, toRun);
        if (!src || !dst) continue;

        // From under the source atom, swoop down into the top of the target.
        const x1 = src.x + src.w / 2;
        const y1 = src.y + src.h + 2;
        const x2 = dst.x + dst.w / 2;
        const y2 = dst.y - 2;
        let d: string;
        let ang: number;
        if (Math.abs(x2 - x1) < 14) {
          // A truly vertical drop bows sideways so it reads as a pen stroke.
          const mid = (y1 + y2) / 2;
          const bow = Math.max(26, src.h * 0.55);
          d = `M ${x1} ${y1} C ${x1 + bow} ${mid}, ${x2 + bow} ${mid}, ${x2} ${y2}`;
          ang = Math.atan2(y2 - mid, -bow);
        } else {
          // Diagonal travel: one quadratic that SAGS below the straight line,
          // so the stroke visibly leaves the source before turning into the
          // target — the gesture a teacher's pen makes.
          const dist = Math.hypot(x2 - x1, y2 - y1);
          const sag = Math.min(30, Math.max(12, dist * 0.22));
          const cx2 = (x1 + x2) / 2;
          const cy2 = (y1 + y2) / 2 + sag;
          d = `M ${x1} ${y1} Q ${cx2} ${cy2}, ${x2} ${y2}`;
          ang = Math.atan2(y2 - cy2, x2 - cx2);
        }
        out.push({ d, step: i, tipX: x2, tipY: y2, ang });
      }
    });

    setCurves(out);
    setSize({ w: container.offsetWidth, h: container.offsetHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, container]);

  if (curves.length === 0) return null;

  const f30 = (n: number): number => Math.round((n / 30) * fps);

  return (
    <svg
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      {curves.map((c, k) => {
        // The stroke draws just after its step lands — the eye reads the new
        // line first, then the pen shows where it came from.
        const local = frame - landAt[c.step] - f30(4);
        const p = easeInOutQuint(clamp01(local / f30(11)));
        if (p <= 0) return null;
        const headP = easeOutQuint(clamp01((local - f30(9)) / f30(5)));
        const dim = dimOf(c.step);
        // Barbs swept back 150° either side of the arrival direction.
        const hw = strokeWidth * 2.8;
        const b1 = c.ang + (Math.PI * 5) / 6;
        const b2 = c.ang - (Math.PI * 5) / 6;
        return (
          <g key={k} opacity={dim}>
            <path
              d={c.d}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - p}
            />
            {headP > 0 ? (
              <path
                d={`M ${c.tipX + Math.cos(b1) * hw} ${c.tipY + Math.sin(b1) * hw} L ${c.tipX} ${c.tipY} L ${c.tipX + Math.cos(b2) * hw} ${c.tipY + Math.sin(b2) * hw}`}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={headP}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
};
