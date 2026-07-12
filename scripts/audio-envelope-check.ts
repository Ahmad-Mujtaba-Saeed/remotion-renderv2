import { narrationWindows } from '../src/timing';
import { musicVolumeCurve } from '../src/ExplainerVideo';
import { Scene } from '../src/types';

/**
 * Ducking-envelope audit (copilot.md §6.2): drives the word-aware speech
 * windows and the sidechain curve through their contract —
 *   npx tsx scripts/audio-envelope-check.ts
 *  - words with gaps <1.2s merge into one window, real pauses split;
 *  - fast attack to the 0.35x floor while speaking;
 *  - slower release back to full bed in a real pause;
 *  - outro swell lifts ~15%;
 *  - the final frame is silent.
 */
const fps = 30;
let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) fails++;
};

// One 12s scene: two phrases split by a 2s pause; tiny word gaps inside.
const scene: Scene = {
  scene_id: 's1',
  order: 1,
  duration_seconds: 12,
  layout_template: 'single_focus',
  slots: {},
  narration_audio_url: 'x.wav',
  narration_words: [
    { word: 'the', start: 0.2, end: 0.35 },
    { word: 'map', start: 0.4, end: 0.7 },
    { word: 'is', start: 0.75, end: 0.9 },
    { word: 'huge', start: 1.0, end: 1.5 },
    // -- 2s real pause --
    { word: 'and', start: 3.5, end: 3.7 },
    { word: 'alive', start: 3.8, end: 4.4 },
  ],
};

const windows = narrationWindows([scene], fps, 'slides');
check('word gaps <1.2s merge, real pause splits', windows.length === 2, `windows=${windows.length}`);
check(
  'first window spans first phrase',
  windows[0].start === Math.round(0.2 * fps) && windows[0].end === Math.round(1.5 * fps)
);

const total = 12 * fps;
const base = 0.09;
const curve = musicVolumeCurve(base, windows, fps, total);

// Mid-speech (frame 30 = 1.0s, inside phrase 1, past the 5f attack):
const midSpeech = curve(30);
check('speech ducks to the 0.35x floor', Math.abs(midSpeech - base * 0.35) < 0.002, midSpeech.toFixed(4));

// Mid-pause (2.5s = frame 75; release is 12f after speech ends at 1.5s=f45):
const midPause = curve(75);
check('bed fully recovers in a >=1.2s pause', Math.abs(midPause - base) < 0.002, midPause.toFixed(4));

// Release is slower than attack: 3 frames after speech end vs 3 frames after attack start.
const attackk = 1 - curve(Math.round(0.2 * fps) + 1) / base; // 4f into the attack (lead=3f)
const releasek = 1 - curve(48) / base; // 3f into the release
check('attack bites faster than release lets go', attackk > releasek, `attack=${attackk.toFixed(2)} release=${releasek.toFixed(2)}`);

// Outro swell: quiet zone with a swell window at the tail.
const swellCurve = musicVolumeCurve(base, [], fps, 40 * fps, { start: 36 * fps, end: 40 * fps });
const inSwell = swellCurve(37 * fps);
check('outro swell lifts the bed ~15%', Math.abs(inSwell - base * 1.15) < 0.002, inSwell.toFixed(4));

// Final frame is silence (2s fade ends exactly at the last frame).
check('last frame is silent', swellCurve(40 * fps - 1) < 0.0005, swellCurve(40 * fps - 1).toFixed(5));

// Fallback: a scene without word timings still ducks (whole-scene window).
const plain: Scene = { ...scene, narration_words: undefined };
const fallback = narrationWindows([plain], fps, 'slides');
check('no-timings scene falls back to scene window', fallback.length === 1 && fallback[0].start === 0);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
