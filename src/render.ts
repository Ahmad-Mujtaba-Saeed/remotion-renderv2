import path from 'path';
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

/** Source of truth for everything staticFile() reaches for: SFX and fonts. */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Where the built bundle lives. NOT os.tmpdir() any more: Windows Storage
 * Sense and every "clean up temp files" tool prune %LOCALAPPDATA%\Temp, and
 * they happily delete the copied public/ tree out from under a bundle that
 * otherwise still looks complete. The result was a render that got to 0% and
 * then died on `404 .../public/sfx/shimmer.wav`, with every font 404ing on the
 * way. Keeping it beside the project puts it outside the cleaners' reach;
 * REMOTION_BUNDLE_DIR overrides for hosts that need it elsewhere.
 */
const BUNDLE_DIR = process.env.REMOTION_BUNDLE_DIR
  ? path.resolve(process.env.REMOTION_BUNDLE_DIR)
  : path.join(__dirname, '..', '.bundle');

/** Every file under `dir`, as paths relative to it. */
const listFilesRelative = (dir: string, base: string = dir): string[] => {
  const out: string[] = [];
  for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRelative(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
};

/**
 * Re-copy anything missing from the bundle's public/ tree and report what had
 * to be restored. Cheap (a couple of dozen existsSync calls on a warm bundle)
 * and it means a gutted bundle heals on the next render instead of failing
 * every render until someone restarts the service — the memoized
 * `bundlePromise` used to pin the damage for the life of the process.
 */
const repairPublicDir = (outDir: string): string[] => {
  if (!fsSync.existsSync(PUBLIC_DIR)) return [];
  const restored: string[] = [];
  for (const rel of listFilesRelative(PUBLIC_DIR)) {
    const dest = path.join(outDir, 'public', rel);
    if (fsSync.existsSync(dest)) continue;
    fsSync.mkdirSync(path.dirname(dest), { recursive: true });
    fsSync.copyFileSync(path.join(PUBLIC_DIR, rel), dest);
    restored.push(rel);
  }
  return restored;
};

/**
 * Bundle the Remotion project once and reuse the served bundle across renders.
 * The entry is the file that calls registerRoot.
 */
export const getServeUrl = async (): Promise<string> => {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(__dirname, 'remotion', 'index.ts'),
      // Stable dir so warm renders reuse the webpack cache.
      outDir: BUNDLE_DIR,
      // Bundled static assets (the SFX library) — explicit so it works no
      // matter which directory the server/CLI was started from.
      publicDir: PUBLIC_DIR,
    }).catch((err) => {
      // Don't pin a failed bundle for the life of the process.
      bundlePromise = null;
      throw err;
    });
  }
  const serveUrl = await bundlePromise;
  const restored = repairPublicDir(serveUrl);
  if (restored.length) {
    console.warn(
      `bundle: restored ${restored.length} missing public asset(s) in ${serveUrl} ` +
        `(e.g. ${restored.slice(0, 3).join(', ')})`,
    );
  }
  return serveUrl;
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

/**
 * Surface the headless browser's console in OUR log.
 *
 * Everything the composition fetches — the music bed, every image, every
 * narration wav — is loaded by Chrome inside the render, so when one of them
 * 404s or has the wrong content type, Chrome is the only thing that knows.
 * Without this the server log shows a clean `[render] done in 84s` for a video
 * that came out silent, and the actual message ("Could not play audio…") is
 * discarded. Errors and warnings always print; set RENDER_BROWSER_LOG=all to
 * see React's chatter too.
 *
 * @param tag  which pass is speaking, so a preview and a render are telling
 *             apart in a busy log
 */
const browserLogger = (tag: string) => (log: { type: string; text: string }) => {
  const noisy = process.env.RENDER_BROWSER_LOG === 'all';
  if (!noisy && log.type !== 'error' && log.type !== 'warning') return;
  console.log(`[${tag}][browser:${log.type}] ${log.text}`);
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
    // A failed asset fetch (a missing music bed, a 404 image) is only ever
    // reported inside the browser — without this it is thrown away and the
    // render "succeeds" silently.
    onBrowserLog: browserLogger('render'),
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

export interface PreviewRequest {
  shotList: ShotList;
  outputPath: string;
  /** Composition frame to freeze. Clamped to the composition's own length. */
  frame: number;
  fps?: number;
  width?: number;
  height?: number;
  /** Render scale — previews ship at 0.5 by default (half-size PNG, ~4x faster). */
  scale?: number;
}

/**
 * Freeze ONE frame of the real `Explainer` composition to a PNG — the
 * storyboard's live style preview. It goes through the SAME shot list the
 * video render consumes, so what the preview shows (scheme, font pack, skin,
 * motion style, board skin) is what the MP4 will show; nothing here is a
 * second, drifting approximation of the renderer.
 *
 * Reuses the cached bundle, so a warm preview is a second or two. Audio is
 * irrelevant to a still, so a project whose narration has not been synthesized
 * yet still previews fine.
 */
export const renderPreviewStill = async (req: PreviewRequest): Promise<string> => {
  const fps = req.fps ?? 30;
  const width = req.width ?? 1920;
  const height = req.height ?? 1080;

  // Silence the SFX layer: a still never plays a cue, and resolving the pack
  // touches the filesystem for nothing.
  const shotList: ShotList = {
    ...req.shotList,
    sfx: { ...(req.shotList.sfx ?? {}), enabled: false },
  };

  const inputProps = { shotList, fps, width, height };
  const serveUrl = await getServeUrl();

  const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });

  await renderStill({
    serveUrl,
    composition,
    inputProps,
    frame: Math.max(0, Math.min(Math.round(req.frame), composition.durationInFrames - 1)),
    output: req.outputPath,
    imageFormat: 'png',
    scale: req.scale ?? 0.5,
    onBrowserLog: browserLogger('preview'),
    chromiumOptions: { gl: 'angle' },
    timeoutInMilliseconds: 120000,
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
