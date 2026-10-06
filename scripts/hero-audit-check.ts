import { compileHero } from '../src/hero/guard';
import { renderHeroTest } from '../src/render';
import os from 'os';
import path from 'path';

/**
 * hero-audit-check — the layout audit (src/hero/audit.tsx) must catch the
 * defects the hero bench's vision reviewer missed, and must NOT fire on a
 * clean scene. Renders real frames; no model, no money.
 *
 *   REMOTION_BUNDLE_DIR=<scratch dir> npx tsx scripts/hero-audit-check.ts
 *
 * (Point REMOTION_BUNDLE_DIR somewhere private so a running :3020 render
 * service's bundle is never rebuilt underneath it.)
 */

const BAD = `
import { AbsoluteFill } from 'remotion';
import { useHero } from 'hero-kit';
export default function Scene() {
  const { u, theme, font } = useHero();
  return (
    <AbsoluteFill style={{ background: theme.bg, color: theme.text, fontFamily: font.body }}>
      <div style={{ position: 'absolute', left: -120 * u, top: 80 * u, fontSize: 90 * u }}>When two strangers connect</div>
      <div style={{ position: 'absolute', left: 300 * u, top: 400 * u, fontSize: 12 * u }}>tiny footnote label</div>
      <div style={{ position: 'absolute', left: 700 * u, top: 600 * u, fontSize: 60 * u }}>First caption here</div>
      <div style={{ position: 'absolute', left: 720 * u, top: 610 * u, fontSize: 60 * u }}>Second caption here</div>
    </AbsoluteFill>
  );
}`;

const GOOD = `
import { AbsoluteFill } from 'remotion';
import { useHero } from 'hero-kit';
export default function Scene() {
  const { u, theme, font, safe } = useHero();
  return (
    <AbsoluteFill style={{ background: theme.bg, color: theme.text, fontFamily: font.body }}>
      <div style={{ position: 'absolute', left: safe.left, top: safe.top, fontSize: 70 * u }}>When two strangers connect</div>
      <div style={{ position: 'absolute', left: safe.left, top: safe.top + 160 * u, fontSize: 36 * u, color: theme.muted }}>a readable label</div>
      <div style={{ position: 'absolute', left: safe.left, top: 700 * u, fontSize: 30 * u, opacity: 0.2 }}>a fading caption on top of</div>
      <div style={{ position: 'absolute', left: safe.left, top: 705 * u, fontSize: 30 * u }}>the caption that replaces it</div>
    </AbsoluteFill>
  );
}`;

const shot = (js: string) => ({
  project_id: 'audit-check',
  aspect_ratio: '16:9',
  composition_mode: 'slides',
  sfx: { enabled: false },
  scenes: [
    {
      scene_id: 'a1',
      order: 1,
      duration_seconds: 4,
      narration: { text: 'An audit check.' },
      layout_template: 'single_focus',
      transition: 'none',
      mood: 'neutral',
      slots: { slot_main: { content_type: 'text_block', heading: 'fallback', bullets: [] } },
      hero: { js, audit: true },
    },
  ],
});

let pass = 0;
let fail = 0;
const ok = (what: string, cond: boolean, extra = ''): void => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '  ok   ' : '  FAIL '}${what}${!cond && extra ? `\n         ${extra}` : ''}`);
};

(async () => {
  const outDir = path.join(os.tmpdir(), 'hero-audit-check');
  for (const [name, src] of [['bad', BAD], ['good', GOOD]] as const) {
    const c = compileHero(src);
    if (!c.ok) {
      ok(`${name} compiles`, false, c.errors.join(' | '));
      continue;
    }
    const r = await renderHeroTest({ shotList: shot(c.js!) as never, frames: [60], outDir: path.join(outDir, name), scale: 0.5 });
    const audit = r.heroErrors.filter((e) => e.includes('[hero] audit:'));
    const all = audit.join('\n');
    if (name === 'bad') {
      ok('bad: text running off the left edge is reported', /off-frame: .*When two strangers.*left/.test(all), all);
      ok('bad: a 12×u label is reported as small', /small: .*tiny footnote/.test(all), all);
      ok('bad: two overlapping captions are reported', /overlap: .*caption/.test(all), all);
      ok('bad: nothing else went wrong', r.heroErrors.length === audit.length, r.heroErrors.join(' | '));
    } else {
      ok('good: a clean scene (incl. a caption fading out under another) reports nothing', audit.length === 0, all);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
