import './env'; // must stay first: loads .env before anything reads process.env
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { renderExplainer, renderThumbnail, renderPreviewStill, renderViralShort, renderHeroTest, renderHeroClip } from './render';
import { compileHero } from './hero/guard';
import type { ShotList } from './types';
import type { ThumbnailProps } from './ThumbnailComp';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = Number(process.env.PORT || 3020);

// The Laravel worker runs in Docker and sends a CONTAINER-absolute output_path
// (e.g. /var/www/storage/...). This Node service runs on the HOST, where that
// path is meaningless. Storage is bind-mounted (host ./viralforgebackend/storage
// <-> container /var/www/storage), so translate the prefix to its host location.
// Default: remotion-render/ is a sibling of viralforgebackend/. Resolved from
// THIS file, not the cwd — pm2/systemd may start the process anywhere. A server
// whose backend folder is named differently must set HOST_STORAGE_PREFIX
// (environment or remotion-render/.env).
const CONTAINER_STORAGE_PREFIX = (process.env.CONTAINER_STORAGE_PREFIX || '/var/www/storage').replace(/\/+$/, '');
const HOST_STORAGE_PREFIX = path.resolve(
  process.env.HOST_STORAGE_PREFIX || path.join(__dirname, '..', '..', 'viralforgebackend', 'storage')
);
const STORAGE_PUBLIC = path.join(HOST_STORAGE_PREFIX, 'app', 'public');
const storageOk = (): boolean => fs.existsSync(STORAGE_PUBLIC);
if (storageOk()) {
  console.log(`[storage] ${CONTAINER_STORAGE_PREFIX} -> ${HOST_STORAGE_PREFIX}`);
} else {
  console.error(`[storage] ${STORAGE_PUBLIC} does not exist — set HOST_STORAGE_PREFIX to the backend's storage folder. Renders will be refused.`);
}

// Never write into a storage tree that is not the app's: with a wrong prefix the
// renders "succeeded" into a fresh folder (mkdir -p) and the app saw nothing.
app.use((req, res, next) => {
  const body = req.body || {};
  if (req.method === 'POST' && (body.output_path || body.output_dir) && !storageOk()) {
    return res.status(500).json({
      success: false,
      error: `Render server storage is misconfigured: ${STORAGE_PUBLIC} does not exist. Set HOST_STORAGE_PREFIX to the backend's storage folder and restart the render server.`,
    });
  }
  next();
});

function toHostPath(p: string): string {
  const normalized = String(p).replace(/\\/g, '/');
  if (normalized === CONTAINER_STORAGE_PREFIX || normalized.startsWith(CONTAINER_STORAGE_PREFIX + '/')) {
    const rest = normalized.slice(CONTAINER_STORAGE_PREFIX.length).replace(/^\/+/, '');
    return path.resolve(HOST_STORAGE_PREFIX, rest);
  }
  return p;
}

// Serve Laravel's public storage straight from the host filesystem. Render
// assets used to be fetched through http://localhost:8086 (nginx in Docker),
// but Docker Desktop's localhost port proxy resets connections under headless
// Chrome's concurrent range-request load (net::ERR_CONNECTION_RESET mid-render).
// Storage is bind-mounted, so this process can serve the same files directly —
// point REMOTION_ASSET_BASE_URL at this server. CORS (needed for CSS
// mask-image fetches) comes from the global cors() middleware above.
app.use(
  '/storage',
  express.static(STORAGE_PUBLIC, {
    // no-store: headless Chrome's disk cache can't do range operations on
    // revalidated media entries (net::ERR_CACHE_OPERATION_NOT_SUPPORTED ->
    // "Format error" mid-render). Streaming every request from this local
    // process is free and side-steps the Chromium cache entirely.
    cacheControl: false,
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    },
  })
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'remotion-render' });
});

// ─── Background render jobs ────────────────────────────────────────────────
// A render used to be ONE blocking HTTP request that said nothing until the
// MP4 existed — up to hours. From the caller's side a healthy render and a
// hung one looked identical, and if this process restarted mid-render the
// caller found out only when its HTTP timeout ran out.
//
// With `async: true` in the body, /render and /render-short start the work,
// answer at once with a job id, and the caller polls GET /jobs/:id for
// progress. An id this process does not know means it restarted and the
// render is gone — a definite answer, no timeout needed.
//
// Requests without `async` keep the old blocking behaviour, so an older
// backend keeps working against this server.
type RenderJob = {
  id: string;
  kind: 'render' | 'short';
  project_id: unknown;
  output_path: string;
  signature: string;
  status: 'running' | 'done' | 'failed';
  progress: number;
  error?: string;
  render_seconds?: number;
  started_at: number;
  finished_at?: number;
};

