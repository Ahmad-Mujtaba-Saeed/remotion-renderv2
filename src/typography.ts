/**
 * typography — solve a type size against the space it actually has.
 *
 * Until now every card picked its heading size from a hand-tuned constant
 * (`(portrait ? 46 : 54) * u`) that never consulted the text. Since the scale
 * unit is `min(width, height) / 1080`, a 9:16 frame renders the SAME pixel
 * size into HALF the column — so a 55-character heading that reads as one
 * confident line at 16:9 becomes three lines in portrait, crowds whatever sits
 * under it, and (on timeline_card) collided with it outright. The card sweep
 * caught it on 18 layouts at once.
 *
 * The fix is to stop guessing. `fitText` measures the REAL glyph advances of
 * the REAL loaded face with canvas `measureText`, simulates the greedy line
 * wrap the browser is about to perform, and returns the largest size at which
 * the text still fits the line budget.
 *
 * Why canvas and not a DOM measure: `measureText` is synchronous, needs no
 * layout pass, no ResizeObserver and no `delayRender` handle, and — because
 * <FontLoader> already blocks frame capture until the faces are ready — it
 * reports the metrics of the face that will actually be drawn. Same input,
 * same output, every render: the stills stay reproducible.
 */

/** Widths are measured once at this size and scale linearly with font size. */
const REF = 100;

const cache = new Map<string, number>();
let probe: HTMLDivElement | null | undefined;

/**
 * A single hidden, reusable measuring node.
 *
 * The first implementation measured with canvas `measureText`, which is
 * cheaper — and wrong here: this Chromium does not resolve the document's
 * dynamically-loaded @font-face families for a canvas context, so every
 * heading measured ~20% narrow against a system fallback and the solver
 * confidently returned a size that still wrapped an extra line. The DOM is the
 * thing we are predicting, so the DOM is what we measure: identical font
 * stack, weight and tracking, in a detached-position span the layout never
 * shows.
 *
 * `offsetWidth` forces a synchronous layout, which is why everything here is
 * memoised per (text, face, weight) and measured once at a reference size.
 */
const probeEl = (): HTMLDivElement | null => {
  if (probe !== undefined) return probe;
  if (typeof document === 'undefined' || !document.body) {
    probe = null;
    return probe;
  }
  const el = document.createElement('div');
  el.setAttribute('data-fit-probe', '');
  // NB: no `contain`, ever. `contain: strict` implies SIZE containment, which
  // makes the box ignore its own contents — the probe then measures 0 and the
  // solver happily reports that a 64-character heading fits on one line.
  el.style.cssText =
    'position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;';
  document.body.appendChild(el);
  probe = el;
  return probe;
};

