import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';

/** Renders audio-only for a shot list with blur ON and OFF; the two must be
 *  byte-identical, which is the proof that shutter ghosts stay silent. */
(async () => {
  const inFile = process.argv[2];
  const shotList = JSON.parse(fs.readFileSync(inFile, 'utf-8'));
  const serveUrl = await bundle({
    entryPoint: path.join(__dirname, '..', 'src', 'remotion', 'index.ts'),
    outDir: path.join(os.tmpdir(), 'remotion-probe-bundle'),
    publicDir: path.join(__dirname, '..', 'public'),
  });
  const hashes: string[] = [];
  for (const enabled of [true, false]) {
    const sl = { ...shotList, motion_blur: { enabled } };
    const inputProps = { shotList: sl, fps: 30, width: 1920, height: 1080 };
    const composition = await selectComposition({ serveUrl, id: 'Explainer', inputProps });
    const out = path.join('out', `_audio_${enabled ? 'on' : 'off'}.mp3`);
    await renderMedia({ composition, serveUrl, codec: 'mp3', outputLocation: out, inputProps });
    hashes.push(crypto.createHash('md5').update(fs.readFileSync(out)).digest('hex'));
    console.log(`blur=${enabled} -> ${hashes[hashes.length - 1]}`);
  }
  console.log(hashes[0] === hashes[1] ? 'OK: audio identical — ghosts are silent.' : 'FAIL: blur changed the audio.');
  process.exit(hashes[0] === hashes[1] ? 0 : 1);
})();
