import React from 'react';

/**
 * MathText — a tiny, deterministic math typesetter for the worked-math cards.
 *
 * The analyzer emits expressions in a LINEAR notation (documented in the
 * ScriptAnalysisService prompt and clamped by the PHP validator):
 *
 *   frac{a}{b}    stacked fraction
 *   sqrt{x + 1}   radical with a vinculum over the body
 *   x^2  x^{n+1}  superscript (single token or braced group)
 *   x_1  x_{max}  subscript
 *   pi theta deg  and friends become real glyphs; `*` becomes ×, `+-` ±,
 *   `<=` ≤, `>=` ≥, `!=` ≠, `~=` ≈, `->` →
 *
 * Everything renders as plain spans/flex + one solid bar for fraction rules
 * and a border-top vinculum — no external fonts, no MathML, no filters, so it
 * obeys the flat design rules and stays pixel-identical across renders.
 */

export type MathNode =
  | { kind: 'text'; value: string }
  | { kind: 'frac'; num: MathNode[]; den: MathNode[] }
  | { kind: 'sqrt'; body: MathNode[] }
  | { kind: 'sup'; body: MathNode[] }
  | { kind: 'sub'; body: MathNode[] };

/** Word/operator → glyph substitutions applied to plain text runs. Order
 *  matters: multi-char operators must run before their single-char prefixes.
 *
 *  The greek/word names are bounded by LETTERS, not by \b: maths writes a
 *  coefficient straight onto the symbol ("2pi", "3theta", "n theta"), and \b
 *  sees no boundary between a digit and a letter, so \btheta\b left "3theta"
 *  as literal source on screen. A letter on either side still blocks it, so
 *  "thetax" and "alpha" inside a word are untouched. */
const W = (word: string): RegExp => new RegExp(`(?<![A-Za-z])${word}(?![A-Za-z])`, 'g');

const SYMBOLS: Array<[RegExp, string]> = [
  [/\+-/g, '±'],
  [/<=/g, '≤'],
  [/>=/g, '≥'],
  [/!=/g, '≠'],
  [/~=/g, '≈'],
  [/->/g, '→'],
  [/\*/g, '×'],
  [W('pm'), '±'],
  [W('pi'), 'π'],
  [W('theta'), 'θ'],
  [W('alpha'), 'α'],
  [W('beta'), 'β'],
  [W('delta'), 'Δ'],
  [W('lambda'), 'λ'],
  [W('mu'), 'μ'],
  [W('sigma'), 'σ'],
  [W('omega'), 'ω'],
  [W('inf'), '∞'],
  [W('deg'), '°'],
];

const substituteSymbols = (s: string): string => {
  let out = s;
  for (const [re, glyph] of SYMBOLS) {
    out = out.replace(re, glyph);
  }
  // ° hugs its number ("30 °" reads wrong).
  return out.replace(/\s+°/g, '°');
};

/** Reads a `{...}` balanced group starting at `open` (must be '{').
 *  Returns [content, indexAfterClosingBrace]. Unbalanced input returns the
 *  rest of the string — garbage in, legible text out, never a crash. */
const readGroup = (s: string, open: number): [string, number] => {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return [s.slice(open + 1, i), i + 1];
    }
  }
  return [s.slice(open + 1), s.length];
};

/** Parses the linear notation into a node tree. Total function: any string
 *  yields a renderable tree (worst case: one text node). */
export const parseMath = (input: string): MathNode[] => {
  const s = String(input ?? '');
  const nodes: MathNode[] = [];
  let buf = '';
  let i = 0;

  const flush = (): void => {
    if (buf !== '') {
      nodes.push({ kind: 'text', value: substituteSymbols(buf) });
      buf = '';
    }
  };

  while (i < s.length) {
    if (s.startsWith('frac{', i)) {
      flush();
      const [num, afterNum] = readGroup(s, i + 4);
      let den = '';
      let next = afterNum;
      if (s[afterNum] === '{') {
        [den, next] = readGroup(s, afterNum);
      }
      nodes.push({ kind: 'frac', num: parseMath(num), den: parseMath(den) });
      i = next;
      continue;
    }
    if (s.startsWith('sqrt{', i)) {
      flush();
      const [body, next] = readGroup(s, i + 4);
      nodes.push({ kind: 'sqrt', body: parseMath(body) });
      i = next;
      continue;
    }
    if (s[i] === '^' || s[i] === '_') {
      const kind = s[i] === '^' ? 'sup' : 'sub';
      flush();
      if (s[i + 1] === '{') {
        const [body, next] = readGroup(s, i + 1);
        nodes.push({ kind, body: parseMath(body) });
        i = next;
      } else {
        // Unbraced script: take a signed number run or one character (x^2,
        // x^-1, a_n) — the forgiving-subset reading of what LLMs emit.
        const m = /^-?\d+|^./.exec(s.slice(i + 1));
        const tok = m ? m[0] : '';
        nodes.push({ kind, body: [{ kind: 'text', value: substituteSymbols(tok) }] });
        i += 1 + tok.length;
      }
      continue;
    }
    buf += s[i];
    i++;
  }
  flush();
  return nodes;
};

