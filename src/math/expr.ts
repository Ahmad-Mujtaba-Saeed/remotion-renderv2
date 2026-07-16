/**
 * expr.ts — a tiny, safe y = f(x) evaluator for the function_plot card.
 *
 * Hand-rolled shunting-yard: no eval(), no Function(), fully deterministic.
 * Grammar: numbers, `x`, + - * / ^, parentheses, functions sin cos tan asin
 * acos atan sqrt abs log (base 10) ln exp floor ceil, constants pi and e.
 * Implicit multiplication is inserted the way people write math: `2x`,
 * `3(x+1)`, `x sin(x)`, `(x+1)(x-1)`.
 *
 * The PHP validator whitelists the same token set, but the renderer never
 * trusts that: compile() returns null on anything it can't parse and the
 * layout falls back to typesetting the expression instead of plotting it.
 */

type Tok =
  | { t: 'num'; v: number }
  | { t: 'x' }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' | 'neg' }
  | { t: 'fn'; v: string }
  | { t: 'lp' }
  | { t: 'rp' };

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const tokenize = (input: string): Tok[] | null => {
  const s = input.toLowerCase().replace(/\s+/g, '');
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      const m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i));
      if (!m) return null;
      toks.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-z]/.test(c)) {
      // Peel constants/x/function-calls off the letter run so concatenations
      // like "xsin(x)" or "2pix" resolve the way people write math. A
      // function name is only valid as the END of the run with a '(' right
      // after it (the run is pure letters, so parens always follow the run).
      const word = /^[a-z]+/.exec(s.slice(i))![0];
      const callable = s[i + word.length] === '(';
      let rest = word;
      while (rest.length > 0) {
        if (callable && FUNCTIONS[rest]) {
          toks.push({ t: 'fn', v: rest });
          rest = '';
          break;
        }
        const cname = ['pi', 'e'].find((k) => rest.startsWith(k));
        if (cname) {
          toks.push({ t: 'num', v: CONSTANTS[cname] });
          rest = rest.slice(cname.length);
          continue;
        }
        if (rest.startsWith('x')) {
          toks.push({ t: 'x' });
          rest = rest.slice(1);
          continue;
        }
        return null;
      }
      i += word.length;
      continue;
    }
    if (c === '(') {
      toks.push({ t: 'lp' });
      i++;
      continue;
    }
    if (c === ')') {
      toks.push({ t: 'rp' });
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      toks.push({ t: 'op', v: c });
      i++;
      continue;
    }
    return null;
  }
  return toks;
};

/** Inserts implicit '*' (2x, 3(x+1), (a)(b), x sin x) and rewrites unary
 *  minus into the 'neg' pseudo-op. */
const normalize = (toks: Tok[]): Tok[] => {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const prev = out[out.length - 1];
    const valueEnd = prev && (prev.t === 'num' || prev.t === 'x' || prev.t === 'rp');
    const valueStart = tok.t === 'num' || tok.t === 'x' || tok.t === 'fn' || tok.t === 'lp';
    if (valueEnd && valueStart) {
      out.push({ t: 'op', v: '*' });
    }
    if (tok.t === 'op' && tok.v === '-' && !valueEnd) {
      out.push({ t: 'op', v: 'neg' });
      continue;
    }
    if (tok.t === 'op' && tok.v === '+' && !valueEnd) {
      continue; // unary plus is a no-op
    }
    out.push(tok);
  }
  return out;
};

const PRECEDENCE: Record<string, number> = { '+': 2, '-': 2, '*': 3, '/': 3, neg: 4, '^': 5 };
const RIGHT_ASSOC = new Set(['^', 'neg']);

/** Shunting-yard to RPN. Null on mismatched parens/garbage. */
const toRpn = (toks: Tok[]): Tok[] | null => {
  const output: Tok[] = [];
  const stack: Tok[] = [];
  for (const tok of toks) {
    if (tok.t === 'num' || tok.t === 'x') {
      output.push(tok);
    } else if (tok.t === 'fn') {
      stack.push(tok);
    } else if (tok.t === 'op') {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.t === 'fn') {
          output.push(stack.pop()!);
          continue;
        }
        if (
          top.t === 'op' &&
          (PRECEDENCE[top.v] > PRECEDENCE[tok.v] ||
            (PRECEDENCE[top.v] === PRECEDENCE[tok.v] && !RIGHT_ASSOC.has(tok.v)))
        ) {
          output.push(stack.pop()!);
          continue;
        }
        break;
      }
      stack.push(tok);
    } else if (tok.t === 'lp') {
      stack.push(tok);
    } else if (tok.t === 'rp') {
      let matched = false;
      while (stack.length) {
        const top = stack.pop()!;
        if (top.t === 'lp') {
          matched = true;
          break;
        }
        output.push(top);
      }
      if (!matched) return null;
      if (stack.length && stack[stack.length - 1].t === 'fn') {
        output.push(stack.pop()!);
      }
    }
  }
  while (stack.length) {
    const top = stack.pop()!;
    if (top.t === 'lp') return null;
    output.push(top);
  }
  return output;
};

/**
 * Compiles an expression into a plain function of x, or null when the input
 * is not valid under the grammar. The returned function may produce NaN or
 * ±Infinity at individual points (1/x at 0) — the plot layout breaks its
 * polyline there instead of drawing through the asymptote.
 */
export const compileExpression = (input: string): ((x: number) => number) | null => {
  const raw = tokenize(String(input ?? ''));
  if (!raw || raw.length === 0) return null;
  const rpn = toRpn(normalize(raw));
  if (!rpn || rpn.length === 0) return null;

  // A dry run validates arity once so the per-sample loop can stay unchecked.
  const test = evalRpn(rpn, 1);
  if (test === undefined) return null;

  return (x: number): number => evalRpn(rpn, x) ?? NaN;
};

/** Evaluates RPN at x. `undefined` signals a malformed program (stack
 *  under/overflow) as opposed to a numeric domain error (NaN). */
const evalRpn = (rpn: Tok[], x: number): number | undefined => {
  const stack: number[] = [];
  for (const tok of rpn) {
    if (tok.t === 'num') stack.push(tok.v);
    else if (tok.t === 'x') stack.push(x);
    else if (tok.t === 'fn') {
      if (stack.length < 1) return undefined;
      stack.push(FUNCTIONS[tok.v](stack.pop()!));
    } else if (tok.t === 'op') {
      if (tok.v === 'neg') {
        if (stack.length < 1) return undefined;
        stack.push(-stack.pop()!);
        continue;
      }
      if (stack.length < 2) return undefined;
      const b = stack.pop()!;
      const a = stack.pop()!;
      switch (tok.v) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          stack.push(a / b);
          break;
        case '^':
          stack.push(Math.pow(a, b));
          break;
      }
    } else {
      return undefined;
    }
  }
  return stack.length === 1 ? stack[0] : undefined;
};
