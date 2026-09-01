import path from 'path';
import fs from 'fs';
import os from 'os';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill } from '@remotion/renderer';

/**
 * style-previews — record ONE short loop per look setting, once.
 *
 *   npx tsx scripts/style-previews.ts <outDir> [group...]
 *   npx tsx scripts/style-previews.ts ../b_f7Z3xSZkLVx/public/style-previews
 *   npx tsx scripts/style-previews.ts ../b_f7Z3xSZkLVx/public/style-previews motion
 *
 * The storyboard's style pickers used to be five rows of unlabelled words with
 * a tooltip. "Bounce" tells you nothing; a two-second clip of the same card
 * arriving with a bounce tells you everything. Rendering that live on every
 * hover would be absurd — so it is recorded here, ONCE, and shipped as a
 * static asset.
 *
 * Every clip goes through the REAL `Explainer` composition on the same demo
 * storyboard, with only the one setting under test changed. That is the whole
 * discipline of this script: what the user hovers is what the renderer does,
 * not an animation someone hand-drew in CSS to approximate it.
 *
 * Writes, per option:
 *   <outDir>/<group>/<key>.gif   the loop (small, muted, autoplaying by nature)
 *   <outDir>/<group>/<key>.png   the first frame, shown instantly under it
 *   <outDir>/manifest.json       what exists, for the UI to trust
 */

type Group = 'motion' | 'skin' | 'composition' | 'board' | 'font';

/** 480x270 at 15fps for ~2.6s: readable at hover size, ~200-500KB a clip. */
const WIDTH = 480;
const HEIGHT = 270;
const FPS = 15;

const THEME = {
  name: 'indigo',
  label: 'Indigo Pop',
  bg_from: '#0b1026',
  bg_to: '#0b1026',
  accent: '#6366f1',
  accent2: '#22d3ee',
  text: '#eef2ff',
  muted: '#a6acd6',
  panel: 'rgba(11,16,38,0.62)',
};

/**
 * The demo storyboard. Three beats, chosen so that every group has something
 * to show: a heading with bullets landing one at a time (motion + font), a
 * stat card (skin surfaces), and a two-up split (the cut between scenes, which
 * is what composition mode actually changes).
 */
const demoScenes = (): unknown[] => [
  {
    scene_id: 'scene_1',
    order: 1,
    duration_seconds: 3.2,
    narration: { text: 'Three things decide how a video feels.' },
    layout_template: 'single_focus',
    transition: 'fade',
    mood: 'neutral',
    slots: {
      slot_main: {
        content_type: 'text_block',
        heading: 'How it moves',
        bullets: ['Type arrives', 'Cards settle', 'The camera breathes'],
        reveal: 'one_by_one',
      },
    },
  },
  {
    scene_id: 'scene_2',
    order: 2,
    duration_seconds: 2.6,
    narration: { text: 'A number lands on its own card.' },
    layout_template: 'stat_spotlight',
    transition: 'stack_push',
    mood: 'confident',
    slots: {
      slot_stat: {
        content_type: 'text_block',
        heading: '84%',
        bullets: ['of the feel is timing'],
      },
    },
  },
  {
    scene_id: 'scene_3',
    order: 3,
    duration_seconds: 2.6,
    narration: { text: 'And two ideas can share the frame.' },
    layout_template: 'split_side_by_side',
    transition: 'whip_pan',
    mood: 'neutral',
    slots: {
      slot_left: {
        content_type: 'text_block',
        heading: 'Before',
        bullets: ['One idea'],
      },
      slot_right: {
        content_type: 'text_block',
        heading: 'After',
        bullets: ['The next one'],
      },
    },
  },
];

/** A maths beat — the board styles only exist in math_board mode. */
const boardScenes = (): unknown[] => [
  {
    scene_id: 'scene_1',
    order: 1,
    duration_seconds: 4.5,
    narration: { text: 'Take the equation and solve it line by line.' },
    layout_template: 'math_steps',
    transition: 'fade',
    mood: 'neutral',
    slots: {
      slot_math: {
        content_type: 'math_steps',
        heading: 'Solve for x',
        steps: [
          { expr: '2x + 6 = 14', note: 'the equation' },
          { expr: '2x = 8', note: 'subtract 6' },
          { expr: 'x = 4', note: 'divide by 2' },
        ],
      },
    },
  },
];

