import fs from 'fs';
import path from 'path';
import { compileHero } from '../src/hero/guard';
import { createLoopBudget, heroSafeKey, isUnsafeString, sanitizeHeroProps } from '../src/hero/policy';

/**
 * hero-guard-check — the hero sandbox's regression corpus. No browser, no model.
 *
 *   npx tsx scripts/hero-guard-check.ts
 *
 * Every snippet in REJECT is an escape route someone (or a prompt-injected
 * model) could try; each must be refused at compile time. ACCEPT holds the
 * ordinary patterns a good scene uses, which must NOT be refused (a guard
 * that rejects good code burns retries and money). RUNTIME evaluates
 * compiled modules with the real __k / loop bound to prove the parts the
 * static pass cannot see are still caught.
 */

let pass = 0;
let fail = 0;
const ok = (what: string, cond: boolean, extra = ''): void => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '  ok   ' : '  FAIL '}${what}${!cond && extra ? `\n         ${extra}` : ''}`);
};

const wrap = (body: string, imports = "import { AbsoluteFill } from 'remotion';"): string =>
  `${imports}\n${body}\nexport default function Scene() { return <AbsoluteFill />; }`;

const REJECT: Array<[string, string]> = [
  ['fetch', "fetch('http://localhost:3020/render');"],
  ['window.fetch', 'const f = window.fetch;'],
  ['globalThis', 'const g = globalThis;'],
  ['self', 'const s = self;'],
  ['document', 'const d = document;'],
  ['unbound top in a function', 'function f() { return top; }'],
  ['constructor chain', "const F = [].constructor.constructor('return this')();"],
  ['destructured constructor', 'const { constructor: C } = [];'],
  ['computed key in destructuring', "const { ['cons' + 'tructor']: C } = [];"],
  ['__proto__ key', "const o = { __proto__: null };"],
  ['literal ["constructor"]', "const C = ([] as any)['constructor'];"],
  ['optional ["constructor"]', "const C = ([] as any)?.['constructor'];"],
  ['getPrototypeOf', 'const p = Object.getPrototypeOf({});'],
  ['defineProperty', 'Object.defineProperty({}, "a", {});'],
  ['ownerDocument', 'const f = (e: any) => e.ownerDocument;'],
  ['Reflect', 'const r = Reflect;'],
  ['Proxy', 'const p = new Proxy({}, {});'],
  ['eval', "eval('1');"],
  ['Function', "const f = new Function('return 1');"],
  ['setTimeout', 'setTimeout(() => 1, 1);'],
  ['requestAnimationFrame', 'requestAnimationFrame(() => 1);'],
  ['Math.random', 'const r = Math.random();'],
  ['Date', 'const t = Date.now();'],
  ['performance', 'const t = performance.now();'],
  ['async', 'async function f() { return 1; }'],
  ['await', 'const f = async () => { await 1; };'],
  ['dynamic import', "const m = import('fs');"],
  ['import.meta', 'const m = import.meta;'],
  ['node import', "import fs from 'fs';"],
  ['react createElement', "import { createElement } from 'react';"],
  ['remotion staticFile', "import { staticFile } from 'remotion';"],
  ['namespace import', "import * as R from 'remotion';"],
  ['reserved __h', "const x = __h('iframe', null);"],
  ['with/eval-ish require', "const r = require('fs');"],
  ['url() in string', "const s = 'url(http://evil.example/x.png)';"],
  ['protocol-relative', "const s = '//evil.example/x';"],
  ['javascript: scheme', "const s = 'javascript:alert(1)';"],
  ['url() in template', 'const id = "x"; const s = `url(${id})`;'],
  ['@import', "const s = '@import \"x.css\"';"],
];

const JSX_REJECT: Array<[string, string]> = [
  ['<img>', '<img />'],
  ['<iframe>', '<iframe />'],
  ['<script>', '<script />'],
  ['<style>', '<style />'],
  ['<a>', '<a />'],
  ['<foreignObject>', '<svg><foreignObject /></svg>'],
  ['<use href>', '<svg><use href="#a" /></svg>'],
  ['<image>', '<svg><image /></svg>'],
  ['ref', '<div ref={(e: any) => e} />'],
  ['onClick', '<div onClick={() => 1} />'],
  ['dangerouslySetInnerHTML', '<div dangerouslySetInnerHTML={{ __html: "x" }} />'],
  ['src', '<div src="x" />'],
  ['style url()', "<div style={{ backgroundImage: 'url(http://evil.example)' }} />"],
];

const ACCEPT: Array<[string, string]> = [
  ['local named top', 'const top = 5; const y = top + 1;'],
  ['param named origin', 'const f = (origin: number) => origin * 2;'],
  ['local parent/open/screen', 'function f() { const parent = 1, open = 2, screen = 3; return parent + open + screen; }'],
  ['array index', 'const a = [1, 2, 3]; const b = a[1]; const i = 2; const c = a[i];'],
  ['object lookup', "const m: Record<string, number> = { a: 1 }; const k = 'a'; const v = m[k];"],
  ['url(#id)', "const fill = 'url(#grad)';"],
  ['url(#id) template', 'const id = "g"; const fill = `url(#${id})`;'],
  ['Math', 'const x = Math.sin(1) + Math.PI;'],
  ['loops', 'let s = 0; for (let i = 0; i < 10; i++) { s += i; } for (const x of [1, 2]) { s += x; }'],
  ['typed Date in a type only', 'type T = { when: Date };'],
  ['Object.keys/entries', 'const o = { a: 1 }; const k = Object.keys(o); const e = Object.entries(o);'],
  ['JSON', "const j = JSON.stringify({ a: 1 });"],
  ['ratio with "/"', "const label = '3/4 of people';"],
  ['ul/li', "const x = 1;"],
];

