import path from 'path';
import fs from 'fs';
import os from 'os';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill, renderMedia } from '@remotion/renderer';

/**
 * depth-probe — the FLUTE RIG on ordinary cards.
 *
 * The flow card had its own probe from the day it was built; the depth rig
 * (motion/depthStage) now moves every card in the video, so it needs the same
 * thing: a run of plain scenes — text, a stat, a split with media, a step flow
 * — rendered at the moments that matter (the arrival out of depth, the middle
 * of the dolly, the settled frame that must be byte-sharp).
 *
 * Usage:
 *   npx tsx scripts/depth-probe.ts <outDir> [--depth=off|subtle|full]
 *                                  [--aspect=9:16] [--mode=slides|canvas_journey]
 *                                  [--frames=4,40,120] [--video]
 *
 * Render the same run twice into two directories (`--depth=off` and
 * `--depth=full`) and the pair diffs cleanly.
 */
const FPS = 30;

const fakeWords = (text: string, startSec = 0.3, wps = 2.5) =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => ({ word, start: startSec + i / wps, end: startSec + (i + 0.8) / wps }));

const narration = [
  'Every card in this video now arrives out of the depth of the frame instead of fading flat onto it.',
  'A number lands on its own plane, with the backdrop sitting well behind it.',
  'A picture and its panel part from each other as the camera moves, because they are not on the same plane.',
  'And a sequence of steps comes forward one at a time, each one resolving as the narrator reaches it.',
];

const SCENES = [
  {
    scene_id: 'depth_text',
    layout_template: 'single_focus',
    relation: 'continues',
    slots: {
      slot_main: {
        content_type: 'text_block',
        heading: 'The rig, on an ordinary card',
        bullets: [
          'The card arrives out of depth',
          'The backdrop sits further back',
          'Nothing is blurred once it lands',
        ],
        reveal: 'sequential',
      },
    },
  },
  {
    scene_id: 'depth_stat',
    layout_template: 'stat_spotlight',
    relation: 'consequence',
    slots: {
      slot_stat: { content_type: 'text_block', heading: '1,400 px', bullets: ['the lens the whole video shares'] },
    },
  },
  {
    scene_id: 'depth_split',
    layout_template: 'split_side_by_side',
    relation: 'contrast',
    slots: {
      slot_left: {
        content_type: 'image',
        label: 'The picture',
        camera_move: 'ken_burns',
        asset_request: { description: 'a plain test picture' },
      },
      slot_right: {
        content_type: 'text_block',
        heading: 'Parallax',
        bullets: ['The media plane sits behind the body plane', 'So the two part as the camera moves'],
        reveal: 'sequential',
      },
    },
  },
  {
    scene_id: 'depth_steps',
    layout_template: 'step_flow',
    relation: 'elaborates',
    slots: {
      slot_steps: {
        content_type: 'steps',
        heading: 'One at a time',
        steps: [
          { label: 'Arrive', detail: 'out of the depth of the frame' },
          { label: 'Resolve', detail: 'soft to sharp on the cue' },
          { label: 'Settle', detail: 'and the frame is sharp again' },
        ],
      },
    },
  },
];

const main = async () => {
  const [, , outDirArg, ...flags] = process.argv;
  const outDir = path.resolve(outDirArg ?? 'out/depth-probe');
  const aspect = (flags.find((f) => f.startsWith('--aspect='))?.split('=')[1] ?? '16:9') as '16:9' | '9:16';
  const mode = flags.find((f) => f.startsWith('--mode='))?.split('=')[1] ?? 'slides';
  const depth = flags.find((f) => f.startsWith('--depth='))?.split('=')[1] ?? 'full';
  const video = flags.includes('--video');
  const [width, height] = aspect === '9:16' ? [1080, 1920] : [1920, 1080];

  const shotList = {
    project_id: 'depth-probe',
    aspect_ratio: aspect,
    composition_mode: mode,
    captions: { enabled: false },
    font_pack: 'editorial',
    motion_style: 'crisp',
    motion_depth: depth,
    skin: 'flat',
    sfx: { enabled: false, volume: 1, pack: 'procedural' },
    scenes: SCENES.map((scene, i) => ({
      ...scene,
      order: i + 1,
      duration_seconds: 7,
      transition: 'fade',
      narration: { text: narration[i] },
      narration_words: fakeWords(narration[i]),
    })),
  };

  fs.mkdirSync(outDir, { recursive: true });
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, '..', 'src', 'remotion', 'index.ts'),
    outDir: path.join(os.tmpdir(), 'remotion-depth-probe-bundle'),
    publicDir: path.join(__dirname, '..', 'public'),
  });
  const inputProps = { shotList, fps: FPS, width, height };
  const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });
  console.log(`composition ${composition.width}x${composition.height}, ${composition.durationInFrames} frames (depth: ${depth})`);

  const sceneF = 7 * FPS;
  const asked = flags.find((f) => f.startsWith('--frames='))?.split('=')[1];
  // Per scene: 4 frames in (mid-arrival), a third through, and the settled
  // frame before the cut — the one that has to be perfectly sharp.
  const frames = asked
    ? asked.split(',').map((n) => parseInt(n, 10))
    : SCENES.flatMap((_, i) => [i * sceneF + 4, i * sceneF + Math.round(sceneF * 0.35), (i + 1) * sceneF - 8]);

  for (const f of frames) {
    if (f < 0 || f >= composition.durationInFrames) continue;
    await renderStill({
      composition,
      serveUrl,
      output: path.join(outDir, `${aspect.replace(':', 'x')}_f${String(f).padStart(4, '0')}.png`),
      frame: f,
      inputProps,
      chromiumOptions: { gl: 'angle' },
    });
    console.log(`  still ${f}`);
  }

  if (video) {
    const started = Date.now();
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: path.join(outDir, `${aspect.replace(':', 'x')}.mp4`),
      inputProps,
      chromiumOptions: { gl: 'angle' },
    });
    console.log(
      `video: ${((Date.now() - started) / 1000).toFixed(1)}s for ${composition.durationInFrames} frames ` +
        `(${Math.round((Date.now() - started) / composition.durationInFrames)} ms/frame)`
    );
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
