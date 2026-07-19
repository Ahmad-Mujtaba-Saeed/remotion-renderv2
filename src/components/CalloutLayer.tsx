import React, { useLayoutEffect, useRef, useState } from 'react';
import { continueRender, delayRender, useVideoConfig } from 'remotion';
import { Callout, NarrationWord } from '../types';
import { useTheme, hairline, BODY_FONT } from '../theme';
import { useSceneClock } from '../canvas/SceneClock';
import { clamp01, easeOutCubic, easeOutQuint } from '../motion/easing';
import { f30 } from '../motion/choreo';

/**
 * CalloutLayer (copilot.md §5 flat law) — leader-line labels over media.
 *
 * Draws each pin as an accent dot + ring, a leader line that draws outward,
 * and a solid panel chip carrying the label. Callout coordinates are
 * normalized to the IMAGE, not the box, so the layer re-derives where the
 * image actually sits under `object-fit` (cover crops, contain letterboxes,
 * cover honours the saliency focal point exactly like MediaSlot's
 * objectPosition) and skips pins the crop pushed out of frame.
 *
 * The layer must live INSIDE the slot's CameraMove so pins ride pans and
 * zooms glued to their pixels; measurements use offset* which ignore CSS
 * transforms, so the mapping is stable while the camera moves.
 */

interface MediaFit {
  /** Natural media aspect (w/h) when probed; null = image fills the box. */
  mediaAspect: number | null;
  fit: 'cover' | 'contain';
  /** Cover crop's objectPosition focal point (MediaSlot §8 smart crop). */
  focus?: { fx?: number; fy?: number } | null;
}

interface PlacedCallout {
  px: number;
  py: number;
  text: string;
  /** Chip side actually used after auto-resolution + overflow flips. */
  side: 'left' | 'right' | 'top' | 'bottom';
  chipX: number;
  chipY: number;
}

/** Where the displayed media rectangle sits inside a boxW×boxH slot. */
const mediaRect = (
  boxW: number,
  boxH: number,
  { mediaAspect, fit, focus }: MediaFit
): { x: number; y: number; w: number; h: number } => {
  if (!mediaAspect || !isFinite(mediaAspect) || mediaAspect <= 0) {
    return { x: 0, y: 0, w: boxW, h: boxH };
  }
  const w =
    fit === 'contain'
      ? Math.min(boxW, boxH * mediaAspect)
      : Math.max(boxW, boxH * mediaAspect);
  const h = w / mediaAspect;
  // object-position P% aligns the image's P% point with the box's P% point:
  // offset = (box - displayed) * P. Contain always centres (MediaSlot never
  // sets objectPosition on contained media).
  const fx = fit === 'cover' ? focus?.fx ?? 0.5 : 0.5;
  const fy = fit === 'cover' ? focus?.fy ?? 0.5 : 0.5;
  return { x: (boxW - w) * fx, y: (boxH - h) * fy, w, h };
};

/**
 * Reveal schedule for label texts: when word timings exist each label lands
 * on the first narration word that matches its first significant word — the
 * label pops as the voice names the part. Unmatched labels take the caller's
 * fallback spread; the result is strictly ascending with a minimum gap so
 * two labels never fire as one.
 */
export const calloutRevealSchedule = (
  texts: string[],
  words: NarrationWord[] | undefined,
  fps: number,
  fallback: { first: number; step: number }
): number[] => {
  const sig = (s: string): string[] =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3);
  const at: number[] = texts.map((text, i) => {
    const fb = fallback.first + i * fallback.step;
    if (!words?.length) return fb;
    const wanted = sig(text)[0];
    if (!wanted) return fb;
    const hit = words.find((w) => sig(w.word)[0] === wanted);
    return hit ? Math.round(hit.start * fps) : fb;
  });
  const minGap = f30(fps, 10);
  for (let i = 1; i < at.length; i++) {
    at[i] = Math.max(at[i], at[i - 1] + minGap);
  }
  return at;
};

