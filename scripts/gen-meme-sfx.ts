/**
 * Meme-edit sound effects for the Long Video to Shorts editor.
 *
 *   npx tsx scripts/gen-meme-sfx.ts
 *
 * Writes 48kHz/16-bit stereo WAVs into public/sfx/meme/. Like gen-sfx.ts,
 * every sound is SYNTHESIZED here (no samples, no licences): pitched sine
 * drops with saturation for the booms, modulated noise for the scratch,
 * inharmonic partials for the bells. Deterministic — regenerating gives
 * byte-identical files. Keep names/durations in sync with
 * src/shorts/sfx.ts (MEME_SFX).
 */
import * as fs from 'fs';
import * as path from 'path';

const SR = 48000;
const OUT_DIR = path.join(__dirname, '..', 'public', 'sfx', 'meme');
fs.mkdirSync(OUT_DIR, { recursive: true });

type Buf = { l: Float64Array; r: Float64Array };
const buf = (s: number): Buf => ({ l: new Float64Array(Math.round(s * SR)), r: new Float64Array(Math.round(s * SR)) });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
};

const lowpass = () => {
  let y = 0;
  return (x: number, fc: number) => {
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    y += a * (x - y);
    return y;
  };
};

const bandpass = () => {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x: number, fc: number, q: number) => {
    const w0 = (2 * Math.PI * Math.min(fc, SR * 0.45)) / SR;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const y = (alpha / a0) * x - (alpha / a0) * x2 - ((-2 * Math.cos(w0)) / a0) * y1 - ((1 - alpha) / a0) * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
};

/** Mono sample function -> stereo buffer with a small constant width. */
const render = (seconds: number, fn: (t: number, i: number) => number, width = 0.0): Buf => {
  const b = buf(seconds);
  let d = 0;
  for (let i = 0; i < b.l.length; i++) {
    const s = fn(i / SR, i);
    b.l[i] = s * (1 - width) + d * width;
    b.r[i] = s;
    d = s;
  }
  return b;
};

const mix = (into: Buf, src: Buf, at: number, gain = 1) => {
  const off = Math.round(at * SR);
  for (let i = 0; i < src.l.length && off + i < into.l.length; i++) {
    into.l[off + i] += src.l[i] * gain;
    into.r[off + i] += src.r[i] * gain;
  }
};

const finish = (name: string, b: Buf, db: number) => {
  let peak = 1e-9;
  for (let i = 0; i < b.l.length; i++) peak = Math.max(peak, Math.abs(b.l[i]), Math.abs(b.r[i]));
  const g = Math.pow(10, db / 20) / peak;
  const n = Math.min(b.l.length, Math.round(0.004 * SR));
  for (let i = 0; i < b.l.length; i++) {
    let fade = 1;
    if (i < n) fade = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
    if (i > b.l.length - 1 - n) fade = 0.5 - 0.5 * Math.cos((Math.PI * (b.l.length - 1 - i)) / n);
    b.l[i] = (Math.tanh(b.l[i] * g * 1.05) / Math.tanh(1.05)) * fade;
    b.r[i] = (Math.tanh(b.r[i] * g * 1.05) / Math.tanh(1.05)) * fade;
  }
  const count = b.l.length;
  const out = Buffer.alloc(44 + count * 4);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + count * 4, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 4, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(count * 4, 40);
  for (let i = 0; i < count; i++) {
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.l[i])) * 32767), 44 + i * 4);
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.r[i])) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(path.join(OUT_DIR, `${name}.wav`), out);
  console.log(`  meme/${name}.wav  ${(count / SR).toFixed(2)}s`);
};

/** A pitched sine drop with phase accumulation (no clicks on sweeps). */
const sweep = (f0: number, f1: number, curve: number) => {
  let phase = 0;
  return (t: number, dur: number) => {
    const u = clamp01(t / dur);
    const f = f1 + (f0 - f1) * Math.exp(-u * curve);
    phase += (2 * Math.PI * f) / SR;
    return Math.sin(phase);
  };
};

