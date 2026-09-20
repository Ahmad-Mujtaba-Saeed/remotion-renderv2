import { NarrationWord } from '../types';
import { CardReveal } from './cardReveal';
import { spokenAt } from './narrationBeats';
import { clamp01 } from './easing';

/**
 * htmlCues — the timing contract for markup a MODEL designed.
 *
 * A fragment authored by the planner (custom_card, and every part of a
 * cinematic_card) may not animate itself: CSS animations run on wall-clock
 * time and Remotion renders frame by frame. Instead it marks elements, and
 * this emits the per-frame CSS for those marks off the scene clock:
 *
 * - `data-word="gate"` — appear when the narrator says "gate";
 * - `data-at="0.35"`   — appear at that point of the scene;
 * - `data-anim`        — how it appears: fade | rise | pop | slide | grow | none;
 * - `data-until="gate"` — be on screen UNTIL "gate", then gone.
 *
 * `data-until` with a matching `data-word` is a STATE CHANGE the model draws
 * itself — `<b data-until="put">MISS</b><b data-word="put">SET</b>`, a red bar
 * swapped for a green one — so the drawing can change mid-beat with no
 * component to lean on. The swap is instant at the word (the leaving element
 * is removed from the flow as the arriving one begins its entrance), so the
 * layout never holds both.
 *
 * Extracted from CustomCard so both cards share one implementation.
 */

/** Distinct values of one data attribute, in document order. */
export const cueValues = (html: string, attribute: string): string[] => {
  const out: string[] = [];
  const re = new RegExp(`${attribute}="([^"]*)"`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
};

export interface CueClock {
  frame: number;
  fps: number;
  sceneFrames: number;
  words: NarrationWord[] | undefined;
  reveal: CardReveal;
  /** Frame a cue lands on when its word is never spoken. */
  fallback: number;
}

/**
 * The CSS for every cue in `html`, scoped under `scope` (a selector for the
 * element the fragment is mounted in). With `withBase`, also the rule that
 * hides cued elements before their cue.
 */
export const cueCss = (html: string, scope: string, clock: CueClock, withBase = true): string => {
  const { frame, fps, sceneFrames, words, reveal, fallback } = clock;
  const dim = (v: number) => Number(v.toFixed(4));
  const progressAt = (at: number): number => reveal.ease(clamp01((frame - at) / Math.max(1, reveal.popFrames)));

  const rules = (selector: string, p: number): string => {
    const rise = reveal.rise * 2;
    const base = `opacity: ${dim(p)}; transform: translateY(${dim((1 - p) * rise)}px);`;
    return [
      `${scope} ${selector} { ${base} }`,
      `${scope} ${selector}[data-anim="none"] { opacity: 1; transform: none; }`,
      `${scope} ${selector}[data-anim="fade"] { opacity: ${dim(p)}; transform: none; }`,
      `${scope} ${selector}[data-anim="rise"] { ${base} }`,
      `${scope} ${selector}[data-anim="pop"] { opacity: ${dim(p)}; transform: scale(${dim(0.88 + 0.12 * p + reveal.overshoot * p * (1 - p) * 4)}); }`,
      `${scope} ${selector}[data-anim="slide"] { opacity: ${dim(p)}; transform: translateX(${dim((1 - p) * -rise * 2)}px); }`,
      `${scope} ${selector}[data-anim="grow"] { opacity: ${dim(p)}; transform: scaleX(${dim(0.2 + 0.8 * p)}); transform-origin: left center; }`,
    ].join('\n');
  };

  const css: string[] = withBase ? [`${scope} [data-at], ${scope} [data-word] { opacity: 0; }`] : [];
  for (const cue of cueValues(html, 'data-at')) {
    const fraction = clamp01(parseFloat(cue));
    if (!isFinite(fraction)) continue;
    css.push(rules(`[data-at="${cue}"]`, progressAt(Math.round(fraction * sceneFrames))));
  }
  // Word cues come AFTER the fraction cues so an element carrying both lands
  // on the spoken word — the narration is the more precise cue, and equal
  // specificity means the later rule wins. A word never spoken falls back.
  for (const cue of cueValues(html, 'data-word')) {
    css.push(rules(`[data-word="${cue}"]`, progressAt(spokenAt(words, cue, fps) ?? fallback)));
  }
  // Leaving elements go LAST: an element that has had its moment is gone
  // whatever else it carries.
  // A leaving element whose word is never spoken shows the END state from
  // the start — the same rule Support\CinematicScene applies server-side —
  // or both states would sit on screen together for the whole beat.
  for (const cue of cueValues(html, 'data-until')) {
    const at = spokenAt(words, cue, fps);
    if (at === null || frame >= at) css.push(`${scope} [data-until="${cue}"] { display: none; }`);
  }
  return css.join('\n');
};
