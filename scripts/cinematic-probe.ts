import path from 'path';
import fs from 'fs';
import os from 'os';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill, renderMedia } from '@remotion/renderer';

/**
 * cinematic-probe — cinematic_card on hand-authored content, the way the
 * design pass will hand it over (already sanitised).
 *
 * Two scenes: a science explanation (icons + a text part + a stat) and a
 * money one (a formula, stats and an html mini-chart). Narration words are
 * FAKED at speaking pace so word cues fire the way they will after TTS.
 *
 * Usage:
 *   npx tsx scripts/cinematic-probe.ts <outDir> [--aspect=9:16] [--mode=slides|canvas_journey]
 *                                      [--frames=0,60,120] [--video] [--scene=0|1|both] [--spec=file.json]
 */
const FPS = 30;

const fakeWords = (text: string, startSec = 0.3, wps = 2.5) =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => ({ word, start: startSec + i / wps, end: startSec + (i + 0.8) / wps }));

const vaccineNarration =
  'When a virus gets in, your body is caught off guard. A vaccine hands your immune system a harmless copy of the spike first. It learns to build antibodies that lock onto it, and memory cells keep that recipe for years.';
const moneyNarration =
  'Here is the formula behind it. Start with one thousand dollars, let it earn seven percent a year, and after thirty years the balance is over seven thousand. Most of that growth arrives at the end.';

const SCENES = [
  {
    scene_id: 'cine_vaccine',
    narration: vaccineNarration,
    slot: {
      content_type: 'cinematic',
      heading: 'How a vaccine trains your immune system',
      brief: 'the virus, the harmless copy, the antibodies and the memory cells',
      elements: [
        { id: 'virus', kind: 'icon', icon: 'bug', text: 'The virus', sub: 'carries a spike protein', place: 'left', depth: 'far', word: 'virus', camera: 'push' },
        { id: 'copy', kind: 'text', text: 'A harmless copy of the spike', place: 'center', depth: 'mid', word: 'copy', camera: 'angle' },
        { id: 'antibodies', kind: 'icon', icon: 'shield', text: 'Antibodies', sub: 'lock onto the spike', place: 'right', depth: 'near', word: 'antibodies', camera: 'push' },
        { id: 'memory', kind: 'stat', text: 'Years', sub: 'memory cells keep the recipe', place: 'bottom', depth: 'mid', word: 'memory', camera: 'rack' },
      ],
    },
  },
  {
    scene_id: 'cine_money',
    narration: moneyNarration,
    slot: {
      content_type: 'cinematic',
      heading: 'Why compound interest snowballs',
      brief: 'the formula, the inputs, and the result',
      css: '.cc-scope .bars{display:flex;align-items:flex-end;gap:14px;height:220px;border-bottom:2px solid var(--line)} .cc-scope .bar{flex:1;background:var(--accent);opacity:.85} .cc-scope .cap{font-family:var(--font-mono);color:var(--muted);font-size:22px;margin-top:10px;text-align:center}',
      elements: [
        { id: 'formula', kind: 'formula', formula: 'A = P*(1 + r)^t', sub: 'the balance after t years', place: 'top', depth: 'mid', word: 'formula', camera: 'push' },
        { id: 'start', kind: 'stat', text: '$1,000', sub: 'starting balance', place: 'left', depth: 'near', word: 'thousand', camera: 'rack' },
        { id: 'rate', kind: 'stat', text: '7%', sub: 'earned every year', place: 'center', depth: 'far', word: 'seven', camera: 'angle' },
        { id: 'result', kind: 'stat', text: '$7,612', sub: 'after 30 years', place: 'right', depth: 'near', word: 'balance', camera: 'push' },
        {
          id: 'curve',
          kind: 'html',
          html: '<div class="bars"><div class="bar" style="height:8%"></div><div class="bar" style="height:12%"></div><div class="bar" style="height:18%"></div><div class="bar" style="height:27%"></div><div class="bar" style="height:40%"></div><div class="bar" style="height:60%"></div><div class="bar" style="height:100%"></div></div><div class="cap">growth by decade</div>',
          place: 'bottom',
          depth: 'mid',
          word: 'growth',
          camera: 'push',
        },
      ],
    },
  },
];