// ---- boom: the big cinematic "vine boom"-style hit -------------------------
{
  const s = sweep(150, 46, 6);
  const noise = rng(3);
  const lp = lowpass();
  const b = render(1.5, (t) => {
    const body = s(t, 1.5);
    const env = Math.min(1, t / 0.004) * Math.exp(-t / 0.42);
    const crack = lp(noise() * 2 - 1, 1800) * Math.exp(-t / 0.03) * 1.6;
    const drive = Math.tanh((body * 2.6 + Math.sin(2 * body) * 0.5) * env);
    return drive + crack;
  }, 0.15);
  finish('boom', b, -3);
}

// ---- bass_drop: long 808 dive ---------------------------------------------
{
  const s = sweep(90, 28, 2.2);
  const b = render(1.8, (t) => Math.tanh(s(t, 1.8) * 1.8) * Math.min(1, t / 0.01) * Math.exp(-t / 0.9));
  finish('bass_drop', b, -3);
}

// ---- record_scratch: modulated noise dragged back and forth ---------------
{
  const noise = rng(7);
  const bp = bandpass();
  const b = render(0.62, (t) => {
    const wob = Math.sin(2 * Math.PI * 3.2 * t) ;
    const fc = 900 + 2600 * Math.abs(wob);
    const env = Math.sin(Math.PI * clamp01(t / 0.62)) ** 0.6;
    return bp(noise() * 2 - 1, fc, 2.2) * env * 3.5;
  }, 0.2);
  finish('record_scratch', b, -5);
}

// ---- ding: bright "correct" bell ------------------------------------------
{
  const parts = [
    { f: 1568, a: 1.0, d: 0.5 },
    { f: 3136 * 1.003, a: 0.35, d: 0.25 },
    { f: 4702, a: 0.18, d: 0.12 },
  ];
  const b = render(1.2, (t) =>
    parts.reduce((acc, p) => acc + Math.sin(2 * Math.PI * p.f * t) * p.a * Math.exp(-t / p.d), 0) * Math.min(1, t / 0.002)
  , 0.3);
  finish('ding', b, -8);
}

// ---- pop: cartoon mouth pop ------------------------------------------------
{
  const s = sweep(380, 1250, -5);
  const b = render(0.16, (t) => s(t, 0.16) * Math.min(1, t / 0.002) * Math.exp(-t / 0.035));
  finish('pop', b, -6);
}

// ---- boing: spring with vibrato and a falling pitch ------------------------
{
  let phase = 0;
  const b = render(0.8, (t) => {
    const f = 220 * Math.exp(-t * 1.2) + 90 + 40 * Math.sin(2 * Math.PI * 14 * t);
    phase += (2 * Math.PI * f) / SR;
    return (Math.sin(phase) + 0.3 * Math.sin(2 * phase)) * Math.min(1, t / 0.005) * Math.exp(-t / 0.35);
  });
  finish('boing', b, -6);
}

// ---- glitch: bitcrushed square bursts --------------------------------------
{
  const r = rng(11);
  let hold = 0;
  let held = 0;
  const b = render(0.55, (t, i) => {
    const gate = Math.sin(2 * Math.PI * 17 * t) > -0.2 ? 1 : 0;
    const f = [180, 720, 95, 1440, 360][Math.floor(t * 22) % 5];
    const sq = Math.sign(Math.sin(2 * Math.PI * f * t));
    if (hold-- <= 0) {
      hold = 6 + Math.floor(r() * 30);
      held = sq * 0.7 + (r() * 2 - 1) * 0.5;
    }
    void i;
    return Math.round(held * 5) / 5 * gate * Math.exp(-t / 0.4);
  }, 0.4);
  finish('glitch', b, -9);
}

// ---- whoosh_fast: a quick pass-by -------------------------------------------
{
  const n = rng(13);
  const bp = bandpass();
  const b = render(0.38, (t) => {
    const u = t / 0.38;
    const env = Math.sin(Math.PI * u) ** 2;
    return bp(n() * 2 - 1, 400 + 5200 * u * u, 0.9) * env * 3;
  }, 0.5);
  finish('whoosh_fast', b, -7);
}

