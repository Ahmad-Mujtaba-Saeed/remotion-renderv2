import fs from 'fs';
import { renderExplainer } from '../src/render';

/**
 * Smoke test for chunked rendering: renders a shot list through the real
 * renderExplainer() with a tiny chunk size so a short sample still crosses
 * several seams, then leaves the joined MP4 for ffprobe / a listen.
 *
 * Usage: RENDER_CHUNK_SECONDS=10 npx tsx scripts/chunk-check.ts <shotlist.json> <out.mp4>
 */
(async () => {
  const [, , inFile, outFile] = process.argv;
  const shotList = JSON.parse(fs.readFileSync(inFile, 'utf-8'));
  const t0 = Date.now();
  let last = -1;
  await renderExplainer({
    shotList,
    outputPath: outFile,
    onProgress: (p) => {
      const pct = Math.floor(p * 10) * 10;
      if (pct !== last) console.log(`${pct}%`), (last = pct);
    },
  });
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${outFile}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
