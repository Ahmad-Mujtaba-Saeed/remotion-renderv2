import path from 'path';
import fs from 'fs';
import os from 'os';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import { compileHero } from '../src/hero/guard';

/**
 * Hero smoke test: compile a hero scene through the REAL guard, mount it as
 * the only scene of a slides video, render stills. No Laravel, no model.
 *
 *   npx tsx scripts/hero-probe.ts <hero.tsx> <outDir> [--aspect=9:16] [--seconds=9]
 *        [--narration="..."] [--theme=<shotlist.json with a theme/fonts>] [--frames=10,60,120]
 *        [--canvas]   mount it as scene 2 of a canvas journey (takeover path)
 *
 * Narration words are spread evenly over the scene, so cue() lands roughly
 * where a real voice would.
 */
(async () => {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const [heroFile, outDir] = args.filter((a) => !a.startsWith('--'));
  if (!heroFile || !outDir) {
    console.error('Usage: tsx scripts/hero-probe.ts <hero.tsx> <outDir> [--aspect=] [--seconds=] [--narration=] [--theme=] [--frames=]');
    process.exit(1);
  }

  const source = fs.readFileSync(heroFile, 'utf-8');
  const compiled = compileHero(source);
  if (!compiled.ok) {
    console.error('COMPILE FAILED:\n  ' + compiled.errors.join('\n  '));
    process.exit(2);
  }
  if (compiled.warnings.length) console.log('warnings:\n  ' + compiled.warnings.join('\n  '));

  const fps = 30;
  const seconds = Number(opt('seconds') ?? 9);
  const aspect = opt('aspect') ?? '16:9';
  const [width, height] = aspect === '9:16' ? [1080, 1920] : [1920, 1080];
  const narration =
    opt('narration') ??
    (/\/\/ NARRATION: "([^"]+)"/.exec(source)?.[1] ?? 'This is a hero scene probe with no narration given.');
  const words = narration.split(/\s+/).filter(Boolean);
  const span = seconds - 1.6;
  const narrationWords = words.map((w, i) => ({
    word: w.replace(/[^\w'-]/g, ''),
    start: 0.3 + (i / words.length) * span,
    end: 0.3 + ((i + 0.85) / words.length) * span,
  }));

  const look = opt('theme') ? JSON.parse(fs.readFileSync(opt('theme')!, 'utf-8')) : {};
  const heroScene = {
    scene_id: 'h1',
    order: 1,
    duration_seconds: seconds,
    narration: { text: narration },
    layout_template: 'single_focus',
    transition: 'none',
    mood: 'neutral',
    slots: { slot_main: { content_type: 'text_block', heading: 'Fallback card', bullets: ['If you see this, the hero did not load'] } },
    narration_words: narrationWords,
    hero: { js: compiled.js, captions: aspect === '9:16', assets: {} },
  };
  const filler = (id: string, order: number) => ({
    scene_id: id,
    order,
    duration_seconds: 4,
    narration: { text: 'A plain card around the hero.' },
    layout_template: 'single_focus',
    transition: 'fade',
    mood: 'neutral',
    slots: { slot_main: { content_type: 'text_block', heading: `Scene ${id}`, bullets: ['Plain card'] } },
  });
  const canvas = args.includes('--canvas');
  const scenes = canvas ? [filler('a', 1), { ...heroScene, order: 2 }, filler('b', 3)] : [heroScene];
  const shotList = {
    project_id: 'hero-probe',
    aspect_ratio: aspect,
    composition_mode: canvas ? 'canvas_journey' : 'slides',
    theme: look.theme ?? undefined,
    fonts: look.fonts ?? undefined,
    motion_style: look.motion_style ?? 'crisp',
    motion_tuning: look.motion_tuning ?? undefined,
    sfx: { enabled: false },
    captions: { enabled: aspect === '9:16' },
    scenes,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, '..', 'src', 'remotion', 'index.ts'),
    outDir: path.join(os.tmpdir(), 'remotion-hero-probe-bundle'),
    publicDir: path.join(__dirname, '..', 'public'),
  });
  const inputProps = { shotList, fps, width, height };
  const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });
  console.log(`composition: ${composition.durationInFrames} frames`);

  const total = canvas ? composition.durationInFrames : seconds * fps;
  const frames = (opt('frames') ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  const list = frames.length ? frames : [0.08, 0.3, 0.55, 0.8, 0.97].map((f) => Math.round(f * (total - 1)));

  for (const frame of list) {
    const output = path.join(outDir, `hero_${String(frame).padStart(4, '0')}.png`);
    const t0 = Date.now();
    await renderStill({
      serveUrl,
      composition,
      frame,
      output,
      inputProps,
      onBrowserLog: (l) => {
        if (l.type === 'error' || l.type === 'warning' || /hero/i.test(l.text)) console.log(`  [browser ${l.type}] ${l.text}`);
      },
    });
    console.log(`still ${frame} in ${Date.now() - t0}ms -> ${output}`);
  }
})();