export const CalloutLayer: React.FC<{
  callouts: Callout[];
  media: MediaFit;
  /** Per-callout reveal frames (scene clock). Default: 16f start, 10f step. */
  revealFrames?: number[];
}> = ({ callouts, media, revealFrames }) => {
  const theme = useTheme();
  const { fps } = useVideoConfig();
  const { frame } = useSceneClock();
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // Measuring here is subtle: Remotion mounts the React tree BEFORE it sizes
  // the composition container (a DOM mutation that triggers no re-render), so
  // at the mount commit every element measures 0×0 — a one-shot layout-effect
  // measure records nothing, ever. A ResizeObserver catches the container
  // getting its real size; the delayRender handle keeps the frame capture
  // waiting until the measured pass has committed. The timeout guarantees a
  // permanently 0-sized layer can never hold a render hostage.
  const [handle] = useState(() => delayRender('CalloutLayer measure'));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      continueRender(handle);
      return;
    }
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    const measure = () => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) {
        setBox((prev) =>
          prev && prev.w === el.offsetWidth && prev.h === el.offsetHeight
            ? prev
            : { w: el.offsetWidth, h: el.offsetHeight }
        );
        finish();
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const t = setTimeout(finish, 1500);
    return () => {
      ro.disconnect();
      clearTimeout(t);
      finish();
    };
  }, [handle]);

  const pins = callouts.filter((c) => (c.text ?? '').trim() !== '').slice(0, 4);
  if (!pins.length) return null;

  // Measure first; one layout pass later everything below has real pixels.
  if (!box) {
    return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
  }

  const { w: boxW, h: boxH } = box;
  const rect = mediaRect(boxW, boxH, media);
  const base = Math.min(boxW, boxH);
  const fs = Math.max(15, Math.min(base * 0.055, 40));
  const chipH = fs * 2.1;
  const lead = Math.max(fs * 2, Math.min(base * 0.16, fs * 5));
  const pad = fs * 0.5;

  const placed: PlacedCallout[] = [];
  for (const c of pins) {
    const px = rect.x + clamp01(c.x) * rect.w;
    const py = rect.y + clamp01(c.y) * rect.h;
    // Cover mode can crop a pin clean out of the visible box — skip it.
    if (px < 2 || px > boxW - 2 || py < 2 || py > boxH - 2) continue;

    const estW = Math.min(c.text.length * fs * 0.58 + pad * 2, boxW * 0.44);
    // Auto anchors push the chip OUTWARD, toward the nearer margin — the
    // classic anatomy-diagram look: labels in the empty space, leader lines
    // pointing inward at the subject.
    let side: PlacedCallout['side'] =
      c.anchor && c.anchor !== 'auto' ? c.anchor : px < boxW / 2 ? 'left' : 'right';
    // Flip a horizontal chip that would leave the box.
    if (side === 'right' && px + lead + estW > boxW - 4) side = 'left';
    if (side === 'left' && px - lead - estW < 4) side = 'right';

    let chipX = px;
    let chipY = py;
    if (side === 'right') chipX = px + lead;
    if (side === 'left') chipX = px - lead - estW;
    if (side === 'top') {
      chipX = Math.min(Math.max(px - estW / 2, 4), boxW - estW - 4);
      chipY = py - lead - chipH;
    }
    if (side === 'bottom') {
      chipX = Math.min(Math.max(px - estW / 2, 4), boxW - estW - 4);
      chipY = py + lead;
    }
    if (side === 'left' || side === 'right') chipY = py - chipH / 2;
    chipY = Math.min(Math.max(chipY, 4), boxH - chipH - 4);

    placed.push({ px, py, text: c.text.trim(), side, chipX, chipY });
  }

  // Greedy de-overlap: chips sharing a side get pushed apart vertically.
  const bySide: Record<string, PlacedCallout[]> = {};
  for (const p of placed) (bySide[p.side] ??= []).push(p);
  for (const group of Object.values(bySide)) {
    group.sort((a, b) => a.chipY - b.chipY);
    for (let i = 1; i < group.length; i++) {
      if (group[i].chipY < group[i - 1].chipY + chipH * 1.15) {
        group[i].chipY = Math.min(group[i - 1].chipY + chipH * 1.15, boxH - chipH - 4);
      }
    }
  }

  const at = (i: number): number => revealFrames?.[i] ?? f30(fps, 16) + i * f30(fps, 10);

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <svg
        width={boxW}
        height={boxH}
        viewBox={`0 0 ${boxW} ${boxH}`}
        style={{ position: 'absolute', inset: 0, display: 'block' }}
      >
        {placed.map((p, i) => {
          const lineP = easeOutCubic(clamp01((frame - at(i) - f30(fps, 4)) / f30(fps, 10)));
          const dotP = easeOutQuint(clamp01((frame - at(i)) / f30(fps, 10)));
          // The line meets the chip at its nearest edge midpoint.
          const tx =
            p.side === 'right'
              ? p.chipX
              : p.side === 'left'
                ? p.chipX + Math.min(p.text.length * fs * 0.58 + pad * 2, boxW * 0.44)
                : p.px;
          const ty =
            p.side === 'top' ? p.chipY + chipH : p.side === 'bottom' ? p.chipY : p.chipY + chipH / 2;
          const len = Math.hypot(tx - p.px, ty - p.py);
          return (
            <g key={i}>
              <line
                x1={p.px}
                y1={p.py}
                x2={tx}
                y2={ty}
                stroke={theme.accent}
                strokeWidth={Math.max(2, fs * 0.09)}
                strokeDasharray={len}
                strokeDashoffset={(1 - lineP) * len}
              />
              <circle cx={p.px} cy={p.py} r={fs * 0.18 * dotP} fill={theme.accent} />
              <circle
                cx={p.px}
                cy={p.py}
                r={fs * 0.4 * dotP}
                fill="none"
                stroke={theme.accent}
                strokeWidth={Math.max(2, fs * 0.08)}
              />
            </g>
          );
        })}
      </svg>
      {placed.map((p, i) => {
        const chipP = easeOutQuint(clamp01((frame - at(i) - f30(fps, 9)) / f30(fps, 11)));
        const slide = (1 - chipP) * fs * 0.6 * (p.side === 'left' ? 1 : -1);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: p.chipX,
              top: p.chipY,
              height: chipH,
              display: 'flex',
              alignItems: 'center',
              padding: `0 ${pad}px`,
              maxWidth: boxW * 0.44,
              background: theme.panel,
              border: `1px solid ${hairline(theme, 0.28)}`,
              color: theme.text,
              fontFamily: BODY_FONT,
              fontSize: fs,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              opacity: chipP,
              transform: `translateX(${slide}px)`,
              boxSizing: 'border-box',
            }}
          >
            {p.text}
          </div>
        );
      })}
    </div>
  );
};