// ---- shutter: camera click-clack -------------------------------------------
{
  const n = rng(17);
  const bp = bandpass();
  const click = (t: number, at: number) => (t >= at ? Math.exp(-(t - at) / 0.008) : 0);
  const b = render(0.26, (t) => bp(n() * 2 - 1, 3200, 1.4) * (click(t, 0) + 0.7 * click(t, 0.09)) * 4);
  finish('shutter', b, -8);
}

// ---- heartbeat: lub-dub -----------------------------------------------------
{
  const thump = (t: number, at: number, f: number) =>
    t >= at ? Math.sin(2 * Math.PI * f * (t - at)) * Math.exp(-(t - at) / 0.07) : 0;
  const b = render(0.95, (t) => Math.tanh((thump(t, 0.02, 55) + 0.8 * thump(t, 0.26, 48)) * 2));
  finish('heartbeat', b, -4);
}

// ---- riser: tension builder -------------------------------------------------
{
  const n = rng(19);
  const bp = bandpass();
  let phase = 0;
  const b = render(1.4, (t) => {
    const u = t / 1.4;
    phase += (2 * Math.PI * (120 + 900 * u * u)) / SR;
    const tone = Math.sin(phase) * 0.35;
    const air = bp(n() * 2 - 1, 500 + 6000 * u, 1.2) * 2.2;
    return (tone + air) * u ** 1.6 * (u > 0.97 ? (1 - u) / 0.03 : 1);
  }, 0.4);
  finish('riser', b, -7);
}

// ---- wrong: game-show buzzer -----------------------------------------------
{
  const b = render(0.75, (t) => {
    const on = t < 0.28 || (t > 0.36 && t < 0.72) ? 1 : 0;
    const sq = Math.sign(Math.sin(2 * Math.PI * 146 * t)) * 0.6 + Math.sign(Math.sin(2 * Math.PI * 151 * t)) * 0.4;
    return sq * on * 0.8;
  });
  const lp = lowpass();
  for (let i = 0; i < b.l.length; i++) {
    b.l[i] = lp(b.l[i], 2400);
    b.r[i] = b.l[i];
  }
  finish('wrong', b, -10);
}

// ---- swipe: upward swoosh ---------------------------------------------------
{
  const n = rng(23);
  const bp = bandpass();
  const b = render(0.3, (t) => {
    const u = t / 0.3;
    return bp(n() * 2 - 1, 1200 + 7000 * u, 1.5) * Math.sin(Math.PI * u) * 3.2;
  }, 0.6);
  finish('swipe', b, -8);
}

// ---- tada: ascending major arpeggio -----------------------------------------
{
  const b = buf(1.1);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => {
    const note = render(0.9, (t) =>
      (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * Math.min(1, t / 0.01) * Math.exp(-t / 0.3)
    );
    mix(b, note, k * 0.07, 0.8);
  });
  finish('tada', b, -8);
}

// ---- snare: dry crack ---------------------------------------------------------
{
  const n = rng(29);
  const bp = bandpass();
  const b = render(0.4, (t) => {
    const tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.04);
    return tone * 0.8 + bp(n() * 2 - 1, 2400, 0.8) * Math.exp(-t / 0.09) * 3;
  }, 0.2);
  finish('snare', b, -6);
}

// ---- cash: ka-ching -----------------------------------------------------------
{
  const n = rng(31);
  const b = buf(0.9);
  mix(b, render(0.08, (t) => (n() * 2 - 1) * Math.exp(-t / 0.01)), 0, 0.6);
  mix(b, render(0.8, (t) =>
    [2637, 3520, 5274].reduce((a, f, k) => a + Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.25 - k * 0.05)), 0)
  , 0.3), 0.07, 0.7);
  finish('cash', b, -9);
}

console.log('Done.');
