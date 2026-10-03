// npx tsx scripts/subset-fixture.ts payload.json out.json 5,9,44 [--at=0.85]
// -> a shot list holding only those scenes (1-based) + the frame (30fps) at `at` of each, for probe-stills.
import fs from 'fs';
import { sceneStartFrames } from '../src/timing';
const [inF, outF, list] = process.argv.slice(2);
const at = Number((process.argv.find((a) => a.startsWith('--at=')) ?? '--at=0.85').slice(5));
const raw = JSON.parse(fs.readFileSync(inF, 'utf8')); const p = raw.payload ?? raw;
const pick = list.split(',').map((n) => Number(n) - 1);
const sl = { ...p.shot_list, scenes: pick.map((i) => p.shot_list.scenes[i]) };
fs.writeFileSync(outF, JSON.stringify(sl));
const st = sceneStartFrames(sl, 30);
console.log(sl.scenes.map((s: any, i: number) => st[i] + Math.round(Number(s.duration_seconds) * 30 * at)).join(' '));
