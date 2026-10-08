// Render a frame range of a dumped payload: npx tsx scripts/presenter-range.ts out/p230.json out/x.mp4 0 90 [concurrency]
import fs from 'fs';
import path from 'path';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { getServeUrl } from '../src/render';

(async () => {
  const [, , inFile, outFile, a, b, conc] = process.argv;
  const payload = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const inputProps = { shotList: payload.shot_list, fps: payload.fps, width: payload.width, height: payload.height };
  const serveUrl = await getServeUrl();
  const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });
  const t0 = Date.now();
  await renderMedia({
    serveUrl, composition, codec: 'h264', inputProps, outputLocation: path.resolve(outFile),
    frameRange: [Number(a), Number(b)], concurrency: conc ? Number(conc) : null,
    chromiumOptions: { gl: 'angle' }, imageFormat: (process.env.FMT as any) || 'jpeg', timeoutInMilliseconds: 120000, crf: 16, x264Preset: 'slow', colorSpace: 'bt709',
    offthreadVideoCacheSizeInBytes: (Number(process.env.CACHE_MB) || 1024) * 1024 * 1024, offthreadVideoThreads: process.env.OVT ? Number(process.env.OVT) : undefined,
    onBrowserLog: (l) => { if (l.type === 'error') console.log('[browser]', l.text.slice(0, 300)); },
  });
  console.log('ok', composition.durationInFrames, 'frames total; rendered', a, '-', b, 'in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  process.exit(0);
})().catch((e) => { console.error('FAILED', String(e?.message ?? e).slice(0, 400)); process.exit(1); });
