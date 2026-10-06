import React, { createContext, useContext, useMemo } from 'react';
import { Img, spring, useVideoConfig } from 'remotion';
import { NarrationWord } from '../types';
import { useTheme, inkOn, DISPLAY_FONT, BODY_FONT, MONO_FONT } from '../theme';
import { useSceneClock, useSceneWindow } from '../canvas/SceneClock';
import { spokenAt } from '../motion/narrationBeats';
import { fitText } from '../typography';
import {
  clamp01,
  easeInOutQuint,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
  easeOutExpo,
  easeOutQuint,
} from '../motion/easing';

/**
 * hero-kit — the ONLY library a hero scene gets besides the remotion subset.
 *
 * Everything a model-written scene needs to look like it belongs to THIS video
 * and to move with THIS narration: the video's palette and fonts, the scene's
 * own clock, word cues off the real narration timings, and a handful of
 * motion-design primitives that are fiddly to get right from scratch (fitted
 * type, path draw-on, rolling counters, deterministic noise).
 *
 * The documented surface is the contract the prompt teaches (Laravel
 * Resources/hero_skill.md) — keep the two in step.
 */

export interface HeroEnv {
  words: NarrationWord[];
  /** Named pictures this scene may show (the scene's illustration…). */
  assets: Record<string, string>;
  /** Karaoke captions burn into the bottom of a portrait frame. */
  captions: boolean;
}

const HeroEnvContext = createContext<HeroEnv>({ words: [], assets: {}, captions: false });

export const HeroEnvProvider: React.FC<{ env: HeroEnv; children: React.ReactNode }> = ({ env, children }) => (
  <HeroEnvContext.Provider value={env}>{children}</HeroEnvContext.Provider>
);

/** Scene-local frame: 0 = the scene's first frame, in every composition mode. */
export const useHeroFrame = (): number => useSceneClock().frame;

/** The video config with the SCENE's length as durationInFrames. */
export const useHeroConfig = () => {
  const config = useVideoConfig();
  const { durationInFrames } = useSceneClock();
  return { ...config, durationInFrames };
};

/** Narration starts this many frames after the scene's frame 0 (canvas flights start the voice early). */
const useNarrationOffset = (): number => {
  const win = useSceneWindow();
  if (!win || win.narrationStart === undefined) return 0;
  return win.narrationStart - win.start;
};

export interface HeroInfo {
  frame: number;
  fps: number;
  duration: number;
  width: number;
  height: number;
  /** Scene progress 0..1. */
  t: number;
  /** Scale unit: min(width, height) / 1080 — size everything in multiples of it. */
  u: number;
  portrait: boolean;
  theme: { bg: string; panel: string; text: string; muted: string; accent: string; accent2: string; onAccent: string };
  font: { display: string; body: string; mono: string };
  /** Keep important content inside these insets (px). The bottom grows when captions are burned in. */
  safe: { top: number; right: number; bottom: number; left: number };
  /** Narration words with frame timings (scene-local). */
  words: Array<{ word: string; start: number; end: number }>;
  /** Frame the narrator says `phrase` (its first word), else `fallback` × duration. */
  cue: (phrase: string, fallback?: number) => number;
}

export const useHero = (): HeroInfo => {
  const frame = useHeroFrame();
  const { fps, width, height, durationInFrames } = useHeroConfig();
  const theme = useTheme();
  const env = useContext(HeroEnvContext);
  const offset = useNarrationOffset();

  return useMemo(() => {
    const u = Math.min(width, height) / 1080;
    const portrait = height > width;
    const words = env.words.map((w) => ({
      word: w.word,
      start: Math.round(w.start * fps) + offset,
      end: Math.round(w.end * fps) + offset,
    }));
    const cue = (phrase: string, fallback = 0.5): number => {
      const at = spokenAt(env.words, phrase, fps);
      return at !== null ? at + offset : Math.round(clamp01(fallback) * durationInFrames);
    };
    const pad = Math.round(64 * u);
    return {
      frame,
      fps,
      duration: durationInFrames,
      width,
      height,
      t: clamp01(frame / Math.max(1, durationInFrames - 1)),
      u,
      portrait,
      theme: {
        bg: theme.bg_from,
        panel: theme.panel,
        text: theme.text,
        muted: theme.muted,
        accent: theme.accent,
        accent2: theme.accent2,
        onAccent: inkOn(theme.accent),
      },
      font: { display: DISPLAY_FONT, body: BODY_FONT, mono: MONO_FONT },
      safe: {
        top: pad,
        right: pad,
        bottom: env.captions && portrait ? Math.round(height * 0.2) : pad,
        left: pad,
      },
      words,
      cue,
    };
    // `frame` changes every render; the rest is stable per scene.
  }, [frame, fps, width, height, durationInFrames, theme, env, offset]);
};

/** Hook form of `useHero().cue`. */
export const useCue = (phrase: string, fallback = 0.5): number => useHero().cue(phrase, fallback);