const jobs = new Map<string, RenderJob>();
const JOB_KEEP_MS = 6 * 60 * 60 * 1000;

const publicJob = (job: RenderJob) => ({
  success: true,
  job_id: job.id,
  status: job.status,
  progress: job.progress,
  error: job.error,
  render_seconds: job.render_seconds,
  running_seconds: Math.round(((job.finished_at ?? Date.now()) - job.started_at) / 1000),
});

function hashString(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Start `work` in the background, or hand back the job already rendering the
 * same thing. A worker that died and was restarted asks for the same render
 * again; rendering it twice at once into one file would waste the machine
 * and race on the output, so the second request simply re-attaches.
 */
function startJob(
  kind: RenderJob['kind'],
  body: any,
  outputPath: string,
  work: (onProgress: (p: number) => void) => Promise<void>,
): RenderJob {
  const { async: _async, ...rest } = body || {};
  const text = JSON.stringify(rest);
  const signature = `${kind}:${text.length}:${hashString(text)}`;
  for (const job of jobs.values()) {
    if (job.status === 'running' && job.output_path === outputPath && job.signature === signature) {
      console.log(`[jobs] re-attached to ${job.id} (${kind}) for ${outputPath}`);
      return job;
    }
  }

  // Forget settled jobs after a few hours; a caller polls every few seconds.
  for (const [id, old] of jobs) {
    if (old.finished_at && Date.now() - old.finished_at > JOB_KEEP_MS) jobs.delete(id);
  }

  const job: RenderJob = {
    id: `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    project_id: body?.project_id,
    output_path: outputPath,
    signature,
    status: 'running',
    progress: 0,
    started_at: Date.now(),
  };
  jobs.set(job.id, job);

  work((p) => {
    if (Number.isFinite(p)) job.progress = Math.max(job.progress, Math.min(1, p));
  })
    .then(() => {
      job.status = 'done';
      job.progress = 1;
    })
    .catch((err: any) => {
      console.error(`[jobs] ${job.id} failed:`, err);
      job.status = 'failed';
      job.error = err?.message || 'Render failed';
    })
    .finally(() => {
      job.finished_at = Date.now();
      job.render_seconds = Number(((job.finished_at - job.started_at) / 1000).toFixed(1));
    });

  return job;
}

app.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Unknown job — the render server has restarted since it was started.' });
  }
  return res.json(publicJob(job));
});

/**
 * POST /render
 * Body: { project_id, output_path, fps, width, height, shot_list }
 * With `async: true`: answers 202 with a job id at once; poll GET /jobs/:id.
 * Without it: renders synchronously and returns when the MP4 is written.
 */
app.post('/render', async (req, res) => {
  const { output_path, fps, width, height, shot_list, project_id } = req.body || {};

  if (!output_path || !shot_list) {
    return res.status(400).json({ success: false, error: 'output_path and shot_list are required' });
  }

  const shotList = shot_list as ShotList;
  if (!Array.isArray(shotList.scenes) || shotList.scenes.length === 0) {
    return res.status(400).json({ success: false, error: 'shot_list.scenes is empty' });
  }

  // Translate the container path to its host equivalent before writing.
  const hostOutputPath = toHostPath(output_path);

  if (req.body?.async) {
    fs.mkdirSync(path.dirname(hostOutputPath), { recursive: true });
    const job = startJob('render', req.body, hostOutputPath, async (onProgress) => {
      console.log(`[render] project=${project_id} scenes=${shotList.scenes.length} -> ${hostOutputPath} (async)`);
      let lastLogged = -1;
      await renderExplainer({
        shotList,
        outputPath: hostOutputPath,
        fps: Number(fps) || 30,
        width: Number(width) || 1920,
        height: Number(height) || 1080,
        onProgress: (p) => {
          onProgress(p);
          const pct = Math.floor(p * 100);
          if (pct % 20 === 0 && pct !== lastLogged) {
            lastLogged = pct;
            console.log(`[render] project=${project_id} ${pct}%`);
          }
        },
      });
      console.log(`[render] project=${project_id} done`);
    });
    return res.status(202).json({ ...publicJob(job), output_path });
  }

  try {
    // Ensure the output directory exists.
    fs.mkdirSync(path.dirname(hostOutputPath), { recursive: true });

    console.log(`[render] project=${project_id} scenes=${shotList.scenes.length} -> ${hostOutputPath}`);
    const start = Date.now();

    await renderExplainer({
      shotList,
      outputPath: hostOutputPath,
      fps: Number(fps) || 30,
      width: Number(width) || 1920,
      height: Number(height) || 1080,
      onProgress: (p) => {
        if (Math.round(p * 100) % 20 === 0) {
          console.log(`[render] project=${project_id} ${Math.round(p * 100)}%`);
        }
      },
    });

    const seconds = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[render] project=${project_id} done in ${seconds}s`);

    return res.json({ success: true, output_path, render_seconds: Number(seconds) });
  } catch (err: any) {
    console.error('[render] failed:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Render failed' });
  }
});

