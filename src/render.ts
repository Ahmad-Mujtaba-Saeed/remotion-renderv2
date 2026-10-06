import path from 'path';
import os from 'os';
import * as fsSync from 'fs';
import { createHash } from 'crypto';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill, combineChunks } from '@remotion/renderer';
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

  const total = composition.durationInFrames;
  const chunkFrames = planChunkFrames(fps, width, height);
  if (total > chunkFrames) {
    await renderExplainerInChunks({ serveUrl, composition, inputProps, fps, chunkFrames, req });
    return req.outputPath;
  }

  await renderMedia({
    ...explainerRenderOptions(serveUrl, composition, inputProps),
    outputLocation: req.outputPath,
    onProgress: ({ progress }) => req.onProgress?.(progress),
  });

  return req.outputPath;
};

/**
 * Longest stretch rendered in one renderMedia() call. When Remotion decides the
 * host is short on RAM it turns parallel encoding off and parks EVERY frame as
 * a PNG in the temp dir before stitching (~2-4 MB each at 1080p), so a
 * 10-minute video wanted tens of GB free. Past this length the video is
 * rendered in pieces whose frames are freed before the next piece starts.
 * RENDER_CHUNK_SECONDS caps a piece (default 300s, floor 10s).
 */
const chunkSeconds = (): number => {
  const raw = Number(process.env.RENDER_CHUNK_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
};

/**
 * Frames per piece: the RENDER_CHUNK_SECONDS cap, shrunk to what the temp
 * drive can actually hold RIGHT NOW. A fixed 5 minutes is 9,000 PNGs, ~36 GB
 * at 1080p, and project 211 died with ENOSPC on a drive with 21 GB free — the
 * same length that "worked" when the disk was emptier. Budget: half the free
 * space at ~2 bytes/pixel per frame (flat-design PNGs measure well under the
 * 4 bytes/pixel worst case), rounded down to whole 10s so small swings in free
 * space don't change the plan. Throws a readable error when not even 10s fits.
 */
const planChunkFrames = (fps: number, width: number, height: number): number => {
  const floor = fps * 10;
  const cap = Math.max(floor, Math.round(fps * chunkSeconds()));
  const tmp = os.tmpdir();
  let free: number;
  try {
    const s = fsSync.statfsSync(tmp);
    free = s.bavail * s.bsize;
  } catch {
    return cap; // Can't measure: keep the configured cap.
  }
  const perFrame = width * height * 2;
  const fits = Math.floor((free * 0.5) / perFrame / floor) * floor;
  const gb = (free / 1e9).toFixed(1);
  if (fits < floor) {
    throw new Error(
      `Not enough free disk to render: ${gb} GB free in ${tmp}, ` +
        `need ~${((floor * perFrame * 2) / 1e9).toFixed(1)} GB for even a 10s piece. Free up space and retry.`,
    );
  }
  const frames = Math.min(cap, fits);
  console.log(`[render] ${gb} GB free in temp -> pieces of up to ${(frames / fps).toFixed(0)}s`);
  return frames;
};

/** The renderMedia() options a whole render and every chunk share. */
const explainerRenderOptions = (
  serveUrl: string,
  composition: Awaited<ReturnType<typeof selectComposition>>,
  inputProps: Record<string, unknown>,
) =>
  ({
    serveUrl,
    composition,
    codec: 'h264',
    inputProps,
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
  }) as const;

/**
 * Render a long explainer as consecutive frame ranges, then join them.
 *
 * Each chunk is a video-only MPEG-TS plus its audio as a separate AAC file cut with
 * forSeamlessAacConcatenation, which is exactly what Remotion Lambda does: the
 * h264 streams concatenate losslessly and the AAC pieces join without the
 * priming-sample click a naive concat leaves at every seam. combineChunks()
 * does both joins and the final mux.
 *
 * Chunks live beside the output in `<name>.chunks/` with a `.done` marker each,
 * keyed by a hash of the props and the piece length: when chunk 3 of 4 dies,
 * the retry keeps the two finished chunks instead of re-rendering them. Any edit to the storyboard
 * changes the hash and starts clean. The folder is deleted on success.
 */
const renderExplainerInChunks = async ({
  serveUrl,
  composition,
  inputProps,
  fps,
  chunkFrames,
  req,
}: {
  serveUrl: string;
  composition: Awaited<ReturnType<typeof selectComposition>>;
  inputProps: Record<string, unknown>;
  fps: number;
  chunkFrames: number;
  req: RenderRequest;
}): Promise<void> => {
  const total = composition.durationInFrames;
  const count = Math.ceil(total / chunkFrames);
  // Absolute: combineChunks() runs ffmpeg with a concat list in the temp dir,
  // which resolves relative entries against ITSELF, and a cwd of its own.
  const output = path.resolve(req.outputPath);
  const dir = `${output}.chunks`;
  const hash = createHash('sha1').update(JSON.stringify({ inputProps, chunkFrames })).digest('hex');
  const stampPath = path.join(dir, 'props.sha1');

  const stale = !fsSync.existsSync(stampPath) || fsSync.readFileSync(stampPath, 'utf8') !== hash;
  if (stale) {
    fsSync.rmSync(dir, { recursive: true, force: true });
    fsSync.mkdirSync(dir, { recursive: true });
    fsSync.writeFileSync(stampPath, hash);
  }

  console.log(`[render] ${total} frames in ${count} chunk(s) of ${chunkFrames}`);

  const videoFiles: string[] = [];
  const audioFiles: string[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * chunkFrames;
    const end = Math.min(total, start + chunkFrames) - 1;
    const video = path.join(dir, `chunk-${i}.ts`);
    const audio = path.join(dir, `chunk-${i}.aac`);
    const done = path.join(dir, `chunk-${i}.done`);
    videoFiles.push(video);
    audioFiles.push(audio);

    if (fsSync.existsSync(done) && fsSync.existsSync(video) && fsSync.existsSync(audio)) {
      console.log(`[render] chunk ${i + 1}/${count} reused`);
      req.onProgress?.(((i + 1) / count) * 0.97);
      continue;
    }

    await renderMedia({
      ...explainerRenderOptions(serveUrl, composition, inputProps),
      // MPEG-TS, not MP4: combineChunks() joins the video with ffmpeg's byte-level
      // `concat:` protocol, which silently keeps only the first chunk of MP4s.
      // (TS never parallel-encodes, so a chunk's frames always hit the temp
      // dir — bounded by the chunk length, which is the point.)
      codec: 'h264-ts',
      outputLocation: video,
      frameRange: [start, end],
      separateAudioTo: audio,
      audioCodec: 'aac',
      forSeamlessAacConcatenation: true,
      // Every chunk needs an audio file for the join, even a silent stretch.
      enforceAudioTrack: true,
      overwrite: true,
      onProgress: ({ progress }) => req.onProgress?.(((i + progress) / count) * 0.97),
    });
    fsSync.writeFileSync(done, '');
    console.log(`[render] chunk ${i + 1}/${count} done (frames ${start}-${end})`);
  }

  await combineChunks({
    outputLocation: output,
    videoFiles,
    audioFiles,
    codec: 'h264',
    audioCodec: 'aac',
    fps,
    framesPerChunk: chunkFrames,
    preferLossless: false,
    compositionDurationInFrames: total,
    onProgress: ({ totalProgress }) => req.onProgress?.(0.97 + totalProgress * 0.03),
  });

  fsSync.rmSync(dir, { recursive: true, force: true });
};

/**
 * Render one Long Video to Shorts clip through the `ViralShort` composition.
 * Tuned for throughput rather than the explainer's near-lossless master: a
 * batch can be a dozen 30-60s 1080x1920 shorts, and the source footage is
 * already a lossy YouTube encode, so JPEG frame capture at q92 and x264 crf 19
 * are visually transparent at a fraction of the time.
 */
export const renderViralShort = async (req: {
  props: Record<string, unknown>;
  outputPath: string;
  onProgress?: (p: number) => void;
}): Promise<string> => {
  const serveUrl = await getServeUrl();
  const composition = await selectComposition({ serveUrl, id: 'ViralShort', inputProps: req.props });
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation: req.outputPath,
    inputProps: req.props,
    onProgress: ({ progress }) => req.onProgress?.(progress),
    onBrowserLog: browserLogger('short'),
    chromiumOptions: { gl: 'angle' },
    concurrency: process.env.SHORT_RENDER_CONCURRENCY
      ? parseInt(process.env.SHORT_RENDER_CONCURRENCY, 10)
      : process.env.RENDER_CONCURRENCY
        ? parseInt(process.env.RENDER_CONCURRENCY, 10)
        : null,
    timeoutInMilliseconds: 120000,
    imageFormat: 'jpeg',
    jpegQuality: 92,
    crf: 19,
    x264Preset: 'fast',
    colorSpace: 'bt709',
    audioBitrate: '192k',
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

export interface HeroTestRequest {
  shotList: ShotList;
  frames: number[];
  /** Host directory the stills are written to (hero_<frame>.png). */
  outDir: string;
  fps?: number;
  width?: number;
  height?: number;
  scale?: number;
}

export interface HeroTestResult {
  stills: Array<{ frame: number; file: string; ms: number }>;
  /** Anything the hero runtime reported: a load failure, a thrown render, a refused key. */
  heroErrors: string[];
  /** Other browser errors seen while rendering (context for a retry prompt). */
  browserErrors: string[];
}

/**
 * The hero scene's acceptance test (Laravel HeroSceneService): render a few
 * frames of a one-scene shot list and report what the hero runtime said.
 * Silent fallback to the card is the failure mode this exists to catch —
 * runtime.tsx logs "[hero] …" whenever it gives up on the model's code.
 */
export const renderHeroTest = async (req: HeroTestRequest): Promise<HeroTestResult> => {
  const fps = req.fps ?? 30;
  const width = req.width ?? 1920;
  const height = req.height ?? 1080;
  const shotList: ShotList = { ...req.shotList, sfx: { ...(req.shotList.sfx ?? {}), enabled: false } };
  const inputProps = { shotList, fps, width, height };
  const serveUrl = await getServeUrl();
  const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });

  const heroErrors: string[] = [];
  const browserErrors: string[] = [];
  const onBrowserLog = (log: { type: string; text: string }) => {
    if (/\[hero\]|hero:/.test(log.text)) heroErrors.push(log.text);
    else if (log.type === 'error') browserErrors.push(log.text.slice(0, 400));
  };

  fsSync.mkdirSync(req.outDir, { recursive: true });
  const stills: HeroTestResult['stills'] = [];
  for (const raw of req.frames) {
    const frame = Math.max(0, Math.min(Math.round(raw), composition.durationInFrames - 1));
    const file = path.join(req.outDir, `hero_${String(frame).padStart(4, '0')}.png`);
    const t0 = Date.now();
    try {
      await renderStill({
        serveUrl,
        composition,
        inputProps,
        frame,
        output: file,
        imageFormat: 'png',
        scale: req.scale ?? 0.5,
        onBrowserLog,
        chromiumOptions: { gl: 'angle' },
        // A hero that cannot draw a frame in 20s is a hero we will not ship.
        timeoutInMilliseconds: 20000,
      });
      stills.push({ frame, file, ms: Date.now() - t0 });
    } catch (err: any) {
      heroErrors.push(`frame ${frame}: render failed — ${String(err?.message ?? err).slice(0, 300)}`);
    }
  }
  return { stills, heroErrors: [...new Set(heroErrors)], browserErrors: [...new Set(browserErrors)].slice(0, 10) };
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
