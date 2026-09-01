import fs from 'fs';
import { buildCamera } from '../src/canvas/camera';
import { normalizePlan } from '../src/canvas/autoLayout';
import { CanvasPlan, Scene } from '../src/types';
import { camDisplacement, cameraTrail } from '../src/canvas/motionBlur';

/**
 * Camera smoothness audit: samples the virtual camera at every frame of a
 * shot list and reports the largest frame-to-frame jumps in viewport space.
 * A "shake" (like the old drift-hold snap: ~50px at arrival) shows up as a
 * single-frame spike far above its neighbours; a smooth track's worst jump
 * stays within normal flight speed and, critically, the travel→hold boundary
 * frames show no spike at all.
 *
 * Usage: npx tsx scripts/camera-continuity.ts <shotlist.json>
 */
(() => {
  const [, , inFile] = process.argv;
  if (!inFile) {
    console.error('Usage: tsx scripts/camera-continuity.ts <shotlist.json>');
    process.exit(1);
  }

  const shotList = JSON.parse(fs.readFileSync(inFile, 'utf-8'));
  const scenes: Scene[] = [...(shotList.scenes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const plan: CanvasPlan = normalizePlan(shotList.canvas, scenes, shotList.aspect_ratio);
  const fps = 30;
  const vw = 1920;
  const vh = 1080;

  const camera = buildCamera(plan, scenes, fps, vw, vh);

  // Screen-space displacement between consecutive frames: how far the world
  // point at the viewport centre moves, plus zoom change expressed as pixel
  // drift at the viewport edge, plus roll as pixel drift at the edge. The
  // metric lives in motionBlur.ts because the blur gate reads the SAME number
  // — one definition of "fast" for the audit and for the shutter.
  const jump = (f: number): number => camDisplacement(camera.at(f), camera.at(f + 1), vw, vh);

  const jumps: { f: number; v: number }[] = [];
  for (let f = 0; f < camera.totalFrames - 1; f++) {
    jumps.push({ f, v: jump(f) });
  }

  // Worst 10 single-frame movements anywhere.
  const worst = [...jumps].sort((x, y) => y.v - x.v).slice(0, 10);
  console.log('Worst single-frame movements (screen px):');
  for (const w of worst) {
    console.log(`  frame ${String(w.f).padStart(5)}  ${w.v.toFixed(2)}px`);
  }

  // Spike detection: a frame whose movement dwarfs BOTH neighbours is a snap,
  // not speed. (Flights legitimately move fast; discontinuities move fast for
  // exactly one frame.)
  let failures = 0;
  for (let k = 1; k < jumps.length - 1; k++) {
    const v = jumps[k].v;
    const nb = Math.max(jumps[k - 1].v, jumps[k + 1].v);
    if (v > 8 && v > nb * 3.5) {
      console.log(`  SPIKE at frame ${jumps[k].f}: ${v.toFixed(2)}px (neighbours ${nb.toFixed(2)}px)`);
      failures++;
    }
  }

  // Explicit boundary audit: the frames straddling each travel→hold handoff.
  console.log('\nTravel→hold boundary movement (should be ≈ neighbouring frames):');
  camera.windows.forEach((w, i) => {
    if (w.travel <= 0) return;
    const b = w.start + w.travel;
    const before = jump(Math.max(0, b - 2));
    const at = jump(b - 1);
    const after = jump(b);
    console.log(
      `  scene ${i + 1}: ${before.toFixed(2)} | ${at.toFixed(2)} | ${after.toFixed(2)} px`
    );
    if (at > 8 && at > Math.max(before, after) * 3.5) failures++;
  });

  // Motion-blur coverage (§2.10): which frames the shutter actually fires on,
  // and how many extra world copies they cost. This is the render-time bill
  // for the smoothness, printed rather than guessed at.
  let blurred = 0;
  let ghostFrames = 0;
  let maxGhosts = 0;
  for (let f = 0; f < camera.totalFrames; f++) {
    const trail = cameraTrail(camera.at, f, vw, vh);
    if (!trail.length) continue;
    blurred++;
    const g = trail.length - 1;
    ghostFrames += g;
    if (g > maxGhosts) maxGhosts = g;
  }
  const pct = (100 * blurred) / Math.max(1, camera.totalFrames);
  console.log(
    `
Motion blur: ${blurred}/${camera.totalFrames} frames (${pct.toFixed(1)}%), ` +
      `${ghostFrames} ghost copies, max ${maxGhosts} ghosts on a frame ` +
      `(+${((100 * ghostFrames) / Math.max(1, camera.totalFrames)).toFixed(1)}% world renders).`
  );

  if (failures > 0) {
    console.error(`\nFAIL: ${failures} discontinuity spike(s) detected.`);
    process.exit(1);
  }
  console.log('\nOK: no discontinuity spikes — camera track is smooth.');
  process.exit(0);
})();
