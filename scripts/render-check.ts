import path from 'path';
import fs from 'fs';
import os from 'os';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';

/**
 * Full-pipeline smoke test: renders a shot list JSON (optionally just a frame
 * range) to a real h264+aac mp4, so SFX mounts, transitions and audio mixing
 * are exercised — everything probe-stills.ts can't see.
 *
 * Usage: npx tsx scripts/render-check.ts <shotlist.json> <out.mp4> [startFrame endFrame]
 */
(async () => {
  const [, , inFile, outFile, startArg, endArg] = process.argv;
  if (!inFile || !outFile) {
    console.error('Usage: tsx scripts/render-check.ts <shotlist.json> <out.mp4> [start end]');
    process.exit(1);
  }

  const shotList = JSON.parse(fs.readFileSync(inFile, 'utf-8'));

  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, '..', 'src', 'remotion', 'index.ts'),
    outDir: path.join(os.tmpdir(), 'remotion-probe-bundle'),
    publicDir: path.join(__dirname, '..', 'public'),
  });

  const aspect = shotList.aspect_ratio ?? '16:9';
  const [width, height] = aspect === '9:16' ? [1080, 1920] : aspect === '1:1' ? [1080, 1080] : [1920, 1080];
  const inputProps = { shotList, fps: 30, width, height };
  const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });
  console.log(`composition: ${composition.durationInFrames} frames`);

  const frameRange: [number, number] | null =
    startArg !== undefined && endArg !== undefined
      ? [parseInt(startArg, 10), Math.min(parseInt(endArg, 10), composition.durationInFrames - 1)]
      : null;

  const t0 = Date.now();
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: 'h264',
    audioCodec: 'aac',
    outputLocation: outFile,
    chromiumOptions: { gl: 'angle' },
    ...(frameRange ? { frameRange } : {}),
    onProgress: ({ progress }) => {
      if (Math.round(progress * 100) % 25 === 0) process.stdout.write(`\r${Math.round(progress * 100)}%   `);
    },
  });
  console.log(`\nrendered ${outFile} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
})();
