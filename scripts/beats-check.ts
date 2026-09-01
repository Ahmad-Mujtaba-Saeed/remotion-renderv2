import { beatFrames, spokenAt, activeBeat } from '../src/motion/narrationBeats';
import { sustainAt } from '../src/motion/sustain';
import { idleScale } from '../src/motion/choreo';
import type { NarrationWord } from '../src/types';

/**
 * narration beats + sustained motion (loop iter 61).
 *
 * The beat helpers decide when every card is allowed to change, so their
 * invariants matter more than their exact numbers: a beat that lands before
 * the heading, two beats on the same frame, or a last beat past the end of the
 * scene are all invisible in a still and obvious in a render.
 *
 *   npx tsx scripts/beats-check.ts
 */
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean): void => {
  if (ok) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
  }
};

const fps = 30;
const words = (spec: [string, number][]): NarrationWord[] =>
  spec.map(([word, start]) => ({ word, start, end: start + 0.3 }));

// ---- beatFrames: the invariants -------------------------------------------
const opts = { first: 14, last: 110, minGap: 10 };

const noWords = beatFrames(undefined, 4, fps, opts);
check('no timings → even spread from `first`', noWords[0] === 14);
check('no timings → last beat lands on `last`', noWords[3] === 110);
check(
  'no timings → evenly spaced',
  noWords[1] - noWords[0] === noWords[2] - noWords[1] &&
    noWords[2] - noWords[1] === noWords[3] - noWords[2]
);

const paced = beatFrames(
  words([
    ['Glass', 0.4],
    ['is', 0.8],
    ['endlessly', 1.0],
    ['recyclable', 1.6],
    ['but', 2.4],
    ['most', 2.6],
    ['of', 2.8],
    ['it', 2.9],
    ['still', 3.0],
    ['goes', 3.2],
    ['to', 3.3],
    ['landfill', 3.5],
  ]),
  4,
  fps,
  opts
);
check('paced beats are monotonic', paced.every((f, i) => i === 0 || f > paced[i - 1]));
check('paced beats respect minGap', paced.every((f, i) => i === 0 || f - paced[i - 1] >= 10));
check('paced beats start no earlier than `first`', paced[0] >= 14);
check('paced beats end no later than `last`', paced[paced.length - 1] <= 110);
check('paced beats differ from the metronome', paced.join(',') !== noWords.join(','));

// The nastiest real case: a narrator who says nothing for three seconds and
// then rushes every word at the end. Naive assignment puts all four beats past
// the scene; the walk-back ceiling has to keep them readable.
const clustered = beatFrames(
  words([
    ['and', 3.4],
    ['then', 3.5],
    ['everything', 3.55],
    ['happens', 3.6],
    ['at', 3.65],
    ['once', 3.7],
    ['right', 3.75],
    ['here', 3.8],
  ]),
  4,
  fps,
  opts
);
check('clustered narration still fits the scene', clustered[3] <= 110);
check('clustered narration still spaces its beats', clustered.every((f, i) => i === 0 || f - clustered[i - 1] >= 10));

// A single item never needs pacing, and zero items must not throw.
check('one item lands at `first`', beatFrames(undefined, 1, fps, opts)[0] === 14);
check('zero items → empty', beatFrames(undefined, 0, fps, opts).length === 0);

// maxGap groups the fallback spread (math_steps keeps its working together).
const capped = beatFrames(undefined, 3, fps, { first: 20, last: 400, minGap: 10, maxGap: 46 });
check('maxGap caps the even spread', capped[1] - capped[0] === 46 && capped[2] - capped[1] === 46);

// Fewer words than items cannot pace anything and must fall back cleanly.
const thin = beatFrames(words([['one', 0.2], ['two', 0.5]]), 5, fps, opts);
check('fewer words than items → even fallback', thin.join(',') === beatFrames(undefined, 5, fps, opts).join(','));

// ---- spokenAt --------------------------------------------------------------
const line = words([
  ['Recycling', 0.5],
  ['gates', 1.2],
  ['open', 2.0],
]);
check('exact word found', spokenAt(line, 'open', fps) === 60);
check('spoken plural matches a singular cue', spokenAt(line, 'gate', fps) === 36);
check('punctuated phrase matches its first word', spokenAt(line, 'Recycling, actually', fps) === 15);
check('a word never spoken returns null', spokenAt(line, 'landfill', fps) === null);
check('a too-short cue is refused', spokenAt(line, 'an', fps) === null);
check('no timings at all returns null', spokenAt(undefined, 'open', fps) === null);

// ---- activeBeat ------------------------------------------------------------
check('before the first beat nothing is active', activeBeat([20, 40, 60], 10) === -1);
check('the latest landed beat is active', activeBeat([20, 40, 60], 45) === 1);
check('after the last, the last stays active', activeBeat([20, 40, 60], 900) === 2);

// ---- sustain ---------------------------------------------------------------
check('none is exactly still', JSON.stringify(sustainAt(3, { kind: 'none' })) === JSON.stringify({ scale: 1, dx: 0, dy: 0, rotate: 0 }));
check(
  'breathe stays inside the ±0.3% budget',
  Array.from({ length: 400 }, (_, i) => sustainAt(i / 10, { kind: 'breathe', seed: 2 }).scale).every(
    (v) => Math.abs(v - 1) <= 0.0031
  )
);
check(
  'float stays inside a few design px',
  Array.from({ length: 400 }, (_, i) => sustainAt(i / 10, { kind: 'float', seed: 5 })).every(
    (s) => Math.abs(s.dy) <= 5.01 && Math.abs(s.scale - 1) <= 0.0021
  )
);
check(
  'seeds de-synchronise siblings',
  Math.abs(sustainAt(2, { kind: 'float', seed: 1 }).dy - sustainAt(2, { kind: 'float', seed: 2 }).dy) > 0.05
);
check(
  'the loop is continuous (no jumps between frames)',
  Array.from({ length: 600 }, (_, i) => sustainAt(i / 60, { kind: 'orbit', seed: 3 }).dx).every(
    (v, i, all) => i === 0 || Math.abs(v - all[i - 1]) < 0.6
  )
);
check(
  'idleScale is bit-for-bit what it always was',
  Array.from({ length: 200 }, (_, f) => idleScale(f, 30, 0.4)).every(
    (v, f) => Math.abs(v - (1 + 0.003 * Math.sin((Math.PI * 2 * f) / (8 * 30) + 0.4 * Math.PI * 2))) < 1e-12
  )
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