const refWidth = (text: string, family: string, weight: number | string): number => {
  /*
   * Clamp into the range the bundled VARIABLE faces carry (display 600-800,
   * body 400-600) so the probe and the real element resolve the same instance.
   */
  const w = typeof weight === 'number' ? Math.min(800, weight) : weight;

  /*
   * Font readiness is part of the cache key. <FontLoader> resolves the
   * webfonts asynchronously and React renders the tree at least once before
   * they land; a measurement taken in that window belongs to a fallback face,
   * and memoising it would poison every later frame with a stale number.
   */
  const primary = family.split(',')[0].trim();
  const ready =
    typeof document !== 'undefined' && document.fonts
      ? document.fonts.check(`${w} ${REF}px ${primary}`)
      : true;

  const key = `${ready ? 1 : 0}|${w}|${family}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const el = probeEl();
  if (!el) return text.length * REF * 0.55;

  /*
   * Set the properties INDIVIDUALLY rather than through the `font` shorthand.
   * The shorthand is all-or-nothing: one token Chromium dislikes anywhere in
   * the family stack and the whole assignment is dropped, leaving the probe at
   * its previous (or default) face — which measured ~10% narrow and was enough
   * to turn a three-line heading into a "fits in two" verdict.
   */
  el.style.fontFamily = family;
  el.style.fontWeight = String(w);
  el.style.fontSize = `${REF}px`;
  el.textContent = text;
  const width = el.getBoundingClientRect().width;
  if (ready) cache.set(key, width);

  return width;
};

/** Rendered width of `text` at `size` in the given face — exported so callers
 *  (and the sweep) can reason about the same numbers the solver uses. */
export const textWidth = (text: string, size: number, font: string, weight: number | string = 400): number =>
  (refWidth(text, font, weight) * size) / REF;

export interface FitOptions {
  /** Usable column width in px — the box the text must live inside. */
  width: number;
  /** The size the card WANTS when the text is short (px). */
  max: number;
  /** The size below which the card would rather wrap than shrink (px). */
  min: number;
  /** Lines the design has room for. Default 2. */
  maxLines?: number;
  /** Font family stack, exactly as passed to `fontFamily`. */
  font: string;
  /** Weight, as passed to `fontWeight` (metrics differ by weight). */
  weight?: number | string;
  /** Tracking in px AT `max`; scaled with the returned size. */
  letterSpacing?: number;
  /**
   * Does this text render through <KineticText>? Default true, because nearly
   * every heading does.
   *
   * KineticText lays each word out as its own inline-block with a 0.28em
   * margin, which measures ~9% wider than the same string as continuous text:
   * inline-blocks suppress the normal space, carry the inherited tracking past
   * their last character, and the highlight word adds a padded box. Predicting
   * that geometrically means re-implementing Chromium's inline layout, so it
   * is absorbed as one measured, documented constant instead — and the error
   * is deliberately taken on the SAFE side. A heading a few points smaller
   * than theoretically possible costs nothing; one line more than the design
   * budgeted costs the layout.
   */
  kinetic?: boolean;
}

/** Measured against the real renders (see scripts/sweep-cards.ts). */
const KINETIC_INFLATE = 1.1;

/**
 * How many lines `text` takes at `size`, under the same greedy word wrap the
 * browser performs. A single word longer than the column counts as one line
 * (it will overflow or break — either way shrinking further will not help
 * beyond `min`, which is the floor's job).
 */
export const lineCount = (text: string, size: number, o: FitOptions): number => {
  const scale = size / REF;
  const track = (o.letterSpacing ?? 0) * (size / o.max);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const inflate = o.kinetic === false ? 1 : KINETIC_INFLATE;
  const widthOf = (s: string): number =>
    refWidth(s, o.font, o.weight ?? 400) * scale * inflate + track * s.length;

  /*
   * Headings render through <KineticText>, which lays each word out as an
   * inline-block with `marginRight: 0.28em` — wider than the font's own space
   * glyph. Simulating the narrower gap under-counts lines and hands back a
   * size that wraps one line more than promised, so take the larger of the
   * two: being a shade conservative costs a few points of size, being
   * optimistic costs the layout.
   */
  const space = Math.max(widthOf(' '), 0.28 * size);
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const w = widthOf(word);
    const need = used === 0 ? w : used + space + w;
    if (need <= o.width || used === 0) {
      used = need;
    } else {
      lines++;
      used = w;
    }
  }

  return lines;
};

/**
 * The largest size in [min, max] at which `text` fits `maxLines` lines.
 *
 * Solved analytically, then corrected: the continuous estimate (total advance
 * ÷ available line length) ignores that words do not break mid-way, so the
 * result is verified against the real wrap and stepped down until it holds.
 * The step-down is bounded and the whole thing is pure arithmetic over cached
 * measurements — cheap enough to call per frame.
 */
export const fitText = (text: string, o: FitOptions): number => {
  const trimmed = text.trim();
  if (trimmed === '') return o.max;
  const maxLines = o.maxLines ?? 2;

  const total = refWidth(trimmed, o.font, o.weight ?? 400) * (o.kinetic === false ? 1 : KINETIC_INFLATE);
  // Continuous first guess: the text laid end to end across `maxLines` lines.
  // 0.94 pays for the ragged right edge word wrap always leaves behind.
  const ideal = total > 0 ? (o.width * maxLines * 0.94 * REF) / total : o.max;
  let size = Math.min(o.max, ideal);

  // Verify against the true wrap; step down in small increments so the answer
  // is the biggest size that genuinely fits rather than the first that might.
  for (let i = 0; i < 12 && size > o.min; i++) {
    if (lineCount(trimmed, size, o) <= maxLines) break;
    size *= 0.94;
  }

  return Math.max(o.min, Math.min(o.max, size));
};

/**
 * Fit a GROUP of strings to one shared size — a list of bullets, two sides of
 * a comparison, the rows of a card. One size for all of them is the point: a
 * list whose items each pick their own size reads as a ransom note.
 */
export const fitGroup = (texts: string[], o: FitOptions): number => {
  const usable = texts.filter((t) => t.trim() !== '');
  if (usable.length === 0) return o.max;

  return usable.reduce((size, t) => Math.min(size, fitText(t, o)), o.max);
};
