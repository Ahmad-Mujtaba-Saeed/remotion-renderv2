import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { renderExplainer, renderThumbnail } from './render';
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
// remotion-render/ is a sibling of viralforgebackend/, hence ../viralforgebackend.
const CONTAINER_STORAGE_PREFIX = (process.env.CONTAINER_STORAGE_PREFIX || '/var/www/storage').replace(/\/+$/, '');
const HOST_STORAGE_PREFIX =
  process.env.HOST_STORAGE_PREFIX || path.resolve(process.cwd(), '../viralforgebackend/storage');

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
  express.static(path.join(HOST_STORAGE_PREFIX, 'app', 'public'), {
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

/**
 * POST /render
 * Body: { project_id, output_path, fps, width, height, shot_list }
 * Renders synchronously and returns when the MP4 is written to output_path.
 * (Laravel calls this from a queued job, so a blocking request is fine.)
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