/** Plain-text projection (for measuring / degrades): symbols substituted,
 *  structure flattened ("frac{a}{b}" → "a/b", "sqrt{x}" → "√(x)"). */
export const mathToPlain = (nodes: MathNode[]): string =>
  nodes
    .map((n) => {
      switch (n.kind) {
        case 'text':
          return n.value;
        case 'frac':
          return `${mathToPlain(n.num)}/${mathToPlain(n.den)}`;
        case 'sqrt':
          return `√(${mathToPlain(n.body)})`;
        case 'sup':
          return `^${mathToPlain(n.body)}`;
        case 'sub':
          return mathToPlain(n.body);
      }
    })
    .join('');

/** Rough visual width of an expression in "character" units — fractions count
 *  their widest part, scripts count ~60%. Used by MathSteps to pick a size
 *  that never overflows the column. */
export const mathWidthUnits = (nodes: MathNode[]): number =>
  nodes.reduce((w, n) => {
    switch (n.kind) {
      case 'text':
        return w + n.value.length;
      case 'frac':
        return w + Math.max(mathWidthUnits(n.num), mathWidthUnits(n.den)) + 1;
      case 'sqrt':
        return w + mathWidthUnits(n.body) + 1.6;
      case 'sup':
      case 'sub':
        return w + mathWidthUnits(n.body) * 0.6;
    }
  }, 0);

// ---------------------------------------------------------------------------
// Step-diff highlighting: MathSteps colours the atoms that CHANGED from the
// previous line — the way a teacher points at the new term. An "atom" is a
// number, a letter/greek run, or a single symbol; whitespace never counts.
// ---------------------------------------------------------------------------

const ATOM_RE = /\d+\.?\d*|[A-Za-zͰ-Ͽ∞]+|[^\s]/g;

/** All atoms of a tree in render order (text runs only — structural glyphs
 *  like fraction bars and radicals never participate in the diff). */
export const collectAtoms = (nodes: MathNode[]): string[] => {
  const out: string[] = [];
  for (const n of nodes) {
    switch (n.kind) {
      case 'text':
        out.push(...(n.value.match(ATOM_RE) ?? []));
        break;
      case 'frac':
        out.push(...collectAtoms(n.num), ...collectAtoms(n.den));
        break;
      case 'sqrt':
      case 'sup':
      case 'sub':
        out.push(...collectAtoms(n.body));
        break;
    }
  }
  return out;
};

/** Multiset budget of the previous line's atoms: rendering consumes matches
 *  in order; an atom with no budget left is NEW and takes the accent. */
type HighlightCtx = { budget: Map<string, number>; color: string } | null;

/** When set, every atom is wrapped in a span tagged `data-ma="<mark>:<i>"`,
 *  where i counts atoms in render order — the SAME order collectAtoms walks,
 *  so an atom's index in collectAtoms() addresses its span in the DOM. This is
 *  how StepArrows finds the pixel position of "the 5 in line two". The counter
 *  is mutated during render, which is safe for the same reason the highlight
 *  budget is: one render per frame, in document order. */
type MarkCtx = { mark: string; next: number } | null;

const highlightBudget = (prevExpr: string): Map<string, number> => {
  const budget = new Map<string, number>();
  for (const atom of collectAtoms(parseMath(prevExpr))) {
    budget.set(atom, (budget.get(atom) ?? 0) + 1);
  }
  return budget;
};

/** One text run, split into atoms so new ones can take the highlight colour.
 *  Mutating the shared budget during render is safe: React renders this tree
 *  exactly once per frame, in document order — the same order collectAtoms
 *  walks. */
const TextRun: React.FC<{ value: string; hi: HighlightCtx; mk: MarkCtx }> = ({ value, hi, mk }) => {
  if (!hi && !mk) {
    return <span style={{ whiteSpace: 'pre' }}>{value}</span>;
  }
  const parts = value.match(/\s+|\d+\.?\d*|[A-Za-zͰ-Ͽ∞]+|[^\s]/g) ?? [];
  return (
    <span style={{ whiteSpace: 'pre' }}>
      {parts.map((p, i) => {
        if (/^\s+$/.test(p)) {
          return <React.Fragment key={i}>{p}</React.Fragment>;
        }
        const tag = mk ? { 'data-ma': `${mk.mark}:${mk.next++}` } : {};
        if (hi) {
          const left = hi.budget.get(p) ?? 0;
          if (left > 0) {
            hi.budget.set(p, left - 1);
            return (
              <span key={i} {...tag}>
                {p}
              </span>
            );
          }
          return (
            <span key={i} {...tag} style={{ color: hi.color }}>
              {p}
            </span>
          );
        }
        return (
          <span key={i} {...tag}>
            {p}
          </span>
        );
      })}
    </span>
  );
};

