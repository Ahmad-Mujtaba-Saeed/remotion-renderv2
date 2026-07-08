/**
 * Procedural SFX generator for the explainer template's sound design.
 *
 *   npx tsx scripts/gen-sfx.ts
 *
 * Writes 48kHz/16-bit stereo WAVs into public/sfx/ (bundled by Remotion and
 * addressed via staticFile). Everything is synthesized from first principles —
 * pink noise through swept band-pass filters for the whooshes, exponential
 * sine drops for the UI pops, layered noise+sub hits for the impacts — so the
 * library is deterministic, license-free and regenerable. Keep the durations
 * here in sync with the manifest in src/sfx.ts.
 */
import * as fs from 'fs';
import * as path from 'path';

const SR = 48000;
const OUT_DIR = path.join(__dirname, '..', 'public', 'sfx');

// ---------------------------------------------------------------------------
// Small DSP toolkit
// ---------------------------------------------------------------------------

/** Deterministic PRNG so regenerating produces byte-identical files. */
const makeRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
};

/** Paul Kellet pink-noise filter over a white source in [-1, 1]. */
const makePink = (rng: () => number) => {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const white = rng() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    return pink * 0.11;
  };
};

/** RBJ band-pass biquad whose center frequency can sweep per sample. */
const makeBandpass = () => {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x: number, fc: number, q: number): number => {
    const w0 = (2 * Math.PI * Math.min(fc, SR * 0.45)) / SR;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const b2 = -alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0;
    const a2 = (1 - alpha) / a0;
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
};

/** One-pole low-pass (gentle darkening). */
const makeLowpass = () => {
  let y = 0;
  return (x: number, fc: number): number => {
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    y += a * (x - y);
    return y;
  };
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Smooth asymmetric swell: 0→1→0 with the peak at `peak` (0..1). */
const swell = (t: number, peak: number): number => {
  const p = clamp01(peak);
  const u = t < p ? t / Math.max(1e-6, p) : 1 - (t - p) / Math.max(1e-6, 1 - p);
  const s = clamp01(u);
  return s * s * (3 - 2 * s);
};

/** Equal-power stereo placement, pan in [-1, 1]. */
const panLR = (pan: number): [number, number] => {
  const a = ((clamp01((pan + 1) / 2)) * Math.PI) / 2;
  return [Math.cos(a), Math.sin(a)];
};

interface StereoBuf {
  l: Float64Array;
  r: Float64Array;
}

const buf = (seconds: number): StereoBuf => {
  const n = Math.round(seconds * SR);
  return { l: new Float64Array(n), r: new Float64Array(n) };
};

/** Peak-normalize to `db` dBFS and soft-clip stragglers. */
const normalize = (b: StereoBuf, db: number) => {
  let peak = 1e-9;
  for (let i = 0; i < b.l.length; i++) {
    peak = Math.max(peak, Math.abs(b.l[i]), Math.abs(b.r[i]));
  }
  const g = Math.pow(10, db / 20) / peak;
  for (let i = 0; i < b.l.length; i++) {
    b.l[i] = Math.tanh(b.l[i] * g * 1.05) / Math.tanh(1.05);
    b.r[i] = Math.tanh(b.r[i] * g * 1.05) / Math.tanh(1.05);
  }
};

/** Short raised-cosine fade at both ends so no file ever clicks. */
const deClick = (b: StereoBuf, ms = 6) => {
  const n = Math.min(b.l.length, Math.round((ms / 1000) * SR));
  for (let i = 0; i < n; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
    b.l[i] *= g;
    b.r[i] *= g;
    b.l[b.l.length - 1 - i] *= g;
    b.r[b.r.length - 1 - i] *= g;
  }
};

const writeWav = (name: string, b: StereoBuf) => {
  const n = b.l.length;
  const bytesPerFrame = 4; // 16-bit stereo
  const dataSize = n * bytesPerFrame;
  const out = Buffer.alloc(44 + dataSize);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(2, 22); // stereo
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * bytesPerFrame, 28);
  out.writeUInt16LE(bytesPerFrame, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.l[i])) * 32767), 44 + i * 4);
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b.r[i])) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(path.join(OUT_DIR, name), out);
  console.log(`  ${name}  ${(n / SR).toFixed(2)}s  ${(out.length / 1024).toFixed(0)}KB`);
};

// ---------------------------------------------------------------------------
// The sounds
// ---------------------------------------------------------------------------

/**
 * A filtered-noise whoosh. `fcOf(t)` sweeps the band-pass center, the
 * amplitude swells to `peak`, and the image pans across the field so flights
 * feel like they pass BY the listener, not through a mono speaker.
 */
