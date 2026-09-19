/**
 * Renders a ViralShort from a props JSON file (or a built-in synthetic edit)
 * so the composition can be checked without the Laravel pipeline.
 *
 *   npx tsx scripts/short-render-check.ts <out.mp4> [props.json] [--stills]
 *
 * The built-in props play /storage/gameplay/vid1.mp4 through the running
 * render server (http://localhost:3020), so that server must be up.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const synthetic = () => {
  const words = 'this is the moment everything changed and nobody saw it coming WAIT what just happened here'
    .split(' ')
    .map((text, i) => ({ text, start: 0.3 + i * 0.42, end: 0.3 + i * 0.42 + 0.36, key: text === 'WAIT' || text === 'changed' }));
  return {
    width: 1080,
    height: 1920,
    fps: 30,
    video: { url: 'http://localhost:3020/storage/gameplay/vid1.mp4', width: 1280, height: 720, duration: 488 },
    segments: [
      { src: 20, dur: 4, rate: 1 },
      { src: 24, dur: 1.2, rate: 1, freeze: true },
      { src: 24, dur: 2, rate: 0.5 },
      { src: 25, dur: 4.8, rate: 1 },
    ],
    layout: {
      kind: 'fill_follow',
      background: 'black',
      panels: [
        {
          dest: [0, 0, 1, 1],
          source: 'main',
          primary: true,
          track: {
            width: 0.3164,
            keys: [
              { t: 20, cx: 0.3, cy: 0.5 },
              { t: 24, cx: 0.7, cy: 0.5 },
              { t: 26, cx: 0.5, cy: 0.5, jump: true },
            ],
          },
        },
      ],
    },
    style: {
      id: 'meme_chaos',
      name: 'Meme chaos',
      caption: {
        font: 'impact', weight: 900, size: 104, uppercase: true, wordsPerLine: 2, color: '#ffffff',
        highlight: '#ffe600', keyColor: '#ff3b3b', highlightMode: 'color', stroke: 12, strokeColor: '#000000',
        shadow: true, animation: 'pop', y: 0.66,
      },
      hook: { style: 'banner', bg: '#ffe600', color: '#111111', font: 'bricolage', y: 0.16 },
      grade: { filter: 'contrast(1.08) saturate(1.2)', vignette: 0.35, tint: null },
      progress: { position: 'bottom', color: '#ffe600', height: 10 },
      sfxVolume: 0.9,
      accent: '#ffe600',
      drift: 1.05,
      stickerFont: 'impact',
    },
    words,
    captionsEnabled: true,
    hook: { text: 'He did NOT see this coming', emoji: '😳', until: 2.4 },
    events: [
      { type: 'zoom', start: 3.0, end: 4.0, scale: 1.35 },
      { type: 'shake', start: 4.0, end: 4.6, intensity: 1 },
      { type: 'flash', start: 4.0 },
      { type: 'sfx', start: 4.0, name: 'boom' },
      { type: 'sfx', start: 4.0, name: 'record_scratch', volume: 0.8 },
      { type: 'bw', start: 4.0, end: 5.2 },
      { type: 'sticker', start: 4.1, end: 5.2, text: 'WAIT WHAT', x: 0.5, y: 0.38, variant: 'impact' },
      { type: 'emoji', start: 5.3, end: 7.0, emoji: '💀', x: 0.78, y: 0.3 },
      { type: 'sfx', start: 5.3, name: 'pop' },
      { type: 'glitch', start: 8.2, end: 8.6 },
      { type: 'sfx', start: 8.2, name: 'glitch' },
      { type: 'sticker', start: 9.0, end: 11.0, text: 'no way bro', x: 0.5, y: 0.25, variant: 'bubble', rotate: 3 },
    ],
    music: null,
    sourceVolume: 1,
  };
};

(async () => {
  const [, , outArg, propsArg, ...flags] = process.argv;
  const out = path.resolve(outArg ?? 'out/short-check.mp4');
  const props = propsArg && !propsArg.startsWith('--') ? JSON.parse(fs.readFileSync(propsArg, 'utf-8')) : synthetic();
  const stills = [propsArg, ...flags].includes('--stills');
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, '..', 'src', 'remotion', 'index.ts'),
    outDir: path.join(os.tmpdir(), 'remotion-short-check-bundle'),
    publicDir: path.join(__dirname, '..', 'public'),
  });
  const composition = await selectComposition({ serveUrl, id: 'ViralShort', inputProps: props });
  console.log(`composition ${composition.width}x${composition.height} ${composition.durationInFrames}f`);

  if (stills) {
    const base = out.replace(/\.mp4$/, '');
    const at = [propsArg, ...flags].find((f) => f?.startsWith('--at='));
    const times = at ? at.slice(5).split(',').map(Number) : [0.5, 3.6, 4.3, 5.8, 8.4, 10];
    const frames = times.map((s) => Math.min(composition.durationInFrames - 1, Math.round(s * composition.fps)));
    for (const frame of frames) {
      await renderStill({ serveUrl, composition, inputProps: props, frame, output: `${base}_f${frame}.png`, imageFormat: 'png', scale: 0.5 });
      console.log(`still ${frame}`);
    }
    process.exit(0);
  }

  const started = Date.now();
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation: out,
    inputProps: props,
    imageFormat: 'jpeg',
    jpegQuality: 92,
    crf: 19,
    x264Preset: 'fast',
    chromiumOptions: { gl: 'angle' },
    onBrowserLog: (l) => (l.type === 'error' || l.type === 'warning') && console.log(`[browser:${l.type}] ${l.text}`),
  });
  console.log(`rendered ${out} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  process.exit(0);
})();
