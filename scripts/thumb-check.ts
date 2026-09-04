/**
 * thumb-check — render the thumbnail layouts to PNGs so the design can be
 * LOOKED at rather than reasoned about. `npx tsx scripts/thumb-check.ts`.
 */
import path from 'path';
import fs from 'fs';
import { renderThumbnail } from '../src/render';
import type { ThumbnailProps } from '../src/ThumbnailComp';

const THEME = {
  name: 'ember', label: 'Chalk & Ember',
  bg_from: '#151A2E', bg_to: '#0B0E1A',
  accent: '#E8492B', accent2: '#F6A14A',
  text: '#FFFDF8', muted: '#9AA0B5', panel: '#1D2340',
};

const cases: Array<{ name: string; props: ThumbnailProps }> = [
  { name: 'subject_right', props: { title: "WHY PLANES DON'T FALL", emphasis: "DON'T", badge: 'EXPLAINED', layout: 'subject_right', theme: THEME as never } },
  { name: 'stat_hero', props: { title: 'THE REAL NUMBER', emphasis: 'REAL', stat: '40,000 FT', badge: 'IN 2 MIN', layout: 'stat_hero', theme: THEME as never } },
  { name: 'question', props: { title: 'IS IT REALLY RANDOM', emphasis: 'RANDOM', badge: 'MYTH', layout: 'question', theme: THEME as never } },
  { name: 'versus', props: { title: 'ONE OF THESE IS WRONG', emphasis: 'WRONG', layout: 'versus', vs_left: 'RAM', vs_right: 'SSD', theme: THEME as never } },
  { name: 'no_hook_long', props: { title: 'UNDERSTANDING PHOTOSYNTHESIS PROPERLY', emphasis: 'PHOTOSYNTHESIS', layout: 'subject_right', theme: THEME as never } },
  { name: 'equation', props: { title: 'SOLVE IT IN 3 STEPS', emphasis: '3', equation: 'x^2 + 5x - 24 = 0', theme: THEME as never } },
  { name: 'portrait', props: { title: "WHY PLANES DON'T FALL", emphasis: "DON'T", badge: 'EXPLAINED', layout: 'subject_right', theme: THEME as never, width: 1080, height: 1920 } },
];

(async () => {
  const out = path.resolve(__dirname, '../out/thumb-check');
  fs.mkdirSync(out, { recursive: true });
  for (const c of cases) {
    const w = c.props.width ?? 1280;
    const h = c.props.height ?? 720;
    const file = path.join(out, `${c.name}.png`);
    process.stdout.write(`rendering ${c.name} (${w}x${h})… `);
    await renderThumbnail({ ...c.props, width: w, height: h }, file);
    console.log('ok');
  }
  console.log(`\nwrote ${cases.length} stills to ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