/**
 * POST /render-short
 * Body: { project_id, output_path, props }  — `props` is the ViralShort
 * contract (src/shorts/types.ts). Blocks until the MP4 is written.
 */
app.post('/render-short', async (req, res) => {
  const { output_path, props, project_id, clip } = req.body || {};
  if (!output_path || !props || !Array.isArray(props.segments) || props.segments.length === 0) {
    return res.status(400).json({ success: false, error: 'output_path and props.segments are required' });
  }
  const hostOutputPath = toHostPath(output_path);
  if (req.body?.async) {
    fs.mkdirSync(path.dirname(hostOutputPath), { recursive: true });
    const job = startJob('short', req.body, hostOutputPath, async (onProgress) => {
      console.log(`[short] project=${project_id} clip=${clip ?? '?'} -> ${hostOutputPath} (async)`);
      await renderViralShort({ props, outputPath: hostOutputPath, onProgress });
      console.log(`[short] project=${project_id} clip=${clip ?? '?'} done`);
    });
    return res.status(202).json({ ...publicJob(job), output_path });
  }
  try {
    fs.mkdirSync(path.dirname(hostOutputPath), { recursive: true });
    console.log(`[short] project=${project_id} clip=${clip ?? '?'} -> ${hostOutputPath}`);
    const start = Date.now();
    let lastLogged = -1;
    await renderViralShort({
      props,
      outputPath: hostOutputPath,
      onProgress: (p) => {
        const pct = Math.floor(p * 100);
        if (pct % 25 === 0 && pct !== lastLogged) {
          lastLogged = pct;
          console.log(`[short] project=${project_id} clip=${clip ?? '?'} ${pct}%`);
        }
      },
    });
    const seconds = Number(((Date.now() - start) / 1000).toFixed(1));
    console.log(`[short] project=${project_id} clip=${clip ?? '?'} done in ${seconds}s`);
    return res.json({ success: true, output_path, render_seconds: seconds });
  } catch (err: any) {
    console.error('[short] failed:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Short render failed' });
  }
});

/**
 * POST /preview
 * Body: { output_path, frame, fps, width, height, scale?, shot_list }
 * Freezes one frame of the real Explainer composition to a PNG so the
 * storyboard UI can show what a style change looks like without a render.
 */
