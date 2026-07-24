/**
 * sqrtParse — the renderer-side net for radicals.
 *
 * The PHP validator canonicalises `sqrt(x)` / "√ x" into `sqrt{x}`, but the
 * typesetter must still draw a real radical for anything that never went
 * through it (user-edited steps, storyboards analysed before the fix).
 * Project 91 drew the letters "sqrt" instead.
 *
 *   npx tsx scripts/sqrtParse.ts
 */

import { mathToPlain, parseMath } from '../src/math/mathText';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, got = ''): void => {
  if (ok) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${got ? `  -> got: ${got}` : ''}`);
  }
};

// mathToPlain projects a real radical node as "√(body)" — so its presence in
// the projection proves the tree has a sqrt NODE, not the literal letters.
const cases: Array<[string, string]> = [
  ['d = sqrt{run^2 + rise^2}', 'd = √(run^2 + rise^2)'], // canonical form still works
  ['d = sqrt(run^2 + rise^2)', 'd = √(run^2 + rise^2)'], // project 91, verbatim
  ['sqrt(9)', '√(9)'],
  ['sqrt 2', '√(2)'], // transliterated "√2"
  ['sqrt x^2', '√(x^2)'],
  ['x = (-b +- sqrt(b^2-4ac))/(2a)', 'x = (-b ± √(b^2-4ac))/(2a)'],
  ['c = sqrt(a^2 + sqrt(b))', 'c = √(a^2 + √(b))'], // nested
];
for (const [input, want] of cases) {
  const got = mathToPlain(parseMath(input));
  check(`parse: ${input}`, got === want, got);
}

// Prose must stay prose: InlineMathText runs headings and notes through the
// same parser, and "the sqrt of both sides" must not become √(of).
const prose = ['take the sqrt of both sides', 'the sqrt function is monotonic'];
for (const input of prose) {
  const got = mathToPlain(parseMath(input));
  check(`prose untouched: ${input}`, got === input, got);
}

// A structural radical must expose its atoms to the step-diff/arrow machinery.
const atoms = mathToPlain(parseMath('sqrt(x + 1)'));
check('radicand atoms survive', atoms === '√(x + 1)', atoms);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
