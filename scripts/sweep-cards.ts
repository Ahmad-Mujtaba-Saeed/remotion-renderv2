import path from 'path';
import fs from 'fs';
import os from 'os';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import { CASES, SweepCase } from './sweep-cases';

/**
 * card-sweep — one still per card template, at worst-case content, in every
 * aspect the product ships.
 *
 * Every card iteration until now verified itself with two or three hand-picked
 * frames of the card just built. That is why a systemic type problem (long
 * headings crowding the stage in 9:16) survived twenty-two iterations: nothing
 * ever looked at all the cards at once, and nothing ever looked at the WORST
 * content instead of the demo content.
 *
 * Usage:
 *   npx tsx scripts/sweep-cards.ts <outDir> [--aspect=9:16] [--only=a,b]
 *
 * Defaults to both aspects and every case. Output lands at
 * <outDir>/<aspect>/<template>.png, so two runs into different directories
 * diff cleanly (before/after a typography change).
 */
const ASPECTS: Record<string, [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
};

const SCENE_SECONDS = 10;
const FPS = 30;

const scaffold = (cases: SweepCase[], aspect: string) => ({
  project_id: 'card-sweep',
  aspect_ratio: aspect,
  composition_mode: 'slides',
  captions: { enabled: false },
  font_pack: 'editorial',
  motion_style: 'crisp',
  skin: 'flat',
  sfx: { enabled: false, volume: 1, pack: 'procedural' },
  theme: {
    name: 'midnight',
    label: 'Midnight',
    bg_from: '#101623',
    bg_to: '#101623',
    accent: '#5EC9E8',
    accent2: '#3FA6C4',
    text: '#EDF3F8',
    muted: '#7C8B9C',
    panel: '#1A2333',
  },
  scenes: cases.map((c, i) => ({
    scene_id: `sw_${c.template}`,
    order: i + 1,
    duration_seconds: SCENE_SECONDS,
    narration: {
      text:
        c.narration ??
        'This scene exists to hold the card while the sweep photographs it, and it says nothing in particular.',
    },
    layout_template: c.template,
    transition: 'none',
    style: c.style,
    slots: c.slots,
  })),
});

(async () => {
  const [, , outDirArg, ...flags] = process.argv;
  if (!outDirArg) {
    console.error('Usage: tsx scripts/sweep-cards.ts <outDir> [--aspect=9:16] [--only=single_focus,term_card]');
    process.exit(1);
  }
  const flag = (name: string): string | null => {
    const hit = flags.find((f) => f.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };

  const only = flag('only')?.split(',').map((s) => s.trim());
  const cases = only ? CASES.filter((c) => only.includes(c.template)) : CASES;
  if (cases.length === 0) {
    console.error('No cases matched --only');
    process.exit(1);
  }
  const aspects = flag('aspect') ? [flag('aspect') as string] : Object.keys(ASPECTS);

  console.log(`sweeping ${cases.length} cards x ${aspects.length} aspect(s)`);
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, '..', 'src', 'remotion', 'index.ts'),
    outDir: path.join(os.tmpdir(), 'remotion-sweep-bundle'),
    publicDir: path.join(__dirname, '..', 'public'),
  });

  const started = Date.now();
  for (const aspect of aspects) {
    const [width, height] = ASPECTS[aspect];
    const shotList = scaffold(cases, aspect);
    const inputProps = { shotList, fps: FPS, width, height };
    const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });
    const dir = path.join(outDirArg, aspect.replace(':', 'x'));
    fs.mkdirSync(dir, { recursive: true });

    for (const [i, c] of cases.entries()) {
      // Each scene owns SCENE_SECONDS of the timeline; grab it once everything
      // in it has landed (or wherever the case asks, for late payoffs).
      const frame = Math.round((i + (c.at ?? 0.85)) * SCENE_SECONDS * FPS);
      const out = path.join(dir, `${c.template}.png`);
      await renderStill({
        serveUrl,
        composition,
        inputProps,
        frame: Math.min(frame, composition.durationInFrames - 1),
        output: out,
        chromiumOptions: { gl: 'angle' },
      });
      console.log(`  ${aspect}  ${c.template}`);
    }
  }

  console.log(`done in ${Math.round((Date.now() - started) / 1000)}s -> ${outDirArg}`);
  process.exit(0);
})();
