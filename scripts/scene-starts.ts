// npx tsx scripts/scene-starts.ts payload.json -> "idx start_s dur_s layout" per scene (the renderer's own clock)
import fs from 'fs';
import { sceneStartFrames, totalFramesFor } from '../src/timing';
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const p = raw.payload ?? raw;
const fps = p.fps ?? 30;
const starts = sceneStartFrames(p.shot_list, fps);
p.shot_list.scenes.forEach((s: any, i: number) =>
  console.log(i + 1, (starts[i] / fps).toFixed(2), Number(s.duration_seconds).toFixed(2), s.layout_template ?? s.layout));
console.log('total', (totalFramesFor(p.shot_list, fps) / fps).toFixed(2));
