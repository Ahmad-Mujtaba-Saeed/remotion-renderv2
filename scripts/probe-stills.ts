import path from 'path';
import fs from 'fs';
import os from 'os';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';

/**
 * Camera smoke test: renders a handful of stills from a shot list JSON so the
 * flight math (bends, rolls, dives, duo frames, overview) can be inspected
 * without paying for a full render.
 *
 * Usage: npx tsx scripts/probe-stills.ts <shotlist.json> <outDir> <frame> [frame...]
 *        [--fps=60]   probe the project at another render clock; frame numbers
 *                     are then on THAT clock (frame 240 @60 = second 4, not 8).
 */
(async () => {
  const args = process.argv.slice(2);
  const fpsArg = args.find((a) => a.startsWith('--fps='));
  const fps = fpsArg ? parseInt(fpsArg.slice(6), 10) : 30;
  const [inFile, outDir, ...frameArgs] = args.filter((a) => !a.startsWith('--'));
  if (!inFile || !outDir || frameArgs.length === 0) {
    console.error('Usage: tsx scripts/probe-stills.ts <shotlist.json> <outDir> <frame...> [--fps=60]');
    process.exit(1);
  }

  const shotList = JSON.parse(fs.readFileSync(inFile, 'utf-8'));
  const frames = frameArgs.map((f) => parseInt(f, 10));
  fs.mkdirSync(outDir, { recursive: true });

  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, '..', 'src', 'remotion', 'index.ts'),
    outDir: path.join(os.tmpdir(), 'remotion-probe-bundle'),
    publicDir: path.join(__dirname, '..', 'public'),
  });

  // Match render.ts: the frame size follows the shot list's aspect, so a 9:16
  // probe shows what the portrait render will actually look like.
  const aspect = shotList.aspect_ratio ?? '16:9';
  const [width, height] = aspect === '9:16' ? [1080, 1920] : aspect === '1:1' ? [1080, 1080] : [1920, 1080];
  const inputProps = { shotList, fps, width, height };
  const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });
  console.log(`composition: ${composition.durationInFrames} frames`);

  for (const frame of frames) {
    const out = path.join(outDir, `frame_${String(frame).padStart(5, '0')}.png`);
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      frame: Math.min(frame, composition.durationInFrames - 1),
      output: out,
      chromiumOptions: { gl: 'angle' },
    });
    console.log('still:', out);
  }
  process.exit(0);
})();