(async () => {
  const [, , outDir, ...flags] = process.argv;
  if (!outDir) {
    console.error('Usage: tsx scripts/cinematic-probe.ts <outDir> [--aspect=9:16] [--mode=slides] [--frames=..] [--video]');
    process.exit(1);
  }
  const flag = (n: string) => flags.find((f) => f.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
  const aspect = flag('aspect') ?? '16:9';
  const mode = flag('mode') ?? 'slides';
  const [width, height] = aspect === '9:16' ? [1080, 1920] : [1920, 1080];
  const which = flag('scene') ?? 'both';
  // --spec=<file>: stagings the real pipeline produced (scratchpad/cinematic-live.php).
  const specFile = flag('spec');
  const source: typeof SCENES = specFile ? JSON.parse(fs.readFileSync(specFile, 'utf-8')) : SCENES;
  const picked = which === 'both' ? source : [source[Number(which)]];
  const video = flags.includes('--video');

  // Sized like TTS will size it: the narration at speaking pace plus a tail.
  const secondsFor = (text: string) => Math.ceil(text.split(/\s+/).filter(Boolean).length / 2.5 + 2.2);
  const shotList = {
    project_id: 'cinematic-probe',
    aspect_ratio: aspect,
    composition_mode: mode,
    captions: { enabled: false },
    font_pack: 'editorial',
    motion_style: 'crisp',
    skin: 'flat',
    sfx: { enabled: false, volume: 1, pack: 'procedural' },
    scenes: [] as Record<string, unknown>[],
  };
  const textScene = (id: string, heading: string, line: string) => ({
    scene_id: id,
    duration_seconds: 5,
    narration: { text: line },
    narration_words: fakeWords(line),
    layout_template: 'single_focus',
    transition: 'fade',
    slots: { slot_main: { content_type: 'text_block', heading, bullets: [line] } },
  });
  const cine = picked.map((s) => ({
    scene_id: s.scene_id,
    duration_seconds: secondsFor(s.narration),
    narration: { text: s.narration },
    narration_words: fakeWords(s.narration),
    layout_template: 'cinematic_card',
    transition: 'fade',
    slots: { slot_cinematic: s.slot },
  }));
  // Canvas mode is about the HANDOVER between the world and the takeover, so
  // the cinematic scenes get an ordinary card on either side.
  const all = mode === 'slides'
    ? cine
    : [textScene('before', 'The setup', 'Before the key idea, a plain card.'), ...cine, textScene('after', 'The takeaway', 'And back to the canvas afterwards.')];
  shotList.scenes = all.map((sc, i) => ({ ...sc, order: i + 1 }));
  const inputProps = { shotList, fps: FPS, width, height };
  fs.mkdirSync(outDir, { recursive: true });

  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, '..', 'src', 'remotion', 'index.ts'),
    outDir: path.join(os.tmpdir(), 'remotion-cinematic-probe-bundle'),
    publicDir: path.join(__dirname, '..', 'public'),
  });
  const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });
  console.log(`composition ${composition.width}x${composition.height}, ${composition.durationInFrames} frames`);

  const logs = new Set<string>();
  const onBrowserLog = (log: { text: string }) => {
    if (log.text.includes('[cinematic]')) logs.add(log.text);
  };

  const frames = flag('frames')
    ? flag('frames')!.split(',').map(Number)
    : [0.02, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99].map((p) => Math.round(p * (composition.durationInFrames - 1)));
  const tag = `${mode}_${aspect.replace(':', 'x')}`;
  for (const f of frames) {
    if (f >= composition.durationInFrames) continue;
    const out = path.join(outDir, `${tag}_f${String(f).padStart(3, '0')}.png`);
    await renderStill({ serveUrl, composition, inputProps, frame: f, output: out, chromiumOptions: { gl: 'angle' }, onBrowserLog });
    console.log(`  still ${f}`);
  }

  if (video) {
    const t0 = Date.now();
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: 'h264',
      outputLocation: path.join(outDir, `${tag}.mp4`),
      chromiumOptions: { gl: 'angle' },
      onBrowserLog,
    });
    const ms = Date.now() - t0;
    console.log(`video: ${(ms / 1000).toFixed(1)}s for ${composition.durationInFrames} frames (${(ms / composition.durationInFrames).toFixed(0)} ms/frame)`);
  }
  console.log(logs.size ? `diagnostics:\n  ${[...logs].slice(0, 8).join('\n  ')}` : 'diagnostics: none');
  process.exit(0);
})();