const whoosh = (opts: {
  seconds: number;
  seed: number;
  fcOf: (t: number) => number;
  q?: number;
  peak?: number;
  panFrom?: number;
  panTo?: number;
  dark?: number; // optional low-pass ceiling (Hz), 0 = off
}): StereoBuf => {
  const b = buf(opts.seconds);
  const pink = makePink(makeRng(opts.seed));
  const bpL = makeBandpass();
  const bpR = makeBandpass();
  const lpL = makeLowpass();
  const lpR = makeLowpass();
  const n = b.l.length;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const fc = opts.fcOf(t);
    const env = swell(t, opts.peak ?? 0.5);
    const src = pink() * 3.2;
    // Slightly detuned filters per channel widen the image.
    let l = bpL(src, fc * 0.985, opts.q ?? 1.0);
    let r = bpR(src, fc * 1.015, opts.q ?? 1.0);
    if (opts.dark) {
      l = lpL(l, opts.dark);
      r = lpR(r, opts.dark);
    }
    const pan = (opts.panFrom ?? 0) + ((opts.panTo ?? 0) - (opts.panFrom ?? 0)) * t;
    const [gl, gr] = panLR(pan);
    b.l[i] += l * env * gl * 2;
    b.r[i] += r * env * gr * 2;
  }
  return b;
};

/** Mix `src` into `dst` starting at `atSeconds`, scaled by `gain`. */
const mixInto = (dst: StereoBuf, src: StereoBuf, atSeconds: number, gain = 1) => {
  const off = Math.round(atSeconds * SR);
  for (let i = 0; i < src.l.length && off + i < dst.l.length; i++) {
    dst.l[off + i] += src.l[i] * gain;
    dst.r[off + i] += src.r[i] * gain;
  }
};

/** An exponentially decaying sine with a pitch drop — the classic UI pop. */
const sinePop = (opts: {
  seconds: number;
  f0: number;
  f1: number;
  tau: number;
  seed: number;
  harmonic?: number;
}): StereoBuf => {
  const b = buf(opts.seconds);
  const rng = makeRng(opts.seed);
  let phase = 0;
  const n = b.l.length;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = i / n;
    const f = opts.f0 + (opts.f1 - opts.f0) * clamp01(u * 3); // fast drop
    phase += (2 * Math.PI * f) / SR;
    const env = Math.exp(-t / opts.tau);
    let s = Math.sin(phase) * env;
    s += Math.sin(phase * 2) * env * (opts.harmonic ?? 0.22);
    // 5ms of noise transient gives the pop its consonant.
    if (t < 0.005) s += (rng() * 2 - 1) * (1 - t / 0.005) * 0.5;
    b.l[i] = s;
    b.r[i] = s;
  }
  return b;
};

/** A low impact hit: sub sine drop + band-passed noise burst. */
const impact = (opts: { seconds: number; seed: number; sub0: number; sub1: number; tau: number; burst: number }): StereoBuf => {
  const b = buf(opts.seconds);
  const rng = makeRng(opts.seed);
  const bp = makeBandpass();
  let phase = 0;
  const n = b.l.length;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = i / n;
    const f = opts.sub0 + (opts.sub1 - opts.sub0) * clamp01(u * 2.5);
    phase += (2 * Math.PI * f) / SR;
    const body = Math.sin(phase) * Math.exp(-t / opts.tau);
    const noise = bp((rng() * 2 - 1) * 2.4, 1900, 0.8) * Math.exp(-t / opts.burst);
    const s = body * 1.0 + noise * 0.65;
    b.l[i] = s;
    b.r[i] = s;
  }
  return b;
};

/** Airy glass shimmer: detuned high partials with a soft swish underneath. */
const shimmer = (opts: { seconds: number; seed: number }): StereoBuf => {
  const b = buf(opts.seconds);
  const rng = makeRng(opts.seed);
  const bp = makeBandpass();
  const partials = [
    { f: 1174.66, a: 1.0, d: 0.32 }, // D6
    { f: 1567.98, a: 0.75, d: 0.4 }, // G6
    { f: 2349.32, a: 0.5, d: 0.5 }, // D7
    { f: 3135.96, a: 0.28, d: 0.42 }, // G7
  ];
  const phases = partials.map(() => rng() * Math.PI * 2);
  const n = b.l.length;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = i / n;
    let s = 0;
    partials.forEach((p, k) => {
      const attack = clamp01(t / 0.03);
      // ~1Hz detune beating keeps the chime alive.
      s += Math.sin(phases[k] + 2 * Math.PI * (p.f + Math.sin(k) * 1.2) * t) * p.a * attack * Math.exp(-t / p.d);
    });
    const air = bp((rng() * 2 - 1) * 2, 5200, 0.7) * swell(u, 0.18) * 0.5;
    const side = Math.sin(2 * Math.PI * 0.8 * t + 1.3) * 0.35; // slow stereo drift
    const [gl, gr] = panLR(side);
    b.l[i] = s * 0.4 * gl * 1.35 + air * gl;
    b.r[i] = s * 0.4 * gr * 1.35 + air * gr;
  }
  return b;
};