const Nodes: React.FC<{
  nodes: MathNode[];
  color: string;
  barColor: string;
  hi?: HighlightCtx;
  mk?: MarkCtx;
}> = ({ nodes, color, barColor, hi = null, mk = null }) => (
  <>
    {nodes.map((n, i) => {
      switch (n.kind) {
        case 'text':
          return <TextRun key={i} value={n.value} hi={hi} mk={mk} />;
        case 'sup':
          return (
            <span key={i} style={{ fontSize: '0.62em', position: 'relative', top: '-0.5em' }}>
              <Nodes nodes={n.body} color={color} barColor={barColor} hi={hi} mk={mk} />
            </span>
          );
        case 'sub':
          return (
            <span key={i} style={{ fontSize: '0.62em', position: 'relative', top: '0.28em' }}>
              <Nodes nodes={n.body} color={color} barColor={barColor} hi={hi} mk={mk} />
            </span>
          );
        case 'frac':
          return (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                verticalAlign: 'middle',
                margin: '0 0.14em',
                fontSize: '0.8em',
                lineHeight: 1.15,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 0.18em' }}>
                <Nodes nodes={n.num} color={color} barColor={barColor} hi={hi} mk={mk} />
              </span>
              <span
                style={{
                  alignSelf: 'stretch',
                  height: '0.075em',
                  minHeight: 2,
                  background: barColor,
                  margin: '0.12em 0',
                }}
              />
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 0.18em' }}>
                <Nodes nodes={n.den} color={color} barColor={barColor} hi={hi} mk={mk} />
              </span>
            </span>
          );
        case 'sqrt':
          return (
            <span
              key={i}
              style={{ display: 'inline-flex', alignItems: 'stretch', verticalAlign: 'middle' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'flex-end', lineHeight: 1 }}>
                √
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderTop: `0.075em solid ${barColor}`,
                  padding: '0.06em 0.1em 0 0.06em',
                }}
              >
                <Nodes nodes={n.body} color={color} barColor={barColor} hi={hi} mk={mk} />
              </span>
            </span>
          );
      }
    })}
  </>
);

/**
 * InlineMathText — a lighter typesetter for PROSE that carries a little math
 * ("the derivative of y = x^2 is 2x"). Superscripts/subscripts become real
 * <sup>/<sub>, symbol words become glyphs, and — crucially — everything is
 * ordinary inline flow (not the flex layout MathText uses), so a full sentence
 * still wraps across lines. Fractions/radicals fall back to legible text
 * ("a/b", "√(x)") since they're rare in prose. Use this for headings and note
 * bodies; use MathText for standalone equations.
 */
export const InlineMathText: React.FC<{ text: string }> = ({ text }) => {
  const render = (nodes: MathNode[]): React.ReactNode =>
    nodes.map((n, i) => {
      switch (n.kind) {
        case 'text':
          return <React.Fragment key={i}>{n.value}</React.Fragment>;
        case 'sup':
          return (
            <sup key={i} style={{ fontSize: '0.72em' }}>
              {render(n.body)}
            </sup>
          );
        case 'sub':
          return (
            <sub key={i} style={{ fontSize: '0.72em' }}>
              {render(n.body)}
            </sub>
          );
        case 'frac':
          return (
            <React.Fragment key={i}>
              {mathToPlain(n.num)}/{mathToPlain(n.den)}
            </React.Fragment>
          );
        case 'sqrt':
          return <React.Fragment key={i}>√({mathToPlain(n.body)})</React.Fragment>;
      }
    });
  return <>{render(parseMath(text))}</>;
};

/**
 * Renders one expression. Font family/weight/size come from the parent (so
 * the card controls typography); `color` also drives fraction bars and
 * vinculums unless `barColor` overrides them. Passing `highlightFrom` (the
 * PREVIOUS line of a derivation) paints every atom that changed since that
 * line in `highlightColor` — the step-diff a teacher would point at.
 */
export const MathText: React.FC<{
  expr: string;
  color: string;
  barColor?: string;
  style?: React.CSSProperties;
  highlightFrom?: string | null;
  highlightColor?: string;
  /** Tag every atom span `data-ma="<atomMark>:<index>"` for StepArrows. */
  atomMark?: string;
}> = ({ expr, color, barColor, style, highlightFrom = null, highlightColor, atomMark }) => {
  const hi: HighlightCtx =
    highlightFrom != null && highlightColor
      ? { budget: highlightBudget(highlightFrom), color: highlightColor }
      : null;
  const mk: MarkCtx = atomMark ? { mark: atomMark, next: 0 } : null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        color,
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      <Nodes nodes={parseMath(expr)} color={color} barColor={barColor ?? color} hi={hi} mk={mk} />
    </span>
  );
};
