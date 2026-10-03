// npx tsx scripts/beat-align-check.ts payload.json -> per text scene: bullet, old (word-share) vs new (content) landing time
import fs from 'fs';
import { beatFrames } from '../src/motion/narrationBeats';
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const p = raw.payload ?? raw; const fps = 30;
let hit = 0, tot = 0;
p.shot_list.scenes.forEach((s: any, i: number) => {
  const words = s.narration_words; if (!words?.length) return;
  for (const slot of Object.values<any>(s.slots ?? {})) {
    const b: string[] = slot?.bullets ?? []; if (b.length < 2) continue;
    const d = Math.round(Number(s.duration_seconds) * fps);
    const o = { first: Math.round(d * 0.12), last: Math.round(d * 0.92), minGap: 10 };
    const old = beatFrames(words, b.length, fps, o), neu = beatFrames(words, b.length, fps, { ...o, texts: b });
    if (i < 12 || process.argv[3]) {
      console.log(`#${i + 1} ${s.narration?.text?.slice(0, 150) ?? ''}`);
      b.forEach((x, k) => console.log(`   ${(old[k] / fps).toFixed(1)}s -> ${(neu[k] / fps).toFixed(1)}s  ${x}`));
    }
    b.forEach((_, k) => { tot++; if (old[k] !== neu[k]) hit++; });
  }
});
console.log('moved', hit, 'of', tot);