// ---------------------------------------------------------------------------

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log('Generating SFX into', OUT_DIR);

// Standard hop: a soft rise-and-fall pass, panning across the stage.
{
  const b = whoosh({
    seconds: 1.1,
    seed: 11,
    fcOf: (t) => 380 + 1050 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 220 * t,
    q: 1.05,
    peak: 0.45,
    panFrom: -0.55,
    panTo: 0.55,
  });
  normalize(b, -8);
  deClick(b);
  writeWav('whoosh_soft.wav', b);
}

// Dive (zoom_nest): the band falls into the dark — descending, close, warmer.
{
  const b = whoosh({
    seconds: 1.3,
    seed: 23,
    fcOf: (t) => 1050 - 840 * clamp01(t * 1.1),
    q: 0.85,
    peak: 0.6,
    panFrom: 0.1,
    panTo: -0.1,
    dark: 2400,
  });
  // A faint sub swell as we arrive inside.
  const sub = buf(1.3);
  let ph = 0;
  for (let i = 0; i < sub.l.length; i++) {
    const t = i / sub.l.length;
    ph += (2 * Math.PI * 62) / SR;
    const env = swell(t, 0.78) * 0.5;
    sub.l[i] = Math.sin(ph) * env;
    sub.r[i] = Math.sin(ph) * env;
  }
  mixInto(b, sub, 0, 0.9);
  normalize(b, -8.5);
  deClick(b);
  writeWav('whoosh_deep.wav', b);
}

// Rise (pull_reveal / new_chapter): opens upward with a late, bright peak.
{
  const b = whoosh({
    seconds: 1.4,
    seed: 37,
    fcOf: (t) => 240 + 2100 * clamp01(t * t * 1.15),
    q: 1.15,
    peak: 0.62,
    panFrom: -0.25,
    panTo: 0.35,
  });
  normalize(b, -9);
  deClick(b);
  writeWav('whoosh_rise.wav', b);
}

// Consequence: a faster whoosh that LANDS — noise pass into a soft thump.
{
  const b = whoosh({
    seconds: 1.0,
    seed: 41,
    fcOf: (t) => 460 + 1500 * Math.sin(Math.PI * Math.min(1, t / 0.68)),
    q: 1.0,
    peak: 0.4,
    panFrom: -0.5,
    panTo: 0.3,
  });
  mixInto(b, impact({ seconds: 0.42, seed: 5, sub0: 150, sub1: 52, tau: 0.11, burst: 0.02 }), 0.6, 0.85);
  normalize(b, -8);
  deClick(b);
  writeWav('whoosh_impact.wav', b);
}

// Bullet pops — three siblings at different pitches so runs don't machine-gun.
writeWav('pop_a.wav', (() => { const b = sinePop({ seconds: 0.3, f0: 1040, f1: 540, tau: 0.062, seed: 7 }); normalize(b, -7); deClick(b, 3); return b; })());
writeWav('pop_b.wav', (() => { const b = sinePop({ seconds: 0.3, f0: 880, f1: 460, tau: 0.066, seed: 8 }); normalize(b, -7); deClick(b, 3); return b; })());
writeWav('pop_c.wav', (() => { const b = sinePop({ seconds: 0.3, f0: 760, f1: 390, tau: 0.07, seed: 9 }); normalize(b, -7); deClick(b, 3); return b; })());

// Punchline stamp: a real hit — sub drop + burst, short ring.
{
  const b = impact({ seconds: 0.7, seed: 3, sub0: 165, sub1: 46, tau: 0.16, burst: 0.028 });
  mixInto(b, sinePop({ seconds: 0.25, f0: 620, f1: 300, tau: 0.05, seed: 4, harmonic: 0.1 }), 0.004, 0.28);
  normalize(b, -5.5);
  deClick(b, 3);
  writeWav('stamp.wav', b);
}

// Glass shimmer: punchline plates + the cold open.
{
  const b = shimmer({ seconds: 1.0, seed: 13 });
  normalize(b, -12);
  deClick(b);
  writeWav('shimmer.wav', b);
}

// Tiny tick for checklist marks / chips.
{
  const b = sinePop({ seconds: 0.14, f0: 1900, f1: 1500, tau: 0.02, seed: 21, harmonic: 0.08 });
  normalize(b, -10);
  deClick(b, 2);
  writeWav('tick.wav', b);
}

console.log('Done.');