/**
 * `cue()` imported on its own — what models reach for first. It only READS
 * contexts (no hook state), so calling it anywhere during the scene's render
 * — in a loop, in a branch, in a .map — is safe.
 */
export const cue = (phrase: string, fallback = 0.5): number => useHero().cue(phrase, fallback);

/** 0..1 as `frame` runs from `start` over `duration` frames, eased. */
export const progress = (
  frame: number,
  start: number,
  duration: number,
  easing: (t: number) => number = easeOutCubic
): number => easing(clamp01((frame - start) / Math.max(1, duration)));

/** A spring 0→1 (with natural overshoot) starting at `start`. */
export const pop = (
  frame: number,
  start: number,
  fps: number,
  config: { damping?: number; stiffness?: number; mass?: number } = {}
): number =>
  spring({
    frame: frame - start,
    fps,
    config: { damping: config.damping ?? 14, stiffness: config.stiffness ?? 120, mass: config.mass ?? 0.9 },
  });

/** Start frame of item `i` in a staggered sequence. */
export const stagger = (i: number, start: number, step: number): number => start + i * step;

/** Linear mix. */
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export const ease = {
  out: easeOutCubic,
  outQuint: easeOutQuint,
  outExpo: easeOutExpo,
  inOut: easeInOutSine,
  inOutQuint: easeInOutQuint,
  back: easeOutBack(1.6),
};

// ---- deterministic value noise (organic drift without Math.random) --------

const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth noise in [-1, 1] along one axis. */
export const noise1 = (x: number, seed = 0): number => {
  const i = Math.floor(x);
  const f = x - i;
  return (hash(i + seed * 57.3) * (1 - smooth(f)) + hash(i + 1 + seed * 57.3) * smooth(f)) * 2 - 1;
};

/** Smooth noise in [-1, 1] over a plane. */
export const noise2 = (x: number, y: number, seed = 0): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const h = (a: number, b: number) => hash(a * 12.9898 + b * 78.233 + seed * 3.17);
  const top = h(xi, yi) * (1 - xf) + h(xi + 1, yi) * xf;
  const bottom = h(xi, yi + 1) * (1 - xf) + h(xi + 1, yi + 1) * xf;
  return (top * (1 - yf) + bottom * yf) * 2 - 1;
};

// ---- components -------------------------------------------------------------

/**
 * Text set at the largest size that fits `width` in `maxLines` lines (measured
 * against the real loaded face, so it never overflows whatever font this
 * video drew).
 */
export const FitText: React.FC<{
  text: string;
  width: number;
  maxSize: number;
  minSize?: number;
  maxLines?: number;
  font?: 'display' | 'body' | 'mono';
  weight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  style?: React.CSSProperties;
}> = ({ text, width, maxSize, minSize, maxLines = 2, font = 'display', weight = 700, color, align = 'left', lineHeight = 1.08, letterSpacing, style }) => {
  const family = font === 'mono' ? MONO_FONT : font === 'body' ? BODY_FONT : DISPLAY_FONT;
  const size = fitText(String(text ?? ''), {
    width,
    max: maxSize,
    min: minSize ?? Math.round(maxSize * 0.45),
    maxLines,
    font: family,
    weight,
    kinetic: false,
  });
  return (
    <div
      style={{
        width,
        fontFamily: family,
        fontWeight: weight,
        fontSize: size,
        lineHeight,
        letterSpacing,
        color,
        textAlign: align,
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/** An SVG path that draws itself on as `progress` goes 0 → 1. Put it inside an <svg>. */
export const DrawPath: React.FC<
  { d: string; progress: number } & Omit<React.SVGProps<SVGPathElement>, 'd' | 'pathLength' | 'ref'>
> = ({ d, progress: p, ...rest }) =>
  // At 0 a round cap still paints a dot where the line will start — draw nothing.
  clamp01(p) <= 0.001 ? null : (
    <path
      d={d}
      fill="none"
      strokeLinecap="round"
      {...rest}
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={1 - clamp01(p)}
    />
  );

/** A number that rolls from `from` to `to` over `duration` frames starting at `start`. */
export const Counter: React.FC<{
  to: number;
  from?: number;
  start?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: React.CSSProperties;
}> = ({ to, from = 0, start = 0, duration = 30, decimals = 0, prefix = '', suffix = '', style }) => {
  const frame = useHeroFrame();
  const v = from + (to - from) * easeOutExpo(clamp01((frame - start) / Math.max(1, duration)));
  const text = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{prefix}{text}{suffix}</span>;
};

/** A picture this scene was given (by name). Renders nothing for an unknown name. */
export const Asset: React.FC<{ name: string; style?: React.CSSProperties }> = ({ name, style }) => {
  const env = useContext(HeroEnvContext);
  const src = env.assets[name];
  if (!src) return null;
  return <Img src={src} style={{ objectFit: 'contain', ...style }} />;
};
