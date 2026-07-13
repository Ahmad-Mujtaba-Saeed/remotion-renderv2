import path from 'path';
import os from 'os';
import * as fsSync from 'fs';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill } from '@remotion/renderer';
import type { ShotList } from './types';
import type { ThumbnailProps } from './ThumbnailComp';
import { SFX_NAMES } from './sfx';

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
      // Bundled static assets (the SFX library) — explicit so it works no
      // matter which directory the server/CLI was started from.
      publicDir: path.join(__dirname, '..', 'public'),
    });
  }
  return bundlePromise;
};

/**
 * Resolve which SFX library this render uses (copilot.md §6.1). The browser
 * side cannot touch the filesystem, so the decision happens HERE, once, with
 * fs access: 'studio' (or the default 'auto') only sticks when
 * public/sfx/studio/ carries EVERY file in the manifest — a partial pack
 * would 404 mid-render and kill it with an opaque delayRender timeout.
 * Anything else falls back to the procedural set, which always exists.
 */
const resolveSfxPack = (requested: string | undefined): 'procedural' | 'studio' => {
  if (requested === 'procedural') return 'procedural';
  // 'studio', 'auto' or unset: use the studio pack when it is complete.
  const dir = path.join(__dirname, '..', 'public', 'sfx', 'studio');
  const complete = SFX_NAMES.every((name) => fsSync.existsSync(path.join(dir, `${name}.wav`)));
  if (requested === 'studio' && !complete) {
    console.warn('sfx: studio pack requested but incomplete — falling back to procedural');
  }
  return complete ? 'studio' : 'procedural';
};

export const renderExplainer = async (req: RenderRequest): Promise<string> => {
  const fps = req.fps ?? 30;
  const width = req.width ?? 1920;
  const height = req.height ?? 1080;

  const shotList: ShotList = {
    ...req.shotList,
    sfx: { ...(req.shotList.sfx ?? {}), pack: resolveSfxPack((req.shotList.sfx as { pack?: string } | undefined)?.pack) },
  };

  const inputProps = { shotList, fps, width, height };

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
    // Quality over file size, deliberately: Remotion's defaults (crf 18,
    // jpegQuality 80) capture every frame through a lossy JPEG step before
    // it even reaches the video encoder. `png` frame capture skips that
    // compression entirely, `crf: 16` pushes the h264 encode to
    // near-lossless, and the `slow` x264 preset spends more effort per
    // frame for a better quality-per-bit result at the same crf.
    imageFormat: 'png',
    crf: 16,
    x264Preset: 'slow',
    colorSpace: 'bt709',
  });

  return req.outputPath;
};

/**
 * Render the §10.5 thumbnail still (composition `ExplainerThumbnail`) to a
 * PNG. Reuses the cached bundle, so after a video render this costs ~a second.
 */
export const renderThumbnail = async (props: ThumbnailProps, outputPath: string): Promise<string> => {
  const serveUrl = await getServeUrl();
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({
    serveUrl,
    id: 'ExplainerThumbnail',
    inputProps,
  });
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    frame: 0,
    output: outputPath,
    imageFormat: 'png',
    chromiumOptions: { gl: 'angle' },
    timeoutInMilliseconds: 60000,
  });
  return outputPath;
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