app.post('/preview', async (req, res) => {
  const { output_path, shot_list, frame, fps, width, height, scale, project_id } = req.body || {};

  if (!output_path || !shot_list) {
    return res.status(400).json({ success: false, error: 'output_path and shot_list are required' });
  }

  const shotList = shot_list as ShotList;
  if (!Array.isArray(shotList.scenes) || shotList.scenes.length === 0) {
    return res.status(400).json({ success: false, error: 'shot_list.scenes is empty' });
  }

  const hostOutputPath = toHostPath(output_path);

  try {
    fs.mkdirSync(path.dirname(hostOutputPath), { recursive: true });
    const start = Date.now();

    await renderPreviewStill({
      shotList,
      outputPath: hostOutputPath,
      frame: Number(frame) || 0,
      fps: Number(fps) || 30,
      width: Number(width) || 1920,
      height: Number(height) || 1080,
      scale: scale ? Number(scale) : undefined,
    });

    const seconds = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[preview] project=${project_id} frame=${frame} in ${seconds}s -> ${hostOutputPath}`);

    return res.json({ success: true, output_path, render_seconds: Number(seconds) });
  } catch (err: any) {
    console.error('[preview] failed:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Preview render failed' });
  }
});

/**
 * POST /hero/compile
 * Body: { code } — a model-written hero scene (TSX).
 * Returns { ok, js?, errors[], warnings[] }: the guarded, compiled module, or
 * the reasons it was refused, phrased for the model's retry (hero/guard.ts).
 */
app.post('/hero/compile', (req, res) => {
  const { code } = req.body || {};
  try {
    return res.json(compileHero(String(code ?? '')));
  } catch (err: any) {
    return res.status(500).json({ ok: false, errors: [err?.message || 'compile crashed'], warnings: [] });
  }
});

/**
 * POST /hero/test
 * Body: { shot_list, frames[], output_dir, fps?, width?, height?, scale? }
 * Renders the given frames of a (one-scene) shot list carrying a hero and
 * reports what the hero runtime said. Stills land in output_dir as
 * hero_<frame>.png; paths come back in the caller's (container) form.
 */
app.post('/hero/test', async (req, res) => {
  const { shot_list, frames, output_dir, fps, width, height, scale } = req.body || {};
  if (!shot_list || !Array.isArray(frames) || !output_dir) {
    return res.status(400).json({ success: false, error: 'shot_list, frames and output_dir are required' });
  }
  const hostDir = toHostPath(String(output_dir));
  try {
    const t0 = Date.now();
    const result = await renderHeroTest({
      shotList: shot_list as ShotList,
      frames: frames.map(Number).slice(0, 10),
      outDir: hostDir,
      fps: Number(fps) || 30,
      width: Number(width) || 1920,
      height: Number(height) || 1080,
      scale: scale ? Number(scale) : undefined,
    });
    const base = String(output_dir).replace(/\/+$/, '');
    console.log(`[hero/test] ${result.stills.length} stills in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${result.heroErrors.length} hero error(s)`);
    return res.json({
      success: true,
      stills: result.stills.map((s) => ({ frame: s.frame, ms: s.ms, output_path: `${base}/${path.basename(s.file)}` })),
      hero_errors: result.heroErrors,
      browser_errors: result.browserErrors,
    });
  } catch (err: any) {
    console.error('[hero/test] failed:', err);
    return res.status(500).json({ success: false, error: err?.message || 'hero test failed' });
  }
});

/**
 * POST /hero/clip
 * Body: { shot_list, output_path, fps?, width?, height?, scale? }
 * Renders the (one-scene) shot list to a small silent MP4 — the hero's
 * stand-in on the dashboard Player, where hero code never runs.
 */
app.post('/hero/clip', async (req, res) => {
  const { shot_list, output_path, fps, width, height, scale } = req.body || {};
  if (!shot_list || !output_path) {
    return res.status(400).json({ success: false, error: 'shot_list and output_path are required' });
  }
  try {
    const t0 = Date.now();
    const result = await renderHeroClip({
      shotList: shot_list as ShotList,
      outputPath: toHostPath(String(output_path)),
      fps: Number(fps) || 30,
      width: Number(width) || 1920,
      height: Number(height) || 1080,
      scale: scale ? Number(scale) : undefined,
    });
    console.log(`[hero/clip] ${result.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return res.json({ success: true, output_path, frames: result.frames });
  } catch (err: any) {
    console.error('[hero/clip] failed:', err);
    return res.status(500).json({ success: false, error: err?.message || 'hero clip failed' });
  }
});

/**
 * POST /thumbnail
 * Body: { output_path, props: { title, kicker?, theme?, hero_url?, font_pack?, width?, height? } }
 * Renders the ExplainerThumbnail still to output_path (PNG). Fast: reuses the
 * warm bundle from the preceding video render.
 */
app.post('/thumbnail', async (req, res) => {
  const { output_path, props } = req.body || {};
  if (!output_path || !props || typeof props !== 'object') {
    return res.status(400).json({ success: false, error: 'output_path and props are required' });
  }

  const hostOutputPath = toHostPath(output_path);
  try {
    fs.mkdirSync(path.dirname(hostOutputPath), { recursive: true });
    await renderThumbnail(props as ThumbnailProps, hostOutputPath);
    console.log(`[thumbnail] -> ${hostOutputPath}`);
    return res.json({ success: true, output_path });
  } catch (err: any) {
    console.error('[thumbnail] failed:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Thumbnail render failed' });
  }
});

app.listen(PORT, () => {
  console.log(`remotion-render listening on http://localhost:${PORT}`);
});