const OPTIONS: Record<Group, { keys: string[]; apply: (key: string) => Record<string, unknown> }> = {
  // §2.5 — the five motion presets. This is the group the whole feature is for.
  motion: {
    keys: ['crisp', 'classic', 'bounce', 'elegant', 'swiss'],
    apply: (key) => ({ motion_style: key }),
  },
  // §11.2 — surface treatment.
  skin: {
    keys: ['flat', 'outline', 'print', 'blueprint'],
    apply: (key) => ({ skin: key }),
  },
  // How the video is composed: the cut is the thing you can actually see.
  composition: {
    keys: ['slides', 'canvas_journey'],
    apply: (key) => ({ composition_mode: key }),
  },
  // Math board surfaces — rendered off the maths storyboard.
  board: {
    keys: ['slate', 'chalk', 'notebook'],
    apply: (key) => ({ composition_mode: 'math_board', board_style: key, scenes: boardScenes() }),
  },
  font: {
    keys: ['editorial', 'classic', 'tech'],
    apply: (key) => ({ font_pack: key }),
  },
};

(async () => {
  const [, , outDirArg, ...groupArgs] = process.argv;
  if (!outDirArg) {
    console.error('Usage: tsx scripts/style-previews.ts <outDir> [group...]');
    process.exit(1);
  }
  const outDir = path.resolve(outDirArg);
  const groups = (groupArgs.length ? groupArgs : Object.keys(OPTIONS)) as Group[];
  for (const g of groups) {
    if (!OPTIONS[g]) {
      console.error(`unknown group "${g}" — pick from: ${Object.keys(OPTIONS).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`bundling…`);
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, '..', 'src', 'remotion', 'index.ts'),
    outDir: path.join(os.tmpdir(), 'remotion-style-preview-bundle'),
    publicDir: path.join(__dirname, '..', 'public'),
  });

  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest: Record<string, string[]> = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    : {};

  for (const group of groups) {
    const { keys, apply } = OPTIONS[group];
    const groupDir = path.join(outDir, group);
    fs.mkdirSync(groupDir, { recursive: true });
    manifest[group] = [];

    for (const key of keys) {
      const started = Date.now();
      const overrides = apply(key);
      const shotList = {
        project_id: `style-preview-${group}-${key}`,
        aspect_ratio: '16:9',
        theme: THEME,
        // Nothing that needs the network, the filesystem or a voice: these
        // clips must render on any machine, including CI.
        sfx: { enabled: false },
        music: null,
        narration_audio_url: null,
        captions: { enabled: false },
        backdrop: { enabled: true },
        scenes: demoScenes(),
        ...overrides,
      };

      const inputProps = { shotList, fps: FPS, width: WIDTH, height: HEIGHT };
      const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });

      // The poster is the frame the hover card shows the instant it opens,
      // while the GIF is still arriving. A quarter in, so it is a settled
      // frame rather than an empty one mid-fade.
      await renderStill({
        serveUrl,
        composition,
        inputProps,
        frame: Math.min(Math.round(composition.durationInFrames * 0.25), composition.durationInFrames - 1),
        output: path.join(groupDir, `${key}.png`),
        imageFormat: 'png',
        chromiumOptions: { gl: 'angle' },
      });

      const gifPath = path.join(groupDir, `${key}.gif`);
      const result = await renderMedia({
        serveUrl,
        composition,
        inputProps,
        codec: 'gif',
        // Remotion renders every frame and drops the rest; the composition is
        // already at 15fps, so this is 1:1 and the loop plays at real speed.
        everyNthFrame: 1,
        numberOfGifLoops: null, // loop forever — it is a hover preview
        imageFormat: 'png',
        output: gifPath,
        chromiumOptions: { gl: 'angle' },
      });

      // On Windows, renderMedia hands back the GIF as a buffer and never
      // writes `output` — verified, and silent about it. Trust the buffer.
      if (!fs.existsSync(gifPath) && result?.buffer) {
        fs.writeFileSync(gifPath, result.buffer);
      }
      if (!fs.existsSync(gifPath)) {
        throw new Error(`no gif written for ${group}/${key}`);
      }

      const kb = Math.round(fs.statSync(gifPath).size / 1024);
      manifest[group].push(key);
      console.log(`  ${group}/${key}  ${kb}KB  ${((Date.now() - started) / 1000).toFixed(1)}s`);
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nmanifest: ${manifestPath}`);
  process.exit(0);
})();
