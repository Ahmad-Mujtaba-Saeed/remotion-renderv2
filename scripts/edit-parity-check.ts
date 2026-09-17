/**
 * Renders one text scene twice — as designed, and with hand edits from the
 * storyboard stage — so a person can see the renderer honours element_edits.
 *
 *   npx tsx scripts/edit-parity-check.ts <outDir>
 */
import path from 'path';
import os from 'os';
import fs from 'fs';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const THEME = {
  name: 'indigo', label: 'Indigo', bg_from: '#0b1026', bg_to: '#0b1026',
  accent: '#6366f1', accent2: '#22d3ee', text: '#eef2ff', muted: '#a6acd6', panel: 'rgba(11,16,38,0.62)',
};

const scene = (edits: Record<string, unknown> | null) => [
  {
    scene_id: 'scene_1',
    order: 1,
    duration_seconds: 4,
    narration: { text: 'Three things.' },
    layout_template: 'single_focus',
    transition: 'fade',
    mood: 'neutral',
    element_edits: edits,
    style: { variant: 'editorial', kicker: 'Basics', highlight: [] },
    slots: {
      slot_main: {
        content_type: 'text_block',
        heading: 'How sleep repairs you',
        bullets: ['Muscles rebuild', 'Memories settle', 'Hormones reset'],
        reveal: 'all_at_once',
      },
    },
  },
];

(async () => {
  const outDir = path.resolve(process.argv[2] ?? 'out/edit-parity');
  fs.mkdirSync(outDir, { recursive: true });
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, '..', 'src', 'remotion', 'index.ts'),
    outDir: path.join(os.tmpdir(), 'remotion-edit-parity-bundle'),
    publicDir: path.join(__dirname, '..', 'public'),
  });
  const variants: [string, Record<string, unknown> | null][] = [
    ['designed', null],
    [
      'edited',
      {
        'slot_main.heading': { x: 0.2, y: -0.1, scale: 1.3, color: '#f5c542', case: 'upper', rotate: -4 },
        'slot_main.bullets.1': { hidden: true },
        'slot_main.bullets.2': { text: 'Hormones reset overnight', italic: true, color: '#22c55e' },
        'slot_main.kicker': { text: 'Edited kicker' },
      },
    ],
  ];
  for (const [name, edits] of variants) {
    const shotList = {
      project_id: 'edit-parity',
      aspect_ratio: '16:9',
      composition_mode: 'slides',
      theme: THEME,
      sfx: { enabled: false },
      music: null,
      captions: { enabled: false },
      scenes: scene(edits),
    };
    const inputProps = { shotList, fps: 30, width: 960, height: 540 };
    const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      frame: 90,
      output: path.join(outDir, `${name}.png`),
      imageFormat: 'png',
      chromiumOptions: { gl: 'angle' },
    });
    console.log(`${name}.png`);
  }
  process.exit(0);
})();