console.log('reject (statements)');
for (const [name, body] of REJECT) {
  const imports = body.startsWith('import') ? body : "import { AbsoluteFill } from 'remotion';";
  const src = body.startsWith('import') ? wrap('', imports) : wrap(body);
  const r = compileHero(src);
  ok(`refuses ${name}`, !r.ok, `compiled: ${src}`);
}

console.log('reject (JSX)');
for (const [name, jsx] of JSX_REJECT) {
  const src = `import { AbsoluteFill } from 'remotion';\nexport default function Scene() { return <AbsoluteFill>${jsx}</AbsoluteFill>; }`;
  const r = compileHero(src);
  ok(`refuses ${name}`, !r.ok, `compiled: ${src}`);
}

console.log('accept');
for (const [name, body] of ACCEPT) {
  const r = compileHero(wrap(body));
  ok(`allows ${name}`, r.ok, r.errors.join(' | '));
}

const examplesDir = path.resolve(__dirname, '../../viralforgebackend/modules/Project/Resources/hero/examples');
if (fs.existsSync(examplesDir)) {
  for (const f of fs.readdirSync(examplesDir).filter((x) => x.endsWith('.tsx'))) {
    const r = compileHero(fs.readFileSync(path.join(examplesDir, f), 'utf-8'));
    ok(`allows example ${f}`, r.ok, r.errors.join(' | '));
  }
}

console.log('runtime');
/** Evaluate a compiled module the way runtime.tsx does, with inert shims. */
const run = (body: string): Error | null => {
  const r = compileHero(wrap(body));
  if (!r.ok) return new Error('did not compile: ' + r.errors.join(' | '));
  try {
    const exportsObj: Record<string, unknown> = {};
    const shims: Record<string, unknown> = { remotion: { AbsoluteFill: () => null }, react: {}, 'hero-kit': {} };
    // eslint-disable-next-line no-new-func
    new Function('exports', 'require', '__h', '__F', '__k', '__L', `"use strict";\n${r.js}`)(
      exportsObj, (n: string) => shims[n], () => null, null, heroSafeKey, createLoopBudget().tick
    );
    return null;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
};
const built = run("const k = 'constr' + 'uctor'; const C = ({} as any)[k];");
ok('a computed "constructor" key built at runtime throws', built !== null && /not allowed/.test(built.message), String(built));
const proto = run("const k = ['__pro', 'to__'].join(''); const p = ({} as any)[k];");
ok('a computed "__proto__" key built at runtime throws', proto !== null && /not allowed/.test(proto.message), String(proto));
const loop = run('let i = 0; while (true) { i++; }');
ok('an infinite loop is cut off', loop !== null && /loop budget/.test(loop.message), String(loop));
const nested = run('let n = 0; for (let i = 0; i < 100000; i++) { for (let j = 0; j < 100000; j++) { n++; } }');
ok('nested loops share ONE budget (1e10 iterations are cut off)', nested !== null && /loop budget/.test(nested.message), String(nested));
ok('a labelled loop still works', run('let n = 0; outer: for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) { if (j === 1) continue outer; n++; } }') === null);
ok('an ordinary computed key still works', run("const m: any = { a: 1 }; const k = 'a'; const v = m[k];") === null);

console.log('props at runtime');
const smuggled = sanitizeHeroProps({ ['on' + 'Click']: () => 1, ['r' + 'ef']: () => 1, style: { backgroundImage: 'url(https://x.y)', color: 'red' }, fill: 'url(#g)', x: 3 });
ok('runtime props drop handlers and refs', smuggled !== null && !('onClick' in smuggled) && !('ref' in smuggled));
ok('runtime props drop an external url() style but keep the rest', (smuggled?.style as Record<string, unknown>)?.color === 'red' && !('backgroundImage' in (smuggled?.style as object)));
ok('runtime props keep url(#id) and numbers', smuggled?.fill === 'url(#g)' && smuggled?.x === 3);
ok('isUnsafeString: url( #g ) with spaces is fine', !isUnsafeString("url( '#g' )"));
ok('isUnsafeString: unterminated url(http is caught', isUnsafeString('url(http://x'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
