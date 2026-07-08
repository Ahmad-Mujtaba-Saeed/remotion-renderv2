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
 */
(async () => {
  const [, , inFile, outDir, ...frameArgs] = process.argv;
  if (!inFile || !outDir || frameArgs.length === 0) {
    console.error('Usage: tsx scripts/probe-stills.ts <shotlist.json> <outDir> <frame...>');
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

  const inputProps = { shotList, fps: 30, width: 1920, height: 1080 };
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
