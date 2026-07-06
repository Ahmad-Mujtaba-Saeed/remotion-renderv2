import path from 'path';
import os from 'os';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import type { ShotList } from './types';

export interface RenderRequest {
  shotList: ShotList;
  outputPath: string;
  fps?: number;
  width?: number;
  height?: number;
  onProgress?: (progress: number) => void;
}

let bundlePromise: Promise<string> | null = null;

/**
 * Bundle the Remotion project once and reuse the served bundle across renders.
 * The entry is the file that calls registerRoot.
 */
const getServeUrl = (): Promise<string> => {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(__dirname, 'remotion', 'index.ts'),
      // Keep webpack cache in a stable temp dir for faster warm renders.
      outDir: path.join(os.tmpdir(), 'remotion-render-bundle'),
    });
  }
  return bundlePromise;
};

export const renderExplainer = async (req: RenderRequest): Promise<string> => {
  const fps = req.fps ?? 30;
  const width = req.width ?? 1920;
  const height = req.height ?? 1080;

  const inputProps = { shotList: req.shotList, fps, width, height };

  const serveUrl = await getServeUrl();

  const composition = await selectComposition({
    serveUrl,
    id: 'Explainer',
    inputProps,
  });

  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation: req.outputPath,
    inputProps,
    onProgress: ({ progress }) => req.onProgress?.(progress),
    chromiumOptions: { gl: 'angle' },
    // Optional override for memory-constrained hosts (default: Remotion's).
    concurrency: process.env.RENDER_CONCURRENCY ? parseInt(process.env.RENDER_CONCURRENCY, 10) : null,
    // Allow remote (Laravel-served) asset URLs.
    timeoutInMilliseconds: 120000,
  });

  return req.outputPath;
};

// CLI helper: `tsx src/render.ts <shotlist.json> <out.mp4>`
if (require.main === module) {
  (async () => {
    const [, , inFile, outFile] = process.argv;
    if (!inFile || !outFile) {
      console.error('Usage: tsx src/render.ts <shotlist.json> <out.mp4>');
      process.exit(1);
    }
    const fs = await import('fs');
    const shotList = JSON.parse(fs.readFileSync(inFile, 'utf-8')) as ShotList;
    const aspect = shotList.aspect_ratio ?? '16:9';
    const [width, height] = aspect === '9:16' ? [1080, 1920] : aspect === '1:1' ? [1080, 1080] : [1920, 1080];
    await renderExplainer({ shotList, outputPath: outFile, width, height });
    console.log('Rendered to', outFile);
    process.exit(0);
  })();
}
